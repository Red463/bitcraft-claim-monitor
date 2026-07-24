import { createHash } from "node:crypto";

const AUDIT_RETENTION_DAYS = 14;
const SENSITIVE_KEYS = /^(authorization|cookie|cookies|password|secret|session|token)$/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return String(value ?? "").trim();
}

function sanitized(value) {
  if (Array.isArray(value)) return value.map(sanitized);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.test(key))
      .map(([key, entry]) => [key, sanitized(entry)]),
  );
}

function sortedStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort();
}

function normalizeTargets(value) {
  return (Array.isArray(value) ? value : []).map((target) => ({
    id: text(target?.id),
    kind: text(target?.kind || "items"),
    quantity: number(target?.quantity),
    ...(text(target?.name) ? { name: text(target.name) } : {}),
  })).sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function normalizeMultipliers(value, { semantic = false } = {}) {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, row]) => [
    text(key),
    semantic
      ? number(row?.multiplier ?? row)
      : {
        multiplier: number(row?.multiplier ?? row),
        ...(text(row?.note) ? { note: text(row.note) } : {}),
      },
  ]).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeSourceRules(value = {}) {
  return {
    storageContainerIds: sortedStrings(value.storageContainerIds),
    playerIds: sortedStrings(value.playerIds),
    craftPlayerIds: sortedStrings(value.craftPlayerIds),
    bankPlayerIds: sortedStrings(value.bankPlayerIds),
    deployableContainerIds: sortedStrings(value.deployableContainerIds),
  };
}

function normalizePlanInputs(config = {}) {
  return {
    targets: normalizeTargets(config.targets),
    routeOverrides: stable(sanitized(config.routeOverrides ?? {})),
    gatheredItemKeys: sortedStrings(config.gatheredItemKeys),
    multipliers: normalizeMultipliers(config.multipliers),
    sourceRules: normalizeSourceRules(config.sourceRules),
    buildingProgress: stable(sanitized(config.buildingProgress ?? {})),
  };
}

function normalizeBaselineInputs(config = {}, metadata = {}) {
  return {
    config: {
      targets: normalizeTargets(config.targets).map(({ name, ...target }) => target),
      routeOverrides: stable(sanitized(config.routeOverrides ?? {})),
      gatheredItemKeys: sortedStrings(config.gatheredItemKeys),
      multipliers: normalizeMultipliers(config.multipliers, { semantic: true }),
    },
    catalogRevision: text(metadata.catalogRevision),
    modelVersion: number(metadata.modelVersion),
  };
}

function normalizeStockSource(source = {}) {
  return {
    sourceId: text(source.sourceId ?? source.id),
    label: text(source.label ?? source.name),
    type: text(source.type ?? source.sourceType),
    quantity: number(source.quantity),
    ...(text(source.playerId) ? { playerId: text(source.playerId) } : {}),
    ...(text(source.playerName) ? { playerName: text(source.playerName) } : {}),
  };
}

function normalizeCraftSource(source = {}) {
  return {
    craftId: text(source.craftId ?? source.sourceId ?? source.id),
    playerId: text(source.playerId),
    playerName: text(source.playerName),
    buildingId: text(source.buildingId),
    buildingName: text(source.buildingName ?? source.stationName),
    status: text(source.status ?? source.state),
    quantity: number(source.quantity),
    directQuantity: number(source.directQuantity ?? source.outputQuantity),
    guaranteedQuantity: number(source.guaranteedQuantity),
    estimatedQuantity: number(source.estimatedQuantity ?? source.quantity),
  };
}

function sourceSortKey(source) {
  return `${source.type}\u0000${source.sourceId}\u0000${source.playerId ?? ""}`;
}

function craftSortKey(source) {
  return `${source.craftId}\u0000${source.playerId}\u0000${source.buildingId}`;
}

function weightFor(weights, key) {
  if (!(weights instanceof Map)) return 1;
  const row = weights.get(key);
  const parsed = number(row?.effortWeight ?? row);
  return parsed > 0 ? parsed : 1;
}

function normalizeEffortProgress(progress = {}) {
  return sanitized(progress);
}

