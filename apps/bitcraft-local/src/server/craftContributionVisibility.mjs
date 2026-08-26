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

export function readCraftContributionDiagnostics(db) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_event_count,
      SUM(CASE
        WHEN contributor_entity_id IS NOT NULL
         AND attribution_confidence IN ('authoritative', 'matched_action')
        THEN 1 ELSE 0
      END) AS attributable_event_count,
      SUM(CASE
        WHEN contributor_entity_id IS NULL
          OR attribution_confidence NOT IN ('authoritative', 'matched_action')
        THEN 1 ELSE 0
      END) AS unknown_attribution_count
    FROM production_contribution_events
  `).get();
  return {
    totalEventCount: Number(row?.total_event_count ?? 0),
    attributableEventCount: Number(row?.attributable_event_count ?? 0),
    unknownAttributionCount: Number(row?.unknown_attribution_count ?? 0),
  };
}
