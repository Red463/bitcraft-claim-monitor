import assert from "node:assert/strict";
import test from "node:test";

import { buildNeedsBoard, filterNeedsBoard, needsBoardCompletion } from "../src/pages/craftPlanningNeedsBoard.ts";

test("Needs Board covers quantities with guaranteed output only", () => {
  const board = buildNeedsBoard([{
    key: "items:1",
    name: "Plank",
    tag: "Plank",
    tier: 1,
    section: "Carpentry",
    required: 10,
    available: 2,
    inProgress: 7,
    guaranteedInProgress: 3,
    estimatedInProgress: 4,
    missing: 5,
  }], []);
  assert.equal(board[0].covered, 5);
});

test("buildNeedsBoard groups enriched API items by tag and authoritative tier", () => {
  const board = buildNeedsBoard([
    {
      key: "items:6130004",
      id: "6130004",
      kind: "items",
      name: "Peerless Berry",
      tag: "Berry",
      tier: 6,
      section: "Foraging",
      required: 50,
      available: 8,
      inProgress: 0,
      missing: 42,
    },
  ], []);

  assert.equal(board.length, 1);
  assert.equal(board[0].section, "Foraging");
  assert.equal(board[0].rows.length, 1);
  assert.equal(board[0].rows[0].name, "Berry");
  assert.equal(board[0].rows[0].cells.has("T6"), true);
  assert.equal(board[0].rows[0].cells.has("Materials"), false);
  assert.equal(board[0].rows[0].cells.get("T6")?.missing, 42);
});



test("buildNeedsBoard merges concrete item names into one row when API tags match", () => {
  const board = buildNeedsBoard([
    {
      key: "items:2120001",
      id: "2120001",
      kind: "items",
      name: "Simple Wispweave Filament",
      tag: "Wispweave Filament",
      tier: 2,
      section: "Farming",
      required: 100,
      available: 10,
      inProgress: 0,
      missing: 90,
    },
    {
      key: "items:3120001",
      id: "3120001",
      kind: "items",
      name: "Infused Wispweave Filament",
      tag: "Wispweave Filament",
      tier: 3,
      section: "Farming",
      required: 50,
      available: 5,
      inProgress: 0,
      missing: 45,
    },
    {
      key: "items:5120001",
      id: "5120001",
      kind: "items",
      name: "Exquisite Wispweave Filament",
      tag: "Wispweave Filament",
      tier: 5,
      section: "Farming",
      required: 25,
      available: 0,
      inProgress: 0,
      missing: 25,
    },
  ], []);

  assert.equal(board.length, 1);
  assert.equal(board[0].rows.length, 1);
  assert.equal(board[0].rows[0].name, "Filament");
  assert.equal(board[0].rows[0].cells.get("T2")?.name, "Simple Wispweave Filament");
  assert.equal(board[0].rows[0].cells.get("T3")?.name, "Infused Wispweave Filament");
  assert.equal(board[0].rows[0].cells.get("T5")?.name, "Exquisite Wispweave Filament");
  assert.equal(board[0].rows[0].cells.has("Materials"), false);
});

test("buildNeedsBoard keeps satisfied prerequisites when an unfinished recipe still needs them", () => {
  const board = buildNeedsBoard([
    {
      key: "items:102001",
      id: "102001",
      kind: "items",
      name: "Simple Plank",
      tag: "Plank",
      tier: 1,
      section: "Carpentry",
      required: 1880,
      available: 2500,
      inProgress: 0,
      missing: 0,
      recipeUsages: [{ output: { name: "Refined Simple Plank" } }],
    },
  ], []);

  assert.equal(board.length, 1);
  const cell = board[0].rows[0].cells.get("T1");
  assert.equal(cell?.missing, 0);
  assert.equal(cell?.required, 1880);
  assert.equal(cell?.available, 2500);
});

