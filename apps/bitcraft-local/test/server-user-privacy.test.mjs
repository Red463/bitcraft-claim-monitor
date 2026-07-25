import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  clearCurrentBrowserAnalytics,
  clearUserMarketData,
  clearUserSettings,
  createUserDataExport,
  unlinkUserCharacter,
} from "../src/server/userPrivacy.mjs";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applySchemaBootstrap(db);
  const now = "2026-07-25T12:00:00.000Z";
  const insertUser = db.prepare(`
    INSERT INTO user_accounts (
      discord_id, discord_username, discord_global_name, discord_avatar,
      character_player_id, character_name, character_status, settings_json,
      created_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
  `);
  const first = insertUser.run("111111111111111111", "FirstUser", "First User", "avatar-one", "12345678", "First Character", JSON.stringify({ density: "compact", apiToken: "must-redact" }), now, now);
  const second = insertUser.run("222222222222222222", "SecondUser", "Second User", "avatar-two", "87654321", "Second Character", "{}", now, now);
  const userId = Number(first.lastInsertRowid);
  const otherUserId = Number(second.lastInsertRowid);
  db.prepare("INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at, reauthenticated_at) VALUES (?, ?, ?, ?, ?)")
    .run("session-token-hash", userId, "2026-08-25T12:00:00.000Z", now, now);
  db.prepare(`
    INSERT INTO user_legal_acceptances (
      user_id, legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source
    ) VALUES (?, '2026-07-25', 'terms', 'privacy', 1, ?, 'existing-session')
  `).run(userId, now);
  const watch = db.prepare(`
    INSERT INTO market_deal_watches (
      user_id, discord_id, claim_id, region_id, item_id, item_type, item_name,
      threshold_percent, enabled, created_at, updated_at
    ) VALUES (?, ?, 'claim', '19', '10', '0', 'Bronze Ingot', 30, 1, ?, ?)
  `).run(userId, "111111111111111111", now, now);
  db.prepare(`
    INSERT INTO market_deal_alerts (
      watch_id, user_id, discord_id, claim_id, region_id, item_id, item_type,
      item_name, listing_key, baseline_window_days, baseline_average,
      discount_percent, dm_status, created_at, raw_json
    ) VALUES (?, ?, ?, 'claim', '19', '10', '0', 'Bronze Ingot', 'listing-one', 30, 10, 25, 'sent', ?, '{}')
  `).run(Number(watch.lastInsertRowid), userId, "111111111111111111", now);
  db.prepare(`
    INSERT INTO market_deal_watches (
      user_id, discord_id, claim_id, region_id, item_id, item_type, item_name,
      threshold_percent, enabled, created_at, updated_at
    ) VALUES (?, ?, 'claim', '19', '20', '0', 'Oak Plank', 30, 1, ?, ?)
  `).run(otherUserId, "222222222222222222", now, now);
  db.prepare("INSERT INTO discord_craft_watches (guild_id, user_id, profession_key, profession_name, mode, updated_at) VALUES ('guild', ?, 'smithing', 'Smithing', 'all', ?)")
    .run("111111111111111111", now);
  db.prepare("INSERT INTO discord_component_votes (message_id, component_key, user_id, kind, updated_at) VALUES ('message', 'yes', ?, 'poll', ?)")
    .run("111111111111111111", now);
  db.prepare("INSERT INTO discord_warnings (guild_id, user_id, moderator, reason, active, created_at) VALUES ('guild', ?, 'Owner', 'Test warning', 1, ?)")
    .run("111111111111111111", now);
  db.prepare("INSERT INTO discord_mod_notes (guild_id, user_id, moderator, note, created_at) VALUES ('guild', ?, 'Owner', 'Test note', ?)")
    .run("111111111111111111", now);
  db.prepare("INSERT INTO discord_mod_cases (guild_id, case_type, user_id, moderator, reason, details_json, occurred_at) VALUES ('guild', 'warning', ?, 'Owner', 'Test case', '{}', ?)")
    .run("111111111111111111", now);
  db.prepare("INSERT INTO discord_temp_bans (guild_id, user_id, unban_at, reason, created_at) VALUES ('guild', ?, '2026-07-26T12:00:00.000Z', 'Test ban', ?)")
    .run("111111111111111111", now);
  db.prepare("INSERT INTO admin_audit_log (user_id, username, action, details_json, occurred_at) VALUES (NULL, 'Owner', 'linked_account.character_assigned', ?, ?)")
    .run(JSON.stringify({ userId, discordId: "111111111111111111", authorization: "must-redact" }), now);
  db.prepare(`
    INSERT INTO discord_delivery_log (
      event_type, status, summary, channel_id, channel_key, reason, error,
      metadata_json, response_json, occurred_at
    ) VALUES ('character_link_assignment_notice', 'sent', 'First Character', 'dm', 'dm', NULL, NULL, ?, ?, ?)
  `).run(JSON.stringify({ discordId: "111111111111111111", cookie: "must-redact" }), JSON.stringify({ id: "message", botToken: "must-redact" }), now);
  db.prepare("INSERT INTO analytics_events (visitor_key, session_key, event_name, page, properties_json, occurred_at) VALUES (?, ?, 'page_view', 'dashboard', '{}', ?)")
    .run("visitor-one", "session-one", now);
  db.prepare("INSERT INTO analytics_events (visitor_key, session_key, event_name, page, properties_json, occurred_at) VALUES (?, ?, 'page_view', 'dashboard', '{}', ?)")
    .run("visitor-two", "session-two", now);
  db.prepare("INSERT INTO visitor_security_events (occurred_at, method, route_group, status_code, status_class, ip_address, ip_anonymized, ip_hash, visitor_key) VALUES (?, 'GET', 'app', 200, '2xx', '203.0.113.10', '203.0.113.0', 'ip-hash', 'visitor-one')")
    .run(now);
  return { db, userId, otherUserId, now };
}

