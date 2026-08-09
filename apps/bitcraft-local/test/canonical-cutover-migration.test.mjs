import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

const CLAIM_ID = "1369094286777412590";
const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/repair-relay-canonical-cutover.mjs", import.meta.url));

const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const WEBP_BYTES = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
const PASSWORD_HASH = `scrypt:${"a".repeat(32)}:${"b".repeat(128)}`;

const SOURCE_SETTINGS = Object.freeze({
  claim_id: CLAIM_ID,
  bitcraft_sync_url: "https://old.invalid/api",
  theme_json: JSON.stringify({ accent: "#123456" }),
  refresh_seconds: "33",
  server_refresh_seconds: "44",
  default_page: "members",
  default_region: "777",
  active_region_overrides: "777 888",
  excluded_member_ids_json: JSON.stringify(["901", "902"]),
  visitor_security_json: JSON.stringify({ fullIpRetentionDays: 3, geoipLicenseKey: "private-license" }),
  toast_json: JSON.stringify({ marketSales: false }),
  market_deal_watch_json: JSON.stringify({ maxWatchesPerUser: 7 }),
  discord_json: JSON.stringify({ guildId: "123", channelId: "456" }),
  branding_json: JSON.stringify({
    logo: {
      fileName: "logo.png",
      contentType: "image/png",
      updatedAt: "2026-08-01T00:00:00.000Z",
      url: "/api/local/branding/logo",
    },
  }),
  app_popups_json: JSON.stringify({ popups: [{ id: "notice" }] }),
  access_control_json: JSON.stringify({ accounts: { "111": { pages: ["members"] } } }),
});

const EXPLICIT_PROTECTED_TABLES = Object.freeze([
  "market_events",
  "market_trades",
  "activity_events",
  "settlement_state_current",
  "domain_payload_current",
  "provider_source_health",
  "provider_subscription_health",
  "provider_transition_outbox",
  "production_jobs",
  "production_contributions",
  "production_contribution_events",
  "craft_plan_progress_audit_snapshots",
  "craft_plan_progress_audit_events",
  "craft_plan_progress_audit_state",
  "market_deal_alerts",
  "admin_login_events",
  "analytics_events",
  "visitor_security_events",
  "geoip_ranges",
  "visitor_geoip_cache",
  "discord_delivery_log",
  "discord_notification_outbox",
]);

const APPROVED_TABLES = new Set([
  "user_accounts", "user_sessions", "user_legal_acceptances", "admin_users", "admin_sessions",
  "app_settings", "app_secrets", "craft_plan_settings", "market_deal_watches", "scheduled_jobs",
  "admin_audit_log", "discord_youtube_channels", "discord_youtube_videos", "discord_craft_watches",
  "discord_mod_cases", "discord_warnings", "discord_mod_notes", "discord_custom_commands",
  "discord_component_votes", "discord_component_messages", "discord_temp_bans",
  "discord_craft_plan_report_occurrences",
]);

function addMigratedColumns(db) {
  for (const [column, definition] of [
    ["active", "INTEGER NOT NULL DEFAULT 1"],
    ["last_login_at", "TEXT"],
    ["discord_id", "TEXT"],
    ["discord_username", "TEXT"],
    ["discord_global_name", "TEXT"],
    ["discord_avatar", "TEXT"],
  ]) {
    if (!db.prepare("PRAGMA table_info(admin_users)").all().some((entry) => entry.name === column)) {
      db.exec(`ALTER TABLE admin_users ADD COLUMN ${column} ${definition}`);
    }
  }
}

function finishDatabase(db) {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
}

function insertSetting(db, key, value, updatedAt = "2026-08-01T00:00:00.000Z") {
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(key, value, updatedAt);
}

function createFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "canonical-cutover-"));
  const sourceDatabasePath = path.join(directory, "old.sqlite");
  const targetDatabasePath = path.join(directory, "relay.sqlite");
  const sourceBrandingDirectory = path.join(directory, "old-branding");
  const targetBrandingDirectory = path.join(directory, "relay-branding");
  mkdirSync(sourceBrandingDirectory);
  mkdirSync(targetBrandingDirectory);

  const source = new DatabaseSync(sourceDatabasePath);
  const target = new DatabaseSync(targetDatabasePath);
  applySchemaBootstrap(source);
  applySchemaBootstrap(target);
  addMigratedColumns(source);
  addMigratedColumns(target);

  for (const [key, value] of Object.entries(SOURCE_SETTINGS)) insertSetting(source, key, value);
  insertSetting(source, "source_only_setting", "must-not-migrate");
  insertSetting(target, "claim_id", CLAIM_ID);
  insertSetting(target, "branding_json", JSON.stringify({
    favicon: {
      fileName: "favicon.webp",
      contentType: "image/webp",
      updatedAt: "2026-07-01T00:00:00.000Z",
      url: "/api/local/branding/favicon",
    },
  }));
  insertSetting(target, "target_only_setting", "keep-me");
  insertSetting(target, "cutover_marker_owned_by_task_4", "keep-marker");

  source.prepare(`
    INSERT INTO user_accounts (
      id, discord_id, discord_username, discord_global_name, discord_avatar,
      character_player_id, character_name, character_status, settings_json,
      created_at, last_login_at, inactivity_warning_sent_at
    ) VALUES (10, '111', 'old-user', 'Old User', 'old-avatar', '901', 'Old Character',
      'approved', '{"dense":true}', '2025-01-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
  `).run();
  source.prepare(`
    INSERT INTO user_accounts (
      id, discord_id, discord_username, discord_global_name, discord_avatar,
      character_player_id, character_name, character_status, settings_json,
      created_at, last_login_at, inactivity_warning_sent_at
    ) VALUES (20, '222', 'new-old-user', 'New Old User', 'avatar-222', '902',
      'Second Character', 'pending', '{"compact":true}', '2025-02-01T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z', NULL)
  `).run();
  target.prepare(`
    INSERT INTO user_accounts (
      id, discord_id, discord_username, discord_global_name, discord_avatar,
      character_player_id, character_name, character_status, settings_json,
      created_at, last_login_at, inactivity_warning_sent_at
    ) VALUES (1, '111', 'relay-user', 'Relay User', 'relay-avatar', NULL, NULL,
      'unlinked', '{}', '2026-01-01T00:00:00.000Z', NULL, NULL)
  `).run();
  target.prepare(`
    INSERT INTO user_accounts (
      id, discord_id, discord_username, discord_global_name, discord_avatar,
      character_player_id, character_name, character_status, settings_json,
      created_at, last_login_at, inactivity_warning_sent_at
    ) VALUES (2, '999', 'relay-only', 'Relay Only', NULL, NULL, NULL,
      'unlinked', '{"relay":true}', '2026-02-01T00:00:00.000Z', NULL, NULL)
  `).run();

  source.prepare(`
    INSERT INTO user_legal_acceptances
      (id, user_id, legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source)
    VALUES
      (100, 10, 'v1', 'terms-1', 'privacy-1', 1, '2026-01-01T00:00:00.000Z', 'oauth'),
      (101, 20, 'v2', 'terms-2', 'privacy-2', 1, '2026-02-01T00:00:00.000Z', 'existing-session')
  `).run();
  target.prepare(`
    INSERT INTO user_legal_acceptances
      (id, user_id, legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source)
    VALUES
      (1, 1, 'v1', 'terms-1', 'privacy-1', 1, '2026-01-01T00:00:00.000Z', 'oauth'),
      (2, 2, 'relay-v1', 'relay-terms', 'relay-privacy', 1, '2026-03-01T00:00:00.000Z', 'oauth')
  `).run();
  source.prepare("INSERT INTO user_sessions VALUES ('source-session', 10, '2099-01-01', '2026-01-01', NULL)").run();
  target.prepare("INSERT INTO user_sessions VALUES ('target-session', 1, '2099-01-01', '2026-01-01', NULL)").run();

  source.prepare(`
    INSERT INTO admin_users
      (id, username, password_hash, role, created_at, active, last_login_at, discord_id,
       discord_username, discord_global_name, discord_avatar)
    VALUES
      (10, 'owner', ?, 'owner', '2025-01-01', 1, '2026-08-01', '111', 'old-owner', 'Old Owner', 'old-admin-avatar'),
      (20, 'old-moderator', ?, 'moderator', '2025-02-01', 0, NULL, '222', 'old-mod', 'Old Mod', NULL)
  `).run(PASSWORD_HASH, PASSWORD_HASH);
  target.prepare(`
    INSERT INTO admin_users
      (id, username, password_hash, role, created_at, active, last_login_at, discord_id,
       discord_username, discord_global_name, discord_avatar)
    VALUES
      (2, 'owner', ?, 'viewer', '2026-01-01', 1, NULL, '111', 'relay-owner', 'Relay Owner', NULL),
      (3, 'relay-admin', ?, 'owner', '2026-02-01', 1, NULL, '999', 'relay-admin', 'Relay Admin', NULL)
  `).run(PASSWORD_HASH.replaceAll("b", "c"), PASSWORD_HASH.replaceAll("b", "d"));
  source.prepare("INSERT INTO admin_sessions VALUES ('source-admin-session', 10, '2099-01-01', '2026-01-01')").run();
  target.prepare("INSERT INTO admin_sessions VALUES ('target-admin-session', 3, '2099-01-01', '2026-01-01')").run();

  source.prepare("INSERT INTO craft_plan_settings VALUES ('active', '{\"source\":true}', '2025-01-01', '2026-08-01')").run();
  source.prepare("INSERT INTO craft_plan_settings VALUES ('old-extra', '{\"old\":true}', '2025-02-01', '2026-08-02')").run();
  target.prepare("INSERT INTO craft_plan_settings VALUES ('active', '{\"target\":true}', '2026-01-01', '2026-07-01')").run();
  target.prepare("INSERT INTO craft_plan_settings VALUES ('relay-only', '{\"relay\":true}', '2026-02-01', '2026-07-02')").run();

  source.prepare(`
    INSERT INTO market_deal_watches
      (id, user_id, discord_id, claim_id, region_id, item_id, item_type, item_name,
       threshold_percent, enabled, last_checked_at, last_alert_at, created_at, updated_at)
    VALUES
      (10, 10, '111', ?, '777', '42', '0', 'Old Item', 21, 1, 'source-check', 'source-alert', '2025-01-01', '2026-08-01'),
      (11, 20, '222', ?, '888', '42', '1', 'Old Cargo', 22, 1, NULL, NULL, '2025-02-01', '2026-08-02')
  `).run(CLAIM_ID, CLAIM_ID);
  target.prepare(`
    INSERT INTO market_deal_watches
      (id, user_id, discord_id, claim_id, region_id, item_id, item_type, item_name,
       threshold_percent, enabled, last_checked_at, last_alert_at, created_at, updated_at)
    VALUES
      (7, 1, '111', ?, '777', '42', '0', 'Relay Item', 99, 0, 'relay-check', 'relay-alert', '2026-01-01', '2026-07-01'),
      (9, 2, '999', ?, '999', '99', '0', 'Relay Only Item', 30, 1, NULL, NULL, '2026-02-01', '2026-07-02')
  `).run(CLAIM_ID, CLAIM_ID);
  target.prepare(`
    INSERT INTO market_deal_alerts
      (id, watch_id, user_id, discord_id, claim_id, region_id, item_id, item_type,
       item_name, listing_key, baseline_window_days, baseline_average, discount_percent,
       dm_status, created_at, raw_json)
    VALUES (50, 7, 1, '111', ?, '777', '42', '0', 'Relay Item', 'listing-1',
      7, '100', 40, 'sent', '2026-07-01', '{}')
  `).run(CLAIM_ID);

  source.prepare(`
    INSERT INTO scheduled_jobs
      (job_key, label, description, schedule, enabled, last_run_at, last_success_at,
       last_error, next_run_at, running, metadata_json, updated_at)
    VALUES
      ('shared-job', 'Old Label', 'Old Description', '*/9 * * * *', 0, 'old-run',
       'old-success', 'old-error', 'old-next', 1, '{"source":true}', '2026-08-01'),
      ('retired-source-job', 'Retired', 'Retired', '* * * * *', 1, NULL, NULL, NULL,
       NULL, 0, '{}', '2026-08-01')
  `).run();
  target.prepare(`
    INSERT INTO scheduled_jobs
      (job_key, label, description, schedule, enabled, last_run_at, last_success_at,
       last_error, next_run_at, running, metadata_json, updated_at)
    VALUES
      ('shared-job', 'Relay Label', 'Relay Description', '*/5 * * * *', 1, 'relay-run',
       'relay-success', 'relay-error', 'relay-next', 1, '{"target":true}', '2026-07-01'),
      ('relay-only-job', 'Relay Only', 'Keep all', '*/3 * * * *', 1, 'keep-run',
       'keep-success', NULL, 'keep-next', 0, '{"keep":true}', '2026-07-02')
  `).run();

  seedDiscordPreviewState(source, "source");
  seedDiscordPreviewState(target, "target");

  target.prepare("INSERT INTO admin_audit_log VALUES (1, 3, 'relay-admin', 'relay.action', '{}', '2026-01-01')").run();
  target.prepare("INSERT INTO admin_audit_log VALUES (2, 2, 'owner', 'old.action', '{\"safe\":true}', '2025-01-01')").run();
  source.prepare("INSERT INTO admin_audit_log VALUES (10, 10, 'owner', 'old.action', '{\"safe\":true}', '2025-01-01')").run();
  source.prepare("INSERT INTO admin_audit_log VALUES (11, 999, 'removed', 'old.orphan', '{}', '2025-01-02')").run();
  source.prepare("INSERT INTO admin_audit_log VALUES (12, 999, 'removed', 'old.orphan', '{}', '2025-01-02')").run();

  seedProtectedState(target);

  source.prepare("INSERT INTO app_secrets (key, value, updated_at) VALUES ('discord_bot_token', ?, ?)")
    .run("super-secret-token", "2026-08-01T00:00:00.000Z");
  source.prepare("INSERT INTO app_secrets (key, value, updated_at) VALUES ('oauth_state_secret', ?, ?)")
    .run("must-never-migrate", "2026-08-01T00:00:00.000Z");
  target.prepare("INSERT INTO app_secrets (key, value, updated_at) VALUES ('oauth_state_secret', ?, ?)")
    .run("keep-target-oauth", "2026-07-01T00:00:00.000Z");
  target.prepare("INSERT INTO app_secrets (key, value, updated_at) VALUES ('privacy_ledger_key', ?, ?)")
    .run("keep-target-privacy", "2026-07-01T00:00:00.000Z");

  writeFileSync(path.join(sourceBrandingDirectory, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(sourceBrandingDirectory, "ignored.txt"), "ignore me");
  writeFileSync(path.join(targetBrandingDirectory, "favicon.webp"), WEBP_BYTES);

  finishDatabase(source);
  finishDatabase(target);
  return {
    directory,
    sourceDatabasePath,
    targetDatabasePath,
    sourceBrandingDirectory,
    targetBrandingDirectory,
  };
}

