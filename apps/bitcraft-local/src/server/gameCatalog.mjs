import { createHash } from "node:crypto";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapArray(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!isObject(value) || depth > 3) return [];
  for (const key of ["data", "results", "items", "recipes", "possibilities"]) {
    const nested = unwrapArray(value[key], depth + 1);
    if (nested.length) return nested;
  }
  return [];
}

function unwrapDetail(payload) {
  let current = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isObject(current)) break;
    if (isObject(current.detail)) {
      current = current.detail;
      continue;
    }
    if (isObject(current.data) && (
      current.data.item
      || current.data.cargo
      || current.data.craftingRecipes
      || current.data.extractionRecipes
      || current.data.recipesUsingItem
      || current.data.itemListPossibilities
    )) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

export function gameCatalogKindFromItemType(value) {
  return value === 1 || value === "1" || String(value ?? "").toLowerCase() === "cargo" ? "cargo" : "items";
}

export function gameCatalogKey(kind, id) {
  const normalizedKind = gameCatalogKindFromItemType(kind);
  return `${normalizedKind}:${String(id ?? "").trim()}`;
}

function entityFromSource(source, fallback = {}, kindHint = null) {
  const kind = source?.itemType == null && source?.item_type == null && source?.kind == null
    ? gameCatalogKindFromItemType(kindHint ?? fallback.kind ?? fallback.itemType ?? fallback.item_type)
    : gameCatalogKindFromItemType(source.itemType ?? source.item_type ?? source.kind);
  return {
    catalogKey: gameCatalogKey(kind, source.id ?? source.itemId ?? source.targetId ?? fallback.id ?? ""),
    kind,
    targetId: String(source.id ?? source.itemId ?? source.targetId ?? fallback.id ?? "").trim(),
    itemType: kind === "cargo" ? 1 : 0,
    name: String(source.name ?? source.itemName ?? fallback.name ?? `Unknown ${kind === "cargo" ? "cargo" : "item"}`).trim() || `Unknown ${kind === "cargo" ? "cargo" : "item"}`,
    tag: source.tag ?? source.itemTag ?? fallback.tag ?? null,
    tier: normalizeInteger(source.tier ?? fallback.tier),
    rarity: source.rarityStr ?? source.rarity ?? fallback.rarity ?? null,
    iconAssetName: source.iconAssetName ?? fallback.iconAssetName ?? null,
  };
}

function targetFromStack(stack, display = {}) {
  const kind = stack?.isCargo === true
    ? "cargo"
    : gameCatalogKindFromItemType(stack?.item_type ?? stack?.itemType ?? stack?.kind ?? display?.itemType ?? display?.item_type ?? display?.kind);
  const targetId = String(stack?.item_id ?? stack?.itemId ?? stack?.targetId ?? stack?.id ?? display?.id ?? display?.itemId ?? "").trim();
  if (!targetId) return null;
  return {
    key: gameCatalogKey(kind, targetId),
    kind,
    targetId,
    quantity: Math.max(0, toNumber(stack?.quantity ?? display?.quantity, 0)),
    name: display?.name ?? stack?.name ?? null,
    tag: display?.tag ?? stack?.tag ?? null,
    tier: normalizeInteger(display?.tier ?? stack?.tier),
    rarity: display?.rarityStr ?? display?.rarity ?? stack?.rarityStr ?? stack?.rarity ?? null,
    iconAssetName: display?.iconAssetName ?? stack?.iconAssetName ?? null,
  };
}

function recipeStationName(recipe) {
  const value = recipe?.stationName
    ?? recipe?.buildingName
    ?? recipe?.station_name
    ?? recipe?.building_name
    ?? recipe?.station?.name
    ?? recipe?.building?.name
    ?? null;
  return value == null ? null : String(value).trim() || null;
}

function recipeSkillName(recipe) {
  const value = recipe?.skillName
    ?? recipe?.skill_name
    ?? recipe?.skill?.name
    ?? recipe?.levelRequirements?.[0]?.skill?.name
    ?? null;
  return value == null ? null : String(value).trim() || null;
}

function displayLooksTransport(value) {
  return /\b(pack|package|unpack|packed|transport|bundle|crate)\b/i.test(String(value ?? ""));
}

function recipeLooksTransportRoute(recipe, outputs = [], inputs = []) {
  if (displayLooksTransport(recipe?.name)) return true;
  if (displayLooksTransport(recipeStationName(recipe))) return true;
  for (const display of [...unwrapArray(recipe?.craftedItems), ...unwrapArray(recipe?.consumedItems)]) {
    if (displayLooksTransport(display?.name) || displayLooksTransport(display?.tag) || displayLooksTransport(display?.itemTag)) return true;
  }
  return [...outputs, ...inputs].some((entry) => displayLooksTransport(entry.name) || displayLooksTransport(entry.tag));
}

