const DEFAULT_PLAN_NAME = "Settlement craft plan";
const PLAN_SECTIONS = new Set([
  "Carpentry",
  "Construction",
  "Cooking",
  "Farming",
  "Fishing",
  "Foraging",
  "Forestry",
  "Hunting",
  "Leatherworking",
  "Masonry",
  "Mining",
  "Scholar",
  "Smithing",
  "Tailoring",
  "Other",
]);

export function recipeKey(kind, id) {
  const normalizedKind = String(kind) === "cargo" ? "cargo" : String(kind) === "building" ? "building" : "items";
  return `${normalizedKind}:${String(id ?? "").trim()}`;
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function normalizeKind(value) {
  if (String(value) === "building" || String(value) === "2") return "building";
  return String(value) === "cargo" || String(value) === "1" ? "cargo" : "items";
}

function itemTypeFromKind(kind) {
  return kind === "cargo" ? 1 : kind === "building" ? 2 : 0;
}

function normalizedTier(value) {
  const explicit = Number(value);
  return Number.isFinite(explicit) && explicit >= 1 && explicit <= 10 ? explicit : null;
}

function normalizeTarget(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id ?? value.itemId ?? value.targetId ?? "").trim();
  if (!/^\d+$/.test(id)) return null;
  const kind = normalizeKind(value.kind ?? value.itemType ?? value.item_type);
  const quantity = Math.max(1, Math.ceil(toNumber(value.quantity)));
  const target = {
    id,
    kind,
    itemType: itemTypeFromKind(kind),
    name: String(value.name ?? value.itemName ?? `Item #${id}`).trim() || `Item #${id}`,
    quantity,
    tier: normalizedTier(value.tier),
    rarityStr: value.rarityStr == null && value.rarity == null ? null : String(value.rarityStr ?? value.rarity),
    tag: value.tag == null ? null : String(value.tag),
    iconAssetName: value.iconAssetName == null ? null : String(value.iconAssetName),
  };
  if (kind === "building") {
    target.family = value.family == null ? null : String(value.family);
    target.constructionRecipeId = value.constructionRecipeId == null ? null : String(value.constructionRecipeId);
    target.requirements = (Array.isArray(value.requirements) ? value.requirements : [])
      .map((requirement) => normalizeTarget(requirement))
      .filter((requirement) => requirement && requirement.kind !== "building");
  }
  return target;
}

function expandedPlanTargets(targets, buildingProgress = {}) {
  const merged = new Map();
  for (const target of targets) {
    const completed = target.kind === "building" ? buildingProgress[recipeKey(target.kind, target.id)]?.completedEntityIds?.length ?? 0 : 0;
    const remainingQuantity = target.kind === "building" ? Math.max(0, target.quantity - completed) : target.quantity;
    const rows = target.kind === "building"
      ? (target.requirements ?? []).map((requirement) => ({ ...requirement, quantity: requirement.quantity * remainingQuantity }))
      : [target];
    for (const row of rows) {
      const key = recipeKey(row.kind, row.id);
      const current = merged.get(key);
      merged.set(key, current ? { ...current, quantity: current.quantity + row.quantity } : { ...row });
    }
  }
  return [...merged.values()].filter((target) => target.quantity > 0);
}

export function craftPlanCatalogTargets(config) {
  const normalized = normalizeCraftPlanConfig(config);
  return expandedPlanTargets(normalized.targets, normalized.buildingProgress).filter((target) => target.kind !== "building" && target.quantity > 0);
}

export function normalizeCraftPlanConfig(input = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const routeOverrides = {};
  for (const [key, value] of Object.entries(raw.routeOverrides ?? {})) {
    const cleanKey = String(key ?? "").trim();
    const cleanValue = String(value ?? "").trim();
    if (cleanKey && cleanValue) routeOverrides[cleanKey] = cleanValue;
  }
  const sectionOverrides = {};
  for (const [key, value] of Object.entries(raw.sectionOverrides ?? {})) {
    const cleanKey = String(key ?? "").trim();
    const section = String(value ?? "").trim();
    if (cleanKey && PLAN_SECTIONS.has(section)) sectionOverrides[cleanKey] = section;
  }
  const rowNameOverrides = {};
  for (const [key, value] of Object.entries(raw.rowNameOverrides ?? {})) {
    const cleanKey = String(key ?? "").trim();
    const cleanValue = String(value ?? "").trim().slice(0, 80);
    if (cleanKey && cleanValue) rowNameOverrides[cleanKey] = cleanValue;
  }
  const multipliers = {};
  for (const [key, value] of Object.entries(raw.multipliers ?? {})) {
    const cleanKey = String(key ?? "").trim();
    const rawMultiplier = typeof value === "object" && value ? value.multiplier : value;
    const multiplier = Math.max(1, Math.min(20, toNumber(rawMultiplier) || 1));
    if (cleanKey && multiplier > 1) {
      multipliers[cleanKey] = {
        multiplier,
        note: typeof value === "object" && value?.note != null ? String(value.note).slice(0, 160) : "",
      };
    }
  }
  const playerIds = uniqueStrings(raw.sourceRules?.playerIds);
  const craftPlayerIds = Array.isArray(raw.sourceRules?.craftPlayerIds) ? uniqueStrings(raw.sourceRules.craftPlayerIds) : playerIds;
  const targets = (Array.isArray(raw.targets) ? raw.targets : []).map(normalizeTarget).filter(Boolean).slice(0, 50);
  const buildingTargetKeys = new Set(targets.filter((target) => target.kind === "building").map((target) => recipeKey(target.kind, target.id)));
  const buildingProgress = {};
  for (const [key, value] of Object.entries(raw.buildingProgress ?? {})) {
    if (!buildingTargetKeys.has(key) || !value || typeof value !== "object") continue;
    buildingProgress[key] = {
      baselineEntityIds: uniqueStrings(value.baselineEntityIds),
      completedEntityIds: uniqueStrings(value.completedEntityIds),
    };
  }
  return {
    enabled: raw.enabled !== false,
    name: String(raw.name ?? DEFAULT_PLAN_NAME).trim().slice(0, 120) || DEFAULT_PLAN_NAME,
    targets,
    sourceRules: {
      storageContainerIds: uniqueStrings(raw.sourceRules?.storageContainerIds),
      playerIds,
      craftPlayerIds,
      deployableContainerIds: uniqueStrings(raw.sourceRules?.deployableContainerIds),
    },
    routeOverrides,
    sectionOverrides,
    rowNameOverrides,
    multipliers,
    buildingProgress,
  };
}

function claimBuildingRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.buildings)) return payload.buildings;
  if (Array.isArray(payload?.data?.buildings)) return payload.data.buildings;
  return [];
}

export function reconcileCraftPlanBuildingProgress(config, claimBuildingsPayload) {
  const normalized = normalizeCraftPlanConfig(config);
  const rows = claimBuildingRows(claimBuildingsPayload);
  const nextProgress = {};
  for (const target of normalized.targets.filter((entry) => entry.kind === "building")) {
    const key = recipeKey(target.kind, target.id);
    const currentIds = uniqueStrings(rows
      .filter((building) => String(building?.buildingDescriptionId ?? building?.building_description_id ?? "") === String(target.id))
      .map((building) => building?.entityId ?? building?.entity_id));
    const existing = normalized.buildingProgress[key];
    if (!existing) {
      nextProgress[key] = { baselineEntityIds: currentIds, completedEntityIds: [] };
      continue;
    }
    const baseline = new Set(existing.baselineEntityIds);
    nextProgress[key] = {
      baselineEntityIds: existing.baselineEntityIds,
      completedEntityIds: uniqueStrings([...existing.completedEntityIds, ...currentIds.filter((id) => !baseline.has(id))]),
    };
  }
  const changed = JSON.stringify(nextProgress) !== JSON.stringify(normalized.buildingProgress);
  return { config: { ...normalized, buildingProgress: nextProgress }, changed };
}

