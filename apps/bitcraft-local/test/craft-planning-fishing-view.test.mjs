import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPersonalFishingView,
  normalizeFishingRoutePreference,
} from "../src/pages/craftPlanningFishingView.ts";

function makeCell(name, { required, missing, available = 0, inProgress = 0, plannedOutput = 0 } = {}) {
  const item = { key: `items:${name.toLowerCase().replaceAll(" ", "-")}`, name, kind: "items" };
  return {
    item,
    items: [item],
    name,
    missing,
    required,
    available,
    inProgress,
    plannedOutput,
  };
}

function makeRow(name, cell, { apiName = name } = {}) {
  return {
    name,
    apiName,
    overrideKey: `tag:${name}`,
    apiSection: "Fishing",
    sectionOverride: null,
    rowNameOverride: null,
    maxMissing: cell.missing,
    cells: new Map([["T1", cell]]),
  };
}

function makeBoard() {
  const fishingRows = [
    makeRow("Fish Oil", makeCell("Fish Oil", { required: 100, missing: 45, available: 10, inProgress: 5 })),
    makeRow("Ocean Fish", makeCell("Ocean Fish", { required: 20, missing: 20 })),
    makeRow("Lake Fish", makeCell("Lake Fish", { required: 20, missing: 20 })),
    makeRow("Baitfish", makeCell("Baitfish", { required: 8, missing: 8 })),
    makeRow("Crushed Shells", makeCell("Crushed Shells", { required: 6, missing: 6 })),
  ];
  return [{
    section: "Fishing",
    rows: fishingRows,
    required: 154,
    covered: 15,
    completion: 9.7,
  }];
}

function makeRouteView() {
  const oceanInput = { key: "items:ocean", id: "ocean", kind: "items", name: "Briny Linus", tag: "Ocean Fish", tier: 1 };
  const lakeInput = { key: "items:lake", id: "lake", kind: "items", name: "Briny Argus", tag: "Lake Fish", tier: 1 };
  return {
    tiers: [{
      tier: 1,
      outputKey: "items:oil",
      output: { key: "items:oil", id: "oil", kind: "items", name: "Basic Fish Oil", tag: "Fish Oil", tier: 1 },
      requiredOil: 100,
      availableOil: 10,
      trackedOil: 5,
      remainingOil: 45,
      routes: {
        ocean: { available: true, input: oceanInput, guaranteedYield: 3, stockQuantity: 0, trackedQuantity: 0, needed: 15 },
        lake: { available: true, input: lakeInput, guaranteedYield: 1, stockQuantity: 0, trackedQuantity: 0, needed: 45 },
      },
    }],
  };
}

test("normalizes unknown fishing route preferences to ocean", () => {
  assert.equal(normalizeFishingRoutePreference("lake"), "lake");
  assert.equal(normalizeFishingRoutePreference("ocean"), "ocean");
  assert.equal(normalizeFishingRoutePreference("invalid"), "ocean");
  assert.equal(normalizeFishingRoutePreference(undefined), "ocean");
});

test("applies the lake route without mutating the authoritative board", () => {
  const board = makeBoard();
  const originalBoard = structuredClone(board);
  const originalFishing = board[0];
  const originalFishOil = originalFishing.rows.find((row) => row.name === "Fish Oil");
  const result = applyPersonalFishingView(board, makeRouteView(), "lake");
  const fishing = result.board.find((group) => group.section === "Fishing");

  assert.equal(result.available, true);
  assert.equal(result.reason, null);
  assert.notStrictEqual(result.board, board);
  assert.notStrictEqual(fishing, originalFishing);
  assert.strictEqual(fishing.rows.find((row) => row.name === "Fish Oil"), originalFishOil);
  assert.deepEqual(board, originalBoard);
  assert.equal(fishing.rows.some((row) => row.name === "Ocean Fish"), false);

  const lake = fishing.rows.find((row) => row.name === "Lake Fish");
  assert.ok(lake);
  const cell = lake.cells.get("T1");
  assert.equal(cell?.name, "Briny Argus");
  assert.equal(cell?.missing, 45);
  assert.equal(cell?.required, 45);
  assert.equal(cell?.available, 0);
  assert.equal(cell?.inProgress, 0);
  assert.equal(cell?.plannedOutput, 0);
  assert.equal(fishing.required, 159);
  assert.equal(fishing.covered, 15);
  assert.equal(fishing.completion, 9.4);
});

test("applies the ocean route and replaces only the interchangeable fish row", () => {
  const board = makeBoard();
  const result = applyPersonalFishingView(board, makeRouteView(), "ocean");
  const fishing = result.board[0];

  assert.equal(fishing.rows.some((row) => row.name === "Lake Fish"), false);
  const ocean = fishing.rows.find((row) => row.name === "Ocean Fish");
  assert.ok(ocean);
  assert.equal(ocean.cells.get("T1")?.name, "Briny Linus");
  assert.equal(ocean.cells.get("T1")?.missing, 15);
  assert.equal(fishing.rows.find((row) => row.name === "Baitfish")?.cells.get("T1")?.missing, 8);
  assert.equal(fishing.rows.find((row) => row.name === "Crushed Shells")?.cells.get("T1")?.missing, 6);
});

test("keeps the authoritative board when the selected route is unavailable", () => {
  const board = makeBoard();
  const view = makeRouteView();
  view.tiers[0].routes.lake = { available: false, reason: "Verified route unavailable" };

  const result = applyPersonalFishingView(board, view, "lake");

  assert.strictEqual(result.board, board);
  assert.equal(result.available, false);
  assert.equal(result.reason, "Verified Lake Fish route unavailable");
});

test("keeps the authoritative board when the fishing view is missing", () => {
  const board = makeBoard();
  const result = applyPersonalFishingView(board, null, "ocean");

  assert.strictEqual(result.board, board);
  assert.equal(result.available, false);
  assert.equal(result.reason, "Verified Ocean Fish route unavailable");
});
