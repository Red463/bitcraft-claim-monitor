type CatalogTechnology = {
  id?: unknown;
  requirements?: unknown;
  [key: string]: unknown;
};

type ResearchState = {
  claimId?: unknown;
  learnedTechIds?: unknown;
  researchingTechId?: unknown;
  researchStartedAt?: unknown;
  scheduledId?: unknown;
  [key: string]: unknown;
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError(`${label} must be a non-negative decimal integer`);
  }
  return normalized;
}

function decimalIntegerList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => decimalInteger(entry, label));
}

export function enrichResearchWithCatalog(
  stateValue: unknown,
  catalogValue: unknown,
) {
  const state = stateValue && typeof stateValue === "object" && !Array.isArray(stateValue)
    ? stateValue as ResearchState
    : {};
  const catalog = Array.isArray(catalogValue) ? catalogValue as CatalogTechnology[] : [];
  const learnedTechIds = decimalIntegerList(
    state.learnedTechIds,
    "learned research technology id",
  );
  const learned = new Set(learnedTechIds);
  const researchingTechId = state.researchingTechId == null
    ? null
    : decimalInteger(state.researchingTechId, "current research technology id");
  const catalogIds = new Set(
    catalog.map((technology) => decimalInteger(technology.id, "catalog research technology id")),
  );
  const warnings: string[] = [];
  for (const id of learnedTechIds) {
    if (!catalogIds.has(id)) {
      warnings.push(`Research state references learned technology ${id} missing from the global catalog.`);
    }
  }
  if (researchingTechId != null && !catalogIds.has(researchingTechId)) {
    warnings.push(
      `Research state references current technology ${researchingTechId} missing from the global catalog.`,
    );
  }
  const technologies = catalog.map((technology) => {
    const id = decimalInteger(technology.id, "catalog research technology id");
    const requirements = decimalIntegerList(
      technology.requirements,
      `research technology ${id} requirement id`,
    );
    const missingRequirementIds = requirements.filter((requiredId) => !learned.has(requiredId));
    const isResearched = learned.has(id);
    const isResearching = !isResearched && researchingTechId === id;
    const isAvailable = !isResearched && !isResearching && missingRequirementIds.length === 0;
    const researchState = isResearched
      ? "researched"
      : isResearching
        ? "researching"
        : isAvailable
          ? "available"
          : "locked";
    return {
      ...technology,
      id,
      entityId: id,
      requirements,
      state: researchState,
      isResearched,
      isResearching,
      isAvailable,
      missingRequirementIds,
      ...(isResearching ? {
        researchStartedAt: state.researchStartedAt == null
          ? null
          : String(state.researchStartedAt),
        scheduledId: state.scheduledId == null ? null : String(state.scheduledId),
      } : {}),
    };
  });
  return {
    data: {
      ...state,
      claimId: decimalInteger(state.claimId, "research claim id"),
      learnedTechIds,
      researchingTechId,
      researchStartedAt: state.researchStartedAt == null ? null : String(state.researchStartedAt),
      scheduledId: state.scheduledId == null ? null : String(state.scheduledId),
      technologies,
    },
    warnings,
  };
}
