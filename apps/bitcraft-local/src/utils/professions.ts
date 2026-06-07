import { toNumber, type AnyRecord } from "../main-app-data";

export const SKILL_NAMES: Record<number, string> = {
  2: "Forestry",
  3: "Carpentry",
  4: "Masonry",
  5: "Mining",
  6: "Smithing",
  7: "Scholar",
  8: "Leatherworking",
  9: "Hunting",
  10: "Tailoring",
  11: "Farming",
  12: "Fishing",
  13: "Cooking",
  14: "Foraging",
  15: "Construction",
  17: "Taming",
  18: "Slayer",
  19: "Merchanting",
  21: "Sailing",
};

export const SKILL_IDS = Object.keys(SKILL_NAMES).map(Number).sort((a, b) => a - b);
export const PROFESSION_IDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14];
export const ADVENTURE_SKILL_IDS = [13, 15, 17, 18, 19, 21];

export const TIER_COLORS: Record<number, string> = {
  1: "#838e9e",
  2: "#be6327",
  3: "#00f630",
  4: "#2d6bff",
  5: "#a349af",
  6: "#d12234",
  7: "#c09015",
  8: "#5ae2e2",
  9: "#1f1f1f",
  10: "#deffff",
};

export const TOOL_TAG_BY_TYPE: Record<number, string> = {
  1: "Forester Tool",
  2: "Carpenter Tool",
  3: "Mason Tool",
  4: "Miner Tool",
  5: "Blacksmith Tool",
  6: "Leatherworker Tool",
  7: "Hunter Tool",
  8: "Tailor Tool",
  9: "Farmer Tool",
  10: "Fisher Tool",
  11: "Cook Tool",
  12: "Forager Tool",
  13: "Scholar Tool",
  14: "Tool",
};

export function bitjitaSkillRows(skills: AnyRecord, category: "Profession" | "Adventure"): AnyRecord[] {
  const key = category === "Profession" ? "profession" : "adventure";
  return Array.isArray(skills?.[key]) ? skills[key] : [];
}

export function skillNameFromRows(rows: AnyRecord[], id: number): string {
  return String(rows.find((skill) => toNumber(skill.id) === id)?.name ?? SKILL_NAMES[id] ?? `Skill ${id}`);
}

export function skillTier(level: number): number {
  if (level <= 0) return 0;
  if (level < 20) return 1;
  return Math.min(10, Math.floor(level / 10));
}

export function skillTierLabel(level: number): string {
  const tier = skillTier(level);
  if (!tier) return "No tier";
  const low = tier === 1 ? 0 : tier * 10;
  const high = tier === 10 ? 100 : tier * 10 - 1;
  return `T${tier} (${low}-${high})`;
}

export function levelClass(level: number): string {
  const tier = skillTier(level);
  if (tier <= 0) return "lvl0";
  if (tier <= 2) return "lvl1";
  if (tier <= 5) return "lvl2";
  if (tier <= 8) return "lvl3";
  return "lvl4";
}
