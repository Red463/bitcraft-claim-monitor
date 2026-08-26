import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  applyContributionAttributionRepair,
  createContributionAttributionManifest,
} from "../src/server/contributionAttributionRepair.mjs";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE production_contributions (
      contribution_key TEXT PRIMARY KEY, claim_id TEXT, craft_entity_id TEXT,
      contributor_entity_id TEXT, contributor_name TEXT, attribution_confidence TEXT,
      profession TEXT, craft_label TEXT, structure_name TEXT, item_tier TEXT,
      contributed_progress TEXT, contributed_xp TEXT, contribution_count TEXT,
      first_contributed_at TEXT, last_contributed_at TEXT, first_seen TEXT,
      updated_at TEXT, raw_json TEXT
    );
    CREATE TABLE production_contribution_events (
      source_key TEXT PRIMARY KEY, claim_id TEXT, craft_entity_id TEXT,
      contributor_entity_id TEXT, attribution_confidence TEXT,
      contributed_progress TEXT, contributed_xp TEXT, occurred_at TEXT, received_at TEXT, raw_json TEXT
    );
  `);
  const contribution = db.prepare("INSERT INTO production_contributions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  contribution.run("owner", "10", "100", "1", "Ada", "owner_fallback", "Forestry", "Planks", "Forester", null, "99", "100.5", "1", "2026-08-10T10:00:00.000Z", "2026-08-10T10:00:00.000Z", "2026-08-10T10:00:00.000Z", "2026-08-10T10:00:00.000Z", "{}");
  contribution.run("10:100:2", "10", "100", "2", "Grace", "authoritative", "Forestry", "Planks", "Forester", null, "2", "3.5", "1", "2026-08-10T11:00:00.000Z", "2026-08-10T11:00:00.000Z", "2026-08-10T11:00:00.000Z", "2026-08-10T11:00:00.000Z", "{}");
  const event = db.prepare("INSERT INTO production_contribution_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  event.run("owner-event", "10", "100", "1", "owner_fallback", "99", "100.5", "2026-08-10T10:00:00.000Z", "2026-08-10T10:00:00.000Z", "{}");
  event.run("exact-event", "10", "100", "2", "matched_action", "2", "3.5", "2026-08-10T11:00:00.000Z", "2026-08-10T11:00:00.000Z", JSON.stringify({ contributorName: "Grace", profession: "Forestry", craftLabel: "Planks", structureName: "Forester" }));
  return db;
}

test("attribution repair selects unsupported owner aggregates and rebuilds from durable exact events", () => {
  const db = database();
  const manifest = createContributionAttributionManifest(db, "10");

  assert.deepEqual(manifest.selection.remove.map(({ before }) => before.contributionKey), ["owner"]);
  assert.equal(manifest.counts.eventsPreserved, 2);
  assert.match(manifest.selectionHash, /^[a-f0-9]{64}$/);
  applyContributionAttributionRepair(db, manifest);
  assert.deepEqual(
    db.prepare("SELECT contribution_key, contributed_progress FROM production_contributions ORDER BY contribution_key").all()
      .map((row) => ({ ...row })),
    [{ contribution_key: "10:100:2", contributed_progress: "2" }],
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM production_contribution_events").get().count, 2);
  db.close();
});

test("attribution repair refuses apply after aggregate selection drift", () => {
  const db = database();
  const manifest = createContributionAttributionManifest(db, "10");
  db.prepare("UPDATE production_contributions SET attribution_confidence = 'authoritative' WHERE contribution_key = 'owner'").run();
  assert.throws(() => applyContributionAttributionRepair(db, manifest), /selection changed/i);
  db.close();
});

test("attribution repair preserves historical events with unknown contributors", () => {
  const db = database();
  db.prepare("INSERT INTO production_contributions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("unknown", "10", "100", null, "Unknown contributor", "unknown", null, "Craft contribution", "Unknown structure", null, "7", "8", "1", "2026-08-10T12:00:00.000Z", "2026-08-10T12:00:00.000Z", "2026-08-10T12:00:00.000Z", "2026-08-10T12:00:00.000Z", "{}");
  db.prepare("INSERT INTO production_contribution_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("unknown-event", "10", "100", null, "unknown", "7", "8", "2026-08-10T12:00:00.000Z", "2026-08-10T12:00:00.000Z", "{}");

  const manifest = createContributionAttributionManifest(db, "10");
  assert.equal(manifest.counts.eventsPreserved, 3);
  applyContributionAttributionRepair(db, manifest);
  assert.deepEqual(
    { ...db.prepare("SELECT contribution_key, attribution_confidence, contributed_progress FROM production_contributions WHERE contribution_key = 'unknown'").get() },
    { contribution_key: "unknown", attribution_confidence: "unknown", contributed_progress: "7" },
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM production_contribution_events").get().count, 3);
  db.close();
});

test("attribution repair updates aggregate metadata from the latest durable exact event", () => {
  const db = database();
  db.prepare("INSERT INTO production_contribution_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("exact-later", "10", "100", "2", "authoritative", "3", "4.5", "2026-08-10T12:00:00.000Z", "2026-08-10T12:00:01.000Z", JSON.stringify({
      contributorName: "Latest Grace",
      profession: "Masonry",
      craftLabel: "Stone blocks",
      structureName: "Mason",
      itemTier: "4",
    }));

  applyContributionAttributionRepair(db, createContributionAttributionManifest(db, "10"));
  assert.deepEqual(
    { ...db.prepare(`SELECT contributor_name, profession, craft_label, structure_name, item_tier,
      contributed_progress, contributed_xp, contribution_count FROM production_contributions
      WHERE contribution_key = '10:100:2'`).get() },
    {
      contributor_name: "Latest Grace",
      profession: "Masonry",
      craft_label: "Stone blocks",
      structure_name: "Mason",
      item_tier: "4",
      contributed_progress: "5",
      contributed_xp: "8",
      contribution_count: "2",
    },
  );
  db.close();
});
