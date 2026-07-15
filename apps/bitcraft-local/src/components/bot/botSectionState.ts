export const BOT_SECTION_DEFINITIONS = [
  { id: "setup", label: "Setup", icon: "message", description: "Token, application and guild IDs", group: "Setup" },
  { id: "notifications", label: "Notifications", icon: "bell", description: "Market, craft, supply and update rules", group: "Automation" },
  { id: "youtube", label: "YouTube Monitor", icon: "youtube", description: "New videos and announcements", group: "Automation" },
  { id: "channels", label: "Channels", icon: "hash", description: "Discord channel IDs and routing", group: "Setup" },
  { id: "roleManager", label: "Role Manager", icon: "users", description: "Create and inspect Discord roles", group: "Roles & Onboarding" },
  { id: "roles", label: "Craft Watch", icon: "bell", description: "Profession notification roles", group: "Roles & Onboarding" },
  { id: "colours", label: "Colour Roles", icon: "palette", description: "One-click name colour roles", group: "Roles & Onboarding" },
  { id: "community", label: "Role Panels", icon: "userPlus", description: "Self-assign roles and welcome flow", group: "Roles & Onboarding" },
  { id: "moderation", label: "Moderation", icon: "shield", description: "Timeouts, bans, purge and ban list", group: "Moderation" },
  { id: "safety", label: "Safety Rules", icon: "lock", description: "Auto-mod, slowmode, lockdown and nicknames", group: "Moderation" },
  { id: "records", label: "Member Records", icon: "file", description: "Warnings, notes, cases and profiles", group: "Moderation" },
  { id: "content", label: "Posts & Events", icon: "message", description: "Polls, RSVPs and event posts", group: "Community Content" },
  { id: "commands", label: "Commands", icon: "command", description: "Custom slash command responses", group: "Community Content" },
  { id: "tools", label: "Community Tools", icon: "wrench", description: "Reports and one-off announcements", group: "Community Content" },
  { id: "tests", label: "Command Tests", icon: "command", description: "Preview commands before publishing; compare Diagnostics when delivery fails", group: "Troubleshooting" },
  { id: "diagnostics", label: "Delivery Diagnostics", icon: "activity", description: "Inspect delivery logs; use Tests to reproduce command issues", group: "Troubleshooting" },
] as const;

export type BotSectionDefinition = (typeof BOT_SECTION_DEFINITIONS)[number];
export type BotSection = BotSectionDefinition["id"];
export type BotSectionIcon = BotSectionDefinition["icon"];
export const BOT_SECTION_IDS: readonly BotSection[] = BOT_SECTION_DEFINITIONS.map(({ id }) => id);
export const BOT_SECTION_GROUPS = ["Setup", "Automation", "Roles & Onboarding", "Community Content", "Moderation", "Troubleshooting"] as const;
export const BOT_SECTION_STORAGE_KEY = "bot.section";

export function restoreBotSection(value: unknown): BotSection {
  return typeof value === "string" && (BOT_SECTION_IDS as readonly string[]).includes(value)
    ? value as BotSection
    : "setup";
}
