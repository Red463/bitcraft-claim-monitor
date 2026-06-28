import { createHash, timingSafeEqual } from "node:crypto";
import { parseCookies } from "./httpCookies.mjs";

export function csrfTokenFromSession(token) {
  return token ? createHash("sha256").update(`csrf:${token}`).digest("base64url") : null;
}

export function csrfToken(req) {
  return csrfTokenFromSession(parseCookies(req).bitcraft_admin_session);
}

export function validCsrfHeader(expected, actual) {
  const actualText = String(actual ?? "");
  return Boolean(expected) && actualText.length === expected.length && timingSafeEqual(Buffer.from(actualText), Buffer.from(expected));
}