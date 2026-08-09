import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

export const CANONICAL_CLAIM_ID = "1369094286777412590";
export const CANONICAL_CUTOVER_MANIFEST_VERSION = 1;
export const DEFAULT_CANONICAL_CUTOVER_PATHS = Object.freeze({
  sourceDatabasePath: "/var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite",
  targetDatabasePath: "/var/lib/bitcraft-claim-monitor-relay/bitcraft-local.sqlite",
  sourceBrandingDirectory: "/var/lib/bitcraft-claim-monitor/branding",
  targetBrandingDirectory: "/var/lib/bitcraft-claim-monitor-relay/branding",
});

export const CANONICAL_SETTING_KEYS = Object.freeze([
  "claim_id",
  "bitcraft_sync_url",
  "theme_json",
  "refresh_seconds",
  "server_refresh_seconds",
  "default_page",
  "default_region",
  "active_region_overrides",
  "excluded_member_ids_json",
  "visitor_security_json",
  "toast_json",
  "market_deal_watch_json",
  "discord_json",
  "branding_json",
  "app_popups_json",
  "access_control_json",
]);

export const REPLACED_DISCORD_TABLES = Object.freeze([
  "discord_youtube_channels",
  "discord_youtube_videos",
  "discord_craft_watches",
  "discord_mod_cases",
  "discord_warnings",
  "discord_mod_notes",
  "discord_custom_commands",
  "discord_component_votes",
  "discord_component_messages",
  "discord_temp_bans",
  "discord_craft_plan_report_occurrences",
]);

const MUTATED_TABLES = new Set([
  "user_accounts",
  "user_sessions",
  "user_legal_acceptances",
  "admin_users",
  "admin_sessions",
  "app_settings",
  "app_secrets",
  "craft_plan_settings",
  "market_deal_watches",
  "scheduled_jobs",
  "admin_audit_log",
  ...REPLACED_DISCORD_TABLES,
]);

const REQUIRED_COLUMNS = Object.freeze({
  user_accounts: ["id", "discord_id", "discord_username", "discord_global_name", "discord_avatar", "character_player_id", "character_name", "character_status", "settings_json", "created_at", "last_login_at", "inactivity_warning_sent_at"],
  user_sessions: ["token_hash", "user_id", "expires_at", "created_at", "reauthenticated_at"],
  user_legal_acceptances: ["id", "user_id", "legal_version", "terms_digest", "privacy_digest", "age_confirmed", "accepted_at", "source"],
  admin_users: ["id", "username", "password_hash", "role", "created_at", "active", "last_login_at", "discord_id", "discord_username", "discord_global_name", "discord_avatar"],
  admin_sessions: ["token_hash", "user_id", "expires_at", "created_at"],
  app_settings: ["key", "value", "updated_at"],
  app_secrets: ["key", "value", "updated_at"],
  craft_plan_settings: ["plan_key", "config_json", "created_at", "updated_at"],
  market_deal_watches: ["id", "user_id", "discord_id", "claim_id", "region_id", "item_id", "item_type", "item_name", "tier", "rarity", "icon_asset_name", "threshold_percent", "enabled", "last_checked_at", "last_alert_at", "last_baseline_window_days", "last_baseline_average", "last_error", "created_at", "updated_at"],
  scheduled_jobs: ["job_key", "label", "description", "schedule", "enabled", "last_run_at", "last_success_at", "last_error", "next_run_at", "running", "metadata_json", "updated_at"],
  admin_audit_log: ["id", "user_id", "username", "action", "details_json", "occurred_at"],
  discord_youtube_channels: ["channel_id", "input", "title", "url", "discord_channel_id", "enabled", "last_checked_at", "last_success_at", "last_error", "last_video_id", "last_video_title", "last_video_published_at", "created_at", "updated_at"],
  discord_youtube_videos: ["video_id", "channel_id", "title", "url", "thumbnail_url", "published_at", "seen_at", "notified_at"],
  discord_craft_watches: ["id", "guild_id", "user_id", "profession_key", "profession_name", "mode", "updated_at"],
  discord_mod_cases: ["id", "guild_id", "case_type", "user_id", "moderator", "reason", "details_json", "occurred_at"],
  discord_warnings: ["id", "guild_id", "user_id", "moderator", "reason", "active", "created_at"],
  discord_mod_notes: ["id", "guild_id", "user_id", "moderator", "note", "created_at"],
  discord_custom_commands: ["name", "description", "response", "updated_at"],
  discord_component_votes: ["message_id", "component_key", "user_id", "kind", "updated_at"],
  discord_component_messages: ["message_id", "kind", "metadata_json", "updated_at"],
  discord_temp_bans: ["guild_id", "user_id", "unban_at", "reason", "created_at"],
  discord_craft_plan_report_occurrences: ["rule_id", "occurrence_key", "scheduled_at", "status", "discord_message_id", "last_error", "created_at", "updated_at"],
});

const ACCOUNT_FIELDS = REQUIRED_COLUMNS.user_accounts.filter((column) => column !== "id");
const ADMIN_FIELDS = REQUIRED_COLUMNS.admin_users.filter((column) => column !== "id");
const WATCH_FIELDS = REQUIRED_COLUMNS.market_deal_watches.filter((column) => !["id", "user_id"].includes(column));
const ADMIN_ROLES = new Set(["owner", "admin", "discord-manager", "moderator", "viewer"]);

