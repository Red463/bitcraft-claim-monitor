function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function stableCraftPart(value, fallback = "") {
  return String(value ?? fallback).trim().toLowerCase().replace(/\s+/g, " ");
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

export function craftJobKey(job) {
  const storedKey = firstNonEmptyString(job.key);
  if (storedKey) return storedKey;
  const output = job.craftedItem?.[0] ?? {};
  const claim = stableCraftPart(job.claimEntityId ?? job.claimId, "claim");
  const structure = stableCraftPart(
    job.buildingEntityId ?? job.structureEntityId ?? job.stationEntityId ?? job.craftingStationEntityId ?? job.buildingId ?? job.buildingName ?? job.structureName,
  );
  const recipe = stableCraftPart(job.recipeId ?? job.recipeEntityId ?? job.recipe_entity_id ?? job.craftingRecipeId ?? job.recipeName ?? job.name);
  const outputItem = stableCraftPart(output.item_id ?? output.itemId ?? output.id ?? job.outputItemId ?? job.itemId);
  const outputType = stableCraftPart(output.item_type ?? output.itemType ?? job.outputItemType ?? job.itemType);
  const visibility = job.isPublic === false ? "private" : "public";
  // BitJita can report the same public craft with a different current/last crafter as work continues.
  // Crafter is notification metadata, not stable craft identity, otherwise starts can fire again.
  if (structure && (recipe || outputItem)) return ["craft", claim, structure, recipe || "recipe", outputItem || "output", outputType || "item", visibility].join("|");
  return firstNonEmptyString(job.entityId, job.id, job.craftEntityId) ?? ["craft", claim, recipe || outputItem || "unknown", visibility].join("|");
}

export function craftOutputItem(job, craftsPayload = {}) {
  const itemId = String(job.craftedItem?.[0]?.item_id ?? job.outputItemId ?? job.itemId ?? "");
  return [...(craftsPayload.items ?? []), ...(craftsPayload.cargos ?? [])].find((candidate) => String(candidate.id) === itemId) ?? null;
}

export function craftDisplayName(job, craftsPayload = {}) {
  const item = craftOutputItem(job, craftsPayload);
  return String(item?.name ?? job.recipeName ?? job.name ?? `${job.buildingName ?? "Settlement"} craft`);
}

export function normalizeProductionJob(job, craftsPayload = {}) {
  const metrics = productionMetrics(job);
  const item = craftOutputItem(job, craftsPayload);
  const output = job.craftedItem?.[0] ?? {};
  const itemId = output.item_id ?? output.itemId ?? output.id ?? job.outputItemId ?? job.itemId ?? null;
  const itemType = output.item_type ?? output.itemType ?? item?.itemType ?? job.outputItemType ?? job.itemType ?? null;
  const label = String(item?.name ?? job.itemName ?? job.label ?? job.recipeName ?? job.name ?? `${job.buildingName ?? "Settlement"} craft`);
  return {
    key: craftJobKey(job),
    label,
    itemId: itemId == null ? null : String(itemId),
    itemType: itemType == null ? null : String(itemType),
    itemName: item?.name ?? job.itemName ?? job.label ?? job.recipeName ?? job.name ?? null,
    tier: toNumber(item?.tier ?? job.tier ?? job.itemTier),
    rarity: item?.rarityStr ?? item?.rarity ?? job.rarityStr ?? job.rarity ?? null,
    iconAssetName: item?.iconAssetName ?? job.iconAssetName ?? null,
    craftCount: toNumber(job.craftCount ?? output.quantity ?? output.qty),
    buildingName: job.buildingName ?? job.structureName ?? job.buildingNickname ?? null,
    crafterName: job.crafterName ?? job.crafterUsername ?? job.ownerUsername ?? job.playerUsername ?? job.userName ?? null,
    ...metrics,
    raw: job.raw ?? job,
  };
}

const skillNames = {
  2: "Forestry",
  3: "Carpentry",
  4: "Masonry",
  5: "Mining",
  6: "Smithing",
  7: "Scholar",
  8: "Leatherworking",
  9: "Hunting",
  10: "Tailoring",
  11: "Farming",
  12: "Fishing",
  13: "Cooking",
  14: "Foraging",
};

export function productionMetrics(job) {
  const skillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
  const skillName = job.levelRequirements?.[0]?.skillName ?? skillNames[skillId] ?? "";
  const xpPerEffort = toNumber(job.experiencePerProgress?.find((xp) => toNumber(xp.skill_id) === skillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
  const totalEffort = toNumber(job.totalActionsRequired ?? job.totalCraftWork ?? job.requiredCraftWork ?? job.craftWorkRequired ?? job.effortRequired ?? job.totalEffort);
  const completedEffort = toNumber(job.progress ?? job.completedCraftWork ?? job.completedEffort ?? job.actionsCompleted);
  const remainingEffort = toNumber(job.remainingCraftWork ?? job.actionsRemaining ?? job.effortRemaining ?? job.remainingEffort ?? (totalEffort ? totalEffort - completedEffort : 0));
  const progressPct = totalEffort > 0 ? Math.max(0, Math.min(100, ((totalEffort - remainingEffort) / totalEffort) * 100)) : Math.max(0, Math.min(100, toNumber(job.progressPct ?? job.progressPercent ?? job.progress)));
  return {
    skillId,
    skillName,
    professionKey: String(skillName || "").toLowerCase().replace(/[^a-z]/g, ""),
    totalEffort,
    remainingEffort,
    progressPct,
    totalXp: totalEffort * xpPerEffort,
  };
}

export function isCompletedProductionJob(job) {
  const metrics = productionMetrics(job);
  const status = String(job.status ?? job.state ?? job.craftStatus ?? "").trim().toLowerCase();
  if (/complete|completed|collect|ready/.test(status)) return true;
  if (metrics.totalEffort > 0 && metrics.remainingEffort <= 0) return true;
  return metrics.progressPct >= 100;
}
export function normalizeProfessionKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}
