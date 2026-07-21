function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finite(value, fallback));
}

function text(value) {
  return String(value ?? "").trim();
}

function rows(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}

function outputKind(value) {
  return value === 1 || value === "1" || text(value).toLowerCase() === "cargo" ? "cargo" : "items";
}

function normalizedOutput(stack = {}) {
  const value = stack?.item_stack ?? stack?.itemStack ?? stack;
  const targetId = text(value?.item_id ?? value?.itemId ?? value?.target_id ?? value?.targetId ?? value?.id);
  if (!targetId) return null;
  const kind = outputKind(value?.item_type ?? value?.itemType ?? value?.kind);
  const quantity = nonNegative(value?.quantity ?? value?.amount);
  if (!(quantity > 0)) return null;
  return {
    outputKey: `${kind}:${targetId}`,
    kind,
    targetId,
    quantity,
  };
}

export function normalizeGameDataItemLists(payload) {
  return rows(payload, ["itemLists", "item_lists", "results"]).map((source) => ({
    itemListId: text(source?.id ?? source?.item_list_id ?? source?.itemListId),
    name: text(source?.name) || null,
    possibilities: rows(source?.possibilities, ["possibilities"]).map((possibility, possibilityIndex) => ({
      possibilityIndex,
      rawWeight: nonNegative(possibility?.probability ?? possibility?.weight ?? possibility?.chance),
      outputs: rows(possibility?.items, ["items", "outputs"])
        .map(normalizedOutput)
        .filter(Boolean)
        .map((output, outputIndex) => ({ ...output, outputIndex })),
    })),
  })).filter((list) => list.itemListId);
}

export function normalizeGameDataResources(payload) {
  return rows(payload, ["resources", "results"]).map((source) => {
    const resourceId = text(source?.id ?? source?.resource_id ?? source?.resourceId);
    return {
      resourceId,
      name: text(source?.name) || `Resource #${resourceId}`,
      tier: Number.isFinite(Number(source?.tier)) ? Number(source.tier) : null,
      tag: source?.tag == null ? null : text(source.tag) || null,
      maxHealth: nonNegative(source?.max_health ?? source?.maxHealth),
      completionOutputs: rows(source?.on_destroy_yield ?? source?.onDestroyYield, ["outputs", "items"])
        .map((stack) => {
          const output = normalizedOutput(stack);
          if (!output) return null;
          return {
            ...output,
            occurrenceRate: nonNegative(stack?.probability ?? stack?.chance, 1),
          };
        })
        .filter(Boolean),
    };
  }).filter((resource) => resource.resourceId);
}

function invalidList(itemListId, warning) {
  return { itemListId, valid: false, totalWeight: 0, outputs: new Map(), warnings: [warning] };
}

function validContribution(output) {
  return output && output.expectedQuantity > 0 && output.chance > 0;
}

function addConditionalContribution(map, outputKey, kind, targetId, contribution) {
  if (!validContribution(contribution)) return;
  const current = map.get(outputKey) ?? {
    outputKey,
    kind,
    targetId,
    expectedQuantity: 0,
    chance: 0,
    guaranteedQuantity: 0,
  };
  current.expectedQuantity += contribution.expectedQuantity;
  current.chance = 1 - ((1 - current.chance) * (1 - contribution.chance));
  current.guaranteedQuantity += contribution.guaranteedQuantity;
  map.set(outputKey, current);
}