function seedDiscordPreviewState(db, prefix) {
  const digit = prefix === "source" ? "1" : "9";
  db.prepare("INSERT INTO discord_youtube_channels (channel_id, input, discord_channel_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(`${prefix}-youtube`, `${prefix}-input`, `${digit}01`, `${prefix}-created`, `${prefix}-updated`);
  db.prepare("INSERT INTO discord_youtube_videos (video_id, channel_id, title, url, seen_at) VALUES (?, ?, ?, ?, ?)")
    .run(`${prefix}-video`, `${prefix}-youtube`, `${prefix}-title`, `https://${prefix}.invalid`, `${prefix}-seen`);
  db.prepare("INSERT INTO discord_craft_watches (id, guild_id, user_id, profession_key, profession_name, mode, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(Number(digit), `${digit}02`, `${digit}03`, `${prefix}-profession`, `${prefix}-profession`, "single", `${prefix}-updated`);
  db.prepare("INSERT INTO discord_mod_cases (id, guild_id, case_type, user_id, moderator, details_json, occurred_at) VALUES (?, ?, 'note', ?, ?, '{}', ?)")
    .run(Number(digit), `${digit}04`, `${digit}05`, `${prefix}-moderator`, `${prefix}-occurred`);
  db.prepare("INSERT INTO discord_warnings (id, guild_id, user_id, moderator, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(Number(digit), `${digit}06`, `${digit}07`, `${prefix}-moderator`, `${prefix}-reason`, `${prefix}-created`);
  db.prepare("INSERT INTO discord_mod_notes (id, guild_id, user_id, moderator, note, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(Number(digit), `${digit}08`, `${digit}09`, `${prefix}-moderator`, `${prefix}-note`, `${prefix}-created`);
  db.prepare("INSERT INTO discord_custom_commands VALUES (?, ?, ?, ?)")
    .run(`${prefix}-command`, `${prefix}-description`, `${prefix}-response`, `${prefix}-updated`);
  db.prepare("INSERT INTO discord_component_votes VALUES (?, ?, ?, ?, ?)")
    .run(`${digit}10`, `${prefix}-component`, `${digit}11`, "up", `${prefix}-updated`);
  db.prepare("INSERT INTO discord_component_messages VALUES (?, ?, ?, ?)")
    .run(`${digit}12`, "poll", JSON.stringify({ prefix }), `${prefix}-updated`);
  db.prepare("INSERT INTO discord_temp_bans VALUES (?, ?, ?, ?, ?)")
    .run(`${digit}13`, `${digit}14`, `${prefix}-unban`, `${prefix}-reason`, `${prefix}-created`);
  db.prepare("INSERT INTO discord_craft_plan_report_occurrences VALUES (?, ?, ?, 'sent', ?, NULL, ?, ?)")
    .run(`${prefix}-rule`, `${prefix}-occurrence`, `${prefix}-scheduled`, `${digit}15`, `${prefix}-created`, `${prefix}-updated`);
}

function seedProtectedState(db) {
  db.prepare("INSERT INTO settlement_state_current (claim_id, captured_at, updated_at) VALUES (?, 'relay-captured', 'relay-updated')").run(CLAIM_ID);
  db.prepare("INSERT INTO market_events (id, claim_id, event_type, listing_key, item_name, occurred_at, raw_json) VALUES (1, ?, 'sale', 'relay-listing', 'Relay Item', 'relay-time', '{}')").run(CLAIM_ID);
  db.prepare("INSERT INTO market_trades (trade_id, claim_id, item_name, quantity, unit_price, total_price, occurred_at, imported_at, raw_json) VALUES ('relay-trade', ?, 'Relay Item', '1', '2', '2', 'relay-time', 'relay-import', '{}')").run(CLAIM_ID);
  db.prepare("INSERT INTO activity_events (id, claim_id, event_type, summary, occurred_at, metadata_json) VALUES (1, ?, 'relay', 'Relay history', 'relay-time', '{}')").run(CLAIM_ID);
  db.prepare(`
    INSERT INTO domain_payload_current
      (claim_id, domain, data_json, collected_at, last_attempt_at, last_success_at,
       updated_at, provider, freshness, confidence, generation, warnings_json)
    VALUES (?, 'members', '{"relay":true}', 'relay-time', 'relay-time', 'relay-time',
      'relay-time', 'relay', 'fresh', 'high', 7, '[]')
  `).run(CLAIM_ID);
  db.prepare("INSERT INTO provider_source_health (provider, source_key, ready, details_json, updated_at) VALUES ('relay', 'primary', 1, '{}', 'relay-time')").run();
  db.prepare("INSERT INTO provider_subscription_health (provider, source_key, domain, connected, updated_at) VALUES ('relay', 'primary', 'members', 1, 'relay-time')").run();
  db.prepare("INSERT INTO provider_transition_outbox (transition_key, claim_id, domain, observed_at, payload_json, created_at, updated_at) VALUES ('relay-transition', ?, 'members', 'relay-time', '{}', 'relay-time', 'relay-time')").run(CLAIM_ID);
  db.prepare("INSERT INTO game_catalog_entities (catalog_key, kind, target_id, updated_at) VALUES ('item:1', 'item', '1', 'relay-time')").run();
  db.prepare("INSERT INTO production_jobs (job_key, claim_id, label, first_seen, last_seen, status, raw_json) VALUES ('relay-production', ?, 'Relay Production', 'relay-time', 'relay-time', 'active', '{}')").run(CLAIM_ID);
  db.prepare("INSERT INTO production_contributions (contribution_key, claim_id, craft_entity_id, contributor_name, first_seen, updated_at, raw_json) VALUES ('relay-contribution', ?, 'craft-1', 'Relay User', 'relay-time', 'relay-time', '{}')").run(CLAIM_ID);
  db.prepare("INSERT INTO production_contribution_events (source_key, claim_id, region_id, craft_entity_id, contributed_progress, contributed_xp, occurred_at, received_at, raw_json) VALUES ('relay-event', ?, '777', 'craft-1', '1', '2', 'relay-time', 'relay-time', '{}')").run(CLAIM_ID);
  db.prepare("INSERT INTO craft_plan_progress_audit_snapshots (id, claim_id, captured_at, baseline_revision, fingerprint, payload_gzip, app_version, build_id) VALUES (1, ?, 'relay-time', 'rev', 'fp', X'00', '0.52.0-beta.1', 'sha')").run(CLAIM_ID);
  db.prepare("INSERT INTO craft_plan_progress_audit_events (id, claim_id, captured_at, event_type, summary, payload_json) VALUES (1, ?, 'relay-time', 'relay', 'Relay audit', '{}')").run(CLAIM_ID);
  db.prepare("INSERT INTO craft_plan_progress_audit_state (claim_id, updated_at) VALUES (?, 'relay-time')").run(CLAIM_ID);
  db.prepare("INSERT INTO admin_login_events (id, username, successful, occurred_at) VALUES (1, 'relay-admin', 1, 'relay-time')").run();
  db.prepare("INSERT INTO analytics_events (id, visitor_key, session_key, event_name, page, properties_json, occurred_at) VALUES (1, 'visitor', 'session', 'view', 'dashboard', '{}', 'relay-time')").run();
  db.prepare("INSERT INTO visitor_security_events (id, occurred_at, method, route_group, status_code, status_class, ip_anonymized, ip_hash, visitor_key) VALUES (1, 'relay-time', 'GET', 'public', 200, '2xx', '127.0.0.0', 'hash', 'visitor')").run();
  db.prepare("INSERT INTO geoip_ranges VALUES (1, 2, 'GB', 'London', 'relay-time')").run();
  db.prepare("INSERT INTO visitor_geoip_cache VALUES ('ip-hash', '127.0.0.0', 'relay', 'GB', 'London', 'relay-time', 'relay-expiry', NULL)").run();
  db.prepare("INSERT INTO discord_delivery_log (id, event_type, status, metadata_json, occurred_at) VALUES (1, 'relay', 'sent', '{}', 'relay-time')").run();
  db.prepare("INSERT INTO discord_notification_outbox (id, source_key, event_type, summary, occurred_at, metadata_json, next_attempt_at, created_at, updated_at) VALUES (1, 'relay-outbox', 'relay', 'Relay pending', 'relay-time', '{}', 'relay-next', 'relay-time', 'relay-time')").run();
}

function dryRunArguments(fixture, manifestPath) {
  return [
    "--dry-run",
    "--source-db", fixture.sourceDatabasePath,
    "--target-db", fixture.targetDatabasePath,
    "--source-branding", fixture.sourceBrandingDirectory,
    "--target-branding", fixture.targetBrandingDirectory,
    "--claim-id", CLAIM_ID,
    "--manifest", manifestPath,
  ];
}

function runScript(arguments_) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...arguments_], {
    encoding: "utf8",
  });
}

function databaseRows(db, table) {
  return db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all().map((row) => ({ ...row }));
}

function mutateDatabase(databasePath, callback) {
  const db = new DatabaseSync(databasePath);
  callback(db);
  finishDatabase(db);
}

function createManifest(fixture, name = "manifest.json") {
  const manifestPath = path.join(fixture.directory, name);
  const result = runScript(dryRunArguments(fixture, manifestPath));
  assert.equal(result.status, 0, result.stderr);
  return manifestPath;
}

test("dry-run writes a deterministic redacted manifest for frozen source and target inputs", () => {
  const fixture = createFixture();
  const firstManifestPath = path.join(fixture.directory, "manifest-1.json");
  const secondManifestPath = path.join(fixture.directory, "manifest-2.json");

  const first = runScript(dryRunArguments(fixture, firstManifestPath));
  assert.equal(first.status, 0, first.stderr);
  const second = runScript(dryRunArguments(fixture, secondManifestPath));
  assert.equal(second.status, 0, second.stderr);

  const firstText = readFileSync(firstManifestPath, "utf8");
  const secondText = readFileSync(secondManifestPath, "utf8");
  assert.equal(firstText, secondText);
  assert.doesNotMatch(firstText, /super-secret-token|must-never-migrate|private-license|scrypt:|token_hash|password_hash/i);

  const manifest = JSON.parse(firstText);
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.claimId, CLAIM_ID);
  assert.match(manifest.source.database.schemaFingerprint, /^[a-f0-9]{64}$/);
  assert.match(manifest.source.database.fileSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.target.database.schemaFingerprint, /^[a-f0-9]{64}$/);
  assert.match(manifest.target.database.fileSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.privacyLedgerKeyIds, { source: null, target: null });
  assert.deepEqual(manifest.accountMappings, [
    { action: "overwrite", sourceId: 10, targetId: 1 },
    { action: "insert", sourceId: 20, targetId: 3 },
  ]);
  assert.equal(manifest.branding.source.assets.logo.contentType, "image/png");
  assert.equal(manifest.branding.source.assets.logo.fileName, "logo.png");
  assert.equal(manifest.branding.source.assets.logo.size, 8);
  assert.match(manifest.branding.source.assets.logo.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.branding.source.unexpectedFileCount, 1);
  assert.equal(manifest.secret.discordBotToken.present, true);
  assert.match(manifest.secret.discordBotToken.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(manifest.secret.canonicalPreflightRequiresEnvironmentToken, false);
  assert.match(manifest.selectionHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.tableCounts.user_accounts, {
    conflicting: 1,
    excluded: false,
    operation: "approved",
    replaced: 0,
    retained: 1,
    selected: 2,
    source: 2,
    target: 2,
  });
  for (const table of EXPLICIT_PROTECTED_TABLES) assert.equal(manifest.tableCounts[table].operation, "protected", table);
  for (const table of Object.keys(manifest.tableCounts).filter((name) => name.startsWith("game_catalog_"))) {
    assert.equal(manifest.tableCounts[table].operation, "protected", table);
  }
  for (const [table, counts] of Object.entries(manifest.tableCounts)) {
    assert.deepEqual(Object.keys(counts).sort(), ["conflicting", "excluded", "operation", "replaced", "retained", "selected", "source", "target"], table);
    assert.equal(counts.operation, APPROVED_TABLES.has(table) ? "approved" : "protected", table);
    assert.equal(counts.excluded, !APPROVED_TABLES.has(table), table);
  }
});

test("apply performs every approved merge while preserving Relay-only and explicitly excluded state", () => {
  const fixture = createFixture();
  const manifestPath = path.join(fixture.directory, "manifest.json");
  const dryRun = runScript(dryRunArguments(fixture, manifestPath));
  assert.equal(dryRun.status, 0, dryRun.stderr);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest.adminMappings, [
    { action: "overwrite", sourceId: 10, targetId: 2 },
    { action: "insert", sourceId: 20, targetId: 4 },
  ]);
  assert.deepEqual(manifest.watchMappings, [
    { action: "update", sourceId: 10, targetId: 7, targetUserId: 1 },
    { action: "insert", sourceId: 11, targetId: 10, targetUserId: 3 },
  ]);
  assert.deepEqual(manifest.conflictDecisions.adminAudit, {
    appended: 1,
    duplicates: 2,
    retainedTarget: 2,
  });

  const before = new DatabaseSync(fixture.targetDatabasePath, { readOnly: true });
  const protectedBefore = Object.fromEntries(EXPLICIT_PROTECTED_TABLES.map((table) => [table, databaseRows(before, table)]));
  before.close();

  const apply = runScript(["--apply", "--manifest", manifestPath]);
  assert.equal(apply.status, 0, apply.stderr);
  assert.doesNotMatch(`${apply.stdout}\n${apply.stderr}`, /super-secret-token|must-never-migrate|keep-target-oauth|keep-target-privacy/i);
  assert.equal(existsSync(`${manifestPath}.applied`), true);

  const source = new DatabaseSync(fixture.sourceDatabasePath, { readOnly: true });
  const target = new DatabaseSync(fixture.targetDatabasePath, { readOnly: true });
  assert.equal(target.prepare("SELECT COUNT(*) AS count FROM user_sessions").get().count, 0);
  assert.equal(target.prepare("SELECT COUNT(*) AS count FROM admin_sessions").get().count, 0);

  assert.deepEqual(target.prepare("SELECT id, discord_id, discord_username, character_player_id, character_status, settings_json FROM user_accounts ORDER BY id").all().map((row) => ({ ...row })), [
    { id: 1, discord_id: "111", discord_username: "old-user", character_player_id: "901", character_status: "approved", settings_json: '{"dense":true}' },
    { id: 2, discord_id: "999", discord_username: "relay-only", character_player_id: null, character_status: "unlinked", settings_json: '{"relay":true}' },
    { id: 3, discord_id: "222", discord_username: "new-old-user", character_player_id: "902", character_status: "pending", settings_json: '{"compact":true}' },
  ]);
  assert.deepEqual(target.prepare("SELECT user_id, legal_version FROM user_legal_acceptances ORDER BY user_id, legal_version").all().map((row) => ({ ...row })), [
    { user_id: 1, legal_version: "v1" },
    { user_id: 2, legal_version: "relay-v1" },
    { user_id: 3, legal_version: "v2" },
  ]);

  assert.deepEqual(target.prepare("SELECT id, username, role, active, discord_id FROM admin_users ORDER BY id").all().map((row) => ({ ...row })), [
    { id: 2, username: "owner", role: "owner", active: 1, discord_id: "111" },
    { id: 4, username: "old-moderator", role: "moderator", active: 0, discord_id: "222" },
  ]);
  assert.equal(target.prepare("SELECT password_hash FROM admin_users WHERE id = 2").get().password_hash, PASSWORD_HASH);

  const settings = Object.fromEntries(target.prepare("SELECT key, value FROM app_settings").all().map((row) => [row.key, row.value]));
  for (const [key, value] of Object.entries(SOURCE_SETTINGS)) assert.equal(settings[key], value, key);
  assert.equal(settings.target_only_setting, "keep-me");
  assert.equal(settings.cutover_marker_owned_by_task_4, "keep-marker");
  assert.equal(settings.source_only_setting, undefined);
  assert.equal(target.prepare("SELECT value FROM app_secrets WHERE key = 'discord_bot_token'").get().value, "super-secret-token");
  assert.equal(target.prepare("SELECT value FROM app_secrets WHERE key = 'oauth_state_secret'").get().value, "keep-target-oauth");
  assert.equal(target.prepare("SELECT value FROM app_secrets WHERE key = 'privacy_ledger_key'").get().value, "keep-target-privacy");

  assert.deepEqual(target.prepare("SELECT plan_key, config_json FROM craft_plan_settings ORDER BY plan_key").all().map((row) => ({ ...row })), [
    { plan_key: "active", config_json: '{"source":true}' },
    { plan_key: "old-extra", config_json: '{"old":true}' },
    { plan_key: "relay-only", config_json: '{"relay":true}' },
  ]);
  assert.deepEqual(target.prepare("SELECT id, user_id, discord_id, region_id, item_id, item_type, item_name, threshold_percent, enabled, last_checked_at FROM market_deal_watches ORDER BY id").all().map((row) => ({ ...row })), [
    { id: 7, user_id: 1, discord_id: "111", region_id: "777", item_id: "42", item_type: "0", item_name: "Old Item", threshold_percent: 21, enabled: 1, last_checked_at: "source-check" },
    { id: 9, user_id: 2, discord_id: "999", region_id: "999", item_id: "99", item_type: "0", item_name: "Relay Only Item", threshold_percent: 30, enabled: 1, last_checked_at: null },
    { id: 10, user_id: 3, discord_id: "222", region_id: "888", item_id: "42", item_type: "1", item_name: "Old Cargo", threshold_percent: 22, enabled: 1, last_checked_at: null },
  ]);
  assert.deepEqual(databaseRows(target, "market_deal_alerts"), protectedBefore.market_deal_alerts);

  assert.deepEqual({ ...target.prepare("SELECT * FROM scheduled_jobs WHERE job_key = 'shared-job'").get() }, {
    job_key: "shared-job",
    label: "Relay Label",
    description: "Relay Description",
    schedule: "*/9 * * * *",
    enabled: 0,
    last_run_at: null,
    last_success_at: null,
    last_error: null,
    next_run_at: null,
    running: 0,
    metadata_json: '{"source":true}',
    updated_at: "2026-08-01",
  });
  assert.equal(target.prepare("SELECT COUNT(*) AS count FROM scheduled_jobs WHERE job_key = 'retired-source-job'").get().count, 0);
  assert.equal(target.prepare("SELECT last_run_at FROM scheduled_jobs WHERE job_key = 'relay-only-job'").get().last_run_at, "keep-run");

  for (const table of [
    "discord_youtube_channels", "discord_youtube_videos", "discord_craft_watches",
    "discord_mod_cases", "discord_warnings", "discord_mod_notes", "discord_custom_commands",
    "discord_component_votes", "discord_component_messages", "discord_temp_bans",
    "discord_craft_plan_report_occurrences",
  ]) {
    assert.deepEqual(databaseRows(target, table), databaseRows(source, table), table);
  }

  assert.deepEqual(target.prepare("SELECT id, user_id, username, action FROM admin_audit_log ORDER BY id").all().map((row) => ({ ...row })), [
    { id: 1, user_id: 3, username: "relay-admin", action: "relay.action" },
    { id: 2, user_id: 2, username: "owner", action: "old.action" },
    { id: 3, user_id: null, username: "removed", action: "old.orphan" },
  ]);
  for (const table of EXPLICIT_PROTECTED_TABLES) assert.deepEqual(databaseRows(target, table), protectedBefore[table], table);
  assert.equal(target.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(target.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  source.close();
  target.close();

  assert.deepEqual(readFileSync(path.join(fixture.targetBrandingDirectory, "logo.png")), PNG_BYTES);
  assert.equal(existsSync(path.join(fixture.targetBrandingDirectory, "favicon.webp")), false);
});

test("apply refuses a changed database, tampered manifest, and an already-applied marker", () => {
  const driftFixture = createFixture();
  const driftManifestPath = createManifest(driftFixture);
  mutateDatabase(driftFixture.sourceDatabasePath, (db) => {
    db.prepare("UPDATE craft_plan_settings SET config_json = '{\"drifted\":true}' WHERE plan_key = 'active'").run();
  });
  const drift = runScript(["--apply", "--manifest", driftManifestPath]);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /changed since dry-run/i);
  const driftTarget = new DatabaseSync(driftFixture.targetDatabasePath, { readOnly: true });
  assert.equal(driftTarget.prepare("SELECT COUNT(*) AS count FROM user_sessions").get().count, 1);
  driftTarget.close();

  const tamperFixture = createFixture();
  const tamperManifestPath = createManifest(tamperFixture);
  const tampered = JSON.parse(readFileSync(tamperManifestPath, "utf8"));
  tampered.tableCounts.user_accounts.selected = 999;
  writeFileSync(tamperManifestPath, `${JSON.stringify(tampered, null, 2)}\n`);
  const tamper = runScript(["--apply", "--manifest", tamperManifestPath]);
  assert.notEqual(tamper.status, 0);
  assert.match(tamper.stderr, /selection hash is invalid/i);

  const appliedFixture = createFixture();
  const appliedManifestPath = createManifest(appliedFixture);
  const firstApply = runScript(["--apply", "--manifest", appliedManifestPath]);
  assert.equal(firstApply.status, 0, firstApply.stderr);
  const secondApply = runScript(["--apply", "--manifest", appliedManifestPath]);
  assert.notEqual(secondApply.status, 0);
  assert.match(secondApply.stderr, /already applied/i);
});

test("dry-run rejects unsupported schemas, duplicate or invalid Discord IDs, and malformed selected JSON", () => {
  const cases = [
    {
      expected: /unsupported.*discord_mod_notes/i,
      mutate(db) { db.exec("DROP TABLE discord_mod_notes"); },
      name: "unsupported-source-schema",
    },
    {
      expected: /duplicate Discord IDs/i,
      mutate(db) { db.prepare("UPDATE admin_users SET discord_id = '111' WHERE id = 20").run(); },
      name: "duplicate-admin-discord-id",
    },
    {
      expected: /exact decimal ID/i,
      mutate(db) { db.prepare("UPDATE user_accounts SET discord_id = 'not-a-discord-id' WHERE id = 20").run(); },
      name: "invalid-user-discord-id",
    },
    {
      expected: /valid JSON/i,
      mutate(db) { db.prepare("UPDATE craft_plan_settings SET config_json = '{broken' WHERE plan_key = 'active'").run(); },
      name: "malformed-json",
    },
    {
      expected: /cannot be mapped to its account/i,
      mutate(db) { db.prepare("UPDATE market_deal_watches SET user_id = 404 WHERE id = 10").run(); },
      name: "unmappable-watch-account",
    },
  ];
  for (const entry of cases) {
    const fixture = createFixture();
    mutateDatabase(fixture.sourceDatabasePath, entry.mutate);
    const result = runScript(dryRunArguments(fixture, path.join(fixture.directory, `${entry.name}.json`)));
    assert.notEqual(result.status, 0, entry.name);
    assert.match(result.stderr, entry.expected, entry.name);
  }
});

test("dry-run and apply enforce the exact claim and guarded filesystem roots", () => {
  const wrongArgument = createFixture();
  const wrongArgs = dryRunArguments(wrongArgument, path.join(wrongArgument.directory, "wrong-claim.json"));
  wrongArgs[wrongArgs.indexOf(CLAIM_ID)] = "123";
  const wrongClaim = runScript(wrongArgs);
  assert.notEqual(wrongClaim.status, 0);
  assert.match(wrongClaim.stderr, new RegExp(`exactly ${CLAIM_ID}`));

  const foreignWatch = createFixture();
  mutateDatabase(foreignWatch.sourceDatabasePath, (db) => {
    db.prepare("UPDATE market_deal_watches SET claim_id = '123' WHERE id = 10").run();
  });
  const foreign = runScript(dryRunArguments(foreignWatch, path.join(foreignWatch.directory, "foreign-watch.json")));
  assert.notEqual(foreign.status, 0);
  assert.match(foreign.stderr, /outside the canonical claim/i);

  const mismatchedSetting = createFixture();
  mutateDatabase(mismatchedSetting.targetDatabasePath, (db) => {
    db.prepare("UPDATE app_settings SET value = '123' WHERE key = 'claim_id'").run();
  });
  const mismatch = runScript(dryRunArguments(mismatchedSetting, path.join(mismatchedSetting.directory, "mismatch.json")));
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /claim settings must match/i);

  const escapedBranding = createFixture();
  mutateDatabase(escapedBranding.sourceDatabasePath, (db) => {
    db.prepare("UPDATE app_settings SET value = ? WHERE key = 'branding_json'").run(JSON.stringify({
      logo: { fileName: "../logo.png", contentType: "image/png" },
    }));
  });
  const escaped = runScript(dryRunArguments(escapedBranding, path.join(escapedBranding.directory, "escaped-branding.json")));
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stderr, /filename is unsupported|escapes its supplied root/i);

  const linkedBranding = createFixture();
  const linkedPath = path.join(linkedBranding.directory, "linked-old-branding");
  symlinkSync(linkedBranding.sourceBrandingDirectory, linkedPath, "junction");
  const linkedArgs = dryRunArguments({ ...linkedBranding, sourceBrandingDirectory: linkedPath }, path.join(linkedBranding.directory, "linked.json"));
  const linked = runScript(linkedArgs);
  assert.notEqual(linked.status, 0);
  assert.match(linked.stderr, /symlink/i);
});

