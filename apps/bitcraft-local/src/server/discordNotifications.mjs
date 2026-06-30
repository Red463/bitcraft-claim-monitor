import { validDiscordId } from "./authIdentity.mjs";
import { normalizeProfessionKey } from "./productionActivity.mjs";

export function resolveDiscordChannelSelection(selection, settings = {}, fallback = settings.channelId ?? "") {
  const selected = String(selection ?? "").trim();
  if (!selected) return String(fallback ?? "").trim();
  const mapped = String(settings.channels?.[selected] ?? "").trim();
  if (mapped) return mapped;
  if (validDiscordId(selected)) return selected;
  return String(fallback ?? "").trim();
}

export function youtubeChannelSelection(settings = {}) {
  return resolveDiscordChannelSelection(settings.notificationChannels?.youtubeVideos ?? "announcements", settings, settings.channelId);
}

export function discordChannelForEvent(eventType, metadata = {}, settings = {}) {
  if (eventType === "youtube_video") {
    const overrideChannelId = String(metadata.discordChannelId ?? "").trim();
    return validDiscordId(overrideChannelId) ? overrideChannelId : youtubeChannelSelection(settings);
  }
  if (eventType === "production_started" || eventType === "production_completed") {
    const selection = settings.notificationChannels?.[eventType === "production_started" ? "productionStarted" : "productionCompleted"] ?? "profession";
    if (selection && selection !== "profession") return resolveDiscordChannelSelection(selection, settings, settings.channelId);
    const professionKey = normalizeProfessionKey(metadata.professionKey ?? metadata.skillName);
    return String(settings.craftChannels?.[professionKey] ?? settings.channelId ?? "").trim();
  }
  const selectionKey = eventType === "market_new_listing" ? "marketListings"
    : eventType === "market_sale" || eventType === "market_sale_confirmed" ? "marketSales"
    : eventType === "supplies" ? "lowSupplies"
    : eventType === "app_update" ? "appUpdates"
    : "";
  if (selectionKey) return resolveDiscordChannelSelection(settings.notificationChannels?.[selectionKey], settings, settings.channelId);
  return String(settings.channelId ?? "").trim();
}

export function discordChannelKeyForEvent(eventType, metadata = {}, settings = {}) {
  if (eventType === "production_started" || eventType === "production_completed") {
    const selectionKey = eventType === "production_started" ? "productionStarted" : "productionCompleted";
    const selection = settings.notificationChannels?.[selectionKey] ?? "profession";
    if (selection === "profession") return normalizeProfessionKey(metadata.professionKey ?? metadata.skillName) || "profession";
    return selection;
  }
  if (eventType === "market_new_listing") return settings.notificationChannels?.marketListings ?? "notifications";
  if (eventType === "market_sale" || eventType === "market_sale_confirmed") return settings.notificationChannels?.marketSales ?? "notifications";
  if (eventType === "supplies") return settings.notificationChannels?.lowSupplies ?? "notifications";
  if (eventType === "supply_report") return settings.notificationChannels?.supplyReport ?? "modNotes";
  if (eventType === "app_update") return settings.notificationChannels?.appUpdates ?? "notifications";
  if (eventType === "youtube_video") return settings.notificationChannels?.youtubeVideos ?? "announcements";
  return "notifications";
}