const IMAGE_TYPES = Object.freeze({
  ".png": { contentType: "image/png", magic: (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  ".jpg": { contentType: "image/jpeg", magic: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  ".webp": { contentType: "image/webp", magic: (bytes) => bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" },
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decimal(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be an exact decimal ID`);
  return normalized;
}

function comparePaths(left, right) {
  const normalize = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  return normalize(path.resolve(left)) === normalize(path.resolve(right));
}

function guardedExistingPath(inputPath, kind, label) {
  const resolved = path.resolve(String(inputPath ?? ""));
  if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`);
  if (lstatSync(resolved).isSymbolicLink() || !comparePaths(realpathSync.native(resolved), resolved)) {
    throw new Error(`${label} must not be or traverse a symlink`);
  }
  const stats = statSync(resolved);
  if (kind === "file" && !stats.isFile()) throw new Error(`${label} must be a regular file`);
  if (kind === "directory" && !stats.isDirectory()) throw new Error(`${label} must be a directory`);
  return resolved;
}

function parseJson(value, label, fallback = undefined) {
  if (value == null && fallback !== undefined) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function schemaDescription(db) {
  return db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all().map((row) => ({
    type: String(row.type),
    name: String(row.name),
    table: String(row.tbl_name),
    sql: String(row.sql ?? "").replace(/\s+/g, " ").trim(),
  }));
}

function tableNames(db) {
  return db.prepare(`
    SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => String(row.name));
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tableCount(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get().count);
}

function tableContentFingerprint(db, table) {
  const columnInfo = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  const columns = columnInfo.map((column) => String(column.name));
  const hash = createHash("sha256");
  const tableSql = String(db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table)?.sql ?? "");
  const primaryKey = columnInfo.filter((column) => Number(column.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map((column) => quoteIdentifier(column.name));
  const ordering = /\bWITHOUT\s+ROWID\b/i.test(tableSql)
    ? (primaryKey.length ? ` ORDER BY ${primaryKey.join(", ")}` : "")
    : " ORDER BY rowid";
  for (const row of db.prepare(`SELECT * FROM ${quoteIdentifier(table)}${ordering}`).iterate()) {
    const normalized = {};
    for (const column of columns) {
      const value = row[column];
      normalized[column] = value instanceof Uint8Array ? { blobSha256: sha256(value), size: value.byteLength } : value;
    }
    hash.update(canonicalJson(normalized));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function databaseDescription(db, databasePath, { includeProtectedContent }) {
  const schema = schemaDescription(db);
  const names = tableNames(db);
  return {
    path: databasePath,
    schemaFingerprint: sha256(canonicalJson(schema)),
    tables: Object.fromEntries(names.map((table) => [table, {
      count: tableCount(db, table),
      ...(includeProtectedContent && !MUTATED_TABLES.has(table) ? { contentSha256: tableContentFingerprint(db, table) } : {}),
    }])),
  };
}

function assertCleanCheckpoint(databasePath, label) {
  for (const suffix of ["-wal", "-journal"]) {
    const sidecarPath = `${databasePath}${suffix}`;
    if (existsSync(sidecarPath) && statSync(sidecarPath).size > 0) {
      throw new Error(`${label} must be frozen and cleanly checkpointed; found non-empty ${path.basename(sidecarPath)}`);
    }
  }
}

function nextIds(db, table, count) {
  if (!count) return [];
  const maximum = Number(db.prepare(`SELECT COALESCE(MAX(id), 0) AS value FROM ${quoteIdentifier(table)}`).get().value);
  const sequenceTable = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'sqlite_sequence'").get();
  const sequence = sequenceTable
    ? Number(db.prepare("SELECT COALESCE(seq, 0) AS value FROM sqlite_sequence WHERE name = ?").get(table)?.value ?? 0)
    : 0;
  const first = Math.max(maximum, sequence) + 1;
  return Array.from({ length: count }, (_, index) => first + index);
}

function accountMappings(source, target) {
  const sourceRows = source.prepare("SELECT id, discord_id FROM user_accounts ORDER BY id").all();
  const targetRows = target.prepare("SELECT id, discord_id FROM user_accounts ORDER BY id").all();
  const validate = (rows, label) => {
    const seen = new Set();
    for (const row of rows) {
      const discordId = decimal(row.discord_id, `${label} user account Discord ID`);
      if (seen.has(discordId)) throw new Error(`${label} user accounts contain duplicate Discord ID ${discordId}`);
      seen.add(discordId);
    }
  };
  validate(sourceRows, "Source");
  validate(targetRows, "Target");
  const targetByDiscordId = new Map(targetRows.map((row) => [String(row.discord_id), Number(row.id)]));
  const inserts = sourceRows.filter((row) => !targetByDiscordId.has(String(row.discord_id)));
  const insertedIds = nextIds(target, "user_accounts", inserts.length);
  let insertedIndex = 0;
  return sourceRows.map((row) => {
    const existing = targetByDiscordId.get(String(row.discord_id));
    return {
      action: existing == null ? "insert" : "overwrite",
      sourceId: Number(row.id),
      targetId: existing ?? insertedIds[insertedIndex++],
    };
  });
}

function assertSupportedSchema(db, label) {
  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const tableExists = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table);
    if (!tableExists) throw new Error(`${label} database is unsupported: missing table ${table}`);
    const columns = new Set(db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => String(column.name)));
    const missing = requiredColumns.filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`${label} database is unsupported: ${table} is missing columns ${missing.join(", ")}`);
  }
}

function assertJsonObject(value, label) {
  const parsed = parseJson(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must contain a JSON object`);
  return parsed;
}

function optionalDecimal(value, label) {
  if (value == null || String(value).trim() === "") return null;
  return decimal(value, label);
}

function validateDecimalColumns(db, label, table, columns) {
  for (const row of db.prepare(`SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)} ORDER BY rowid`).iterate()) {
    for (const column of columns) optionalDecimal(row[column], `${label} ${table}.${column}`);
  }
}

function validateDiscordSettingsIds(value) {
  const parsed = assertJsonObject(value, "source discord_json");
  const visit = (node, parentKey = "") => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const value_ of node) visit(value_, parentKey);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (child != null && String(child).trim() !== "" && /^(?:application|guild|channel|role|user|message)Id$/i.test(key)) {
        decimal(child, `source discord_json ${key}`);
      }
      if (child != null && String(child).trim() !== "" && ["channels", "craftChannels"].includes(parentKey) && typeof child !== "object") {
        decimal(child, `source discord_json ${parentKey}.${key}`);
      }
      visit(child, key);
    }
  };
  visit(parsed);
}

function validateSelectedRows(source, target, claimId) {
  for (const [db, label] of [[source, "Source"], [target, "Target"]]) {
    assertSupportedSchema(db, label);
    for (const row of db.prepare("SELECT id, settings_json FROM user_accounts ORDER BY id").all()) {
      assertJsonObject(row.settings_json, `${label} user account ${row.id} settings_json`);
    }
    validateDecimalColumns(db, label, "user_accounts", ["discord_id", "character_player_id"]);
    validateDecimalColumns(db, label, "admin_users", ["discord_id"]);
    validateDecimalColumns(db, label, "discord_youtube_channels", ["discord_channel_id"]);
    validateDecimalColumns(db, label, "discord_craft_watches", ["guild_id", "user_id"]);
    validateDecimalColumns(db, label, "discord_mod_cases", ["guild_id", "user_id"]);
    validateDecimalColumns(db, label, "discord_warnings", ["guild_id", "user_id"]);
    validateDecimalColumns(db, label, "discord_mod_notes", ["guild_id", "user_id"]);
    validateDecimalColumns(db, label, "discord_component_votes", ["message_id", "user_id"]);
    validateDecimalColumns(db, label, "discord_component_messages", ["message_id"]);
    validateDecimalColumns(db, label, "discord_temp_bans", ["guild_id", "user_id"]);
    validateDecimalColumns(db, label, "discord_craft_plan_report_occurrences", ["discord_message_id"]);
    for (const row of db.prepare("SELECT id, claim_id, discord_id, region_id, item_id, item_type FROM market_deal_watches ORDER BY id").all()) {
      if (decimal(row.claim_id, `${label} market watch ${row.id} claim ID`) !== claimId) {
        throw new Error(`${label} market watch ${row.id} is outside the canonical claim`);
      }
      decimal(row.discord_id, `${label} market watch ${row.id} Discord ID`);
      decimal(row.region_id, `${label} market watch ${row.id} region ID`);
      decimal(row.item_id, `${label} market watch ${row.id} item ID`);
      if (!["0", "1"].includes(String(row.item_type))) throw new Error(`${label} market watch ${row.id} item type must be 0 or 1`);
    }
    for (const row of db.prepare("SELECT plan_key, config_json FROM craft_plan_settings ORDER BY plan_key").all()) {
      assertJsonObject(row.config_json, `${label} craft plan ${row.plan_key} config_json`);
    }
    for (const row of db.prepare("SELECT job_key, metadata_json FROM scheduled_jobs ORDER BY job_key").all()) {
      assertJsonObject(row.metadata_json, `${label} scheduled job ${row.job_key} metadata_json`);
    }
    for (const row of db.prepare("SELECT id, details_json FROM admin_audit_log ORDER BY id").all()) {
      assertJsonObject(row.details_json, `${label} admin audit row ${row.id} details_json`);
    }
    for (const row of db.prepare("SELECT id, details_json FROM discord_mod_cases ORDER BY id").all()) {
      assertJsonObject(row.details_json, `${label} Discord moderation case ${row.id} details_json`);
    }
    for (const row of db.prepare("SELECT message_id, metadata_json FROM discord_component_messages ORDER BY message_id, kind").all()) {
      assertJsonObject(row.metadata_json, `${label} Discord component message metadata_json`);
    }
    if (label === "Source") {
      const unmappedLegal = db.prepare(`
        SELECT acceptance.id
        FROM user_legal_acceptances AS acceptance
        LEFT JOIN user_accounts AS account ON account.id = acceptance.user_id
        WHERE account.id IS NULL
        LIMIT 1
      `).get();
      if (unmappedLegal) throw new Error(`Source legal acceptance ${unmappedLegal.id} has an unmappable account`);
      const unmappedVideo = db.prepare(`
        SELECT video.video_id
        FROM discord_youtube_videos AS video
        LEFT JOIN discord_youtube_channels AS channel ON channel.channel_id = video.channel_id
        WHERE channel.channel_id IS NULL
        LIMIT 1
      `).get();
      if (unmappedVideo) throw new Error("Source Discord YouTube video has an unmappable channel");
    }
  }

  const sourceSettings = new Map(source.prepare("SELECT key, value FROM app_settings ORDER BY key").all().map((row) => [String(row.key), String(row.value)]));
  for (const key of CANONICAL_SETTING_KEYS.filter((candidate) => candidate.endsWith("_json"))) {
    if (!sourceSettings.has(key)) continue;
    const parsed = parseJson(sourceSettings.get(key), `source app_settings ${key}`);
    if (parsed == null || typeof parsed !== "object") throw new Error(`source app_settings ${key} must contain JSON`);
  }
  if (sourceSettings.has("discord_json")) validateDiscordSettingsIds(sourceSettings.get("discord_json"));
  if (sourceSettings.has("excluded_member_ids_json")) {
    const ids = parseJson(sourceSettings.get("excluded_member_ids_json"), "source excluded_member_ids_json");
    if (!Array.isArray(ids)) throw new Error("source excluded_member_ids_json must contain an array");
    for (const id of ids) decimal(id, "source excluded member ID");
  }
  if (sourceSettings.has("access_control_json")) {
    const access = assertJsonObject(sourceSettings.get("access_control_json"), "source access_control_json");
    if (access.accounts != null) {
      if (!access.accounts || typeof access.accounts !== "object" || Array.isArray(access.accounts)) throw new Error("source access_control_json accounts must be an object");
      for (const id of Object.keys(access.accounts)) decimal(id, "source access-control account Discord ID");
    }
  }
  if (sourceSettings.has("default_region") && String(sourceSettings.get("default_region")).trim()) {
    decimal(sourceSettings.get("default_region"), "source default region ID");
  }
  if (sourceSettings.has("active_region_overrides")) {
    for (const id of String(sourceSettings.get("active_region_overrides")).split(/[\s,]+/).filter(Boolean)) {
      decimal(id, "source active region override");
    }
  }
}

function adminMappings(source, target) {
  const sourceRows = source.prepare("SELECT * FROM admin_users ORDER BY id").all();
  const targetRows = target.prepare("SELECT * FROM admin_users ORDER BY id").all();
  const validate = (rows, label) => {
    const usernames = new Set();
    const discordIds = new Set();
    for (const row of rows) {
      const username = String(row.username ?? "").trim();
      if (!username || usernames.has(username)) throw new Error(`${label} administrators contain an invalid or duplicate username`);
      usernames.add(username);
      const discordId = optionalDecimal(row.discord_id, `${label} administrator Discord ID`);
      if (discordId && discordIds.has(discordId)) throw new Error(`${label} administrators contain duplicate Discord IDs`);
      if (discordId) discordIds.add(discordId);
      if (!/^scrypt:[0-9a-fA-F]+:[0-9a-fA-F]{128}$/.test(String(row.password_hash ?? ""))) {
        throw new Error(`${label} administrator ${row.id} has an unsupported password hash`);
      }
      if (!ADMIN_ROLES.has(String(row.role))) throw new Error(`${label} administrator ${row.id} has an unsupported role`);
      if (![0, 1].includes(Number(row.active))) throw new Error(`${label} administrator ${row.id} has an invalid active flag`);
    }
  };
  validate(sourceRows, "Source");
  validate(targetRows, "Target");
  const targetByUsername = new Map(targetRows.map((row) => [String(row.username), Number(row.id)]));
  const targetByDiscordId = new Map(targetRows.filter((row) => optionalDecimal(row.discord_id, "Target administrator Discord ID"))
    .map((row) => [String(row.discord_id), Number(row.id)]));
  const mappings = [];
  const usedTargetIds = new Set();
  const pending = [];
  for (const row of sourceRows) {
    const usernameMatch = targetByUsername.get(String(row.username));
    const discordMatch = row.discord_id ? targetByDiscordId.get(String(row.discord_id)) : undefined;
    if (usernameMatch != null && discordMatch != null && usernameMatch !== discordMatch) {
      throw new Error(`Source administrator ${row.id} has ambiguous target identity matches`);
    }
    const targetId = discordMatch ?? usernameMatch;
    if (targetId == null) pending.push(row);
    else {
      if (usedTargetIds.has(targetId)) throw new Error(`Multiple source administrators map to target administrator ${targetId}`);
      usedTargetIds.add(targetId);
      mappings.push({ action: "overwrite", sourceId: Number(row.id), targetId });
    }
  }
  const ids = nextIds(target, "admin_users", pending.length);
  pending.forEach((row, index) => mappings.push({ action: "insert", sourceId: Number(row.id), targetId: ids[index] }));
  mappings.sort((left, right) => left.sourceId - right.sourceId);
  return mappings;
}

function watchMappings(source, target, mappings, claimId) {
  const accountMap = new Map(mappings.map((mapping) => [mapping.sourceId, mapping.targetId]));
  const sourceAccounts = new Map(source.prepare("SELECT id, discord_id FROM user_accounts").all().map((row) => [Number(row.id), String(row.discord_id)]));
  const targetAccounts = new Map(target.prepare("SELECT id, discord_id FROM user_accounts").all().map((row) => [Number(row.id), String(row.discord_id)]));
  const sourceRows = source.prepare("SELECT * FROM market_deal_watches ORDER BY id").all();
  const targetRows = target.prepare("SELECT * FROM market_deal_watches ORDER BY id").all();
  for (const row of sourceRows) {
    const accountDiscordId = sourceAccounts.get(Number(row.user_id));
    if (!accountDiscordId || accountDiscordId !== String(row.discord_id)) throw new Error(`Source market watch ${row.id} cannot be mapped to its account`);
  }
  for (const row of targetRows) {
    const accountDiscordId = targetAccounts.get(Number(row.user_id));
    if (!accountDiscordId || accountDiscordId !== String(row.discord_id)) throw new Error(`Target market watch ${row.id} cannot be mapped to its account`);
  }
  const key = (userId, row) => [userId, claimId, String(row.region_id), String(row.item_id), String(row.item_type)].join("\0");
  const targetByKey = new Map(targetRows.map((row) => [key(Number(row.user_id), row), Number(row.id)]));
  const pending = [];
  const result = [];
  for (const row of sourceRows) {
    const targetUserId = accountMap.get(Number(row.user_id));
    if (targetUserId == null) throw new Error(`Source market watch ${row.id} has an unmappable account`);
    const existing = targetByKey.get(key(targetUserId, row));
    if (existing == null) pending.push({ row, targetUserId });
    else result.push({ action: "update", sourceId: Number(row.id), targetId: existing, targetUserId });
  }
  const ids = nextIds(target, "market_deal_watches", pending.length);
  pending.forEach(({ row, targetUserId }, index) => result.push({ action: "insert", sourceId: Number(row.id), targetId: ids[index], targetUserId }));
  result.sort((left, right) => left.sourceId - right.sourceId);
  return result;
}

function auditMappings(source, target, adminMap) {
  const mappedIds = new Map(adminMap.map((mapping) => [mapping.sourceId, mapping.targetId]));
  const targetRows = target.prepare("SELECT * FROM admin_audit_log ORDER BY id").all();
  const identity = (row) => canonicalJson({
    userId: row.user_id == null ? null : Number(row.user_id),
    username: String(row.username),
    action: String(row.action),
    detailsJson: String(row.details_json),
    occurredAt: String(row.occurred_at),
  });
  const existing = new Map();
  for (const row of targetRows) if (!existing.has(identity(row))) existing.set(identity(row), Number(row.id));
  const sourceRows = source.prepare("SELECT * FROM admin_audit_log ORDER BY id").all();
  const pending = [];
  const pendingByIdentity = new Map();
  const pendingDuplicates = [];
  const result = [];
  for (const row of sourceRows) {
    const mappedAdminId = row.user_id == null ? null : (mappedIds.get(Number(row.user_id)) ?? null);
    const normalized = { ...row, user_id: mappedAdminId };
    const rowIdentity = identity(normalized);
    const duplicateId = existing.get(rowIdentity);
    if (duplicateId != null) {
      result.push({ action: "duplicate", mappedAdminId, sourceId: Number(row.id), targetId: duplicateId });
    } else if (pendingByIdentity.has(rowIdentity)) {
      pendingDuplicates.push({ mappedAdminId, rowIdentity, sourceId: Number(row.id) });
    } else {
      const entry = { row, mappedAdminId, rowIdentity };
      pending.push(entry);
      pendingByIdentity.set(rowIdentity, entry);
    }
  }
  const ids = nextIds(target, "admin_audit_log", pending.length);
  const insertedIds = new Map();
  pending.forEach(({ row, mappedAdminId, rowIdentity }, index) => {
    insertedIds.set(rowIdentity, ids[index]);
    result.push({ action: "append", mappedAdminId, sourceId: Number(row.id), targetId: ids[index] });
  });
  for (const duplicate of pendingDuplicates) {
    result.push({
      action: "duplicate",
      mappedAdminId: duplicate.mappedAdminId,
      sourceId: duplicate.sourceId,
      targetId: insertedIds.get(duplicate.rowIdentity),
    });
  }
  result.sort((left, right) => left.sourceId - right.sourceId);
  return result;
}

function conflictDecisions(source, target, accountMap, adminMap, watchMap, auditMap) {
  const sourceSettingKeys = new Set(source.prepare("SELECT key FROM app_settings").all().map((row) => String(row.key)));
  const targetSettingKeys = new Set(target.prepare("SELECT key FROM app_settings").all().map((row) => String(row.key)));
  const sourcePlans = source.prepare("SELECT plan_key FROM craft_plan_settings ORDER BY plan_key").all().map((row) => String(row.plan_key));
  const targetPlans = new Set(target.prepare("SELECT plan_key FROM craft_plan_settings").all().map((row) => String(row.plan_key)));
  const sourceJobs = new Set(source.prepare("SELECT job_key FROM scheduled_jobs").all().map((row) => String(row.job_key)));
  const targetJobs = target.prepare("SELECT job_key FROM scheduled_jobs ORDER BY job_key").all().map((row) => String(row.job_key));
  return {
    accounts: {
      inserted: accountMap.filter((entry) => entry.action === "insert").length,
      overwritten: accountMap.filter((entry) => entry.action === "overwrite").length,
      retainedTargetOnly: tableCount(target, "user_accounts") - accountMap.filter((entry) => entry.action === "overwrite").length,
    },
    admins: {
      inserted: adminMap.filter((entry) => entry.action === "insert").length,
      overwritten: adminMap.filter((entry) => entry.action === "overwrite").length,
      removedTargetOnly: tableCount(target, "admin_users") - adminMap.filter((entry) => entry.action === "overwrite").length,
    },
    settings: CANONICAL_SETTING_KEYS.map((key) => ({
      action: sourceSettingKeys.has(key) ? (targetSettingKeys.has(key) ? "overwrite" : "insert") : "source-missing",
      key,
    })),
    craftPlans: sourcePlans.map((key) => ({ action: targetPlans.has(key) ? "overwrite" : "insert", key })),
    marketWatches: {
      inserted: watchMap.filter((entry) => entry.action === "insert").length,
      retainedTargetOnly: tableCount(target, "market_deal_watches") - watchMap.filter((entry) => entry.action === "update").length,
      updated: watchMap.filter((entry) => entry.action === "update").length,
    },
    scheduledJobs: targetJobs.map((key) => ({ action: sourceJobs.has(key) ? "overlay-and-reset" : "retain-target", key })),
    sourceOnlyScheduledJobsIgnored: [...sourceJobs].filter((key) => !targetJobs.includes(key)).sort(),
    replacedDiscordTables: Object.fromEntries(REPLACED_DISCORD_TABLES.map((table) => [table, {
      replacement: tableCount(source, table),
      targetReplaced: tableCount(target, table),
    }])),
    adminAudit: {
      appended: auditMap.filter((entry) => entry.action === "append").length,
      duplicates: auditMap.filter((entry) => entry.action === "duplicate").length,
      retainedTarget: tableCount(target, "admin_audit_log"),
    },
  };
}

function settingValue(db, key) {
  return db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key)?.value;
}

function brandingDescription(db, directory, label) {
  const raw = settingValue(db, "branding_json");
  const branding = raw == null ? {} : parseJson(raw, `${label} branding_json`);
  if (!branding || typeof branding !== "object" || Array.isArray(branding)) {
    throw new Error(`${label} branding_json must contain an object`);
  }
  const referenced = new Set();
  const assets = {};
  for (const type of ["logo", "favicon"]) {
    const asset = branding[type];
    if (asset == null) continue;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) throw new Error(`${label} ${type} branding metadata is invalid`);
    const fileName = String(asset.fileName ?? "");
    const extension = path.extname(fileName).toLowerCase();
    const format = IMAGE_TYPES[extension];
    if (path.basename(fileName) !== fileName || !format || fileName !== `${type}${extension}`) {
      throw new Error(`${label} ${type} branding filename is unsupported`);
    }
    if (String(asset.contentType ?? "") !== format.contentType) throw new Error(`${label} ${type} branding content type is invalid`);
    const filePath = path.resolve(directory, fileName);
    if (!comparePaths(path.dirname(filePath), directory)) throw new Error(`${label} branding asset escapes its supplied root`);
    guardedExistingPath(filePath, "file", `${label} ${type} branding asset`);
    const bytes = readFileSync(filePath);
    if (!bytes.length || bytes.length > 1024 * 1024) throw new Error(`${label} ${type} branding asset exceeds content limits`);
    if (!format.magic(bytes)) throw new Error(`${label} ${type} branding content does not match its declared type`);
    referenced.add(fileName);
    assets[type] = {
      contentType: format.contentType,
      fileName,
      sha256: sha256(bytes),
      size: bytes.length,
    };
  }
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`${label} branding directory must not contain symlinks`);
  }
  return {
    assets,
    path: directory,
    settingPresent: raw != null,
    unexpectedFileCount: entries.filter((entry) => !referenced.has(entry.name)).length,
  };
}