function stackKind(stack) {
  return normalizeKind(stack?.item_type ?? stack?.itemType);
}

function stackId(stack) {
  return String(stack?.item_id ?? stack?.itemId ?? stack?.id ?? "").trim();
}

function stackMatches(stack, target) {
  return stackId(stack) === String(target.id) && stackKind(stack) === target.kind;
}

function unwrapRecipeDetail(detail) {
  return detail?.detail && typeof detail.detail === "object" ? detail.detail : detail;
}

function detailTarget(detail, fallback) {
  const unwrapped = unwrapRecipeDetail(detail);
  const source = unwrapped?.item ?? unwrapped?.cargo ?? unwrapped ?? {};
  const kind = normalizeKind(source.itemType ?? source.item_type ?? fallback?.kind);
  return {
    id: String(source.id ?? fallback?.id ?? "").trim(),
    kind,
    itemType: itemTypeFromKind(kind),
    name: String(source.name ?? fallback?.name ?? "Unknown item"),
    tier: normalizedTier(source.tier ?? fallback?.tier),
    rarityStr: source.rarityStr ?? source.rarity ?? fallback?.rarityStr ?? null,
    tag: source.tag ?? fallback?.tag ?? null,
    iconAssetName: source.iconAssetName ?? fallback?.iconAssetName ?? null,
  };
}

function recipeOutputs(recipe) {
  return Array.isArray(recipe?.craftedItemStacks) ? recipe.craftedItemStacks : [];
}

function recipeInputs(recipe) {
  return Array.isArray(recipe?.consumedItemStacks) ? recipe.consumedItemStacks : [];
}

function stackDisplayLooksTransport(display) {
  return /\b(unpack|unpackage|packed|package)\b/i.test(String(display?.name ?? display?.tag ?? display?.itemTag ?? ""));
}

function recipeLooksTransportRoute(recipe) {
  if (recipe?.isTransportRoute === true) return true;
  if (/\b(unpack|unpackage|packed|package)\b/i.test(String(recipe?.name ?? ""))) return true;
  const inputDisplays = Array.isArray(recipe?.consumedItems) ? recipe.consumedItems : [];
  const outputDisplays = Array.isArray(recipe?.craftedItems) ? recipe.craftedItems : [];
  return inputDisplays.some(stackDisplayLooksTransport) || outputDisplays.some(stackDisplayLooksTransport);
}

const GATHERING_SKILLS = new Set(["farming", "fishing", "foraging", "forestry", "hunting", "mining"]);

function recipeSkillName(recipe) {
  return String(recipe?.skillName ?? recipe?.levelRequirements?.[0]?.skill?.name ?? "").trim();
}

function isGatheringRecipe(recipe) {
  return GATHERING_SKILLS.has(recipeSkillName(recipe).toLowerCase());
}

function isGatheringByproductRoute(recipe) {
  return recipe?.routeType === "gathering-byproduct";
}

function routeMetadata(recipe) {
  return {
    routeType: recipe?.routeType ?? "craft",
    gatheringSkill: recipe?.gatheringSkill ?? null,
    producer: recipe?.producer ?? null,
    producerRecipe: recipe?.producerRecipe ?? null,
    expectedYield: recipe?.expectedYield == null ? null : toNumber(recipe.expectedYield),
    isProbabilistic: recipe?.isProbabilistic === true,
    dropChance: recipe?.dropChance == null ? null : toNumber(recipe.dropChance),
    dropQuantity: recipe?.dropQuantity == null ? null : toNumber(recipe.dropQuantity),
    guaranteedYield: recipe?.guaranteedYield == null ? null : toNumber(recipe.guaranteedYield),
    gatheringSource: recipe?.gatheringSource ?? null,
  };
}

function farmingRoutePreference(recipe, target, detailsByKey) {
  const targetTag = String(target?.tag ?? "").trim();
  const targetTier = normalizedTier(target?.tier);
  if (!/\bPlant$/i.test(targetTag) || targetTier == null) return 0;
  const inputs = recipeInputs(recipe).map((input, index) => {
    const display = stackDisplay(input, recipe?.consumedItems, index);
    return detailsByKey instanceof Map ? enrichDisplayFromDetails(display, detailsByKey) : display;
  });
  const usesLowerTierPlant = inputs.some((input) => String(input.tag ?? "").trim() === targetTag && input.tier != null && input.tier < targetTier);
  if (usesLowerTierPlant) return 1000;
  const usesSameTierSeeds = inputs.some((input) => /\bSeeds?$/i.test(String(input.tag ?? input.name ?? "")) && input.tier === targetTier);
  return usesSameTierSeeds ? -1000 : 0;
}

function recipeSortScore(recipe, target, detailsByKey) {
  const targetOutput = recipeOutputs(recipe).find((output) => stackMatches(output, target));
  const routeCost = (recipeInputs(recipe).reduce((sum, input) => sum + Math.max(0, toNumber(input.quantity)), 0)
    / Math.max(0.0001, toNumber(targetOutput?.quantity) || 1)) * 100;
  return (recipeLooksTransportRoute(recipe) ? 10000 : 0)
    + farmingRoutePreference(recipe, target, detailsByKey)
    + routeCost
    + (recipe?.isPassive ? 10 : 0)
    + recipeInputs(recipe).length;
}

function directRecipesForTarget(detail, target) {
  const unwrapped = unwrapRecipeDetail(detail);
  return [...(unwrapped?.craftingRecipes ?? []), ...(unwrapped?.extractionRecipes ?? [])]
    .filter((recipe) => recipeOutputs(recipe).some((stack) => stackMatches(stack, target)));
}

function possibilityTargetId(possibility) {
  return String(possibility?.targetId ?? possibility?.targetItem?.id ?? possibility?.itemId ?? possibility?.id ?? "").trim();
}

function possibilityKind(possibility) {
  return possibility?.isCargo === true || String(possibility?.itemType ?? possibility?.item_type) === "1" ? "cargo" : "items";
}

function possibilityYieldForTarget(detail, target) {
  return possibilityExpectedOutputs(detail)
    .find((output) => output.id === String(target.id) && output.kind === target.kind)?.quantity ?? 0;
}

function possibilityExpectedOutputs(detail) {
  const unwrapped = unwrapRecipeDetail(detail);
  const outputs = new Map();
  for (const possibility of unwrapped?.itemListPossibilities ?? []) {
    const id = possibilityTargetId(possibility);
    if (!id) continue;
    const kind = possibilityKind(possibility);
    const quantity = Math.max(0, toNumber(possibility.quantity));
    const rawChance = possibility.chance == null ? 1 : toNumber(possibility.chance);
    const chance = Math.max(0, Math.min(1, rawChance > 1 ? rawChance / 100 : rawChance));
    const expectedYield = quantity * Math.max(0, Math.min(1, chance || 0));
    if (expectedYield <= 0) continue;
    const key = recipeKey(kind, id);
    const current = outputs.get(key) ?? {
      id,
      kind,
      itemType: itemTypeFromKind(kind),
      name: String(possibility?.targetItem?.name ?? possibility?.name ?? `Item #${id}`),
      tier: normalizedTier(possibility?.targetItem?.tier ?? possibility?.tier),
      tag: possibility?.targetItem?.tag ?? possibility?.tag ?? null,
      rarityStr: possibility?.targetItem?.rarityStr ?? possibility?.targetItem?.rarity ?? null,
      iconAssetName: possibility?.targetItem?.iconAssetName ?? null,
      quantity: 0,
      explicitGuaranteedQuantity: 0,
      hasExplicitGuarantee: true,
      minimumQuantity: Number.POSITIVE_INFINITY,
      totalChance: 0,
      weightedDropQuantity: 0,
    };
    current.quantity += expectedYield;
    const explicitGuarantee = possibility?.guaranteedQuantity ?? possibility?.guaranteed_quantity;
    current.hasExplicitGuarantee = current.hasExplicitGuarantee && explicitGuarantee != null && Number.isFinite(Number(explicitGuarantee));
    current.explicitGuaranteedQuantity += Math.max(0, toNumber(explicitGuarantee));
    current.minimumQuantity = Math.min(current.minimumQuantity, quantity);
    current.totalChance += chance;
    current.weightedDropQuantity += quantity * chance;
    outputs.set(key, current);
  }
  return [...outputs.values()].map(({ explicitGuaranteedQuantity, hasExplicitGuarantee, minimumQuantity, totalChance, weightedDropQuantity, ...output }) => ({
    ...output,
    dropChance: Math.min(1, totalChance),
    dropQuantity: totalChance > 0 ? weightedDropQuantity / totalChance : 0,
    guaranteedQuantity: hasExplicitGuarantee
      ? explicitGuaranteedQuantity
      : totalChance >= 1 - 1e-9 && Number.isFinite(minimumQuantity) ? minimumQuantity : 0,
  }));
}

