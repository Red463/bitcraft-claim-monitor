import type { AnyRecord } from "../main-app-data";

// Craft Calculator recipe planning lives here so the page can stay focused on
// search/selection UI. The normalized catalog exposes multiple recipe families and sometimes
// package/unpack routes; this module normalizes those into a deterministic plan
// without inventing missing recipe data.
export type RecipeKind = "items" | "cargo";

export type RecipeTarget = {
  id: string;
  kind: RecipeKind;
  name: string;
  itemType: number;
  tier?: number;
  rarityStr?: string;
  tag?: string;
  iconAssetName?: string;
};

export type RecipeMaterial = RecipeTarget & {
  quantity: number;
};

export type RecipeStep = {
  id: string;
  recipeName: string;
  output: RecipeMaterial;
  inputs: RecipeMaterial[];
  craftCount: number;
  outputPerCraft: number;
  buildingName?: string;
  buildingTier?: number;
  skillName?: string;
  skillLevel?: number;
  isPassive?: boolean;
  alternatives: number;
};

export type RecipePlan = {
  target: RecipeMaterial;
  directMaterials: RecipeMaterial[];
  rawMaterials: RecipeMaterial[];
  steps: RecipeStep[];
  warnings: string[];
};

export type RecipeDetail = AnyRecord;
export type RecipeSelections = Record<string, string>;

export function recipeKey(kind: RecipeKind, id: string | number) {
  return `${kind}:${String(id)}`;
}

export function recipeKindFromType(value: unknown): RecipeKind {
  return value === 1 || value === "1" || String(value).toLowerCase() === "cargo" ? "cargo" : "items";
}

export function itemTypeFromKind(kind: RecipeKind) {
  return kind === "cargo" ? 1 : 0;
}

export function detailTarget(detail: RecipeDetail): RecipeTarget {
  const source = detail.item ?? detail.cargo ?? detail;
  const kind = detail.cargo ? "cargo" : recipeKindFromType(source.itemType ?? source.item_type);
  return {
    id: String(source.id ?? source.itemId ?? ""),
    kind,
    name: String(source.name ?? "Unknown item"),
    itemType: itemTypeFromKind(kind),
    tier: numericOrUndefined(source.tier),
    rarityStr: source.rarityStr == null ? undefined : String(source.rarityStr),
    tag: source.tag == null ? undefined : String(source.tag),
    iconAssetName: source.iconAssetName == null ? undefined : String(source.iconAssetName),
  };
}

function numericOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stackId(stack: AnyRecord) {
  return String(stack.item_id ?? stack.itemId ?? stack.id ?? "");
}

function stackKind(stack: AnyRecord): RecipeKind {
  return recipeKindFromType(stack.item_type ?? stack.itemType);
}

function stackMatches(stack: AnyRecord, target: RecipeTarget) {
  return stackId(stack) === String(target.id) && stackKind(stack) === target.kind;
}

function enrichStack(stack: AnyRecord, display: AnyRecord | undefined): RecipeMaterial {
  const kind = stackKind(stack);
  return {
    id: stackId(stack),
    kind,
    itemType: itemTypeFromKind(kind),
    name: String(display?.name ?? stack.name ?? "Unknown item"),
    quantity: Number(stack.quantity ?? display?.quantity ?? 0) || 0,
    tier: numericOrUndefined(display?.tier ?? stack.tier),
    rarityStr: display?.rarityStr == null ? undefined : String(display.rarityStr),
    tag: display?.tag == null ? undefined : String(display.tag),
    iconAssetName: display?.iconAssetName == null ? undefined : String(display.iconAssetName),
  };
}

function recipeOutputs(recipe: AnyRecord): AnyRecord[] {
  return Array.isArray(recipe.craftedItemStacks) ? recipe.craftedItemStacks : [];
}

function recipeInputs(recipe: AnyRecord): AnyRecord[] {
  return Array.isArray(recipe.consumedItemStacks) ? recipe.consumedItemStacks : [];
}

export function isUnpackRecipe(recipe: AnyRecord) {
  const name = String(recipe.name ?? "").toLowerCase();
  return /unpack|package/.test(name);
}

function recipeSortScore(recipe: AnyRecord) {
  // Package/unpack routes are usually convenience conversions, not the actual
  // production chain users expect. Penalising them keeps raw-resource processing
  // as the default while still allowing users to select an alternate route.
  const packagePenalty = isUnpackRecipe(recipe) ? 10000 : 0;
  const passivePenalty = recipe.isPassive ? 10 : 0;
  return packagePenalty + passivePenalty + recipeInputs(recipe).length;
}

export function recipesForTarget(detail: RecipeDetail, target = detailTarget(detail)): AnyRecord[] {
  const candidates = [...(detail.craftingRecipes ?? []), ...(detail.extractionRecipes ?? [])].filter((recipe: AnyRecord) =>
    recipeOutputs(recipe).some((stack) => stackMatches(stack, target)),
  );
  return candidates.sort((a, b) => recipeSortScore(a) - recipeSortScore(b));
}

export function recipeId(recipe: AnyRecord): string {
  return String(recipe.id ?? recipe.name ?? "");
}