test("buildNeedsBoard ignores fully stocked items that are not used by the current recipe chain", () => {
  const board = buildNeedsBoard([
    {
      key: "items:102001",
      id: "102001",
      kind: "items",
      name: "Simple Plank",
      tag: "Plank",
      tier: 1,
      section: "Carpentry",
      required: 10,
      available: 100,
      inProgress: 0,
      missing: 0,
      recipeUsages: [],
    },
  ], []);

  assert.deepEqual(board, []);
});
test("buildNeedsBoard splits generic trade-good tags by actual item name", () => {
  const board = buildNeedsBoard([
    {
      key: "items:1",
      id: "1",
      kind: "items",
      name: "Guild Ledger",
      tag: "Trade Good",
      section: "Carpentry",
      required: 10,
      missing: 10,
    },
    {
      key: "items:2",
      id: "2",
      kind: "items",
      name: "Merchant Contract",
      tag: "Trade Good",
      section: "Carpentry",
      required: 5,
      missing: 5,
    },
  ], []);

  assert.deepEqual(board[0].rows.map((row) => row.name).sort(), ["Guild Ledger", "Merchant Contract"]);
});
test("buildNeedsBoard exposes stable section override row metadata", () => {
  const board = buildNeedsBoard([
    {
      key: "items:305",
      id: "305",
      kind: "items",
      name: "Refined Simple Plank",
      tag: "Refined Plank",
      tier: 2,
      section: "Carpentry",
      apiSection: "Scholar",
      sectionOverrideKey: "tag:Refined Plank",
      sectionOverride: "Carpentry",
      required: 10,
      missing: 10,
    },
  ], []);

  assert.equal(board[0].rows[0].overrideKey, "tag:Refined Plank");
  assert.equal(board[0].rows[0].apiSection, "Scholar");
  assert.equal(board[0].rows[0].sectionOverride, "Carpentry");
});

test("buildNeedsBoard uses row name overrides without changing the stable row key", () => {
  const board = buildNeedsBoard([
    {
      key: "items:305",
      id: "305",
      kind: "items",
      name: "Refined Simple Plank",
      tag: "Refined Plank",
      tier: 2,
      section: "Scholar",
      apiSection: "Scholar",
      sectionOverrideKey: "tag:Refined Plank",
      rowNameOverride: "Finished Planks",
      required: 10,
      missing: 10,
    },
  ], []);

  assert.equal(board[0].rows[0].name, "Finished Planks");
  assert.equal(board[0].rows[0].apiName, "Refined Plank");
  assert.equal(board[0].rows[0].overrideKey, "tag:Refined Plank");
  assert.equal(board[0].rows[0].cells.get("T2")?.name, "Refined Simple Plank");
});

test("buildNeedsBoard keeps satisfied prerequisites represented by a compact usage flag", () => {
  const board = buildNeedsBoard([{
    key: "items:102001",
    id: "102001",
    kind: "items",
    name: "Simple Plank",
    tag: "Plank",
    tier: 1,
    section: "Carpentry",
    required: 1880,
    available: 2500,
    inProgress: 0,
    missing: 0,
    hasRecipeUsages: true,
  }], []);

  assert.equal(board.length, 1);
  assert.equal(board[0].rows[0].cells.get("T1")?.available, 2500);
});

test("buildNeedsBoard applies canonical operational rows and hides internal cycle intermediates", () => {
  const board = buildNeedsBoard([
    { key: "items:1", name: "Basic Wispweave Filament", tag: "Wispweave Filament", tier: 1, section: "Farming", required: 20, missing: 10 },
    { key: "items:2", name: "Simple Wispweave Seeds", tag: "Filament Seeds", tier: 2, section: "Farming", required: 30, missing: 30 },
    { key: "items:3", name: "Simple Lake Fish Filet", tag: "Lake Fish Filet", tier: 2, section: "Fishing", required: 12, missing: 12 },
    { key: "items:4", name: "Simple Lake Fish", tag: "Lake Fish", tier: 2, section: "Fishing", required: 12, missing: 12 },
    { key: "items:5", name: "Food Waste", tag: "Food Waste", tier: 1, section: "Farming", required: 8, missing: 8 },
  ], []);

  assert.deepEqual(board.map((group) => [group.section, group.rows.map((row) => row.name)]), [
    ["Farming", ["Filament"]],
    ["Fishing", ["Lake Fish"]],
  ]);
});