function secretDescription(source) {
  const row = source.prepare("SELECT value FROM app_secrets WHERE key = 'discord_bot_token'").get();
  const present = row != null && String(row.value).trim().length > 0;
  return {
    canonicalPreflightRequiresEnvironmentToken: !present,
    discordBotToken: {
      fingerprint: present ? sha256(`discord_bot_token\0${String(row.value)}`) : null,
      present,
    },
  };
}

function collectTableCounts(sourceDescription, targetDescription, source, target, mappings) {
  const names = [...new Set([
    ...Object.keys(sourceDescription.tables),
    ...Object.keys(targetDescription.tables),
  ])].sort();
  const counts = Object.fromEntries(names.map((table) => {
    const targetCount = targetDescription.tables[table]?.count ?? 0;
    const excluded = !MUTATED_TABLES.has(table);
    return [table, {
      conflicting: 0,
      excluded,
      operation: excluded ? "protected" : "approved",
      replaced: 0,
      retained: targetCount,
      selected: 0,
      source: sourceDescription.tables[table]?.count ?? 0,
      target: targetCount,
    }];
  }));
  const set = (table, values) => Object.assign(counts[table], values);
  const accountConflicts = mappings.accounts.filter((entry) => entry.action === "overwrite").length;
  set("user_accounts", {
    conflicting: accountConflicts,
    retained: counts.user_accounts.target - accountConflicts,
    selected: mappings.accounts.length,
  });
  set("user_sessions", { replaced: counts.user_sessions.target, retained: 0, selected: counts.user_sessions.target });
  const accountMap = new Map(mappings.accounts.map((entry) => [entry.sourceId, entry.targetId]));
  let legalConflicts = 0;
  for (const row of source.prepare("SELECT * FROM user_legal_acceptances").iterate()) {
    const targetUserId = accountMap.get(Number(row.user_id));
    if (target.prepare("SELECT 1 FROM user_legal_acceptances WHERE user_id = ? AND legal_version = ? AND terms_digest = ? AND privacy_digest = ?")
      .get(targetUserId, row.legal_version, row.terms_digest, row.privacy_digest)) legalConflicts += 1;
  }
  set("user_legal_acceptances", { conflicting: legalConflicts, selected: counts.user_legal_acceptances.source });
  const adminConflicts = mappings.admins.filter((entry) => entry.action === "overwrite").length;
  set("admin_users", {
    conflicting: adminConflicts,
    replaced: counts.admin_users.target - adminConflicts,
    retained: 0,
    selected: mappings.admins.length,
  });
  set("admin_sessions", { replaced: counts.admin_sessions.target, retained: 0, selected: counts.admin_sessions.target });
  const sourceSettings = new Set(source.prepare("SELECT key FROM app_settings").all().map((row) => String(row.key)));
  const targetSettings = new Set(target.prepare("SELECT key FROM app_settings").all().map((row) => String(row.key)));
  const selectedSettings = CANONICAL_SETTING_KEYS.filter((key) => sourceSettings.has(key));
  const conflictingSettings = selectedSettings.filter((key) => targetSettings.has(key)).length;
  set("app_settings", { conflicting: conflictingSettings, replaced: conflictingSettings, retained: counts.app_settings.target - conflictingSettings, selected: selectedSettings.length });
  const sourceToken = source.prepare("SELECT 1 FROM app_secrets WHERE key = 'discord_bot_token'").get() ? 1 : 0;
  const targetToken = target.prepare("SELECT 1 FROM app_secrets WHERE key = 'discord_bot_token'").get() ? 1 : 0;
  set("app_secrets", { conflicting: sourceToken && targetToken ? 1 : 0, replaced: sourceToken && targetToken ? 1 : 0, retained: counts.app_secrets.target - (sourceToken && targetToken ? 1 : 0), selected: sourceToken });
  const targetPlans = new Set(target.prepare("SELECT plan_key FROM craft_plan_settings").all().map((row) => String(row.plan_key)));
  const sourcePlans = source.prepare("SELECT plan_key FROM craft_plan_settings").all().map((row) => String(row.plan_key));
  const planConflicts = sourcePlans.filter((key) => targetPlans.has(key)).length;
  set("craft_plan_settings", { conflicting: planConflicts, replaced: planConflicts, retained: counts.craft_plan_settings.target - planConflicts, selected: sourcePlans.length });
  const watchConflicts = mappings.watches.filter((entry) => entry.action === "update").length;
  set("market_deal_watches", { conflicting: watchConflicts, replaced: watchConflicts, retained: counts.market_deal_watches.target - watchConflicts, selected: mappings.watches.length });
  const sourceJobs = new Set(source.prepare("SELECT job_key FROM scheduled_jobs").all().map((row) => String(row.job_key)));
  const matchedJobs = target.prepare("SELECT job_key FROM scheduled_jobs").all().filter((row) => sourceJobs.has(String(row.job_key))).length;
  set("scheduled_jobs", { conflicting: matchedJobs, replaced: matchedJobs, retained: counts.scheduled_jobs.target - matchedJobs, selected: matchedJobs });
  for (const table of REPLACED_DISCORD_TABLES) set(table, { replaced: counts[table].target, retained: 0, selected: counts[table].source });
  const appendedAudit = mappings.audits.filter((entry) => entry.action === "append").length;
  const duplicateAudit = mappings.audits.filter((entry) => entry.action === "duplicate").length;
  set("admin_audit_log", { conflicting: duplicateAudit, selected: appendedAudit + duplicateAudit });
  return counts;
}