export function selectedRecipeForTarget(detail: RecipeDetail, target: RecipeTarget, selections: RecipeSelections = {}): AnyRecord | undefined {
  const recipes = recipesForTarget(detail, target);
  const selectedId = selections[recipeKey(target.kind, target.id)];
  return recipes.find((recipe) => recipeId(recipe) === selectedId) ?? recipes[0];
}

/**
 * Builds a recursive material plan for the requested target.
 *
 * `detailsByKey` must contain normalized recipe detail responses keyed by
 * `items:<id>` or `cargo:<id>`. Missing details are treated as source materials
 * rather than guessed, because showing a wrong recipe tree is worse than showing
 * an incomplete one.
 */
export function buildRecipePlan(target: RecipeTarget, amount: number, detailsByKey: Map<string, RecipeDetail>, maxDepth = 14, selections: RecipeSelections = {}): RecipePlan {
  const raw = new Map<string, RecipeMaterial>();
  let directMaterials: RecipeMaterial[] = [];
  const steps: RecipeStep[] = [];
  const warnings: string[] = [];
  const safeAmount = Math.max(1, Math.ceil(Number(amount) || 1));

  function addRaw(material: RecipeMaterial) {
    const key = recipeKey(material.kind, material.id);
    const current = raw.get(key);
    raw.set(key, { ...material, quantity: (current?.quantity ?? 0) + material.quantity });
  }

  function resolve(nextTarget: RecipeTarget, quantity: number, stack: string[], depth: number): RecipeMaterial {
    const key = recipeKey(nextTarget.kind, nextTarget.id);
    const detail = detailsByKey.get(key);
    if (!detail) {
      // The calculator only expands items the normalized catalog can describe. Source materials
      // and unavailable endpoints stop here by design.
      addRaw({ ...nextTarget, quantity });
      warnings.push(`No recipe data was available for ${nextTarget.name}; it was treated as a source material.`);
      return { ...nextTarget, quantity };
    }
    if (depth > maxDepth || stack.includes(key)) {
      // Recipe data can contain loops through conversion/package chains. The
      // depth and stack checks make the failure explicit instead of freezing the
      // UI or returning an infinite plan.
      addRaw({ ...nextTarget, quantity });
      warnings.push(`Recipe chain for ${nextTarget.name} was stopped to avoid a loop or excessive depth.`);
      return { ...nextTarget, quantity };
    }

    const recipes = recipesForTarget(detail, nextTarget);
    const selectedId = selections[key];
    const recipe = recipes.find((candidate) => recipeId(candidate) === selectedId) ?? recipes[0];
    if (!recipe) {
      addRaw({ ...detailTarget(detail), ...nextTarget, quantity });
      return { ...detailTarget(detail), ...nextTarget, quantity };
    }

    if (recipes.length > 1) {
      warnings.push(`${nextTarget.name} has ${recipes.length} recipes. ${selectedId ? "The selected recipe was used." : "The simplest available recipe was used."}`);
    }

    const outputStack = recipeOutputs(recipe).find((candidate) => stackMatches(candidate, nextTarget));
    const outputPerCraft = Math.max(Number.EPSILON, Number(outputStack?.quantity ?? recipe.outputQuantity ?? 1) || 1);
    const craftCount = Math.ceil(quantity / outputPerCraft);
    const directInputs = recipeInputs(recipe).map((inputStack, index) => {
      const material = enrichStack(inputStack, recipe.consumedItems?.[index]);
      return { material, required: material.quantity * craftCount };
    });
    if (depth === 0) {
      const mergedDirect = new Map<string, RecipeMaterial>();
      for (const { material, required } of directInputs) {
        const materialKey = recipeKey(material.kind, material.id);
        const current = mergedDirect.get(materialKey);
        mergedDirect.set(materialKey, { ...material, quantity: (current?.quantity ?? 0) + required });
      }
      directMaterials = [...mergedDirect.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    const inputs = directInputs.map(({ material, required }) => {
      const inputTarget: RecipeTarget = {
        id: material.id,
        kind: material.kind,
        name: material.name,
        itemType: material.itemType,
        tier: material.tier,
        rarityStr: material.rarityStr,
        tag: material.tag,
        iconAssetName: material.iconAssetName,
      };
      return resolve(inputTarget, required, [...stack, key], depth + 1);
    });
    const output = { ...nextTarget, quantity: craftCount * outputPerCraft };
    steps.push({
      id: String(recipe.id ?? `${key}-${steps.length}`),
      recipeName: String(recipe.name ?? nextTarget.name),
      output,
      inputs,
      craftCount,
      outputPerCraft,
      buildingName: recipe.buildingName == null ? undefined : String(recipe.buildingName),
      buildingTier: numericOrUndefined(recipe.buildingTier ?? recipe.buildingRequirementTier),
      skillName: recipe.levelRequirements?.[0]?.skill?.name == null ? undefined : String(recipe.levelRequirements[0].skill.name),
      skillLevel: numericOrUndefined(recipe.levelRequirements?.[0]?.level),
      isPassive: Boolean(recipe.isPassive),
      alternatives: recipes.length,
    });
    return { ...nextTarget, quantity };
  }

  resolve(target, safeAmount, [], 0);
  return {
    target: { ...target, quantity: safeAmount },
    directMaterials,
    rawMaterials: [...raw.values()].sort((a, b) => a.name.localeCompare(b.name)),
    steps,
    warnings: [...new Set(warnings)],
  };
}
