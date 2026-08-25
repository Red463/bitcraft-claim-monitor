import { parseCookies, serializeHttpOnlyCookie } from "../httpCookies.mjs";
import { buildDiscordAuthorizeUrl } from "../discordOAuthFlow.mjs";
import { signedOAuthStateValue, verifySignedOAuthStateValue } from "../oauthState.mjs";
import { createHttpSession } from "../serverSessions.mjs";

export const PUBLIC_ORIGIN = "https://claim-monitor.com";
export const PUBLIC_DISCORD_CALLBACK_URI = `${PUBLIC_ORIGIN}/api/public/auth/discord/callback`;
export const PUBLIC_USER_SESSION_COOKIE_NAME = "__Host-cm_user_session";
export const PUBLIC_DISCORD_OAUTH_STATE_COOKIE_NAME = "__Host-cm_oauth_state";
export const PUBLIC_PRIVACY_REAUTH_COOKIE_NAME = "__Host-cm_privacy_reauth";
export const PUBLIC_USER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const PUBLIC_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
export const PUBLIC_PRIVACY_REAUTH_MAX_AGE_SECONDS = 10 * 60;

function publicReturnPath(value) {
  const text = String(value ?? "").trim() || "/";
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\") || /[\u0000-\u001f\u007f]/.test(text)) return "/";
  return text.slice(0, 500);
}

function signedCookie(name, payload, secret, maxAge) {
  return serializeHttpOnlyCookie(name, signedOAuthStateValue(JSON.stringify(payload), secret), {
    maxAge,
    secure: true,
  });
}

function readSignedCookie(req, name, secret) {
  try {
    const encoded = verifySignedOAuthStateValue(parseCookies(req)[name], secret);
    if (!encoded) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function validAge(createdAt, now, maxAgeSeconds) {
  const timestamp = Date.parse(String(createdAt ?? ""));
  const ageMs = now().getTime() - timestamp;
  return Number.isFinite(timestamp) && ageMs >= -30_000 && ageMs <= maxAgeSeconds * 1000;
}

export function resolvePublicDiscordOAuthConfig(env = process.env) {
  const clientId = String(env.PUBLIC_DISCORD_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.PUBLIC_DISCORD_OAUTH_CLIENT_SECRET ?? "").trim();
  const origin = String(env.PUBLIC_ORIGIN ?? "").trim();
  return {
    clientId,
    clientSecret,
    redirectUri: PUBLIC_DISCORD_CALLBACK_URI,
    origin,
    enabled: Boolean(clientId && clientSecret && origin === PUBLIC_ORIGIN),
  };
}

export function buildPublicDiscordAuthorizeUrl({ config, state }) {
  return buildDiscordAuthorizeUrl({ config: { ...config, redirectUri: PUBLIC_DISCORD_CALLBACK_URI }, state });
}

export function createPublicUserSession(options = {}) {
  return createHttpSession({
    ...options,
    cookieName: PUBLIC_USER_SESSION_COOKIE_NAME,
    maxAgeSeconds: PUBLIC_USER_SESSION_MAX_AGE_SECONDS,
    secure: true,
  });
}

export function clearPublicUserSessionCookie() {
  return serializeHttpOnlyCookie(PUBLIC_USER_SESSION_COOKIE_NAME, "", { maxAge: 0, secure: true });
}

export function publicOAuthStateCookie(state, returnTo, {
  secret,
  purpose = "login",
  legal = null,
  reauth = null,
  now = () => new Date(),
} = {}) {
  return signedCookie(PUBLIC_DISCORD_OAUTH_STATE_COOKIE_NAME, {
    profile: "public",
    state,
    returnTo: publicReturnPath(returnTo),
    purpose,
    ...(legal ? { legal } : {}),
    ...(reauth ? { reauth } : {}),
    createdAt: now().toISOString(),
  }, secret, PUBLIC_OAUTH_STATE_MAX_AGE_SECONDS);
}

export function readPublicOAuthStateCookie(req, secret, { now = () => new Date() } = {}) {
  const payload = readSignedCookie(req, PUBLIC_DISCORD_OAUTH_STATE_COOKIE_NAME, secret);
  if (!payload || payload.profile !== "public" || !["login", "privacy-delete"].includes(payload.purpose)) return null;
  if (!validAge(payload.createdAt, now, PUBLIC_OAUTH_STATE_MAX_AGE_SECONDS)) return null;
  return payload;
}

export function clearPublicOAuthStateCookie() {
  return serializeHttpOnlyCookie(PUBLIC_DISCORD_OAUTH_STATE_COOKIE_NAME, "", { maxAge: 0, secure: true });
}

export function publicPrivacyReauthCookie({
  userId,
  discordId,
  sessionTokenHash,
  reauthenticatedAt,
}, { secret } = {}) {
  return signedCookie(PUBLIC_PRIVACY_REAUTH_COOKIE_NAME, {
    profile: "public",
    userId,
    discordId: String(discordId),
    sessionTokenHash,
    reauthenticatedAt,
  }, secret, PUBLIC_PRIVACY_REAUTH_MAX_AGE_SECONDS);
}

export function readPublicPrivacyReauthCookie(req, secret, { now = () => new Date() } = {}) {
  const payload = readSignedCookie(req, PUBLIC_PRIVACY_REAUTH_COOKIE_NAME, secret);
  if (!payload || payload.profile !== "public") return null;
  if (!validAge(payload.reauthenticatedAt, now, PUBLIC_PRIVACY_REAUTH_MAX_AGE_SECONDS)) return null;
  return payload;
}

export function clearPublicPrivacyReauthCookie() {
  return serializeHttpOnlyCookie(PUBLIC_PRIVACY_REAUTH_COOKIE_NAME, "", { maxAge: 0, secure: true });
}
