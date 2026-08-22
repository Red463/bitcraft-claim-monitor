import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { addDecimal } from "./game-data/exactDecimal.ts";

const DAY_MS = 86_400_000;
const MAX_BATCH_SIZE = 5_000;
const ENABLE_CONFIRMATION = "ENABLE OPERATIONAL HISTORY RETENTION";

const operationalHistoryMarketTradeTriggerSql = `
  CREATE TRIGGER operational_history_market_trade_ingestion_id
  AFTER INSERT ON market_trades
  BEGIN
    INSERT OR IGNORE INTO operational_history_source_ingestion_ids (source_table, source_key)
    VALUES ('market_trades', NEW.trade_id);
    INSERT INTO operational_history_source_mutations (
      source_table, source_key, ingestion_id, claim_id, utc_day, operation
    )
    SELECT 'market_trades', NEW.trade_id, ingestion_id, NEW.claim_id,
      substr(NEW.occurred_at, 1, 10), 'insert'
    FROM operational_history_source_ingestion_ids
    WHERE source_table = 'market_trades' AND source_key = NEW.trade_id;
  END;
  CREATE TRIGGER operational_history_market_trade_update
  AFTER UPDATE ON market_trades
  BEGIN
    INSERT INTO operational_history_source_mutations (
      source_table, source_key, ingestion_id, claim_id, utc_day, operation
    ) VALUES (
      'market_trades', OLD.trade_id,
      (SELECT ingestion_id FROM operational_history_source_ingestion_ids
        WHERE source_table = 'market_trades' AND source_key = OLD.trade_id),
      OLD.claim_id, substr(OLD.occurred_at, 1, 10), 'update'
    );
    INSERT OR IGNORE INTO operational_history_source_ingestion_ids (source_table, source_key)
    VALUES ('market_trades', NEW.trade_id);
    INSERT INTO operational_history_source_mutations (
      source_table, source_key, ingestion_id, claim_id, utc_day, operation
    )
    SELECT 'market_trades', NEW.trade_id, ingestion_id, NEW.claim_id,
      substr(NEW.occurred_at, 1, 10), 'update'
    FROM operational_history_source_ingestion_ids
    WHERE source_table = 'market_trades' AND source_key = NEW.trade_id;
  END;
  CREATE TRIGGER operational_history_market_trade_delete
  AFTER DELETE ON market_trades
  BEGIN
    INSERT INTO operational_history_source_mutations (
      source_table, source_key, ingestion_id, claim_id, utc_day, operation
    ) VALUES (
      'market_trades', OLD.trade_id,
      (SELECT ingestion_id FROM operational_history_source_ingestion_ids
        WHERE source_table = 'market_trades' AND source_key = OLD.trade_id),
      OLD.claim_id, substr(OLD.occurred_at, 1, 10), 'delete'
    );
  END;
`;

export const OPERATIONAL_HISTORY_RETENTION_DEFAULTS = Object.freeze({
  enabled: false,
  days: 365,
  tables: Object.freeze([]),
});

export const OPERATIONAL_HISTORY_TABLES = Object.freeze([
  "market_events",
  "market_trades",
  "activity_events",
  "production_contribution_events",
]);

// This is intentionally empty. A table may be added only in a later, separately
// reviewed change that records the product owner's approval and rollout evidence.
export const APPROVED_OPERATIONAL_HISTORY_RETENTION_TABLES = Object.freeze([]);

const ROLLUP_SOURCE_TABLES = new Set(["market_events", "market_trades", "activity_events"]);
const PRUNE_IDENTIFIERS = Object.freeze({
  market_events: "id",
  market_trades: "trade_id",
  activity_events: "id",
});

export const operationalHistoryRetentionSchemaSql = `
  CREATE TABLE IF NOT EXISTS operational_history_market_trade_daily (
    claim_id TEXT NOT NULL,
    utc_day TEXT NOT NULL,
    region_id TEXT NOT NULL DEFAULT '',
    item_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    sales_count INTEGER NOT NULL,
    quantity TEXT NOT NULL,
    total_value TEXT NOT NULL,
    oldest_occurred_at TEXT NOT NULL,
    newest_occurred_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, utc_day, region_id, item_id, item_type)
  );
  CREATE TABLE IF NOT EXISTS operational_history_market_event_daily (
    claim_id TEXT NOT NULL,
    utc_day TEXT NOT NULL,
    event_type TEXT NOT NULL,
    item_id TEXT NOT NULL DEFAULT '',
    item_type TEXT NOT NULL DEFAULT '',
    event_count INTEGER NOT NULL,
    quantity TEXT NOT NULL,
    total_value TEXT NOT NULL,
    oldest_occurred_at TEXT NOT NULL,
    newest_occurred_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, utc_day, event_type, item_id, item_type)
  );
  CREATE TABLE IF NOT EXISTS operational_history_activity_daily (
    claim_id TEXT NOT NULL,
    utc_day TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_count INTEGER NOT NULL,
    oldest_occurred_at TEXT NOT NULL,
    newest_occurred_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, utc_day, event_type)
  );
  CREATE TABLE IF NOT EXISTS operational_history_source_ingestion_ids (
    ingestion_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL,
    source_key TEXT NOT NULL,
    UNIQUE (source_table, source_key)
  );
  CREATE TABLE IF NOT EXISTS operational_history_source_mutations (
    mutation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL,
    source_key TEXT NOT NULL,
    ingestion_id INTEGER,
    claim_id TEXT NOT NULL,
    utc_day TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete'))
  );
  CREATE INDEX IF NOT EXISTS idx_operational_history_source_mutations_coverage
    ON operational_history_source_mutations (source_table, claim_id, utc_day, mutation_id, ingestion_id);
  ${operationalHistoryMarketTradeTriggerSql.replaceAll("CREATE TRIGGER ", "CREATE TRIGGER IF NOT EXISTS ")}
  CREATE TABLE IF NOT EXISTS operational_history_rollup_watermarks (
    source_table TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    utc_day TEXT NOT NULL,
    completion_state TEXT NOT NULL CHECK (completion_state IN ('complete', 'failed')),
    source_row_count INTEGER NOT NULL,
    source_max_key TEXT,
    source_max_occurred_at TEXT,
    source_max_ingestion_id INTEGER,
    source_max_mutation_id INTEGER,
    source_fingerprint TEXT NOT NULL DEFAULT '',
    remaining_source_fingerprint TEXT NOT NULL DEFAULT '',
    pruned_row_count INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    last_error TEXT,
    PRIMARY KEY (source_table, claim_id, utc_day)
  );
  CREATE TABLE IF NOT EXISTS operational_history_retention_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL CHECK (mode IN ('disabled', 'dry-run', 'prune')),
    cutoff TEXT NOT NULL,
    configured_days INTEGER NOT NULL,
    configured_tables_json TEXT NOT NULL,
    eligible_rows INTEGER NOT NULL,
    deleted_rows INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS operational_history_backup_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_name TEXT NOT NULL,
    backup_created_at TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    manifest_sha256 TEXT NOT NULL,
    database_sha256 TEXT NOT NULL,
    backup_path TEXT NOT NULL DEFAULT '',
    manifest_path TEXT NOT NULL DEFAULT '',
    restored_database_sha256 TEXT NOT NULL DEFAULT '',
    restored_manifest_sha256 TEXT NOT NULL DEFAULT '',
    restored_temporary_database INTEGER NOT NULL CHECK (restored_temporary_database IN (0, 1)),
    integrity_check TEXT NOT NULL,
    backup_bytes INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_operational_history_retention_runs_time
    ON operational_history_retention_runs (completed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_operational_history_backup_verifications_time
    ON operational_history_backup_verifications (verified_at DESC);
`;