test("dry-run refuses a database with uncheckpointed WAL content", () => {
  const fixture = createFixture();
  const writer = new DatabaseSync(fixture.targetDatabasePath);
  writer.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('wal-only', 'drift', '2026-08-09')").run();
  const result = runScript(dryRunArguments(fixture, path.join(fixture.directory, "wal.json")));
  writer.close();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checkpoint|WAL/i);
});

test("dry-run rejects malformed Discord IDs inside durable Discord state", () => {
  const fixture = createFixture();
  mutateDatabase(fixture.sourceDatabasePath, (db) => {
    db.prepare("UPDATE discord_temp_bans SET guild_id = 'not-a-discord-id'").run();
  });
  const result = runScript(dryRunArguments(fixture, path.join(fixture.directory, "invalid-discord-state.json")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exact decimal ID/i);
});

test("manifest records a missing source bot token without exposing or importing another secret", () => {
  const fixture = createFixture();
  mutateDatabase(fixture.sourceDatabasePath, (db) => {
    db.prepare("DELETE FROM app_secrets WHERE key = 'discord_bot_token'").run();
  });
  mutateDatabase(fixture.targetDatabasePath, (db) => {
    db.prepare("INSERT INTO app_secrets (key, value, updated_at) VALUES ('discord_bot_token', 'relay-preview-token', '2026-07-01')").run();
  });
  const manifestPath = createManifest(fixture);
  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  assert.deepEqual(manifest.secret, {
    canonicalPreflightRequiresEnvironmentToken: true,
    discordBotToken: { fingerprint: null, present: false },
  });
  assert.doesNotMatch(manifestText, /relay-preview-token|must-never-migrate|keep-target-oauth|keep-target-privacy/i);
  const apply = runScript(["--apply", "--manifest", manifestPath]);
  assert.equal(apply.status, 0, apply.stderr);
  const target = new DatabaseSync(fixture.targetDatabasePath, { readOnly: true });
  assert.equal(target.prepare("SELECT value FROM app_secrets WHERE key = 'discord_bot_token'").get().value, "relay-preview-token");
  assert.equal(target.prepare("SELECT value FROM app_secrets WHERE key = 'oauth_state_secret'").get().value, "keep-target-oauth");
  target.close();
});

test("missing source branding setting retains the target setting and files", () => {
  const fixture = createFixture();
  mutateDatabase(fixture.sourceDatabasePath, (db) => {
    db.prepare("DELETE FROM app_settings WHERE key = 'branding_json'").run();
  });
  const manifestPath = createManifest(fixture);
  const apply = runScript(["--apply", "--manifest", manifestPath]);
  assert.equal(apply.status, 0, apply.stderr);
  const target = new DatabaseSync(fixture.targetDatabasePath, { readOnly: true });
  const branding = JSON.parse(target.prepare("SELECT value FROM app_settings WHERE key = 'branding_json'").get().value);
  target.close();
  assert.equal(branding.favicon.fileName, "favicon.webp");
  assert.deepEqual(readFileSync(path.join(fixture.targetBrandingDirectory, "favicon.webp")), WEBP_BYTES);
  assert.equal(existsSync(path.join(fixture.targetBrandingDirectory, "logo.png")), false);
});

test("apply refuses branding hash drift before database mutation", () => {
  const fixture = createFixture();
  const manifestPath = createManifest(fixture);
  writeFileSync(path.join(fixture.sourceBrandingDirectory, "logo.png"), Buffer.concat([PNG_BYTES, Buffer.from("drift")]));
  const apply = runScript(["--apply", "--manifest", manifestPath]);
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /changed since dry-run/i);
  const target = new DatabaseSync(fixture.targetDatabasePath, { readOnly: true });
  assert.equal(target.prepare("SELECT COUNT(*) AS count FROM user_sessions").get().count, 1);
  target.close();
  assert.deepEqual(readFileSync(path.join(fixture.targetBrandingDirectory, "favicon.webp")), WEBP_BYTES);
});