function recipeStableKey(sourceEntity, recipe, outputs, inputs) {
  const rawId = String(recipe?.id ?? recipe?.recipeId ?? recipe?.recipe_id ?? "").trim();
  if (rawId) return `${sourceEntity.catalogKey}:recipe:${rawId}`;
  const signature = JSON.stringify({
    name: String(recipe?.name ?? recipe?.recipeName ?? ""),
    station: recipeStationName(recipe),
    outputs: outputs.map((output) => [output.key, output.quantity]),
    inputs: inputs.map((input) => [input.key, input.quantity]),
  });
  return `${sourceEntity.catalogKey}:recipe:${createHash("sha1").update(signature).digest("hex").slice(0, 12)}`;
}

function normalizeRecipe(recipe, sourceEntity) {
  const outputDisplays = unwrapArray(recipe?.craftedItems);
  const inputDisplays = unwrapArray(recipe?.consumedItems);
  const declaredPrimary = targetFromStack(recipe?.craftedItem ?? recipe?.outputItem ?? recipe?.targetItem ?? recipe?.target ?? {}, recipe?.craftedItem ?? recipe?.targetItem ?? {});
  const outputs = unwrapArray(recipe?.craftedItemStacks)
    .map((stack, index) => targetFromStack(stack, outputDisplays[index] ?? recipe?.craftedItem ?? {}))
    .filter((entry) => entry && entry.quantity > 0);
  if (!outputs.length && declaredPrimary) {
    const declaredQuantity = Math.max(
      1,
      toNumber(
        recipe?.outputQuantity
        ?? recipe?.quantity
        ?? recipe?.craftedQuantity
        ?? recipe?.craftedItem?.quantity
        ?? recipe?.outputItem?.quantity
        ?? declaredPrimary.quantity
        ?? 1,
        1,
      ) || 1,
    );
    outputs.push({ ...declaredPrimary, quantity: declaredQuantity });
  }
  const inputs = unwrapArray(recipe?.consumedItemStacks)
    .map((stack, index) => targetFromStack(stack, inputDisplays[index] ?? {}))
    .filter((entry) => entry && entry.quantity > 0);

  if (!outputs.length && !inputs.length) return null;

  const sourceOutputKey = sourceEntity.catalogKey;
  const singleOutputKey = outputs.length === 1 ? outputs[0].key : null;
  const primaryOutputKey = declaredPrimary?.key ?? (outputs.some((output) => output.key === sourceOutputKey) ? sourceOutputKey : singleOutputKey);
  const normalizedOutputs = outputs.map((output) => ({
    outputKey: output.key,
    kind: output.kind,
    targetId: output.targetId,
    quantity: output.quantity,
    isPrimaryOutput: output.key === primaryOutputKey,
  }));
  const primaryOutput = outputs.find((output) => output.key === primaryOutputKey) ?? null;

  return {
    recipeKey: recipeStableKey(sourceEntity, recipe, outputs, inputs),
    sourceKind: primaryOutput?.kind ?? sourceEntity.kind,
    sourceId: primaryOutput?.targetId ?? sourceEntity.targetId,
    name: String(recipe?.name ?? recipe?.recipeName ?? "Recipe").trim() || "Recipe",
    stationName: recipeStationName(recipe),
    skillName: recipeSkillName(recipe),
    isPassive: recipe?.isPassive === true,
    isTransportRoute: recipeLooksTransportRoute(recipe, outputs, inputs),
    inputs: inputs.map((input) => ({
      inputKey: input.key,
      kind: input.kind,
      targetId: input.targetId,
      quantity: input.quantity,
    })),
    outputs: normalizedOutputs,
  };
}

function normalizeItemListOutput(possibility, producerEntity) {
  const target = targetFromStack({
    item_id: possibility?.targetId ?? possibility?.itemId ?? possibility?.id ?? possibility?.targetItem?.id,
    item_type: possibility?.isCargo === true ? 1 : possibility?.itemType ?? possibility?.item_type ?? possibility?.targetItem?.itemType,
    quantity: possibility?.quantity,
  }, possibility?.targetItem ?? possibility);
  if (!target || target.quantity <= 0) return null;
  return {
    producerKey: producerEntity.catalogKey,
    outputKey: target.key,
    kind: target.kind,
    targetId: target.targetId,
    quantity: target.quantity,
    chance: toNumber(possibility?.chance, 1),
  };
}

