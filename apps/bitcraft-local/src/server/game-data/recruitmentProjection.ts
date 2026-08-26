type CatalogSkill = {
  id?: unknown;
  [key: string]: unknown;
};

type RecruitmentPosting = {
  entityId?: unknown;
  requiredSkillId?: unknown;
  [key: string]: unknown;
};

type RecruitmentState = {
  recruitment?: unknown;
  [key: string]: unknown;
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError(`${label} must be a non-negative decimal integer`);
  }
  return normalized;
}

export function enrichRecruitmentWithCatalog(
  stateValue: unknown,
  catalogValue: unknown,
) {
  const state = stateValue && typeof stateValue === "object" && !Array.isArray(stateValue)
    ? stateValue as RecruitmentState
    : {};
  const catalog = Array.isArray(catalogValue) ? catalogValue as CatalogSkill[] : [];
  const skills = new Map(catalog.map((skill) => [
    decimalInteger(skill.id, "catalog recruitment skill id"),
    skill,
  ]));
  const warnings: string[] = [];
  const recruitment = (Array.isArray(state.recruitment)
    ? state.recruitment as RecruitmentPosting[]
    : []).map((posting) => {
      const entityId = decimalInteger(posting.entityId, "recruitment posting id");
      const requiredSkillId = decimalInteger(
        posting.requiredSkillId,
        `recruitment posting ${entityId} required skill id`,
      );
      const requiredSkill = skills.get(requiredSkillId) ?? null;
      if (!requiredSkill) {
        warnings.push(
          `Recruitment posting ${entityId} references skill ${requiredSkillId} missing from the global catalog.`,
        );
      }
      return {
        ...posting,
        entityId,
        requiredSkillId,
        requiredSkill,
      };
    });
  return {
    data: {
      ...state,
      recruitment,
    },
    warnings,
  };
}
