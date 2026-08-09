import {
  addDecimal,
  canonicalNonNegativeDecimal,
  compareDecimal,
} from "./game-data/exactDecimal.ts";
import { partitionCraftContributionRows } from "./craftContributionVisibility.mjs";

function decimal(value, label) {
  return canonicalNonNegativeDecimal(String(value ?? "0"), label);
}

function integer(value, label) {
  const normalized = String(value ?? "0").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} must be a non-negative integer`);
  return BigInt(normalized).toString();
}

function addInteger(left, right) {
  return (BigInt(left) + BigInt(right)).toString();
}

function newerTimestamp(current, candidate) {
  const value = candidate == null ? null : String(candidate);
  return value && (!current || value > current) ? value : current;
}

export function projectCraftContributionLeaderboard(storedRows) {
  const { playerRows: rows } = partitionCraftContributionRows(storedRows);
  const contributors = new Map();
  const professions = new Map();
  let totalProgress = "0";
  let totalXp = "0";

  for (const row of rows) {
    const progress = decimal(row.contributed_progress, "Contribution progress");
    const xp = decimal(row.contributed_xp, "Contribution XP");
    const count = integer(row.contribution_count, "Contribution count");
    totalProgress = addDecimal(totalProgress, progress);
    totalXp = addDecimal(totalXp, xp);
    const contributorKey = String(row.contributor_entity_id);
    const storedProfession = String(row.profession ?? "").trim();
    const profession = storedProfession.toLowerCase() === "unknown" ? "" : storedProfession;
    const contributor = contributors.get(contributorKey) ?? {
      contributorId: row.contributor_entity_id,
      name: row.contributor_name,
      totalProgress: "0",
      totalXp: "0",
      contributionCount: "0",
      craftCount: "0",
      lastContributedAt: null,
      professions: {},
    };
    contributor.totalProgress = addDecimal(contributor.totalProgress, progress);
    contributor.totalXp = addDecimal(contributor.totalXp, xp);
    contributor.contributionCount = addInteger(contributor.contributionCount, count);
    contributor.craftCount = addInteger(contributor.craftCount, "1");
    contributor.lastContributedAt = newerTimestamp(
      contributor.lastContributedAt,
      row.last_contributed_at ?? row.updated_at,
    );
    if (profession) {
      const contributorProfession = contributor.professions[profession] ?? { progress: "0", xp: "0", crafts: "0" };
      contributorProfession.progress = addDecimal(contributorProfession.progress, progress);
      contributorProfession.xp = addDecimal(contributorProfession.xp, xp);
      contributorProfession.crafts = addInteger(contributorProfession.crafts, "1");
      contributor.professions[profession] = contributorProfession;
    }
    contributors.set(contributorKey, contributor);

    if (!profession) continue;
    const professionRow = professions.get(profession) ?? {
      profession,
      totalProgress: "0",
      totalXp: "0",
      craftCount: "0",
      contributorCount: new Set(),
      topContributor: "",
      topContributorProgress: "0",
      contributors: new Map(),
    };
    professionRow.totalProgress = addDecimal(professionRow.totalProgress, progress);
    professionRow.totalXp = addDecimal(professionRow.totalXp, xp);
    professionRow.craftCount = addInteger(professionRow.craftCount, "1");
    professionRow.contributorCount.add(contributorKey);
    const professionContributor = professionRow.contributors.get(contributorKey) ?? {
      name: row.contributor_name,
      progress: "0",
    };
    professionContributor.progress = addDecimal(professionContributor.progress, progress);
    professionRow.contributors.set(contributorKey, professionContributor);
    if (compareDecimal(professionContributor.progress, professionRow.topContributorProgress) > 0) {
      professionRow.topContributor = row.contributor_name;
      professionRow.topContributorProgress = professionContributor.progress;
    }
    professions.set(profession, professionRow);
  }

  const contributorList = Array.from(contributors.values())
    .map((entry) => ({
      ...entry,
      professions: Object.entries(entry.professions)
        .map(([profession, values]) => ({ profession, ...values }))
        .sort((a, b) => compareDecimal(b.progress, a.progress)),
    }))
    .sort((a, b) => compareDecimal(b.totalProgress, a.totalProgress));
  const professionList = Array.from(professions.values())
    .map((entry) => ({
      profession: entry.profession,
      totalProgress: entry.totalProgress,
      totalXp: entry.totalXp,
      craftCount: entry.craftCount,
      contributorCount: entry.contributorCount.size,
      topContributor: entry.topContributor,
      topContributorProgress: entry.topContributorProgress,
    }))
    .sort((a, b) => compareDecimal(b.totalProgress, a.totalProgress));

  return {
    summary: {
      contributorCount: contributorList.length,
      professionCount: professionList.length,
      totalProgress,
      totalXp,
      recordedCrafts: new Set(rows.map((row) => row.craft_entity_id)).size,
      lastContributedAt: rows[0]?.last_contributed_at ?? null,
    },
    contributors: contributorList.slice(0, 100),
    professions: professionList,
    recent: rows.slice(0, 50).map((row) => ({
      contributorId: row.contributor_entity_id,
      contributorName: row.contributor_name,
      profession: row.profession,
      craftLabel: row.craft_label,
      structureName: row.structure_name,
      itemTier: row.item_tier,
      totalProgress: decimal(row.contributed_progress, "Contribution progress"),
      totalXp: decimal(row.contributed_xp, "Contribution XP"),
      contributionCount: integer(row.contribution_count, "Contribution count"),
      attributionConfidence: row.attribution_confidence,
      firstContributedAt: row.first_contributed_at,
      lastContributedAt: row.last_contributed_at,
    })),
  };
}