export function normalizeGameCatalogDetail(payload, fallback = {}) {
  const detail = unwrapDetail(payload);
  const source = detail?.item ?? detail?.cargo ?? detail;
  const kindHint = detail?.cargo ? "cargo" : detail?.item ? "items" : null;
  const entity = entityFromSource(source, fallback, kindHint);

  const recipes = [
    ...unwrapArray(detail?.craftingRecipes),
    ...unwrapArray(detail?.extractionRecipes),
    ...unwrapArray(detail?.recipesUsingItem),
  ].map((recipe) => normalizeRecipe(recipe, entity)).filter(Boolean);

  const itemListOutputs = unwrapArray(detail?.itemListPossibilities)
    .map((possibility) => normalizeItemListOutput(possibility, entity))
    .filter(Boolean);

  return { entity, recipes, itemListOutputs };
}

function mapEntityRow(row) {
  return row ? {
    catalogKey: row.catalog_key,
    kind: row.kind,
    targetId: row.target_id,
    itemType: toNumber(row.item_type),
    name: row.name ?? null,
    tag: row.tag ?? null,
    tier: row.tier == null ? null : toNumber(row.tier),
    rarity: row.rarity ?? null,
    iconAssetName: row.icon_asset_name ?? null,
    updatedAt: row.updated_at,
  } : null;
}

function mapRecipeRow(row, inputs, outputs) {
  return {
    recipeKey: row.recipe_key,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    name: row.name ?? null,
    stationName: row.station_name ?? null,
    skillName: row.skill_name ?? null,
    isPassive: Boolean(row.is_passive),
    isTransportRoute: Boolean(row.is_transport_route),
    updatedAt: row.updated_at,
    inputs,
    outputs,
  };
}

