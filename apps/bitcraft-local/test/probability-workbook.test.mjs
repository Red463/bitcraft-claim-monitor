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
    gatheringMode: "ordinary",
    recipeKey: "recipe:78", outputKey: "items:2130004", outputKind: "items", outputId: "2130004", outputName: "Simple Berry",
    extractionQuantity: 1, occurrenceRate: 0.06723, listChance: 1 / 1.02, listExpectedQuantity: 1 / 1.02,
    expectedPerProgress: 0.06723 / 1.02, completionYield: 0, expectedPerResource: 39.2175, probabilityStatus: "Expected value",
  }, {
    resourceId: null, resourceName: "Prospecting discovery", resourceHealth: null,
    gatheringMode: "prospecting",
    recipeKey: "recipe:5036", outputKey: "cargo:1", outputKind: "cargo", outputId: "1", outputName: "Test Cargo",
    extractionQuantity: 1.9375, occurrenceRate: 1, listChance: 1, listExpectedQuantity: 1,
    expectedPerProgress: 1.9375, completionYield: null, expectedPerResource: null,
    probabilityStatus: "Expected per extraction progress; prospecting exhaustion is unknown",
  }],
  craftingRoutes: [{
    recipeKey: "recipe:1", recipeName: "Weighted Craft", stationName: "Workbench", skillName: "Carpentry", actionCount: 5,
    outputKey: "items:2130004", outputKind: "items", outputId: "2130004", outputName: "Simple Berry",
    directQuantity: 1, listChance: 0.5, listExpectedQuantity: 3.02, expectedPerCraft: 3.02, guaranteedPerCraft: 2, probabilityStatus: "Expected value",
  }],
  rawItemLists: [{ itemListId: "7", itemListName: "Weighted", possibilityIndex: 0, rawWeight: 1, normalizedProbability: 0.5, outputIndex: 0, outputKey: "items:2130004", outputKind: "items", outputId: "2130004", outputName: "Simple Berry", nestedItemListId: "8", quantity: 3 }],
  rawRecipeOutputs: [1, 0.5, 0.25, 0.125, 0.0625].map((occurrenceRate, componentIndex) => ({
    recipeKey: "recipe:5036", recipeName: "Gather Argent Ore", gatheringMode: "prospecting", componentIndex,
    outputKind: "cargo", outputId: "60000", outputName: "Argent Ore", quantity: 1, occurrenceRate, yieldBasis: "per_progress",
  })),
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
    "Raw Recipe Outputs",
    "Raw Item Lists",
    "Data Quality",
  ]);
  assert.equal(workbook.getWorksheet("All Items").autoFilter.toString(), "A3:K5");
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("O4").value.formula, "=M4*D4+N4");
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("O4").value.result, 39.2175);
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("Q4").value, "Expected value");
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("C5").value, "Prospecting");
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("N5").value, null);
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("O5").value, null);
  assert.equal(workbook.getWorksheet("Gathering Routes").getCell("P5").value, null);
  assert.equal(workbook.getWorksheet("Crafting Routes").getCell("O4").value.formula, "=IF(L4>0,N4/L4,\"\")");
  assert.equal(workbook.getWorksheet("Raw Item Lists").getCell("J4").value, "8");
  assert.equal(workbook.getWorksheet("Raw Recipe Outputs").autoFilter.toString(), "A3:K8");
  assert.equal(workbook.getWorksheet("Raw Recipe Outputs").getCell("H8").value, 0.0625);
  assert.equal(workbook.getWorksheet("Raw Recipe Outputs").getCell("K4").value, fixture.snapshot.sourceUrl);
  assert.equal(workbook.getWorksheet("How to Read").getCell("A5").value, "Full node");
  assert.match(String(workbook.getWorksheet("How to Read").getCell("B5").value), /full node/i);
  assert.ok(workbook.getWorksheet("All Items").getRow(3).values.includes("Best expected / full node"));
  assert.ok(workbook.getWorksheet("Gathering Routes").getRow(3).values.includes("Expected / full node"));
  assert.match(workbook.getWorksheet("How to Read").getColumn(2).values.join(" "), /prospecting exhaustion is unknown/i);
  assert.doesNotMatch(buffer.toString("latin1"), /settlement stock|discord token|member inventory/i);
});
