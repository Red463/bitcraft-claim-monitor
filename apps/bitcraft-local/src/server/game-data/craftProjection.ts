import { inventoryStackKey } from "./inventoryProjection.ts";

type CatalogEntity = {
  id?: unknown;
  targetId?: unknown;
  name?: unknown;
  tier?: unknown;
  [key: string]: unknown;
};

type CraftStack = {
  itemId?: unknown;
  item_id?: unknown;
  id?: unknown;
  itemType?: unknown;
  item_type?: unknown;
  kind?: unknown;
  quantity?: unknown;
  [key: string]: unknown;
};

type CraftRow = {
  entityId?: unknown;
  recipeId?: unknown;
  completed?: unknown;
  craftCount?: unknown;
  ownerUsername?: unknown;
  buildingName?: unknown;
  craftedItem?: CraftStack[];
  [key: string]: unknown;
};

type CraftRecipe = {
  id?: unknown;
  name?: unknown;
  isPassive?: unknown;
  levelRequirements?: unknown[];
  toolRequirements?: unknown[];
  experiencePerProgress?: unknown[];
  outputs?: CraftStack[];
  [key: string]: unknown;
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a non-negative decimal integer`);
  return normalized;
}

function outputQuantity(stack: CraftStack | undefined, craftCount: unknown): string {
  return (
    BigInt(decimalInteger(stack?.quantity ?? 0, "craft output quantity"))
    * BigInt(decimalInteger(craftCount ?? 0, "craft count"))
  ).toString();
}

function enrichedCraft(craft: CraftRow, recipe: CraftRecipe | undefined) {
  return {
    ...craft,
    recipeName: recipe?.name == null ? null : String(recipe.name),
    isPassive: recipe?.isPassive === true,
    levelRequirements: Array.isArray(recipe?.levelRequirements) ? recipe.levelRequirements : [],
    toolRequirements: Array.isArray(recipe?.toolRequirements) ? recipe.toolRequirements : [],
    experiencePerProgress: Array.isArray(recipe?.experiencePerProgress) ? recipe.experiencePerProgress : [],
  };
}

export function enrichCraftsWithCatalog(
  snapshot: unknown,
  getEntity: (catalogKey: string) => CatalogEntity | null,
  getRecipe: (recipeId: string) => CraftRecipe | null,
) {
  const source = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as Record<string, unknown>
    : {};
  const rows = Array.isArray(source.craftResults) ? source.craftResults as CraftRow[] : [];
  const recipeById = new Map<string, CraftRecipe | null>();
  const catalog: Record<string, CatalogEntity> = {};
  const activeCrafts: ReturnType<typeof enrichedCraft>[] = [];
  const passiveCrafts: Array<Record<string, unknown>> = [];

  for (const craft of rows) {
    const id = String(craft.recipeId ?? "");
    if (!recipeById.has(id)) recipeById.set(id, getRecipe(id));
    const recipe = recipeById.get(id) ?? undefined;
    const enriched = enrichedCraft(craft, recipe);
    const output = Array.isArray(craft.craftedItem) ? craft.craftedItem[0] : undefined;
    let outputEntity: CatalogEntity | null = null;
    if (output) {
      const key = inventoryStackKey(output);
      outputEntity = catalog[key] ?? getEntity(key);
      if (outputEntity) catalog[key] = outputEntity;
    }

    if (recipe?.isPassive === true) {
      passiveCrafts.push({
        entityId: String(craft.entityId ?? ""),
        recipe: String(recipe.name ?? outputEntity?.name ?? "Passive craft"),
        tier: outputEntity?.tier ?? null,
        memberName: String(craft.ownerUsername ?? "Unknown"),
        structure: String(craft.buildingName ?? "Unknown Structure"),
        status: craft.completed === true ? "complete" : "processing",
        quantity: outputQuantity(output, craft.craftCount),
        timestamp: null,
        item: outputEntity,
      });
    } else if (craft.completed !== true) {
      activeCrafts.push(enriched);
    }
  }

  return {
    ...source,
    craftResults: activeCrafts,
    passiveCraftResults: passiveCrafts,
    catalog,
    count: activeCrafts.length + passiveCrafts.length,
    activeCount: activeCrafts.length,
    passiveCount: passiveCrafts.length,
  };
}
