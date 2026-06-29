import { createHmac, timingSafeEqual } from "node:crypto";

import { parseCookies, serializeHttpOnlyCookie } from "./httpCookies.mjs";
import { safeReturnPath } from "./httpRequests.mjs";

export const DISCORD_OAUTH_STATE_COOKIE_NAME = "bitcraft_discord_oauth_state";
export const DISCORD_OAUTH_STATE_MAX_AGE_SECONDS = 600;

export function signedOAuthStateValue(payload, secret) {
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySignedOAuthStateValue(value, secret) {
  const [encoded, signature, ...extra] = String(value ?? "").split(".");
  if (!encoded || !signature || extra.length) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return encoded;
}

export function oauthStateCookie(state, returnTo, { secret, secure = false } = {}) {
  const payload = JSON.stringify({ state, returnTo: safeReturnPath(returnTo) });
  return serializeHttpOnlyCookie(DISCORD_OAUTH_STATE_COOKIE_NAME, signedOAuthStateValue(payload, secret), {
    maxAge: DISCORD_OAUTH_STATE_MAX_AGE_SECONDS,
    secure,
  });
}

export function clearOAuthStateCookie({ secure = false } = {}) {
  return serializeHttpOnlyCookie(DISCORD_OAUTH_STATE_COOKIE_NAME, "", { maxAge: 0, secure });
}

export function readOAuthStateCookie(req, secret) {
  try {
    const encoded = verifySignedOAuthStateValue(parseCookies(req)[DISCORD_OAUTH_STATE_COOKIE_NAME], secret);
    if (!encoded) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
