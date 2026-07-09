import assert from "node:assert/strict";
import test from "node:test";

import { groupNeedCellRecipeUsages, groupNeedCellSources, groupNeedCellSourceRoutes } from "../src/pages/craftPlanningNeedDetails.ts";

const roughLogCell = {
  item: { key: "item:100", id: "100", kind: "item", name: "Rough Wood Log", tier: 1 },
  items: [
    {
      key: "item:100",
      id: "100",
      kind: "item",
      name: "Rough Wood Log",
      tier: 1,
      sources: [
        { sourceId: "chest-1", label: "Carpentry Mats", type: "Settlement storage", quantity: 1000 },
        { sourceId: "chest-2", label: "Carpentry Mats", type: "Settlement storage", quantity: 489 },
        { sourceId: "cache-1", label: "Personal Cache (II)", type: "Player deployable", quantity: 1000 },
      ],
      recipeUsages: [
        {
          outputKey: "item:200",
          output: { key: "item:200", id: "200", kind: "item", name: "Rough Brick", tier: 1, quantity: 1365 },
          recipeName: "Bake Rough Brick",
          selectedRecipeId: "bake-brick",
          requiredQuantity: 1365,
          craftCount: 1365,
          quantityPerCraft: 1,
          buildingName: "Rough Kiln",
          alternatives: [
            { id: "bake-brick", label: "Bake Rough Brick", inputs: [{ key: "item:100", name: "Rough Wood Log", quantity: 1 }] },
          ],
        },
        {
          outputKey: "item:200",
          output: { key: "item:200", id: "200", kind: "item", name: "Rough Brick", tier: 1, quantity: 310 },
          recipeName: "Bake Rough Brick",
          selectedRecipeId: "bake-brick",
          requiredQuantity: 310,
          craftCount: 310,
          quantityPerCraft: 1,
          buildingName: "Rough Kiln",
          alternatives: [
            { id: "bake-brick", label: "Bake Rough Brick", inputs: [{ key: "item:100", name: "Rough Wood Log", quantity: 1 }] },
          ],
        },
        {
          outputKey: "item:300",
          output: { key: "item:300", id: "300", kind: "item", name: "Rough Stripped Wood", tier: 1, quantity: 584 },
          recipeName: "Saw Rough Stripped Wood",
          selectedRecipeId: "saw-stripped",
          requiredQuantity: 1752,
          craftCount: 584,
          quantityPerCraft: 3,
          buildingName: "Rough Carpentry Station",
          alternatives: [],
        },
      ],
    },
  ],
};

test("groupNeedCellSources combines duplicate stock labels while retaining drilldown entries", () => {
  const groups = groupNeedCellSources(roughLogCell);
  assert.deepEqual(groups.map((group) => [group.label, group.quantity, group.entries.length]), [
    ["Carpentry Mats", 1489, 2],
    ["Personal Cache (II)", 1000, 1],
  ]);
});

test("groupNeedCellRecipeUsages groups repeated usages by output item", () => {
  const groups = groupNeedCellRecipeUsages(roughLogCell);
  assert.equal(groups.length, 2);
  const roughBrick = groups.find((group) => group.output.name === "Rough Brick");
  const strippedWood = groups.find((group) => group.output.name === "Rough Stripped Wood");
  assert.ok(roughBrick);
  assert.ok(strippedWood);
  assert.equal(roughBrick.output.quantity, 1675);
  assert.equal(roughBrick.requiredQuantity, 1675);
  assert.equal(roughBrick.entries.length, 2);
  assert.equal(strippedWood.requiredQuantity, 1752);
});

test("groupNeedCellSourceRoutes finds selected plan recipes that create the clicked item", () => {
  const routes = groupNeedCellSourceRoutes(roughLogCell, [
    {
      output: { key: "item:100", id: "100", kind: "item", name: "Rough Wood Log", tier: 1, quantity: 6259 },
      recipeName: "Process Rough Trunk",
      buildingName: "Rough Forestry Station",
      inputs: [{ key: "cargo:10", id: "10", kind: "cargo", name: "Rough Trunk", tier: 1, quantity: 3130 }],
      selectedRecipeId: "process-trunk",
      alternatives: [],
    },
  ]);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].recipeName, "Process Rough Trunk");
  assert.equal(routes[0].inputs[0].name, "Rough Trunk");
});