export function resolveItemListProbabilities(itemLists = [], itemListIdByOutputKey = new Map(), { maxDepth = 16 } = {}) {
  const byId = new Map(itemLists.map((list) => [text(list?.itemListId), list]).filter(([id]) => id));
  const childListIds = itemListIdByOutputKey instanceof Map
    ? itemListIdByOutputKey
    : new Map(Object.entries(itemListIdByOutputKey ?? {}));
  const cache = new Map();
  const warnings = new Set();

  function resolve(itemListId, path = []) {
    const id = text(itemListId);
    if (cache.has(id)) return cache.get(id);
    if (path.includes(id)) {
      const warning = `Item-list cycle detected: ${[...path, id].join(" -> ")}.`;
      warnings.add(warning);
      return invalidList(id, warning);
    }
    if (path.length >= maxDepth) {
      const warning = `Item-list recursion limit reached while resolving ${id}.`;
      warnings.add(warning);
      return invalidList(id, warning);
    }
    const list = byId.get(id);
    if (!list) {
      const warning = `Item list ${id} is referenced but missing from the probability snapshot.`;
      warnings.add(warning);
      return invalidList(id, warning);
    }
    const possibilities = Array.isArray(list.possibilities) ? list.possibilities : [];
    const totalWeight = possibilities.reduce((sum, possibility) => sum + nonNegative(possibility?.rawWeight), 0);
    if (!(totalWeight > 0)) {
      const warning = `Item list ${id} has zero total weight and is unavailable.`;
      warnings.add(warning);
      const result = invalidList(id, warning);
      cache.set(id, result);
      return result;
    }

    let valid = true;
    const perPossibility = possibilities.map((possibility) => {
      const conditional = new Map();
      for (const output of Array.isArray(possibility?.outputs) ? possibility.outputs : []) {
        const quantity = nonNegative(output?.quantity);
        if (!(quantity > 0)) continue;
        const nestedId = text(childListIds.get(output.outputKey));
        if (!nestedId) {
          addConditionalContribution(conditional, output.outputKey, output.kind, output.targetId, {
            expectedQuantity: quantity,
            chance: 1,
            guaranteedQuantity: quantity,
          });
          continue;
        }
        const nested = resolve(nestedId, [...path, id]);
        if (!nested.valid) {
          valid = false;
          continue;
        }
        for (const nestedOutput of nested.outputs.values()) {
          addConditionalContribution(conditional, nestedOutput.outputKey, nestedOutput.kind, nestedOutput.targetId, {
            expectedQuantity: quantity * nestedOutput.expectedQuantity,
            chance: 1 - ((1 - nestedOutput.chance) ** quantity),
            guaranteedQuantity: quantity * nestedOutput.guaranteedQuantity,
          });
        }
      }
      return {
        probability: nonNegative(possibility?.rawWeight) / totalWeight,
        outputs: conditional,
      };
    });

    if (!valid) {
      const warning = `Item list ${id} depends on an invalid nested item list.`;
      warnings.add(warning);
      const result = invalidList(id, warning);
      cache.set(id, result);
      return result;
    }

    const outputKeys = new Set(perPossibility.flatMap((possibility) => [...possibility.outputs.keys()]));
    const outputs = new Map();
    for (const outputKey of outputKeys) {
      let expectedQuantity = 0;
      let chance = 0;
      let guaranteedQuantity = Number.POSITIVE_INFINITY;
      let identity = null;
      for (const possibility of perPossibility) {
        const output = possibility.outputs.get(outputKey);
        if (output) identity = output;
        expectedQuantity += possibility.probability * (output?.expectedQuantity ?? 0);
        chance += possibility.probability * (output?.chance ?? 0);
        guaranteedQuantity = Math.min(guaranteedQuantity, output?.guaranteedQuantity ?? 0);
      }
      if (!identity || !(expectedQuantity > 0)) continue;
      outputs.set(outputKey, {
        outputKey,
        kind: identity.kind,
        targetId: identity.targetId,
        expectedQuantity,
        chance: Math.min(1, chance),
        guaranteedQuantity: Number.isFinite(guaranteedQuantity) ? guaranteedQuantity : 0,
      });
    }
    const result = { itemListId: id, valid: true, totalWeight, outputs, warnings: [] };
    cache.set(id, result);
    return result;
  }

  for (const id of byId.keys()) resolve(id);
  return { lists: cache, warnings: [...warnings] };
}

export function calculateGatheringYield({
  outputQuantity = 1,
  occurrenceRate = 1,
  listExpectedQuantity = 1,
  listChance = 1,
  resourceHealth = null,
  completionQuantity = 0,
} = {}) {
  const quantity = nonNegative(outputQuantity);
  const rate = nonNegative(occurrenceRate);
  const expectedListQuantity = nonNegative(listExpectedQuantity, 1);
  const normalizedListChance = Math.min(1, nonNegative(listChance, 1));
  const health = resourceHealth == null ? null : nonNegative(resourceHealth);
  const completion = nonNegative(completionQuantity);
  const expectedPerProgress = quantity * rate * expectedListQuantity;
  const expectedPerResource = health && health > 0
    ? (expectedPerProgress * health) + completion
    : null;
  const deterministic = rate === 1 && normalizedListChance === 1 && expectedListQuantity === 1;
  return {
    yieldBasis: "per_progress",
    expectedPerProgress,
    expectedPerResource,
    resourceHealth: health,
    probabilityStatus: deterministic ? "guaranteed" : "expected",
  };
}
