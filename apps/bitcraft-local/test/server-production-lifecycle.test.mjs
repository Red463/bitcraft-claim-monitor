import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { createPreparedStatements } from "../src/server/preparedStatements.mjs";
import { applyAdditiveColumnMigrations } from "../src/server/schemaMigrations.mjs";
import { recordProductionJobs } from "../src/server/productionLifecycle.mjs";

test("authoritative completed Relay craft closes the active lifecycle immediately", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  const statements = createPreparedStatements(db);
  const baseCraft = {
    entityId: "craft-42",
    claimEntityId: "claim-1",
    buildingName: "Public Workshop",
    ownerUsername: "Tester",
    isPublic: true,
    completed: false,
    craftedItem: [{ item_id: "2020003", item_type: "0" }],
    totalActionsRequired: 100,
    progress: 20,
  };
  const craftsPayload = (craft) => ({
    craftResults: [craft],
    items: [{ id: "2020003", name: "Simple Plank", itemType: "0", tier: 2 }],
    cargos: [],
  });
  const options = {
    statements,
    claimId: "claim-1",
    missingGraceMs: 120_000,
    now: () => Date.parse("2026-07-30T12:01:00.000Z"),
    diagnosticContext: (_eventType, metadata) => metadata,
    notificationSkipReason: () => null,
    isStartAgeGateSkip: () => false,
  };

  recordProductionJobs({
    ...options,
    craftsPayload: craftsPayload(baseCraft),
    occurredAt: "2026-07-30T12:00:00.000Z",
  });
  const result = recordProductionJobs({
    ...options,
    craftsPayload: craftsPayload({ ...baseCraft, completed: true }),
    occurredAt: "2026-07-30T12:01:00.000Z",
  });

  assert.deepEqual(
    db.prepare("SELECT job_key, status FROM production_jobs").all().map((row) => ({ ...row })),
    [{
      job_key: "craft|claim-1|public workshop|recipe|2020003|0|public",
      status: "completed",
    }],
  );
  assert.deepEqual(
    db.prepare("SELECT event_type, source_key FROM activity_events").all().map((row) => ({ ...row })),
    [{
      event_type: "production_completed",
      source_key: "production_completed:craft|claim-1|public workshop|recipe|2020003|0|public",
    }],
  );
  assert.deepEqual(
    result.pendingNotifications.map(({ eventType, jobKey, sourceKey }) => ({ eventType, jobKey, sourceKey })),
    [{
      eventType: "production_completed",
      jobKey: "craft|claim-1|public workshop|recipe|2020003|0|public",
      sourceKey: "production_completed:craft|claim-1|public workshop|recipe|2020003|0|public",
    }],
  );
  db.close();
});
