export const BOT_SECTION_IDS = [
  "setup", "notifications", "youtube", "channels", "roleManager", "roles", "colours", "community",
  "moderation", "safety", "records", "content", "commands", "tools", "tests", "diagnostics",
] as const;

export type BotSection = (typeof BOT_SECTION_IDS)[number];
export const BOT_SECTION_STORAGE_KEY = "bot.section";

export function restoreBotSection(value: unknown): BotSection {
  return typeof value === "string" && (BOT_SECTION_IDS as readonly string[]).includes(value)
    ? value as BotSection
    : "setup";
}
