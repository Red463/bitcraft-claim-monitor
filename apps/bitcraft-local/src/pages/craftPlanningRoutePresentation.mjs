function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positive(value) {
  return Math.max(0, number(value));
}

function text(value) {
  return String(value ?? "").trim();
}

function itemName(item) {
  return text(item?.name ?? item?.label ?? item?.id) || "Output";
}

function stationName(route) {
  return text(route?.buildingName ?? route?.building_name ?? route?.stationName ?? route?.station_name);
}

function routeName(route) {
  return text(route?.label ?? route?.name ?? route?.recipeName ?? route?.id);
}

function isGatheringRoute(route) {
  return text(route?.routeType).startsWith("gathering");
}

function isByproductRoute(route) {
  return text(route?.routeType).endsWith("-byproduct");
}

function isGenericRecipeName(value) {
  return /^Recipe(?:\s*->|$)/i.test(text(value));
}

function gatheringSourceName(route) {
  const sources = [...new Set((Array.isArray(route?.gatheringSources) ? route.gatheringSources : [])
    .map((source) => text(source?.label ?? source?.name ?? source?.tag))
    .filter(Boolean))];
  if (sources.length === 1) return sources[0];
  if (sources.length > 1) return `${sources.slice(0, -1).join(", ")} or ${sources.at(-1)}`;
  return text(route?.gatheringSource?.label ?? route?.gatheringSource?.name ?? route?.producer?.tag ?? route?.producer?.name) || "resource node";
}

function inputNames(route) {
  return (Array.isArray(route?.inputs) ? route.inputs : [])
    .map(itemName)
    .filter((value) => value && value !== "Output");
}

function withStation(label, route) {
  const station = stationName(route);
  if (!station || label.toLocaleLowerCase().includes(station.toLocaleLowerCase())) return label;
  return `${label} at ${station}`;
}

export function acquisitionRouteKind(route) {
  if (route?.isTransportRoute === true) return "Logistics";
  if (isGatheringRoute(route) && route?.gatheringMode === "prospecting") return "Prospecting";
  if (isGatheringRoute(route)) return isByproductRoute(route) ? "Gathering byproduct" : "Gathering";
  return isByproductRoute(route) ? "Craft byproduct" : "Crafting";
}

export function acquisitionRouteLabel(route, output = {}) {
  const label = routeName(route);
  if (route?.isTransportRoute === true && label && !isGenericRecipeName(label)) return withStation(label, route);

  if (isGatheringRoute(route)) {
    const source = gatheringSourceName(route);
    if (route?.gatheringMode === "prospecting") return `Prospect at ${source}`;
    if (isByproductRoute(route)) {
      const producer = text(route?.producer?.name ?? route?.producer?.label);
      return producer
        ? `Gather byproduct from ${source} while collecting ${producer}`
        : `Gather byproduct from ${source}`;
    }
    return `Gather from ${source}`;
  }

  if (label && !isGenericRecipeName(label)) return withStation(label, route);
  const inputs = inputNames(route);
  const outputName = itemName(output);
  if (inputs.length) return withStation(`${inputs.join(" + ")} -> ${outputName}`, route);
  return withStation(label || `Produce ${outputName}`, route);
}

export function acquisitionRouteMetrics(route, options = {}) {
  if (route?.probabilityStatus === "unavailable") return { status: "unavailable" };

  const needed = positive(options.missingQuantity);
  const probabilistic = route?.probabilityStatus === "expected" || route?.isProbabilistic === true;
  const multiplier = probabilistic ? Math.max(1, number(options.multiplier) || 1) : 1;
  const bufferedNeed = needed * multiplier;
  const expectedPerProgress = positive(route?.expectedPerProgress ?? (isGatheringRoute(route) ? route?.expectedYield : 0));

  if (isGatheringRoute(route)) {
    if (route?.gatheringMode !== "prospecting") {
      const expectedPerNode = positive(route?.expectedPerResource);
      const resourceHealth = positive(route?.resourceHealth);
      if (expectedPerNode > 0 && resourceHealth > 0) {
        const exactUnits = bufferedNeed / expectedPerNode;
        return {
          status: "available",
          basis: "node",
          expectedPerUnit: expectedPerNode,
          exactUnits,
          plannedUnits: Math.ceil(exactUnits),
          totalProgress: Math.ceil(exactUnits * resourceHealth),
          progressPerExpectedItem: expectedPerProgress > 0 ? 1 / expectedPerProgress : null,
          totalActions: null,
        };
      }
    }

    if (expectedPerProgress <= 0) return { status: "unavailable" };
    const exactUnits = bufferedNeed / expectedPerProgress;
    return {
      status: "available",
      basis: "progress",
      expectedPerUnit: expectedPerProgress,
      exactUnits,
      plannedUnits: Math.ceil(exactUnits),
      totalProgress: Math.ceil(exactUnits),
      progressPerExpectedItem: 1 / expectedPerProgress,
      totalActions: null,
    };
  }

  const expectedPerCraft = positive(route?.expectedPerCraft ?? route?.expectedYield ?? route?.guaranteedYield);
  if (expectedPerCraft <= 0) return { status: "unavailable" };
  const exactUnits = bufferedNeed / expectedPerCraft;
  const plannedUnits = Math.ceil(exactUnits);
  return {
    status: "available",
    basis: "craft",
    expectedPerUnit: expectedPerCraft,
    exactUnits,
    plannedUnits,
    totalProgress: null,
    progressPerExpectedItem: null,
    totalActions: plannedUnits * Math.max(1, positive(route?.actionsRequired) || 1),
  };
}

export function formatProbabilityRate(value) {
  const rate = number(value);
  if (rate === 0) return "0";
  if (Math.abs(rate) < 0.000001) return rate.toExponential(2).replace(/\.0+e/, "e");
  return rate.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
