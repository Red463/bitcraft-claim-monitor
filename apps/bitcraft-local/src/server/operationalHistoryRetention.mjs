import { existsSync, statSync } from "node:fs";

import { addDecimal } from "./game-data/exactDecimal.ts";

const DAY_MS = 86_400_000;
const MAX_BATCH_SIZE = 5_000;
const ENABLE_CONFIRMATION = "ENABLE OPERATIONAL HISTORY RETENTION";

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
  CREATE TABLE IF NOT EXISTS operational_history_rollup_watermarks (
    source_table TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    utc_day TEXT NOT NULL,
    completion_state TEXT NOT NULL CHECK (completion_state IN ('complete', 'failed')),
    source_row_count INTEGER NOT NULL,
    source_max_key TEXT,
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
      database_sha256, restored_temporary_database, integrity_check, backup_bytes
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
    ORDER BY trade_id
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
  return { sourceRowCount: rows.length, sourceMaxKey: rows.at(-1)?.trade_id ?? null };
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
  return { sourceRowCount: rows.length, sourceMaxKey: rows.at(-1)?.id == null ? null : String(rows.at(-1).id) };
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
  return { sourceRowCount: Number(source?.source_row_count ?? 0), sourceMaxKey: source?.source_max_key == null ? null : String(source.source_max_key) };
}

