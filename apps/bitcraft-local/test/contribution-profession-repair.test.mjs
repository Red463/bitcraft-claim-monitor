import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  applyContributionProfessionRepair,
  createContributionProfessionManifest,
} from "../src/server/contributionProfessionRepair.mjs";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE domain_payload_current (claim_id TEXT, domain TEXT, data_json TEXT);
    CREATE TABLE production_contributions (contribution_key TEXT PRIMARY KEY, claim_id TEXT, craft_entity_id TEXT, profession TEXT, raw_json TEXT);
    CREATE TABLE production_contribution_events (source_key TEXT PRIMARY KEY, claim_id TEXT, craft_entity_id TEXT, raw_json TEXT);
  `);
  db.prepare("INSERT INTO domain_payload_current VALUES (?, 'crafts', ?)").run("10", JSON.stringify({
    craftResults: [
      { entityId: "100", levelRequirements: [{ skillId: "3" }] },
      { entityId: "200", levelRequirements: [] },
    ],
  }));
  db.prepare("INSERT INTO production_contributions VALUES (?, ?, ?, ?, ?)").run("10:100:1", "10", "100", null, "{}");
  db.prepare("INSERT INTO production_contributions VALUES (?, ?, ?, ?, ?)").run("10:200:1", "10", "200", null, "{}");
  db.prepare("INSERT INTO production_contribution_events VALUES (?, ?, ?, ?)").run("event-100", "10", "100", JSON.stringify({ contributorName: "Ada" }));
  return db;
}

test("profession repair selects only exact durable craft skill evidence", () => {
  const db = database();
  const manifest = createContributionProfessionManifest(db, "10");

  assert.deepEqual(manifest.selection.aggregates, [{ id: "10:100:1", before: null, after: "Carpentry", craftEntityId: "100", skillId: "3" }]);
  assert.deepEqual(manifest.selection.events, [{ id: "event-100", before: null, after: "Carpentry", craftEntityId: "100", skillId: "3" }]);
  assert.equal(manifest.counts.unverifiableAggregates, 1);
  db.close();
});

test("profession repair applies its exact manifest and rejects changed evidence", () => {
  const db = database();
  const manifest = createContributionProfessionManifest(db, "10");
  applyContributionProfessionRepair(db, manifest);
  assert.equal(db.prepare("SELECT profession FROM production_contributions WHERE contribution_key = '10:100:1'").get().profession, "Carpentry");
  assert.equal(JSON.parse(db.prepare("SELECT raw_json FROM production_contribution_events WHERE source_key = 'event-100'").get().raw_json).profession, "Carpentry");

  const changed = database();
  changed.prepare("UPDATE domain_payload_current SET data_json = ?").run(JSON.stringify({ craftResults: [{ entityId: "100", levelRequirements: [{ skillId: "6" }] }] }));
  assert.throws(() => applyContributionProfessionRepair(changed, manifest), /selection changed/i);
  db.close();
  changed.close();
});
