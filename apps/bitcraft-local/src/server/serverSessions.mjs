import { createHash, randomBytes as cryptoRandomBytes } from "node:crypto";

import { parseCookies, serializeHttpOnlyCookie } from "./httpCookies.mjs";

export const ADMIN_SESSION_COOKIE_NAME = "bitcraft_admin_session";
export const APP_USER_SESSION_COOKIE_NAME = "bitcraft_user_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const APP_USER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionTokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function sessionTokenFromRequest(req, cookieName) {
  return parseCookies(req)[cookieName] ?? "";
}

export function clearHttpSessionCookie(cookieName, { secure = false } = {}) {
  return serializeHttpOnlyCookie(cookieName, "", { maxAge: 0, secure });
}

export function createHttpSession({
  cookieName,
  maxAgeSeconds,
  secure = false,
  now = new Date(),
  randomBytes = cryptoRandomBytes,
} = {}) {
  const token = randomBytes(32).toString("base64url");
  const createdAtDate = new Date(now);
  const expiresAtDate = new Date(createdAtDate.getTime() + maxAgeSeconds * 1000);
  return {
    token,
    tokenHash: sessionTokenHash(token),
    createdAt: createdAtDate.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
    cookie: serializeHttpOnlyCookie(cookieName, token, { maxAge: maxAgeSeconds, secure }),
  };
}