const BUILD_DAY = Object.freeze({
  market_events: buildMarketEventDay,
  market_trades: buildMarketTradeDay,
  activity_events: buildActivityDay,
});

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
      source_max_key, pruned_row_count, completed_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(source_table, claim_id, utc_day) DO UPDATE SET
      completion_state = excluded.completion_state,
      source_row_count = excluded.source_row_count,
      source_max_key = excluded.source_max_key,
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
        SELECT completion_state, source_row_count, source_max_key, pruned_row_count
        FROM operational_history_rollup_watermarks
        WHERE source_table = ? AND claim_id = ? AND utc_day = ?
      `).get(sourceTable, period.claim_id, period.utc_day);
      if (existing?.completion_state === "complete" && Number(existing.pruned_row_count ?? 0) > 0) continue;
      if (existing?.completion_state === "complete") {
        const identifier = PRUNE_IDENTIFIERS[sourceTable];
        const current = db.prepare(`
          SELECT COUNT(*) AS source_row_count, MAX("${identifier}") AS source_max_key
          FROM "${sourceTable}"
          WHERE claim_id = ? AND substr(occurred_at, 1, 10) = ?
        `).get(period.claim_id, period.utc_day);
        if (Number(current?.source_row_count ?? 0) === Number(existing.source_row_count ?? 0)
          && String(current?.source_max_key ?? "") === String(existing.source_max_key ?? "")) continue;
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = BUILD_DAY[sourceTable](db, String(period.claim_id), String(period.utc_day));
        const completedAt = (now instanceof Date ? now : new Date(now)).toISOString();
        upsertWatermark.run(sourceTable, period.claim_id, period.utc_day, "complete", result.sourceRowCount, result.sourceMaxKey, completedAt, null);
        db.exec("COMMIT");
        completedDays.push({ sourceTable, claimId: String(period.claim_id), utcDay: String(period.utc_day), ...result });
      } catch (error) {
        db.exec("ROLLBACK");
        const message = error instanceof Error ? error.message : String(error);
        upsertWatermark.run(sourceTable, period.claim_id, period.utc_day, "failed", 0, null, null, message);
        failedDays.push({ sourceTable, claimId: String(period.claim_id), utcDay: String(period.utc_day), error: message });
      }
    }
  }
  return { completedDays, failedDays };
}

export function readOperationalMarketTradeDaily(db, { claimId, startDay, endDay }) {
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
  const rollups = db.prepare(`
    SELECT daily.utc_day, daily.sales_count, daily.quantity, daily.total_value,
      daily.oldest_occurred_at
    FROM operational_history_market_trade_daily AS daily
    INNER JOIN operational_history_rollup_watermarks AS watermark
      ON watermark.source_table = 'market_trades'
     AND watermark.claim_id = daily.claim_id
     AND watermark.utc_day = daily.utc_day
     AND watermark.completion_state = 'complete'
    WHERE daily.claim_id = ? AND daily.utc_day >= ? AND daily.utc_day <= ?
  `).all(String(claimId), startDay, endDay);
  for (const row of rollups) add(String(row.utc_day), row.sales_count, row.quantity, row.total_value, row.oldest_occurred_at);
  const raw = db.prepare(`
    SELECT substr(source.occurred_at, 1, 10) AS utc_day, source.quantity,
      source.total_price, source.occurred_at
    FROM market_trades AS source
    WHERE source.claim_id = ?
      AND source.occurred_at >= ? AND source.occurred_at < ?
      AND NOT EXISTS (
        SELECT 1 FROM operational_history_rollup_watermarks AS watermark
        WHERE watermark.source_table = 'market_trades'
          AND watermark.claim_id = source.claim_id
          AND watermark.utc_day = substr(source.occurred_at, 1, 10)
          AND watermark.completion_state = 'complete'
      )
    ORDER BY source.occurred_at, source.trade_id
  `).all(String(claimId), `${startDay}T00:00:00.000Z`, `${endDay}T23:59:59.999Z`);
  for (const row of raw) add(String(row.utc_day), 1, row.quantity, row.total_price, String(row.occurred_at));
  const daily = [...groups.values()].sort((left, right) => left.day.localeCompare(right.day));
  return {
    daily: daily.map(({ oldestOccurredAt: ignored, ...row }) => row),
    observedSince: daily.reduce((oldest, row) => !oldest || (row.oldestOccurredAt && row.oldestOccurredAt < oldest) ? row.oldestOccurredAt : oldest, null),
  };
}

export function validateOperationalHistoryRetentionEnableGate({ now, approvedTables, tables, explicitConfirmation, backupVerification }) {
  for (const table of tables) {
    if (!approvedTables.has(table)) throw new Error(`Operational history table ${table} is not approved for pruning`);
  }
  if (explicitConfirmation !== ENABLE_CONFIRMATION) throw new Error("Operational history retention requires explicit confirmation");
  if (!backupVerification) throw new Error("Operational history retention requires a machine-verified backup");
  if (!/^[a-f0-9]{64}$/i.test(String(backupVerification.manifestSha256 ?? ""))
    || backupVerification.restoredTemporaryDatabase !== true
    || backupVerification.integrityCheck !== "ok") {
    throw new Error("Operational history retention requires a verified backup manifest, temporary restore, and integrity_check");
  }
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const createdMs = new Date(backupVerification.backupCreatedAt).getTime();
  const verifiedMs = new Date(backupVerification.verifiedAt).getTime();
  if (![nowMs, createdMs, verifiedMs].every(Number.isFinite)
    || nowMs - createdMs < 0 || nowMs - createdMs >= DAY_MS
    || nowMs - verifiedMs < 0 || nowMs - verifiedMs >= DAY_MS) {
    throw new Error("Operational history retention requires a backup created and verified within 24 hours");
  }
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
  validateOperationalHistoryRetentionEnableGate({ now, approvedTables, tables: configuredTables, explicitConfirmation, backupVerification });
  if (!configuredTables.length) throw new Error("Operational history retention approved table allowlist is empty");
  const boundedBatchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(batchSize) || MAX_BATCH_SIZE));
  let remaining = boundedBatchSize;
  let deletedRows = 0;
  const deletedByTable = {};
  for (const table of configuredTables) {
    if (!Object.hasOwn(PRUNE_IDENTIFIERS, table)) throw new Error(`Operational history table ${table} is not prunable`);
    if (remaining <= 0) break;
    const identifier = PRUNE_IDENTIFIERS[table];
    const candidates = db.prepare(`
      SELECT source."${identifier}" AS row_key, source.claim_id,
        substr(source.occurred_at, 1, 10) AS utc_day
      FROM "${table}" AS source
      INNER JOIN operational_history_rollup_watermarks AS watermark
        ON watermark.source_table = ?
       AND watermark.claim_id = source.claim_id
       AND watermark.utc_day = substr(source.occurred_at, 1, 10)
       AND watermark.completion_state = 'complete'
       AND watermark.source_row_count = watermark.pruned_row_count + (
         SELECT COUNT(*) FROM "${table}" AS source_check
         WHERE source_check.claim_id = source.claim_id
           AND substr(source_check.occurred_at, 1, 10) = watermark.utc_day
       )
      WHERE source.occurred_at < ?
      ORDER BY source.occurred_at, source."${identifier}"
      LIMIT ?
    `).all(table, cutoff, remaining);
    if (!candidates.length) continue;
    const remove = db.prepare(`DELETE FROM "${table}" WHERE "${identifier}" = ? AND occurred_at < ?`);
    const markPruned = db.prepare(`
      UPDATE operational_history_rollup_watermarks
      SET pruned_row_count = pruned_row_count + ?
      WHERE source_table = ? AND claim_id = ? AND utc_day = ?
        AND completion_state = 'complete'
    `);
    db.exec("BEGIN IMMEDIATE");
    try {
      let tableDeleted = 0;
      const prunedPeriods = new Map();
      for (const candidate of candidates) {
        const changes = remove.run(candidate.row_key, cutoff).changes;
        tableDeleted += changes;
        if (changes) {
          const key = `${candidate.claim_id}\0${candidate.utc_day}`;
          prunedPeriods.set(key, { claimId: candidate.claim_id, utcDay: candidate.utc_day, count: (prunedPeriods.get(key)?.count ?? 0) + changes });
        }
      }
      for (const period of prunedPeriods.values()) markPruned.run(period.count, table, period.claimId, period.utcDay);
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
  validateOperationalHistoryRetentionEnableGate({
    now: new Date(evidence.verifiedAt),
    approvedTables: new Set(),
    tables: [],
    explicitConfirmation: ENABLE_CONFIRMATION,
    backupVerification: evidence,
  });
  if (!/^[a-f0-9]{64}$/i.test(String(evidence.databaseSha256 ?? ""))) throw new TypeError("Backup database hash is invalid");
  db.prepare(`
    INSERT INTO operational_history_backup_verifications (
      backup_name, backup_created_at, verified_at, manifest_sha256, database_sha256,
      restored_temporary_database, integrity_check, backup_bytes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(String(evidence.backupName), evidence.backupCreatedAt, evidence.verifiedAt, evidence.manifestSha256, evidence.databaseSha256, 1, "ok", Number(evidence.backupBytes));
  return latestOperationalHistoryBackupVerification(db);
}
