#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

function decimal(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function jsonObject(value) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function evidenceClaims(value, paths) {
  const claims = [];
  for (const keys of paths) {
    let current = value;
    for (const key of keys) current = current?.[key];
    if (current == null || String(current).trim() === "") continue;
    const normalized = String(current).trim();
    if (/^\d+$/.test(normalized)) claims.push(normalized);
  }
  return claims;
}

function hasForeignClaim(value, configuredClaimId, paths) {
  return evidenceClaims(value, paths).some((claimId) => claimId !== configuredClaimId);
}

const MARKET_CLAIM_PATHS = [
  ["claimEntityId"],
  ["listing", "claimEntityId"],
  ["evidence", "claimEntityId"],
];
const ACTIVITY_CLAIM_PATHS = [
  ["raw", "claimEntityId"],
];

function counts(selection) {
  const result = {
    marketEvents: selection.marketEventIds.length,
    marketTrades: selection.marketTradeIds.length,
    activityEvents: selection.activityEventIds.length,
    notificationOutbox: selection.notificationOutboxIds.length,
  };
  return { ...result, total: Object.values(result).reduce((total, count) => total + count, 0) };
}

function selectionHash(selection) {
  return createHash("sha256").update(JSON.stringify(selection)).digest("hex");
}

function selectContaminatedRows(db, configuredClaimId) {
  const marketEventIds = db.prepare("SELECT id, raw_json FROM market_events ORDER BY id").all()
    .filter((row) => hasForeignClaim(jsonObject(row.raw_json), configuredClaimId, MARKET_CLAIM_PATHS))
    .map((row) => Number(row.id));
  const marketTradeIds = db.prepare("SELECT trade_id, raw_json FROM market_trades ORDER BY trade_id").all()
    .filter((row) => hasForeignClaim(jsonObject(row.raw_json), configuredClaimId, MARKET_CLAIM_PATHS))
    .map((row) => String(row.trade_id));
  const contaminatedActivities = db.prepare(`
    SELECT id, claim_id, event_type, summary, metadata_json, source_key
    FROM activity_events
    ORDER BY id
  `).all().filter((row) => (
    hasForeignClaim(jsonObject(row.metadata_json), configuredClaimId, ACTIVITY_CLAIM_PATHS)
  ));
  const activityEventIds = contaminatedActivities.map((row) => Number(row.id));
  const activityLinks = new Set();
  for (const row of contaminatedActivities) {
    if (row.source_key) activityLinks.add(String(row.source_key));
    const metadata = jsonObject(row.metadata_json);
    const stable = metadata.sourceKey ?? metadata.id ?? row.summary;
    activityLinks.add(`${row.event_type}:${row.claim_id}:${stable}`);
  }
  const notificationOutboxIds = db.prepare(`
    SELECT id, source_key, metadata_json
    FROM discord_notification_outbox
    WHERE status <> 'sent' AND sent_at IS NULL
    ORDER BY id
  `).all().filter((row) => {
    if (activityLinks.has(String(row.source_key))) return true;
    const metadata = jsonObject(row.metadata_json);
    return [metadata.activitySourceKey, metadata.sourceKey]
      .filter((value) => value != null)
      .some((value) => activityLinks.has(String(value)));
  }).map((row) => Number(row.id));
  return { marketEventIds, marketTradeIds, activityEventIds, notificationOutboxIds };
}

function deleteSelected(db, table, column, values) {
  if (!values.length) return;
  const placeholders = values.map(() => "?").join(", ");
  db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...values);
}

function sameCounts(left, right) {
  return ["marketEvents", "marketTrades", "activityEvents", "notificationOutbox", "total"]
    .every((key) => Number(left?.[key]) === Number(right?.[key]));
}

function databasePath() {
  const explicit = String(process.env.BITCRAFT_LOCAL_DB_PATH ?? "").trim();
  if (explicit) return path.resolve(explicit);
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const dataDirectory = String(process.env.BITCRAFT_LOCAL_DATA_DIR ?? "").trim()
    || path.join(scriptDirectory, "..", "apps", "bitcraft-local", "data");
  return path.resolve(dataDirectory, "bitcraft-local.sqlite");
}

function parseArguments(argv) {
  const options = { mode: null, claimId: null, manifest: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--apply") {
      if (options.mode) throw new TypeError("Choose exactly one of --dry-run or --apply");
      options.mode = argument.slice(2);
    } else if (argument === "--claim-id") {
      options.claimId = argv[++index];
    } else if (argument === "--manifest") {
      options.manifest = argv[++index];
    } else {
      throw new TypeError(`Unknown argument: ${argument}`);
    }
  }
  if (!options.mode) throw new TypeError("Choose exactly one of --dry-run or --apply");
  if (!options.manifest) throw new TypeError("--manifest <path> is required");
  if (options.mode === "dry-run" && !options.claimId) {
    throw new TypeError("--dry-run requires --claim-id <decimal>");
  }
  if (options.mode === "apply" && options.claimId) {
    throw new TypeError("--apply reads the claim id from its manifest");
  }
  return options;
}

function dryRun(options) {
  const claimId = decimal(options.claimId, "claim id");
  const db = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    const selection = selectContaminatedRows(db, claimId);
    const manifest = {
      schemaVersion: 1,
      claimId,
      selection,
      counts: counts(selection),
      selectionHash: selectionHash(selection),
    };
    writeFileSync(path.resolve(options.manifest), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    return manifest;
  } finally {
    db.close();
  }
}

function apply(options) {
  const manifest = jsonObject(readFileSync(path.resolve(options.manifest), "utf8"));
  const claimId = decimal(manifest.claimId, "manifest claim id");
  const expectedSelection = manifest.selection;
  if (!expectedSelection || selectionHash(expectedSelection) !== manifest.selectionHash) {
    throw new Error("Manifest selection hash is invalid");
  }
  if (!sameCounts(counts(expectedSelection), manifest.counts)) {
    throw new Error("Manifest selection counts are invalid");
  }
  const db = new DatabaseSync(databasePath());
  db.exec("BEGIN IMMEDIATE");
  try {
    const currentSelection = selectContaminatedRows(db, claimId);
    const currentCounts = counts(currentSelection);
    if (
      selectionHash(currentSelection) !== manifest.selectionHash
      || !sameCounts(currentCounts, manifest.counts)
    ) {
      throw new Error("Repair selection changed since dry-run; refusing apply");
    }
    deleteSelected(db, "discord_notification_outbox", "id", currentSelection.notificationOutboxIds);
    deleteSelected(db, "activity_events", "id", currentSelection.activityEventIds);
    deleteSelected(db, "market_trades", "trade_id", currentSelection.marketTradeIds);
    deleteSelected(db, "market_events", "id", currentSelection.marketEventIds);
    const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
    if (integrity !== "ok") throw new Error(`SQLite integrity_check failed: ${integrity ?? "no result"}`);
    db.exec("COMMIT");
    return { claimId, selection: currentSelection, counts: currentCounts, selectionHash: manifest.selectionHash, integrity };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  const result = options.mode === "dry-run" ? dryRun(options) : apply(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
