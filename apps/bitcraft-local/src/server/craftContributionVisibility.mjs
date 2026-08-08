export function partitionCraftContributionRows(rows) {
  const playerRows = [];
  let unknownAttributionCount = 0;
  for (const row of rows) {
    if (row?.attribution_confidence === "unknown" || row?.contributor_entity_id == null) {
      unknownAttributionCount += 1;
      continue;
    }
    playerRows.push(row);
  }
  return {
    playerRows,
    adminDiagnostics: { unknownAttributionCount },
  };
}