export function applyOperationalHistoryRetentionSchema(db) {
  db.exec(operationalHistoryRetentionSchemaSql);
  const watermarkColumns = new Set(db.prepare("PRAGMA table_info(operational_history_rollup_watermarks)").all().map((column) => column.name));
  if (!watermarkColumns.has("source_max_occurred_at")) {
    db.exec("ALTER TABLE operational_history_rollup_watermarks ADD COLUMN source_max_occurred_at TEXT");
  }
  if (!watermarkColumns.has("source_max_ingestion_id")) {
    db.exec("ALTER TABLE operational_history_rollup_watermarks ADD COLUMN source_max_ingestion_id INTEGER");
  }
  if (!watermarkColumns.has("source_max_mutation_id")) {
    db.exec("ALTER TABLE operational_history_rollup_watermarks ADD COLUMN source_max_mutation_id INTEGER");
  }
  if (!watermarkColumns.has("source_fingerprint")) {
    db.exec("ALTER TABLE operational_history_rollup_watermarks ADD COLUMN source_fingerprint TEXT NOT NULL DEFAULT ''");
  }
  if (!watermarkColumns.has("remaining_source_fingerprint")) {
    db.exec("ALTER TABLE operational_history_rollup_watermarks ADD COLUMN remaining_source_fingerprint TEXT NOT NULL DEFAULT ''");
  }
  const backupColumns = new Set(db.prepare("PRAGMA table_info(operational_history_backup_verifications)").all().map((column) => column.name));
  for (const column of ["backup_path", "manifest_path", "restored_database_sha256", "restored_manifest_sha256"]) {
    if (!backupColumns.has(column)) {
      db.exec(`ALTER TABLE operational_history_backup_verifications ADD COLUMN "${column}" TEXT NOT NULL DEFAULT ''`);
    }
  }
  db.exec(`
    INSERT OR IGNORE INTO operational_history_source_ingestion_ids (source_table, source_key)
    SELECT 'market_trades', trade_id
    FROM market_trades
    ORDER BY rowid
  `);
  db.exec(`
    DROP TRIGGER IF EXISTS operational_history_market_trade_ingestion_id;
    DROP TRIGGER IF EXISTS operational_history_market_trade_update;
    DROP TRIGGER IF EXISTS operational_history_market_trade_delete;
    ${operationalHistoryMarketTradeTriggerSql}
  `);
}

function integerInRange(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new TypeError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

function tableList(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((table) => typeof table !== "string")) {
    throw new TypeError("Operational history retention tables must be an array");
  }
  return [...new Set(value.map((table) => table.trim()).filter(Boolean))];
}

export function normalizeOperationalHistoryRetentionSettings(value = {}, {
  approvedTables = new Set(APPROVED_OPERATIONAL_HISTORY_RETENTION_TABLES),
} = {}) {
  const enabled = value.enabled === true;
  const days = integerInRange(value.days ?? OPERATIONAL_HISTORY_RETENTION_DEFAULTS.days, 90, 3650, "Operational history retention days");
  const tables = tableList(value.tables ?? OPERATIONAL_HISTORY_RETENTION_DEFAULTS.tables);
  for (const table of tables) {
    if (!Object.hasOwn(PRUNE_IDENTIFIERS, table) || !approvedTables.has(table)) {
      throw new TypeError(`Operational history table ${table} is not approved for pruning`);
    }
  }
  if (enabled && tables.length === 0) {
    throw new TypeError("Operational history retention cannot be enabled because the approved table allowlist is empty");
  }
  return { enabled, days, tables };
}

function cutoffIso(now, days) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError("Operational history retention now must be a valid date");
  return new Date(timestamp - days * DAY_MS).toISOString();
}

function bytesAt(filePath) {
  try {
    return filePath && existsSync(filePath) ? statSync(filePath).size : 0;
  } catch {
    return 0;
  }
}