function possibilityRecipesForTarget(target, detailsByKey) {
  if (!(detailsByKey instanceof Map)) return [];
  const recipes = [];
  for (const [sourceKey, detail] of detailsByKey.entries()) {
    const expectedOutputs = possibilityExpectedOutputs(detail);
    const yieldQuantity = expectedOutputs.find((output) => output.id === String(target.id) && output.kind === target.kind)?.quantity ?? 0;
    if (yieldQuantity <= 0) continue;
    const outputTarget = detailTarget(detail, {});
    if (!outputTarget.id || recipeKey(outputTarget.kind, outputTarget.id) === recipeKey(target.kind, target.id)) continue;
    for (const recipe of directRecipesForTarget(detail, outputTarget)) {
      if (recipeLooksTransportRoute(recipe)) continue;
      const output = recipeOutputs(recipe).find((stackItem) => stackMatches(stackItem, outputTarget));
      const outputPerCraft = Math.max(1, toNumber(output?.quantity ?? recipe.outputQuantity) || 1);
      const gatheringSkill = recipeSkillName(recipe);
      const routeType = isGatheringRecipe(recipe) ? "gathering-byproduct" : "byproduct";
      const craftedOutputs = expectedOutputs.map((expectedOutput) => ({
        ...expectedOutput,
        quantity: expectedOutput.quantity * outputPerCraft,
        guaranteedQuantity: expectedOutput.guaranteedQuantity * outputPerCraft,
      }));
      recipes.push({
        ...recipe,
        id: `possibility:${recipeId(recipe)}:${recipeKey(target.kind, target.id)}`,
        name: `${recipeLabel(recipe)} -> ${target.name}`,
        craftedItemStacks: craftedOutputs.map((craftedOutput) => ({
          item_id: craftedOutput.id,
          item_type: craftedOutput.kind === "cargo" ? "cargo" : "item",
          quantity: craftedOutput.quantity,
          guaranteedQuantity: craftedOutput.guaranteedQuantity,
        })),
        craftedItems: craftedOutputs,
        consumedItemStacks: recipeInputs(recipe),
        consumedItems: Array.isArray(recipe?.consumedItems) ? recipe.consumedItems : [],
        sourceOutputKey: sourceKey,
        sourceOutput: outputTarget,
        routeType,
        gatheringSkill: routeType === "gathering-byproduct" ? gatheringSkill : null,
        producer: outputTarget,
        producerRecipe: {
          id: recipeId(recipe),
          name: recipeLabel(recipe),
          buildingName: recipe.buildingName ?? recipe.building_name ?? null,
          skillName: gatheringSkill || null,
        },
        isExpectedYield: true,
        isProbabilistic: craftedOutputs.some((craftedOutput) => craftedOutput.guaranteedQuantity < craftedOutput.quantity),
        expectedYield: yieldQuantity * outputPerCraft,
        dropChance: craftedOutputs.find((craftedOutput) => craftedOutput.id === String(target.id) && craftedOutput.kind === target.kind)?.dropChance ?? null,
        dropQuantity: craftedOutputs.find((craftedOutput) => craftedOutput.id === String(target.id) && craftedOutput.kind === target.kind)?.dropQuantity ?? null,
        guaranteedYield: craftedOutputs.find((craftedOutput) => craftedOutput.id === String(target.id) && craftedOutput.kind === target.kind)?.guaranteedQuantity ?? 0,
        gatheringSource: recipe.gatheringSource ?? null,
      });
    }
  }
  return recipes;
}

function recipesForTarget(detail, target, detailsByKey = null) {
  const recipes = [...directRecipesForTarget(detail, target), ...possibilityRecipesForTarget(target, detailsByKey)];
  const gatheringByproductRoutes = recipes.filter(isGatheringByproductRoute);
  return (gatheringByproductRoutes.length ? gatheringByproductRoutes : recipes)
    .sort((a, b) => recipeSortScore(a, target, detailsByKey) - recipeSortScore(b, target, detailsByKey));
}

function fishingRouteFamily(item) {
  const tag = String(item?.tag ?? "").toLowerCase();
  if (tag.includes("ocean fish")) return "ocean";
  if (tag.includes("lake fish")) return "lake";
  return null;
}

function guaranteedTargetYield(recipe, target) {
  const output = recipeOutputs(recipe).find((entry) => stackMatches(entry, target));
  const guaranteed = output?.guaranteedQuantity ?? output?.guaranteed_quantity;
  if (recipe?.isExpectedYield === true && guaranteed == null) return 0;
  const minimum = toNumber(guaranteed ?? output?.quantityMin ?? output?.minQuantity ?? output?.quantity);
  return Number.isFinite(minimum) && minimum > 0 ? minimum : 0;
}

function recipeLabel(recipe) {
  return String(recipe?.label ?? recipe?.name ?? recipe?.recipeName ?? recipeId(recipe) ?? "Recipe");
}

function recipeId(recipe) {
  return String(recipe?.id ?? recipe?.name ?? "");
}

function recipeMatchesOverride(recipe, overrideId) {
  const selected = String(overrideId ?? "").trim();
  if (!selected) return false;
  return recipeId(recipe) === selected || String(recipe?.recipeKey ?? recipe?.catalogRecipeKey ?? "") === selected;
}

function selectedRecipeForTarget(recipes, overrideId, blockedKeys = []) {
  const overridden = recipes.find((recipe) => recipeMatchesOverride(recipe, overrideId));
  if (overridden) return overridden;
  const blocked = new Set(blockedKeys);
  return recipes.find((recipe) => {
    if (recipeLooksTransportRoute(recipe)) return false;
    return !recipeInputs(recipe).some((input) => blocked.has(recipeKey(stackKind(input), stackId(input))));
  }) ?? null;
}

function mergeDetailTarget(detail, target) {
  const detailed = detailTarget(detail, target);
  return { ...target, ...detailed, quantity: target.quantity };
}

function enrichDisplayFromDetails(display, detailsByKey) {
  const detail = detailsByKey.get(recipeKey(display.kind, display.id));
  if (!detail) return display;
  const detailed = detailTarget(detail, display);
  return { ...display, ...detailed, id: display.id, kind: display.kind, itemType: itemTypeFromKind(display.kind) };
}

function stackDisplay(stack, displays, index) {
  const display = Array.isArray(displays) ? displays[index] ?? {} : {};
  const kind = stackKind(stack);
  return {
    id: stackId(stack),
    kind,
    itemType: itemTypeFromKind(kind),
    name: String(display.name ?? stack.name ?? `Item #${stackId(stack)}`),
    tier: normalizedTier(display.tier ?? stack.tier),
    rarityStr: display.rarityStr ?? display.rarity ?? stack.rarityStr ?? stack.rarity ?? null,
    tag: display.tag ?? stack.tag ?? null,
    iconAssetName: display.iconAssetName ?? stack.iconAssetName ?? null,
  };
}

