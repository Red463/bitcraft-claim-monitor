import { safeReturnPath } from "./httpRequests.mjs";

export function buildDiscordAuthorizeUrl({ config, state }) {
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("integration_type", "0");
  return authorize.toString();
}

export function discordOAuthCallbackDecision({
  config,
  stateCookie,
  state,
  code,
  error,
}) {
  const returnTo = safeReturnPath(stateCookie?.returnTo);
  if (error) return { ok: false, location: redirectWithAuth(returnTo, "discord-denied") };
  if (!config.enabled || !code || !stateCookie?.state || stateCookie.state !== state) {
    return { ok: false, location: redirectWithAuth(returnTo, "discord-error") };
  }
  return { ok: true, code, returnTo };
}

export function discordOAuthSuccessRedirect({
  returnTo,
  clearStateCookie,
  userSessionCookie,
  adminSessionCookie = null,
}) {
  return {
    location: returnTo,
    setCookie: [clearStateCookie, userSessionCookie, ...(adminSessionCookie ? [adminSessionCookie] : [])],
  };
}
export function discordOAuthTokenRequest({ config, code }) {
  return {
    url: "https://discord.com/api/v10/oauth2/token",
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: discordOAuthTokenBody({ config, code }),
    },
  };
}

export function discordOAuthProfileRequest(accessToken) {
  return {
    url: "https://discord.com/api/v10/users/@me",
    init: { headers: { authorization: `Bearer ${accessToken}` } },
  };
}
export function discordOAuthProfileAccount(profile, loginAt) {
  const discordId = String(profile?.id ?? "").trim();
  if (!/^\d+$/.test(discordId)) throw new Error("Discord profile did not include a usable id");
  return {
    discordId,
    username: String(profile?.username ?? ""),
    globalName: String(profile?.global_name ?? ""),
    avatar: String(profile?.avatar ?? ""),
    createdAt: loginAt,
    lastLoginAt: loginAt,
  };
}
export function discordOAuthTokenBody({ config, code }) {
  return new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
}

function redirectWithAuth(returnTo, authStatus) {
  return `${returnTo}${returnTo.includes("?") ? "&" : "?"}auth=${authStatus}`;
}
