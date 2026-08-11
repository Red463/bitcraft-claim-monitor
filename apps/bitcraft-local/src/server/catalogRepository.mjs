import {
  createGameCatalogRepository,
  gameCatalogKey,
} from "./gameCatalog.mjs";
import { CRAFT_PLAN_EFFORT_MODEL_VERSION } from "./craftPlanEffortProgress.mjs";
import {
  normalizeGameDataItemLists,
  normalizeGameDataResources,
} from "./itemProbability.mjs";

const SOURCE_KEY = "global";

function text(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`Provider catalog ${label} is required`);
  return normalized;
}

function catalogKind(value) {
  if (value === 1 || value === "1" || String(value ?? "").toLowerCase() === "cargo") return "cargo";
  if (value === 0 || value === "0" || ["item", "items"].includes(String(value ?? "").toLowerCase())) return "items";
  throw new Error(`Provider catalog kind is invalid: ${String(value ?? "")}`);
}

function normalizedEntity(source) {
  const kind = catalogKind(source?.kind ?? source?.itemType ?? source?.item_type);
  const id = text(source?.id ?? source?.targetId ?? source?.target_id, "entity id");
  if (!/^\d+$/.test(id)) throw new Error(`Provider catalog entity id must be a decimal string: ${id}`);
  const name = text(source?.name, `name for ${kind}:${id}`);
  const tierValue = source?.tier == null ? null : Number(source.tier);
  if (tierValue != null && (!Number.isSafeInteger(tierValue) || tierValue < 0)) {
    throw new Error(`Provider catalog tier is invalid for ${kind}:${id}`);
  }
  return {
    catalogKey: gameCatalogKey(kind, id),
    kind,
    id,
    itemType: kind === "cargo" ? 1 : 0,
    name,
    tag: source?.tag == null ? null : String(source.tag),
    tier: tierValue,
    rarity: source?.rarity == null ? null : String(source.rarity),
    iconAssetName: source?.iconAssetName == null ? null : String(source.iconAssetName),
    itemListId: source?.itemListId == null ? null : String(source.itemListId),
  };
}

function normalizedMetadata(metadata, currentGeneration) {
  const generation = Number(metadata?.generation);
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw new Error("Provider catalog generation must be a positive safe integer");
  }
  if (generation <= currentGeneration) {
    throw new Error(`Provider catalog generation ${generation} is not newer than ${currentGeneration}`);
  }
  const receivedAt = text(metadata?.receivedAt, "receivedAt");
  if (!Number.isFinite(Date.parse(receivedAt))) throw new Error("Provider catalog receivedAt is invalid");
  const provider = text(metadata?.provider, "provider");
  if (provider !== "relay") throw new Error(`Provider catalog provider is unsupported: ${provider}`);
  return {
    provider,
    database: text(metadata?.database, "database"),
    schemaFingerprint: text(metadata?.schemaFingerprint, "schema fingerprint"),
    generation,
    receivedAt,
  };
}

function mapSourceState(row) {
  return row ? {
    provider: row.provider,
    database: row.database_name,
    schemaFingerprint: row.schema_fingerprint,
    generation: Number(row.generation),
    receivedAt: row.received_at,
    rowCount: Number(row.row_count),
  } : null;
}

function normalizedDescriptions(descriptions) {
  if (!descriptions || typeof descriptions !== "object" || Array.isArray(descriptions)) {
    throw new Error("Provider catalog descriptions must be grouped by kind");
  }
  const normalized = [];
  const keys = new Set();
  for (const [kind, rows] of Object.entries(descriptions)) {
    if (!Array.isArray(rows)) throw new Error(`Provider catalog ${kind} descriptions must be an array`);
    for (const value of rows) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Provider catalog ${kind} description must be an object`);
      }
      const rowKind = text(value.kind, "description kind");
      if (rowKind !== kind) throw new Error(`Provider catalog description kind mismatch: ${rowKind} !== ${kind}`);
      const id = text(value.id, `${kind} description id`);
      if (!/^\d+$/.test(id)) throw new Error(`Provider catalog description id must be a decimal string: ${id}`);
      const key = `${kind}:${id}`;
      if (keys.has(key)) throw new Error(`Duplicate catalog description: ${key}`);
      keys.add(key);
      normalized.push({ kind, id, dataJson: JSON.stringify(value) });
    }
  }
  return normalized;
}

function positiveQuantity(value, label) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Provider catalog ${label} quantity must be positive`);
  }
  return quantity;
}