function addRequired(map, target, quantity, section) {
  const key = recipeKey(target.kind, target.id);
  const current = map.get(key) ?? {
    key,
    id: target.id,
    kind: target.kind,
    itemType: itemTypeFromKind(target.kind),
    name: target.name,
    tier: target.tier ?? null,
    rarityStr: target.rarityStr ?? null,
    tag: target.tag ?? null,
    iconAssetName: target.iconAssetName ?? null,
    section: section || sectionForMaterial(target, null),
    required: 0,
  };
  current.required += quantity;
  if (!current.section || current.section === "Other") current.section = section || sectionForMaterial(target, null);
  map.set(key, current);
}

function sectionForMaterial(material, recipe) {
  const skill = recipe?.levelRequirements?.[0]?.skill?.name ?? recipe?.skillName;
  return skill ? String(skill) : "Other";
}

function sectionOverrideKeyForItem(item) {
  const tag = String(item?.tag ?? item?.itemTag ?? item?.categoryTag ?? "").trim();
  if (tag && !/^trade\s+good$/i.test(tag)) return `tag:${tag}`;
  return `item:${recipeKey(item?.kind, item?.id)}`;
}

function routeAlternativesForUi(recipes) {
  return recipes;
}

function sourceRoutesForTarget(target, detailsByKey, routeOverrides) {
  const detail = detailsByKey.get(recipeKey(target.kind, target.id));
  if (!detail) return [];
  const normalizedTarget = mergeDetailTarget(detail, target);
  const key = recipeKey(normalizedTarget.kind, normalizedTarget.id);
  const recipes = recipesForTarget(detail, normalizedTarget, detailsByKey);
  const selected = selectedRecipeForTarget(recipes, routeOverrides[key], [key]);
  if (!selected) return [];
  const visibleRecipes = routeAlternativesForUi(recipes, selected);
  const gatheringSources = visibleRecipes
    .filter(isGatheringByproductRoute)
    .map((recipe) => ({
      label: recipe.gatheringSource?.label ?? recipe.producer?.tag ?? recipe.producer?.name ?? "Gathering",
      tag: recipe.gatheringSource?.tag ?? recipe.producer?.tag ?? null,
      expectedYield: toNumber(recipe.expectedYield),
    }))
    .filter((source, index, sources) => sources.findIndex((candidate) => candidate.label === source.label) === index)
    .sort((a, b) => (a.label === "Sand" ? -1 : b.label === "Sand" ? 1 : a.label.localeCompare(b.label)));
  return [{
    id: recipeId(selected),
    recipeName: gatheringSources.length > 1 ? `Gather from ${gatheringSources.map((source) => source.label).join(" or ")}` : recipeLabel(selected),
    ...routeMetadata(selected),
    output: normalizedTarget,
    inputs: recipeInputs(selected).map((input, index) => ({
      ...enrichDisplayFromDetails(stackDisplay(input, selected.consumedItems, index), detailsByKey),
      quantity: toNumber(input.quantity),
      quantityPerCraft: toNumber(input.quantity),
    })),
    buildingName: selected.buildingName ?? selected.building_name ?? null,
    selectedRecipeId: recipeId(selected),
    alternatives: visibleRecipes.map((alternative) => ({
      id: recipeId(alternative),
      label: recipeLabel(alternative),
      ...routeMetadata(alternative),
      buildingName: alternative.buildingName ?? alternative.building_name ?? null,
      inputs: recipeInputs(alternative).map((input, index) => ({
        ...enrichDisplayFromDetails(stackDisplay(input, alternative.consumedItems, index), detailsByKey),
        quantity: toNumber(input.quantity),
      })),
    })),
    gatheringSources,
  }];
}

function buildRequirementMapPass(targets, detailsByKey, routeOverrides, multipliers = {}, effectiveStockTotals = new Map()) {
  const required = new Map();
  const steps = [];
  const warnings = [];
  const usages = new Map();
  const remainingSupply = new Map([...effectiveStockTotals.entries()].map(([key, value]) => [key, Math.max(0, toNumber(value?.total))]));

  function resolve(target, quantity, stack, parentRecipe) {
    const key = recipeKey(target.kind, target.id);
    const detail = detailsByKey.get(key);
    if (stack.includes(key)) return;
    if (!detail || stack.length > 14) {
      addRequired(required, target, quantity, sectionForMaterial(target, parentRecipe));
      if (!detail) warnings.push(`No recipe data was available for ${target.name}; it was treated as a source material.`);
      return;
    }
    const normalizedTarget = mergeDetailTarget(detail, target);
    const availableSupply = remainingSupply.get(key) ?? 0;
    const allocatedSupply = Math.min(quantity, availableSupply);
    remainingSupply.set(key, availableSupply - allocatedSupply);
    const quantityToCraft = Math.max(0, quantity - allocatedSupply);
    const recipes = recipesForTarget(detail, normalizedTarget, detailsByKey);
    const selected = selectedRecipeForTarget(recipes, routeOverrides[key], [...stack, key]);
    addRequired(required, normalizedTarget, quantity, sectionForMaterial(normalizedTarget, selected ?? parentRecipe));
    if (quantityToCraft <= 0 || !selected) return;
    const output = recipeOutputs(selected).find((stackItem) => stackMatches(stackItem, normalizedTarget));
    const rawOutputPerCraft = toNumber(output?.quantity ?? selected.outputQuantity) || 1;
    const outputPerCraft = String(selected.id ?? "").startsWith("possibility:") ? Math.max(0.0001, rawOutputPerCraft) : Math.max(1, rawOutputPerCraft);
    const unbufferedCraftCount = Math.ceil(quantityToCraft / outputPerCraft);
    const multiplier = selected.isProbabilistic === true ? multipliers[key]?.multiplier ?? 1 : 1;
    const craftCount = Math.ceil(quantityToCraft * multiplier / outputPerCraft);
    const section = sectionForMaterial(normalizedTarget, selected);
    const visibleRecipes = routeAlternativesForUi(recipes, selected);
    const alternatives = visibleRecipes.map((recipe) => ({
      id: recipeId(recipe),
      label: String(recipe.name ?? normalizedTarget.name),
      inputs: recipeInputs(recipe).map((input, index) => ({
        ...enrichDisplayFromDetails(stackDisplay(input, recipe.consumedItems, index), detailsByKey),
        quantity: toNumber(input.quantity),
        quantityPerCraft: toNumber(input.quantity),
      })),
    }));
    const rawInputs = recipeInputs(selected).map((input, index) => ({ input, index }));
    const siblingKeys = new Set(rawInputs.map(({ input }) => recipeKey(stackKind(input), stackId(input))));
    rawInputs.sort((a, b) => {
      const score = ({ input, index }) => {
        const material = enrichDisplayFromDetails(stackDisplay(input, selected.consumedItems, index), detailsByKey);
        const detail = detailsByKey.get(recipeKey(material.kind, material.id));
        if (!detail) return 1;
        const recipes = recipesForTarget(detail, material, detailsByKey);
        const producer = selectedRecipeForTarget(recipes, routeOverrides[recipeKey(material.kind, material.id)], [...stack, key, recipeKey(material.kind, material.id)]);
        return producer && recipeOutputs(producer).some((candidate) => siblingKeys.has(recipeKey(stackKind(candidate), stackId(candidate))) && !stackMatches(candidate, material)) ? 0 : 1;
      };
      return score(a) - score(b) || a.index - b.index;
    });
    const inputs = rawInputs.map(({ input, index }) => {
      const material = enrichDisplayFromDetails(stackDisplay(input, selected.consumedItems, index), detailsByKey);
      const requiredQuantity = toNumber(input.quantity) * craftCount;
      const usageKey = recipeKey(material.kind, material.id);
      const currentUsages = usages.get(usageKey) ?? [];
      currentUsages.push({
        outputKey: key,
        output: { ...normalizedTarget, quantity: craftCount * outputPerCraft },
        recipeName: String(selected.name ?? normalizedTarget.name),
        selectedRecipeId: recipeId(selected),
        alternatives,
        requiredQuantity,
        quantityPerCraft: toNumber(input.quantity),
        craftCount,
        unbufferedCraftCount,
        multiplier,
        buildingName: selected.buildingName ?? null,
        section,
      });
      usages.set(usageKey, currentUsages);
      resolve(material, requiredQuantity, [...stack, key], selected);
      return { ...material, quantity: requiredQuantity };
    });
    steps.push({
      id: recipeId(selected),
      recipeName: String(selected.name ?? normalizedTarget.name),
      ...routeMetadata(selected),
      output: { ...normalizedTarget, quantity: craftCount * outputPerCraft },
      inputs,
      craftCount,
      unbufferedCraftCount,
      multiplier,
      outputPerCraft,
      section,
      buildingName: selected.buildingName ?? null,
      alternatives: visibleRecipes.map((recipe) => ({
        id: recipeId(recipe),
        label: recipeLabel(recipe),
        ...routeMetadata(recipe),
        buildingName: recipe.buildingName ?? recipe.building_name ?? null,
        inputs: recipeInputs(recipe).map((input, index) => ({
          ...enrichDisplayFromDetails(stackDisplay(input, recipe.consumedItems, index), detailsByKey),
          quantity: toNumber(input.quantity),
        })),
      })),
      selectedRecipeId: recipeId(selected),
    });
  }

  for (const target of targets) resolve(target, target.quantity, [], null);
  return { required, steps, usages, warnings: [...new Set(warnings)] };
}