test("user export is scoped, structured, and recursively redacted", () => {
  const { db, userId, now } = fixture();
  const exported = createUserDataExport(db, {
    userId,
    discordId: "111111111111111111",
    visitorKey: "visitor-one",
    sessionKey: "session-one",
    legalVersion: "2026-07-25",
    now: () => new Date(now),
  });
  const text = JSON.stringify(exported);

  assert.equal(exported.exportedAt, now);
  assert.equal(exported.legalVersion, "2026-07-25");
  assert.equal(exported.account.discordId, "111111111111111111");
  assert.equal(exported.characterLink.characterPlayerId, "12345678");
  assert.equal(exported.legalAcceptances.length, 1);
  assert.equal(exported.market.watches.length, 1);
  assert.equal(exported.market.alerts.length, 1);
  assert.equal(exported.discord.craftWatches.length, 1);
  assert.equal(exported.discord.votes.length, 1);
  assert.equal(exported.discord.moderation.length, 4);
  assert.equal(exported.activity.adminActions.length, 1);
  assert.equal(exported.activity.deliveries.length, 1);
  assert.doesNotMatch(text, /222222222222222222|SecondUser|Second Character/);
  assert.doesNotMatch(text, /session-token-hash|203\.0\.113\.10|ip-hash|must-redact/);
  assert.doesNotMatch(text, /apiToken|authorization|botToken|cookie/);
  db.close();
});

test("granular privacy actions affect only the requesting user and are idempotent", () => {
  const { db, userId, otherUserId } = fixture();

  assert.deepEqual(unlinkUserCharacter(db, { userId }), { userAccounts: 1 });
  assert.deepEqual(unlinkUserCharacter(db, { userId }), { userAccounts: 0 });
  const unlinked = db.prepare("SELECT character_player_id, character_name, character_status, settings_json FROM user_accounts WHERE id = ?").get(userId);
  assert.equal(unlinked.character_player_id, "");
  assert.equal(unlinked.character_name, "");
  assert.equal(unlinked.character_status, "unlinked");
  assert.notEqual(unlinked.settings_json, "{}");

  assert.deepEqual(clearUserSettings(db, { userId }), { userAccounts: 1 });
  assert.deepEqual(clearUserSettings(db, { userId }), { userAccounts: 0 });
  assert.equal(db.prepare("SELECT settings_json FROM user_accounts WHERE id = ?").get(userId).settings_json, "{}");

  assert.deepEqual(clearUserMarketData(db, { userId }), { marketDealAlerts: 1, marketDealWatches: 1 });
  assert.deepEqual(clearUserMarketData(db, { userId }), { marketDealAlerts: 0, marketDealWatches: 0 });
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM market_deal_watches WHERE user_id = ?").get(otherUserId).count), 1);

  assert.deepEqual(clearCurrentBrowserAnalytics(db, { visitorKey: "visitor-one", sessionKey: "session-one" }), { analyticsEvents: 1 });
  assert.deepEqual(clearCurrentBrowserAnalytics(db, { visitorKey: "visitor-one", sessionKey: "session-one" }), { analyticsEvents: 0 });
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE visitor_key = 'visitor-two'").get().count), 1);
  db.close();
});
