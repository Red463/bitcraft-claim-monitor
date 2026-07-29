import { parseDateValue, toNumber, type AnyRecord } from "../../main-app-data.ts";
import { inventoryStackKey } from "../../server/game-data/inventoryProjection.ts";

const ACTIVE_CRAFT_WINDOW_MS = 30 * 1000;

export function hasRecentCraftContribution(contributors: AnyRecord[]): boolean {
  return contributors.some((person) => {
    const lastContribution = parseDateValue(person.lastContributedAt);
    if (!lastContribution) return false;
    const age = Date.now() - lastContribution.getTime();
    return age >= -5 * 1000 && age <= ACTIVE_CRAFT_WINDOW_MS;
  });
}
export function craftProgressKey(job: AnyRecord): string {
  return String(job.entityId ?? job.id ?? job.craftEntityId ?? `${job.buildingName ?? "structure"}:${job.recipeId ?? ""}:${job.craftedItem?.[0]?.itemId ?? job.craftedItem?.[0]?.item_id ?? ""}`);
}
export function productionMetrics(job: AnyRecord, itemLookup: Map<string, AnyRecord>) {
  const output = job.craftedItem?.[0] ?? {};
  let outputKey = "";
  try {
    outputKey = inventoryStackKey(output);
  } catch {
    outputKey = String(output.itemId ?? output.item_id ?? "");
  }
  const item = itemLookup.get(outputKey) ?? itemLookup.get(String(output.itemId ?? output.item_id ?? "")) ?? {};
  const skillId = toNumber(job.levelRequirements?.[0]?.skillId ?? job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skillId ?? job.experiencePerProgress?.[0]?.skill_id);
  const experiencePerEffort = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skillId ?? xp.skill_id) === skillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
  const total = toNumber(job.totalActionsRequired);
  const progress = toNumber(job.progress);
  const remaining = Math.max(0, total - progress);
  return {
    item,
    skillId,
    experiencePerEffort,
    total,
    progress,
    remaining,
    tier: toNumber(item.tier ?? job.tier),
    totalXp: total * experiencePerEffort,
    remainingXp: remaining * experiencePerEffort,
    completion: total > 0 ? progress / total : 0,
    name: String(item.name ?? job.recipeName ?? ""),
  };
}
