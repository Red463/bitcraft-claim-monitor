import { createHash } from "node:crypto";

import { selectLowestEffortWeights } from "./craftPlanEffortProgress.mjs";

export const GAME_CATALOG_NORMALIZATION_VERSION = 6;

export function catalogNormalizationNeedsRefresh(storedVersion) {
  return Number(storedVersion) !== GAME_CATALOG_NORMALIZATION_VERSION;
}

export function catalogRefreshShouldResume(previousRun, storedVersion) {
  return Boolean(previousRun && previousRun.status !== "completed" && !catalogNormalizationNeedsRefresh(storedVersion));
}

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

function recipeActionCount(recipe) {
  return Math.max(0, toNumber(
    recipe?.actionsRequired
    ?? recipe?.actions_required
    ?? recipe?.actionCount
    ?? recipe?.action_count,
    0,
  ));
}

function displayLooksTransport(value) {
  return /\b(pack|package|unpack|packed|transport|bundle|crate)\b/i.test(String(value ?? ""));
}

function recipeHasCargoLink(inputs = [], outputs = []) {
  return [...inputs, ...outputs].some((entry) => entry?.kind === "cargo");
}

function recipeLooksTransportRoute(recipe, outputs = [], inputs = []) {
  if (!recipeHasCargoLink(inputs, outputs)) return false;
  if (displayLooksTransport(recipe?.name)) return true;
  if (displayLooksTransport(recipeStationName(recipe))) return true;
  const cargoEntries = [...outputs, ...inputs].filter((entry) => entry.kind === "cargo");
  return cargoEntries.some((entry) => displayLooksTransport(entry.name) || displayLooksTransport(entry.tag));
}

function normalizedRecipeName(recipe, sourceEntity, primaryOutput, outputs, inputs) {
  const rawName = String(recipe?.name ?? recipe?.recipeName ?? "Recipe").trim() || "Recipe";
  if (recipeHasCargoLink(inputs, outputs)) return rawName;
  if (!displayLooksTransport(rawName)) return rawName;
  if (primaryOutput?.key !== sourceEntity.catalogKey) return rawName;
  return `Craft ${sourceEntity.name}`;
}

function recipeStableKey(_sourceEntity, recipe, outputs, inputs) {
  const rawId = String(recipe?.id ?? recipe?.recipeId ?? recipe?.recipe_id ?? "").trim();
  if (rawId) return `recipe:${rawId}`;
  const signature = JSON.stringify({
    name: String(recipe?.name ?? recipe?.recipeName ?? ""),
    station: recipeStationName(recipe),
    outputs: outputs.map((output) => [output.key, output.quantity]).sort(),
    inputs: inputs.map((input) => [input.key, input.quantity]).sort(),
  });
  return `recipe-hash:${createHash("sha1").update(signature).digest("hex").slice(0, 16)}`;
}

function normalizeRecipe(recipe, sourceEntity, requestedActivityKind = "craft") {
  const stationName = recipeStationName(recipe);
  const activityKind = stationName ? "craft" : requestedActivityKind === "gathering" ? "gathering" : "craft";
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
    actionCount: recipeActionCount(recipe),
    activityKind,
    name: normalizedRecipeName(recipe, sourceEntity, primaryOutput, outputs, inputs),
    stationName,
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
  const explicitGuarantee = possibility?.guaranteedQuantity ?? possibility?.guaranteed_quantity;
  return {
    producerKey: producerEntity.catalogKey,
    outputKey: target.key,
    kind: target.kind,
    targetId: target.targetId,
    quantity: target.quantity,
    chance: toNumber(possibility?.chance, 1),
    guaranteedQuantity: explicitGuarantee == null ? null : Math.max(0, toNumber(explicitGuarantee)),
  };
}

function normalizedProbability(value) {
  const raw = Math.max(0, toNumber(value, 1));
  return Math.min(1, raw > 1 ? raw / 100 : raw);
}

