export const additiveColumnMigrations = [
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
  { table: "game_catalog_entities", column: "item_list_id", definition: "TEXT" },
  { table: "game_catalog_recipes", column: "resource_id", definition: "TEXT" },
  { table: "game_catalog_recipe_outputs", column: "occurrence_rate", definition: "REAL NOT NULL DEFAULT 1" },
  { table: "game_catalog_recipe_outputs", column: "yield_basis", definition: "TEXT NOT NULL DEFAULT 'per_craft' CHECK (yield_basis IN ('per_craft', 'per_progress'))" },
  { table: "game_catalog_item_list_possibility_outputs", column: "nested_item_list_id", definition: "TEXT" },
];

export const schemaIndexStatements = [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_source ON activity_events (claim_id, event_type, source_key) WHERE source_key IS NOT NULL;",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_market_events_source ON market_events (claim_id, source_key) WHERE source_key IS NOT NULL;",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_discord_id ON admin_users (discord_id) WHERE discord_id IS NOT NULL AND discord_id <> '';",
  "CREATE INDEX IF NOT EXISTS idx_game_catalog_entities_item_list ON game_catalog_entities (item_list_id, catalog_key);",
];

export function applySettlementStateMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settlement_state_current (
      claim_id TEXT PRIMARY KEY,
      captured_at TEXT NOT NULL,
      supplies REAL,
      treasury REAL,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    const hasLegacySnapshots = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'snapshots'").get();
    if (hasLegacySnapshots) {
      db.exec(`
        INSERT INTO settlement_state_current (
          claim_id, captured_at, supplies, treasury, members_count,
          buildings_count, market_count, updated_at
        )
        SELECT
          s.claim_id, s.captured_at, s.supplies, s.treasury, s.members_count,
          s.buildings_count, s.market_count, s.captured_at
        FROM snapshots s
        WHERE NOT EXISTS (
          SELECT 1
          FROM snapshots newer
          WHERE newer.claim_id = s.claim_id
            AND (
              newer.captured_at > s.captured_at
              OR (newer.captured_at = s.captured_at AND newer.id > s.id)
            )
        )
        ON CONFLICT(claim_id) DO UPDATE SET
          captured_at = excluded.captured_at,
          supplies = excluded.supplies,
          treasury = excluded.treasury,
          members_count = excluded.members_count,
          buildings_count = excluded.buildings_count,
          market_count = excluded.market_count,
          updated_at = excluded.updated_at;
        DROP TABLE snapshots;
      `);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function applyAdditiveColumnMigrations(db, migrations = additiveColumnMigrations) {
  for (const migration of migrations) {
    const exists = db.prepare(`PRAGMA table_info(${migration.table})`).all().some((row) => row.name === migration.column);
    if (!exists) db.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`);
  }
}

export function applySchemaIndexStatements(db, statements = schemaIndexStatements) {
  for (const statement of statements) db.exec(statement);
}
export function applyLegacySchemaCleanup(db) {
  db.exec("DROP TABLE IF EXISTS current_claim_state;");
}
