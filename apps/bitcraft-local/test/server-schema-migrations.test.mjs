import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
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
    { table: "game_catalog_item_list_outputs", column: "guaranteed_quantity", definition: "REAL NOT NULL DEFAULT 0" },
    { table: "game_catalog_recipes", column: "action_count", definition: "REAL NOT NULL DEFAULT 0" },
    { table: "game_catalog_recipes", column: "activity_kind", definition: "TEXT NOT NULL DEFAULT 'craft' CHECK (activity_kind IN ('craft', 'gathering'))" },
    { table: "game_catalog_recipes", column: "gathering_mode", definition: "TEXT NOT NULL DEFAULT 'ordinary' CHECK (gathering_mode IN ('ordinary', 'prospecting'))" },
    { table: "game_catalog_entities", column: "item_list_id", definition: "TEXT" },
    { table: "game_catalog_recipes", column: "resource_id", definition: "TEXT" },
    { table: "game_catalog_recipe_outputs", column: "occurrence_rate", definition: "REAL NOT NULL DEFAULT 1" },
    { table: "game_catalog_recipe_outputs", column: "yield_basis", definition: "TEXT NOT NULL DEFAULT 'per_craft' CHECK (yield_basis IN ('per_craft', 'per_progress'))" },
    { table: "game_catalog_recipe_outputs", column: "guaranteed_quantity", definition: "REAL" },
    { table: "game_catalog_item_list_possibility_outputs", column: "nested_item_list_id", definition: "TEXT" },
  ]);
});

test("guaranteed item-list quantity migrates an existing catalog additively", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE game_catalog_item_list_outputs (
      producer_key TEXT NOT NULL,
      output_key TEXT NOT NULL,
      quantity REAL NOT NULL,
      chance REAL,
      PRIMARY KEY (producer_key, output_key)
    );
    INSERT INTO game_catalog_item_list_outputs (producer_key, output_key, quantity, chance)
    VALUES ('items:products', 'items:oil', 3.05, 1);
  `);

  applyAdditiveColumnMigrations(db, [{
    table: "game_catalog_item_list_outputs",
    column: "guaranteed_quantity",
    definition: "REAL NOT NULL DEFAULT 0",
  }]);

  assert.deepEqual(
    { ...db.prepare("SELECT quantity, guaranteed_quantity FROM game_catalog_item_list_outputs").get() },
    { quantity: 3.05, guaranteed_quantity: 0 },
  );
  db.close();
});

test("probability catalogue columns migrate existing recipe and item-list rows without data loss", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE game_catalog_entities (catalog_key TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE game_catalog_recipes (recipe_key TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE game_catalog_recipe_outputs (
      recipe_key TEXT NOT NULL,
      output_key TEXT NOT NULL,
      quantity REAL NOT NULL,
      PRIMARY KEY (recipe_key, output_key)
    );
    CREATE TABLE game_catalog_item_list_possibility_outputs (
      item_list_id TEXT NOT NULL,
      possibility_index INTEGER NOT NULL,
      output_index INTEGER NOT NULL,
      output_key TEXT NOT NULL,
      PRIMARY KEY (item_list_id, possibility_index, output_index)
    );
    INSERT INTO game_catalog_entities VALUES ('items:1', 'Existing Item');
    INSERT INTO game_catalog_recipes VALUES ('recipe:1', 'Existing Recipe');
    INSERT INTO game_catalog_recipe_outputs VALUES ('recipe:1', 'items:1', 2);
    INSERT INTO game_catalog_item_list_possibility_outputs VALUES ('10', 0, 0, 'items:1');
  `);

  applyAdditiveColumnMigrations(db, [
    { table: "game_catalog_entities", column: "item_list_id", definition: "TEXT" },
    { table: "game_catalog_recipes", column: "resource_id", definition: "TEXT" },
    { table: "game_catalog_recipes", column: "gathering_mode", definition: "TEXT NOT NULL DEFAULT 'ordinary' CHECK (gathering_mode IN ('ordinary', 'prospecting'))" },
    { table: "game_catalog_recipe_outputs", column: "occurrence_rate", definition: "REAL NOT NULL DEFAULT 1" },
    { table: "game_catalog_recipe_outputs", column: "yield_basis", definition: "TEXT NOT NULL DEFAULT 'per_craft' CHECK (yield_basis IN ('per_craft', 'per_progress'))" },
    { table: "game_catalog_recipe_outputs", column: "guaranteed_quantity", definition: "REAL" },
    { table: "game_catalog_item_list_possibility_outputs", column: "nested_item_list_id", definition: "TEXT" },
  ]);

  assert.deepEqual(
    { ...db.prepare("SELECT output_key, quantity, occurrence_rate, yield_basis, guaranteed_quantity FROM game_catalog_recipe_outputs").get() },
    { output_key: "items:1", quantity: 2, occurrence_rate: 1, yield_basis: "per_craft", guaranteed_quantity: null },
  );
  assert.equal(db.prepare("SELECT gathering_mode FROM game_catalog_recipes").get().gathering_mode, "ordinary");
  assert.equal(db.prepare("SELECT name FROM game_catalog_entities WHERE catalog_key = 'items:1'").get().name, "Existing Item");
  assert.equal(db.prepare("SELECT output_key FROM game_catalog_item_list_possibility_outputs").get().output_key, "items:1");
  db.close();
});

test("schemaIndexStatements preserves release-sensitive unique indexes", () => {
  assert.deepEqual(schemaIndexStatements, [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_source ON activity_events (claim_id, event_type, source_key) WHERE source_key IS NOT NULL;",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_market_events_source ON market_events (claim_id, source_key) WHERE source_key IS NOT NULL;",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_discord_id ON admin_users (discord_id) WHERE discord_id IS NOT NULL AND discord_id <> '';",
    "CREATE INDEX IF NOT EXISTS idx_game_catalog_entities_item_list ON game_catalog_entities (item_list_id, catalog_key);",
  ]);
});

test("recipe action count migrates without inventing effort for old rows", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE game_catalog_recipes (
      recipe_key TEXT PRIMARY KEY,
      name TEXT
    );
    INSERT INTO game_catalog_recipes (recipe_key, name) VALUES ('recipe:old', 'Old recipe');
  `);

  applyAdditiveColumnMigrations(db, [{
    table: "game_catalog_recipes",
    column: "action_count",
    definition: "REAL NOT NULL DEFAULT 0",
  }]);

  assert.deepEqual(
    { ...db.prepare("SELECT recipe_key, action_count FROM game_catalog_recipes").get() },
    { recipe_key: "recipe:old", action_count: 0 },
  );
  db.close();
});

test("recipe activity kind migrates old catalog rows safely as crafts", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE game_catalog_recipes (
      recipe_key TEXT PRIMARY KEY,
      name TEXT
    );
    INSERT INTO game_catalog_recipes (recipe_key, name) VALUES ('recipe:old', 'Split a trunk');
  `);

  applyAdditiveColumnMigrations(db, [{
    table: "game_catalog_recipes",
    column: "activity_kind",
    definition: "TEXT NOT NULL DEFAULT 'craft' CHECK (activity_kind IN ('craft', 'gathering'))",
  }]);

  assert.deepEqual(
    { ...db.prepare("SELECT recipe_key, activity_kind FROM game_catalog_recipes").get() },
    { recipe_key: "recipe:old", activity_kind: "craft" },
  );
  db.close();
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