function buildRequirementMap(targets, detailsByKey, routeOverrides, multipliers = {}, effectiveStockTotals = new Map()) {
  return buildRequirementMapPass(targets, detailsByKey, routeOverrides, multipliers, effectiveStockTotals);
}


function catalogKeyParts(key) {
  const [rawKind, ...rest] = String(key ?? "").split(":");
  const id = rest.join(":").trim();
  return { kind: normalizeKind(rawKind), id };
}


function catalogEntityDisplay(entity, fallback = {}) {
  const kind = normalizeKind(entity?.kind ?? fallback.kind ?? fallback.itemType ?? fallback.item_type);
  const id = String(entity?.targetId ?? entity?.id ?? fallback.id ?? fallback.itemId ?? fallback.targetId ?? "").trim();
  return {
    id,
    itemType: itemTypeFromKind(kind),
    kind,
    name: String(entity?.name ?? fallback.name ?? fallback.itemName ?? `${kind === "cargo" ? "Cargo" : "Item"} #${id}`),
    tag: entity?.tag ?? fallback.tag ?? null,
    tier: normalizedTier(entity?.tier ?? fallback.tier),
    rarityStr: entity?.rarity ?? fallback.rarityStr ?? fallback.rarity ?? null,
    iconAssetName: entity?.iconAssetName ?? fallback.iconAssetName ?? null,
  };
}

function catalogRouteId(recipe) {
  const value = String(recipe?.recipeKey ?? "").trim();
  if (value.startsWith("recipe-hash:")) return recipe?.name ? String(recipe.name) : value.slice("recipe-hash:".length);
  if (value.startsWith("recipe:")) return value.slice("recipe:".length);
  const marker = ":recipe:";
  const index = value.indexOf(marker);
  const suffix = index >= 0 ? value.slice(index + marker.length) : value;
  return /^[a-f0-9]{12}$/i.test(suffix) && recipe?.name ? String(recipe.name) : suffix;
}

function catalogStack(link = {}) {
  const kind = normalizeKind(link.kind);
  return {
    item_id: String(link.targetId ?? link.id ?? ""),
    item_type: kind === "cargo" ? "cargo" : "item",
    quantity: toNumber(link.quantity),
  };
}

function catalogLinkedDisplay(repository, link = {}, warnings, fallback = {}) {
  const key = link.inputKey ?? link.outputKey ?? recipeKey(link.kind, link.targetId);
  const entity = repository.getEntity(key);
  if (!entity) warnings.add(`Local catalog identity is missing for ${key}; planner used an id-only fallback.`);
  return catalogEntityDisplay(entity, { ...fallback, id: link.targetId, kind: link.kind });
}

function catalogPlannerRecipe(repository, recipe, warnings) {
  const outputs = (recipe.outputs ?? []).map((output) => catalogStack(output));
  const outputDisplays = (recipe.outputs ?? []).map((output) => catalogLinkedDisplay(repository, output, warnings));
  const inputs = (recipe.inputs ?? []).map((input) => catalogStack(input));
  const inputDisplays = (recipe.inputs ?? []).map((input) => catalogLinkedDisplay(repository, input, warnings));
  const id = catalogRouteId(recipe);
  return {
    id,
    recipeKey: recipe.recipeKey,
    catalogRecipeKey: recipe.recipeKey,
    name: String(recipe.name ?? (id || "Recipe")),
    buildingName: recipe.stationName ?? null,
    stationName: recipe.stationName ?? null,
    skillName: recipe.skillName ?? null,
    isPassive: recipe.isPassive === true,
    isTransportRoute: recipe.isTransportRoute === true,
    craftedItemStacks: outputs,
    craftedItems: outputDisplays,
    consumedItemStacks: inputs,
    consumedItems: inputDisplays,
    levelRequirements: recipe.skillName ? [{ skill: { name: recipe.skillName }, level: 0 }] : [],
  };
}

function catalogByproductPossibility(repository, row, warnings) {
  const outputKey = row.outputKey ?? recipeKey(row.kind, row.targetId);
  const entity = repository.getEntity(outputKey);
  if (!entity) warnings.add(`Local catalog identity is missing for ${outputKey}; planner used an id-only fallback.`);
  const targetItem = catalogEntityDisplay(entity, { id: row.targetId, kind: row.kind });
  return {
    targetId: targetItem.id,
    itemType: targetItem.itemType,
    targetItem,
    quantity: toNumber(row.quantity),
    chance: row.chance == null ? 1 : toNumber(row.chance),
    guaranteedQuantity: Math.max(0, toNumber(row.guaranteedQuantity)),
    isCargo: targetItem.kind === "cargo",
  };
}

function catalogGatheringOutputSource(producer) {
  const tag = String(producer?.tag ?? "").trim();
  if (tag === "Sand Output") return { tag, label: "Sand", skill: "Mining" };
  if (tag === "Clay Output") return { tag, label: "Clay", skill: "Mining" };
  return null;
}

function catalogGatheringOutputRecipe(row, producerTarget, source) {
  return {
    id: `gathering-output:${row.producerKey}`,
    name: `Gather ${source.label}`,
    skillName: source.skill,
    gatheringSource: source,
    craftedItemStacks: [{ item_id: producerTarget.id, item_type: producerTarget.kind === "cargo" ? "cargo" : "item", quantity: 1 }],
    craftedItems: [producerTarget],
    consumedItemStacks: [],
    consumedItems: [],
    levelRequirements: [{ skill: { name: source.skill }, level: 0 }],
  };
}

function localCatalogDetail(repository, key, fallbackTarget, byproductRows, warnings) {
  const { kind, id } = catalogKeyParts(key);
  const entity = repository.getEntity(key);
  const recipes = repository.listProducerRecipesForOutput(key);
  if (!entity && recipes.length === 0 && byproductRows.length === 0) return null;
  if (!entity) warnings.add(`Local catalog identity is missing for ${key}; planner used an id-only fallback.`);
  const source = catalogEntityDisplay(entity, { ...fallbackTarget, id, kind });
  return {
    [kind === "cargo" ? "cargo" : "item"]: source,
    craftingRecipes: recipes.map((recipe) => catalogPlannerRecipe(repository, recipe, warnings)),
    extractionRecipes: [],
    recipesUsingItem: [],
    itemListPossibilities: byproductRows.map((row) => catalogByproductPossibility(repository, row, warnings)),
  };
}

