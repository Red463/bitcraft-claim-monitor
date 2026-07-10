import assert from "node:assert/strict";
import test from "node:test";

import { recipeDetailHasPlanningMetadata, recipeTargetFromDetail } from "../src/server/recipeCatalog.mjs";

test("recipe catalog planning metadata requires API tag and tier", () => {
  assert.equal(recipeDetailHasPlanningMetadata({ item: { id: "6130004", name: "Peerless Berry", itemType: 0, tag: "Berry", tier: 6 } }), true);
  assert.equal(recipeDetailHasPlanningMetadata({ item: { id: "6130004", name: "Peerless Berry", itemType: 0, tier: 6 } }), false);
  assert.equal(recipeDetailHasPlanningMetadata({ item: { id: "6130004", name: "Peerless Berry", itemType: 0, tag: "Berry" } }), false);
});

test("recipe catalog target helpers unwrap cached recipe detail payloads", () => {
  const target = recipeTargetFromDetail({ detail: { item: { id: "6130004", name: "Peerless Berry", itemType: 0, tag: "Berry", tier: 6 } } });
  assert.equal(target.id, "6130004");
  assert.equal(target.tag, "Berry");
  assert.equal(target.tier, 6);
});

