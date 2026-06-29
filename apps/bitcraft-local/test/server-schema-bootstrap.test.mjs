import assert from "node:assert/strict";
import test from "node:test";

import { applySchemaBootstrap, schemaBootstrapSql } from "../src/server/schemaBootstrap.mjs";

test("schemaBootstrapSql preserves critical release tables and indexes", () => {
  for (const fragment of [
    "CREATE TABLE IF NOT EXISTS snapshots",
    "CREATE TABLE IF NOT EXISTS app_settings",
    "CREATE TABLE IF NOT EXISTS admin_users",
    "CREATE TABLE IF NOT EXISTS user_accounts",
    "CREATE TABLE IF NOT EXISTS market_deal_alerts",
    "CREATE TABLE IF NOT EXISTS production_jobs",
    "CREATE TABLE IF NOT EXISTS discord_delivery_log",
    "CREATE INDEX IF NOT EXISTS idx_market_events_claim_time",
    "CREATE INDEX IF NOT EXISTS idx_activity_claim_time",
    "CREATE INDEX IF NOT EXISTS idx_domain_payload_claim",
  ]) {
    assert.match(schemaBootstrapSql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("applySchemaBootstrap executes the complete bootstrap SQL once", () => {
  const statements = [];
  const db = { exec: (sql) => statements.push(sql) };

  applySchemaBootstrap(db);

  assert.deepEqual(statements, [schemaBootstrapSql]);
});