function manifestWithoutHash(options, source, target) {
  validateSelectedRows(source, target, options.claimId);
  const sourceDatabase = databaseDescription(source, options.sourceDatabasePath, { includeProtectedContent: false });
  const targetDatabase = databaseDescription(target, options.targetDatabasePath, { includeProtectedContent: true });
  const accounts = accountMappings(source, target);
  const admins = adminMappings(source, target);
  const watches = watchMappings(source, target, accounts, options.claimId);
  const audits = auditMappings(source, target, admins);
  const manifest = {
    formatVersion: CANONICAL_CUTOVER_MANIFEST_VERSION,
    claimId: options.claimId,
    source: { database: sourceDatabase },
    target: { database: targetDatabase },
    tableCounts: collectTableCounts(sourceDatabase, targetDatabase, source, target, {
      accounts,
      admins,
      audits,
      watches,
    }),
    accountMappings: accounts,
    adminMappings: admins,
    watchMappings: watches,
    adminAuditMappings: audits,
    conflictDecisions: conflictDecisions(source, target, accounts, admins, watches, audits),
    branding: {
      source: brandingDescription(source, options.sourceBrandingDirectory, "Source"),
      target: brandingDescription(target, options.targetBrandingDirectory, "Target"),
    },
    secret: secretDescription(source),
    privacyLedgerKeyIds: { source: null, target: null },
  };
  return manifest;
}

