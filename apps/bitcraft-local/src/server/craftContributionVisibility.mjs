export function partitionCraftContributionRows(rows) {
  const playerRows = [];
  let unknownAttributionCount = 0;
  for (const row of rows) {
    if (!new Set(["authoritative", "matched_action"]).has(row?.attribution_confidence)
      || row?.contributor_entity_id == null) {
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
