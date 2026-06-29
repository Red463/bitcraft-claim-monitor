import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  APP_USER_SESSION_COOKIE_NAME,
  APP_USER_SESSION_MAX_AGE_SECONDS,
  clearHttpSessionCookie,
  createHttpSession,
  sessionTokenFromRequest,
  sessionTokenHash,
} from "../src/server/serverSessions.mjs";

test("server session constants preserve the existing cookie names and lifetimes", () => {
  assert.equal(ADMIN_SESSION_COOKIE_NAME, "bitcraft_admin_session");
  assert.equal(APP_USER_SESSION_COOKIE_NAME, "bitcraft_user_session");
  assert.equal(ADMIN_SESSION_MAX_AGE_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(APP_USER_SESSION_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
});

test("createHttpSession creates the existing token, hash, expiry, and cookie shape", () => {
  const now = new Date("2026-06-29T12:00:00.000Z");
  const randomBytes = () => Buffer.from("0123456789abcdef0123456789abcdef");

  const session = createHttpSession({
    cookieName: ADMIN_SESSION_COOKIE_NAME,
    maxAgeSeconds: ADMIN_SESSION_MAX_AGE_SECONDS,
    secure: true,
    now,
    randomBytes,
  });

  assert.equal(session.token, "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
  assert.equal(session.tokenHash, sessionTokenHash(session.token));
  assert.equal(session.createdAt, "2026-06-29T12:00:00.000Z");
  assert.equal(session.expiresAt, "2026-07-06T12:00:00.000Z");
  assert.equal(
    session.cookie,
    "bitcraft_admin_session=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; Secure",
  );
});

test("session helpers read and clear the existing app-user session cookie", () => {
  const req = { headers: { cookie: "alpha=one; bitcraft_user_session=user%20token" } };

  assert.equal(sessionTokenFromRequest(req, APP_USER_SESSION_COOKIE_NAME), "user token");
  assert.equal(sessionTokenFromRequest({ headers: {} }, APP_USER_SESSION_COOKIE_NAME), "");
  assert.equal(
    clearHttpSessionCookie(APP_USER_SESSION_COOKIE_NAME, { secure: false }),
    "bitcraft_user_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );
});
