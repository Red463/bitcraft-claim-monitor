export type ProfessionCurrentStatus = "ready" | "gap" | "unknown";
export type DependencyRisk = "covered" | "high" | "gap" | "unknown";
export type NextTierOutlook = "ready" | "materials-needed" | "skills-developing" | "skills-and-materials" | "skills-only" | "maximum-tier" | "unknown";

export type ProfessionCapability = {
  id: number;
  name: string;
  settlementTier: number;
  nextTier: number | null;
  currentStatus: ProfessionCurrentStatus;
  dependencyRisk: DependencyRisk;
  nextOutlook: NextTierOutlook;
  currentCapableCount: number;
  nextCapableCount: number;
  leadName: string;
  leadLevel: number;
  nextLevelGap: number;
  planCompletion: number | null;
  explanation: string;
};

export type SettlementNeed = { kind: "current-gap" | "dependency-risk" | "plan-bottleneck"; professionId: number; professionName: string; message: string; priority: number };

export function tierRequiredLevel(tier: number) {
  const normalized = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
  return normalized === 1 ? 1 : normalized * 10;
}

function normalizedPlanSection(value: unknown) {
  const section = String(value ?? "").trim().toLowerCase();
  if (section === "tailor" || section === "tailoring") return "Tailoring";
  if (section === "leatherwork" || section === "leatherworking") return "Leatherworking";
  return section ? section[0].toUpperCase() + section.slice(1) : "";
}

export function buildProfessionPlanCoverage(plan: any): Map<string, number> {
  if (!plan?.enabled || !Array.isArray(plan.targets) || !plan.targets.length || !Array.isArray(plan.materials)) return new Map();
  const totals = new Map<string, { required: number; missing: number }>();
  for (const material of plan.materials) {
    const section = normalizedPlanSection(material.section);
    const required = Math.max(0, Number(material.bufferedRequired ?? material.required) || 0);
    if (!section || required <= 0) continue;
    const current = totals.get(section) ?? { required: 0, missing: 0 };
    current.required += required;
    current.missing += Math.max(0, Math.min(required, Number(material.missing) || 0));
    totals.set(section, current);
  }
  return new Map([...totals].map(([section, value]) => [section, Math.round(Math.max(0, Math.min(1, (value.required - value.missing) / value.required)) * 100)]));
}

export function buildProfessionCapability({ id, name, settlementTier, members, planCompletion }: { id: number; name: string; settlementTier: number; members: Array<{ name: string; level: number }>; planCompletion: number | null }): ProfessionCapability {
  const tier = Math.max(0, Math.min(10, Math.floor(Number(settlementTier) || 0)));
  const sorted = [...members].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const lead = sorted[0] ?? { name: "No member", level: 0 };
  if (!tier) return { id, name, settlementTier: 0, nextTier: null, currentStatus: "unknown", dependencyRisk: "unknown", nextOutlook: "unknown", currentCapableCount: 0, nextCapableCount: 0, leadName: lead.name, leadLevel: lead.level, nextLevelGap: 0, planCompletion, explanation: "Settlement tier is unavailable, so readiness cannot be assessed." };
  const currentLevel = tierRequiredLevel(tier);
  const nextTier = tier < 10 ? tier + 1 : null;
  const nextLevel = nextTier ? tierRequiredLevel(nextTier) : currentLevel;
  const currentCapableCount = sorted.filter((member) => member.level >= currentLevel).length;
  const nextCapableCount = nextTier ? sorted.filter((member) => member.level >= nextLevel).length : currentCapableCount;
  const currentStatus: ProfessionCurrentStatus = currentCapableCount ? "ready" : "gap";
  const dependencyRisk: DependencyRisk = currentCapableCount === 0 ? "gap" : currentCapableCount === 1 ? "high" : "covered";
  let nextOutlook: NextTierOutlook;
  if (!nextTier) nextOutlook = "maximum-tier";
  else if (planCompletion == null) nextOutlook = "skills-only";
  else if (nextCapableCount && planCompletion >= 100) nextOutlook = "ready";
  else if (nextCapableCount) nextOutlook = "materials-needed";
  else if (planCompletion >= 100) nextOutlook = "skills-developing";
  else nextOutlook = "skills-and-materials";
  const nextLevelGap = nextTier ? Math.max(0, nextLevel - lead.level) : 0;
  let explanation = currentCapableCount === 0
    ? `${lead.name} leads at Lv ${lead.level} and needs ${Math.max(0, currentLevel - lead.level)} levels for T${tier}.`
    : currentCapableCount === 1
      ? `Ready for T${tier}, but relies on ${sorted.find((member) => member.level >= currentLevel)?.name ?? lead.name}.`
      : `Strong T${tier} coverage with ${currentCapableCount} members ready.`;
  if (nextTier && nextLevelGap > 0) explanation += ` Lead member needs ${nextLevelGap} levels for T${nextTier}.`;
  if (planCompletion != null && planCompletion < 100) explanation += ` Active plan is ${planCompletion}% covered.`;
  return { id, name, settlementTier: tier, nextTier, currentStatus, dependencyRisk, nextOutlook, currentCapableCount, nextCapableCount, leadName: lead.name, leadLevel: lead.level, nextLevelGap, planCompletion, explanation };
}

export function prioritizeSettlementNeeds(rows: ProfessionCapability[]): SettlementNeed[] {
  const currentGaps = rows.filter((row) => row.currentStatus === "gap").map((row) => ({ kind: "current-gap" as const, professionId: row.id, professionName: row.name, message: row.explanation, priority: 0 }));
  const dependencies = rows.filter((row) => row.dependencyRisk === "high").map((row) => ({ kind: "dependency-risk" as const, professionId: row.id, professionName: row.name, message: row.explanation, priority: 1 }));
  const bottlenecks = rows.filter((row) => row.currentStatus === "ready" && row.dependencyRisk !== "high" && row.planCompletion != null && row.planCompletion < 100).sort((a, b) => (a.planCompletion ?? 100) - (b.planCompletion ?? 100)).map((row) => ({ kind: "plan-bottleneck" as const, professionId: row.id, professionName: row.name, message: `${row.name} active plan is ${row.planCompletion}% covered.`, priority: 2 }));
  return [...currentGaps, ...dependencies, ...bottlenecks].slice(0, 6);
}