export function buildCraftPlanProgressSnapshot({
  claimId,
  plan = {},
  metadata = {},
  sourceStatus = [],
  weights = new Map(),
} = {}) {
  const config = plan.config ?? {};
  const effortProgress = normalizeEffortProgress(plan.effortProgress ?? {});
  const planInputs = normalizePlanInputs(config);
  const baselineInputs = normalizeBaselineInputs(config, {
    catalogRevision: metadata.catalogRevision,
    modelVersion: metadata.modelVersion ?? effortProgress.modelVersion,
  });
  const materials = (Array.isArray(plan.materials) ? plan.materials : []).map((material) => {
    const key = text(material?.key);
    return {
      key,
      name: text(material?.name ?? material?.label),
      required: number(material?.bufferedRequired ?? material?.required),
      missing: number(material?.missing),
      available: number(material?.available),
      guaranteedInProgress: number(material?.guaranteedInProgress ?? material?.guaranteedActiveOutput),
      estimatedInProgress: number(material?.estimatedInProgress ?? material?.estimatedActiveOutput),
      effortWeight: weightFor(weights, key),
      sources: (Array.isArray(material?.sources) ? material.sources : [])
        .map(normalizeStockSource)
        .sort((left, right) => sourceSortKey(left).localeCompare(sourceSortKey(right))),
      activeCraftSources: (Array.isArray(material?.activeCraftSources) ? material.activeCraftSources : [])
        .map(normalizeCraftSource)
        .sort((left, right) => craftSortKey(left).localeCompare(craftSortKey(right))),
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
  const normalizedSourceStatus = (Array.isArray(sourceStatus) ? sourceStatus : []).map((source) => ({
    sourceId: text(source?.sourceId ?? source?.id),
    label: text(source?.label ?? source?.name),
    type: text(source?.type ?? source?.sourceType),
    available: source?.available === true,
    ...(text(source?.error) ? { error: text(source.error).slice(0, 300) } : {}),
  })).sort((left, right) => sourceSortKey(left).localeCompare(sourceSortKey(right)));
  const baselineRevision = text(effortProgress.baselineRevision);
  return {
    schemaVersion: 1,
    claimId: text(claimId),
    capturedAt: text(metadata.capturedAt || new Date().toISOString()),
    baselineRevision,
    baselineInputs,
    planInputs,
    planConfigFingerprint: hash(planInputs),
    progress: {
      confirmed: number(effortProgress?.confirmed?.overall?.completion ?? effortProgress?.overall?.completion),
      projected: number(effortProgress?.projected?.overall?.completion ?? effortProgress?.overall?.completion),
    },
    effortProgress,
    materials,
    sourceStatus: normalizedSourceStatus,
    metadata: {
      appVersion: text(metadata.appVersion),
      buildId: text(metadata.buildId),
      catalogRevision: text(metadata.catalogRevision),
      modelVersion: number(metadata.modelVersion ?? effortProgress.modelVersion),
    },
  };
}

export function craftPlanProgressFingerprint(snapshot = {}) {
  const { capturedAt, ...content } = snapshot;
  return hash(content);
}

function materialMap(snapshot) {
  return new Map((snapshot?.materials ?? []).map((material) => [material.key, material]));
}

function stockMap(material) {
  return new Map((material?.sources ?? []).map((source) => [sourceSortKey(source), source]));
}

function craftMap(material) {
  return new Map((material?.activeCraftSources ?? []).map((source) => [craftSortKey(source), source]));
}

function baselineChangeReasons(previous = {}, current = {}) {
  const reasons = [];
  const before = previous.baselineInputs ?? {};
  const after = current.baselineInputs ?? {};
  const beforeConfig = before.config ?? {};
  const afterConfig = after.config ?? {};
  if (JSON.stringify(stable(beforeConfig.targets)) !== JSON.stringify(stable(afterConfig.targets))) reasons.push("Targets or target quantities changed");
  if (JSON.stringify(stable(beforeConfig.routeOverrides)) !== JSON.stringify(stable(afterConfig.routeOverrides))) reasons.push("Selected routes changed");
  if (JSON.stringify(stable(beforeConfig.gatheredItemKeys)) !== JSON.stringify(stable(afterConfig.gatheredItemKeys))) reasons.push("Gathered overrides changed");
  if (JSON.stringify(stable(beforeConfig.multipliers)) !== JSON.stringify(stable(afterConfig.multipliers))) reasons.push("Safety buffers or material multipliers changed");
  if (text(before.catalogRevision) !== text(after.catalogRevision)) reasons.push("Catalogue revision changed");
  if (number(before.modelVersion) !== number(after.modelVersion)) reasons.push("Probability or effort model version changed");
  return reasons.length ? reasons : ["Plan baseline inputs changed"];
}

function effortContributors(previous, current) {
  const before = materialMap(previous);
  const after = materialMap(current);
  return [...new Set([...before.keys(), ...after.keys()])].map((key) => {
    const previousMaterial = before.get(key);
    const currentMaterial = after.get(key);
    const weight = number(currentMaterial?.effortWeight ?? previousMaterial?.effortWeight) || 1;
    const delta = (number(currentMaterial?.missing) - number(previousMaterial?.missing)) * weight;
    return {
      itemKey: key,
      name: text(currentMaterial?.name ?? previousMaterial?.name),
      remainingEffortDelta: delta,
    };
  }).filter((row) => row.remainingEffortDelta !== 0)
    .sort((left, right) => Math.abs(right.remainingEffortDelta) - Math.abs(left.remainingEffortDelta))
    .slice(0, 20);
}

function valueDeltaEvent(type, itemKey, before, after, field) {
  const previousValue = number(before?.[field]);
  const currentValue = number(after?.[field]);
  if (previousValue === currentValue) return null;
  return {
    type,
    itemKey,
    before: previousValue,
    after: currentValue,
    delta: currentValue - previousValue,
  };
}

export function diffCraftPlanProgressSnapshots(previous = {}, current = {}) {
  const events = [];
  const baselineChanged = text(previous.baselineRevision) !== text(current.baselineRevision);
  let baselineChange = null;
  if (baselineChanged) {
    const reasons = baselineChangeReasons(previous, current);
    baselineChange = {
      previousRevision: text(previous.baselineRevision),
      revision: text(current.baselineRevision),
      changedAt: text(current.capturedAt),
      reasons,
    };
    events.push({
      type: "baseline_change",
      ...baselineChange,
      beforeProgress: sanitized(previous.progress ?? {}),
      afterProgress: sanitized(current.progress ?? {}),
    });
  } else {
    const confirmedDelta = number(current?.progress?.confirmed) - number(previous?.progress?.confirmed);
    const projectedDelta = number(current?.progress?.projected) - number(previous?.progress?.projected);
    if (confirmedDelta !== 0 || projectedDelta !== 0) {
      events.push({
        type: "progress_delta",
        confirmedBefore: number(previous?.progress?.confirmed),
        confirmedAfter: number(current?.progress?.confirmed),
        confirmedDelta,
        projectedBefore: number(previous?.progress?.projected),
        projectedAfter: number(current?.progress?.projected),
        projectedDelta,
        contributors: effortContributors(previous, current),
      });
    }
  }

  const beforeMaterials = materialMap(previous);
  const afterMaterials = materialMap(current);
  for (const itemKey of [...new Set([...beforeMaterials.keys(), ...afterMaterials.keys()])].sort()) {
    const before = beforeMaterials.get(itemKey);
    const after = afterMaterials.get(itemKey);
    for (const [type, field] of [
      ["requirement_delta", "required"],
      ["guaranteed_output_delta", "guaranteedInProgress"],
      ["estimated_output_delta", "estimatedInProgress"],
      ["missing_quantity_delta", "missing"],
    ]) {
      const event = valueDeltaEvent(type, itemKey, before, after, field);
      if (event) events.push(event);
    }

    const beforeStock = stockMap(before);
    const afterStock = stockMap(after);
    let matchingStockIncrease = 0;
    for (const key of [...new Set([...beforeStock.keys(), ...afterStock.keys()])].sort()) {
      const oldSource = beforeStock.get(key);
      const newSource = afterStock.get(key);
      const delta = number(newSource?.quantity) - number(oldSource?.quantity);
      if (delta > 0) matchingStockIncrease += delta;
      if (delta !== 0 || !oldSource || !newSource) {
        events.push({
          type: !oldSource ? "stock_source_added" : !newSource ? "stock_source_removed" : "stock_delta",
          itemKey,
          sourceId: text(newSource?.sourceId ?? oldSource?.sourceId),
          label: text(newSource?.label ?? oldSource?.label),
          sourceType: text(newSource?.type ?? oldSource?.type),
          before: number(oldSource?.quantity),
          after: number(newSource?.quantity),
          delta,
        });
      }
    }

    const beforeCrafts = craftMap(before);
    const afterCrafts = craftMap(after);
    for (const key of [...new Set([...beforeCrafts.keys(), ...afterCrafts.keys()])].sort()) {
      const oldCraft = beforeCrafts.get(key);
      const newCraft = afterCrafts.get(key);
      if (!oldCraft && newCraft) {
        events.push({ type: "craft_added", itemKey, ...newCraft });
      } else if (oldCraft && !newCraft) {
        events.push({
          type: "craft_removed",
          itemKey,
          ...oldCraft,
          ...(matchingStockIncrease > 0 ? {
            inference: {
              cause: "collected",
              confidence: "medium",
              evidence: [`Matching stock increased by ${matchingStockIncrease}`],
            },
          } : {}),
        });
      } else if (JSON.stringify(stable(oldCraft)) !== JSON.stringify(stable(newCraft))) {
        events.push({ type: "craft_changed", itemKey, before: oldCraft, after: newCraft });
      }
    }
  }

  const beforeRules = previous?.planInputs?.sourceRules ?? {};
  const afterRules = current?.planInputs?.sourceRules ?? {};
  for (const rule of Object.keys({ ...beforeRules, ...afterRules }).sort()) {
    const beforeIds = new Set(beforeRules[rule] ?? []);
    const afterIds = new Set(afterRules[rule] ?? []);
    for (const sourceId of [...new Set([...beforeIds, ...afterIds])].sort()) {
      if (beforeIds.has(sourceId) === afterIds.has(sourceId)) continue;
      events.push({
        type: afterIds.has(sourceId) ? "source_configured" : "source_unconfigured",
        sourceRule: rule,
        sourceId,
      });
    }
  }

  const statusKey = (source) => `${text(source?.type)}\u0000${text(source?.sourceId)}`;
  const beforeStatuses = new Map((previous?.sourceStatus ?? []).map((source) => [statusKey(source), source]));
  const afterStatuses = new Map((current?.sourceStatus ?? []).map((source) => [statusKey(source), source]));
  for (const key of [...new Set([...beforeStatuses.keys(), ...afterStatuses.keys()])].sort()) {
    const before = beforeStatuses.get(key);
    const after = afterStatuses.get(key);
    if (before?.available === after?.available && Boolean(before) === Boolean(after)) continue;
    events.push({
      type: !after ? "source_removed" : after.available ? "source_restored" : "source_unavailable",
      sourceId: text(after?.sourceId ?? before?.sourceId),
      label: text(after?.label ?? before?.label),
      sourceType: text(after?.type ?? before?.type),
    });
  }

  if (JSON.stringify(stable(previous?.planInputs?.buildingProgress ?? {}))
    !== JSON.stringify(stable(current?.planInputs?.buildingProgress ?? {}))) {
    events.push({
      type: "building_progress_changed",
      before: sanitized(previous?.planInputs?.buildingProgress ?? {}),
      after: sanitized(current?.planInputs?.buildingProgress ?? {}),
    });
  }

  return { events, baselineChanged, baselineChange };
}

export function staleCraftPlanProgress(lastSuccess = {}, failures = [], now = new Date().toISOString()) {
  return {
    ...sanitized(lastSuccess),
    stale: true,
    staleSince: text(now),
    unavailableSources: (Array.isArray(failures) ? failures : []).map((failure) => ({
      sourceId: text(failure?.sourceId),
      label: text(failure?.label ?? failure?.sourceId ?? "Unknown source"),
      type: text(failure?.type || "Planner source"),
      error: text(failure?.error || "Refresh failed").slice(0, 300),
    })),
    warnings: [...new Set([
      ...(Array.isArray(lastSuccess?.warnings) ? lastSuccess.warnings : []),
      "Planner progress is showing the last complete refresh because one or more counted sources are unavailable.",
    ])],
  };
}

export function normalizeCraftPlanAuditRange(value, now = new Date().toISOString()) {
  const label = text(value || "3d").toLowerCase();
  const durations = { "24h": 24, "3d": 72, "7d": 168, all: AUDIT_RETENTION_DAYS * 24 };
  if (!(label in durations)) throw new Error("Invalid audit range. Use 24h, 3d, 7d, or all.");
  const timestamp = new Date(now);
  if (Number.isNaN(timestamp.getTime())) throw new Error("Invalid audit range timestamp.");
  return {
    label,
    since: new Date(timestamp.getTime() - durations[label] * 60 * 60 * 1000).toISOString(),
  };
}
