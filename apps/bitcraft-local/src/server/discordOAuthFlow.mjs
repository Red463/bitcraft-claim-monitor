import { safeReturnPath } from "./httpRequests.mjs";

export const DISCORD_OAUTH_REQUEST_TIMEOUT_MS = 10_000;
export const DISCORD_OAUTH_FAILURE_FALLBACK_LOCATION = "/?auth=discord-error&reason=discord-session";

const DISCORD_OAUTH_STAGES = new Set(["callback", "token", "profile", "session"]);
const DISCORD_OAUTH_EVENTS = new Set(["start", "success", "failure"]);
const DISCORD_OAUTH_FAILURE_REASONS = new Set(["timeout", "http", "network", "response", "local"]);

export class DiscordOAuthRequestError extends Error {
  constructor(stage, reason, status = null) {
    super(`Discord OAuth ${stage} ${reason}`);
    this.name = "DiscordOAuthRequestError";
    this.stage = stage;
    this.reason = reason;
    this.status = status;
  }
}

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

export async function discordOAuthJsonRequest({
  request,
  stage,
  fetchImpl = fetch,
  timeoutMs = DISCORD_OAUTH_REQUEST_TIMEOUT_MS,
  now = Date.now,
  onDiagnostic = () => {},
}) {
  const startedAt = now();
  onDiagnostic({ stage, event: "start" });
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(request.url, {
      ...request.init,
      signal,
    });
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "timeout" : "network";
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    onDiagnostic({ stage, event: "failure", reason, durationMs });
    throw new DiscordOAuthRequestError(stage, reason);
  }
  if (!response.ok) {
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    onDiagnostic({ stage, event: "failure", reason: "http", status: response.status, durationMs });
    throw new DiscordOAuthRequestError(stage, "http", response.status);
  }
  try {
    const value = await response.json();
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    onDiagnostic({ stage, event: "success", status: response.status, durationMs });
    return value;
  } catch (error) {
    const reason = error?.name === "TimeoutError"
      || (signal.aborted && signal.reason?.name === "TimeoutError")
      ? "timeout"
      : "response";
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    onDiagnostic({ stage, event: "failure", reason, status: response.status, durationMs });
    throw new DiscordOAuthRequestError(stage, reason, response.status);
  }
}

export function discordOAuthDiagnosticLine(event) {
  const stage = DISCORD_OAUTH_STAGES.has(event?.stage) ? event.stage : "callback";
  const action = DISCORD_OAUTH_EVENTS.has(event?.event) ? event.event : "failure";
  const fields = [`stage=${stage}`, `event=${action}`];
  if (Number.isInteger(event?.status) && event.status >= 100 && event.status <= 599) {
    fields.push(`status=${event.status}`);
  }
  if (DISCORD_OAUTH_FAILURE_REASONS.has(event?.reason)) fields.push(`reason=${event.reason}`);
  if (Number.isFinite(event?.durationMs) && event.durationMs >= 0) {
    fields.push(`durationMs=${Math.round(event.durationMs)}`);
  }
  return `[discord-oauth] ${fields.join(" ")}`;
}

export function discordOAuthFailureRedirect({ returnTo, stage, reason }) {
  const safeReturnTo = safeReturnPath(returnTo);
  const safeStage = ["token", "profile", "session"].includes(stage) ? stage : "session";
  const safeReason = DISCORD_OAUTH_FAILURE_REASONS.has(reason) ? reason : "local";
  const boundedReason = safeStage === "session"
    ? "discord-session"
    : `discord-${safeStage}-${safeReason}`;
  return `${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}`
    + `auth=discord-error&reason=${boundedReason}`;
}

export function finishDiscordOAuthFailureResponse({
  res,
  returnTo,
  stage,
  reason,
  clearStateCookie,
}) {
  const stateCookie = clearStateCookie();
  try {
    res.writeHead(302, {
      location: discordOAuthFailureRedirect({ returnTo, stage, reason }),
      "set-cookie": stateCookie,
    });
  } catch {
    if (res.headersSent) {
      res.end();
      return true;
    }
    res.writeHead(302, {
      location: DISCORD_OAUTH_FAILURE_FALLBACK_LOCATION,
      "set-cookie": stateCookie,
    });
  }
  res.end();
  return true;
}

export async function discordOAuthCallbackController({
  res,
  config,
  code,
  returnTo,
  clearStateCookie,
  persistSession,
  requestJson = discordOAuthJsonRequest,
  onDiagnostic = () => {},
}) {
  onDiagnostic({ stage: "callback", event: "start" });
  let tokenJson;
  try {
    tokenJson = await requestJson({
      request: discordOAuthTokenRequest({ config, code }),
      stage: "token",
      onDiagnostic,
    });
  } catch (error) {
    const failure = error instanceof DiscordOAuthRequestError
      ? error
      : new DiscordOAuthRequestError("token", "network");
    return finishDiscordOAuthFailureResponse({
      res,
      returnTo,
      stage: failure.stage,
      reason: failure.reason,
      clearStateCookie,
    });
  }

  let profile;
  try {
    profile = await requestJson({
      request: discordOAuthProfileRequest(tokenJson.access_token),
      stage: "profile",
      onDiagnostic,
    });
  } catch (error) {
    const failure = error instanceof DiscordOAuthRequestError
      ? error
      : new DiscordOAuthRequestError("profile", "network");
    return finishDiscordOAuthFailureResponse({
      res,
      returnTo,
      stage: failure.stage,
      reason: failure.reason,
      clearStateCookie,
    });
  }

  onDiagnostic({ stage: "session", event: "start" });
  try {
    const sessionResult = await persistSession(profile);
    if (sessionResult?.successful !== false) {
      onDiagnostic({ stage: "session", event: "success" });
    }
    return sessionResult && typeof sessionResult === "object" && "value" in sessionResult
      ? sessionResult.value
      : sessionResult;
  } catch {
    onDiagnostic({ stage: "session", event: "failure", reason: "local" });
    return finishDiscordOAuthFailureResponse({
      res,
      returnTo,
      stage: "session",
      reason: "local",
      clearStateCookie,
    });
  }
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
