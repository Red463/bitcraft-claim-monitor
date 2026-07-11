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
  return `${String(kind) === "cargo" ? "cargo" : "items"}:${String(id ?? "").trim()}`;
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
  return String(value) === "cargo" || String(value) === "1" ? "cargo" : "items";
}

function itemTypeFromKind(kind) {
  return kind === "cargo" ? 1 : 0;
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
  return {
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
  return {
    enabled: raw.enabled !== false,
    name: String(raw.name ?? DEFAULT_PLAN_NAME).trim().slice(0, 120) || DEFAULT_PLAN_NAME,
    targets: (Array.isArray(raw.targets) ? raw.targets : []).map(normalizeTarget).filter(Boolean).slice(0, 50),
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
  };
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

function recipeSortScore(recipe) {
  return (recipeLooksTransportRoute(recipe) ? 10000 : 0) + (recipe?.isPassive ? 10 : 0) + recipeInputs(recipe).length;
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
  const unwrapped = unwrapRecipeDetail(detail);
  const matching = (unwrapped?.itemListPossibilities ?? []).filter((possibility) => possibilityTargetId(possibility) === String(target.id) && possibilityKind(possibility) === target.kind);
  if (!matching.length) return 0;
  return matching.reduce((sum, possibility) => {
    const quantity = Math.max(0, toNumber(possibility.quantity));
    const rawChance = possibility.chance == null ? 1 : toNumber(possibility.chance);
    const chance = rawChance > 1 ? rawChance / 100 : rawChance;
    return sum + quantity * Math.max(0, Math.min(1, chance || 0));
  }, 0);
}

function possibilityRecipesForTarget(target, detailsByKey) {
  if (!(detailsByKey instanceof Map)) return [];
  const recipes = [];
  for (const [sourceKey, detail] of detailsByKey.entries()) {
    const yieldQuantity = possibilityYieldForTarget(detail, target);
    if (yieldQuantity <= 0) continue;
    const outputTarget = detailTarget(detail, {});
    if (!outputTarget.id || recipeKey(outputTarget.kind, outputTarget.id) === recipeKey(target.kind, target.id)) continue;
    for (const recipe of directRecipesForTarget(detail, outputTarget)) {
      if (recipeLooksTransportRoute(recipe)) continue;
      const output = recipeOutputs(recipe).find((stackItem) => stackMatches(stackItem, outputTarget));
      const outputPerCraft = Math.max(1, toNumber(output?.quantity ?? recipe.outputQuantity) || 1);
      recipes.push({
        ...recipe,
        id: `possibility:${recipeId(recipe)}:${recipeKey(target.kind, target.id)}`,
        name: `${recipeLabel(recipe)} -> ${target.name}`,
        craftedItemStacks: [{ item_id: target.id, item_type: target.kind === "cargo" ? "cargo" : "item", quantity: yieldQuantity * outputPerCraft }],
        craftedItems: [{ ...target, itemType: itemTypeFromKind(target.kind), quantity: yieldQuantity * outputPerCraft }],
        consumedItemStacks: recipeInputs(recipe),
        consumedItems: Array.isArray(recipe?.consumedItems) ? recipe.consumedItems : [],
        sourceOutputKey: sourceKey,
        sourceOutput: outputTarget,
      });
    }
  }
  return recipes;
}

function recipesForTarget(detail, target, detailsByKey = null) {
  return [...directRecipesForTarget(detail, target), ...possibilityRecipesForTarget(target, detailsByKey)]
    .sort((a, b) => recipeSortScore(a) - recipeSortScore(b));
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
  return visibleRecipes.map((recipe) => ({
    id: recipeId(recipe),
    recipeName: recipeLabel(recipe),
    output: normalizedTarget,
    inputs: recipeInputs(recipe).map((input, index) => ({
      ...enrichDisplayFromDetails(stackDisplay(input, recipe.consumedItems, index), detailsByKey),
      quantity: toNumber(input.quantity),
      quantityPerCraft: toNumber(input.quantity),
    })),
    buildingName: recipe.buildingName ?? recipe.building_name ?? null,
    selectedRecipeId: recipeId(recipe),
    alternatives: visibleRecipes.map((alternative) => ({ id: recipeId(alternative), label: recipeLabel(alternative), buildingName: alternative.buildingName ?? alternative.building_name ?? null })),
  }));
}

function buildRequirementMapPass(targets, detailsByKey, routeOverrides, effectiveStockTotals = new Map(), assumedPlannedOutputs = new Map()) {
  const required = new Map();
  const steps = [];
  const warnings = [];
  const usages = new Map();
  const plannedOutputs = new Map();
  const remainingSupply = new Map([...effectiveStockTotals.entries()].map(([key, value]) => [key, Math.max(0, toNumber(value?.total))]));
  for (const [key, quantity] of assumedPlannedOutputs.entries()) {
    remainingSupply.set(key, (remainingSupply.get(key) ?? 0) + Math.max(0, toNumber(quantity)));
  }

  function creditPlannedOutput(output, quantity) {
    if (!output?.id || quantity <= 0) return;
    const key = recipeKey(output.kind, output.id);
    plannedOutputs.set(key, (plannedOutputs.get(key) ?? 0) + quantity);
  }

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
    const craftCount = Math.ceil(quantityToCraft / outputPerCraft);
    const craftedStacks = recipeOutputs(selected);
    const craftedDisplays = Array.isArray(selected.craftedItems) ? selected.craftedItems : [];
    craftedStacks.forEach((craftedStack, index) => {
      const crafted = enrichDisplayFromDetails(stackDisplay(craftedStack, craftedDisplays, index), detailsByKey);
      if (recipeKey(crafted.kind, crafted.id) === key) return;
      creditPlannedOutput(crafted, toNumber(craftedStack.quantity) * craftCount);
    });
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
      output: { ...normalizedTarget, quantity: craftCount * outputPerCraft },
      inputs,
      craftCount,
      outputPerCraft,
      section,
      buildingName: selected.buildingName ?? null,
      alternatives: visibleRecipes.map((recipe) => ({ id: recipeId(recipe), label: recipeLabel(recipe), buildingName: recipe.buildingName ?? recipe.building_name ?? null })),
      selectedRecipeId: recipeId(selected),
    });
  }

  for (const target of targets) resolve(target, target.quantity, [], null);
  return { required, steps, usages, plannedOutputs, warnings: [...new Set(warnings)] };
}

