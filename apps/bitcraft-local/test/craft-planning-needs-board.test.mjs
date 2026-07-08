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
