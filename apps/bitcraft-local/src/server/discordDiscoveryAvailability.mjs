export function unavailableDiscordDiscovery(reason, message) {
  const detail = String(message ?? "Discord discovery is unavailable");
  return {
    available: false,
    reason: String(reason ?? "unavailable"),
    message: detail,
    guild: null,
    bot: null,
    channels: [],
    roles: [],
    emojis: [],
    members: [],
    memberCount: 0,
    memberCountAvailable: false,
    memberCountError: detail,
  };
}