export function createGameCatalogRepository(db) {
  const statements = {
    upsertEntity: db.prepare(`
      INSERT INTO game_catalog_entities (
        catalog_key, kind, target_id, item_type, name, tag, tier, rarity, icon_asset_name, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(catalog_key) DO UPDATE SET
        kind = excluded.kind,
        target_id = excluded.target_id,
        item_type = excluded.item_type,
        name = excluded.name,
        tag = excluded.tag,
        tier = excluded.tier,
        rarity = excluded.rarity,
        icon_asset_name = excluded.icon_asset_name,
        updated_at = excluded.updated_at
    `),
    getEntity: db.prepare("SELECT * FROM game_catalog_entities WHERE catalog_key = ?"),
    listRecipeKeysByPrefix: db.prepare("SELECT recipe_key FROM game_catalog_recipes WHERE recipe_key LIKE ? ESCAPE '\\'"),
    deleteRecipeInputs: db.prepare("DELETE FROM game_catalog_recipe_inputs WHERE recipe_key = ?"),
    deleteRecipeOutputs: db.prepare("DELETE FROM game_catalog_recipe_outputs WHERE recipe_key = ?"),
    deleteRecipe: db.prepare("DELETE FROM game_catalog_recipes WHERE recipe_key = ?"),
    deleteItemListOutputs: db.prepare("DELETE FROM game_catalog_item_list_outputs WHERE producer_key = ?"),
    insertRecipe: db.prepare(`
      INSERT INTO game_catalog_recipes (
        recipe_key, source_kind, source_id, name, station_name, skill_name, is_passive, is_transport_route, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(recipe_key) DO UPDATE SET
        source_kind = excluded.source_kind,
        source_id = excluded.source_id,
        name = excluded.name,
        station_name = excluded.station_name,
        skill_name = excluded.skill_name,
        is_passive = excluded.is_passive,
        is_transport_route = excluded.is_transport_route,
        updated_at = excluded.updated_at
    `),
    insertRecipeInput: db.prepare(`
      INSERT INTO game_catalog_recipe_inputs (recipe_key, input_key, kind, target_id, quantity)
      VALUES (?, ?, ?, ?, ?)
    `),
    insertRecipeOutput: db.prepare(`
      INSERT INTO game_catalog_recipe_outputs (recipe_key, output_key, kind, target_id, quantity, is_primary_output)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    insertItemListOutput: db.prepare(`
      INSERT INTO game_catalog_item_list_outputs (producer_key, output_key, kind, target_id, quantity, chance)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    listProducerRecipesForOutput: db.prepare(`
      SELECT DISTINCT recipes.*
      FROM game_catalog_recipes AS recipes
      JOIN game_catalog_recipe_outputs AS outputs ON outputs.recipe_key = recipes.recipe_key
      WHERE outputs.output_key = ?
      ORDER BY recipes.name COLLATE NOCASE ASC, recipes.recipe_key ASC
    `),
    listRecipesConsumingInput: db.prepare(`
      SELECT DISTINCT recipes.*
      FROM game_catalog_recipes AS recipes
      JOIN game_catalog_recipe_inputs AS inputs ON inputs.recipe_key = recipes.recipe_key
      WHERE inputs.input_key = ?
      ORDER BY recipes.name COLLATE NOCASE ASC, recipes.recipe_key ASC
    `),
    listRecipeInputs: db.prepare(`
      SELECT input_key, kind, target_id, quantity
      FROM game_catalog_recipe_inputs
      WHERE recipe_key = ?
      ORDER BY rowid ASC
    `),
    listRecipeOutputs: db.prepare(`
      SELECT output_key, kind, target_id, quantity, is_primary_output
      FROM game_catalog_recipe_outputs
      WHERE recipe_key = ?
      ORDER BY is_primary_output DESC, rowid ASC
    `),
    listByproductProducersForOutput: db.prepare(`
      SELECT
        outputs.producer_key,
        outputs.output_key,
        outputs.kind AS output_kind,
        outputs.target_id AS output_target_id,
        outputs.quantity AS output_quantity,
        outputs.chance AS output_chance,
        entities.catalog_key,
        entities.kind,
        entities.target_id,
        entities.item_type,
        entities.name,
        entities.tag,
        entities.tier,
        entities.rarity,
        entities.icon_asset_name,
        entities.updated_at
      FROM game_catalog_item_list_outputs AS outputs
      JOIN game_catalog_entities AS entities ON entities.catalog_key = outputs.producer_key
      WHERE outputs.output_key = ?
      ORDER BY entities.name COLLATE NOCASE ASC, outputs.producer_key ASC
    `),
  };

  function recipeWithLinks(row) {
    return mapRecipeRow(
      row,
      statements.listRecipeInputs.all(row.recipe_key).map((input) => ({
        inputKey: input.input_key,
        kind: input.kind,
        targetId: input.target_id,
        quantity: toNumber(input.quantity),
      })),
      statements.listRecipeOutputs.all(row.recipe_key).map((output) => ({
        outputKey: output.output_key,
        kind: output.kind,
        targetId: output.target_id,
        quantity: toNumber(output.quantity),
        isPrimaryOutput: Boolean(output.is_primary_output),
      })),
    );
  }

  return {
    upsertDetail(payload, { updatedAt = new Date().toISOString(), fallback = {} } = {}) {
      const normalized = normalizeGameCatalogDetail(payload, fallback);
      statements.upsertEntity.run(
        normalized.entity.catalogKey,
        normalized.entity.kind,
        normalized.entity.targetId,
        normalized.entity.itemType,
        normalized.entity.name,
        normalized.entity.tag,
        normalized.entity.tier,
        normalized.entity.rarity,
        normalized.entity.iconAssetName,
        updatedAt,
      );

      for (const row of statements.listRecipeKeysByPrefix.all(`${normalized.entity.catalogKey}:recipe:%`)) {
        statements.deleteRecipeInputs.run(row.recipe_key);
        statements.deleteRecipeOutputs.run(row.recipe_key);
        statements.deleteRecipe.run(row.recipe_key);
      }
      statements.deleteItemListOutputs.run(normalized.entity.catalogKey);

      for (const recipe of normalized.recipes) {
        statements.insertRecipe.run(
          recipe.recipeKey,
          recipe.sourceKind,
          recipe.sourceId,
          recipe.name,
          recipe.stationName,
          recipe.skillName,
          recipe.isPassive ? 1 : 0,
          recipe.isTransportRoute ? 1 : 0,
          updatedAt,
        );
        for (const input of recipe.inputs) {
          statements.insertRecipeInput.run(recipe.recipeKey, input.inputKey, input.kind, input.targetId, input.quantity);
        }
        for (const output of recipe.outputs) {
          statements.insertRecipeOutput.run(recipe.recipeKey, output.outputKey, output.kind, output.targetId, output.quantity, output.isPrimaryOutput ? 1 : 0);
        }
      }

      for (const output of normalized.itemListOutputs) {
        statements.insertItemListOutput.run(output.producerKey, output.outputKey, output.kind, output.targetId, output.quantity, output.chance);
      }

      return {
        ...normalized,
        entity: { ...normalized.entity, updatedAt },
        recipes: normalized.recipes.map((recipe) => ({ ...recipe, updatedAt })),
      };
    },
    getEntity(catalogKey) {
      return mapEntityRow(statements.getEntity.get(catalogKey));
    },
    listProducerRecipesForOutput(outputKey) {
      return statements.listProducerRecipesForOutput.all(outputKey).map((row) => recipeWithLinks(row));
    },
    listRecipesConsumingInput(inputKey) {
      return statements.listRecipesConsumingInput.all(inputKey).map((row) => recipeWithLinks(row));
    },
    listByproductProducersForOutput(outputKey) {
      return statements.listByproductProducersForOutput.all(outputKey).map((row) => ({
        producerKey: row.producer_key,
        outputKey: row.output_key,
        kind: row.output_kind,
        targetId: row.output_target_id,
        quantity: toNumber(row.output_quantity),
        chance: toNumber(row.output_chance, 1),
        producer: mapEntityRow(row),
      }));
    },
  };
}


