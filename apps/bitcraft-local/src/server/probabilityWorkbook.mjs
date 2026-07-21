import ExcelJS from "exceljs";

const COLORS = {
  ink: "18202B",
  header: "253447",
  gold: "F0C64F",
  paleGold: "FFF4C7",
  paleBlue: "EAF2FA",
  paleGreen: "E8F7EE",
  white: "FFFFFF",
  muted: "5B6573",
  line: "D7DEE7",
  warning: "FCE8E7",
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function titleSheet(sheet, title, subtitle, endColumn) {
  sheet.mergeCells(`A1:${endColumn}1`);
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = { name: "Aptos Display", size: 18, bold: true, color: { argb: COLORS.white } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;
  sheet.mergeCells(`A2:${endColumn}2`);
  sheet.getCell("A2").value = subtitle;
  sheet.getCell("A2").font = { name: "Aptos", size: 10, color: { argb: COLORS.muted } };
  sheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(2).height = 30;
  sheet.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
}

function styleHeader(row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.header } };
    cell.alignment = { wrapText: true, vertical: "middle" };
    cell.border = { bottom: { style: "medium", color: { argb: COLORS.gold } } };
  });
}

function styleData(sheet, firstRow, lastRow, numericColumns = [], percentageColumns = []) {
  if (lastRow < firstRow) return;
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 10, color: { argb: COLORS.ink } };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: COLORS.line } } };
      if (rowNumber % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F7F9FC" } };
    });
  }
  for (const column of numericColumns) sheet.getColumn(column).numFmt = "#,##0.0000";
  for (const column of percentageColumns) sheet.getColumn(column).numFmt = "0.0000%";
}

function addRows(sheet, headers, rows, widths) {
  sheet.addRow(headers);
  styleHeader(sheet.getRow(3));
  rows.forEach((row) => sheet.addRow(row));
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  const lastRow = Math.max(3, sheet.rowCount);
  sheet.autoFilter = `A3:${sheet.getColumn(headers.length).letter}${lastRow}`;
  return lastRow;
}

function routeIndex(rows, valueField) {
  const index = new Map();
  for (const row of rows ?? []) {
    const key = String(row.outputKey ?? "");
    if (!key) continue;
    const value = number(row[valueField]);
    const current = index.get(key) ?? { count: 0, best: 0 };
    current.count += 1;
    current.best = Math.max(current.best, value);
    index.set(key, current);
  }
  return index;
}

function addHowToRead(workbook, snapshot) {
  const sheet = workbook.addWorksheet("How to Read", { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 27 }, { width: 92 }];
  sheet.mergeCells("A1:B1");
  sheet.getCell("A1").value = "BitCraft Item Probability Guide";
  sheet.getCell("A1").font = { name: "Aptos Display", size: 20, bold: true, color: { argb: COLORS.white } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
  sheet.getRow(1).height = 34;
  const rows = [
    ["What these numbers mean", "Expected values are long-run averages. A specific craft or resource can produce more or less. Use the planner safety buffer when you want extra confidence."],
    ["Item-list chance", "Raw item-list values are relative weights. Selection chance = possibility weight / total weight of every possibility, including a possibility that awards nothing."],
    ["Gathering", "Expected per progress = extraction quantity x occurrence rate per progress x expected item-list quantity. Tool power changes how many hits deliver that progress; it does not change the drop rate."],
    ["Full resource", "Expected per full resource = expected per progress x resource maximum health + completion yield."],
    ["Prospecting", "Prospecting rows report expected output per extraction progress only. Displayed node health is not a depletion budget, and total node yield is unavailable because prospecting exhaustion is unknown."],
    ["Crafting", "Expected per craft = direct output quantity x output occurrence rate x expected item-list quantity. Actions per item = actions per craft / expected output per craft."],
    ["Honeyberry example", "A Honeyberry Bush has 595 health and a 0.06723 berry-list rate per progress: 40.00185 expected list rolls. Weights 1 and 0.02 normalize to 98.0392% and 1.9608%, giving about 39.2175 Simple Berries and 0.78435 Simple Citric Berries per full bush."],
    ["Catalogue refreshed", snapshot?.updatedAt ?? "Unavailable"],
    ["Source revision", snapshot?.sourceRevision ?? "Unavailable"],
    ["Source", snapshot?.sourceUrl ?? "Unavailable"],
    ...((snapshot?.sources ?? []).map((source) => [
      `Source: ${source.sourceKind}`,
      `${source.sourceUrl}${source.sourceRevision ? ` | Revision: ${source.sourceRevision}` : ""}`,
    ])),
  ];
  rows.forEach((values, index) => {
    const row = sheet.addRow(values);
    row.height = index < 6 ? 44 : 28;
    row.getCell(1).font = { name: "Aptos", bold: true, color: { argb: COLORS.ink } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: index < 6 ? COLORS.paleGold : COLORS.paleBlue } };
    row.eachCell((cell) => {
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = { bottom: { style: "thin", color: { argb: COLORS.line } } };
    });
  });
}