function normalizedRecipeStack(value, label) {
  const kind = catalogKind(value?.kind ?? value?.itemType ?? value?.item_type);
  const targetId = text(value?.id ?? value?.targetId ?? value?.target_id, `${label} id`);
  if (!/^\d+$/.test(targetId)) throw new Error(`Provider catalog ${label} id must be a decimal string`);
  return {
    kind,
    targetId,
    [`${label.includes("input") ? "input" : "output"}Key`]: gameCatalogKey(kind, targetId),
    quantity: positiveQuantity(value?.quantity, label),
  };
}

function coalescedRecipeOutputs(components) {
  const byKey = new Map();
  for (const component of components) {
    const current = byKey.get(component.outputKey) ?? {
      outputKey: component.outputKey,
      kind: component.kind,
      targetId: component.targetId,
      quantity: 0,
      guaranteedQuantity: 0,
      isPrimaryOutput: false,
    };
    current.quantity += component.quantity * component.occurrenceRate;
    if (component.occurrenceRate === 1) current.guaranteedQuantity += component.quantity;
    current.isPrimaryOutput ||= component.isPrimaryOutput;
    byKey.set(component.outputKey, current);
  }
  return [...byKey.values()].map((output) => ({
    ...output,
    occurrenceRate: 1,
    yieldBasis: "per_progress",
  }));
}

