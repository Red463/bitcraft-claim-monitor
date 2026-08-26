import { toNumber, type AnyRecord } from "../../main-app-data.ts";
import { formatNumber } from "../../utils/format.ts";

export function bytesLabel(value: unknown) {
  const bytes = toNumber(value);
  if (bytes < 1024) return String(bytes) + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function collectorStatusValue(collector: AnyRecord) {
  if (collector.running) {
    const hasProgress = collector.progressCurrent != null && collector.progressTotal != null;
    const progress = hasProgress ? " (" + formatNumber(collector.progressCurrent) + " / " + formatNumber(collector.progressTotal) + ")" : "";
    return "Running" + progress;
  }
  if (collector.lastError) return "Error: " + collector.lastError;
  if (collector.lastSuccessAt) return "Last success " + collector.lastSuccessAt;
  return "Waiting for first run";
}

export function scheduledJobProgressText(metadata: AnyRecord) {
  const stage = String(metadata?.stage ?? "running").replace(/_/g, " ");
  const parts: string[] = [];
  if (metadata?.current != null && metadata?.total != null) parts.push(formatNumber(metadata.current) + " / " + formatNumber(metadata.total) + " checked");
  if (metadata?.updated != null) parts.push(formatNumber(metadata.updated) + " updated");
  if (metadata?.created != null) parts.push(formatNumber(metadata.created) + " created");
  if (metadata?.skipped != null) parts.push(formatNumber(metadata.skipped) + " skipped");
  if (metadata?.processed != null) parts.push(formatNumber(metadata.processed) + " processed");
  if (metadata?.error) parts.push("error: " + metadata.error);
  return stage + (parts.length ? " (" + parts.join(" ? ") + ")" : "");
}

export function discordSnowflakeDate(id: unknown) {
  try {
    const raw = String(id ?? "");
    if (!/^\d+$/.test(raw)) return null;
    return new Date(Number((BigInt(raw) >> 22n) + 1420070400000n));
  } catch {
    return null;
  }
}

export function discordAuditActionLabel(actionType: unknown) {
  const labels: Record<string, string> = {
    "1": "Guild updated",
    "10": "Channel created",
    "11": "Channel updated",
    "12": "Channel deleted",
    "13": "Channel permissions created",
    "14": "Channel permissions updated",
    "15": "Channel permissions deleted",
    "20": "Member removed",
    "21": "Member pruned",
    "22": "Member banned",
    "23": "Member unbanned",
    "24": "Member updated",
    "25": "Member roles updated",
    "26": "Member moved",
    "27": "Member disconnected",
    "28": "Bot added",
    "30": "Role created",
    "31": "Role updated",
    "32": "Role deleted",
    "40": "Invite created",
    "41": "Invite updated",
    "42": "Invite deleted",
    "50": "Webhook created",
    "51": "Webhook updated",
    "52": "Webhook deleted",
    "60": "Emoji created",
    "61": "Emoji updated",
    "62": "Emoji deleted",
    "72": "Message deleted",
    "73": "Messages bulk deleted",
    "74": "Message pinned",
    "75": "Message unpinned",
    "80": "Integration created",
    "81": "Integration updated",
    "82": "Integration deleted",
    "90": "Stage instance created",
    "91": "Stage instance updated",
    "92": "Stage instance deleted",
    "110": "Thread created",
    "111": "Thread updated",
    "112": "Thread deleted",
    "121": "AutoMod rule created",
    "122": "AutoMod rule updated",
    "123": "AutoMod rule deleted",
  };
  const key = String(actionType ?? "");
  return labels[key] ?? "Action " + (key || "unknown");
}

export function discordAuditUserLabel(users: AnyRecord[], id: unknown) {
  const user = users.find((entry) => String(entry.id) === String(id));
  return String(user?.global_name ?? user?.username ?? id ?? "Unknown user");
}

export function discordChangeLabel(change: AnyRecord) {
  const key = String(change.key ?? "change").replaceAll("_", " ");
  const next = change.new_value;
  const previous = change.old_value;
  const format = (value: unknown) => {
    if (value === undefined) return "";
    if (Array.isArray(value)) return formatNumber(value.length) + " item" + (value.length === 1 ? "" : "s");
    if (typeof value === "object" && value !== null) return JSON.stringify(value);
    return String(value);
  };
  if (next !== undefined && previous !== undefined) return key + ": " + format(previous) + " -> " + format(next);
  if (next !== undefined) return key + ": " + format(next);
  if (previous !== undefined) return key + ": removed " + format(previous);
  return key;
}