function addAllItems(workbook, data) {
  const gathering = routeIndex(data.gatheringRoutes, "expectedPerResource");
  const crafting = routeIndex(data.craftingRoutes, "expectedPerCraft");
  const rows = (data.entities ?? []).map((entity) => {
    const gatheringResult = gathering.get(entity.catalogKey) ?? { count: 0, best: 0 };
    const craftingResult = crafting.get(entity.catalogKey) ?? { count: 0, best: 0 };
    const routeCount = gatheringResult.count + craftingResult.count;
    return [
      entity.kind === "cargo" ? "Cargo" : "Item",
      entity.targetId,
      entity.name,
      entity.tier,
      entity.tag,
      routeCount,
      gatheringResult.count,
      craftingResult.count,
      gatheringResult.best || null,
      craftingResult.best || null,
      routeCount ? "Covered" : "No gathering/crafting probability route",
    ];
  });
  const sheet = workbook.addWorksheet("All Items");
  titleSheet(sheet, "All Items and Cargo", "Every current catalogue entity is listed, including entities without a gathering or crafting probability route.", "K");
  const lastRow = addRows(sheet, ["Type", "ID", "Name", "Tier", "Tag", "Probability routes", "Gathering routes", "Crafting routes", "Best expected / full resource", "Best expected / craft", "Coverage"], rows, [10, 16, 34, 8, 24, 15, 15, 14, 22, 20, 35]);
  styleData(sheet, 4, lastRow, [4, 6, 7, 8, 9, 10]);
}

function addGathering(workbook, data) {
  const sourceUrl = data.snapshot?.sourceUrl ?? "";
  const rows = (data.gatheringRoutes ?? []).map((route) => [
    route.resourceId, route.resourceName, route.gatheringMode === "prospecting" ? "Prospecting" : "Ordinary",
    route.resourceHealth == null ? null : number(route.resourceHealth), route.recipeKey,
    route.outputKind === "cargo" ? "Cargo" : "Item", route.outputId, route.outputName,
    number(route.extractionQuantity), number(route.occurrenceRate), route.listChance == null ? null : number(route.listChance),
    number(route.listExpectedQuantity, 1), number(route.expectedPerProgress), route.completionYield == null ? null : number(route.completionYield),
    null, null, route.probabilityStatus ?? "Expected value", sourceUrl,
  ]);
  const sheet = workbook.addWorksheet("Gathering Routes");
  titleSheet(sheet, "Gathering Probabilities", "One row per gathering route and final item or cargo output. Prospecting is reported per extraction progress because its exhaustion limit is unknown.", "R");
  const lastRow = addRows(sheet, ["Resource ID", "Resource", "Gathering mode", "Max health", "Recipe ID", "Output type", "Output ID", "Output", "Extraction quantity", "Occurrence rate / progress", "List selection chance", "Expected qty / list roll", "Expected / progress", "Completion yield", "Expected / full resource", "Expected progress / item", "Probability status", "Source URL"], rows, [13, 28, 16, 12, 18, 12, 16, 30, 16, 20, 18, 19, 18, 17, 22, 21, 40, 45]);
  for (let row = 4; row <= lastRow; row += 1) {
    const source = data.gatheringRoutes[row - 4];
    if (source?.gatheringMode === "prospecting") continue;
    sheet.getCell(`O${row}`).value = { formula: `=M${row}*D${row}+N${row}`, result: number(source?.expectedPerResource) };
    const effective = number(source?.expectedPerProgress) + (number(source?.resourceHealth) > 0 ? number(source?.completionYield) / number(source.resourceHealth) : 0);
    sheet.getCell(`P${row}`).value = { formula: `=IF(M${row}+N${row}/D${row}>0,1/(M${row}+N${row}/D${row}),\"\")`, result: effective > 0 ? 1 / effective : "" };
  }
  styleData(sheet, 4, lastRow, [4, 9, 10, 12, 13, 14, 15, 16], [11]);
}

