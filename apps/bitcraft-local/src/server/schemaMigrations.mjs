export const additiveColumnMigrations = [
  { table: "market_events", column: "owner_entity_id", definition: "TEXT" },
  { table: "market_events", column: "item_id", definition: "TEXT" },
  { table: "market_events", column: "item_type", definition: "TEXT" },
  { table: "market_events", column: "trade_id", definition: "TEXT" },
  { table: "market_events", column: "source_key", definition: "TEXT" },
  { table: "activity_events", column: "source_key", definition: "TEXT" },
  { table: "admin_users", column: "active", definition: "INTEGER NOT NULL DEFAULT 1" },
  { table: "admin_users", column: "last_login_at", definition: "TEXT" },
  { table: "admin_users", column: "role", definition: "TEXT NOT NULL DEFAULT 'owner'" },
  { table: "admin_users", column: "discord_id", definition: "TEXT" },
  { table: "admin_users", column: "discord_username", definition: "TEXT" },
  { table: "admin_users", column: "discord_global_name", definition: "TEXT" },
  { table: "admin_users", column: "discord_avatar", definition: "TEXT" },
  { table: "user_sessions", column: "reauthenticated_at", definition: "TEXT" },
  { table: "user_accounts", column: "inactivity_warning_sent_at", definition: "TEXT" },
  { table: "production_jobs", column: "start_notified", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "domain_payload_current", column: "updated_at", definition: "TEXT" },
  { table: "domain_payload_current", column: "provider", definition: "TEXT NOT NULL DEFAULT 'legacy'" },
  { table: "domain_payload_current", column: "source_key", definition: "TEXT" },
  { table: "domain_payload_current", column: "region_id", definition: "TEXT" },
  { table: "domain_payload_current", column: "database_name", definition: "TEXT" },
  { table: "domain_payload_current", column: "schema_fingerprint", definition: "TEXT" },
  { table: "domain_payload_current", column: "source_observed_at", definition: "TEXT" },
  { table: "domain_payload_current", column: "received_at", definition: "TEXT" },
  { table: "domain_payload_current", column: "freshness", definition: "TEXT NOT NULL DEFAULT 'unavailable'" },
  { table: "domain_payload_current", column: "confidence", definition: "TEXT NOT NULL DEFAULT 'unknown'" },
  { table: "domain_payload_current", column: "generation", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "domain_payload_current", column: "warnings_json", definition: "TEXT NOT NULL DEFAULT '[]'" },
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
      supplies TEXT,
      treasury TEXT,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    const checkpointColumns = db.prepare("PRAGMA table_info(settlement_state_current)").all();
    const checkpointTypes = new Map(checkpointColumns.map((column) => [
      String(column.name),
      String(column.type ?? "").toUpperCase(),
    ]));
    if (checkpointTypes.get("supplies") !== "TEXT" || checkpointTypes.get("treasury") !== "TEXT") {
      db.exec(`
        ALTER TABLE settlement_state_current RENAME TO settlement_state_current_legacy_amounts;
        CREATE TABLE settlement_state_current (
          claim_id TEXT PRIMARY KEY,
          captured_at TEXT NOT NULL,
          supplies TEXT,
          treasury TEXT,
          members_count INTEGER,
          buildings_count INTEGER,
          market_count INTEGER,
          updated_at TEXT NOT NULL
        );
        INSERT INTO settlement_state_current (
          claim_id, captured_at, supplies, treasury, members_count,
          buildings_count, market_count, updated_at
        )
        SELECT
          claim_id,
          captured_at,
          CASE
            WHEN supplies IS NULL THEN NULL
            WHEN supplies BETWEEN -9007199254740991 AND 9007199254740991
              AND supplies = CAST(supplies AS INTEGER)
              THEN CAST(CAST(supplies AS INTEGER) AS TEXT)
            ELSE NULL
          END,
          CASE
            WHEN treasury IS NULL THEN NULL
            WHEN treasury BETWEEN -9007199254740991 AND 9007199254740991
              AND treasury = CAST(treasury AS INTEGER)
              THEN CAST(CAST(treasury AS INTEGER) AS TEXT)
            ELSE NULL
          END,
          members_count,
          buildings_count,
          market_count,
          updated_at
        FROM settlement_state_current_legacy_amounts;
        DROP TABLE settlement_state_current_legacy_amounts;
      `);
    }
    const hasLegacySnapshots = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'snapshots'").get();
    if (hasLegacySnapshots) {
      db.exec(`
        INSERT INTO settlement_state_current (
          claim_id, captured_at, supplies, treasury, members_count,
          buildings_count, market_count, updated_at
        )
        SELECT
          s.claim_id,
          s.captured_at,
          CASE
            WHEN s.supplies IS NULL THEN NULL
            WHEN s.supplies BETWEEN -9007199254740991 AND 9007199254740991
              AND s.supplies = CAST(s.supplies AS INTEGER)
              THEN CAST(CAST(s.supplies AS INTEGER) AS TEXT)
            ELSE NULL
          END,
          CASE
            WHEN s.treasury IS NULL THEN NULL
            WHEN s.treasury BETWEEN -9007199254740991 AND 9007199254740991
              AND s.treasury = CAST(s.treasury AS INTEGER)
              THEN CAST(CAST(s.treasury AS INTEGER) AS TEXT)
            ELSE NULL
          END,
          s.members_count,
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
  db.exec(`
    DROP TABLE IF EXISTS current_claim_state;
    DROP TABLE IF EXISTS recipe_catalog_entries;
    DROP TABLE IF EXISTS game_catalog_refresh_targets;
    DROP TABLE IF EXISTS game_catalog_refresh_runs;
    DROP TABLE IF EXISTS market_listings;
    DROP TABLE IF EXISTS market_buy_orders_current;
    DROP TABLE IF EXISTS market_regional_sale_averages_current;
    DROP TABLE IF EXISTS global_market_price_snapshots;
    DROP TABLE IF EXISTS empire_hexite_targets;
    DROP TABLE IF EXISTS empire_hexite_snapshots;
    DROP TABLE IF EXISTS empire_hexite_sweep_empires;
    DROP TABLE IF EXISTS empire_hexite_sources;
    DROP TABLE IF EXISTS empire_hexite_sweeps;
    DELETE FROM scheduled_jobs WHERE job_key = 'recipe_catalog_refresh';
    DELETE FROM scheduled_jobs WHERE job_key = 'global_market_insights';
    DELETE FROM scheduled_jobs WHERE job_key = 'empire_hexite_reserves_refresh';
    DELETE FROM app_settings WHERE key = 'global_market_overview_json';
    DELETE FROM domain_payload_current WHERE domain = 'layout';
    DELETE FROM domain_payload_current
      WHERE domain IN ('regionStatus', 'tradeVolume')
         OR (domain = 'region' AND json_type(data_json, '$.claims') = 'array');
  `);
}
