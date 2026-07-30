import { createHash } from "node:crypto";

import { selectLowestEffortWeights } from "./craftPlanEffortProgress.mjs";
import { resolveItemListProbabilities } from "./itemProbability.mjs";

export const GAME_CATALOG_NORMALIZATION_VERSION = 8;

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
  const rawItemListId = String(source?.itemListId ?? source?.item_list_id ?? fallback?.itemListId ?? fallback?.item_list_id ?? "").trim();
  const itemListId = rawItemListId && rawItemListId !== "0" ? rawItemListId : "";
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
    ...(itemListId ? { itemListId } : {}),
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

function coalesceRecipeOutputs(components) {
  const grouped = new Map();
  for (const component of components) {
    const existing = grouped.get(component.outputKey);
    if (!existing) {
      grouped.set(component.outputKey, {
        ...component,
        componentCount: 1,
        expectedQuantity: component.quantity * component.occurrenceRate,
        guaranteedQuantity: component.occurrenceRate === 1 ? component.quantity : 0,
      });
      continue;
    }
    existing.componentCount += 1;
    existing.expectedQuantity += component.quantity * component.occurrenceRate;
    if (component.occurrenceRate === 1) existing.guaranteedQuantity += component.quantity;
    existing.isPrimaryOutput = existing.isPrimaryOutput || component.isPrimaryOutput;
  }
  return [...grouped.values()].map(({ componentCount, expectedQuantity, ...output }) => ({
    outputKey: output.outputKey,
    kind: output.kind,
    targetId: output.targetId,
    quantity: componentCount === 1 ? output.quantity : Number(expectedQuantity.toFixed(12)),
    ...((componentCount > 1 || output.yieldBasis != null) ? {
      occurrenceRate: componentCount === 1 ? output.occurrenceRate : 1,
      yieldBasis: output.yieldBasis ?? "per_craft",
    } : {}),
    ...(componentCount > 1 ? { guaranteedQuantity: Number(output.guaranteedQuantity.toFixed(12)) } : {}),
    isPrimaryOutput: output.isPrimaryOutput,
  }));
}

function positiveCatalogId(value) {
  const normalized = String(value ?? "").trim();
  return normalized && Number(normalized) > 0 ? normalized : null;
}

function recipeGatheringMode(recipe, activityKind) {
  if (activityKind !== "gathering") return "ordinary";
  const label = `${recipe?.name ?? ""} ${recipeSkillName(recipe)}`;
  if (/\bprospect(?:ing)?\b/i.test(label)) return "prospecting";
  const resourceId = positiveCatalogId(recipe?.resourceId ?? recipe?.resource_id);
  const cargoId = positiveCatalogId(recipe?.cargoId ?? recipe?.cargo_id);
  return !resourceId && cargoId ? "prospecting" : "ordinary";
}

