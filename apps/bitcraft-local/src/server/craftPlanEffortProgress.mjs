export const CRAFT_PLAN_EFFORT_MODEL_VERSION = 1;

const MAX_MISSING_WEIGHT_KEYS = 25;

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function effortCandidate(method, {
  catalogKey,
  sourceKey,
  actionsRequired,
  outputQuantity,
  probability = 1,
} = {}) {
  const actions = positive(actionsRequired);
  const quantity = positive(outputQuantity);
  const chance = positive(probability);
  const key = String(catalogKey ?? "").trim();
  if (!key || !actions || !quantity || !chance || chance > 1) return null;
  const effortWeight = actions / (quantity * chance);
  return Number.isFinite(effortWeight) && effortWeight > 0
    ? {
      catalogKey: key,
      sourceKey: String(sourceKey ?? "").trim(),
      method,
      effortWeight,
    }
    : null;
}

export function craftingEffortCandidate(input = {}) {
  return effortCandidate("crafting", input);
}

export function gatheringEffortCandidate(input = {}) {
  return effortCandidate("gathering", { ...input, actionsRequired: 1 });
}

export function selectLowestEffortWeights(candidates = []) {
  const weights = new Map();
  for (const row of candidates) {
    const catalogKey = String(row?.catalogKey ?? "").trim();
    const effortWeight = positive(row?.effortWeight);
    if (!catalogKey || !effortWeight) continue;
    const current = weights.get(catalogKey);
    if (!current || effortWeight < current.effortWeight) {
      weights.set(catalogKey, { ...row, catalogKey, effortWeight });
    }
  }
  return weights;
}

function materialKey(material = {}) {
  return String(material.key ?? "").trim();
}

function materialRequired(material = {}) {
  return nonNegative(material.bufferedRequired ?? material.required);
}

export function projectCraftPlanEffortMaterials(plan = {}) {
  const projected = new Map();
  for (const material of Array.isArray(plan?.materials) ? plan.materials : []) {
    const key = materialKey(material);
    const required = materialRequired(material);
    if (!key || required <= 0) continue;
    const section = String(material.section ?? material.apiSection ?? "Other").trim() || "Other";
    const current = projected.get(key);
    if (current) {
      current.required += required;
      current.missing += Math.min(required, nonNegative(material.missing));
      continue;
    }
    projected.set(key, {
      key,
      section,
      required,
      missing: Math.min(required, nonNegative(material.missing)),
    });
  }
  return [...projected.values()];
}

function roundedCompletion(baselineEffort, remainingEffort) {
  if (baselineEffort <= 0) return 100;
  const completion = Math.round((1 - remainingEffort / baselineEffort) * 1000) / 10;
  return Math.min(100, Math.max(0, completion));
}

function readyAggregate(rows) {
  const baselineEffort = rows.reduce((sum, row) => sum + row.baselineEffort, 0);
  const remainingEffort = Math.min(
    baselineEffort,
    rows.reduce((sum, row) => sum + row.remainingEffort, 0),
  );
  return {
    state: "ready",
    baselineEffort,
    remainingEffort,
    completion: roundedCompletion(baselineEffort, remainingEffort),
  };
}

function unavailableAggregate() {
  return {
    state: "unavailable",
    baselineEffort: null,
    remainingEffort: null,
    completion: null,
  };
}

export function calculateCraftPlanEffortProgress({
  baselinePlan = {},
  currentPlan = {},
  weights = new Map(),
} = {}) {
  const baseline = projectCraftPlanEffortMaterials(baselinePlan);
  if (!baseline.length) {
    return {
      modelVersion: CRAFT_PLAN_EFFORT_MODEL_VERSION,
      state: "empty",
      overall: { state: "empty", baselineEffort: 0, remainingEffort: 0, completion: 100 },
      sections: {},
      fishingVariants: {},
      coverage: {
        weightedRequiredMaterials: 0,
        totalRequiredMaterials: 0,
        missingWeightCount: 0,
        missingWeightKeys: [],
      },
      warnings: [],
    };
  }

  const current = new Map(projectCraftPlanEffortMaterials(currentPlan).map((row) => [row.key, row]));
  const sectionRows = new Map();
  const missingBySection = new Map();
  const missingWeights = new Set();
  let weightedRequiredMaterials = 0;

  for (const row of baseline) {
    const weight = positive(weights instanceof Map ? weights.get(row.key)?.effortWeight ?? weights.get(row.key) : null);
    if (!weight) {
      missingWeights.add(row.key);
      const sectionMissing = missingBySection.get(row.section) ?? new Set();
      sectionMissing.add(row.key);
      missingBySection.set(row.section, sectionMissing);
      continue;
    }
    weightedRequiredMaterials += 1;
    const liveMissing = Math.min(row.required, nonNegative(current.get(row.key)?.missing ?? row.required));
    const entries = sectionRows.get(row.section) ?? [];
    entries.push({
      baselineEffort: row.required * weight,
      remainingEffort: liveMissing * weight,
    });
    sectionRows.set(row.section, entries);
  }

  const sectionNames = new Set([...sectionRows.keys(), ...missingBySection.keys()]);
  const sections = {};
  for (const section of sectionNames) {
    sections[section] = missingBySection.get(section)?.size
      ? unavailableAggregate()
      : readyAggregate(sectionRows.get(section) ?? []);
  }

  const overall = missingWeights.size
    ? unavailableAggregate()
    : readyAggregate([...sectionRows.values()].flat());
  const state = missingWeights.size
    ? weightedRequiredMaterials > 0 ? "partial" : "unavailable"
    : "ready";
  const missingWeightKeys = [...missingWeights].sort();
  return {
    modelVersion: CRAFT_PLAN_EFFORT_MODEL_VERSION,
    state,
    overall,
    sections,
    fishingVariants: {},
    coverage: {
      weightedRequiredMaterials,
      totalRequiredMaterials: baseline.length,
      missingWeightCount: missingWeightKeys.length,
      missingWeightKeys: missingWeightKeys.slice(0, MAX_MISSING_WEIGHT_KEYS),
    },
    warnings: missingWeightKeys.length
      ? [`Effort progress is missing verified catalog weights for ${missingWeightKeys.length} required material${missingWeightKeys.length === 1 ? "" : "s"}.`]
      : [],
  };
}