test("buildNeedsBoard follows stable workflow order and appends unknown API tags", () => {
  const board = buildNeedsBoard([
    { key: "items:1", name: "Rough Sandpaper", tag: "Woodworking Sandpaper", tier: null, section: "Carpentry", required: 1, missing: 1 },
    { key: "items:2", name: "Rough Plank", tag: "Plank", tier: 1, section: "Carpentry", required: 1000, missing: 900 },
    { key: "items:3", name: "Rough Stripped Wood", tag: "Stripped Wood", tier: 1, section: "Carpentry", required: 2, missing: 2 },
    { key: "items:4", name: "Unknown Future Part", tag: "Unknown Future Part", tier: 1, section: "Carpentry", required: 5000, missing: 5000 },
    { key: "items:5", name: "Water", tag: "Water", tier: null, section: "Carpentry", required: 20, missing: 20 },
    { key: "items:6", name: "Refined Rough Plank", tag: "Refined Plank", tier: 1, section: "Carpentry", required: 5, missing: 5 },
  ], []);

  assert.deepEqual(board[0].rows.map((row) => row.name), [
    "Stripped Wood",
    "Plank",
    "Water",
    "Refined Plank",
    "Woodworking Sandpaper",
    "Unknown Future Part",
  ]);
});

test("buildNeedsBoard follows Sync ordering for operational rows and sections", () => {
  const board = buildNeedsBoard([
    { key: "items:1", name: "Basic Citric Berry", tag: "Citric Berry", tier: 1, section: "Foraging", required: 1, missing: 1 },
    { key: "items:2", name: "Basic Berry", tag: "Berry", tier: 1, section: "Foraging", required: 1, missing: 1 },
    { key: "items:3", name: "Basic Leather", tag: "Leather", tier: 1, section: "Leatherworking", required: 1, missing: 1 },
    { key: "items:4", name: "Basic Cloth", tag: "Cloth", tier: 1, section: "Tailoring", required: 1, missing: 1 },
    { key: "items:5", name: "Basic Animal Food", tag: "Animal Food", tier: 1, section: "Taming", required: 1, missing: 1 },
  ], []);

  assert.deepEqual(board.map((group) => [group.section, group.rows.map((row) => row.name)]), [
    ["Foraging", ["Berry", "Citric Berry"]],
    ["Leatherwork", ["Leather"]],
    ["Tailoring", ["Cloth"]],
    ["Taming", ["Animal Food"]],
  ]);
});

test("buildNeedsBoard merges known cloth rows and Tailoring API fallbacks into one section", () => {
  const board = buildNeedsBoard([
    { key: "items:1", name: "Peerless Cloth", tag: "Cloth", tier: 5, section: "Tailoring", required: 125, missing: 125 },
    { key: "items:2", name: "Thread", tag: "Thread", tier: 5, section: "Tailoring", required: 150, available: 177, missing: 0, recipeUsages: [{}] },
  ], []);

  assert.equal(board.filter((group) => group.section === "Tailoring").length, 1);
  assert.deepEqual(board.map((group) => group.section), ["Tailoring"]);
  assert.deepEqual(board[0].rows.map((row) => row.name), ["Cloth", "Thread"]);
});

test("buildNeedsBoard calculates section completion from required and covered quantities", () => {
  const board = buildNeedsBoard([
    { key: "items:1", name: "Rough Plank", tag: "Plank", tier: 1, section: "Carpentry", required: 100, available: 75, inProgress: 5, guaranteedInProgress: 2, estimatedInProgress: 3, missing: 20 },
    { key: "items:2", name: "Simple Plank", tag: "Plank", tier: 2, section: "Carpentry", required: 100, available: 100, inProgress: 0, missing: 0, recipeUsages: [{}] },
  ], []);

  assert.equal(board[0].required, 200);
  assert.equal(board[0].covered, 177);
  assert.equal(board[0].completion, 88.5);
  assert.equal(board[0].rows[0].cells.get("T1")?.guaranteedInProgress, 2);
  assert.equal(board[0].rows[0].cells.get("T1")?.estimatedInProgress, 3);
  assert.equal(board[0].rows[0].cells.get("T2")?.guaranteedInProgress, 0);
  assert.equal(board[0].rows[0].cells.get("T2")?.estimatedInProgress, 0);
});

