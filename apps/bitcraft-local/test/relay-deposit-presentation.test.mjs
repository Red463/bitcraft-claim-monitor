import assert from "node:assert/strict";
import test from "node:test";

const {
  presentDepositStatus,
  summarizeDeposits,
} = await import(
  new URL("../src/pages/empires/depositPresentation.ts", import.meta.url).href,
);

test("deposit status never promotes unknown or overdue rows to active", () => {
  const now = Date.parse("2026-08-05T00:00:00.000Z");

  assert.deepEqual(presentDepositStatus({ status: "active" }, now), {
    label: "Active",
    tone: "good",
    harvestable: true,
  });
  assert.deepEqual(presentDepositStatus({ status: "unknown" }, now), {
    label: "Unknown",
    tone: "muted",
    harvestable: false,
  });
  assert.deepEqual(presentDepositStatus({
    status: "respawning",
    respawnAt: "2026-08-04T23:00:00.000Z",
  }, now), {
    label: "Respawn overdue",
    tone: "warn",
    harvestable: false,
  });
});

test("deposit summary counts explicit states and selects the next future respawn", () => {
  const summary = summarizeDeposits([
    { entityId: "1", status: "active" },
    { entityId: "2", status: "unknown" },
    { entityId: "3", status: "respawning", respawnAt: "2026-08-06T00:00:00.000Z" },
    { entityId: "4", status: "respawning", respawnAt: "2026-08-05T12:00:00.000Z" },
    { entityId: "5", status: "respawning", respawnAt: "2026-08-04T23:00:00.000Z" },
  ], Date.parse("2026-08-05T00:00:00.000Z"));

  assert.deepEqual(summary, {
    total: 5,
    active: 1,
    respawning: 3,
    unknown: 1,
    nextRespawnAt: "2026-08-05T12:00:00.000Z",
  });
});
