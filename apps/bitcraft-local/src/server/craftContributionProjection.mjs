function exactUnsigned(value, label) {
  const normalized = String(value ?? "").trim();
  const match = /^(\d+)(?:\.0+)?$/.exec(normalized);
  if (!match) {
    throw new TypeError(`${label} must be an unsigned decimal integer`);
  }
  return match[1];
}

export function projectCraftContributions(rows) {
  const byCraft = {};
  for (const row of rows) {
    const craftEntityId = exactUnsigned(row.craft_entity_id, "Craft entity id");
    const contributorEntityId = exactUnsigned(
      row.contributor_entity_id,
      "Contributor entity id",
    );
    (byCraft[craftEntityId] ??= []).push({
      contributorEntityId,
      contributorUsername: String(row.contributor_name ?? contributorEntityId),
      totalProgressContributed: exactUnsigned(
        row.contributed_progress,
        "Contributed progress",
      ),
      totalXpContributed: exactUnsigned(row.contributed_xp, "Contributed XP"),
      contributionCount: exactUnsigned(
        row.contribution_count,
        "Contribution count",
      ),
      firstContributedAt: row.first_contributed_at == null
        ? null
        : String(row.first_contributed_at),
      lastContributedAt: row.last_contributed_at == null
        ? null
        : String(row.last_contributed_at),
    });
  }
  for (const contributors of Object.values(byCraft)) {
    contributors.sort((left, right) => (
      String(right.lastContributedAt ?? "").localeCompare(String(left.lastContributedAt ?? ""))
      || left.contributorUsername.localeCompare(right.contributorUsername)
    ));
  }
  return byCraft;
}

export function projectCraftContributionEnvelope(rows) {
  const data = {};
  const warnings = [];
  rows.forEach((row, index) => {
    try {
      const projected = projectCraftContributions([row]);
      for (const [craftEntityId, contributors] of Object.entries(projected)) {
        (data[craftEntityId] ??= []).push(...contributors);
      }
    } catch (error) {
      warnings.push(
        `Durable craft contribution row ${index} is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
  for (const contributors of Object.values(data)) {
    contributors.sort((left, right) => (
      String(right.lastContributedAt ?? "").localeCompare(String(left.lastContributedAt ?? ""))
      || left.contributorUsername.localeCompare(right.contributorUsername)
    ));
  }
  return { data, warnings };
}