function providerRecipeProjection(descriptions) {
  const skills = new Map((descriptions.skill ?? []).map((row) => [String(row.id), row.name]));
  const buildingTypes = new Map(
    (descriptions.building_type ?? []).map((row) => [String(row.id), row.name]),
  );
  const resources = new Map((descriptions.resource ?? []).map((row) => [String(row.id), row.name]));
  const skillName = (row) => {
    const id = row?.levelRequirements?.[0]?.skillId;
    return id == null ? null : skills.get(String(id)) ?? `Skill #${String(id)}`;
  };
  const transportRoute = (name, stationName, inputs, outputs) => (
    [...inputs, ...outputs].some((entry) => entry.kind === "cargo")
    && /\b(pack|package|unpack|packed|transport|bundle|crate)\b/i.test(`${name ?? ""} ${stationName ?? ""}`)
  );
  const recipes = [];

  for (const row of descriptions.crafting_recipe ?? []) {
    const inputs = (row.inputs ?? []).map((stack, index) => (
      normalizedRecipeStack(stack, `crafting recipe ${row.id} input ${index}`)
    ));
    const rawOutputs = (row.outputs ?? []).map((stack, index) => (
      normalizedRecipeStack(stack, `crafting recipe ${row.id} output ${index}`)
    ));
    if (!rawOutputs.length) continue;
    const outputs = rawOutputs.map((output, index) => ({
      ...output,
      occurrenceRate: 1,
      yieldBasis: "per_craft",
      guaranteedQuantity: output.quantity,
      isPrimaryOutput: index === 0,
    }));
    const buildingType = row?.buildingRequirement?.buildingType == null
      ? null
      : String(row.buildingRequirement.buildingType);
    const tier = Number(row?.buildingRequirement?.tier ?? 0);
    const stationBase = buildingType == null
      ? null
      : buildingTypes.get(buildingType) ?? `Building type #${buildingType}`;
    const stationName = stationBase == null
      ? null
      : `${stationBase}${Number.isSafeInteger(tier) && tier > 0 ? ` (Tier ${tier})` : ""}`;
    const primary = outputs[0];
    recipes.push({
      recipeKey: `recipe:${row.id}`,
      sourceKind: primary.kind,
      sourceId: primary.targetId,
      actionCount: Number(row.actionsRequired ?? 0),
      activityKind: "craft",
      gatheringMode: "ordinary",
      resourceId: null,
      name: row.name || `Recipe #${row.id}`,
      stationName,
      skillName: skillName(row),
      isPassive: row.isPassive === true,
      isTransportRoute: transportRoute(row.name, stationName, inputs, outputs),
      inputs,
      outputs,
      outputComponents: outputs.map((output, componentIndex) => ({ ...output, componentIndex })),
      sourceCatalogKeys: [...new Set(outputs.map((output) => output.outputKey))],
    });
  }

  for (const row of descriptions.extraction_recipe ?? []) {
    const inputs = (row.inputs ?? []).map((stack, index) => (
      normalizedRecipeStack(stack, `extraction recipe ${row.id} input ${index}`)
    ));
    const components = (row.outputs ?? []).map((stack, componentIndex) => {
      const output = normalizedRecipeStack(stack, `extraction recipe ${row.id} output ${componentIndex}`);
      const probability = Number(stack.probability ?? 1);
      if (!Number.isFinite(probability) || probability < 0) {
        throw new Error(
          `Provider catalog extraction recipe ${row.id} output probability is invalid: ${String(stack.probability)}`,
        );
      }
      return {
        ...output,
        componentIndex,
        occurrenceRate: probability,
        yieldBasis: "per_progress",
        isPrimaryOutput: componentIndex === 0,
      };
    });
    if (!components.length) continue;
    const outputs = coalescedRecipeOutputs(components);
    const primary = components[0];
    const resourceId = row.resourceId == null ? null : String(row.resourceId);
    const cargoId = row.cargoId == null ? null : String(row.cargoId);
    recipes.push({
      recipeKey: `extraction:${row.id}`,
      sourceKind: primary.kind,
      sourceId: primary.targetId,
      actionCount: 0,
      activityKind: "gathering",
      gatheringMode: resourceId == null && cargoId != null ? "prospecting" : "ordinary",
      resourceId,
      name: row.name || (resourceId == null
        ? `Extraction #${row.id}`
        : `Extract ${resources.get(resourceId) ?? `Resource #${resourceId}`}`),
      stationName: null,
      skillName: skillName(row),
      isPassive: false,
      isTransportRoute: false,
      inputs,
      outputs,
      outputComponents: components,
      sourceCatalogKeys: [...new Set(outputs.map((output) => output.outputKey))],
    });
  }

  return recipes;
}

function hasLiveProjection(descriptions) {
  return ["crafting_recipe", "extraction_recipe", "item_list", "resource", "building_type"].every((kind) => (
    Object.prototype.hasOwnProperty.call(descriptions ?? {}, kind)
  ));
}

export function createProviderCatalogRepository(db) {
  const catalog = createGameCatalogRepository(db);
  const statements = {
    listKeys: db.prepare("SELECT catalog_key FROM game_catalog_entities"),
    deleteEntity: db.prepare("DELETE FROM game_catalog_entities WHERE catalog_key = ?"),
    getSourceState: db.prepare("SELECT * FROM game_catalog_source_state WHERE source_key = ?"),
    upsertSourceState: db.prepare(`
      INSERT INTO game_catalog_source_state (
        source_key, provider, database_name, schema_fingerprint, generation, received_at, row_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        provider = excluded.provider,
        database_name = excluded.database_name,
        schema_fingerprint = excluded.schema_fingerprint,
        generation = excluded.generation,
        received_at = excluded.received_at,
        row_count = excluded.row_count
    `),
    deleteDescriptions: db.prepare("DELETE FROM game_catalog_descriptions"),
    insertDescription: db.prepare(`
      INSERT INTO game_catalog_descriptions (
        description_kind, description_id, data_json, updated_at
      ) VALUES (?, ?, ?, ?)
    `),
    listDescriptions: db.prepare(`
      SELECT data_json FROM game_catalog_descriptions
      WHERE description_kind = ?
      ORDER BY CAST(description_id AS INTEGER), description_id
    `),
    getDescription: db.prepare(`
      SELECT data_json FROM game_catalog_descriptions
      WHERE description_kind = ? AND description_id = ?
    `),
    getToolDescriptionByItem: db.prepare(`
      SELECT data_json FROM game_catalog_descriptions
      WHERE description_kind = 'tool'
        AND json_extract(data_json, '$.itemId') = ?
      ORDER BY
        CAST(json_extract(data_json, '$.level') AS INTEGER) DESC,
        CAST(json_extract(data_json, '$.power') AS INTEGER) DESC,
        CAST(description_id AS INTEGER) ASC
      LIMIT 1
    `),
    upsertEffortModelVersion: db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `),
  };

  function replaceSnapshot(entities, descriptions, metadata) {
      if (!Array.isArray(entities) || entities.length === 0) {
        throw new Error("Provider catalog snapshot must contain at least one entity");
      }
      const normalized = entities.map(normalizedEntity);
      const normalizedDescriptionRows = descriptions == null ? null : normalizedDescriptions(descriptions);
      const liveProjection = normalizedDescriptionRows && hasLiveProjection(descriptions)
        ? {
          recipes: providerRecipeProjection(descriptions),
          itemLists: normalizeGameDataItemLists(descriptions.item_list),
          resources: normalizeGameDataResources(descriptions.resource),
        }
        : null;
      const keys = new Set();
      for (const entity of normalized) {
        if (keys.has(entity.catalogKey)) {
          throw new Error(`Duplicate catalog identity: ${entity.catalogKey}`);
        }
        keys.add(entity.catalogKey);
      }
      const current = mapSourceState(statements.getSourceState.get(SOURCE_KEY));
      const source = normalizedMetadata(metadata, current?.generation ?? 0);
      const staleKeys = statements.listKeys.all()
        .map((row) => row.catalog_key)
        .filter((catalogKey) => !keys.has(catalogKey));

      db.exec("BEGIN IMMEDIATE");
      try {
        for (const entity of normalized) {
          catalog.upsertEntityIdentity(entity, {
            kind: entity.kind,
            updatedAt: source.receivedAt,
          });
        }
        for (const catalogKey of staleKeys) statements.deleteEntity.run(catalogKey);
        catalog.deleteOrphanRecipes();
        if (normalizedDescriptionRows) {
          statements.deleteDescriptions.run();
          for (const description of normalizedDescriptionRows) {
            statements.insertDescription.run(
              description.kind,
              description.id,
              description.dataJson,
              source.receivedAt,
            );
          }
        }
        if (liveProjection) {
          catalog.replaceRecipeSnapshot(
            liveProjection.recipes,
            source.receivedAt,
            null,
            { manageTransaction: false },
          );
          const sourceUrl = `spacetimedb://${source.database}`;
          catalog.replaceProbabilitySnapshot({
            itemLists: liveProjection.itemLists,
            resources: liveProjection.resources,
            sourceUrl,
            sourceRevision: source.schemaFingerprint,
            sources: [{
              sourceKind: "relay_global",
              sourceUrl,
              sourceRevision: source.schemaFingerprint,
            }],
            updatedAt: source.receivedAt,
          }, null, { manageTransaction: false });
          catalog.replaceEffortWeights(
            catalog.listProbabilityEffortCandidates(),
            CRAFT_PLAN_EFFORT_MODEL_VERSION,
            source.receivedAt,
            () => statements.upsertEffortModelVersion.run(
              "game_catalog_effort_model_version",
              String(CRAFT_PLAN_EFFORT_MODEL_VERSION),
              source.receivedAt,
            ),
            { manageTransaction: false },
          );
        }
        const rowCount = normalized.length + (normalizedDescriptionRows?.length ?? 0);
        statements.upsertSourceState.run(
          SOURCE_KEY,
          source.provider,
          source.database,
          source.schemaFingerprint,
          source.generation,
          source.receivedAt,
          rowCount,
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return {
        generation: source.generation,
        rowCount: normalized.length + (normalizedDescriptionRows?.length ?? 0),
        removedCount: staleKeys.length,
      };
  }

  return {
    replaceEntitySnapshot(entities, metadata) {
      return replaceSnapshot(entities, null, metadata);
    },
    replaceCatalogSnapshot(snapshot, metadata) {
      return replaceSnapshot(snapshot?.entities, snapshot?.descriptions, metadata);
    },
    getEntity(catalogKey) {
      return catalog.getEntity(catalogKey);
    },
    searchEntities(query, limit = 20) {
      return catalog.searchEntities(query, limit);
    },
    findEntities(query) {
      return catalog.findEntities(query);
    },
    listEntities() {
      return catalog.listEntities();
    },
    getSourceState() {
      return mapSourceState(statements.getSourceState.get(SOURCE_KEY));
    },
    listDescriptions(kind) {
      return statements.listDescriptions.all(String(kind ?? ""))
        .map((row) => JSON.parse(String(row.data_json)));
    },
    getDescription(kind, id) {
      const normalizedKind = String(kind ?? "");
      const normalizedId = String(id ?? "");
      const row = normalizedKind === "tool"
        ? statements.getToolDescriptionByItem.get(normalizedId)
        : statements.getDescription.get(normalizedKind, normalizedId);
      return row ? JSON.parse(String(row.data_json)) : null;
    },
    getProbabilitySnapshot() {
      return catalog.getProbabilitySnapshot();
    },
  };
}