export function collectLocalCatalogCraftPlanDetails(repository, targets, routeOverrides = {}, maxDepth = 64) {
  const detailsByKey = new Map();
  const warnings = new Set();
  const byproductsByProducerKey = new Map();
  const visiting = new Set();
  const completed = new Set();

  function addByproductProducer(row) {
    if (!row?.producerKey) return;
    const rows = byproductsByProducerKey.get(row.producerKey) ?? [];
    if (!rows.some((existing) => existing.outputKey === row.outputKey && existing.targetId === row.targetId)) rows.push(row);
    byproductsByProducerKey.set(row.producerKey, rows);
  }

  function setDetail(key, fallbackTarget = {}) {
    const existing = detailsByKey.get(key);
    if (existing) {
      existing.itemListPossibilities = (byproductsByProducerKey.get(key) ?? []).map((row) => catalogByproductPossibility(repository, row, warnings));
      return existing;
    }
    const detail = localCatalogDetail(repository, key, fallbackTarget, byproductsByProducerKey.get(key) ?? [], warnings);
    if (detail) detailsByKey.set(key, detail);
    return detail;
  }

  function visit(rawTarget, depth, isRoot = false) {
    const target = normalizeTarget({ ...rawTarget, quantity: rawTarget?.quantity ?? 1 });
    if (!target) return;
    const key = recipeKey(target.kind, target.id);
    if (depth > maxDepth) {
      warnings.add(`Local catalog recursion limit reached while loading ${key}.`);
      return;
    }
    if (visiting.has(key)) return;

    const byproductProducers = repository.listByproductProducersForOutput(key);
    for (const row of byproductProducers) addByproductProducer(row);
    if (completed.has(key)) {
      setDetail(key, target);
      return;
    }
    visiting.add(key);

    const detail = setDetail(key, target);
    if (!detail && byproductProducers.length === 0) {
      warnings.add(`Local catalog data is missing for ${key}; planner treated it as a source material.`);
      visiting.delete(key);
      return;
    }
    if (isRoot && detail && directRecipesForTarget(detail, mergeDetailTarget(detail, target)).length === 0 && byproductProducers.length === 0) {
      warnings.add(`Local catalog has no producer recipe or byproduct route for ${key}; planner treated it as a source material.`);
    }

    let usableByproductProducers = 0;
    for (const row of byproductProducers) {
      const producerTarget = catalogEntityDisplay(row.producer, { id: row.producer?.targetId, kind: row.producer?.kind });
      const producerDetail = setDetail(row.producerKey, producerTarget);
      let producerRecipes = producerDetail
        ? directRecipesForTarget(producerDetail, mergeDetailTarget(producerDetail, producerTarget))
        : [];
      const gatheringSource = catalogGatheringOutputSource(row.producer);
      if (producerDetail && producerRecipes.length === 0 && gatheringSource) {
        producerDetail.craftingRecipes.push(catalogGatheringOutputRecipe(row, producerTarget, gatheringSource));
        producerRecipes = directRecipesForTarget(producerDetail, mergeDetailTarget(producerDetail, producerTarget));
      }
      if (producerRecipes.length > 0) usableByproductProducers += 1;
    }
    if (byproductProducers.length > 0 && usableByproductProducers === 0) {
      warnings.add(`Local catalog byproduct routes are incomplete for ${target.name} (${key}); planner retained verified direct routes. ${byproductProducers.length} producer candidate${byproductProducers.length === 1 ? "" : "s"} require catalog data.`);
    }

    const currentDetail = detailsByKey.get(key);
    if (!currentDetail) {
      visiting.delete(key);
      return;
    }
    const normalizedTarget = mergeDetailTarget(currentDetail, target);
    const recipes = recipesForTarget(currentDetail, normalizedTarget, detailsByKey);
    const selected = selectedRecipeForTarget(recipes, routeOverrides[key], [...visiting]);
    if (selected) {
      const inputs = recipeInputs(selected);
      for (let index = 0; index < inputs.length; index += 1) {
        visit(stackDisplay(inputs[index], selected.consumedItems, index), depth + 1, false);
      }
    }
    completed.add(key);
    visiting.delete(key);
  }

  for (const target of targets ?? []) visit(target, 0, true);
  return { detailsByKey, warnings: [...warnings] };
}
export async function collectRecipeDetails(targets, fetchDetail, routeOverrides = {}, maxDepth = 14) {
  const details = new Map();
  const pending = new Set();

  async function visit(target, depth) {
    const key = recipeKey(target.kind, target.id);
    if (details.has(key) || pending.has(key) || depth > maxDepth) return;
    pending.add(key);
    let detail;
    try {
      detail = await fetchDetail(target);
    } catch {
      pending.delete(key);
      return;
    }
    pending.delete(key);
    details.set(key, detail);
    const normalizedTarget = mergeDetailTarget(detail, target);
    const recipes = recipesForTarget(detail, normalizedTarget, details);
    const selected = recipes.find((recipe) => recipeMatchesOverride(recipe, routeOverrides[key])) ?? recipes[0];
    if (!selected) return;
    const inputs = recipeInputs(selected);
    for (let index = 0; index < inputs.length; index += 1) {
      await visit(stackDisplay(inputs[index], selected.consumedItems, index), depth + 1);
    }
  }

  for (const target of targets ?? []) await visit(target, 0);
  return details;
}
function normalizeSourceItem(item) {
  const id = String(item?.itemId ?? item?.item_id ?? item?.outputItemId ?? item?.craftedItem?.[0]?.item_id ?? item?.id ?? "").trim();
  if (!id) return null;
  const kind = normalizeKind(item?.kind ?? item?.itemType ?? item?.item_type);
  const quantity = toNumber(item?.quantity ?? item?.qty ?? item?.amount);
  const guaranteedQuantity = item?.guaranteedQuantity ?? item?.guaranteed_quantity;
  return {
    key: recipeKey(kind, id),
    id,
    kind,
    quantity,
    guaranteedQuantity: guaranteedQuantity == null ? 0 : Math.max(0, toNumber(guaranteedQuantity)),
    name: item?.name == null ? `Item #${id}` : String(item.name),
    playerId: item?.playerId == null ? null : String(item.playerId),
    playerName: item?.playerName == null && item?.crafterName == null ? null : String(item.playerName ?? item.crafterName),
    buildingName: item?.buildingName == null ? null : String(item.buildingName),
    craftId: item?.craftId == null && item?.id == null ? null : String(item.craftId ?? item.id),
  };
}

function addSourceTotals(totals, sources, type, unavailable, quantityField = "quantity") {
  for (const source of sources ?? []) {
    if (source?.unavailable) {
      unavailable.push({ sourceId: String(source.sourceId ?? ""), label: String(source.label ?? type), type, error: String(source.error ?? "Unavailable") });
      continue;
    }
    for (const rawItem of source?.items ?? []) {
      const item = normalizeSourceItem(rawItem);
      const quantity = item?.[quantityField] ?? 0;
      if (!item || quantity <= 0) continue;
      const current = totals.get(item.key) ?? { total: 0, sources: [] };
      current.total += quantity;
      current.sources.push({
        sourceId: String(source.sourceId ?? ""),
        label: String(source.label ?? item.buildingName ?? type),
        type,
        quantity,
        expectedQuantity: item.quantity,
        guaranteedQuantity: item.guaranteedQuantity,
        playerId: source.playerId == null ? item.playerId : String(source.playerId),
        playerName: source.playerName == null ? item.playerName : String(source.playerName),
        buildingName: source.buildingName == null ? item.buildingName : String(source.buildingName),
        craftId: source.craftId == null ? item.craftId : String(source.craftId),
        status: source.status == null ? item.status : String(source.status),
        completed: source.completed == null ? item.completed === true : source.completed === true,
      });
      totals.set(item.key, current);
    }
  }
}

