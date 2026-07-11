const WORKSTATION_FAMILIES = [
  "Leatherworking Station",
  "Carpentry Station",
  "Smithing Station",
  "Tailoring Station",
  "Masonry Station",
  "Foraging Station",
  "Forestry Station",
  "Fishing Station",
  "Farming Station",
  "Scholar Station",
  "Mining Station",
  "Hunting Station",
  "Tanning Tub",
  "Smelter",
  "Kiln",
  "Loom",
];

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function workstationFamily(name) {
  const clean = String(name ?? "").trim();
  return WORKSTATION_FAMILIES.find((family) => clean.endsWith(family)) ?? null;
}

export function workstationTier(building = {}) {
  const levels = (Array.isArray(building.functions) ? building.functions : [])
    .map((entry) => integer(entry?.level))
    .filter((level) => level != null && level >= 1 && level <= 10);
  return levels.length ? Math.max(...levels) : null;
}

export function buildWorkstationPresets(payload) {
  const buildings = Array.isArray(payload?.buildings) ? payload.buildings : Array.isArray(payload) ? payload : [];
  const grouped = new Map();
  for (const building of buildings) {
    const family = workstationFamily(building?.name);
    const tier = workstationTier(building);
    const id = String(building?.id ?? "").trim();
    if (!family || !id || tier == null || tier < 2 || tier > 10 || building?.showInCompendium === false) continue;
    const functions = Array.isArray(building.functions) ? building.functions : [];
    if (!functions.some((entry) => Number(entry?.crafting_slots ?? 0) > 0 || Number(entry?.refining_slots ?? 0) > 0)) continue;
    const rows = grouped.get(tier) ?? [];
    rows.push({
      id,
      kind: "building",
      itemType: 2,
      name: String(building.name),
      family,
      tier,
      iconAssetName: building.iconAssetName ?? null,
      quantity: 1,
    });
    grouped.set(tier, rows);
  }
  return [...grouped.entries()]
    .map(([tier, workstations]) => ({
      key: `workstations-tier-${tier}`,
      label: `T${tier}`,
      tier,
      source: "bitjita-buildings",
      workstations: workstations.sort((a, b) => a.family.localeCompare(b.family)),
    }))
    .sort((a, b) => a.tier - b.tier);
}

function requirementFromStack(stack, displays, kind) {
  const id = String(stack?.item_id ?? stack?.itemId ?? "").trim();
  if (!id) return null;
  const display = displays.get(id) ?? {};
  const quantity = Math.max(0, Number(stack?.quantity) || 0);
  if (!quantity) return null;
  return {
    id,
    kind,
    itemType: kind === "cargo" ? 1 : 0,
    name: String(display.name ?? `${kind === "cargo" ? "Cargo" : "Item"} #${id}`),
    quantity,
    tier: integer(display.tier),
    rarityStr: display.rarityStr ?? display.rarity ?? null,
    tag: display.tag ?? null,
    iconAssetName: display.iconAssetName ?? null,
  };
}

export function normalizeWorkstationTarget(payload, fallback = {}) {
  const building = payload?.building ?? {};
  const recipe = payload?.constructionRecipe ?? {};
  const itemDisplays = new Map((Array.isArray(payload?.itemInfo) ? payload.itemInfo : []).map((item) => [String(item.id), item]));
  const cargoDisplays = new Map((Array.isArray(payload?.cargoInfo) ? payload.cargoInfo : []).map((item) => [String(item.id), item]));
  const requirements = [
    ...(Array.isArray(recipe.consumedItemStacks) ? recipe.consumedItemStacks : []).map((stack) => requirementFromStack(stack, itemDisplays, "items")),
    ...(Array.isArray(recipe.consumedCargoStacks) ? recipe.consumedCargoStacks : []).map((stack) => requirementFromStack(stack, cargoDisplays, "cargo")),
  ].filter(Boolean);
  const id = String(building.id ?? fallback.id ?? "").trim();
  const name = String(building.name ?? fallback.name ?? `Workstation #${id}`);
  return {
    id,
    kind: "building",
    itemType: 2,
    name,
    family: workstationFamily(name) ?? fallback.family ?? name,
    tier: workstationTier(building) ?? integer(fallback.tier),
    iconAssetName: building.iconAssetName ?? fallback.iconAssetName ?? null,
    quantity: 1,
    constructionRecipeId: recipe.id == null ? null : String(recipe.id),
    requirements,
  };
}

export const WORKSTATION_FAMILY_COUNT = WORKSTATION_FAMILIES.length;