function coalesceItemListOutputs(outputs) {
  const byPair = new Map();
  for (const output of outputs) {
    const key = `${output.producerKey}\u0000${output.outputKey}`;
    const quantity = Math.max(0, toNumber(output.quantity));
    const chance = normalizedProbability(output.chance);
    const existing = byPair.get(key) ?? {
      ...output,
      quantity: 0,
      chance: 1,
      explicitGuaranteedQuantity: 0,
      hasExplicitGuarantee: true,
      minimumQuantity: Number.POSITIVE_INFINITY,
      totalChance: 0,
    };
    existing.quantity += quantity * chance;
    existing.hasExplicitGuarantee = existing.hasExplicitGuarantee && output.guaranteedQuantity != null;
    existing.explicitGuaranteedQuantity += Math.max(0, toNumber(output.guaranteedQuantity));
    existing.minimumQuantity = Math.min(existing.minimumQuantity, quantity);
    existing.totalChance += chance;
    byPair.set(key, existing);
  }
  return [...byPair.values()].map(({ explicitGuaranteedQuantity, hasExplicitGuarantee, minimumQuantity, totalChance, ...output }) => ({
    ...output,
    quantity: Number(output.quantity.toFixed(12)),
    guaranteedQuantity: hasExplicitGuarantee
      ? explicitGuaranteedQuantity
      : totalChance >= 1 - 1e-9 && Number.isFinite(minimumQuantity) ? minimumQuantity : 0,
  }));
}

export function normalizeGameCatalogDetail(payload, fallback = {}) {
  const detail = unwrapDetail(payload);
  const source = detail?.item ?? detail?.cargo ?? detail;
  const kindHint = detail?.cargo ? "cargo" : detail?.item ? "items" : null;
  const entity = entityFromSource(source, fallback, kindHint);

  const recipeCandidates = [
    ...unwrapArray(detail?.craftingRecipes).map((recipe) => ({ recipe, activityKind: "craft", priority: 2 })),
    ...unwrapArray(detail?.extractionRecipes).map((recipe) => ({ recipe, activityKind: "gathering", priority: 2 })),
    ...unwrapArray(detail?.recipesUsingItem).map((recipe) => ({ recipe, activityKind: "craft", priority: 1 })),
  ];
  const recipesByKey = new Map();
  for (const candidate of recipeCandidates) {
    const normalized = normalizeRecipe(candidate.recipe, entity, candidate.activityKind);
    if (!normalized) continue;
    const existing = recipesByKey.get(normalized.recipeKey);
    if (!existing || candidate.priority > existing.priority) {
      recipesByKey.set(normalized.recipeKey, { ...normalized, priority: candidate.priority });
    }
  }
  const recipes = [...recipesByKey.values()].map(({ priority: _priority, ...recipe }) => recipe);

  const itemListOutputs = unwrapArray(detail?.itemListPossibilities)
    .map((possibility) => normalizeItemListOutput(possibility, entity))
    .filter(Boolean);

  return { entity, recipes, itemListOutputs: coalesceItemListOutputs(itemListOutputs) };
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
    actionCount: toNumber(row.action_count),
    activityKind: row.activity_kind === "gathering" ? "gathering" : "craft",
    name: row.name ?? null,
    stationName: row.station_name ?? null,
    skillName: row.skill_name ?? null,
    isPassive: Boolean(row.is_passive),
    isTransportRoute: Boolean(row.is_transport_route) && recipeHasCargoLink(inputs, outputs),
    updatedAt: row.updated_at,
    inputs,
    outputs,
  };
}

function mapRefreshRunRow(row) {
  return row ? {
    id: toNumber(row.id),
    status: row.status,
    phase: row.phase ?? null,
    cursorKind: row.cursor_kind ?? null,
    cursorId: row.cursor_id ?? null,
    processedCount: toNumber(row.processed_count),
    totalCount: toNumber(row.total_count),
    itemCount: toNumber(row.item_count),
    cargoCount: toNumber(row.cargo_count),
    recipeCount: toNumber(row.recipe_count),
    byproductCount: toNumber(row.byproduct_count),
    failureCount: toNumber(row.failure_count),
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    lastError: row.last_error ?? null,
    updatedAt: row.updated_at,
  } : null;
}

