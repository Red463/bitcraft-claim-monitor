import type { ConfigurationSection } from "./adminNavigationState";

export const CONFIGURATION_SECTIONS: readonly { id: ConfigurationSection; label: string; description: string }[] = [
  { id: "general", label: "General", description: "Settlement, opening page, regions, and refresh cadence" },
  { id: "privacy", label: "Access & Privacy", description: "Page access, retention, and GeoIP" },
  { id: "notifications", label: "Notifications", description: "Browser alerts, deal watch, and app popups" },
  { id: "integrations", label: "Integrations", description: "Craft planning and member tracking" },
  { id: "branding", label: "Branding", description: "App logo and browser favicon" },
] as const;

const SETTING_CATEGORIES: Record<string, ConfigurationSection> = {
  visitorSecurity: "privacy",
  toastSettings: "notifications",
  marketDealWatch: "notifications",
  excludedMemberIds: "integrations",
  branding: "branding",
};

export function configurationSectionForSetting(key: string): ConfigurationSection {
  return SETTING_CATEGORIES[key] ?? "general";
}

export function shouldConfirmConfigurationNavigation({ dirty, current, next }: {
  dirty: boolean;
  current: ConfigurationSection;
  next: ConfigurationSection;
}): boolean {
  return dirty && current !== next;
}
