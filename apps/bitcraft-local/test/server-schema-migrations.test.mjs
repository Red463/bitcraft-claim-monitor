import assert from "node:assert/strict";
import test from "node:test";

import {
  additiveColumnMigrations,
  applyAdditiveColumnMigrations,
  applyLegacySchemaCleanup,
  applySchemaIndexStatements,
  schemaIndexStatements,
} from "../src/server/schemaMigrations.mjs";

test("additiveColumnMigrations preserves bootstrap column migration order", () => {
  assert.deepEqual(additiveColumnMigrations, [
    { table: "market_listings", column: "owner_entity_id", definition: "TEXT" },
    { table: "market_listings", column: "item_id", definition: "TEXT" },
    { table: "market_listings", column: "item_type", definition: "TEXT" },
    { table: "market_events", column: "owner_entity_id", definition: "TEXT" },
    { table: "market_events", column: "item_id", definition: "TEXT" },
    { table: "market_events", column: "item_type", definition: "TEXT" },
    { table: "market_events", column: "trade_id", definition: "TEXT" },
    { table: "market_events", column: "source_key", definition: "TEXT" },
    { table: "market_buy_orders_current", column: "icon_asset_name", definition: "TEXT" },
    { table: "market_buy_orders_current", column: "active", definition: "INTEGER NOT NULL DEFAULT 1" },
    { table: "market_buy_orders_current", column: "updated_at", definition: "TEXT" },
    { table: "market_regional_sale_averages_current", column: "item_name", definition: "TEXT" },
    { table: "market_regional_sale_averages_current", column: "window_days", definition: "INTEGER NOT NULL DEFAULT 7" },
    { table: "activity_events", column: "source_key", definition: "TEXT" },
    { table: "admin_users", column: "active", definition: "INTEGER NOT NULL DEFAULT 1" },
    { table: "admin_users", column: "last_login_at", definition: "TEXT" },
    { table: "admin_users", column: "role", definition: "TEXT NOT NULL DEFAULT 'owner'" },
    { table: "admin_users", column: "discord_id", definition: "TEXT" },
    { table: "admin_users", column: "discord_username", definition: "TEXT" },
    { table: "admin_users", column: "discord_global_name", definition: "TEXT" },
    { table: "admin_users", column: "discord_avatar", definition: "TEXT" },
    { table: "production_jobs", column: "start_notified", definition: "INTEGER NOT NULL DEFAULT 0" },
    { table: "domain_payload_current", column: "updated_at", definition: "TEXT" },
    { table: "discord_youtube_channels", column: "discord_channel_id", definition: "TEXT" },
  ]);
});

test("schemaIndexStatements preserves release-sensitive unique indexes", () => {
  assert.deepEqual(schemaIndexStatements, [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_source ON activity_events (claim_id, event_type, source_key) WHERE source_key IS NOT NULL;",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_market_events_source ON market_events (claim_id, source_key) WHERE source_key IS NOT NULL;",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_discord_id ON admin_users (discord_id) WHERE discord_id IS NOT NULL AND discord_id <> '';",
    "CREATE INDEX IF NOT EXISTS idx_snapshots_claim_captured ON snapshots (claim_id, captured_at DESC, id DESC);",
    "CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON snapshots (captured_at);",
  ]);
});

test("applyAdditiveColumnMigrations adds only missing columns", () => {
  const existingColumns = new Map([
    ["market_listings", new Set(["owner_entity_id"])],
    ["market_events", new Set()],
  ]);
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(["prepare", sql]);
      const table = sql.match(/PRAGMA table_info\(([^)]+)\)/)?.[1];
      return { all: () => [...(existingColumns.get(table) ?? new Set())].map((name) => ({ name })) };
    },
    exec(sql) {
      calls.push(["exec", sql]);
    },
  };

  applyAdditiveColumnMigrations(db, [
    { table: "market_listings", column: "owner_entity_id", definition: "TEXT" },
    { table: "market_events", column: "source_key", definition: "TEXT" },
  ]);

  assert.deepEqual(calls, [
    ["prepare", "PRAGMA table_info(market_listings)"],
    ["prepare", "PRAGMA table_info(market_events)"],
    ["exec", "ALTER TABLE market_events ADD COLUMN source_key TEXT"],
  ]);
});

test("applySchemaIndexStatements executes each bootstrap index statement", () => {
  const statements = [];
  const db = { exec: (sql) => statements.push(sql) };

  applySchemaIndexStatements(db, ["CREATE INDEX one;", "CREATE INDEX two;"]);

  assert.deepEqual(statements, ["CREATE INDEX one;", "CREATE INDEX two;"]);
});
test("applyLegacySchemaCleanup drops legacy server-owned cache tables", () => {
  const statements = [];
  const db = { exec: (sql) => statements.push(sql) };

  applyLegacySchemaCleanup(db);

  assert.deepEqual(statements, ["DROP TABLE IF EXISTS current_claim_state;"]);
});
