type MemberPresence = {
  signedIn?: unknown;
  presenceSource?: unknown;
  lastActiveTimestamp?: unknown;
  lastActiveTimestamps?: unknown[];
  lastLoginTimestamp?: unknown;
};

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function newestValidTimestamp(values: unknown[]): string | null {
  let newest: { value: string; time: number } | null = null;
  for (const value of values) {
    const timestamp = validTimestamp(value);
    if (!timestamp) continue;
    const time = Date.parse(timestamp);
    if (newest && time <= newest.time) continue;
    newest = { value: timestamp, time };
  }
  return newest?.value ?? null;
}

export function memberPresenceStatus(member: MemberPresence): {
  kind: "online" | "last-seen" | "never";
  timestamp: string | null;
  label: string;
} {
  if (member.signedIn === true) {
    return { kind: "online", timestamp: null, label: "Online now" };
  }
  const lastActiveTimestamp = newestValidTimestamp([
    member.lastActiveTimestamp,
    ...(member.lastActiveTimestamps ?? []),
  ]);
  if (lastActiveTimestamp) {
    return { kind: "last-seen", timestamp: lastActiveTimestamp, label: "Last seen" };
  }
  const lastLoginTimestamp = validTimestamp(member.lastLoginTimestamp);
  if (lastLoginTimestamp) {
    return { kind: "last-seen", timestamp: lastLoginTimestamp, label: "Last seen" };
  }
  return { kind: "never", timestamp: null, label: "Never" };
}

export function memberSessionStatus(member: MemberPresence): "Presence unavailable" | "Offline" | "Online" {
  if (member.signedIn === true) return "Online";
  return member.presenceSource === "unavailable" ? "Presence unavailable" : "Offline";
}