function tablePreview(db, table, cutoff) {
  const row = db.prepare(`
    SELECT COUNT(*) AS row_count,
      MIN(occurred_at) AS oldest_occurred_at,
      MAX(occurred_at) AS newest_occurred_at,
      SUM(CASE WHEN occurred_at < ? THEN 1 ELSE 0 END) AS eligible_rows
    FROM "${table}"
  `).get(cutoff);
  return {
    table,
    rowCount: Number(row?.row_count ?? 0),
    eligibleRows: Number(row?.eligible_rows ?? 0),
    oldestOccurredAt: row?.oldest_occurred_at ?? null,
    newestOccurredAt: row?.newest_occurred_at ?? null,
  };
}

function latestRun(db, mode) {
  return db.prepare(`
    SELECT mode, cutoff, configured_days, configured_tables_json, eligible_rows,
      deleted_rows, duration_ms, started_at, completed_at
    FROM operational_history_retention_runs
    WHERE mode = ?
    ORDER BY completed_at DESC, id DESC
    LIMIT 1
  `).get(mode) ?? null;
}

export function latestOperationalHistoryBackupVerification(db) {
  const row = db.prepare(`
    SELECT backup_name, backup_created_at, verified_at, manifest_sha256,
      database_sha256, backup_path, manifest_path, restored_database_sha256,
      restored_manifest_sha256, restored_temporary_database, integrity_check, backup_bytes
    FROM operational_history_backup_verifications
    ORDER BY verified_at DESC, id DESC
    LIMIT 1
  `).get();
  return row ? {
    backupName: row.backup_name,
    backupCreatedAt: row.backup_created_at,
    verifiedAt: row.verified_at,
    manifestSha256: row.manifest_sha256,
    databaseSha256: row.database_sha256,
    backupPath: row.backup_path,
    manifestPath: row.manifest_path,
    restoredDatabaseSha256: row.restored_database_sha256,
    restoredManifestSha256: row.restored_manifest_sha256,
    restoredTemporaryDatabase: Boolean(row.restored_temporary_database),
    integrityCheck: row.integrity_check,
    backupBytes: Number(row.backup_bytes),
  } : null;
}

export function operationalHistoryRetentionPreview(db, {
  now = new Date(),
  days = OPERATIONAL_HISTORY_RETENTION_DEFAULTS.days,
  enabled = OPERATIONAL_HISTORY_RETENTION_DEFAULTS.enabled,
  tables = OPERATIONAL_HISTORY_RETENTION_DEFAULTS.tables,
  databasePath = "",
} = {}) {
  const configuredDays = integerInRange(days, 90, 3650, "Operational history retention days");
  const cutoff = cutoffIso(now, configuredDays);
  return {
    enabled: enabled === true,
    configuredDays,
    configuredTables: tableList(tables),
    approvedTables: [...APPROVED_OPERATIONAL_HISTORY_RETENTION_TABLES],
    cutoff,
    tables: OPERATIONAL_HISTORY_TABLES.map((table) => tablePreview(db, table, cutoff)),
    databaseBytes: bytesAt(databasePath),
    walBytes: bytesAt(databasePath ? `${databasePath}-wal` : ""),
    lastDryRun: latestRun(db, "dry-run"),
    lastPrune: latestRun(db, "prune"),
    backupVerification: latestOperationalHistoryBackupVerification(db),
  };
}

function exactAdd(left, right) {
  try {
    return addDecimal(String(left ?? "0"), String(right ?? "0"));
  } catch {
    throw new TypeError("Operational history source contains a non-decimal amount");
  }
}

function updateBounds(group, occurredAt) {
  group.oldestOccurredAt = group.oldestOccurredAt && group.oldestOccurredAt < occurredAt ? group.oldestOccurredAt : occurredAt;
  group.newestOccurredAt = group.newestOccurredAt && group.newestOccurredAt > occurredAt ? group.newestOccurredAt : occurredAt;
}

