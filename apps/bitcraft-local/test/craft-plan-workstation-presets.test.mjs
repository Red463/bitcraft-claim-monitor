import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkstationPresets, normalizeCatalogWorkstationTarget, workstationFamily } from "../src/server/craftPlanWorkstationPresets.mjs";

test("workstation presets group authoritative Relay buildings by function level", () => {
  const presets = buildWorkstationPresets({ buildings: [
    { id: 6020, name: "Peerless Carpentry Station", showInCompendium: true, functions: [{ level: 6, craftingSlots: 12, refiningSlots: 0 }] },
    { id: 6022, name: "Peerless Kiln", showInCompendium: true, functions: [{ level: 6, craftingSlots: 0, refiningSlots: 300 }] },
    { id: 99, name: "Peerless House", showInCompendium: true, functions: [{ level: 6, craftingSlots: 0, refiningSlots: 0 }] },
  ] });
  assert.equal(presets.length, 1);
  assert.equal(presets[0].tier, 6);
  assert.deepEqual(presets[0].workstations.map((row) => row.family), ["Carpentry Station", "Kiln"]);
});

test("workstation presets read normalized Relay building functions", () => {
  const presets = buildWorkstationPresets({ buildings: [
    { id: "6020", name: "Peerless Carpentry Station", showInCompendium: true, functions: [{ level: 6, craftingSlots: 12, storageSlots: 0 }] },
    { id: "6022", name: "Peerless Kiln", showInCompendium: true, functions: [{ level: 6, craftingSlots: 0, refiningSlots: 300 }] },
  ] });

  assert.equal(presets[0].source, "relay-global-catalog");
  assert.deepEqual(presets[0].workstations.map((row) => row.id), ["6020", "6022"]);
});

test("workstation family matching excludes cooking and non-workstation buildings", () => {
  assert.equal(workstationFamily("Peerless Loom"), "Loom");
  assert.equal(workstationFamily("Peerless Cooking Station"), null);
  assert.equal(workstationFamily("Peerless Large Chest"), null);
});

test("workstation detail joins normalized Relay construction inputs to exact catalog identities", () => {
  const entities = new Map([
    ["items:6010001", { targetId: "6010001", name: "Peerless Wood Log", tier: 6, tag: "Wood Log" }],
    ["cargo:1204", { targetId: "1204", name: "Exquisite Timber", tier: 5, tag: "Timber" }],
  ]);
  const target = normalizeCatalogWorkstationTarget(
    { id: "6020", name: "Peerless Carpentry Station", iconAssetName: "station", functions: [{ level: 6 }] },
    {
      id: "6014",
      buildingDescriptionId: "6020",
      inputs: [
        { id: "6010001", kind: "item", quantity: "20" },
        { id: "1204", kind: "cargo", quantity: "1" },
      ],
    },
    (key) => entities.get(key) ?? null,
  );

  assert.equal(target.constructionRecipeId, "6014");
  assert.deepEqual(target.requirements.map((row) => [row.kind, row.id, row.name, row.quantity]), [
    ["items", "6010001", "Peerless Wood Log", 20],
    ["cargo", "1204", "Exquisite Timber", 1],
  ]);
});
