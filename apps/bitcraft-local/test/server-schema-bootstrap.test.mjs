import assert from "node:assert/strict";
import test from "node:test";

import { applySchemaBootstrap, schemaBootstrapSql } from "../src/server/schemaBootstrap.mjs";

test("schemaBootstrapSql preserves critical release tables and indexes", () => {
  for (const fragment of [
    "CREATE TABLE IF NOT EXISTS settlement_state_current",
    "CREATE TABLE IF NOT EXISTS app_settings",
    "CREATE TABLE IF NOT EXISTS admin_users",
    "CREATE TABLE IF NOT EXISTS user_accounts",
    "CREATE TABLE IF NOT EXISTS market_deal_alerts",
    "CREATE TABLE IF NOT EXISTS craft_plan_settings",
    "CREATE TABLE IF NOT EXISTS production_jobs",
    "CREATE TABLE IF NOT EXISTS discord_delivery_log",
    "CREATE TABLE IF NOT EXISTS discord_notification_outbox",
    "CREATE TABLE IF NOT EXISTS discord_craft_plan_report_occurrences",
    "CREATE TABLE IF NOT EXISTS discord_youtube_channels",
    "discord_channel_id TEXT",
    "CREATE TABLE IF NOT EXISTS discord_youtube_videos",
    "CREATE TABLE IF NOT EXISTS empire_hexite_sweeps",
    "CREATE TABLE IF NOT EXISTS empire_hexite_sweep_empires",
    "CREATE TABLE IF NOT EXISTS empire_hexite_targets",
    "CREATE TABLE IF NOT EXISTS empire_hexite_sources",
    "CREATE TABLE IF NOT EXISTS empire_hexite_snapshots",
    "CREATE INDEX IF NOT EXISTS idx_market_events_claim_time",
    "CREATE INDEX IF NOT EXISTS idx_activity_claim_time",
    "CREATE INDEX IF NOT EXISTS idx_discord_notification_outbox_status",
    "CREATE INDEX IF NOT EXISTS idx_discord_craft_plan_report_occurrences_time",
    "CREATE INDEX IF NOT EXISTS idx_domain_payload_claim",
    "CREATE INDEX IF NOT EXISTS idx_craft_plan_settings_updated",
  ]) {
    assert.match(schemaBootstrapSql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(schemaBootstrapSql, /CREATE TABLE IF NOT EXISTS snapshots/);
  assert.doesNotMatch(schemaBootstrapSql, /idx_snapshots_/);
});

test("applySchemaBootstrap executes the complete bootstrap SQL once", () => {
  const statements = [];
  const db = { exec: (sql) => statements.push(sql) };

  applySchemaBootstrap(db);

  assert.deepEqual(statements, [schemaBootstrapSql]);
});
