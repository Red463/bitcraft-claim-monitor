import assert from "node:assert/strict";
import test from "node:test";

import { equipmentPresets } from "../src/utils/items.ts";

test("equipment presets retain current gear and every saved preset in Relay index order", () => {
  const current = [{ primary: "head_clothing", item: { id: "current" } }];
  const result = equipmentPresets({
    presets: [
      { entityId: "second", index: 2, equipmentSlots: [{ primary: "head_clothing", item: { id: "two" } }] },
      { entityId: "first", index: 1, equipmentSlots: [{ primary: "head_clothing", item: { id: "one" } }] },
    ],
  }, current);

  assert.deepEqual(result.map((preset) => preset.label), ["Current Gear", "Preset 1", "Preset 2"]);
  assert.deepEqual(result.map((preset) => preset.id), ["current-equipment", "first", "second"]);
  assert.equal(result[0].active, true);
  assert.equal(result.every((preset) => preset.reported), true);
});
