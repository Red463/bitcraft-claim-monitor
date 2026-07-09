import assert from "node:assert/strict";
import test from "node:test";

import { buildNeedsBoard } from "../src/pages/craftPlanningNeedsBoard.ts";

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
