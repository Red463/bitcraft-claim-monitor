type MemberPresence = {
  signedIn?: unknown;
  presenceSource?: unknown;
  lastActiveTimestamp?: unknown;
  lastLoginTimestamp?: unknown;
};

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

export function memberPresenceStatus(member: MemberPresence): {
  kind: "online" | "last-seen" | "never";
  timestamp: string | null;
  label: string;
} {
  if (member.signedIn === true) {
    return { kind: "online", timestamp: null, label: "Online now" };
  }
  const lastActiveTimestamp = validTimestamp(member.lastActiveTimestamp);
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
