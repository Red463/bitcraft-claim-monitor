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

function manualSandboxConfigurationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function validDiscordSnowflake(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{15,20}$/.test(normalized)) return false;
  const snowflake = BigInt(normalized);
  return snowflake > 0n && snowflake <= 18446744073709551615n;
}

export async function sendDiscordManualSandboxMessage({
  apiOrigin,
  configuredChannelId,
  fetchImpl = fetch,
  payload,
  requestedChannelId,
  settings,
}) {
  const sandboxChannelId = String(configuredChannelId ?? "").trim();
  if (!validDiscordSnowflake(sandboxChannelId)) {
    throw manualSandboxConfigurationError("A valid Discord sandbox channel must be configured for manual delivery tests.");
  }
  const requested = String(requestedChannelId ?? "").trim();
  if (requested && requested !== sandboxChannelId) {
    throw manualSandboxConfigurationError("The requested Discord channel does not match the configured sandbox channel.");
  }
  if (!settings?.enabled || !settings?.botToken) {
    throw manualSandboxConfigurationError("Discord integration is not fully configured.");
  }
  const safePayload = {
    ...(payload ?? {}),
    allowed_mentions: { parse: [] },
  };
  const response = await fetchImpl(
    `${String(apiOrigin).replace(/\/+$/, "")}/channels/${encodeURIComponent(sandboxChannelId)}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bot ${settings.botToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(safePayload),
    },
  );
  if (!response.ok) {
    throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}
