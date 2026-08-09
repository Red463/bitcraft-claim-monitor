export const CANONICAL_ORIGIN = "https://app.timbersteeltrade.com";
export const CANONICAL_OAUTH_CALLBACK_URL = `${CANONICAL_ORIGIN}/api/local/auth/discord/callback`;

function setting(env, name, fallback = "") {
  return String(env[name] ?? fallback).trim();
}

function enabled(env, name, fallback = false) {
  const value = setting(env, name, fallback ? "true" : "false").toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function deploymentError(message) {
  return new Error(`Invalid canonical deployment runtime: ${message}`);
}

export function resolveDeploymentRuntime(env = process.env) {
  const mode = setting(env, "BITCRAFT_DEPLOYMENT_MODE", "preview").toLowerCase();
  if (mode !== "preview" && mode !== "canonical") {
    throw deploymentError("BITCRAFT_DEPLOYMENT_MODE must be preview or canonical");
  }

  const role = setting(env, "BITCRAFT_PROCESS_ROLE", setting(env, "BITCRAFT_SERVER_ROLE", "web")).toLowerCase();
  const deliveryMode = setting(env, "DISCORD_DELIVERY_MODE", "record").toLowerCase();
  const gatewayEnabled = enabled(env, "ENABLE_DISCORD_STARTUP", false);
  const oauthRedirectUri = setting(env, "DISCORD_OAUTH_REDIRECT_URI");
  const discordReady = Boolean(
    setting(env, "DISCORD_OAUTH_CLIENT_ID")
    && setting(env, "DISCORD_OAUTH_CLIENT_SECRET")
    && setting(env, "DISCORD_BOT_TOKEN"),
  );

  if (mode === "preview") {
    if (deliveryMode !== "record") throw deploymentError("preview requires DISCORD_DELIVERY_MODE=record");
    if (gatewayEnabled) throw deploymentError("preview requires ENABLE_DISCORD_STARTUP=false");
    return {
      mode,
      canonicalOrigin: CANONICAL_ORIGIN,
      oauthCallbackUrl: CANONICAL_OAUTH_CALLBACK_URL,
      discordDeliveryMode: "record",
      discordGatewayEnabled: false,
      discordReady: false,
      health({ version, buildSha }) {
        return {
          ok: true,
          deploymentMode: mode,
          canonicalOrigin: CANONICAL_ORIGIN,
          discordReady: false,
          version,
          buildSha,
        };
      },
    };
  }

  if (deliveryMode !== "live") throw deploymentError("canonical requires DISCORD_DELIVERY_MODE=live");
  if (!enabled(env, "LEGAL_CONFIGURATION_CONFIRMED", false)) throw deploymentError("canonical requires LEGAL_CONFIGURATION_CONFIRMED=true");
  if (!discordReady) throw deploymentError("canonical requires configured Discord identity and tokens");
  if (oauthRedirectUri && oauthRedirectUri !== CANONICAL_OAUTH_CALLBACK_URL) {
    throw deploymentError(`canonical requires DISCORD_OAUTH_REDIRECT_URI=${CANONICAL_OAUTH_CALLBACK_URL}`);
  }
  if (role === "all" && setting(env, "NODE_ENV").toLowerCase() === "production" && setting(env, "BITCRAFT_TEST").toLowerCase() !== "true") {
    throw deploymentError("canonical production requires separate web and worker process roles");
  }
  if (role === "worker" && !gatewayEnabled) throw deploymentError("canonical worker requires ENABLE_DISCORD_STARTUP=true");
  if (role === "web" && gatewayEnabled) throw deploymentError("canonical web gateway belongs to the worker");
  if (role !== "web" && role !== "worker" && role !== "all") throw deploymentError("canonical requires a web or worker process role");

  return {
    mode,
    canonicalOrigin: CANONICAL_ORIGIN,
    oauthCallbackUrl: CANONICAL_OAUTH_CALLBACK_URL,
    discordDeliveryMode: "live",
    discordGatewayEnabled: gatewayEnabled,
    discordReady: true,
    health({ version, buildSha }) {
      return {
        ok: true,
        deploymentMode: mode,
        canonicalOrigin: CANONICAL_ORIGIN,
        discordReady: true,
        version,
        buildSha,
      };
    },
  };
}
