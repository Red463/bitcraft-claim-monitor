import type { AnyRecord } from "../main-app-data.ts";

export function recruitmentSummary(value: unknown) {
  const state = value && typeof value === "object" && !Array.isArray(value)
    ? value as AnyRecord
    : {};
  const recruitment = Array.isArray(state.recruitment)
    ? state.recruitment as AnyRecord[]
    : [];
  const posting = recruitment.find((row) => row.isRecruiting !== false && BigInt(
    String(row.remainingStock ?? "0"),
  ) > 0n);
  if (!posting) {
    return {
      isRecruiting: false,
      remainingStock: "0",
      statusLabel: "Closed",
      requirementLabel: "No active recruitment posting",
      approvalLabel: "Unavailable",
    };
  }
  const remainingStock = String(posting.remainingStock);
  const requiredSkillName = String(
    posting.requiredSkill?.name ?? `Skill #${posting.requiredSkillId}`,
  );
  return {
    isRecruiting: true,
    remainingStock,
    statusLabel: `${remainingStock} available`,
    requirementLabel: `${requiredSkillName} level ${String(posting.requiredSkillLevel)}`,
    approvalLabel: posting.requiredApproval ? "Approval required" : "Open entry",
  };
}
