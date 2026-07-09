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