function countedActiveCraftTotals(expectedTotals, guaranteedTotals) {
  const totals = new Map();
  const keys = new Set([...expectedTotals.keys(), ...guaranteedTotals.keys()]);
  for (const key of keys) {
    const expected = Math.max(0, toNumber(expectedTotals.get(key)?.total));
    const guaranteed = Math.max(0, toNumber(guaranteedTotals.get(key)?.total));
    const total = Math.max(guaranteed, Math.floor(expected + 1e-9));
    totals.set(key, {
      total,
      guaranteedTotal: guaranteed,
      estimatedTotal: Math.max(0, total - guaranteed),
      sources: expectedTotals.get(key)?.sources ?? guaranteedTotals.get(key)?.sources ?? [],
    });
  }
  return totals;
}

function groupGatherNext(materials) {
  const grouped = new Map();
  for (const material of materials.filter((item) => item.missing > 0)) {
    const section = material.section || "Other";
    const items = grouped.get(section) ?? [];
    items.push(material);
    grouped.set(section, items);
  }
  return [...grouped.entries()]
    .map(([section, items]) => ({ section, items: items.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name)).slice(0, 6) }))
    .sort((a, b) => (b.items[0]?.missing ?? 0) - (a.items[0]?.missing ?? 0) || a.section.localeCompare(b.section));
}

function pickPlannerItem(item) {
  return Object.fromEntries(["key", "id", "kind", "itemType", "name", "tag", "tier", "iconAssetName"]
    .filter((key) => item?.[key] != null)
    .map((key) => [key, item[key]]));
}

function routeStock(route, totals) {
  const key = recipeKey(route.input.kind, route.input.id);
  return totals.get(key)?.total ?? 0;
}

function routeStockSources(route, totals) {
  const key = recipeKey(route.input.kind, route.input.id);
  return totals.get(key)?.sources ?? [];
}

function unavailableFishingRoute() {
  return { available: false, reason: "Verified route unavailable" };
}

function addFishingCatalogWarning(warnings, message) {
  if (warnings instanceof Set) warnings.add(message);
  else if (Array.isArray(warnings)) warnings.push(message);
}

function normalizeFishingAlternatives(recipes, oil, detailsByKey, availableTotals, activeCraftTotals, warnings) {
  const routes = {
    ocean: unavailableFishingRoute(),
    lake: unavailableFishingRoute(),
  };
  for (const recipe of recipes) {
    const inputStack = recipeInputs(recipe)[0];
    if (!inputStack) continue;
    const input = enrichDisplayFromDetails(stackDisplay(inputStack, recipe.consumedItems, 0), detailsByKey);
    const family = fishingRouteFamily(input);
    const guaranteedYield = guaranteedTargetYield(recipe, oil);
    const expectedYield = Math.max(0, toNumber(recipe?.expectedYield));
    const planningYield = guaranteedYield > 0 ? guaranteedYield : expectedYield;
    if (!family) continue;
    if (planningYield <= 0) {
      addFishingCatalogWarning(warnings, `${family === "ocean" ? "Ocean" : "Lake"} Fish route to ${oil.name} has no positive yield in the local catalog.`);
      continue;
    }
    if (routes[family].available) continue;
    const route = {
      input: pickPlannerItem(input),
      inputQuantity: Math.max(1, toNumber(inputStack.quantity) || 1),
      recipeName: recipeLabel(recipe),
      buildingName: recipe.buildingName ?? recipe.building_name ?? null,
      selectedRecipeId: recipeId(recipe),
    };
    const active = activeCraftTotals.get(recipeKey(route.input.kind, route.input.id));
    const routeAlternatives = recipes.filter((alternative) => {
      const alternativeInput = recipeInputs(alternative)[0];
      if (!alternativeInput) return false;
      const display = enrichDisplayFromDetails(stackDisplay(alternativeInput, alternative.consumedItems, 0), detailsByKey);
      return fishingRouteFamily(display) === family;
    }).map((alternative) => ({
      id: recipeId(alternative),
      label: recipeLabel(alternative),
      ...routeMetadata(alternative),
      buildingName: alternative.buildingName ?? alternative.building_name ?? null,
      inputs: recipeInputs(alternative).map((stack, index) => ({
        ...enrichDisplayFromDetails(stackDisplay(stack, alternative.consumedItems, index), detailsByKey),
        quantity: toNumber(stack.quantity),
        quantityPerCraft: toNumber(stack.quantity),
      })),
    }));
    routes[family] = {
      available: true,
      ...route,
      guaranteedYield: planningYield,
      estimated: guaranteedYield <= 0,
      isProbabilistic: recipe.isProbabilistic === true,
      stockQuantity: routeStock(route, availableTotals),
      trackedQuantity: active?.total ?? 0,
      guaranteedTrackedQuantity: active?.guaranteedTotal ?? 0,
      estimatedTrackedQuantity: active?.estimatedTotal ?? 0,
      sources: routeStockSources(route, availableTotals),
      activeCraftSources: active?.sources ?? [],
      alternatives: routeAlternatives,
    };
  }
  return routes;
}

export function buildPersonalFishingView({ materials, detailsByKey, availableTotals, activeCraftTotals, multipliers = {}, warnings }) {
  const fishOilMaterials = (materials ?? []).filter((item) => String(item?.tag ?? "").toLowerCase().includes("fish oil"));
  return { tiers: fishOilMaterials.map((oil) => {
    const alternatives = recipesForTarget(detailsByKey.get(oil.key), oil, detailsByKey);
    const routes = normalizeFishingAlternatives(alternatives, oil, detailsByKey, availableTotals, activeCraftTotals, warnings);
    const verifiedRoutes = Object.values(routes).filter((route) => route.available);
    const activeOil = activeCraftTotals.get(oil.key);
    const trackedOil = activeOil?.total ?? 0;
    const availableOilEquivalent = oil.available + trackedOil + verifiedRoutes.reduce((total, route) => (
      total + (route.stockQuantity + route.trackedQuantity) * route.guaranteedYield
    ), 0);
    const remainingOil = Math.max(0, oil.bufferedRequired - availableOilEquivalent);
    return {
      tier: oil.tier,
      outputKey: oil.key,
      output: pickPlannerItem(oil),
      requiredOil: oil.bufferedRequired,
      availableOil: oil.available,
      trackedOil,
      guaranteedTrackedOil: activeOil?.guaranteedTotal ?? 0,
      estimatedTrackedOil: activeOil?.estimatedTotal ?? 0,
      remainingOil,
      routes: Object.fromEntries(Object.entries(routes).map(([family, route]) => {
        if (!route.available) return [family, route];
        const unbufferedNeeded = Math.ceil(remainingOil / route.guaranteedYield);
        const multiplier = route.isProbabilistic === true ? multipliers[oil.key]?.multiplier ?? 1 : 1;
        const needed = Math.ceil(remainingOil * multiplier / route.guaranteedYield);
        return [family, {
          ...route,
          unbufferedNeeded,
          multiplier,
          needed,
          usage: {
            outputKey: oil.key,
            output: { ...pickPlannerItem(oil), quantity: remainingOil },
            recipeName: route.recipeName,
            buildingName: route.buildingName,
            selectedRecipeId: route.selectedRecipeId,
            alternatives: route.alternatives,
            requiredQuantity: needed,
            quantityPerCraft: route.inputQuantity,
            craftCount: Math.ceil(needed / route.inputQuantity),
          },
        }];
      })),
    };
  }) };
}