function plannedOutputMapsEqual(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    if (Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0)) > 0.0001) return false;
  }
  return true;
}

function buildRequirementMap(targets, detailsByKey, routeOverrides, effectiveStockTotals = new Map()) {
  let assumedPlannedOutputs = new Map();
  let result = null;
  for (let pass = 0; pass < 8; pass += 1) {
    result = buildRequirementMapPass(targets, detailsByKey, routeOverrides, effectiveStockTotals, assumedPlannedOutputs);
    if (plannedOutputMapsEqual(assumedPlannedOutputs, result.plannedOutputs)) return result;
    assumedPlannedOutputs = result.plannedOutputs;
  }
  return result ?? buildRequirementMapPass(targets, detailsByKey, routeOverrides, effectiveStockTotals);
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
    isCargo: targetItem.kind === "cargo",
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

    for (const row of byproductProducers) {
      const producerTarget = catalogEntityDisplay(row.producer, { id: row.producer?.targetId, kind: row.producer?.kind });
      setDetail(row.producerKey, producerTarget);
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
  return {
    key: recipeKey(kind, id),
    id,
    kind,
    quantity: toNumber(item?.quantity ?? item?.qty ?? item?.amount),
    name: item?.name == null ? `Item #${id}` : String(item.name),
    playerId: item?.playerId == null ? null : String(item.playerId),
    playerName: item?.playerName == null && item?.crafterName == null ? null : String(item.playerName ?? item.crafterName),
    buildingName: item?.buildingName == null ? null : String(item.buildingName),
    craftId: item?.craftId == null && item?.id == null ? null : String(item.craftId ?? item.id),
  };
}

function addSourceTotals(totals, sources, type, unavailable) {
  for (const source of sources ?? []) {
    if (source?.unavailable) {
      unavailable.push({ sourceId: String(source.sourceId ?? ""), label: String(source.label ?? type), type, error: String(source.error ?? "Unavailable") });
      continue;
    }
    for (const rawItem of source?.items ?? []) {
      const item = normalizeSourceItem(rawItem);
      if (!item || item.quantity <= 0) continue;
      const current = totals.get(item.key) ?? { total: 0, sources: [] };
      current.total += item.quantity;
      current.sources.push({
        sourceId: String(source.sourceId ?? ""),
        label: String(source.label ?? item.buildingName ?? type),
        type,
        quantity: item.quantity,
        playerId: source.playerId == null ? item.playerId : String(source.playerId),
        playerName: source.playerName == null ? item.playerName : String(source.playerName),
        buildingName: source.buildingName == null ? item.buildingName : String(source.buildingName),
        craftId: source.craftId == null ? item.craftId : String(source.craftId),
      });
      totals.set(item.key, current);
    }
  }
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

export function computeCraftPlan({
  config,
  detailsByKey = new Map(),
  storageSources = [],
  playerSources = [],
  deployableSources = [],
  activeCrafts = [],
  catalogWarnings = [],
} = {}) {
  const normalized = normalizeCraftPlanConfig(config);
  if (!normalized.enabled || normalized.targets.length === 0) {
    return { config: normalized, enabled: normalized.enabled, targets: [], materials: [], steps: [], gatherNext: [], unavailableSources: [], warnings: [] };
  }
  const availableTotals = new Map();
  const unavailableSources = [];
  addSourceTotals(availableTotals, storageSources, "Settlement storage", unavailableSources);
  addSourceTotals(availableTotals, playerSources, "Player inventory", unavailableSources);
  addSourceTotals(availableTotals, deployableSources, "Player deployable", unavailableSources);

  const activeTotals = new Map();
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
      items: [craft],
    }));
  addSourceTotals(activeTotals, activeCraftSources, "Active craft", unavailableSources);

  const effectiveStockTotals = new Map(availableTotals);
  for (const [key, active] of activeTotals.entries()) {
    const current = effectiveStockTotals.get(key) ?? { total: 0, sources: [] };
    effectiveStockTotals.set(key, { ...current, total: current.total + active.total, sources: current.sources });
  }
  const { required, steps, usages, plannedOutputs, warnings } = buildRequirementMap(normalized.targets, detailsByKey, normalized.routeOverrides, effectiveStockTotals);

  const targetKeys = new Set(normalized.targets.map((target) => recipeKey(target.kind, target.id)));
  for (const target of normalized.targets) {
    if (!required.has(recipeKey(target.kind, target.id))) addRequired(required, target, target.quantity, sectionForMaterial(target, null));
  }

  const materials = [...required.values()].map((item) => {
    const enrichedItem = enrichDisplayFromDetails(item, detailsByKey);
    const multiplier = normalized.multipliers[item.key]?.multiplier ?? 1;
    const bufferedRequired = Math.ceil(item.required * multiplier);
    const available = availableTotals.get(item.key)?.total ?? 0;
    const inProgress = activeTotals.get(item.key)?.total ?? 0;
    const plannedOutput = plannedOutputs.get(item.key) ?? 0;
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
      plannedOutput,
      missing: Math.max(0, bufferedRequired - available - inProgress - plannedOutput),
      sources: availableTotals.get(item.key)?.sources ?? [],
      activeCraftSources: activeTotals.get(item.key)?.sources ?? [],
      sourceRoutes: sourceRoutesForTarget({ ...item, ...enrichedItem }, detailsByKey, normalized.routeOverrides),
      recipeUsages: usages.get(item.key) ?? [],
    };
  }).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

  const targets = normalized.targets.map((target) => {
    const material = materials.find((item) => item.key === recipeKey(target.kind, target.id));
    const enrichedTarget = enrichDisplayFromDetails(target, detailsByKey);
    return { ...target, ...enrichedTarget, quantity: target.quantity, missing: material?.missing ?? 0, available: material?.available ?? 0, inProgress: material?.inProgress ?? 0 };
  });

  return {
    config: normalized,
    enabled: true,
    targets,
    materials,
    steps,
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


