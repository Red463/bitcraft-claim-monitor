import { parseDateValue, toNumber } from "../main-app-data.ts";

const EQUIPMENT_SLOT_LABELS: Record<string, string> = {
  head_clothing: "Head",
  torso_clothing: "Torso",
  hand_clothing: "Hands",
  belt_clothing: "Belt",
  leg_clothing: "Legs",
  feet_clothing: "Feet",
  head_artifact: "Heart",
  hand_artifact: "Jewellery",
};

export function formatNumber(value: unknown, maximumFractionDigits = 0): string {
  return toNumber(value).toLocaleString(undefined, { maximumFractionDigits });
}

export function formatCompactNumber(value: unknown): string {
  const num = toNumber(value);
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(num / 1_000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  return formatNumber(num);
}

export function timestampMs(value: unknown): number {
  const date = parseDateValue(value);
  return date ? date.getTime() : 0;
}

export function dateLabel(value: unknown): string {
  if (!value) return "Never";
  const date = parseDateValue(value);
  if (!date) return String(value);
  return date.toLocaleString();
}

export function shortDateLabel(value: unknown): string {
  const date = parseDateValue(value);
  if (!date) return String(value ?? "");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function timeAgo(value: unknown): string {
  if (!value) return "Never";
  const date = parseDateValue(value);
  if (!date) return String(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return String(value);
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatDuration(seconds: unknown): string {
  const total = toNumber(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatPlaytime(seconds: unknown): string {
  const total = toNumber(seconds);
  if (!Number.isFinite(total) || total <= 0) return "Unavailable";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatEquipmentSlot(value: unknown): string {
  const key = String(value ?? "equipment").toLowerCase();
  return EQUIPMENT_SLOT_LABELS[key] ?? key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDaysAndHours(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "Unknown";
  const wholeDays = Math.floor(days);
  const hours = Math.floor((days - wholeDays) * 24);
  return wholeDays > 0 ? `${wholeDays}d ${hours}h` : `${hours}h`;
}
