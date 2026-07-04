import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const helperUrl = new URL("../src/pages/dashboard/dashboardRecentActivity.ts", import.meta.url);

async function loadHelper() {
  assert.equal(existsSync(helperUrl), true, "dashboard recent activity helper should exist");
  return import(helperUrl.href);
}

test("dashboard recent activity excludes production start and completion rows", async () => {
  const { dashboardRecentActivityItems } = await loadHelper();
  const rows = [
    { id: 1, event_type: "production_started", summary: "Craft started: Basic Ink", occurred_at: "2026-07-03T10:05:00.000Z" },
    { id: 2, event_type: "market_new_listing", summary: "New market listing: Rough Plank", occurred_at: "2026-07-03T10:04:00.000Z" },
    { id: 3, event_type: "production_completed", summary: "Craft completed: Basic Pigment", occurred_at: "2026-07-03T10:03:00.000Z" },
    { id: 4, event_type: "members", summary: "+1 member", occurred_at: "2026-07-03T10:02:00.000Z" },
  ];

  assert.deepEqual(dashboardRecentActivityItems(rows).map((row) => row.summary), [
    "New market listing: Rough Plank",
    "+1 member",
  ]);
});

test("dashboard recent activity applies the display limit after filtering", async () => {
  const { dashboardRecentActivityItems } = await loadHelper();
  const rows = [
    { id: 1, event_type: "production_started", summary: "Craft started: Basic Ink", occurred_at: "2026-07-03T10:06:00.000Z" },
    { id: 2, event_type: "market_sale", summary: "Confirmed sale", occurred_at: "2026-07-03T10:05:00.000Z" },
    { id: 3, event_type: "members", summary: "+1 member", occurred_at: "2026-07-03T10:04:00.000Z" },
    { id: 4, event_type: "market_new_listing", summary: "New listing", occurred_at: "2026-07-03T10:03:00.000Z" },
  ];

  assert.deepEqual(dashboardRecentActivityItems(rows, 2).map((row) => row.summary), [
    "Confirmed sale",
    "+1 member",
  ]);
});

test("dashboard recent activity keeps treasury and supply rows visible", async () => {
  const { dashboardRecentActivityItems } = await loadHelper();
  const rows = [
    { id: 1, event_type: "production_started", summary: "Craft started: Basic Ink", occurred_at: "2026-07-03T10:05:00.000Z" },
    { id: 2, event_type: "treasury", summary: "Treasury changed", occurred_at: "2026-07-03T10:04:00.000Z" },
    { id: 3, event_type: "supplies", summary: "Supplies changed", occurred_at: "2026-07-03T10:03:00.000Z" },
    { id: 4, event_type: "production_completed", summary: "Craft completed: Basic Pigment", occurred_at: "2026-07-03T10:02:00.000Z" },
  ];

  assert.deepEqual(dashboardRecentActivityItems(rows).map((row) => row.summary), [
    "Treasury changed",
    "Supplies changed",
  ]);
});
