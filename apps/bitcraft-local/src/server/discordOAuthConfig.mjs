export function resolveDiscordOAuthConfig({
  env = process.env,
  discordSettings = {},
  storedClientSecret = "",
  origin = "",
} = {}) {
  const clientId = String(env.DISCORD_OAUTH_CLIENT_ID ?? discordSettings.applicationId ?? "").trim();
  const envSecret = String(env.DISCORD_OAUTH_CLIENT_SECRET ?? "").trim();
  const storedSecret = String(storedClientSecret ?? "").trim();
  const clientSecret = envSecret || storedSecret;
  const redirectUri = String(env.DISCORD_OAUTH_REDIRECT_URI ?? "").trim() || `${origin}/api/local/auth/discord/callback`;
  return { clientId, clientSecret, redirectUri, enabled: Boolean(clientId && clientSecret) };
}
