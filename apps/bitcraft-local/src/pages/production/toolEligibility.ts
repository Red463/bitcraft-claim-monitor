type ToolRecord = Record<string, unknown>;

type ToolRequirement = {
  toolType?: unknown;
  tool_type?: unknown;
  level?: unknown;
  power?: unknown;
};

type EligibilityInput = {
  skillName: string;
  requiredLevel: number;
  memberLevel: number;
  toolRequirement?: ToolRequirement | null;
  expectedTool?: string | null;
  tools: ToolRecord[] | null;
  toolbeltUnavailable: boolean;
};

function finiteNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function evaluateCraftEligibility(input: EligibilityInput) {
  if (input.memberLevel < input.requiredLevel) {
    return {
      ok: false,
      text: `Needs ${input.skillName} Lv ${input.requiredLevel} (has ${input.memberLevel})`,
    };
  }
  if (!input.toolRequirement) {
    return {
      ok: true,
      text: `Can craft - ${input.skillName} Lv ${input.memberLevel}`,
    };
  }
  if (input.tools == null) {
    return {
      ok: false,
      pending: true,
      text: input.toolbeltUnavailable ? "Toolbelt unavailable" : "Checking Toolbelt...",
    };
  }

  const requiredType = finiteNumber(
    input.toolRequirement.toolType ?? input.toolRequirement.tool_type,
  );
  const craftTier = finiteNumber(input.toolRequirement.level);
  const requiredPower = finiteNumber(input.toolRequirement.power);
  const ownedTool = input.tools.find((tool) => {
    const correctType = finiteNumber(tool.toolType) === requiredType
      || String(tool.tags ?? tool.tag ?? "") === input.expectedTool;
    const supportsTier = finiteNumber(tool.tier) + 1 >= craftTier;
    const supportsPower = finiteNumber(tool.toolPower) >= requiredPower;
    return correctType && supportsTier && supportsPower;
  });
  if (!ownedTool) {
    return {
      ok: false,
      text: `Needs T${Math.max(1, craftTier - 1)}+ ${input.expectedTool ?? "required tool"}`
        + `${requiredPower > 0 ? ` with ${requiredPower}+ power` : ""} in Toolbelt`,
    };
  }
  return {
    ok: true,
    text: `Can craft - ${input.skillName} Lv ${input.memberLevel}`
      + ` - ${String(ownedTool.name ?? "Tool")} (${finiteNumber(ownedTool.toolPower)} power)`,
  };
}