function openReadOnly(databasePath) {
  return new DatabaseSync(databasePath, { readOnly: true, timeout: 5_000 });
}

export function createCanonicalCutoverManifest(input) {
  const claimId = decimal(input.claimId, "claim ID");
  if (claimId !== CANONICAL_CLAIM_ID) throw new Error(`claim ID must be exactly ${CANONICAL_CLAIM_ID}`);
  const options = {
    claimId,
    sourceDatabasePath: guardedExistingPath(input.sourceDatabasePath, "file", "Source database"),
    targetDatabasePath: guardedExistingPath(input.targetDatabasePath, "file", "Target database"),
    sourceBrandingDirectory: guardedExistingPath(input.sourceBrandingDirectory, "directory", "Source branding directory"),
    targetBrandingDirectory: guardedExistingPath(input.targetBrandingDirectory, "directory", "Target branding directory"),
  };
  if (comparePaths(options.sourceDatabasePath, options.targetDatabasePath)) throw new Error("Source and target databases must be different files");
  assertCleanCheckpoint(options.sourceDatabasePath, "Source database");
  assertCleanCheckpoint(options.targetDatabasePath, "Target database");
  const source = openReadOnly(options.sourceDatabasePath);
  const target = openReadOnly(options.targetDatabasePath);
  try {
    const sourceClaimId = decimal(settingValue(source, "claim_id"), "source app_settings claim_id");
    const targetClaimId = decimal(settingValue(target, "claim_id"), "target app_settings claim_id");
    if (sourceClaimId !== claimId || targetClaimId !== claimId) throw new Error("Source and target claim settings must match the exact canonical claim ID");
    const manifest = manifestWithoutHash(options, source, target);
    source.close();
    target.close();
    manifest.source.database.fileSha256 = sha256(readFileSync(options.sourceDatabasePath));
    manifest.target.database.fileSha256 = sha256(readFileSync(options.targetDatabasePath));
    return { ...manifest, selectionHash: sha256(canonicalJson(manifest)) };
  } finally {
    try { source.close(); } catch {}
    try { target.close(); } catch {}
  }
}

