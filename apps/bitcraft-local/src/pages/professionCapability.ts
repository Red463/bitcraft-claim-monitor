export type ProfessionCurrentStatus = "ready" | "gap" | "unknown";
export type DependencyRisk = "covered" | "high" | "gap" | "unknown";
export type NextTierOutlook = "ready" | "developing" | "maximum-tier" | "unknown";

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
  explanation: string;
};

export type SettlementNeed = { kind: "next-gap" | "next-dependency"; professionId: number; professionName: string; message: string; priority: number };

export function tierRequiredLevel(tier: number) {
  const normalized = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
  return normalized === 1 ? 1 : normalized * 10;
}

export function buildProfessionCapability({ id, name, settlementTier, members }: { id: number; name: string; settlementTier: number; members: Array<{ name: string; level: number }> }): ProfessionCapability {
  const tier = Math.max(0, Math.min(10, Math.floor(Number(settlementTier) || 0)));
  const sorted = [...members].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const lead = sorted[0] ?? { name: "No member", level: 0 };
  if (!tier) return { id, name, settlementTier: 0, nextTier: null, currentStatus: "unknown", dependencyRisk: "unknown", nextOutlook: "unknown", currentCapableCount: 0, nextCapableCount: 0, leadName: lead.name, leadLevel: lead.level, nextLevelGap: 0, explanation: "Settlement tier is unavailable, so readiness cannot be assessed." };
  const currentLevel = tierRequiredLevel(tier);
  const nextTier = tier < 10 ? tier + 1 : null;
  const nextLevel = nextTier ? tierRequiredLevel(nextTier) : currentLevel;
  const currentCapableCount = sorted.filter((member) => member.level >= currentLevel).length;
  const nextCapableCount = nextTier ? sorted.filter((member) => member.level >= nextLevel).length : currentCapableCount;
  const currentStatus: ProfessionCurrentStatus = currentCapableCount ? "ready" : "gap";
  const dependencyRisk: DependencyRisk = !nextTier ? "covered" : nextCapableCount === 0 ? "gap" : nextCapableCount === 1 ? "high" : "covered";
  let nextOutlook: NextTierOutlook;
  if (!nextTier) nextOutlook = "maximum-tier";
  else if (nextCapableCount) nextOutlook = "ready";
  else nextOutlook = "developing";
  const nextLevelGap = nextTier ? Math.max(0, nextLevel - lead.level) : 0;
  let explanation = !nextTier
    ? `Maximum tier reached. T${tier} is supported by ${currentCapableCount} member${currentCapableCount === 1 ? "" : "s"}.`
    : nextCapableCount === 0
      ? `No member supports T${nextTier} yet; ${lead.name} needs ${nextLevelGap} level${nextLevelGap === 1 ? "" : "s"}.`
      : nextCapableCount === 1
        ? `T${nextTier} ready, but relies on ${sorted.find((member) => member.level >= nextLevel)?.name ?? lead.name}.`
        : `T${nextTier} supported by ${nextCapableCount} members.`;
  if (nextTier) explanation += ` T${tier} baseline is covered by ${currentCapableCount} member${currentCapableCount === 1 ? "" : "s"}.`;
  return { id, name, settlementTier: tier, nextTier, currentStatus, dependencyRisk, nextOutlook, currentCapableCount, nextCapableCount, leadName: lead.name, leadLevel: lead.level, nextLevelGap, explanation };
}

export function prioritizeSettlementNeeds(rows: ProfessionCapability[]): SettlementNeed[] {
  const nextGaps = rows.filter((row) => row.nextTier && row.nextCapableCount === 0).map((row) => ({ kind: "next-gap" as const, professionId: row.id, professionName: row.name, message: row.explanation, priority: 0 }));
  const dependencies = rows.filter((row) => row.nextTier && row.nextCapableCount === 1).map((row) => ({ kind: "next-dependency" as const, professionId: row.id, professionName: row.name, message: row.explanation, priority: 1 }));
  return [...nextGaps, ...dependencies].slice(0, 6);
}
