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
    if (!functions.some((entry) => (
      Number(entry?.craftingSlots ?? entry?.crafting_slots ?? 0) > 0
      || Number(entry?.refiningSlots ?? entry?.refining_slots ?? 0) > 0
    ))) continue;
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
      source: "relay-global-catalog",
      workstations: workstations.sort((a, b) => a.family.localeCompare(b.family)),
    }))
    .sort((a, b) => a.tier - b.tier);
}

export function normalizeCatalogWorkstationTarget(building = {}, recipe = {}, getEntity = () => null) {
  const id = String(building.id ?? "").trim();
  const name = String(building.name ?? `Workstation #${id}`);
  const requirements = (Array.isArray(recipe.inputs) ? recipe.inputs : []).flatMap((stack) => {
    const stackId = String(stack?.id ?? stack?.itemId ?? "").trim();
    const kind = String(stack?.kind ?? "").toLowerCase() === "cargo" ? "cargo" : "items";
    const quantity = Math.max(0, Number(stack?.quantity) || 0);
    if (!stackId || !quantity) return [];
    const display = getEntity(`${kind}:${stackId}`) ?? {};
    return [{
      id: stackId,
      kind,
      itemType: kind === "cargo" ? 1 : 0,
      name: String(display.name ?? `${kind === "cargo" ? "Cargo" : "Item"} #${stackId}`),
      quantity,
      tier: integer(display.tier),
      rarityStr: display.rarity ?? display.rarityStr ?? null,
      tag: display.tag ?? null,
      iconAssetName: display.iconAssetName ?? null,
    }];
  });
  return {
    id,
    kind: "building",
    itemType: 2,
    name,
    family: workstationFamily(name) ?? name,
    tier: workstationTier(building),
    iconAssetName: building.iconAssetName ?? null,
    quantity: 1,
    constructionRecipeId: recipe.id == null ? null : String(recipe.id),
    requirements,
  };
}

export const WORKSTATION_FAMILY_COUNT = WORKSTATION_FAMILIES.length;
