import { normalizeProfessionKey } from "./productionActivity.mjs";

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatGold(value) {
  return `${toNumber(value).toLocaleString()}g`;
}

function validDiscordEmojiMention(value) {
  const emoji = String(value ?? "").trim();
  return /^<a?:[A-Za-z0-9_]{2,32}:\d{17,22}>$/.test(emoji) ? emoji : "";
}

export function craftProfessionEmoji(metadata = {}, settings = {}) {
  const professionKey = normalizeProfessionKey(metadata.professionKey ?? metadata.skillName);
  if (!professionKey) return "";
  return validDiscordEmojiMention(settings.craftEmojis?.[professionKey]);
}

function withEmojiPrefix(value, emoji) {
  return emoji ? `${emoji} ${value}` : value;
}

export function discordEmbedForActivity(eventType, summary, occurredAt, metadata = {}, settings = {}) {
  const tierColors = {
    1: 0x838e9e,
    2: 0xbe6327,
    3: 0x00f630,
    4: 0x2d6bff,
    5: 0xa349af,
    6: 0xd12234,
    7: 0xc09015,
    8: 0x5ae2e2,
    9: 0x1f1f1f,
    10: 0xdeffff,
  };
  const isProduction = eventType === "production_started" || eventType === "production_completed";
  const professionEmoji = isProduction ? craftProfessionEmoji(metadata, settings) : "";
  const tier = isProduction ? toNumber(metadata.tier ?? metadata.itemTier) : 0;
  const color = eventType.includes("sale") ? 0x4ee28a : eventType.includes("listing") ? 0xf0c64f : isProduction && tierColors[tier] ? tierColors[tier] : isProduction ? 0x65b7fa : eventType === "app_update" ? 0xa349af : eventType === "youtube_video" ? 0xff0033 : 0xef6461;
  const fields = [];
  if (metadata.itemName) fields.push({ name: "Item", value: String(metadata.itemName), inline: true });
  if (metadata.owner) fields.push({ name: "Member", value: String(metadata.owner), inline: true });
  if (toNumber(metadata.quantity)) fields.push({ name: "Quantity", value: toNumber(metadata.quantity).toLocaleString(), inline: true });
  if (toNumber(metadata.price)) fields.push({ name: "Unit price", value: formatGold(metadata.price), inline: true });
  if (toNumber(metadata.totalValue ?? metadata.totalPrice)) fields.push({ name: "Total", value: formatGold(metadata.totalValue ?? metadata.totalPrice), inline: true });
  if (metadata.buildingName) fields.push({ name: "Structure", value: String(metadata.buildingName), inline: true });
  if (metadata.crafterName) fields.push({ name: "Crafter", value: String(metadata.crafterName), inline: true });
  if (metadata.skillName) fields.push({ name: "Profession", value: isProduction ? withEmojiPrefix(String(metadata.skillName), professionEmoji) : String(metadata.skillName), inline: true });
  if (isProduction && tier) fields.push({ name: "Tier", value: `T${tier}`, inline: true });
  if (toNumber(metadata.totalXp)) fields.push({ name: "Total XP", value: toNumber(metadata.totalXp).toLocaleString(), inline: true });
  if (toNumber(metadata.progressPct)) fields.push({ name: "Progress", value: `${toNumber(metadata.progressPct).toFixed(1)}%`, inline: true });
  if (metadata.runway) fields.push({ name: "Runway", value: String(metadata.runway), inline: true });
  if (metadata.upkeep) fields.push({ name: "Upkeep", value: String(metadata.upkeep), inline: true });
  if (metadata.runsOutAt) fields.push({ name: "Runs out", value: new Date(metadata.runsOutAt).toLocaleString("en-GB", { timeZone: "Europe/London" }), inline: false });
  if (metadata.version) fields.push({ name: "Version", value: String(metadata.version), inline: true });
  if (metadata.changeNotes) fields.push({ name: "Changes", value: String(metadata.changeNotes).slice(0, 1024), inline: false });
  if (metadata.changelogUrl) fields.push({ name: "Changelog", value: `[View changes](${metadata.changelogUrl})`, inline: false });
  if (metadata.channelTitle) fields.push({ name: "Channel", value: String(metadata.channelTitle), inline: true });
  if (metadata.publishedAt) fields.push({ name: "Published", value: new Date(metadata.publishedAt).toLocaleString("en-GB", { timeZone: "Europe/London" }), inline: true });
  const baseTitle = eventType === "market_new_listing" ? "Market Listing"
    : eventType.includes("sale") ? "Market Sale"
    : eventType === "production_started" ? "Craft Started"
    : eventType === "production_completed" ? "Craft Completed"
    : eventType === "supplies" ? "Supply Watch"
    : eventType === "app_update" ? "App Update"
    : eventType === "youtube_video" ? "New YouTube Video"
    : "Settlement Update";
  return {
    author: { name: "Timbersteel Trade" },
    title: withEmojiPrefix(baseTitle, professionEmoji),
    url: metadata.url ?? metadata.changelogUrl,
    description: `**${summary}**`,
    color,
    fields: fields.slice(0, 8),
    timestamp: occurredAt,
    footer: { text: "BitCraft settlement monitor" },
    ...(metadata.thumbnailUrl ? { thumbnail: { url: String(metadata.thumbnailUrl) } } : {}),
  };
}