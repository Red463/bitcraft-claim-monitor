import { createHash, timingSafeEqual } from "node:crypto";
import { parseCookies } from "./httpCookies.mjs";

export function csrfTokenFromSession(token) {
  return token ? createHash("sha256").update(`csrf:${token}`).digest("base64url") : null;
}

export function csrfToken(req) {
  return csrfTokenForCookie(req, "bitcraft_admin_session");
}

export function csrfTokenForCookie(req, cookieName) {
  return csrfTokenFromSession(parseCookies(req)[cookieName]);
}

export function appUserCsrfToken(req) {
  return csrfTokenForCookie(req, "bitcraft_user_session");
}

export function validCsrfHeader(expected, actual) {
  const actualText = String(actual ?? "");
  return Boolean(expected) && actualText.length === expected.length && timingSafeEqual(Buffer.from(actualText), Buffer.from(expected));
}
