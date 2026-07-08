const DEFAULT_PLAN_NAME = "Settlement craft plan";

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
  return {
    enabled: raw.enabled !== false,
    name: String(raw.name ?? DEFAULT_PLAN_NAME).trim().slice(0, 120) || DEFAULT_PLAN_NAME,
    targets: (Array.isArray(raw.targets) ? raw.targets : []).map(normalizeTarget).filter(Boolean).slice(0, 50),
    sourceRules: {
      storageContainerIds: uniqueStrings(raw.sourceRules?.storageContainerIds),
      playerIds: uniqueStrings(raw.sourceRules?.playerIds),
      deployableContainerIds: uniqueStrings(raw.sourceRules?.deployableContainerIds),
    },
    routeOverrides,
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

function isUnpackRecipe(recipe) {
  return /unpack|package/i.test(String(recipe?.name ?? ""));
}

function recipeSortScore(recipe) {
  return (isUnpackRecipe(recipe) ? 10000 : 0) + (recipe?.isPassive ? 10 : 0) + recipeInputs(recipe).length;
}

function recipesForTarget(detail, target) {
  const unwrapped = unwrapRecipeDetail(detail);
  return [...(unwrapped?.craftingRecipes ?? []), ...(unwrapped?.extractionRecipes ?? [])]
    .filter((recipe) => recipeOutputs(recipe).some((stack) => stackMatches(stack, target)))
    .sort((a, b) => recipeSortScore(a) - recipeSortScore(b));
}

function recipeId(recipe) {
  return String(recipe?.id ?? recipe?.name ?? "");
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
  if (skill) return String(skill);
  const text = `${material?.tag ?? ""} ${material?.name ?? ""}`.toLowerCase();
  if (/fish/.test(text)) return "Fishing";
  if (/animal|hide|pelt|hair|meat/.test(text)) return "Hunting";
  if (/seed|crop|vegetable|bulb|starbulb|flax/.test(text)) return "Farming";
  if (/ore|stone|gem|coal/.test(text)) return "Mining";
  if (/wood|log|plank|branch|bark/.test(text)) return "Forestry";
  if (/mushroom|herb|flower|fiber|plant/.test(text)) return "Foraging";
  return "Other";
}

function buildRequirementMap(targets, detailsByKey, routeOverrides) {
  const required = new Map();
  const steps = [];
  const warnings = [];
  const usages = new Map();

  function resolve(target, quantity, stack, parentRecipe) {
    const key = recipeKey(target.kind, target.id);
    const detail = detailsByKey.get(key);
    if (!detail || stack.includes(key) || stack.length > 14) {
      addRequired(required, target, quantity, sectionForMaterial(target, parentRecipe));
      if (!detail) warnings.push(`No recipe data was available for ${target.name}; it was treated as a source material.`);
      return;
    }
    const normalizedTarget = mergeDetailTarget(detail, target);
    const recipes = recipesForTarget(detail, normalizedTarget);
    const selected = recipes.find((recipe) => recipeId(recipe) === routeOverrides[key]) ?? recipes[0];
    if (!selected) {
      addRequired(required, normalizedTarget, quantity, sectionForMaterial(normalizedTarget, parentRecipe));
      return;
    }
    const output = recipeOutputs(selected).find((stackItem) => stackMatches(stackItem, normalizedTarget));
    const outputPerCraft = Math.max(1, toNumber(output?.quantity ?? selected.outputQuantity) || 1);
    const craftCount = Math.ceil(quantity / outputPerCraft);
    const section = sectionForMaterial(normalizedTarget, selected);
    const alternatives = recipes.map((recipe) => ({
      id: recipeId(recipe),
      label: String(recipe.name ?? normalizedTarget.name),
      inputs: recipeInputs(recipe).map((input, index) => enrichDisplayFromDetails(stackDisplay(input, recipe.consumedItems, index), detailsByKey)),
    }));
    const inputs = recipeInputs(selected).map((input, index) => {
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
      alternatives: recipes.length,
      selectedRecipeId: recipeId(selected),
    });
  }

  for (const target of targets) resolve(target, target.quantity, [], null);
  return { required, steps, usages, warnings: [...new Set(warnings)] };
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
    const recipes = recipesForTarget(detail, normalizedTarget);
    const selected = recipes.find((recipe) => recipeId(recipe) === routeOverrides[key]) ?? recipes[0];
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
      current.sources.push({ sourceId: String(source.sourceId ?? ""), label: String(source.label ?? type), type, quantity: item.quantity });
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
} = {}) {
  const normalized = normalizeCraftPlanConfig(config);
  if (!normalized.enabled || normalized.targets.length === 0) {
    return { config: normalized, enabled: normalized.enabled, targets: [], materials: [], steps: [], gatherNext: [], unavailableSources: [], warnings: [] };
  }
  const { required, steps, usages, warnings } = buildRequirementMap(normalized.targets, detailsByKey, normalized.routeOverrides);
  const availableTotals = new Map();
  const unavailableSources = [];
  addSourceTotals(availableTotals, storageSources, "Settlement storage", unavailableSources);
  addSourceTotals(availableTotals, playerSources, "Player inventory", unavailableSources);
  addSourceTotals(availableTotals, deployableSources, "Player deployable", unavailableSources);

  const activeTotals = new Map();
  addSourceTotals(activeTotals, [{ sourceId: "active-crafts", label: "Active crafts", items: activeCrafts }], "Active craft", unavailableSources);

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
    return {
      ...item,
      ...enrichedItem,
      key: item.key,
      id: item.id,
      kind: item.kind,
      itemType: itemTypeFromKind(item.kind),
      required: item.required,
      section: item.section || sectionForMaterial(enrichedItem, null),
      isTarget: targetKeys.has(item.key),
      multiplier,
      multiplierNote: normalized.multipliers[item.key]?.note ?? "",
      bufferedRequired,
      available,
      inProgress,
      missing: Math.max(0, bufferedRequired - available - inProgress),
      sources: availableTotals.get(item.key)?.sources ?? [],
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
    warnings,
    totals: {
      targets: targets.length,
      missingItems: materials.filter((item) => item.missing > 0).length,
      missingQuantity: materials.reduce((sum, item) => sum + item.missing, 0),
      activeCraftQuantity: materials.reduce((sum, item) => sum + item.inProgress, 0),
    },
  };
}