function mapRefreshTargetRow(row) {
  if (!row) return null;
  return {
    runId: toNumber(row.run_id),
    sequence: toNumber(row.sequence),
    catalogKey: row.catalog_key,
    kind: row.kind,
    id: row.target_id,
    itemType: toNumber(row.item_type),
    name: row.name,
    tag: row.tag,
    tier: normalizeInteger(row.tier),
    rarityStr: row.rarity,
    iconAssetName: row.icon_asset_name,
    state: row.state,
    attemptCount: toNumber(row.attempt_count),
    lastError: row.last_error,
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
    listRecipeKeysBySource: db.prepare("SELECT recipe_key FROM game_catalog_recipe_sources WHERE catalog_key = ?"),
    deleteRecipeSourcesForEntity: db.prepare("DELETE FROM game_catalog_recipe_sources WHERE catalog_key = ?"),
    insertRecipeSource: db.prepare("INSERT OR IGNORE INTO game_catalog_recipe_sources (catalog_key, recipe_key) VALUES (?, ?)"),
    countRecipeSources: db.prepare("SELECT COUNT(*) AS count FROM game_catalog_recipe_sources WHERE recipe_key = ?"),
    deleteRecipeInputs: db.prepare("DELETE FROM game_catalog_recipe_inputs WHERE recipe_key = ?"),
    deleteRecipeOutputs: db.prepare("DELETE FROM game_catalog_recipe_outputs WHERE recipe_key = ?"),
    deleteRecipe: db.prepare("DELETE FROM game_catalog_recipes WHERE recipe_key = ?"),
    deleteOrphanRecipes: db.prepare("DELETE FROM game_catalog_recipes WHERE NOT EXISTS (SELECT 1 FROM game_catalog_recipe_sources AS sources WHERE sources.recipe_key = game_catalog_recipes.recipe_key)"),
    deleteItemListOutputs: db.prepare("DELETE FROM game_catalog_item_list_outputs WHERE producer_key = ?"),
    insertRecipe: db.prepare(`
      INSERT INTO game_catalog_recipes (
        recipe_key, source_kind, source_id, action_count, activity_kind, name, station_name, skill_name, is_passive, is_transport_route, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(recipe_key) DO UPDATE SET
        source_kind = excluded.source_kind,
        source_id = excluded.source_id,
        action_count = excluded.action_count,
        activity_kind = excluded.activity_kind,
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
      INSERT INTO game_catalog_item_list_outputs (producer_key, output_key, kind, target_id, quantity, chance, guaranteed_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
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
        outputs.guaranteed_quantity AS output_guaranteed_quantity,
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
    listDirectCraftingEffortCandidates: db.prepare(`
      SELECT
        outputs.output_key AS catalog_key,
        recipes.recipe_key AS source_key,
        recipes.action_count AS actions_required,
        outputs.quantity AS output_quantity
      FROM game_catalog_recipes AS recipes
      JOIN game_catalog_recipe_outputs AS outputs ON outputs.recipe_key = recipes.recipe_key
      WHERE recipes.is_transport_route = 0
        AND recipes.action_count > 0
        AND outputs.quantity > 0
    `),
    listByproductCraftingEffortCandidates: db.prepare(`
      SELECT
        outputs.output_key AS catalog_key,
        recipes.recipe_key || ':item-list' AS source_key,
        recipes.action_count AS actions_required,
        outputs.quantity AS output_quantity
      FROM game_catalog_item_list_outputs AS outputs
      JOIN game_catalog_recipes AS recipes
        ON recipes.source_kind || ':' || recipes.source_id = outputs.producer_key
      WHERE recipes.is_transport_route = 0
        AND recipes.action_count > 0
        AND outputs.quantity > 0
    `),
    deleteEffortWeights: db.prepare("DELETE FROM game_catalog_effort_weights"),
    insertEffortWeight: db.prepare(`
      INSERT INTO game_catalog_effort_weights (
        catalog_key, model_version, effort_weight, method, source_key, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `),
    listEffortWeights: db.prepare(`
      SELECT catalog_key, model_version, effort_weight, method, source_key, updated_at
      FROM game_catalog_effort_weights
      WHERE model_version = ?
      ORDER BY catalog_key ASC
    `),
    getEffortWeightRevision: db.prepare(`
      SELECT MAX(updated_at) AS updated_at
      FROM game_catalog_effort_weights
      WHERE model_version = ?
    `),
    insertRefreshRun: db.prepare(`
      INSERT INTO game_catalog_refresh_runs (
        status, phase, cursor_kind, cursor_id, processed_count, total_count, item_count, cargo_count,
        recipe_count, byproduct_count, failure_count, started_at, completed_at, last_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getRefreshRun: db.prepare("SELECT * FROM game_catalog_refresh_runs WHERE id = ?"),
    getLatestRefreshRun: db.prepare("SELECT * FROM game_catalog_refresh_runs ORDER BY updated_at DESC, id DESC LIMIT 1"),
    listRefreshRuns: db.prepare("SELECT * FROM game_catalog_refresh_runs ORDER BY updated_at DESC, id DESC LIMIT ?"),
    saveRefreshRun: db.prepare(`
      UPDATE game_catalog_refresh_runs
      SET status = ?, phase = ?, cursor_kind = ?, cursor_id = ?, processed_count = ?, total_count = ?,
          item_count = ?, cargo_count = ?, recipe_count = ?, byproduct_count = ?, failure_count = ?,
          started_at = ?, completed_at = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteRefreshTargets: db.prepare("DELETE FROM game_catalog_refresh_targets WHERE run_id = ?"),
    insertRefreshTarget: db.prepare(`
      INSERT INTO game_catalog_refresh_targets (
        run_id, sequence, catalog_key, kind, target_id, item_type, name, tag, tier, rarity,
        icon_asset_name, state, attempt_count, last_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, ?)
    `),
    countRefreshTargets: db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN state = 'processed' THEN 1 ELSE 0 END) AS processed,
        SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM game_catalog_refresh_targets
      WHERE run_id = ?
    `),
    listPendingRefreshTargets: db.prepare(`
      SELECT * FROM game_catalog_refresh_targets
      WHERE run_id = ? AND state = 'pending'
      ORDER BY sequence ASC
      LIMIT ?
    `),
    listRetryableRefreshTargets: db.prepare(`
      SELECT * FROM game_catalog_refresh_targets
      WHERE run_id = ? AND state = 'failed' AND attempt_count < ?
      ORDER BY sequence ASC
      LIMIT ?
    `),
    markRefreshTargetProcessed: db.prepare(`
      UPDATE game_catalog_refresh_targets
      SET state = 'processed', attempt_count = attempt_count + 1, last_error = NULL, updated_at = ?
      WHERE run_id = ? AND catalog_key = ?
    `),
    markRefreshTargetFailed: db.prepare(`
      UPDATE game_catalog_refresh_targets
      SET state = 'failed', attempt_count = attempt_count + 1, last_error = ?, updated_at = ?
      WHERE run_id = ? AND catalog_key = ?
    `),
    markRefreshTargetUnavailable: db.prepare(`
      UPDATE game_catalog_refresh_targets
      SET state = 'failed', attempt_count = ?, last_error = ?, updated_at = ?
      WHERE run_id = ? AND catalog_key = ?
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
    upsertEntityIdentity(source, { updatedAt = new Date().toISOString(), kind = null } = {}) {
      const entity = entityFromSource(source, {}, kind);
      statements.upsertEntity.run(
        entity.catalogKey,
        entity.kind,
        entity.targetId,
        entity.itemType,
        entity.name,
        entity.tag,
        entity.tier,
        entity.rarity,
        entity.iconAssetName,
        updatedAt,
      );
      return { ...entity, updatedAt };
    },
    beginRefreshRun({
      status = "running",
      phase = null,
      cursorKind = null,
      cursorId = null,
      processedCount = 0,
      totalCount = 0,
      itemCount = 0,
      cargoCount = 0,
      recipeCount = 0,
      byproductCount = 0,
      failureCount = 0,
      startedAt = new Date().toISOString(),
      completedAt = null,
      lastError = null,
      updatedAt = startedAt,
    } = {}) {
      const result = statements.insertRefreshRun.run(
        status,
        phase,
        cursorKind,
        cursorId,
        processedCount,
        totalCount,
        itemCount,
        cargoCount,
        recipeCount,
        byproductCount,
        failureCount,
        startedAt,
        completedAt,
        lastError,
        updatedAt,
      );
      return mapRefreshRunRow(statements.getRefreshRun.get(result.lastInsertRowid));
    },
    updateRefreshRun(id, patch = {}) {
      const current = mapRefreshRunRow(statements.getRefreshRun.get(id));
      if (!current) return null;
      const next = {
        id: current.id,
        status: patch.status ?? current.status,
        phase: Object.prototype.hasOwnProperty.call(patch, "phase") ? patch.phase : current.phase,
        cursorKind: Object.prototype.hasOwnProperty.call(patch, "cursorKind") ? patch.cursorKind : current.cursorKind,
        cursorId: Object.prototype.hasOwnProperty.call(patch, "cursorId") ? patch.cursorId : current.cursorId,
        processedCount: patch.processedCount ?? current.processedCount,
        totalCount: patch.totalCount ?? current.totalCount,
        itemCount: patch.itemCount ?? current.itemCount,
        cargoCount: patch.cargoCount ?? current.cargoCount,
        recipeCount: patch.recipeCount ?? current.recipeCount,
        byproductCount: patch.byproductCount ?? current.byproductCount,
        failureCount: patch.failureCount ?? current.failureCount,
        startedAt: patch.startedAt ?? current.startedAt,
        completedAt: Object.prototype.hasOwnProperty.call(patch, "completedAt") ? patch.completedAt : current.completedAt,
        lastError: Object.prototype.hasOwnProperty.call(patch, "lastError") ? patch.lastError : current.lastError,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      statements.saveRefreshRun.run(
        next.status,
        next.phase,
        next.cursorKind,
        next.cursorId,
        next.processedCount,
        next.totalCount,
        next.itemCount,
        next.cargoCount,
        next.recipeCount,
        next.byproductCount,
        next.failureCount,
        next.startedAt,
        next.completedAt,
        next.lastError,
        next.updatedAt,
        next.id,
      );
      return mapRefreshRunRow(statements.getRefreshRun.get(next.id));
    },
    getLatestRefreshRun() {
      return mapRefreshRunRow(statements.getLatestRefreshRun.get());
    },
    listRefreshRuns(limit = 20) {
      const normalizedLimit = Math.max(1, Math.floor(toNumber(limit, 20) || 20));
      return statements.listRefreshRuns.all(normalizedLimit).map((row) => mapRefreshRunRow(row));
    },
    replaceRefreshTargets(runId, targets = []) {
      const updatedAt = new Date().toISOString();
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.deleteRefreshTargets.run(runId);
        targets.forEach((source, sequence) => {
          const entity = entityFromSource(source, {}, source.kind);
          statements.insertRefreshTarget.run(
            runId,
            sequence,
            entity.catalogKey,
            entity.kind,
            entity.targetId,
            entity.itemType,
            entity.name,
            entity.tag,
            entity.tier,
            entity.rarity,
            entity.iconAssetName,
            updatedAt,
          );
        });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return this.getRefreshTargetCounts(runId);
    },
    getRefreshTargetCounts(runId) {
      const row = statements.countRefreshTargets.get(runId) ?? {};
      return {
        total: toNumber(row.total),
        pending: toNumber(row.pending),
        processed: toNumber(row.processed),
        failed: toNumber(row.failed),
      };
    },
    listPendingRefreshTargets(runId, limit = 250) {
      return statements.listPendingRefreshTargets.all(runId, Math.max(1, Math.floor(toNumber(limit, 250)))).map(mapRefreshTargetRow);
    },
    listRetryableRefreshTargets(runId, limit = 250, maxAttempts = 3) {
      return statements.listRetryableRefreshTargets.all(
        runId,
        Math.max(1, Math.floor(toNumber(maxAttempts, 3))),
        Math.max(1, Math.floor(toNumber(limit, 250))),
      ).map(mapRefreshTargetRow);
    },
    markRefreshTargetProcessed(runId, catalogKey, updatedAt = new Date().toISOString()) {
      statements.markRefreshTargetProcessed.run(updatedAt, runId, catalogKey);
    },
    markRefreshTargetFailed(runId, catalogKey, error, updatedAt = new Date().toISOString()) {
      statements.markRefreshTargetFailed.run(String(error ?? "Unknown catalog refresh error"), updatedAt, runId, catalogKey);
    },
    markRefreshTargetUnavailable(runId, catalogKey, error, maxAttempts = 3, updatedAt = new Date().toISOString()) {
      statements.markRefreshTargetUnavailable.run(
        Math.max(1, Math.floor(toNumber(maxAttempts, 3) || 3)),
        String(error ?? "Catalog entity unavailable"),
        updatedAt,
        runId,
        catalogKey,
      );
    },
    upsertDetail(payload, { updatedAt = new Date().toISOString(), fallback = {} } = {}) {
      const normalized = normalizeGameCatalogDetail(payload, fallback);
      db.exec("BEGIN IMMEDIATE");
      try {
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

        const previousRecipeKeys = statements.listRecipeKeysBySource.all(normalized.entity.catalogKey).map((row) => row.recipe_key);
        statements.deleteRecipeSourcesForEntity.run(normalized.entity.catalogKey);
        statements.deleteItemListOutputs.run(normalized.entity.catalogKey);

        for (const recipe of normalized.recipes) {
          statements.insertRecipe.run(
            recipe.recipeKey,
            recipe.sourceKind,
            recipe.sourceId,
            recipe.actionCount,
            recipe.activityKind === "gathering" ? "gathering" : "craft",
            recipe.name,
            recipe.stationName,
            recipe.skillName,
            recipe.isPassive ? 1 : 0,
            recipe.isTransportRoute ? 1 : 0,
            updatedAt,
          );
          statements.deleteRecipeInputs.run(recipe.recipeKey);
          statements.deleteRecipeOutputs.run(recipe.recipeKey);
          for (const input of recipe.inputs) {
            statements.insertRecipeInput.run(recipe.recipeKey, input.inputKey, input.kind, input.targetId, input.quantity);
          }
          for (const output of recipe.outputs) {
            statements.insertRecipeOutput.run(recipe.recipeKey, output.outputKey, output.kind, output.targetId, output.quantity, output.isPrimaryOutput ? 1 : 0);
          }
          statements.insertRecipeSource.run(normalized.entity.catalogKey, recipe.recipeKey);
        }

        for (const output of normalized.itemListOutputs) {
          statements.insertItemListOutput.run(output.producerKey, output.outputKey, output.kind, output.targetId, output.quantity, output.chance, output.guaranteedQuantity);
        }

        for (const recipeKey of previousRecipeKeys) {
          if (toNumber(statements.countRecipeSources.get(recipeKey)?.count) === 0) statements.deleteRecipe.run(recipeKey);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return {
        ...normalized,
        entity: { ...normalized.entity, updatedAt },
        recipes: normalized.recipes.map((recipe) => ({ ...recipe, updatedAt })),
      };
    },
    deleteOrphanRecipes() {
      return statements.deleteOrphanRecipes.run().changes;
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
        guaranteedQuantity: Math.max(0, toNumber(row.output_guaranteed_quantity)),
        producer: mapEntityRow(row),
      }));
    },
    listCraftingEffortCandidates() {
      return [
        ...statements.listDirectCraftingEffortCandidates.all(),
        ...statements.listByproductCraftingEffortCandidates.all(),
      ].map((row) => ({
        catalogKey: row.catalog_key,
        sourceKey: row.source_key,
        actionsRequired: toNumber(row.actions_required),
        outputQuantity: toNumber(row.output_quantity),
        probability: 1,
      }));
    },
    replaceEffortWeights(candidates, modelVersion, updatedAt = new Date().toISOString(), publish = null) {
      const normalizedVersion = Math.max(1, Math.floor(toNumber(modelVersion)));
      const weights = selectLowestEffortWeights((candidates ?? []).filter((row) => (
        row?.method === "crafting" || row?.method === "gathering"
      )));
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.deleteEffortWeights.run();
        for (const row of weights.values()) {
          statements.insertEffortWeight.run(
            row.catalogKey,
            normalizedVersion,
            row.effortWeight,
            row.method,
            String(row.sourceKey ?? ""),
            updatedAt,
          );
        }
        if (typeof publish === "function") publish({ count: weights.size, updatedAt });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return weights.size;
    },
    getEffortWeights(modelVersion) {
      return new Map(statements.listEffortWeights.all(modelVersion).map((row) => [row.catalog_key, {
        catalogKey: row.catalog_key,
        effortWeight: toNumber(row.effort_weight),
        method: row.method,
        sourceKey: row.source_key,
        modelVersion: toNumber(row.model_version),
        updatedAt: row.updated_at,
      }]));
    },
    getEffortWeightRevision(modelVersion) {
      return statements.getEffortWeightRevision.get(modelVersion)?.updated_at ?? null;
    },
  };
}