test("buildNeedsBoard treats legacy in-progress coverage as guaranteed", () => {
  const board = buildNeedsBoard([{
    key: "items:legacy",
    name: "Legacy Plank",
    tag: "Plank",
    tier: 1,
    section: "Carpentry",
    required: 10,
    available: 0,
    inProgress: 5,
    missing: 5,
    recipeUsages: [{}],
  }], []);
  const cell = board[0].rows[0].cells.get("T1");

  assert.equal(cell?.guaranteedInProgress, 5);
  assert.equal(cell?.estimatedInProgress, 0);
});

test("buildNeedsBoard ignores legacy forecast output when calculating coverage", () => {
  const board = buildNeedsBoard([{
    key: "items:gypsite",
    name: "Sturdy Gypsite",
    tag: "Gypsite",
    tier: 3,
    section: "Foraging",
    required: 78,
    available: 0,
    inProgress: 0,
    plannedOutput: 25.52,
    missing: 78,
    recipeUsages: [{}],
  }], []);
  const cell = board[0].rows[0].cells.get("T3");

  assert.equal(cell?.available, 0);
  assert.equal(cell?.inProgress, 0);
  assert.equal("plannedOutput" in cell, false);
  assert.deepEqual(needsBoardCompletion(board), { required: 78, covered: 0, completion: 0 });
});

test("needsBoardCompletion weights the full board by required quantities", () => {
  const board = [{ section: "A", rows: [], required: 100, covered: 50, completion: 50 }, { section: "B", rows: [], required: 300, covered: 300, completion: 100 }];
  assert.deepEqual(needsBoardCompletion(board), { required: 400, covered: 350, completion: 87.5 });
  assert.deepEqual(needsBoardCompletion([]), { required: 0, covered: 0, completion: 100 });
  assert.equal(needsBoardCompletion(board).completion, needsBoardCompletion(board).completion);
});

test("filterNeedsBoard searches row names while preserving matching section headings", () => {
  const board = buildNeedsBoard([
    { key: "items:1", name: "Rough Plank", tag: "Plank", tier: 1, section: "Carpentry", required: 100, missing: 20 },
    { key: "items:2", name: "Rough Stripped Wood", tag: "Stripped Wood", tier: 1, section: "Carpentry", required: 50, missing: 10 },
    { key: "items:3", name: "Rough Brick", tag: "Brick", tier: 1, section: "Masonry", required: 25, missing: 5 },
  ], []);

  const filtered = filterNeedsBoard(board, [], false, " plank ");

  assert.deepEqual(filtered.map((group) => [group.section, group.rows.map((row) => row.name)]), [["Carpentry", ["Plank"]]]);
  assert.equal(filtered[0].completion, board[0].completion);
});

test("filterNeedsBoard matches API names and composes with activity and shortage filters", () => {
  const board = buildNeedsBoard([
    { key: "items:1", name: "Rough Plank", tag: "Plank", rowNameOverride: "Boards", tier: 1, section: "Carpentry", required: 100, missing: 0, recipeUsages: [{}] },
    { key: "items:2", name: "Simple Plank", tag: "Plank", rowNameOverride: "Boards", tier: 2, section: "Carpentry", required: 100, missing: 10 },
    { key: "items:3", name: "Basic Ink", tag: "Ink", tier: 1, section: "Scholar", required: 25, missing: 5 },
  ], []);

  assert.deepEqual(filterNeedsBoard(board, ["Carpentry"], true, "plank").map((group) => group.rows.map((row) => row.name)), [["Boards"]]);
  assert.deepEqual(filterNeedsBoard(board, ["Scholar"], true, "plank"), []);
});