function normalizeRecipe(recipe, sourceEntity, requestedActivityKind = "craft") {
  const stationName = recipeStationName(recipe);
  const activityKind = stationName ? "craft" : requestedActivityKind === "gathering" ? "gathering" : "craft";
  const gatheringMode = recipeGatheringMode(recipe, activityKind);
  const outputDisplays = unwrapArray(recipe?.craftedItems);
  const inputDisplays = unwrapArray(recipe?.consumedItems);
  const declaredPrimary = targetFromStack(recipe?.craftedItem ?? recipe?.outputItem ?? recipe?.targetItem ?? recipe?.target ?? {}, recipe?.craftedItem ?? recipe?.targetItem ?? {});
  const extractedStacks = unwrapArray(recipe?.extractedItemStacks ?? recipe?.extracted_item_stacks);
  const rawOutputStacks = extractedStacks.length ? extractedStacks : unwrapArray(recipe?.craftedItemStacks);
  const outputs = rawOutputStacks
    .map((entry, index) => {
      const stack = entry?.item_stack ?? entry?.itemStack ?? entry;
      const target = targetFromStack(stack, outputDisplays[index] ?? recipe?.craftedItem ?? {});
      return target ? {
        ...target,
        occurrenceRate: Math.max(0, toNumber(entry?.probability ?? entry?.chance, 1)),
      } : null;
    })
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
    outputs.push({ ...declaredPrimary, quantity: declaredQuantity, occurrenceRate: 1 });
  }
  const inputs = unwrapArray(recipe?.consumedItemStacks)
    .map((stack, index) => targetFromStack(stack, inputDisplays[index] ?? {}))
    .filter((entry) => entry && entry.quantity > 0);

  if (!outputs.length && !inputs.length) return null;

  const sourceOutputKey = sourceEntity.catalogKey;
  const singleOutputKey = outputs.length === 1 ? outputs[0].key : null;
  const primaryOutputKey = declaredPrimary?.key ?? (outputs.some((output) => output.key === sourceOutputKey) ? sourceOutputKey : singleOutputKey);
  const outputComponents = outputs.map((output, componentIndex) => ({
    componentIndex,
    outputKey: output.key,
    kind: output.kind,
    targetId: output.targetId,
    quantity: output.quantity,
    ...((activityKind === "gathering" || toNumber(output.occurrenceRate, 1) !== 1) ? {
      occurrenceRate: Math.max(0, toNumber(output.occurrenceRate, 1)),
      yieldBasis: activityKind === "gathering" ? "per_progress" : "per_craft",
    } : {}),
    isPrimaryOutput: output.key === primaryOutputKey,
  }));
  const normalizedOutputs = coalesceRecipeOutputs(outputComponents);
  const primaryOutput = outputs.find((output) => output.key === primaryOutputKey) ?? null;

  return {
    recipeKey: recipeStableKey(sourceEntity, recipe, outputs, inputs),
    sourceKind: primaryOutput?.kind ?? sourceEntity.kind,
    sourceId: primaryOutput?.targetId ?? sourceEntity.targetId,
    actionCount: recipeActionCount(recipe),
    activityKind,
    gatheringMode,
    resourceId: positiveCatalogId(recipe?.resourceId ?? recipe?.resource_id),
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
    outputComponents,
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
    ...(row.item_list_id ? { itemListId: row.item_list_id } : {}),
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
    gatheringMode: row.gathering_mode === "prospecting" ? "prospecting" : "ordinary",
    name: row.name ?? null,
    stationName: row.station_name ?? null,
    skillName: row.skill_name ?? null,
    isPassive: Boolean(row.is_passive),
    isTransportRoute: Boolean(row.is_transport_route) && recipeHasCargoLink(inputs, outputs),
    resourceId: row.resource_id ?? null,
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
        catalog_key, kind, target_id, item_type, name, tag, tier, rarity, icon_asset_name, item_list_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(catalog_key) DO UPDATE SET
        kind = excluded.kind,
        target_id = excluded.target_id,
        item_type = excluded.item_type,
        name = excluded.name,
        tag = excluded.tag,
        tier = excluded.tier,
        rarity = excluded.rarity,
        icon_asset_name = excluded.icon_asset_name,
        item_list_id = COALESCE(excluded.item_list_id, game_catalog_entities.item_list_id),
        updated_at = excluded.updated_at
    `),
    getEntity: db.prepare("SELECT * FROM game_catalog_entities WHERE catalog_key = ?"),
    listRecipeKeysBySource: db.prepare("SELECT recipe_key FROM game_catalog_recipe_sources WHERE catalog_key = ?"),
    deleteAllRecipeSources: db.prepare("DELETE FROM game_catalog_recipe_sources"),
    deleteAllRecipes: db.prepare("DELETE FROM game_catalog_recipes"),
    deleteRecipeSourcesForEntity: db.prepare("DELETE FROM game_catalog_recipe_sources WHERE catalog_key = ?"),
    insertRecipeSource: db.prepare("INSERT OR IGNORE INTO game_catalog_recipe_sources (catalog_key, recipe_key) VALUES (?, ?)"),
    countRecipeSources: db.prepare("SELECT COUNT(*) AS count FROM game_catalog_recipe_sources WHERE recipe_key = ?"),
    deleteRecipeInputs: db.prepare("DELETE FROM game_catalog_recipe_inputs WHERE recipe_key = ?"),
    deleteRecipeOutputs: db.prepare("DELETE FROM game_catalog_recipe_outputs WHERE recipe_key = ?"),
    deleteRecipeOutputComponents: db.prepare("DELETE FROM game_catalog_recipe_output_components WHERE recipe_key = ?"),
    deleteRecipe: db.prepare("DELETE FROM game_catalog_recipes WHERE recipe_key = ?"),
    deleteOrphanRecipes: db.prepare("DELETE FROM game_catalog_recipes WHERE NOT EXISTS (SELECT 1 FROM game_catalog_recipe_sources AS sources WHERE sources.recipe_key = game_catalog_recipes.recipe_key)"),
    deleteItemListOutputs: db.prepare("DELETE FROM game_catalog_item_list_outputs WHERE producer_key = ?"),
    insertRecipe: db.prepare(`
      INSERT INTO game_catalog_recipes (
        recipe_key, source_kind, source_id, action_count, activity_kind, gathering_mode, name, station_name, skill_name, is_passive, is_transport_route, resource_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(recipe_key) DO UPDATE SET
        source_kind = excluded.source_kind,
        source_id = excluded.source_id,
        action_count = excluded.action_count,
        activity_kind = excluded.activity_kind,
        gathering_mode = excluded.gathering_mode,
        name = excluded.name,
        station_name = excluded.station_name,
        skill_name = excluded.skill_name,
        is_passive = excluded.is_passive,
        is_transport_route = excluded.is_transport_route,
        resource_id = excluded.resource_id,
        updated_at = excluded.updated_at
    `),
    insertRecipeInput: db.prepare(`
      INSERT INTO game_catalog_recipe_inputs (recipe_key, input_key, kind, target_id, quantity)
      VALUES (?, ?, ?, ?, ?)
    `),
    insertRecipeOutput: db.prepare(`
      INSERT INTO game_catalog_recipe_outputs (recipe_key, output_key, kind, target_id, quantity, occurrence_rate, yield_basis, guaranteed_quantity, is_primary_output)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertRecipeOutputComponent: db.prepare(`
      INSERT INTO game_catalog_recipe_output_components (
        recipe_key, component_index, output_key, kind, target_id, quantity, occurrence_rate, yield_basis, is_primary_output
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      SELECT output_key, kind, target_id, quantity, occurrence_rate, yield_basis, guaranteed_quantity, is_primary_output
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
    listEntityItemLists: db.prepare(`
      SELECT catalog_key, item_list_id
      FROM game_catalog_entities
      WHERE item_list_id IS NOT NULL AND item_list_id <> ''
      ORDER BY catalog_key ASC
    `),
    deleteProbabilitySnapshot: db.prepare("DELETE FROM game_catalog_probability_snapshot"),
    deleteProbabilitySources: db.prepare("DELETE FROM game_catalog_probability_sources"),
    deleteResources: db.prepare("DELETE FROM game_catalog_resources"),
    deleteItemLists: db.prepare("DELETE FROM game_catalog_item_lists"),
    deleteAllItemListOutputs: db.prepare("DELETE FROM game_catalog_item_list_outputs"),
    insertItemList: db.prepare(`
      INSERT INTO game_catalog_item_lists (item_list_id, name, total_weight, source_url, source_revision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    insertItemListPossibility: db.prepare(`
      INSERT INTO game_catalog_item_list_possibilities (item_list_id, possibility_index, raw_weight, normalized_probability)
      VALUES (?, ?, ?, ?)
    `),
    insertItemListPossibilityOutput: db.prepare(`
      INSERT INTO game_catalog_item_list_possibility_outputs (
        item_list_id, possibility_index, output_index, output_key, kind, target_id, nested_item_list_id, quantity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertResource: db.prepare(`
      INSERT INTO game_catalog_resources (resource_id, name, tier, tag, max_health, source_url, source_revision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertResourceCompletionOutput: db.prepare(`
      INSERT INTO game_catalog_resource_completion_outputs (
        resource_id, output_key, kind, target_id, quantity, occurrence_rate
      ) VALUES (?, ?, ?, ?, ?, ?)
    `),
    insertProbabilitySnapshot: db.prepare(`
      INSERT INTO game_catalog_probability_snapshot (
        snapshot_id, source_url, source_revision, item_list_count, resource_count, warning_json, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?)
    `),
    getProbabilitySnapshot: db.prepare("SELECT * FROM game_catalog_probability_snapshot WHERE snapshot_id = 1"),
    insertProbabilitySource: db.prepare(`
      INSERT INTO game_catalog_probability_sources (source_kind, source_url, source_revision, updated_at)
      VALUES (?, ?, ?, ?)
    `),
    listProbabilitySources: db.prepare(`
      SELECT source_kind, source_url, source_revision, updated_at
      FROM game_catalog_probability_sources
      ORDER BY source_kind ASC
    `),
    listProbabilityRecipeRows: db.prepare(`
      SELECT
        recipes.recipe_key,
        recipes.name AS recipe_name,
        recipes.station_name,
        recipes.skill_name,
        recipes.activity_kind,
        recipes.gathering_mode,
        recipes.action_count,
        recipes.resource_id,
        outputs.output_key,
        outputs.kind AS output_kind,
        outputs.target_id AS output_target_id,
        outputs.quantity,
        outputs.occurrence_rate,
        outputs.guaranteed_quantity,
        entities.item_list_id,
        resources.name AS resource_name,
        resources.max_health
      FROM game_catalog_recipes AS recipes
      JOIN game_catalog_recipe_outputs AS outputs ON outputs.recipe_key = recipes.recipe_key
      LEFT JOIN game_catalog_entities AS entities ON entities.catalog_key = outputs.output_key
      LEFT JOIN game_catalog_resources AS resources ON resources.resource_id = recipes.resource_id
      WHERE recipes.is_transport_route = 0
    `),
    listItemListOutputsForProducer: db.prepare(`
      SELECT output_key, kind, target_id, quantity, chance, guaranteed_quantity
      FROM game_catalog_item_list_outputs
      WHERE producer_key = ?
      ORDER BY output_key ASC
    `),
    listResourceCompletionOutputs: db.prepare(`
      SELECT outputs.resource_id, outputs.output_key, outputs.quantity, outputs.occurrence_rate, resources.max_health
      FROM game_catalog_resource_completion_outputs AS outputs
      JOIN game_catalog_resources AS resources ON resources.resource_id = outputs.resource_id
      WHERE EXISTS (
        SELECT 1 FROM game_catalog_recipes AS recipes
        WHERE recipes.resource_id = outputs.resource_id
          AND recipes.activity_kind = 'gathering'
          AND recipes.gathering_mode = 'ordinary'
      )
      ORDER BY outputs.resource_id ASC, outputs.output_key ASC
    `),
    getResource: db.prepare("SELECT * FROM game_catalog_resources WHERE resource_id = ?"),
    listResourceCompletionOutputsByResource: db.prepare(`
      SELECT resource_id, output_key, kind, target_id, quantity, occurrence_rate
      FROM game_catalog_resource_completion_outputs
      WHERE resource_id = ?
      ORDER BY output_key ASC
    `),
    listResourceCompletionRecipesForOutput: db.prepare(`
      SELECT
        recipes.*,
        resources.name AS resource_name,
        resources.max_health,
        completion.output_key AS completion_output_key,
        completion.kind AS completion_kind,
        completion.target_id AS completion_target_id,
        completion.quantity AS completion_quantity,
        completion.occurrence_rate AS completion_occurrence_rate
      FROM game_catalog_resource_completion_outputs AS completion
      JOIN game_catalog_resources AS resources ON resources.resource_id = completion.resource_id
      JOIN game_catalog_recipes AS recipes
        ON recipes.resource_id = completion.resource_id
        AND recipes.activity_kind = 'gathering'
        AND recipes.gathering_mode = 'ordinary'
      WHERE completion.output_key = ?
      ORDER BY recipes.recipe_key ASC
    `),
    listAllEntities: db.prepare(`
      SELECT * FROM game_catalog_entities
      ORDER BY kind ASC, name COLLATE NOCASE ASC, target_id ASC
    `),
    listRawItemListRows: db.prepare(`
      SELECT
        lists.item_list_id,
        lists.name AS item_list_name,
        possibilities.possibility_index,
        possibilities.raw_weight,
        possibilities.normalized_probability,
        outputs.output_index,
        outputs.output_key,
        outputs.kind AS output_kind,
        outputs.target_id AS output_target_id,
        outputs.nested_item_list_id,
        outputs.quantity,
        entities.name AS output_name
      FROM game_catalog_item_lists AS lists
      JOIN game_catalog_item_list_possibilities AS possibilities ON possibilities.item_list_id = lists.item_list_id
      LEFT JOIN game_catalog_item_list_possibility_outputs AS outputs
        ON outputs.item_list_id = possibilities.item_list_id
        AND outputs.possibility_index = possibilities.possibility_index
      LEFT JOIN game_catalog_entities AS entities ON entities.catalog_key = outputs.output_key
      ORDER BY lists.item_list_id ASC, possibilities.possibility_index ASC, outputs.output_index ASC
    `),
    listRawRecipeOutputComponents: db.prepare(`
      SELECT
        components.recipe_key,
        recipes.name AS recipe_name,
        recipes.activity_kind,
        recipes.gathering_mode,
        components.component_index,
        components.output_key,
        components.kind AS output_kind,
        components.target_id AS output_target_id,
        entities.name AS output_name,
        components.quantity,
        components.occurrence_rate,
        components.yield_basis,
        components.is_primary_output
      FROM game_catalog_recipe_output_components AS components
      JOIN game_catalog_recipes AS recipes ON recipes.recipe_key = components.recipe_key
      LEFT JOIN game_catalog_entities AS entities ON entities.catalog_key = components.output_key
      ORDER BY components.recipe_key ASC, components.component_index ASC
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
        ...((output.yield_basis === "per_progress" || toNumber(output.occurrence_rate, 1) !== 1) ? {
          occurrenceRate: Math.max(0, toNumber(output.occurrence_rate, 1)),
          yieldBasis: output.yield_basis === "per_progress" ? "per_progress" : "per_craft",
        } : {}),
        ...(output.guaranteed_quantity != null ? {
          guaranteedQuantity: Math.max(0, toNumber(output.guaranteed_quantity)),
        } : {}),
        isPrimaryOutput: Boolean(output.is_primary_output),
      })),
    );
  }

  function runMutation(manageTransaction, mutation) {
    if (!manageTransaction) return mutation();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = mutation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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
        entity.itemListId ?? null,
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
      const preservePublishedItemListOutputs = Boolean(
        normalized.entity.itemListId && statements.getProbabilitySnapshot.get(),
      );
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
          normalized.entity.itemListId ?? null,
          updatedAt,
        );

        const previousRecipeKeys = statements.listRecipeKeysBySource.all(normalized.entity.catalogKey).map((row) => row.recipe_key);
        statements.deleteRecipeSourcesForEntity.run(normalized.entity.catalogKey);
        if (!preservePublishedItemListOutputs) statements.deleteItemListOutputs.run(normalized.entity.catalogKey);

        for (const recipe of normalized.recipes) {
          try {
            statements.insertRecipe.run(
              recipe.recipeKey,
              recipe.sourceKind,
              recipe.sourceId,
              recipe.actionCount,
              recipe.activityKind === "gathering" ? "gathering" : "craft",
              recipe.gatheringMode === "prospecting" ? "prospecting" : "ordinary",
              recipe.name,
              recipe.stationName,
              recipe.skillName,
              recipe.isPassive ? 1 : 0,
              recipe.isTransportRoute ? 1 : 0,
              recipe.resourceId,
              updatedAt,
            );
            statements.deleteRecipeInputs.run(recipe.recipeKey);
            statements.deleteRecipeOutputs.run(recipe.recipeKey);
            statements.deleteRecipeOutputComponents.run(recipe.recipeKey);
            for (const input of recipe.inputs) {
              statements.insertRecipeInput.run(recipe.recipeKey, input.inputKey, input.kind, input.targetId, input.quantity);
            }
            for (const output of recipe.outputs) {
              statements.insertRecipeOutput.run(
                recipe.recipeKey,
                output.outputKey,
                output.kind,
                output.targetId,
                output.quantity,
                Math.max(0, toNumber(output.occurrenceRate, 1)),
                output.yieldBasis === "per_progress" ? "per_progress" : "per_craft",
                output.guaranteedQuantity == null ? null : Math.max(0, toNumber(output.guaranteedQuantity)),
                output.isPrimaryOutput ? 1 : 0,
              );
            }
            for (const component of recipe.outputComponents) {
              statements.insertRecipeOutputComponent.run(
                recipe.recipeKey,
                component.componentIndex,
                component.outputKey,
                component.kind,
                component.targetId,
                component.quantity,
                Math.max(0, toNumber(component.occurrenceRate, 1)),
                component.yieldBasis === "per_progress" ? "per_progress" : "per_craft",
                component.isPrimaryOutput ? 1 : 0,
              );
            }
            statements.insertRecipeSource.run(normalized.entity.catalogKey, recipe.recipeKey);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Recipe ${recipe.recipeKey}${recipe.name ? ` (${recipe.name})` : ""}: ${message}`, { cause: error });
          }
        }

        if (!preservePublishedItemListOutputs) {
          for (const output of normalized.itemListOutputs) {
            statements.insertItemListOutput.run(output.producerKey, output.outputKey, output.kind, output.targetId, output.quantity, output.chance, output.guaranteedQuantity);
          }
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
    replaceRecipeSnapshot(
      recipes = [],
      updatedAt = new Date().toISOString(),
      publish = null,
      { manageTransaction = true } = {},
    ) {
      if (!Array.isArray(recipes)) throw new TypeError("Recipe snapshot must be an array.");
      const seen = new Set();
      const normalized = recipes.map((recipe, recipeIndex) => {
        const label = `Recipe snapshot row ${recipeIndex}`;
        const recipeKey = String(recipe?.recipeKey ?? "").trim();
        if (!recipeKey) throw new Error(`${label} recipe key is required.`);
        if (seen.has(recipeKey)) throw new Error(`Duplicate recipe snapshot key: ${recipeKey}`);
        seen.add(recipeKey);
        const sourceKind = gameCatalogKindFromItemType(recipe?.sourceKind);
        const sourceId = String(recipe?.sourceId ?? "").trim();
        if (!/^\d+$/.test(sourceId)) throw new Error(`${label} source id must be a decimal string.`);
        const actionCount = Number(recipe?.actionCount ?? 0);
        if (!Number.isFinite(actionCount) || actionCount < 0) {
          throw new Error(`${label} action count must be a non-negative finite number.`);
        }
        const normalizeLinks = (rows, linkKind) => {
          if (!Array.isArray(rows)) throw new TypeError(`${label} ${linkKind}s must be an array.`);
          return rows.map((link, linkIndex) => {
            const kind = gameCatalogKindFromItemType(link?.kind);
            const targetId = String(link?.targetId ?? "").trim();
            if (!/^\d+$/.test(targetId)) {
              throw new Error(`${label} ${linkKind} ${linkIndex} id must be a decimal string.`);
            }
            const quantity = Number(link?.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0) {
              throw new Error(`${label} ${linkKind} ${linkIndex} quantity must be positive.`);
            }
            const occurrenceRate = Number(link?.occurrenceRate ?? 1);
            if (!Number.isFinite(occurrenceRate) || occurrenceRate < 0) {
              throw new Error(`${label} ${linkKind} ${linkIndex} occurrence rate must be non-negative.`);
            }
            return {
              ...link,
              kind,
              targetId,
              [`${linkKind}Key`]: gameCatalogKey(kind, targetId),
              quantity,
              occurrenceRate,
            };
          });
        };
        const inputs = normalizeLinks(recipe?.inputs ?? [], "input");
        const outputs = normalizeLinks(recipe?.outputs ?? [], "output");
        if (outputs.length === 0) throw new Error(`${label} must have at least one output.`);
        const outputComponents = normalizeLinks(recipe?.outputComponents ?? outputs, "output")
          .map((component, componentIndex) => ({
            ...component,
            componentIndex: Math.max(0, Math.trunc(toNumber(component?.componentIndex, componentIndex))),
          }));
        const sourceCatalogKeys = [...new Set(
          (Array.isArray(recipe?.sourceCatalogKeys) && recipe.sourceCatalogKeys.length
            ? recipe.sourceCatalogKeys
            : outputs.map((output) => output.outputKey))
            .map((value) => String(value ?? "").trim())
            .filter(Boolean),
        )];
        return {
          ...recipe,
          recipeKey,
          sourceKind,
          sourceId,
          actionCount,
          activityKind: recipe?.activityKind === "gathering" ? "gathering" : "craft",
          gatheringMode: recipe?.gatheringMode === "prospecting" ? "prospecting" : "ordinary",
          resourceId: recipe?.resourceId == null ? null : String(recipe.resourceId),
          inputs,
          outputs,
          outputComponents,
          sourceCatalogKeys,
        };
      });

      return runMutation(manageTransaction, () => {
        statements.deleteAllRecipeSources.run();
        statements.deleteAllRecipes.run();
        for (const recipe of normalized) {
          statements.insertRecipe.run(
            recipe.recipeKey,
            recipe.sourceKind,
            recipe.sourceId,
            recipe.actionCount,
            recipe.activityKind,
            recipe.gatheringMode,
            recipe.name == null ? null : String(recipe.name),
            recipe.stationName == null ? null : String(recipe.stationName),
            recipe.skillName == null ? null : String(recipe.skillName),
            recipe.isPassive ? 1 : 0,
            recipe.isTransportRoute ? 1 : 0,
            recipe.resourceId,
            updatedAt,
          );
          for (const input of recipe.inputs) {
            statements.insertRecipeInput.run(
              recipe.recipeKey,
              input.inputKey,
              input.kind,
              input.targetId,
              input.quantity,
            );
          }
          for (const output of recipe.outputs) {
            statements.insertRecipeOutput.run(
              recipe.recipeKey,
              output.outputKey,
              output.kind,
              output.targetId,
              output.quantity,
              output.occurrenceRate,
              output.yieldBasis === "per_progress" ? "per_progress" : "per_craft",
              output.guaranteedQuantity == null ? null : Math.max(0, toNumber(output.guaranteedQuantity)),
              output.isPrimaryOutput ? 1 : 0,
            );
          }
          for (const component of recipe.outputComponents) {
            statements.insertRecipeOutputComponent.run(
              recipe.recipeKey,
              component.componentIndex,
              component.outputKey,
              component.kind,
              component.targetId,
              component.quantity,
              component.occurrenceRate,
              component.yieldBasis === "per_progress" ? "per_progress" : "per_craft",
              component.isPrimaryOutput ? 1 : 0,
            );
          }
          for (const catalogKey of recipe.sourceCatalogKeys) {
            statements.insertRecipeSource.run(catalogKey, recipe.recipeKey);
          }
        }
        const result = { recipeCount: normalized.length, updatedAt };
        if (typeof publish === "function") publish(result);
        return result;
      });
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
    replaceProbabilitySnapshot({
      itemLists = [],
      resources = [],
      sourceUrl,
      sourceRevision = null,
      sources = [],
      updatedAt = new Date().toISOString(),
    } = {}, publish = null, { manageTransaction = true } = {}) {
      const normalizedSourceUrl = String(sourceUrl ?? "").trim();
      if (!normalizedSourceUrl) throw new Error("Probability snapshot source URL is required.");
      const itemListIdByOutputKey = new Map(
        statements.listEntityItemLists.all().map((row) => [row.catalog_key, row.item_list_id]),
      );
      const resolved = resolveItemListProbabilities(itemLists, itemListIdByOutputKey);
      const warningSet = new Set(resolved.warnings);

      return runMutation(manageTransaction, () => {
        statements.deleteProbabilitySnapshot.run();
        statements.deleteProbabilitySources.run();
        statements.deleteAllItemListOutputs.run();
        statements.deleteResources.run();
        statements.deleteItemLists.run();

        for (const list of itemLists) {
          const itemListId = String(list?.itemListId ?? "").trim();
          if (!itemListId) continue;
          const resolution = resolved.lists.get(itemListId);
          const totalWeight = Math.max(0, toNumber(resolution?.totalWeight));
          statements.insertItemList.run(
            itemListId,
            list.name ?? null,
            totalWeight,
            normalizedSourceUrl,
            sourceRevision,
            updatedAt,
          );
          for (const possibility of list.possibilities ?? []) {
            const possibilityIndex = Math.max(0, Math.trunc(toNumber(possibility?.possibilityIndex)));
            const rawWeight = Math.max(0, toNumber(possibility?.rawWeight));
            statements.insertItemListPossibility.run(
              itemListId,
              possibilityIndex,
              rawWeight,
              totalWeight > 0 ? rawWeight / totalWeight : 0,
            );
            (possibility?.outputs ?? []).forEach((output, outputIndex) => {
              statements.insertItemListPossibilityOutput.run(
                itemListId,
                possibilityIndex,
                Math.max(0, Math.trunc(toNumber(output?.outputIndex, outputIndex))),
                output.outputKey,
                output.kind,
                output.targetId,
                itemListIdByOutputKey.get(output.outputKey) ?? null,
                output.quantity,
              );
            });
          }
        }

        for (const producer of statements.listEntityItemLists.all()) {
          const resolution = resolved.lists.get(String(producer.item_list_id));
          if (!resolution?.valid) {
            warningSet.add(`Producer ${producer.catalog_key} has no valid item-list probability result.`);
            continue;
          }
          for (const output of resolution.outputs.values()) {
            statements.insertItemListOutput.run(
              producer.catalog_key,
              output.outputKey,
              output.kind,
              output.targetId,
              output.expectedQuantity,
              output.chance,
              output.guaranteedQuantity,
            );
          }
        }

        for (const resource of resources) {
          const resourceId = String(resource?.resourceId ?? "").trim();
          if (!resourceId) continue;
          statements.insertResource.run(
            resourceId,
            resource.name,
            resource.tier,
            resource.tag,
            Math.max(0, toNumber(resource.maxHealth)),
            normalizedSourceUrl,
            sourceRevision,
            updatedAt,
          );
          const completionByOutput = new Map();
          for (const output of resource.completionOutputs ?? []) {
            const baseQuantity = Math.max(0, toNumber(output.quantity)) * Math.max(0, toNumber(output.occurrenceRate, 1));
            const nestedListId = itemListIdByOutputKey.get(output.outputKey);
            const nestedResolution = nestedListId ? resolved.lists.get(String(nestedListId)) : null;
            const expandedOutputs = nestedListId
              ? [...(nestedResolution?.valid ? nestedResolution.outputs.values() : [])].map((nestedOutput) => ({
                ...nestedOutput,
                quantity: baseQuantity * nestedOutput.expectedQuantity,
              }))
              : [{ ...output, quantity: baseQuantity }];
            if (nestedListId && !nestedResolution?.valid) {
              warningSet.add(`Resource ${resourceId} completion output ${output.outputKey} uses invalid item list ${nestedListId}.`);
              continue;
            }
            for (const expanded of expandedOutputs) {
              const current = completionByOutput.get(expanded.outputKey) ?? { ...expanded, quantity: 0 };
              current.quantity += Math.max(0, toNumber(expanded.quantity));
              current.occurrenceRate = 1;
              completionByOutput.set(expanded.outputKey, current);
            }
          }
          for (const output of completionByOutput.values()) {
            statements.insertResourceCompletionOutput.run(
              resourceId,
              output.outputKey,
              output.kind,
              output.targetId,
              output.quantity,
              output.occurrenceRate,
            );
          }
        }

        const warningJson = JSON.stringify([...warningSet]);
        statements.insertProbabilitySnapshot.run(
          normalizedSourceUrl,
          sourceRevision,
          itemLists.length,
          resources.length,
          warningJson,
          updatedAt,
        );
        const normalizedSources = (Array.isArray(sources) && sources.length ? sources : [{
          sourceKind: "game_data",
          sourceUrl: normalizedSourceUrl,
          sourceRevision,
        }]).map((source) => ({
          sourceKind: String(source?.sourceKind ?? source?.kind ?? "").trim(),
          sourceUrl: String(source?.sourceUrl ?? source?.url ?? "").trim(),
          sourceRevision: source?.sourceRevision ?? source?.revision ?? null,
        })).filter((source) => source.sourceKind && source.sourceUrl);
        for (const source of normalizedSources) {
          statements.insertProbabilitySource.run(
            source.sourceKind,
            source.sourceUrl,
            source.sourceRevision,
            updatedAt,
          );
        }
        const result = {
          itemListCount: itemLists.length,
          resourceCount: resources.length,
          warnings: [...warningSet],
          sourceUrl: normalizedSourceUrl,
          sourceRevision,
          sources: normalizedSources.map((source) => ({ ...source, updatedAt })),
          updatedAt,
        };
        if (typeof publish === "function") publish(result);
        return result;
      });
    },
    getProbabilitySnapshot() {
      const row = statements.getProbabilitySnapshot.get();
      if (!row) return null;
      let warnings = [];
      try {
        const parsed = JSON.parse(row.warning_json ?? "[]");
        if (Array.isArray(parsed)) warnings = parsed.map(String);
      } catch {}
      return {
        sourceUrl: row.source_url,
        sourceRevision: row.source_revision ?? null,
        itemListCount: toNumber(row.item_list_count),
        resourceCount: toNumber(row.resource_count),
        warnings,
        sources: statements.listProbabilitySources.all().map((source) => ({
          sourceKind: source.source_kind,
          sourceUrl: source.source_url,
          sourceRevision: source.source_revision ?? null,
          updatedAt: source.updated_at,
        })),
        updatedAt: row.updated_at,
      };
    },
    getResource(resourceId) {
      const row = statements.getResource.get(String(resourceId ?? ""));
      return row ? {
        resourceId: row.resource_id,
        name: row.name,
        tier: row.tier == null ? null : toNumber(row.tier),
        tag: row.tag ?? null,
        maxHealth: toNumber(row.max_health),
        sourceUrl: row.source_url,
        sourceRevision: row.source_revision ?? null,
        updatedAt: row.updated_at,
      } : null;
    },
    listResourceCompletionOutputs(resourceId) {
      return statements.listResourceCompletionOutputsByResource.all(String(resourceId ?? "")).map((row) => ({
        resourceId: row.resource_id,
        outputKey: row.output_key,
        kind: row.kind,
        targetId: row.target_id,
        quantity: toNumber(row.quantity),
        occurrenceRate: Math.max(0, toNumber(row.occurrence_rate, 1)),
      }));
    },
    listResourceCompletionRecipesForOutput(outputKey) {
      return statements.listResourceCompletionRecipesForOutput.all(String(outputKey ?? "")).map((row) => ({
        ...recipeWithLinks(row),
        resourceName: row.resource_name,
        resourceHealth: Math.max(0, toNumber(row.max_health)),
        completionOutput: {
          outputKey: row.completion_output_key,
          kind: row.completion_kind,
          targetId: row.completion_target_id,
          quantity: Math.max(0, toNumber(row.completion_quantity)),
          occurrenceRate: Math.max(0, toNumber(row.completion_occurrence_rate, 1)),
        },
      }));
    },
    getProbabilityWorkbookData() {
      const snapshot = this.getProbabilitySnapshot();
      if (!snapshot) return null;
      const entities = statements.listAllEntities.all().map(mapEntityRow);
      const entityByKey = new Map(entities.map((entity) => [entity.catalogKey, entity]));
      const completionByResourceOutput = new Map();
      for (const row of statements.listResourceCompletionOutputs.all()) {
        const key = `${row.resource_id}\u0000${row.output_key}`;
        completionByResourceOutput.set(key, (completionByResourceOutput.get(key) ?? 0)
          + (Math.max(0, toNumber(row.quantity)) * Math.max(0, toNumber(row.occurrence_rate, 1))));
      }
      const gatheringRoutes = [];
      const craftingRoutes = [];
      const coveredCompletionKeys = new Set();
      const warnings = new Set(snapshot.warnings);

      for (const row of statements.listProbabilityRecipeRows.all()) {
        const derivedOutputs = row.item_list_id
          ? statements.listItemListOutputsForProducer.all(row.output_key)
          : [{
            output_key: row.output_key,
            kind: row.output_kind,
            target_id: row.output_target_id,
            quantity: 1,
            chance: 1,
            guaranteed_quantity: 1,
          }];
        if (row.item_list_id && derivedOutputs.length === 0) {
          warnings.add(`Recipe ${row.recipe_key} uses item list ${row.item_list_id}, but no valid resolved outputs were available.`);
          continue;
        }
        for (const derived of derivedOutputs) {
          const directQuantity = Math.max(0, toNumber(row.quantity));
          const occurrenceRate = Math.max(0, toNumber(row.occurrence_rate, 1));
          const listExpectedQuantity = Math.max(0, toNumber(derived.quantity, 1));
          const listChance = Math.min(1, Math.max(0, toNumber(derived.chance, 1)));
          const expected = directQuantity * occurrenceRate * listExpectedQuantity;
          const directGuaranteed = row.guaranteed_quantity == null
            ? occurrenceRate === 1 ? directQuantity : 0
            : Math.max(0, toNumber(row.guaranteed_quantity));
          const guaranteed = directGuaranteed * Math.max(0, toNumber(derived.guaranteed_quantity, 1));
          const outputKey = derived.output_key;
          const outputEntity = entityByKey.get(outputKey);
          const common = {
            recipeKey: row.recipe_key,
            recipeName: row.recipe_name ?? row.recipe_key,
            stationName: row.station_name ?? null,
            skillName: row.skill_name ?? null,
            actionCount: Math.max(0, toNumber(row.action_count)),
            outputKey,
            outputKind: derived.kind,
            outputId: derived.target_id,
            outputName: outputEntity?.name ?? `${derived.kind === "cargo" ? "Cargo" : "Item"} #${derived.target_id}`,
            directQuantity,
            extractionQuantity: directQuantity,
            occurrenceRate,
            listChance,
            listExpectedQuantity,
            probabilityStatus: Math.abs(expected - guaranteed) < 1e-9 ? "Guaranteed" : "Expected value",
          };
          if (row.activity_kind === "gathering") {
            const prospecting = row.gathering_mode === "prospecting";
            const resourceHealth = prospecting ? null : Math.max(0, toNumber(row.max_health));
            const completionKey = `${row.resource_id}\u0000${outputKey}`;
            const completionYield = prospecting ? null : completionByResourceOutput.get(completionKey) ?? 0;
            if (!prospecting) coveredCompletionKeys.add(completionKey);
            gatheringRoutes.push({
              ...common,
              gatheringMode: prospecting ? "prospecting" : "ordinary",
              resourceId: row.resource_id,
              resourceName: prospecting ? "Prospecting discovery" : row.resource_name ?? `Resource #${row.resource_id}`,
              resourceHealth,
              expectedPerProgress: expected,
              completionYield,
              expectedPerResource: !prospecting && resourceHealth > 0 ? (expected * resourceHealth) + completionYield : null,
              probabilityStatus: prospecting
                ? "Expected per extraction progress; prospecting exhaustion is unknown"
                : common.probabilityStatus,
            });
          } else {
            craftingRoutes.push({
              ...common,
              expectedPerCraft: expected,
              guaranteedPerCraft: guaranteed,
            });
          }
        }
      }

      for (const [key, completionYield] of completionByResourceOutput.entries()) {
        if (coveredCompletionKeys.has(key)) continue;
        const [resourceId, outputKey] = key.split("\u0000");
        const resource = this.getResource(resourceId);
        const outputEntity = entityByKey.get(outputKey);
        const separator = outputKey.indexOf(":");
        const outputKind = separator >= 0 ? outputKey.slice(0, separator) : "items";
        const outputId = separator >= 0 ? outputKey.slice(separator + 1) : outputKey;
        gatheringRoutes.push({
          resourceId,
          gatheringMode: "ordinary",
          resourceName: resource?.name ?? `Resource #${resourceId}`,
          resourceHealth: resource?.maxHealth ?? 0,
          recipeKey: `resource:${resourceId}:completion`,
          recipeName: "Resource completion yield",
          stationName: null,
          skillName: null,
          outputKey,
          outputKind,
          outputId,
          outputName: outputEntity?.name ?? `${outputKind === "cargo" ? "Cargo" : "Item"} #${outputId}`,
          extractionQuantity: 0,
          directQuantity: 0,
          occurrenceRate: 0,
          listChance: 1,
          listExpectedQuantity: 1,
          expectedPerProgress: 0,
          completionYield,
          expectedPerResource: completionYield,
          probabilityStatus: "Resource completion",
        });
      }

      const rawItemLists = statements.listRawItemListRows.all().map((row) => ({
        itemListId: row.item_list_id,
        itemListName: row.item_list_name ?? null,
        possibilityIndex: toNumber(row.possibility_index),
        rawWeight: toNumber(row.raw_weight),
        normalizedProbability: toNumber(row.normalized_probability),
        outputIndex: row.output_index == null ? null : toNumber(row.output_index),
        outputKey: row.output_key ?? null,
        outputKind: row.output_kind ?? null,
        outputId: row.output_target_id ?? null,
        outputName: row.output_name ?? null,
        nestedItemListId: row.nested_item_list_id ?? null,
        quantity: row.quantity == null ? null : toNumber(row.quantity),
      }));
      const rawRecipeOutputs = statements.listRawRecipeOutputComponents.all().map((row) => ({
        recipeKey: row.recipe_key,
        recipeName: row.recipe_name ?? row.recipe_key,
        activityKind: row.activity_kind === "gathering" ? "gathering" : "craft",
        gatheringMode: row.activity_kind === "gathering"
          ? row.gathering_mode === "prospecting" ? "prospecting" : "ordinary"
          : null,
        componentIndex: toNumber(row.component_index),
        outputKey: row.output_key,
        outputKind: row.output_kind,
        outputId: row.output_target_id,
        outputName: row.output_name ?? `${row.output_kind === "cargo" ? "Cargo" : "Item"} #${row.output_target_id}`,
        quantity: toNumber(row.quantity),
        occurrenceRate: Math.max(0, toNumber(row.occurrence_rate, 1)),
        yieldBasis: row.yield_basis === "per_progress" ? "per_progress" : "per_craft",
        isPrimaryOutput: Boolean(row.is_primary_output),
      }));

      return {
        snapshot,
        entities,
        gatheringRoutes,
        craftingRoutes,
        rawRecipeOutputs,
        rawItemLists,
        warnings: [...warnings],
      };
    },
    listProbabilityEffortCandidates() {
      if (!statements.getProbabilitySnapshot.get()) return [];
      const candidates = new Map();
      const ensure = ({ catalogKey, sourceKey, method, actionsRequired = 1, resourceHealth = null }) => {
        const key = `${method}\u0000${sourceKey}\u0000${catalogKey}`;
        const current = candidates.get(key) ?? {
          catalogKey,
          sourceKey,
          method,
          actionsRequired,
          expectedOutput: 0,
          resourceHealth,
        };
        candidates.set(key, current);
        return current;
      };

      for (const row of statements.listProbabilityRecipeRows.all()) {
        const method = row.activity_kind === "gathering" ? "gathering" : "crafting";
        const prospecting = method === "gathering" && row.gathering_mode === "prospecting";
        const actionsRequired = method === "gathering" ? 1 : Math.max(0, toNumber(row.action_count));
        if (!(actionsRequired > 0)) continue;
        const sourceKey = method === "gathering" && row.resource_id && !prospecting
          ? `resource:${row.resource_id}`
          : row.recipe_key;
        const baseExpected = Math.max(0, toNumber(row.quantity)) * Math.max(0, toNumber(row.occurrence_rate, 1));
        const derivedOutputs = row.item_list_id
          ? statements.listItemListOutputsForProducer.all(row.output_key)
          : [];
        if (row.item_list_id) {
          if (!derivedOutputs.length) continue;
          for (const output of derivedOutputs) {
            const candidate = ensure({
              catalogKey: output.output_key,
              sourceKey,
              method,
              actionsRequired,
              resourceHealth: prospecting || row.max_health == null ? null : toNumber(row.max_health),
            });
            candidate.expectedOutput += baseExpected * Math.max(0, toNumber(output.quantity));
          }
        } else if (baseExpected > 0) {
          const candidate = ensure({
            catalogKey: row.output_key,
            sourceKey,
            method,
            actionsRequired,
            resourceHealth: prospecting || row.max_health == null ? null : toNumber(row.max_health),
          });
          candidate.expectedOutput += baseExpected;
        }
      }

      for (const row of statements.listResourceCompletionOutputs.all()) {
        const health = Math.max(0, toNumber(row.max_health));
        if (!(health > 0)) continue;
        const candidate = ensure({
          catalogKey: row.output_key,
          sourceKey: `resource:${row.resource_id}`,
          method: "gathering",
          resourceHealth: health,
        });
        candidate.expectedOutput += (
          Math.max(0, toNumber(row.quantity)) * Math.max(0, toNumber(row.occurrence_rate, 1))
        ) / health;
      }

      return [...candidates.values()].map((candidate) => ({
        catalogKey: candidate.catalogKey,
        sourceKey: candidate.sourceKey,
        method: candidate.method,
        effortWeight: candidate.actionsRequired / candidate.expectedOutput,
        expectedPerProgress: candidate.method === "gathering" ? candidate.expectedOutput : null,
        expectedPerCraft: candidate.method === "crafting" ? candidate.expectedOutput : null,
        resourceHealth: candidate.resourceHealth,
        expectedPerResource: candidate.method === "gathering" && candidate.resourceHealth
          ? candidate.expectedOutput * candidate.resourceHealth
          : null,
      })).filter((candidate) => Number.isFinite(candidate.effortWeight) && candidate.effortWeight > 0);
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
    replaceEffortWeights(
      candidates,
      modelVersion,
      updatedAt = new Date().toISOString(),
      publish = null,
      { manageTransaction = true } = {},
    ) {
      const normalizedVersion = Math.max(1, Math.floor(toNumber(modelVersion)));
      const weights = selectLowestEffortWeights((candidates ?? []).filter((row) => (
        row?.method === "crafting" || row?.method === "gathering"
      )));
      return runMutation(manageTransaction, () => {
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
        return weights.size;
      });
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