function buildMarketTradeDay(db, claimId, day) {
  const rows = db.prepare(`
    SELECT trade_id, region_id, item_id, item_type, quantity, total_price, occurred_at
    FROM market_trades
    WHERE claim_id = ? AND substr(occurred_at, 1, 10) = ?
    ORDER BY occurred_at, trade_id
  `).all(claimId, day);
  const groups = new Map();
  for (const row of rows) {
    const key = `${String(row.region_id ?? "")}\0${String(row.item_id ?? "")}\0${String(row.item_type ?? "")}`;
    const group = groups.get(key) ?? { regionId: String(row.region_id ?? ""), itemId: String(row.item_id ?? ""), itemType: String(row.item_type ?? ""), salesCount: 0, quantity: "0", totalValue: "0", oldestOccurredAt: null, newestOccurredAt: null };
    group.salesCount += 1;
    group.quantity = exactAdd(group.quantity, row.quantity);
    group.totalValue = exactAdd(group.totalValue, row.total_price);
    updateBounds(group, String(row.occurred_at));
    groups.set(key, group);
  }
  const insert = db.prepare(`
    INSERT INTO operational_history_market_trade_daily (
      claim_id, utc_day, region_id, item_id, item_type, sales_count, quantity,
      total_value, oldest_occurred_at, newest_occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.prepare("DELETE FROM operational_history_market_trade_daily WHERE claim_id = ? AND utc_day = ?").run(claimId, day);
  for (const group of groups.values()) insert.run(claimId, day, group.regionId, group.itemId, group.itemType, group.salesCount, group.quantity, group.totalValue, group.oldestOccurredAt, group.newestOccurredAt);
  return {
    sourceRowCount: rows.length,
    sourceMaxKey: rows.at(-1)?.trade_id ?? null,
    sourceMaxOccurredAt: rows.at(-1)?.occurred_at ?? null,
  };
}

function buildMarketEventDay(db, claimId, day) {
  const rows = db.prepare(`
    SELECT id, event_type, item_id, item_type, quantity, total_value, occurred_at
    FROM market_events
    WHERE claim_id = ? AND substr(occurred_at, 1, 10) = ?
    ORDER BY id
  `).all(claimId, day);
  const groups = new Map();
  for (const row of rows) {
    const key = `${String(row.event_type)}\0${String(row.item_id ?? "")}\0${String(row.item_type ?? "")}`;
    const group = groups.get(key) ?? { eventType: String(row.event_type), itemId: String(row.item_id ?? ""), itemType: String(row.item_type ?? ""), eventCount: 0, quantity: "0", totalValue: "0", oldestOccurredAt: null, newestOccurredAt: null };
    group.eventCount += 1;
    group.quantity = exactAdd(group.quantity, row.quantity);
    group.totalValue = exactAdd(group.totalValue, row.total_value);
    updateBounds(group, String(row.occurred_at));
    groups.set(key, group);
  }
  const insert = db.prepare(`
    INSERT INTO operational_history_market_event_daily (
      claim_id, utc_day, event_type, item_id, item_type, event_count, quantity,
      total_value, oldest_occurred_at, newest_occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.prepare("DELETE FROM operational_history_market_event_daily WHERE claim_id = ? AND utc_day = ?").run(claimId, day);
  for (const group of groups.values()) insert.run(claimId, day, group.eventType, group.itemId, group.itemType, group.eventCount, group.quantity, group.totalValue, group.oldestOccurredAt, group.newestOccurredAt);
  return {
    sourceRowCount: rows.length,
    sourceMaxKey: rows.at(-1)?.id == null ? null : String(rows.at(-1).id),
    sourceMaxOccurredAt: rows.at(-1)?.occurred_at ?? null,
  };
}

function buildActivityDay(db, claimId, day) {
  const rows = db.prepare(`
    SELECT event_type, COUNT(*) AS event_count, MIN(occurred_at) AS oldest_occurred_at,
      MAX(occurred_at) AS newest_occurred_at
    FROM activity_events
    WHERE claim_id = ? AND substr(occurred_at, 1, 10) = ?
    GROUP BY event_type
    ORDER BY event_type
  `).all(claimId, day);
  const source = db.prepare(`
    SELECT COUNT(*) AS source_row_count, MAX(id) AS source_max_key
    FROM activity_events
    WHERE claim_id = ? AND substr(occurred_at, 1, 10) = ?
  `).get(claimId, day);
  const insert = db.prepare(`
    INSERT INTO operational_history_activity_daily (
      claim_id, utc_day, event_type, event_count, oldest_occurred_at, newest_occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.prepare("DELETE FROM operational_history_activity_daily WHERE claim_id = ? AND utc_day = ?").run(claimId, day);
  for (const row of rows) insert.run(claimId, day, row.event_type, row.event_count, row.oldest_occurred_at, row.newest_occurred_at);
  return {
    sourceRowCount: Number(source?.source_row_count ?? 0),
    sourceMaxKey: source?.source_max_key == null ? null : String(source.source_max_key),
    sourceMaxOccurredAt: db.prepare(`
      SELECT MAX(occurred_at) AS source_max_occurred_at
      FROM activity_events
      WHERE claim_id = ? AND substr(occurred_at, 1, 10) = ?
    `).get(claimId, day)?.source_max_occurred_at ?? null,
  };
}

const BUILD_DAY = Object.freeze({
  market_events: buildMarketEventDay,
  market_trades: buildMarketTradeDay,
  activity_events: buildActivityDay,
});

const SOURCE_FINGERPRINT_COLUMNS = Object.freeze({
  market_events: Object.freeze(["id", "claim_id", "event_type", "item_id", "item_type", "quantity", "total_value", "occurred_at"]),
  market_trades: Object.freeze(["trade_id", "claim_id", "region_id", "item_id", "item_type", "quantity", "unit_price", "total_price", "occurred_at", "imported_at"]),
  activity_events: Object.freeze(["id", "claim_id", "event_type", "occurred_at", "source_key"]),
});

function fingerprintRows(rows, columns) {
  const hash = createHash("sha256");
  for (const row of rows) {
    for (const column of columns) {
      if (row[column] == null) {
        hash.update("-1:");
      } else {
        const value = String(row[column]);
        hash.update(`${Buffer.byteLength(value, "utf8")}:${value}`);
      }
    }
  }
  return hash.digest("hex");
}

function sourceIngestionIdentity(sourceTable, sourceAlias = "source") {
  if (sourceTable === "market_trades") {
    return {
      expression: "ingestion.ingestion_id",
      join: `INNER JOIN operational_history_source_ingestion_ids AS ingestion
        ON ingestion.source_table = 'market_trades' AND ingestion.source_key = ${sourceAlias}.trade_id`,
    };
  }
  return { expression: `${sourceAlias}."${PRUNE_IDENTIFIERS[sourceTable]}"`, join: "" };
}

function sourceMutationVersion(db, sourceTable, claimId, day, sourceMaxIngestionId) {
  if (sourceTable !== "market_trades") return 0;
  return Number(db.prepare(`
    SELECT COALESCE(MAX(mutation_id), 0) AS source_max_mutation_id
    FROM operational_history_source_mutations
    WHERE source_table = ? AND claim_id = ? AND utc_day = ?
      AND ingestion_id <= ?
  `).get(sourceTable, claimId, day, sourceMaxIngestionId)?.source_max_mutation_id ?? 0);
}

function sourceSnapshot(db, sourceTable, claimId, day, boundary = null) {
  const identifier = PRUNE_IDENTIFIERS[sourceTable];
  const columns = SOURCE_FINGERPRINT_COLUMNS[sourceTable];
  if (!identifier || !columns) throw new TypeError(`Unsupported operational history fingerprint source: ${sourceTable}`);
  const identity = sourceIngestionIdentity(sourceTable);
  const resolvedBoundary = boundary ?? db.prepare(`
    SELECT source.occurred_at AS source_max_occurred_at,
      source."${identifier}" AS source_max_key,
      ${identity.expression} AS source_max_ingestion_id
    FROM "${sourceTable}" AS source
    ${identity.join}
    WHERE source.claim_id = ? AND substr(source.occurred_at, 1, 10) = ?
    ORDER BY ${identity.expression} DESC
    LIMIT 1
  `).get(claimId, day);
  if (!Number.isSafeInteger(Number(resolvedBoundary?.source_max_ingestion_id)) || Number(resolvedBoundary.source_max_ingestion_id) <= 0) {
    return { sourceRowCount: 0, sourceMaxKey: null, sourceMaxOccurredAt: null, sourceMaxIngestionId: null, sourceMaxMutationId: 0, sourceFingerprint: fingerprintRows([], ["__ingestion_id", ...columns]) };
  }
  const rows = db.prepare(`
    SELECT ${identity.expression} AS __ingestion_id,
      ${columns.map((column) => `source."${column}"`).join(", ")}
    FROM "${sourceTable}" AS source
    ${identity.join}
    WHERE source.claim_id = ? AND substr(source.occurred_at, 1, 10) = ?
      AND ${identity.expression} <= ?
    ORDER BY ${identity.expression}
  `).all(
    claimId,
    day,
    resolvedBoundary.source_max_ingestion_id,
  );
  return {
    sourceRowCount: rows.length,
    sourceMaxKey: String(resolvedBoundary.source_max_key),
    sourceMaxOccurredAt: String(resolvedBoundary.source_max_occurred_at),
    sourceMaxIngestionId: Number(resolvedBoundary.source_max_ingestion_id),
    sourceMaxMutationId: sourceMutationVersion(db, sourceTable, claimId, day, Number(resolvedBoundary.source_max_ingestion_id)),
    sourceFingerprint: fingerprintRows(rows, ["__ingestion_id", ...columns]),
  };
}

export function buildOperationalHistoryRollups(db, {
  beforeDay = new Date().toISOString().slice(0, 10),
  sourceTables = [...ROLLUP_SOURCE_TABLES],
  now = new Date(),
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(beforeDay))) throw new TypeError("Rollup boundary must be a UTC day");
  const completedDays = [];
  const failedDays = [];
  const upsertWatermark = db.prepare(`
    INSERT INTO operational_history_rollup_watermarks (
      source_table, claim_id, utc_day, completion_state, source_row_count,
      source_max_key, source_max_occurred_at, source_max_ingestion_id, source_max_mutation_id, source_fingerprint,
      remaining_source_fingerprint, pruned_row_count, completed_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(source_table, claim_id, utc_day) DO UPDATE SET
      completion_state = excluded.completion_state,
      source_row_count = excluded.source_row_count,
      source_max_key = excluded.source_max_key,
      source_max_occurred_at = excluded.source_max_occurred_at,
      source_max_ingestion_id = excluded.source_max_ingestion_id,
      source_max_mutation_id = excluded.source_max_mutation_id,
      source_fingerprint = excluded.source_fingerprint,
      remaining_source_fingerprint = excluded.remaining_source_fingerprint,
      pruned_row_count = 0,
      completed_at = excluded.completed_at,
      last_error = excluded.last_error
  `);
  for (const sourceTable of sourceTables) {
    if (!ROLLUP_SOURCE_TABLES.has(sourceTable)) throw new TypeError(`Unsupported operational history rollup source: ${sourceTable}`);
    const periods = db.prepare(`
      SELECT claim_id, substr(occurred_at, 1, 10) AS utc_day
      FROM "${sourceTable}"
      WHERE occurred_at < ?
      GROUP BY claim_id, utc_day
      ORDER BY utc_day, claim_id
    `).all(`${beforeDay}T00:00:00.000Z`);
    for (const period of periods) {
      const existing = db.prepare(`
        SELECT completion_state, source_row_count, source_max_key, source_max_occurred_at, source_max_ingestion_id, source_max_mutation_id,
          source_fingerprint, remaining_source_fingerprint, pruned_row_count
        FROM operational_history_rollup_watermarks
        WHERE source_table = ? AND claim_id = ? AND utc_day = ?
      `).get(sourceTable, period.claim_id, period.utc_day);
      if (existing?.completion_state === "complete" && Number(existing.pruned_row_count ?? 0) > 0) continue;
      if (existing?.completion_state === "complete") {
        const current = sourceSnapshot(db, sourceTable, period.claim_id, period.utc_day);
        if (current.sourceRowCount === Number(existing.source_row_count ?? 0)
          && current.sourceMaxKey === String(existing.source_max_key ?? "")
          && current.sourceMaxOccurredAt === String(existing.source_max_occurred_at ?? "")
          && current.sourceMaxIngestionId === Number(existing.source_max_ingestion_id)
          && current.sourceMaxMutationId === Number(existing.source_max_mutation_id)
          && current.sourceFingerprint === String(existing.source_fingerprint ?? "")) continue;
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        BUILD_DAY[sourceTable](db, String(period.claim_id), String(period.utc_day));
        const result = sourceSnapshot(db, sourceTable, String(period.claim_id), String(period.utc_day));
        const completedAt = (now instanceof Date ? now : new Date(now)).toISOString();
        upsertWatermark.run(sourceTable, period.claim_id, period.utc_day, "complete", result.sourceRowCount, result.sourceMaxKey, result.sourceMaxOccurredAt, result.sourceMaxIngestionId, result.sourceMaxMutationId, result.sourceFingerprint, result.sourceFingerprint, completedAt, null);
        db.exec("COMMIT");
        completedDays.push({ sourceTable, claimId: String(period.claim_id), utcDay: String(period.utc_day), ...result });
      } catch (error) {
        db.exec("ROLLBACK");
        const message = error instanceof Error ? error.message : String(error);
        upsertWatermark.run(sourceTable, period.claim_id, period.utc_day, "failed", 0, null, null, null, null, "", "", null, message);
        failedDays.push({ sourceTable, claimId: String(period.claim_id), utcDay: String(period.utc_day), error: message });
      }
    }
  }
  return { completedDays, failedDays };
}

export function readOperationalMarketTradeDaily(db, { claimId, startDay, endDay, onDiagnostic = () => {} }) {
  if (![startDay, endDay].every((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))) {
    throw new TypeError("Market trade daily history requires explicit UTC day bounds");
  }
  const groups = new Map();
  const add = (day, salesCount, quantity, totalValue, oldestOccurredAt) => {
    const current = groups.get(day) ?? { day, salesCount: 0, unitsSold: "0", totalValue: "0", oldestOccurredAt: null };
    current.salesCount += Number(salesCount ?? 0);
    current.unitsSold = exactAdd(current.unitsSold, quantity);
    current.totalValue = exactAdd(current.totalValue, totalValue);
    if (oldestOccurredAt && (!current.oldestOccurredAt || oldestOccurredAt < current.oldestOccurredAt)) current.oldestOccurredAt = oldestOccurredAt;
    groups.set(day, current);
  };
  const coverageByDay = new Map();
  const watermarks = db.prepare(`
    SELECT claim_id, utc_day, source_row_count, source_max_key, source_max_occurred_at,
      source_max_ingestion_id, source_max_mutation_id, source_fingerprint,
      remaining_source_fingerprint, pruned_row_count,
      EXISTS (
        SELECT 1
        FROM operational_history_source_mutations AS mutation
        WHERE mutation.source_table = 'market_trades'
          AND mutation.claim_id = watermark.claim_id
          AND mutation.utc_day = watermark.utc_day
          AND mutation.mutation_id > watermark.source_max_mutation_id
          AND mutation.ingestion_id <= watermark.source_max_ingestion_id
        LIMIT 1
      ) AS has_covered_mutation
    FROM operational_history_rollup_watermarks AS watermark
    WHERE watermark.source_table = 'market_trades' AND watermark.claim_id = ?
      AND watermark.utc_day >= ? AND watermark.utc_day <= ? AND watermark.completion_state = 'complete'
    ORDER BY watermark.utc_day
  `).all(String(claimId), startDay, endDay);
  for (const watermark of watermarks) {
    const sourceMaxIngestionId = Number(watermark.source_max_ingestion_id);
    const sourceMaxMutationId = Number(watermark.source_max_mutation_id);
    if (watermark.source_max_ingestion_id == null
      || !Number.isSafeInteger(sourceMaxIngestionId)
      || sourceMaxIngestionId <= 0
      || watermark.source_max_mutation_id == null
      || !Number.isSafeInteger(sourceMaxMutationId)
      || sourceMaxMutationId < 0
      || String(watermark.source_fingerprint).length !== 64) continue;
    if (Number(watermark.has_covered_mutation) > 0) {
      if (Number(watermark.pruned_row_count) > 0) {
        throw new Error(`Operational market history parity is invalid for ${watermark.utc_day}`);
      }
      continue;
    }
    coverageByDay.set(String(watermark.utc_day), sourceMaxIngestionId);
  }
  const rollups = db.prepare(`
    SELECT daily.utc_day, daily.sales_count, daily.quantity, daily.total_value,
      daily.oldest_occurred_at
    FROM operational_history_market_trade_daily AS daily
    WHERE daily.claim_id = ? AND daily.utc_day >= ? AND daily.utc_day <= ?
  `).all(String(claimId), startDay, endDay);
  for (const row of rollups) {
    if (coverageByDay.has(String(row.utc_day))) add(String(row.utc_day), row.sales_count, row.quantity, row.total_value, row.oldest_occurred_at);
  }
  const endExclusive = new Date(`${endDay}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const coverageJson = JSON.stringify([...coverageByDay].map(([day, maxId]) => ({ day, maxId })));
  const raw = db.prepare(`
    WITH coverage AS (
      SELECT json_extract(value, '$.day') AS utc_day,
        CAST(json_extract(value, '$.maxId') AS INTEGER) AS source_max_ingestion_id
      FROM json_each(?)
    )
    SELECT substr(source.occurred_at, 1, 10) AS utc_day, source.quantity,
      source.total_price, source.occurred_at, ingestion.ingestion_id
    FROM market_trades AS source
    LEFT JOIN operational_history_source_ingestion_ids AS ingestion
      ON ingestion.source_table = 'market_trades' AND ingestion.source_key = source.trade_id
    LEFT JOIN coverage
      ON coverage.utc_day = substr(source.occurred_at, 1, 10)
    WHERE source.claim_id = ?
      AND source.occurred_at >= ? AND source.occurred_at < ?
      AND (
        coverage.utc_day IS NULL
        OR ingestion.ingestion_id IS NULL
        OR typeof(ingestion.ingestion_id) <> 'integer'
        OR ingestion.ingestion_id <= 0
        OR ingestion.ingestion_id > 9007199254740991
        OR ingestion.ingestion_id > coverage.source_max_ingestion_id
      )
    ORDER BY source.occurred_at, source.trade_id
  `).all(coverageJson, String(claimId), `${startDay}T00:00:00.000Z`, endExclusive.toISOString());
  let missingIngestionIdentityRows = 0;
  for (const row of raw) {
    const ingestionId = Number(row.ingestion_id);
    const hasIngestionIdentity = row.ingestion_id != null && Number.isSafeInteger(ingestionId) && ingestionId > 0;
    if (!hasIngestionIdentity) missingIngestionIdentityRows += 1;
    add(String(row.utc_day), 1, row.quantity, row.total_price, String(row.occurred_at));
  }
  if (missingIngestionIdentityRows > 0) {
    onDiagnostic({
      code: "operational_history_missing_ingestion_identity",
      claimId: String(claimId),
      rowCount: missingIngestionIdentityRows,
    });
  }
  const daily = [...groups.values()].sort((left, right) => left.day.localeCompare(right.day));
  return {
    daily: daily.map(({ oldestOccurredAt: ignored, ...row }) => row),
    observedSince: daily.reduce((oldest, row) => !oldest || (row.oldestOccurredAt && row.oldestOccurredAt < oldest) ? row.oldestOccurredAt : oldest, null),
  };
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  const descriptor = openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function validateMachineBackupVerification(backupVerification) {
  if (!backupVerification) throw new Error("Operational history retention requires a machine-verified backup");
  const hashes = [
    backupVerification.manifestSha256,
    backupVerification.databaseSha256,
    backupVerification.restoredDatabaseSha256,
    backupVerification.restoredManifestSha256,
  ];
  if (hashes.some((value) => !/^[a-f0-9]{64}$/i.test(String(value ?? "")))
    || backupVerification.restoredDatabaseSha256 !== backupVerification.databaseSha256
    || backupVerification.restoredManifestSha256 !== backupVerification.manifestSha256
    || backupVerification.restoredTemporaryDatabase !== true
    || backupVerification.integrityCheck !== "ok") {
    throw new Error("Operational history retention requires a verified backup manifest, temporary restore, hash binding, and integrity_check");
  }
}

function validateBackupRecency(now, backupVerification) {
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const createdMs = new Date(backupVerification.backupCreatedAt).getTime();
  const verifiedMs = new Date(backupVerification.verifiedAt).getTime();
  if (![nowMs, createdMs, verifiedMs].every(Number.isFinite)
    || nowMs - createdMs < 0 || nowMs - createdMs >= DAY_MS
    || nowMs - verifiedMs < 0 || nowMs - verifiedMs >= DAY_MS) {
    throw new Error("Operational history retention requires a backup created and verified within 24 hours");
  }
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

function canonicalExistingPath(value, label, canonicalizePath) {
  if (!value || !existsSync(value)) throw new Error(`Operational history retention ${label} does not exist`);
  return path.resolve(canonicalizePath(value));
}

function validateCurrentBackupArtifact(approvedBackupRoot, backupVerification, {
  disallowedBackupRoots = [],
  canonicalizePath = realpathSync,
} = {}) {
  if (!approvedBackupRoot) throw new Error("Operational history retention approved production backup root is not configured or does not exist");
  const approvedRoot = canonicalExistingPath(approvedBackupRoot, "approved production backup root", canonicalizePath);
  for (const disallowedRootPath of disallowedBackupRoots) {
    const disallowedRoot = canonicalExistingPath(disallowedRootPath, "local downloadable backup root", canonicalizePath);
    if (pathIsWithin(disallowedRoot, approvedRoot) || pathIsWithin(approvedRoot, disallowedRoot)) {
      throw new Error("Operational history retention approved root overlaps the local downloadable backup root");
    }
  }
  const backupPath = canonicalExistingPath(backupVerification.backupPath, "backup artifact", canonicalizePath);
  const manifestPath = canonicalExistingPath(backupVerification.manifestPath, "backup manifest", canonicalizePath);
  if (!pathIsWithin(approvedRoot, backupPath)) throw new Error("Operational history retention backup artifact is outside the approved production backup root");
  if (!pathIsWithin(approvedRoot, manifestPath)) throw new Error("Operational history retention backup manifest is outside the approved production backup root");
  const backupStat = statSync(backupPath);
  if (backupStat.size !== Number(backupVerification.backupBytes)) throw new Error("Operational history retention backup artifact size does not match verification");
  if (sha256File(backupPath) !== backupVerification.databaseSha256) throw new Error("Operational history retention backup artifact hash does not match verification");
  const manifestBytes = readFileSync(manifestPath);
  if (createHash("sha256").update(manifestBytes).digest("hex") !== backupVerification.manifestSha256) {
    throw new Error("Operational history retention backup manifest hash does not match verification");
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Operational history retention backup manifest is invalid JSON");
  }
  if (manifest.name !== backupVerification.backupName
    || manifest.createdAt !== backupVerification.backupCreatedAt
    || Number(manifest.size) !== Number(backupVerification.backupBytes)
    || manifest.databaseSha256 !== backupVerification.databaseSha256) {
    throw new Error("Operational history retention backup manifest is not bound to the verified artifact");
  }
  const artifact = new DatabaseSync(backupPath, { readOnly: true });
  try {
    if (String(artifact.prepare("PRAGMA integrity_check").get()?.integrity_check ?? "") !== "ok") {
      throw new Error("Operational history retention current backup artifact failed integrity_check");
    }
  } finally {
    artifact.close();
  }
}

export function validateOperationalHistoryRetentionEnableGate({
  now,
  approvedTables,
  tables,
  explicitConfirmation,
  backupVerification,
  approvedBackupRoot = "",
  disallowedBackupRoots = [],
  canonicalizePath = realpathSync,
}) {
  for (const table of tables) {
    if (!approvedTables.has(table)) throw new Error(`Operational history table ${table} is not approved for pruning`);
  }
  if (explicitConfirmation !== ENABLE_CONFIRMATION) throw new Error("Operational history retention requires explicit confirmation");
  validateMachineBackupVerification(backupVerification);
  validateBackupRecency(now, backupVerification);
  validateCurrentBackupArtifact(approvedBackupRoot, backupVerification, { disallowedBackupRoots, canonicalizePath });
}

function recordRun(db, result, startedAt, completedAt) {
  db.prepare(`
    INSERT INTO operational_history_retention_runs (
      mode, cutoff, configured_days, configured_tables_json, eligible_rows,
      deleted_rows, duration_ms, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(result.mode, result.cutoff, result.configuredDays, JSON.stringify(result.configuredTables), result.eligibleRows, result.deletedRows, result.durationMs, startedAt, completedAt);
}

export function runOperationalHistoryRetention(db, {
  now = new Date(),
  enabled = false,
  dryRun = true,
  days = OPERATIONAL_HISTORY_RETENTION_DEFAULTS.days,
  tables = OPERATIONAL_HISTORY_RETENTION_DEFAULTS.tables,
  approvedTables = new Set(APPROVED_OPERATIONAL_HISTORY_RETENTION_TABLES),
  explicitConfirmation = "",
  backupVerification = null,
  approvedBackupRoot = "",
  disallowedBackupRoots = [],
  batchSize = MAX_BATCH_SIZE,
} = {}) {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const configuredDays = integerInRange(days, 90, 3650, "Operational history retention days");
  const configuredTables = tableList(tables);
  const cutoff = cutoffIso(now, configuredDays);
  const preview = OPERATIONAL_HISTORY_TABLES.map((table) => tablePreview(db, table, cutoff));
  const eligibleRows = preview.reduce((sum, row) => sum + row.eligibleRows, 0);
  const mode = dryRun ? "dry-run" : enabled ? "prune" : "disabled";
  if (!enabled || dryRun) {
    const completedAt = new Date().toISOString();
    const result = { mode, cutoff, configuredDays, configuredTables, eligibleRows, deletedRows: 0, batchSize: Math.min(MAX_BATCH_SIZE, Math.max(1, Number(batchSize) || MAX_BATCH_SIZE)), tables: preview, durationMs: Date.now() - startedMs };
    recordRun(db, result, startedAt, completedAt);
    return result;
  }
  validateOperationalHistoryRetentionEnableGate({ now, approvedTables, tables: configuredTables, explicitConfirmation, backupVerification, approvedBackupRoot, disallowedBackupRoots });
  if (!configuredTables.length) throw new Error("Operational history retention approved table allowlist is empty");
  const boundedBatchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(batchSize) || MAX_BATCH_SIZE));
  let remaining = boundedBatchSize;
  let deletedRows = 0;
  const deletedByTable = {};
  for (const table of configuredTables) {
    if (!Object.hasOwn(PRUNE_IDENTIFIERS, table)) throw new Error(`Operational history table ${table} is not prunable`);
    if (remaining <= 0) break;
    const identifier = PRUNE_IDENTIFIERS[table];
    const identity = sourceIngestionIdentity(table);
    const remove = db.prepare(`DELETE FROM "${table}" WHERE "${identifier}" = ? AND occurred_at < ?`);
    const markPruned = db.prepare(`
      UPDATE operational_history_rollup_watermarks
      SET pruned_row_count = pruned_row_count + ?, remaining_source_fingerprint = ?,
        source_max_mutation_id = ?
      WHERE source_table = ? AND claim_id = ? AND utc_day = ?
        AND completion_state = 'complete'
    `);
    db.exec("BEGIN IMMEDIATE");
    try {
      let tableDeleted = 0;
      const watermarks = db.prepare(`
        SELECT claim_id, utc_day, source_row_count, source_max_key,
          source_max_occurred_at, source_max_ingestion_id, pruned_row_count, remaining_source_fingerprint
        FROM operational_history_rollup_watermarks
        WHERE source_table = ? AND completion_state = 'complete'
        ORDER BY utc_day, claim_id
      `).all(table);
      for (const watermark of watermarks) {
        if (remaining - tableDeleted <= 0) break;
        const boundary = {
          source_max_key: watermark.source_max_key,
          source_max_occurred_at: watermark.source_max_occurred_at,
          source_max_ingestion_id: watermark.source_max_ingestion_id,
        };
        const snapshot = sourceSnapshot(db, table, watermark.claim_id, watermark.utc_day, boundary);
        if (snapshot.sourceRowCount !== Number(watermark.source_row_count) - Number(watermark.pruned_row_count)
          || snapshot.sourceFingerprint !== String(watermark.remaining_source_fingerprint)) {
          continue;
        }
        const candidates = db.prepare(`
          SELECT source."${identifier}" AS row_key
          FROM "${table}" AS source
          ${identity.join}
          WHERE source.claim_id = ? AND substr(source.occurred_at, 1, 10) = ?
            AND source.occurred_at < ?
            AND ${identity.expression} <= ?
          ORDER BY ${identity.expression}
          LIMIT ?
        `).all(
          watermark.claim_id,
          watermark.utc_day,
          cutoff,
          watermark.source_max_ingestion_id,
          remaining - tableDeleted,
        );
        let periodDeleted = 0;
        for (const candidate of candidates) periodDeleted += remove.run(candidate.row_key, cutoff).changes;
        if (!periodDeleted) continue;
        const remainingSnapshot = sourceSnapshot(db, table, watermark.claim_id, watermark.utc_day, boundary);
        markPruned.run(periodDeleted, remainingSnapshot.sourceFingerprint, remainingSnapshot.sourceMaxMutationId, table, watermark.claim_id, watermark.utc_day);
        tableDeleted += periodDeleted;
      }
      db.exec("COMMIT");
      deletedByTable[table] = tableDeleted;
      deletedRows += tableDeleted;
      remaining -= tableDeleted;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const completedAt = new Date().toISOString();
  const result = { mode, cutoff, configuredDays, configuredTables, eligibleRows, deletedRows, deletedByTable, batchSize: boundedBatchSize, tables: preview, durationMs: Date.now() - startedMs };
  recordRun(db, result, startedAt, completedAt);
  return result;
}

export function recordOperationalHistoryBackupVerification(db, evidence) {
  validateMachineBackupVerification(evidence);
  validateBackupRecency(new Date(evidence.verifiedAt), evidence);
  db.prepare(`
    INSERT INTO operational_history_backup_verifications (
      backup_name, backup_created_at, verified_at, manifest_sha256, database_sha256,
      backup_path, manifest_path, restored_database_sha256, restored_manifest_sha256,
      restored_temporary_database, integrity_check, backup_bytes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(String(evidence.backupName), evidence.backupCreatedAt, evidence.verifiedAt, evidence.manifestSha256, evidence.databaseSha256, evidence.backupPath, evidence.manifestPath, evidence.restoredDatabaseSha256, evidence.restoredManifestSha256, 1, "ok", Number(evidence.backupBytes));
  return latestOperationalHistoryBackupVerification(db);
}
