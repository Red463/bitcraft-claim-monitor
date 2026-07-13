import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPersonalFishingView,
  normalizeFishingRoutePreference,
} from "../src/pages/craftPlanningFishingView.ts";

function makeCell(name, { required, missing, available = 0, inProgress = 0, guaranteedInProgress = inProgress, estimatedInProgress = 0 } = {}) {
  const item = { key: `items:${name.toLowerCase().replaceAll(" ", "-")}`, name, kind: "items" };
  return {
    item,
    items: [item],
    name,
    missing,
    required,
    available,
    inProgress,
    guaranteedInProgress,
    estimatedInProgress,
  };
}

function makeRow(name, cell, { apiName = name, displayName = name, overrideKey = `tag:${apiName}` } = {}) {
  return {
    name: displayName,
    apiName,
    overrideKey,
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
        ocean: { available: true, input: oceanInput, guaranteedYield: 3, stockQuantity: 0, trackedQuantity: 0, needed: 15, usage: { outputKey: "items:oil", output: { key: "items:oil", name: "Basic Fish Oil", quantity: 45 }, recipeName: "Press Ocean Fish Oil", selectedRecipeId: "ocean-route", requiredQuantity: 15, quantityPerCraft: 1, craftCount: 15, alternatives: [] } },
        lake: { available: true, input: lakeInput, guaranteedYield: 1, stockQuantity: 0, trackedQuantity: 0, needed: 45, usage: { outputKey: "items:oil", output: { key: "items:oil", name: "Basic Fish Oil", quantity: 45 }, recipeName: "Press Lake Fish Oil", selectedRecipeId: "lake-route", requiredQuantity: 45, quantityPerCraft: 1, craftCount: 45, alternatives: [] } },
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
  assert.equal("plannedOutput" in cell, false);
  assert.equal(cell?.items[0].recipeUsages[0].output.name, "Basic Fish Oil");
  assert.equal(cell?.items[0].recipeUsages[0].requiredQuantity, 45);
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

test("personal fishing projection preserves authoritative stock source metadata", () => {
  const board = makeBoard();
  const oceanCell = board[0].rows.find((row) => row.apiName === "Ocean Fish").cells.get("T1");
  oceanCell.item.sources = [{ sourceId: "store-1", label: "Fishing chest", type: "Settlement storage", quantity: 5 }];
  oceanCell.items = [oceanCell.item];
  const view = makeRouteView();
  view.tiers[0].routes.ocean.stockQuantity = 5;

  const result = applyPersonalFishingView(board, view, "ocean");
  const projected = result.board[0].rows.find((row) => row.apiName === "Ocean Fish").cells.get("T1");

  assert.equal(projected.available, 5);
  assert.deepEqual(projected.items[0].sources, [{ sourceId: "store-1", label: "Fishing chest", type: "Settlement storage", quantity: 5 }]);
});

test("personal fishing projection carries route stock, tracked crafts, and rich usage metadata", () => {
  const board = makeBoard();
  const ocean = board[0].rows.find((row) => row.apiName === "Ocean Fish");
  ocean.cells.set("T1", {
    ...ocean.cells.get("T1"),
    items: [makeCell("Other Ocean Fish", { required: 1, missing: 1 }).item, ocean.cells.get("T1").item],
  });
  const view = makeRouteView();
  const route = view.tiers[0].routes.ocean;
  route.stockQuantity = 7;
  route.trackedQuantity = 3;
  route.guaranteedTrackedQuantity = 1;
  route.estimatedTrackedQuantity = 2;
  route.sources = [{ sourceId: "store-1", label: "Fishing chest", type: "Settlement storage", quantity: 7 }];
  route.activeCraftSources = [{ sourceId: "craft-1", buildingName: "Fishing Station", quantity: 2 }];
  route.usage.buildingName = "Fine Fishing Station";
  route.usage.alternatives = [{
    id: "ocean-route",
    label: "Press Ocean Fish Oil",
    buildingName: "Fine Fishing Station",
    inputs: [{ ...route.input, quantity: 1 }],
  }];

  const result = applyPersonalFishingView(board, view, "ocean");
  const projected = result.board[0].rows.find((row) => row.apiName === "Ocean Fish").cells.get("T1");
  const item = projected.items[0];

  assert.equal(projected.available, 7);
  assert.equal(projected.inProgress, 3);
  assert.equal(projected.guaranteedInProgress, 1);
  assert.equal(projected.estimatedInProgress, 2);
  assert.deepEqual(item.sources, route.sources);
  assert.deepEqual(item.activeCraftSources, route.activeCraftSources);
  assert.equal(item.recipeUsages[0].buildingName, "Fine Fishing Station");
  assert.equal(item.recipeUsages[0].alternatives[0].inputs[0].name, "Briny Linus");
});

test("matches canonical fishing rows by stable API identity when display names are overridden", () => {
  const board = makeBoard();
  const ocean = board[0].rows.find((row) => row.apiName === "Ocean Fish");
  const lake = board[0].rows.find((row) => row.apiName === "Lake Fish");
  ocean.name = "Open Water Catch";
  ocean.rowNameOverride = "Open Water Catch";
  lake.name = "Inland Catch";
  lake.rowNameOverride = "Inland Catch";

  const result = applyPersonalFishingView(board, makeRouteView(), "lake");
  const fishing = result.board[0];

  assert.equal(fishing.rows.filter((row) => row.apiName === "Ocean Fish").length, 0);
  assert.equal(fishing.rows.filter((row) => row.apiName === "Lake Fish").length, 1);
  assert.equal(fishing.rows.some((row) => row.name === "Open Water Catch"), false);
  assert.equal(fishing.rows.find((row) => row.apiName === "Lake Fish")?.cells.get("T1")?.name, "Briny Argus");
});

test("rejects malformed projection numbers instead of coercing them", () => {
  const malformedValues = [
    ["tier", (view) => { view.tiers[0].tier = "1"; }],
    ["guaranteed yield", (view) => { view.tiers[0].routes.ocean.guaranteedYield = "3"; }],
    ["needed", (view) => { view.tiers[0].routes.ocean.needed = "15"; }],
    ["stock quantity", (view) => { view.tiers[0].routes.ocean.stockQuantity = null; }],
    ["tracked quantity", (view) => { view.tiers[0].routes.ocean.trackedQuantity = false; }],
  ];

  for (const [label, corrupt] of malformedValues) {
    const board = makeBoard();
    const view = makeRouteView();
    corrupt(view);
    const result = applyPersonalFishingView(board, view, "ocean");

    assert.strictEqual(result.board, board, `${label} should preserve the authoritative board`);
    assert.equal(result.available, false, `${label} should make the personal view unavailable`);
    assert.equal(result.reason, "Verified Ocean Fish route unavailable");
  }
});

test("transforms every available projected tier without dropping the tier matrix", () => {
  const board = makeBoard();
  const ocean = board[0].rows.find((row) => row.apiName === "Ocean Fish");
  ocean.cells.set("T2", makeCell("Ocean Fish T2", { required: 30, missing: 30 }));
  const view = makeRouteView();
  view.tiers.push({
    tier: 2,
    routes: {
      ocean: { available: true, input: { key: "items:ocean-2", id: "ocean-2", kind: "items", name: "Deep Linus", tag: "Ocean Fish", tier: 2 }, guaranteedYield: 2, stockQuantity: 0, trackedQuantity: 0, needed: 12 },
      lake: { available: true, input: { key: "items:lake-2", id: "lake-2", kind: "items", name: "Deep Argus", tag: "Lake Fish", tier: 2 }, guaranteedYield: 1, stockQuantity: 0, trackedQuantity: 0, needed: 24 },
    },
  });

  const result = applyPersonalFishingView(board, view, "ocean");
  const oceanRow = result.board[0].rows.find((row) => row.apiName === "Ocean Fish");

  assert.deepEqual([...oceanRow.cells.keys()], ["T1", "T2"]);
  assert.equal(oceanRow.cells.get("T1")?.missing, 15);
  assert.equal(oceanRow.cells.get("T2")?.missing, 12);
  assert.equal(result.board[0].rows.filter((row) => row.apiName === "Lake Fish").length, 0);
});

test("rejects a selected canonical row with an unprojected authoritative tier", () => {
  const board = makeBoard();
  const ocean = board[0].rows.find((row) => row.apiName === "Ocean Fish");
  ocean.cells.set("T2", makeCell("Stale Ocean Fish T2", { required: 30, missing: 30 }));
  const originalBoard = structuredClone(board);

  const result = applyPersonalFishingView(board, makeRouteView(), "ocean");

  assert.strictEqual(result.board, board);
  assert.deepEqual(board, originalBoard);
  assert.equal(result.available, false);
  assert.equal(result.reason, "Verified Ocean Fish route unavailable");
});

test("rejects an unselected canonical row with an unprojected authoritative tier", () => {
  const board = makeBoard();
  const lake = board[0].rows.find((row) => row.apiName === "Lake Fish");
  lake.cells.set("T2", makeCell("Stale Lake Fish T2", { required: 30, missing: 30 }));
  const originalBoard = structuredClone(board);

  const result = applyPersonalFishingView(board, makeRouteView(), "ocean");

  assert.strictEqual(result.board, board);
  assert.deepEqual(board, originalBoard);
  assert.equal(result.available, false);
  assert.equal(result.reason, "Verified Ocean Fish route unavailable");
});

test("keeps the authoritative board when a canonical route has a section override", () => {
  const board = makeBoard();
  const fishing = board[0];
  const lake = fishing.rows.find((row) => row.apiName === "Lake Fish");
  fishing.rows = fishing.rows.filter((row) => row !== lake);
  lake.sectionOverride = "Cooking";
  board.push({ section: "Cooking", rows: [lake], required: 20, covered: 0, completion: 0 });
  const originalBoard = structuredClone(board);

  const result = applyPersonalFishingView(board, makeRouteView(), "ocean");

  assert.strictEqual(result.board, board);
  assert.deepEqual(board, originalBoard);
  assert.equal(result.available, false);
  assert.equal(result.reason, "Verified Ocean Fish route unavailable");
});

test("returns the untouched board when any projected tier lacks the selected route", () => {
  const board = makeBoard();
  const originalBoard = structuredClone(board);
  const view = makeRouteView();
  view.tiers.push({
    tier: 2,
    routes: {
      lake: { available: true, input: { key: "items:lake-2", id: "lake-2", kind: "items", name: "Deep Argus", tag: "Lake Fish", tier: 2 }, guaranteedYield: 1, stockQuantity: 0, trackedQuantity: 0, needed: 24 },
    },
  });

  const result = applyPersonalFishingView(board, view, "ocean");

  assert.strictEqual(result.board, board);
  assert.deepEqual(board, originalBoard);
  assert.equal(result.available, false);
  assert.equal(result.reason, "Verified Ocean Fish route unavailable");
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