export function computeCraftPlan({
  config,
  detailsByKey = new Map(),
  storageSources = [],
  playerSources = [],
  deployableSources = [],
  activeCrafts = [],
  craftSourceErrors = [],
  catalogWarnings = [],
} = {}) {
  const normalized = normalizeCraftPlanConfig(config);
  if (!normalized.enabled || normalized.targets.length === 0) {
    return { config: normalized, enabled: normalized.enabled, targets: [], materials: [], steps: [], gatherNext: [], unavailableSources: [], warnings: [], personalViews: { fishing: { tiers: [] } } };
  }
  const availableTotals = new Map();
  const unavailableSources = [];
  addSourceTotals(availableTotals, storageSources, "Settlement storage", unavailableSources);
  addSourceTotals(availableTotals, playerSources, "Player inventory", unavailableSources);
  addSourceTotals(availableTotals, deployableSources, "Player deployable", unavailableSources);
  unavailableSources.push(...(craftSourceErrors ?? []).map((source) => ({
    sourceId: String(source?.sourceId ?? "tracked-crafts"),
    label: String(source?.label ?? "Tracked crafts"),
    type: String(source?.type ?? "Tracked crafts"),
    error: String(source?.error ?? "Unable to load tracked crafts"),
  })));

  const expectedActiveTotals = new Map();
  const guaranteedActiveTotals = new Map();
  const craftPlayerIds = new Set(normalized.sourceRules.craftPlayerIds.map(String));
  const activeCraftSources = (activeCrafts ?? [])
    .filter((craft) => craftPlayerIds.has(String(craft?.playerId ?? craft?.playerEntityId ?? "")))
    .map((craft) => ({
      sourceId: String(craft.id ?? craft.craftId ?? "active-craft"),
      label: String(craft.buildingName ?? "Active craft"),
      type: "Active craft",
      playerId: craft.playerId ?? craft.playerEntityId ?? null,
      playerName: craft.playerName ?? craft.crafterName ?? null,
      buildingName: craft.buildingName ?? null,
      craftId: craft.id ?? craft.craftId ?? null,
      status: craft.status ?? (craft.completed ? "Ready to collect" : "In progress"),
      completed: craft.completed === true,
      items: [craft],
    }));
  addSourceTotals(expectedActiveTotals, activeCraftSources, "Active craft", unavailableSources, "quantity");
  addSourceTotals(guaranteedActiveTotals, activeCraftSources, "Active craft", unavailableSources, "guaranteedQuantity");
  const countedActiveTotals = countedActiveCraftTotals(expectedActiveTotals, guaranteedActiveTotals);

  const effectiveStockTotals = new Map(availableTotals);
  for (const [key, active] of countedActiveTotals.entries()) {
    const current = effectiveStockTotals.get(key) ?? { total: 0, sources: [] };
    effectiveStockTotals.set(key, { ...current, total: current.total + active.total, sources: current.sources });
  }
  const calculationTargets = expandedPlanTargets(normalized.targets, normalized.buildingProgress);
  const { required, steps, usages, warnings } = buildRequirementMap(calculationTargets, detailsByKey, normalized.routeOverrides, normalized.multipliers, effectiveStockTotals);

  const targetKeys = new Set(normalized.targets.filter((target) => target.kind !== "building").map((target) => recipeKey(target.kind, target.id)));
  for (const target of calculationTargets) {
    if (!required.has(recipeKey(target.kind, target.id))) addRequired(required, target, target.quantity, sectionForMaterial(target, null));
  }

  const materials = [...required.values()].map((item) => {
    const enrichedItem = enrichDisplayFromDetails(item, detailsByKey);
    const sourceRoutes = sourceRoutesForTarget({ ...item, ...enrichedItem }, detailsByKey, normalized.routeOverrides);
    const probabilistic = sourceRoutes.some((route) => route.isProbabilistic === true);
    const multiplier = probabilistic ? normalized.multipliers[item.key]?.multiplier ?? 1 : 1;
    const bufferedRequired = item.required;
    const available = availableTotals.get(item.key)?.total ?? 0;
    const active = countedActiveTotals.get(item.key);
    const inProgress = active?.total ?? 0;
    const guaranteedInProgress = active?.guaranteedTotal ?? 0;
    const estimatedInProgress = active?.estimatedTotal ?? 0;
    const apiSection = item.section || sectionForMaterial(enrichedItem, null);
    const sectionOverrideKey = sectionOverrideKeyForItem({ ...item, ...enrichedItem });
    const sectionOverride = normalized.sectionOverrides[sectionOverrideKey] ?? null;
    const rowNameOverride = normalized.rowNameOverrides[sectionOverrideKey] ?? null;
    return {
      ...item,
      ...enrichedItem,
      key: item.key,
      id: item.id,
      kind: item.kind,
      itemType: itemTypeFromKind(item.kind),
      required: item.required,
      apiSection,
      sectionOverrideKey,
      sectionOverride,
      rowNameOverride,
      section: sectionOverride || apiSection,
      isTarget: targetKeys.has(item.key),
      multiplier,
      multiplierNote: normalized.multipliers[item.key]?.note ?? "",
      bufferedRequired,
      available,
      inProgress,
      guaranteedInProgress,
      estimatedInProgress,
      missing: Math.max(0, bufferedRequired - available - inProgress),
      sources: availableTotals.get(item.key)?.sources ?? [],
      activeCraftSources: active?.sources ?? [],
      sourceRoutes,
      recipeUsages: usages.get(item.key) ?? [],
    };
  }).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

  const targets = normalized.targets.map((target) => {
    if (target.kind === "building") {
      const progress = normalized.buildingProgress[recipeKey(target.kind, target.id)];
      const available = Math.min(target.quantity, progress?.completedEntityIds?.length ?? 0);
      return { ...target, available, inProgress: 0, guaranteedInProgress: 0, estimatedInProgress: 0, missing: Math.max(0, target.quantity - available), progressInitialized: Boolean(progress) };
    }
    const material = materials.find((item) => item.key === recipeKey(target.kind, target.id));
    const enrichedTarget = enrichDisplayFromDetails(target, detailsByKey);
    return {
      ...target,
      ...enrichedTarget,
      quantity: target.quantity,
      missing: material?.missing ?? 0,
      available: material?.available ?? 0,
      inProgress: material?.inProgress ?? 0,
      guaranteedInProgress: material?.guaranteedInProgress ?? 0,
      estimatedInProgress: material?.estimatedInProgress ?? 0,
    };
  });

  const personalViews = {
    fishing: buildPersonalFishingView({ materials, detailsByKey, availableTotals, activeCraftTotals: countedActiveTotals, multipliers: normalized.multipliers, warnings }),
  };

  return {
    config: normalized,
    enabled: true,
    targets,
    materials,
    steps,
    personalViews,
    gatherNext: groupGatherNext(materials.filter((item) => !item.isTarget)),
    unavailableSources,
    warnings: [...new Set([...warnings, ...(Array.isArray(catalogWarnings) ? catalogWarnings : [])])],
    totals: {
      targets: targets.length,
      missingItems: materials.filter((item) => item.missing > 0).length,
      missingQuantity: materials.reduce((sum, item) => sum + item.missing, 0),
      activeCraftQuantity: materials.reduce((sum, item) => sum + item.inProgress, 0),
    },
  };
}

function compactCraftPlanItem(item = {}) {
  const { sources, activeCraftSources, sourceRoutes, recipeUsages, plannedOutput, ...summary } = item;
  return {
    ...summary,
    hasSourceRoutes: Boolean(item.hasSourceRoutes || sourceRoutes?.length),
    hasRecipeUsages: Boolean(item.hasRecipeUsages || recipeUsages?.length),
  };
}

function craftPlanItemKey(item = {}) {
  if (item.key) return String(item.key);
  const id = String(item.id ?? item.itemId ?? item.entityId ?? "").trim();
  return id ? recipeKey(item.kind ?? "items", id) : "";
}

export function compactCraftPlanResponse(plan = {}) {
  return {
    ...plan,
    materials: Array.isArray(plan.materials) ? plan.materials.map(compactCraftPlanItem) : [],
    steps: [],
    gatherNext: Array.isArray(plan.gatherNext) ? plan.gatherNext.map((group) => ({
      ...group,
      items: Array.isArray(group.items) ? group.items.map(compactCraftPlanItem) : [],
    })) : [],
  };
}

export function craftPlanDetailResponse(plan = {}, requestedKeys = []) {
  const keys = new Set(requestedKeys.map(String).filter(Boolean));
  return {
    materials: Array.isArray(plan.materials) ? plan.materials.filter((item) => keys.has(craftPlanItemKey(item))) : [],
    steps: Array.isArray(plan.steps) ? plan.steps.filter((step) => keys.has(craftPlanItemKey(step.output))) : [],
  };
}


