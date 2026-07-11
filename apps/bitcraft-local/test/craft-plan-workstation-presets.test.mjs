import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkstationPresets, normalizeWorkstationTarget, workstationFamily } from "../src/server/craftPlanWorkstationPresets.mjs";

test("workstation presets group authoritative BitJita buildings by function level", () => {
  const presets = buildWorkstationPresets({ buildings: [
    { id: 6020, name: "Peerless Carpentry Station", showInCompendium: true, functions: [{ level: 6, crafting_slots: 12, refining_slots: 0 }] },
    { id: 6022, name: "Peerless Kiln", showInCompendium: true, functions: [{ level: 6, crafting_slots: 0, refining_slots: 300 }] },
    { id: 99, name: "Peerless House", showInCompendium: true, functions: [{ level: 6, crafting_slots: 0, refining_slots: 0 }] },
  ] });
  assert.equal(presets.length, 1);
  assert.equal(presets[0].tier, 6);
  assert.deepEqual(presets[0].workstations.map((row) => row.family), ["Carpentry Station", "Kiln"]);
});

test("workstation family matching excludes cooking and non-workstation buildings", () => {
  assert.equal(workstationFamily("Peerless Loom"), "Loom");
  assert.equal(workstationFamily("Peerless Cooking Station"), null);
  assert.equal(workstationFamily("Peerless Large Chest"), null);
});

test("workstation detail normalizes construction item and cargo requirements", () => {
  const target = normalizeWorkstationTarget({
    building: { id: 6020, name: "Peerless Carpentry Station", iconAssetName: "station", functions: [{ level: 6 }] },
    constructionRecipe: {
      id: 6014,
      consumedItemStacks: [{ item_id: 6010001, quantity: 20 }],
      consumedCargoStacks: [{ item_id: 1204, quantity: 1 }],
    },
    itemInfo: [{ id: 6010001, name: "Peerless Wood Log", tier: 6, tag: "Wood Log" }],
    cargoInfo: [{ id: 1204, name: "Exquisite Timber", tier: 5, tag: "Timber" }],
  });
  assert.equal(target.kind, "building");
  assert.equal(target.tier, 6);
  assert.deepEqual(target.requirements.map((row) => [row.kind, row.id, row.quantity]), [["items", "6010001", 20], ["cargo", "1204", 1]]);
});
