import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const script = fileURLToPath(new URL("../../../scripts/repair-relay-market-claim-scope.mjs", import.meta.url));

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "relay-market-repair-"));
  const databasePath = path.join(directory, "bitcraft-local.sqlite");
  const manifestPath = path.join(directory, "manifest.json");
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE market_events (id INTEGER PRIMARY KEY, raw_json TEXT NOT NULL);
    CREATE TABLE market_trades (trade_id TEXT PRIMARY KEY, raw_json TEXT NOT NULL);
    CREATE TABLE activity_events (
      id INTEGER PRIMARY KEY, claim_id TEXT NOT NULL, event_type TEXT NOT NULL,
      summary TEXT NOT NULL, metadata_json TEXT NOT NULL, source_key TEXT
    );
    CREATE TABLE discord_notification_outbox (
      id INTEGER PRIMARY KEY, source_key TEXT NOT NULL, metadata_json TEXT NOT NULL,
      status TEXT NOT NULL, sent_at TEXT
    );
  `);
  const eventInsert = db.prepare("INSERT INTO market_events (id, raw_json) VALUES (?, ?)");
  eventInsert.run(1, JSON.stringify({ listing: { claimEntityId: "999" } }));
  eventInsert.run(2, JSON.stringify({ listing: { itemId: "42" } }));
  eventInsert.run(3, JSON.stringify({ evidence: { claimEntityId: "100" } }));
  const tradeInsert = db.prepare("INSERT INTO market_trades (trade_id, raw_json) VALUES (?, ?)");
  tradeInsert.run("trade-foreign", JSON.stringify({ evidence: { claimEntityId: "999" } }));
  tradeInsert.run("trade-unknown", JSON.stringify({ listing: { itemId: "42" } }));
  const activityInsert = db.prepare(`
    INSERT INTO activity_events (id, claim_id, event_type, summary, metadata_json, source_key)
    VALUES (?, '100', 'market_sale_confirmed', ?, ?, ?)
  `);
  activityInsert.run(1, "Foreign sale", JSON.stringify({ raw: { claimEntityId: "999" } }), "activity-foreign");
  activityInsert.run(2, "Unknown sale", JSON.stringify({ raw: { itemId: "42" } }), "activity-unknown");
  const outboxInsert = db.prepare(`
    INSERT INTO discord_notification_outbox (id, source_key, metadata_json, status, sent_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  outboxInsert.run(1, "activity-foreign", "{}", "pending", null);
  outboxInsert.run(2, "sent-copy", JSON.stringify({ activitySourceKey: "activity-foreign" }), "sent", "2026-08-08T10:00:00.000Z");
  outboxInsert.run(3, "unrelated", "{}", "pending", null);
  db.close();
  return { databasePath, manifestPath };
}

function run(args, databasePath) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, BITCRAFT_LOCAL_DB_PATH: databasePath },
  });
}

test("repair dry-run manifests exact evidence-backed rows and apply deletes only that selection", () => {
  const { databasePath, manifestPath } = fixture();
  const dryRun = run(["--dry-run", "--claim-id", "100", "--manifest", manifestPath], databasePath);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest.selection, {
    marketEventIds: [1],
    marketTradeIds: ["trade-foreign"],
    activityEventIds: [1],
    notificationOutboxIds: [1],
  });
  assert.deepEqual(manifest.counts, {
    marketEvents: 1,
    marketTrades: 1,
    activityEvents: 1,
    notificationOutbox: 1,
    total: 4,
  });
  assert.match(manifest.selectionHash, /^[a-f0-9]{64}$/);

  const apply = run(["--apply", "--manifest", manifestPath], databasePath);
  assert.equal(apply.status, 0, apply.stderr);
  const db = new DatabaseSync(databasePath);
  assert.deepEqual(db.prepare("SELECT id FROM market_events ORDER BY id").all().map((row) => row.id), [2, 3]);
  assert.deepEqual(db.prepare("SELECT trade_id FROM market_trades ORDER BY trade_id").all().map((row) => row.trade_id), ["trade-unknown"]);
  assert.deepEqual(db.prepare("SELECT id FROM activity_events ORDER BY id").all().map((row) => row.id), [2]);
  assert.deepEqual(db.prepare("SELECT id FROM discord_notification_outbox ORDER BY id").all().map((row) => row.id), [2, 3]);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  db.close();
});

test("repair apply refuses when the evidence-backed selection hash or counts changed", () => {
  const { databasePath, manifestPath } = fixture();
  const dryRun = run(["--dry-run", "--claim-id", "100", "--manifest", manifestPath], databasePath);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const db = new DatabaseSync(databasePath);
  db.prepare("INSERT INTO market_events (id, raw_json) VALUES (?, ?)").run(
    4,
    JSON.stringify({ claimEntityId: "999" }),
  );
  db.close();

  const apply = run(["--apply", "--manifest", manifestPath], databasePath);
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /selection changed/i);
  const unchanged = new DatabaseSync(databasePath);
  assert.equal(unchanged.prepare("SELECT COUNT(*) AS count FROM market_events").get().count, 4);
  assert.equal(unchanged.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 2);
  unchanged.close();
});
