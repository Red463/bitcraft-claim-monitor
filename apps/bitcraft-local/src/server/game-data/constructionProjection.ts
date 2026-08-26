type CatalogRecord = {
  id?: unknown;
  targetId?: unknown;
  name?: unknown;
  tier?: unknown;
  rarity?: unknown;
  iconAssetName?: unknown;
  actionsRequired?: unknown;
  buildingDescriptionId?: unknown;
  inputs?: unknown;
  [key: string]: unknown;
};

type ProjectStack = {
  itemId?: unknown;
  itemType?: unknown;
  quantity?: unknown;
  [key: string]: unknown;
};

type ConstructionProject = {
  entityId?: unknown;
  constructionRecipeId?: unknown;
  items?: ProjectStack[];
  cargos?: ProjectStack[];
  [key: string]: unknown;
};

type ConstructionSnapshot = {
  projects?: ConstructionProject[];
  [key: string]: unknown;
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError(`${label} must be a non-negative decimal integer`);
  }
  return normalized;
}

function itemKind(value: unknown): "item" | "cargo" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "item" || normalized === "items" || normalized === "0") return "item";
  if (normalized === "cargo" || normalized === "1") return "cargo";
  throw new TypeError(`Unsupported construction material kind: ${String(value)}`);
}

function catalogKey(kind: "item" | "cargo", id: string): string {
  return `${kind === "item" ? "items" : "cargo"}:${id}`;
}

function contributionTotals(project: ConstructionProject): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  const add = (kind: "item" | "cargo", values: ProjectStack[] | undefined) => {
    for (const stack of Array.isArray(values) ? values : []) {
      const id = decimalInteger(stack.itemId, "construction contribution item id");
      const normalizedKind = itemKind(stack.itemType ?? kind);
      if (normalizedKind !== kind) {
        throw new TypeError(`Construction ${kind} contribution ${id} has ${normalizedKind} identity`);
      }
      const key = `${kind}:${id}`;
      const quantity = BigInt(decimalInteger(stack.quantity ?? 0, "construction contribution quantity"));
      totals.set(key, (totals.get(key) ?? 0n) + quantity);
    }
  };
  add("item", project.items);
  add("cargo", project.cargos);
  return totals;
}

export function enrichConstructionWithCatalog(
  snapshot: unknown,
  getEntity: (catalogKey: string) => CatalogRecord | null,
  getDescription: (kind: string, id: string) => CatalogRecord | null,
) {
  const source = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as ConstructionSnapshot
    : {};
  const warnings: string[] = [];
  const projects = (Array.isArray(source.projects) ? source.projects : []).map((project) => {
    const entityId = decimalInteger(project.entityId, "construction project id");
    const recipeId = decimalInteger(
      project.constructionRecipeId,
      `construction project ${entityId} recipe id`,
    );
    const recipe = getDescription("construction_recipe", recipeId);
    if (!recipe) {
      warnings.push(`Construction project ${entityId} is missing global recipe ${recipeId}.`);
      return {
        ...project,
        recipeId,
        recipeName: null,
        name: `Construction project #${entityId}`,
        buildingDescriptionId: null,
        buildingName: null,
        actionsRequired: "0",
        catalogComplete: false,
        materials: [],
      };
    }

    const recipeName = String(recipe.name ?? "").trim() || `Construction recipe #${recipeId}`;
    const buildingDescriptionId = decimalInteger(
      recipe.buildingDescriptionId,
      `construction recipe ${recipeId} building id`,
    );
    const building = getDescription("building", buildingDescriptionId);
    if (!building) {
      warnings.push(
        `Construction project ${entityId} is missing global building ${buildingDescriptionId}.`,
      );
    }
    const contributions = contributionTotals(project);
    let catalogComplete = Boolean(building);
    const materials = (Array.isArray(recipe.inputs) ? recipe.inputs : []).map((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`Construction recipe ${recipeId} input ${index} must be an object`);
      }
      const input = value as ProjectStack & { kind?: unknown; id?: unknown };
      const kind = itemKind(input.kind ?? input.itemType);
      const itemId = decimalInteger(input.id ?? input.itemId, `construction recipe ${recipeId} input id`);
      const required = decimalInteger(input.quantity, `construction recipe ${recipeId} input quantity`);
      const entity = getEntity(catalogKey(kind, itemId));
      if (!entity) {
        catalogComplete = false;
        warnings.push(
          `Construction project ${entityId} is missing ${kind} catalog row ${itemId}.`,
        );
      }
      return {
        type: kind,
        itemId,
        name: String(entity?.name ?? `${kind === "cargo" ? "Cargo" : "Item"} #${itemId}`),
        required,
        contributed: (contributions.get(`${kind}:${itemId}`) ?? 0n).toString(),
        stored: "0",
        tier: entity?.tier ?? null,
        rarity: entity?.rarity ?? null,
        iconAssetName: entity?.iconAssetName ?? null,
      };
    });

    return {
      ...project,
      recipeId,
      recipeName,
      name: String(building?.name ?? recipeName),
      buildingDescriptionId,
      buildingName: building?.name == null ? null : String(building.name),
      actionsRequired: decimalInteger(recipe.actionsRequired ?? 0, `construction recipe ${recipeId} actions`),
      catalogComplete,
      materials,
    };
  });

  return {
    data: {
      ...source,
      projects,
    },
    warnings,
  };
}