function rowMap(db, schema, table, key = "id") {
  return new Map(db.prepare(`SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(key)}`)
    .all().map((row) => [Number(row[key]), row]));
}

function insertRow(db, table, row, columns) {
  const names = columns ?? Object.keys(row);
  const placeholders = names.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${quoteIdentifier(table)} (${names.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`)
    .run(...names.map((column) => row[column]));
}

function updateRow(db, table, keyColumn, keyValue, row, columns) {
  db.prepare(`UPDATE ${quoteIdentifier(table)} SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(", ")} WHERE ${quoteIdentifier(keyColumn)} = ?`)
    .run(...columns.map((column) => row[column]), keyValue);
}

function applyAccounts(db, manifest) {
  const sourceRows = rowMap(db, "source", "user_accounts");
  for (const mapping of manifest.accountMappings) {
    const row = sourceRows.get(mapping.sourceId);
    if (!row) throw new Error(`Source account mapping ${mapping.sourceId} disappeared`);
    if (mapping.action === "overwrite") updateRow(db, "user_accounts", "id", mapping.targetId, row, ACCOUNT_FIELDS);
    else insertRow(db, "user_accounts", { ...row, id: mapping.targetId }, REQUIRED_COLUMNS.user_accounts);
  }
  const accountMap = new Map(manifest.accountMappings.map((mapping) => [mapping.sourceId, mapping.targetId]));
  for (const row of db.prepare("SELECT * FROM source.user_legal_acceptances ORDER BY id").iterate()) {
    const targetUserId = accountMap.get(Number(row.user_id));
    if (targetUserId == null) throw new Error(`Source legal acceptance ${row.id} has an unmappable account`);
    const exists = db.prepare(`
      SELECT 1 FROM user_legal_acceptances
      WHERE user_id = ? AND legal_version = ? AND terms_digest = ? AND privacy_digest = ?
    `).get(targetUserId, row.legal_version, row.terms_digest, row.privacy_digest);
    if (!exists) insertRow(db, "user_legal_acceptances", { ...row, user_id: targetUserId }, REQUIRED_COLUMNS.user_legal_acceptances.filter((column) => column !== "id"));
  }
}

function applyAdmins(db, manifest) {
  const sourceRows = rowMap(db, "source", "admin_users");
  const retainedTargetIds = new Set(manifest.adminMappings.filter((mapping) => mapping.action === "overwrite").map((mapping) => mapping.targetId));
  for (const row of db.prepare("SELECT id FROM admin_users ORDER BY id").all()) {
    if (!retainedTargetIds.has(Number(row.id))) db.prepare("DELETE FROM admin_users WHERE id = ?").run(row.id);
  }
  for (const mapping of manifest.adminMappings) {
    const row = sourceRows.get(mapping.sourceId);
    if (!row) throw new Error(`Source administrator mapping ${mapping.sourceId} disappeared`);
    if (mapping.action === "overwrite") updateRow(db, "admin_users", "id", mapping.targetId, row, ADMIN_FIELDS);
    else insertRow(db, "admin_users", { ...row, id: mapping.targetId }, REQUIRED_COLUMNS.admin_users);
  }
}

function applySettingsAndSecrets(db) {
  const upsertSetting = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  for (const row of db.prepare("SELECT key, value, updated_at FROM source.app_settings ORDER BY key").iterate()) {
    if (CANONICAL_SETTING_KEYS.includes(String(row.key))) upsertSetting.run(row.key, row.value, row.updated_at);
  }
  const token = db.prepare("SELECT key, value, updated_at FROM source.app_secrets WHERE key = 'discord_bot_token'").get();
  if (token && String(token.value).trim()) {
    db.prepare(`
      INSERT INTO app_secrets (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(token.key, token.value, token.updated_at);
  }
}

function applyCraftPlans(db) {
  const statement = db.prepare(`
    INSERT INTO craft_plan_settings (plan_key, config_json, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(plan_key) DO UPDATE SET
      config_json = excluded.config_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  for (const row of db.prepare("SELECT * FROM source.craft_plan_settings ORDER BY plan_key").iterate()) {
    statement.run(row.plan_key, row.config_json, row.created_at, row.updated_at);
  }
}

function applyMarketWatches(db, manifest) {
  const sourceRows = rowMap(db, "source", "market_deal_watches");
  for (const mapping of manifest.watchMappings) {
    const row = sourceRows.get(mapping.sourceId);
    if (!row) throw new Error(`Source market watch mapping ${mapping.sourceId} disappeared`);
    const mapped = { ...row, id: mapping.targetId, user_id: mapping.targetUserId };
    if (mapping.action === "update") updateRow(db, "market_deal_watches", "id", mapping.targetId, mapped, ["user_id", ...WATCH_FIELDS]);
    else insertRow(db, "market_deal_watches", mapped, REQUIRED_COLUMNS.market_deal_watches);
  }
}

function applyScheduledJobs(db) {
  db.exec(`
    UPDATE scheduled_jobs
    SET
      schedule = (SELECT source.schedule FROM source.scheduled_jobs AS source WHERE source.job_key = scheduled_jobs.job_key),
      enabled = (SELECT source.enabled FROM source.scheduled_jobs AS source WHERE source.job_key = scheduled_jobs.job_key),
      metadata_json = (SELECT source.metadata_json FROM source.scheduled_jobs AS source WHERE source.job_key = scheduled_jobs.job_key),
      updated_at = (SELECT source.updated_at FROM source.scheduled_jobs AS source WHERE source.job_key = scheduled_jobs.job_key),
      last_run_at = NULL,
      last_success_at = NULL,
      last_error = NULL,
      next_run_at = NULL,
      running = 0
    WHERE job_key IN (SELECT job_key FROM source.scheduled_jobs)
  `);
}

function replaceDiscordState(db) {
  db.exec("DELETE FROM discord_youtube_videos");
  db.exec("DELETE FROM discord_youtube_channels");
  for (const table of REPLACED_DISCORD_TABLES.filter((table) => !["discord_youtube_videos", "discord_youtube_channels"].includes(table))) {
    db.exec(`DELETE FROM ${quoteIdentifier(table)}`);
  }
  for (const table of REPLACED_DISCORD_TABLES) {
    for (const row of db.prepare(`SELECT * FROM source.${quoteIdentifier(table)} ORDER BY rowid`).iterate()) {
      insertRow(db, table, row, REQUIRED_COLUMNS[table]);
    }
  }
}

function applyAdminAudit(db, manifest) {
  const sourceRows = rowMap(db, "source", "admin_audit_log");
  for (const mapping of manifest.adminAuditMappings.filter((entry) => entry.action === "append")) {
    const row = sourceRows.get(mapping.sourceId);
    if (!row) throw new Error(`Source admin audit mapping ${mapping.sourceId} disappeared`);
    insertRow(db, "admin_audit_log", {
      ...row,
      id: mapping.targetId,
      user_id: mapping.mappedAdminId,
    }, REQUIRED_COLUMNS.admin_audit_log);
  }
}

function stageBranding(manifest) {
  if (!manifest.branding.source.settingPresent) return null;
  const sourceDirectory = guardedExistingPath(manifest.branding.source.path, "directory", "Manifest source branding directory");
  const targetDirectory = guardedExistingPath(manifest.branding.target.path, "directory", "Manifest target branding directory");
  const targetParent = path.dirname(targetDirectory);
  const stageDirectory = mkdtempSync(path.join(targetParent, ".canonical-cutover-branding-stage-"));
  chmodSync(stageDirectory, statSync(targetDirectory).mode);
  try {
    for (const asset of Object.values(manifest.branding.source.assets)) {
      const sourcePath = guardedExistingPath(path.join(sourceDirectory, asset.fileName), "file", "Manifest source branding asset");
      const stagePath = path.join(stageDirectory, asset.fileName);
      copyFileSync(sourcePath, stagePath);
      const bytes = readFileSync(stagePath);
      if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256) throw new Error("Branding source changed while staging");
    }
    return { stageDirectory, targetDirectory };
  } catch (error) {
    rmSync(stageDirectory, { recursive: true, force: true });
    throw error;
  }
}

function installStagedBranding({ stageDirectory, targetDirectory }) {
  const backupDirectory = `${targetDirectory}.canonical-cutover-backup-${process.pid}`;
  if (existsSync(backupDirectory)) throw new Error("A canonical cutover branding backup already exists");
  renameSync(targetDirectory, backupDirectory);
  try {
    renameSync(stageDirectory, targetDirectory);
    rmSync(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    if (!existsSync(targetDirectory) && existsSync(backupDirectory)) renameSync(backupDirectory, targetDirectory);
    throw error;
  }
}

function assertManifestIntegrity(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Manifest must contain a JSON object");
  if (manifest.formatVersion !== CANONICAL_CUTOVER_MANIFEST_VERSION) throw new Error("Unsupported canonical cutover manifest format");
  const { selectionHash, ...unsigned } = manifest;
  if (!/^[a-f0-9]{64}$/.test(String(selectionHash ?? "")) || sha256(canonicalJson(unsigned)) !== selectionHash) {
    throw new Error("Manifest selection hash is invalid");
  }
}

function assertCleanIntegrity(db) {
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length) throw new Error(`SQLite foreign_key_check failed with ${foreignKeys.length} row(s)`);
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    throw new Error(`SQLite integrity_check failed with ${integrity.length} result row(s)`);
  }
}

function assertProtectedTablesUnchanged(db, manifest) {
  for (const [table, counts] of Object.entries(manifest.tableCounts)) {
    if (!counts.excluded || !manifest.target.database.tables[table]) continue;
    const expected = manifest.target.database.tables[table];
    const actualCount = tableCount(db, table);
    const actualHash = tableContentFingerprint(db, table);
    if (actualCount !== expected.count || actualHash !== expected.contentSha256) {
      throw new Error(`Protected table ${table} changed during canonical cutover apply`);
    }
  }
}

function writeAppliedMarker(markerPath, manifest) {
  const temporaryPath = `${markerPath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify({
    applied: true,
    formatVersion: manifest.formatVersion,
    selectionHash: manifest.selectionHash,
  }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  try {
    renameSync(temporaryPath, markerPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function readCanonicalCutoverManifest(manifestPath) {
  const resolved = guardedExistingPath(manifestPath, "file", "Manifest");
  const parsed = parseJson(readFileSync(resolved, "utf8"), "Manifest");
  assertManifestIntegrity(parsed);
  return { manifest: parsed, manifestPath: resolved };
}

export function applyCanonicalCutoverManifest({ manifest, manifestPath }) {
  assertManifestIntegrity(manifest);
  const resolvedManifestPath = guardedExistingPath(manifestPath, "file", "Manifest");
  const markerPath = `${resolvedManifestPath}.applied`;
  if (existsSync(markerPath)) throw new Error("Canonical cutover manifest was already applied");
  const targetPath = guardedExistingPath(manifest.target?.database?.path, "file", "Manifest target database");
  const sourcePath = guardedExistingPath(manifest.source?.database?.path, "file", "Manifest source database");
  let stagedBranding = null;
  const db = new DatabaseSync(targetPath, { timeout: 5_000 });
  let transactionOpen = false;
  try {
    db.exec("PRAGMA foreign_keys = ON");
    if (Number(db.prepare("PRAGMA foreign_keys").get().foreign_keys) !== 1) throw new Error("SQLite foreign keys could not be enabled");
    const sourceUri = `${pathToFileURL(sourcePath).href}?mode=ro`;
    db.prepare("ATTACH DATABASE ? AS source").run(sourceUri);
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    const recomputed = createCanonicalCutoverManifest({
      claimId: manifest.claimId,
      sourceDatabasePath: sourcePath,
      targetDatabasePath: targetPath,
      sourceBrandingDirectory: manifest.branding?.source?.path,
      targetBrandingDirectory: manifest.branding?.target?.path,
    });
    if (canonicalJson(recomputed) !== canonicalJson(manifest)) {
      throw new Error("Canonical cutover inputs changed since dry-run; refusing apply");
    }
    stagedBranding = stageBranding(manifest);
    db.exec("DELETE FROM user_sessions; DELETE FROM admin_sessions;");
    applyAccounts(db, manifest);
    applyAdmins(db, manifest);
    applySettingsAndSecrets(db);
    applyCraftPlans(db);
    applyMarketWatches(db, manifest);
    applyScheduledJobs(db);
    replaceDiscordState(db);
    applyAdminAudit(db, manifest);
    assertProtectedTablesUnchanged(db, manifest);
    assertCleanIntegrity(db);
    db.exec("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try { db.exec("ROLLBACK"); } catch {}
    }
    if (stagedBranding?.stageDirectory) rmSync(stagedBranding.stageDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    db.close();
  }
  if (stagedBranding) installStagedBranding(stagedBranding);
  writeAppliedMarker(markerPath, manifest);
  return {
    claimId: manifest.claimId,
    integrity: "ok",
    selectionHash: manifest.selectionHash,
  };
}
