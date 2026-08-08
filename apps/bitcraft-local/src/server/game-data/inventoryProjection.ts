type CatalogEntity = {
  catalogKey?: string;
  kind?: string;
  targetId?: string;
  id?: string;
  name?: string | null;
  tag?: string | null;
  tier?: number | null;
  rarity?: string | null;
  iconAssetName?: string | null;
  [key: string]: unknown;
};

type CatalogStack = {
  itemId?: unknown;
  item_id?: unknown;
  id?: unknown;
  itemType?: unknown;
  item_type?: unknown;
  kind?: unknown;
  quantity?: unknown;
  [key: string]: unknown;
};

type CatalogRecipe = {
  id?: unknown;
  name?: unknown;
  inputs?: CatalogStack[];
  outputs?: CatalogStack[];
  levelRequirements?: Array<{ skillId?: unknown; level?: unknown }>;
  buildingRequirement?: { buildingType?: unknown; tier?: unknown } | null;
  [key: string]: unknown;
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a non-negative decimal integer`);
  return normalized;
}

function catalogKind(value: unknown): "items" | "cargo" {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "cargo" || normalized === "1" ? "cargo" : "items";
}

export function inventoryStackKey(stack: CatalogStack): string {
  const id = decimalInteger(stack.itemId ?? stack.item_id ?? stack.id, "inventory item id");
  return `${catalogKind(stack.itemType ?? stack.item_type ?? stack.kind)}:${id}`;
}

export function explicitInventoryStackKey(stack: CatalogStack): string | null {
  const type = String(stack.itemType ?? stack.item_type ?? stack.kind ?? "").trim().toLowerCase();
  if (!["item", "items", "0", "cargo", "1"].includes(type)) return null;
  return inventoryStackKey(stack);
}

export function mergeClaimInventoryWithBanks(
  claimInventory: unknown,
  bankInventories: unknown,
): Record<string, unknown> {
  const shared = claimInventory && typeof claimInventory === "object" && !Array.isArray(claimInventory)
    ? claimInventory as Record<string, unknown>
    : {};
  const banks = bankInventories && typeof bankInventories === "object" && !Array.isArray(bankInventories)
    ? bankInventories as Record<string, unknown>
    : {};
  const buildings = Array.isArray(shared.buildings) ? [...shared.buildings] : [];
  const knownIds = new Set(buildings.flatMap((building) => (
    building && typeof building === "object" && !Array.isArray(building)
      ? [String((building as Record<string, unknown>).entityId ?? "")]
      : []
  )).filter(Boolean));
  for (const building of Array.isArray(banks.buildings) ? banks.buildings : []) {
    if (!building || typeof building !== "object" || Array.isArray(building)) continue;
    const id = String((building as Record<string, unknown>).entityId ?? "").trim();
    if (!id || knownIds.has(id)) continue;
    knownIds.add(id);
    buildings.push(building);
  }
  return { ...shared, buildings };
}

function inventoryStacks(inventory: unknown): CatalogStack[] {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) return [];
  const source = inventory as Record<string, unknown>;
  const dimensions = Array.isArray(source.dimensions) ? source.dimensions : [];
  const buildings = [
    ...(Array.isArray(source.buildings) ? source.buildings : []),
    ...dimensions.flatMap((dimension) => (
      dimension && typeof dimension === "object" && !Array.isArray(dimension)
        && Array.isArray((dimension as Record<string, unknown>).buildings)
        ? (dimension as Record<string, unknown>).buildings as unknown[]
        : []
    )),
  ];
  return buildings.flatMap((building) => {
    if (!building || typeof building !== "object" || Array.isArray(building)) return [];
    const row = building as Record<string, unknown>;
    if (Array.isArray(row.items)) return row.items as CatalogStack[];
    if (!Array.isArray(row.inventory)) return [];
    return row.inventory.flatMap((slot) => (
      slot && typeof slot === "object" && !Array.isArray(slot)
        ? [(slot as Record<string, unknown>).contents as CatalogStack]
        : []
    )).filter(Boolean);
  });
}

export function enrichInventoryWithCatalog<T>(
  inventory: T,
  getEntity: (catalogKey: string) => CatalogEntity | null,
): T & { catalog: Record<string, CatalogEntity> } {
  const catalog: Record<string, CatalogEntity> = {};
  for (const stack of inventoryStacks(inventory)) {
    const key = inventoryStackKey(stack);
    if (Object.prototype.hasOwnProperty.call(catalog, key)) continue;
    const entity = getEntity(key);
    if (entity) catalog[key] = entity;
  }
  return {
    ...(inventory && typeof inventory === "object" ? inventory : {}) as T,
    catalog,
  };
}

export function addDecimalQuantities(values: unknown[]): string {
  return values.reduce<bigint>((total, value) => (
    total + BigInt(decimalInteger(value ?? 0, "inventory quantity"))
  ), 0n).toString();
}

export function formatDecimalQuantity(value: unknown, locale?: string): string {
  return BigInt(decimalInteger(value ?? 0, "inventory quantity")).toLocaleString(locale);
}

function stackMatches(stack: CatalogStack, key: string): boolean {
  try {
    return inventoryStackKey(stack) === key;
  } catch {
    return false;
  }
}

function recipeView(recipe: CatalogRecipe) {
  const building = recipe.buildingRequirement;
  const buildingType = building?.buildingType == null ? "" : String(building.buildingType);
  const tier = building?.tier == null ? "" : String(building.tier);
  return {
    id: String(recipe.id ?? ""),
    name: String(recipe.name ?? "Recipe"),
    buildingName: buildingType
      ? `Building type #${buildingType}${tier ? ` (Tier ${tier})` : ""}`
      : null,
  };
}

export function buildCatalogItemDetail(options: {
  kind: unknown;
  id: unknown;
  entity: CatalogEntity | null;
  recipes: CatalogRecipe[];
  skills: CatalogEntity[];
}) {
  const kind = catalogKind(options.kind);
  const id = decimalInteger(options.id, "catalog item id");
  const key = `${kind}:${id}`;
  const recipes = Array.isArray(options.recipes) ? options.recipes : [];
  const producing = recipes.filter((recipe) => (
    Array.isArray(recipe.outputs) && recipe.outputs.some((stack) => stackMatches(stack, key))
  ));
  const consuming = recipes.filter((recipe) => (
    Array.isArray(recipe.inputs) && recipe.inputs.some((stack) => stackMatches(stack, key))
  ));
  const skillIds = new Set([...producing, ...consuming].flatMap((recipe) => (
    Array.isArray(recipe.levelRequirements)
      ? recipe.levelRequirements.map((requirement) => String(requirement.skillId ?? "")).filter(Boolean)
      : []
  )));
  const skillsById = new Map((Array.isArray(options.skills) ? options.skills : [])
    .map((skill) => [String(skill.id ?? skill.targetId ?? ""), skill]));
  const entity = options.entity ?? {
    catalogKey: key,
    kind,
    targetId: id,
    name: `${kind === "cargo" ? "Cargo" : "Item"} #${id}`,
  };
  const target = {
    ...entity,
    id,
    itemType: kind === "cargo" ? 1 : 0,
  };
  return {
    ...(kind === "cargo" ? { cargo: target } : { item: target }),
    target,
    craftingRecipes: producing.map(recipeView),
    recipesUsingItem: consuming.map(recipeView),
    relatedSkills: [...skillIds].map((skillId) => {
      const skill = skillsById.get(skillId);
      return {
        id: skillId,
        name: String(skill?.name ?? `Skill #${skillId}`),
      };
    }),
    marketStats: null,
    source: "relay-catalog",
  };
}
