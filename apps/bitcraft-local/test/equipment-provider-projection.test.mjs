import assert from "node:assert/strict";
import test from "node:test";

const { enrichEquipmentWithCatalog } = await import(
  new URL("../src/server/game-data/equipmentProjection.ts", import.meta.url).href,
);

test("equipment projection enriches current and preset slots plus buffs from indexed catalogs", () => {
  const entityCalls = [];
  const descriptionCalls = [];
  const result = enrichEquipmentWithCatalog({
    members: [{
      playerEntityId: "101",
      username: "Ada",
      equipment: {
        equipmentSlots: [{
          primary: "head_clothing",
          item: { id: "42", itemId: "42", itemType: "item", quantity: "1" },
        }],
      },
      equipmentPresets: {
        presets: [{
          entityId: "501",
          active: false,
          equipmentSlots: [{
            primary: "main_hand",
            item: { id: "42", itemId: "42", itemType: "item", quantity: "1" },
          }],
        }],
      },
      buffs: {
        buffs: [{ buffId: "77", durationSeconds: 60, values: [2] }],
      },
    }],
  }, (key) => {
    entityCalls.push(key);
    return key === "items:42"
      ? { catalogKey: key, name: "Fine Pickaxe", tier: 3, tag: "Tool", rarity: "Rare" }
      : null;
  }, (kind, id) => {
    descriptionCalls.push(`${kind}:${id}`);
    if (kind === "equipment") return { stats: [{ stat: "Armor", value: 5 }] };
    if (kind === "tool") return { toolType: 4, level: 3, power: 25 };
    if (kind === "buff") return { description: "Mining speed", beneficial: true };
    return null;
  });

  const currentItem = result.members[0].equipment.equipmentSlots[0].item;
  assert.deepEqual(currentItem, {
    catalogKey: "items:42",
    name: "Fine Pickaxe",
    tier: 3,
    tag: "Tool",
    rarity: "Rare",
    id: "42",
    itemId: "42",
    itemType: "item",
    quantity: "1",
    stats: [{ stat: "Armor", value: 5 }],
    toolType: 4,
    toolLevel: 3,
    toolPower: 25,
  });
  assert.deepEqual(result.members[0].equipmentPresets.presets[0].equipmentSlots[0].item, currentItem);
  assert.deepEqual(result.members[0].buffs.buffs[0], {
    buffId: "77",
    durationSeconds: 60,
    values: [2],
    description: "Mining speed",
    beneficial: true,
  });
  assert.deepEqual(entityCalls, ["items:42"]);
  assert.deepEqual(descriptionCalls.sort(), ["buff:77", "equipment:42", "tool:42"]);
});

