type CatalogEntity = {
  targetId?: unknown;
  name?: unknown;
  tier?: unknown;
  [key: string]: unknown;
};

type CatalogDescription = {
  id?: unknown;
  name?: unknown;
  actionsRequired?: unknown;
  levelRequirements?: unknown[];
  experiencePerProgress?: unknown[];
  outputs?: Array<{
    kind?: unknown;
    id?: unknown;
    quantity?: unknown;
  }>;
  [key: string]: unknown;
};

type ProjectionDependencies = {
  getEntity(catalogKey: string): CatalogEntity | null;
  getDescription(kind: string, id: string): CatalogDescription | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError(`${label} must be a non-negative decimal integer`);
  }
  return normalized;
}

function outputKind(value: unknown): "item" | "cargo" {
  return String(value ?? "").trim().toLowerCase() === "cargo" ? "cargo" : "item";
}

export function enrichPublicCraftsWithCatalog(
  snapshot: unknown,
  dependencies: ProjectionDependencies,
) {
  const source = asRecord(snapshot);
  const rows = Array.isArray(source.craftResults) ? source.craftResults : [];
  const recipeCache = new Map<string, CatalogDescription | null>();
  const buildingCache = new Map<string, CatalogDescription | null>();
  const entityCache = new Map<string, CatalogEntity | null>();
  const warnings: string[] = [];

  const craftResults = rows.map((value, index) => {
    const craft = asRecord(value);
    const entityId = decimalInteger(craft.entityId, `public craft ${index} entity id`);
    const recipeId = decimalInteger(craft.recipeId, `public craft ${entityId} recipe id`);
    const craftCount = decimalInteger(
      craft.craftCount ?? 0,
      `public craft ${entityId} craft count`,
    );
    if (!recipeCache.has(recipeId)) {
      recipeCache.set(recipeId, dependencies.getDescription("crafting_recipe", recipeId));
    }
    const recipe = recipeCache.get(recipeId) ?? null;
    if (!recipe) {
      warnings.push(`Public craft ${entityId} references unavailable crafting recipe ${recipeId}.`);
    }
    const buildingDescriptionId = craft.buildingDescriptionId == null
      ? null
      : decimalInteger(
          craft.buildingDescriptionId,
          `public craft ${entityId} building description id`,
        );
    if (buildingDescriptionId && !buildingCache.has(buildingDescriptionId)) {
      buildingCache.set(
        buildingDescriptionId,
        dependencies.getDescription("building", buildingDescriptionId),
      );
    }
    const building = buildingDescriptionId
      ? buildingCache.get(buildingDescriptionId) ?? null
      : null;
    const nickname = String(craft.buildingNickname ?? "").trim();
    if (buildingDescriptionId && !building && !nickname) {
      warnings.push(
        `Public craft ${entityId} references unavailable building description ${buildingDescriptionId}.`,
      );
    }

    const craftedItem = (Array.isArray(recipe?.outputs) ? recipe.outputs : []).map(
      (output, outputIndex) => {
        const kind = outputKind(output.kind);
        const itemId = decimalInteger(
          output.id,
          `public craft ${entityId} output ${outputIndex} id`,
        );
        const quantity = decimalInteger(
          output.quantity ?? 0,
          `public craft ${entityId} output ${outputIndex} quantity`,
        );
        const catalogKey = `${kind === "cargo" ? "cargo" : "items"}:${itemId}`;
        if (!entityCache.has(catalogKey)) {
          entityCache.set(catalogKey, dependencies.getEntity(catalogKey));
        }
        return { itemId, itemType: kind, quantity };
      },
    );
    const firstOutput = craftedItem[0];
    const firstEntity = firstOutput
      ? entityCache.get(`${firstOutput.itemType === "cargo" ? "cargo" : "items"}:${firstOutput.itemId}`)
        ?? null
      : null;
    const actionsRequired = recipe
      ? decimalInteger(
          recipe.actionsRequired ?? 0,
          `public craft ${entityId} recipe actions`,
        )
      : null;
    return {
      ...craft,
      recipeName: recipe ? String(recipe.name ?? "") : null,
      buildingName: nickname
        || (building ? String(building.name ?? "") : "")
        || (buildingDescriptionId ? `Building #${buildingDescriptionId}` : "Unknown building"),
      totalActionsRequired: actionsRequired == null
        ? null
        : (BigInt(actionsRequired) * BigInt(craftCount)).toString(),
      craftedItem,
      levelRequirements: Array.isArray(recipe?.levelRequirements)
        ? recipe.levelRequirements
        : [],
      experiencePerProgress: Array.isArray(recipe?.experiencePerProgress)
        ? recipe.experiencePerProgress
        : [],
      outputName: String(firstEntity?.name ?? recipe?.name ?? `Recipe #${recipeId}`),
      tier: firstEntity?.tier ?? null,
    };
  });

  return {
    data: {
      ...source,
      craftResults,
    },
    warnings,
  };
}
