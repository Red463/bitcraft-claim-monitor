import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { buildProbabilityWorkbookBuffer } from "../src/server/probabilityWorkbook.mjs";

const fixture = {
  snapshot: {
    sourceUrl: "https://github.com/BitCraftToolBox/BitCraft_GameData/tree/cereal/cs/static",
    sourceRevision: "test-revision",
    updatedAt: "2026-07-21T12:00:00.000Z",
    warnings: ["Example unresolved row"],
    sources: [{ sourceKind: "game_data_item_lists", sourceUrl: "https://example.test/item-lists", sourceRevision: "lists-1" }],
  },
  entities: [
    { catalogKey: "items:2130004", kind: "items", targetId: "2130004", name: "Simple Berry", tier: 2, tag: "Berry" },
    { catalogKey: "cargo:1", kind: "cargo", targetId: "1", name: "Test Cargo", tier: 1, tag: "Cargo" },
  ],
  gatheringRoutes: [{
    resourceId: "80", resourceName: "Honeyberry Bush", resourceHealth: 595,
    recipeKey: "recipe:78", outputKey: "items:2130004", outputKind: "items", outputId: "2130004", outputName: "Simple Berry",
    extractionQuantity: 1, occurrenceRate: 0.06723, listChance: 1 / 1.02, listExpectedQuantity: 1 / 1.02,
    expectedPerProgress: 0.06723 / 1.02, completionYield: 0, expectedPerResource: 39.2175, probabilityStatus: "Expected value",
  }],
  craftingRoutes: [{
    recipeKey: "recipe:1", recipeName: "Weighted Craft", stationName: "Workbench", skillName: "Carpentry", actionCount: 5,
    outputKey: "items:2130004", outputKind: "items", outputId: "2130004", outputName: "Simple Berry",
    directQuantity: 1, listChance: 0.5, listExpectedQuantity: 3.02, expectedPerCraft: 3.02, guaranteedPerCraft: 2, probabilityStatus: "Expected value",
  }],
  rawItemLists: [{ itemListId: "7", itemListName: "Weighted", possibilityIndex: 0, rawWeight: 1, normalizedProbability: 0.5, outputIndex: 0, outputKey: "items:2130004", outputKind: "items", outputId: "2130004", outputName: "Simple Berry", nestedItemListId: "8", quantity: 3 }],
  warnings: ["Example unresolved row"],
};

test("probability workbook contains the player guide, complete data sheets, formulas, filters, and no settlement data", async () => {
  const buffer = await buildProbabilityWorkbookBuffer(fixture);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    "How to Read",
    "All Items",
    "Gathering Routes",
    "Crafting Routes",
    "Raw Item Lists",
    "Data Quality",
  ]);
  assert.equal(workbook.getWorksheet("All Items").autoFilter.toString(), "A3:K5");
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("N4").value.formula, "=L4*C4+M4");
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("N4").value.result, 39.2175);
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("P4").value, "Expected value");
  assert.equal(workbook.getWorksheet("Crafting Routes").getCell("O4").value.formula, "=IF(L4>0,N4/L4,\"\")");
  assert.equal(workbook.getWorksheet("Raw Item Lists").getCell("J4").value, "8");
  assert.match(workbook.getWorksheet("How to Read").getCell("A11").value, /game_data_item_lists/);
  assert.doesNotMatch(buffer.toString("latin1"), /settlement stock|discord token|member inventory/i);
});