test("foreign-key integrity failure rolls back the entire target transaction", () => {
  const fixture = createFixture();
  mutateDatabase(fixture.targetDatabasePath, (db) => {
    db.exec("PRAGMA foreign_keys = OFF");
    db.prepare(`
      INSERT INTO user_legal_acceptances
        (id, user_id, legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source)
      VALUES (99, 404, 'broken', 'broken', 'broken', 1, '2026-01-01', 'oauth')
    `).run();
  });
  const manifestPath = createManifest(fixture);
  const apply = runScript(["--apply", "--manifest", manifestPath]);
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /foreign_key_check failed/i);
  const target = new DatabaseSync(fixture.targetDatabasePath, { readOnly: true });
  assert.equal(target.prepare("SELECT COUNT(*) AS count FROM user_sessions").get().count, 1);
  assert.equal(target.prepare("SELECT discord_username FROM user_accounts WHERE id = 1").get().discord_username, "relay-user");
  target.close();
  assert.equal(existsSync(`${manifestPath}.applied`), false);
  assert.deepEqual(readFileSync(path.join(fixture.targetBrandingDirectory, "favicon.webp")), WEBP_BYTES);
});

test("SQLite CHECK integrity failure rolls back the entire target transaction", () => {
  const fixture = createFixture();
  mutateDatabase(fixture.targetDatabasePath, (db) => {
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare("UPDATE user_legal_acceptances SET age_confirmed = 2 WHERE id = 2").run();
  });
  const manifestPath = createManifest(fixture);
  const apply = runScript(["--apply", "--manifest", manifestPath]);
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /integrity_check failed/i);
  const target = new DatabaseSync(fixture.targetDatabasePath, { readOnly: true });
  assert.equal(target.prepare("SELECT COUNT(*) AS count FROM user_sessions").get().count, 1);
  assert.equal(target.prepare("SELECT discord_username FROM user_accounts WHERE id = 1").get().discord_username, "relay-user");
  target.close();
  assert.equal(existsSync(`${manifestPath}.applied`), false);
});

test("CLI rejects unknown arguments, missing files, and apply-time path overrides", () => {
  const unknown = runScript(["--wat"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown argument: --wat/);

  const fixture = createFixture();
  const missing = runScript([
    "--dry-run", "--source-db", path.join(fixture.directory, "missing.sqlite"),
    "--target-db", fixture.targetDatabasePath,
    "--source-branding", fixture.sourceBrandingDirectory,
    "--target-branding", fixture.targetBrandingDirectory,
    "--claim-id", CLAIM_ID,
    "--manifest", path.join(fixture.directory, "missing.json"),
  ]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /does not exist/i);

  const manifestPath = createManifest(fixture);
  const override = runScript(["--apply", "--manifest", manifestPath, "--target-db", fixture.targetDatabasePath]);
  assert.notEqual(override.status, 0);
  assert.match(override.stderr, /accepts only --manifest/i);
});
