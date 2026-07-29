export function discordDeliveryMode(env = process.env) {
  return String(env.DISCORD_DELIVERY_MODE ?? "").trim().toLowerCase() === "live"
    ? "live"
    : "record";
}

export function recordedDiscordResponse(channelId, payload) {
  return {
    id: null,
    channel_id: String(channelId),
    recorded: true,
    payload,
  };
}

export function requireLiveDiscord(mode, operation) {
  if (mode !== "live") {
    throw new Error(`${operation} is disabled while Discord delivery mode is record`);
  }
}
