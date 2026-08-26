import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConstructionProjects,
  claimSupplyCap,
  claimSupplyRunOutAt,
  constructionNeededMaterials,
  parseDateValue,
  toNumber,
  unwrap,
} from "../src/main-app-data.ts";

test("claimSupplyRunOutAt accepts documented and observed BitJita field names", () => {
  assert.equal(claimSupplyRunOutAt({ suppliesRunOutAt: "2026-06-04T12:00:00Z" }), "2026-06-04T12:00:00Z");
  assert.equal(claimSupplyRunOutAt({ suppliesRunOut: 1784679177119 }), 1784679177119);
  assert.equal(claimSupplyRunOutAt({ supplyRunOutAt: "fallback" }), "fallback");
  assert.equal(claimSupplyRunOutAt({}), null);
});

test("parseDateValue handles ISO, seconds, milliseconds and microsecond timestamps", () => {
  assert.equal(parseDateValue("2026-06-04 07:48:28.458119+00")?.toISOString(), "2026-06-04T07:48:28.458Z");
  assert.equal(parseDateValue(1_784_679_177)?.getTime(), 1_784_679_177_000);
  assert.equal(parseDateValue(1_784_679_177_119)?.getTime(), 1_784_679_177_119);
  assert.equal(parseDateValue(1_784_679_177_119_000)?.getTime(), 1_784_679_177_119);
});

test("unwrap handles both documented object wrappers and direct array responses", () => {
  assert.deepEqual(unwrap({ members: [{ userName: "Modular" }] }, "members", []), [{ userName: "Modular" }]);
  assert.deepEqual(unwrap([{ userName: "Mosswick" }], "members", []), [{ userName: "Mosswick" }]);
  assert.deepEqual(unwrap(null, "members", []), []);
});

test("claimSupplyCap falls back to max supply research when no direct cap field exists", () => {
  assert.equal(claimSupplyCap({ maxSupplies: "30000" }), 30000);
  assert.equal(claimSupplyCap({ researchedTechs: [{ techType: "max_supplies", name: "Unlock 30000 Max Supplies" }] }), 30000);
});

test("buildConstructionProjects uses consumed stacks as requirements and project stacks as contributions", () => {
  const construction = {
    projects: [
      {
        entityId: "project-1",
        recipeName: "Exquisite Forestry Station",
        items: [],
        cargos: [
          { item_id: 1203, quantity: 1, item_type: "cargo" },
          { item_id: 1004, quantity: 2, item_type: "cargo" },
        ],
        consumedItemStacks: [{ item_id: 1661456951, quantity: 1, item_type: "item" }],
        consumedCargoStacks: [
          { item_id: 1004, quantity: 2, item_type: "cargo" },
          { item_id: 1632765422, quantity: 2, item_type: "cargo" },
          { item_id: 1203, quantity: 1, item_type: "cargo" },
        ],
      },
    ],
    items: [{ id: 1661456951, name: "Refined Fine Plank", tier: 4, rarityStr: "Epic" }],
    cargos: [
      { id: 1004, name: "Exquisite Trunk", tier: 5 },
      { id: 1203, name: "Fine Timber", tier: 4 },
      { id: 1632765422, name: "Exquisite Plant Roots", tier: 5 },
    ],
  };
  const inventories = {
    buildings: [
      {
        inventory: [
          { contents: { item_type: "item", item_id: 1661456951, quantity: 1 } },
          { contents: { item_type: "cargo", item_id: 1632765422, quantity: 1 } },
        ],
      },
    ],
  };

  const projects = buildConstructionProjects(construction, inventories);
  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0].materials.map((material) => material.name), [
    "Refined Fine Plank",
    "Exquisite Trunk",
    "Exquisite Plant Roots",
    "Fine Timber",
  ]);
  assert.deepEqual(projects[0].materials.find((material) => material.name === "Fine Timber"), {
    type: "cargo",
    itemId: 1203,
    name: "Fine Timber",
    required: 1,
    contributed: 1,
    stored: 0,
    tier: 4,
    rarity: undefined,
    iconAssetName: undefined,
  });
  assert.deepEqual(constructionNeededMaterials(projects), [["Exquisite Plant Roots", 1]]);
});

test("buildConstructionProjects overlays live storage onto normalized Relay materials", () => {
  const projects = buildConstructionProjects({
    projects: [{
      entityId: "9",
      name: "Sturdy Fishing Station",
      materials: [{
        type: "cargo",
        itemId: "1202",
        name: "Sturdy Timber",
        required: "4",
        contributed: "1",
        stored: "0",
      }],
    }],
  }, {
    buildings: [{
      inventory: [{
        contents: {
          itemType: "cargo",
          itemId: "1202",
          quantity: "3",
        },
      }],
    }],
  });

  assert.equal(projects[0].materials[0].stored, "3");
  assert.equal(projects[0].materials[0].required, "4");
  assert.equal(projects[0].materials[0].contributed, "1");
});

test("toNumber safely parses common BitJita numeric formats", () => {
  assert.equal(toNumber("21,424"), 21424);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber(null), 0);
});