function addCrafting(workbook, data) {
  const sourceUrl = data.snapshot?.sourceUrl ?? "";
  const rows = (data.craftingRoutes ?? []).map((route) => [
    route.recipeKey, route.recipeName, route.stationName, route.skillName,
    route.outputKind === "cargo" ? "Cargo" : "Item", route.outputId, route.outputName,
    number(route.directQuantity), route.listChance == null ? null : number(route.listChance),
    number(route.listExpectedQuantity, 1), number(route.occurrenceRate, 1), number(route.expectedPerCraft),
    number(route.guaranteedPerCraft), number(route.actionCount), null, route.probabilityStatus ?? "Expected value", sourceUrl,
  ]);
  const sheet = workbook.addWorksheet("Crafting Routes");
  titleSheet(sheet, "Crafting Probabilities", "One row per recipe and final item or cargo output. Expected output and actions per item are formula-backed for easy auditing.", "Q");
  const lastRow = addRows(sheet, ["Recipe ID", "Recipe", "Station", "Skill", "Output type", "Output ID", "Output", "Direct quantity", "List selection chance", "Expected qty / list roll", "Output rate", "Expected / craft", "Guaranteed / craft", "Actions / craft", "Expected actions / item", "Probability status", "Source URL"], rows, [18, 34, 25, 20, 12, 16, 30, 15, 18, 19, 13, 17, 18, 15, 20, 18, 45]);
  for (let row = 4; row <= lastRow; row += 1) {
    const source = data.craftingRoutes[row - 4];
    const expected = number(source?.expectedPerCraft);
    sheet.getCell(`O${row}`).value = { formula: `=IF(L${row}>0,N${row}/L${row},\"\")`, result: expected > 0 ? number(source?.actionCount) / expected : "" };
  }
  styleData(sheet, 4, lastRow, [8, 10, 11, 12, 13, 14, 15], [9]);
}

function addRawRecipeOutputs(workbook, data) {
  const rows = (data.rawRecipeOutputs ?? []).map((row) => [
    row.recipeKey,
    row.recipeName,
    row.gatheringMode === "prospecting" ? "Prospecting" : row.gatheringMode === "ordinary" ? "Ordinary" : "Craft",
    number(row.componentIndex),
    row.outputKind === "cargo" ? "Cargo" : "Item",
    row.outputId,
    row.outputName,
    number(row.occurrenceRate, 1),
    number(row.quantity),
    row.yieldBasis,
    data.snapshot?.sourceUrl ?? "",
  ]);
  const sheet = workbook.addWorksheet("Raw Recipe Outputs");
  titleSheet(sheet, "Raw Recipe Output Components", "Every source output component is retained separately. Repeated rows for one item are combined only when calculating expected planner yield.", "K");
  const lastRow = addRows(sheet, ["Recipe ID", "Recipe", "Gathering mode", "Component", "Output type", "Output ID", "Output", "Occurrence rate", "Quantity", "Yield basis", "Source URL"], rows, [18, 34, 16, 12, 12, 16, 30, 18, 13, 16, 45]);
  styleData(sheet, 4, lastRow, [4, 8, 9]);
}

function addRawLists(workbook, data) {
  const rows = (data.rawItemLists ?? []).map((row) => [
    row.itemListId, row.itemListName, row.possibilityIndex, number(row.rawWeight), number(row.normalizedProbability),
    row.outputIndex, row.outputKind === "cargo" ? "Cargo" : "Item", row.outputId, row.outputName, row.nestedItemListId, number(row.quantity), data.snapshot?.sourceUrl ?? "",
  ]);
  const sheet = workbook.addWorksheet("Raw Item Lists");
  titleSheet(sheet, "Raw Item-List Weights", "Possibilities preserve their original grouping and relative weights. Multiple output rows with the same possibility index are awarded together.", "L");
  const lastRow = addRows(sheet, ["Item-list ID", "Item-list name", "Possibility", "Raw weight", "Normalized probability", "Output row", "Output type", "Output ID", "Output", "Nested item-list ID", "Quantity", "Source URL"], rows, [15, 32, 13, 14, 20, 12, 12, 16, 30, 19, 12, 45]);
  styleData(sheet, 4, lastRow, [3, 4, 6, 11], [5]);
}

function addDataQuality(workbook, data) {
  const warnings = [...new Set([...(data.snapshot?.warnings ?? []), ...(data.warnings ?? [])])];
  const rows = warnings.length ? warnings.map((warning, index) => [index + 1, "Warning", warning]) : [[1, "Complete", "No probability data-quality warnings were recorded for this snapshot."]];
  const sheet = workbook.addWorksheet("Data Quality");
  titleSheet(sheet, "Probability Data Quality", "Warnings identify calculations that were withheld rather than guessed.", "C");
  const lastRow = addRows(sheet, ["#", "Status", "Detail"], rows, [8, 16, 95]);
  styleData(sheet, 4, lastRow, [1]);
  for (let row = 4; row <= lastRow; row += 1) {
    if (warnings.length) sheet.getRow(row).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.warning } }; });
  }
}

export async function buildProbabilityWorkbookBuffer(data = {}) {
  if (!data?.snapshot) throw new Error("A complete probability snapshot is required to build the workbook.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BitCraft Claim Monitor";
  workbook.title = "BitCraft Item Probabilities";
  workbook.subject = "Gathering and crafting expected-value probabilities";
  workbook.created = new Date(data.snapshot.updatedAt ?? Date.now());
  workbook.modified = workbook.created;

  addHowToRead(workbook, data.snapshot);
  addAllItems(workbook, data);
  addGathering(workbook, data);
  addCrafting(workbook, data);
  addRawRecipeOutputs(workbook, data);
  addRawLists(workbook, data);
  addDataQuality(workbook, data);

  const output = await workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}
