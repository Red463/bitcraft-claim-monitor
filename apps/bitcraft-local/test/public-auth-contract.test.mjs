import assert from "node:assert/strict";
import test from "node:test";

import { signedOAuthStateValue } from "../src/server/oauthState.mjs";
import {
  PUBLIC_DISCORD_CALLBACK_URI,
  PUBLIC_DISCORD_OAUTH_STATE_COOKIE_NAME,
  PUBLIC_ORIGIN,
  PUBLIC_PRIVACY_REAUTH_COOKIE_NAME,
  PUBLIC_USER_SESSION_COOKIE_NAME,
  buildPublicDiscordAuthorizeUrl,
  clearPublicOAuthStateCookie,
  clearPublicPrivacyReauthCookie,
  createPublicUserSession,
  publicOAuthStateCookie,
  publicPrivacyReauthCookie,
  readPublicOAuthStateCookie,
  readPublicPrivacyReauthCookie,
  resolvePublicDiscordOAuthConfig,
} from "../src/server/public/auth.mjs";

const secret = "public-oauth-state-secret";

test("public Discord OAuth config is separate and fixes origin, callback, and identify scope", () => {
  const config = resolvePublicDiscordOAuthConfig({
    PUBLIC_DISCORD_OAUTH_CLIENT_ID: "public-client",
    PUBLIC_DISCORD_OAUTH_CLIENT_SECRET: "public-secret",
    PUBLIC_ORIGIN: "https://claim-monitor.com",
    DISCORD_OAUTH_CLIENT_ID: "timbersteel-client",
    DISCORD_OAUTH_CLIENT_SECRET: "timbersteel-secret",
    DISCORD_OAUTH_REDIRECT_URI: "https://app.timbersteeltrade.com/api/local/auth/discord/callback",
  });
  assert.deepEqual(config, {
    clientId: "public-client",
    clientSecret: "public-secret",
    redirectUri: "https://claim-monitor.com/api/public/auth/discord/callback",
    origin: "https://claim-monitor.com",
    enabled: true,
  });
  assert.equal(PUBLIC_ORIGIN, "https://claim-monitor.com");
  assert.equal(PUBLIC_DISCORD_CALLBACK_URI, "https://claim-monitor.com/api/public/auth/discord/callback");

  const authorize = new URL(buildPublicDiscordAuthorizeUrl({ config, state: "public-state" }));
  assert.equal(authorize.origin + authorize.pathname, "https://discord.com/oauth2/authorize");
  assert.equal(authorize.searchParams.get("client_id"), "public-client");
  assert.equal(authorize.searchParams.get("redirect_uri"), PUBLIC_DISCORD_CALLBACK_URI);
  assert.equal(authorize.searchParams.get("scope"), "identify");
  assert.equal(authorize.searchParams.get("state"), "public-state");
  assert.equal(authorize.searchParams.has("guilds"), false);
});

test("public OAuth is disabled when the configured public origin is absent or not canonical", () => {
  for (const origin of [undefined, "http://claim-monitor.com", "https://public.localhost", "https://app.timbersteeltrade.com"]) {
    assert.equal(resolvePublicDiscordOAuthConfig({
      PUBLIC_DISCORD_OAUTH_CLIENT_ID: "public-client",
      PUBLIC_DISCORD_OAUTH_CLIENT_SECRET: "public-secret",
      ...(origin ? { PUBLIC_ORIGIN: origin } : {}),
    }).enabled, false);
  }
});

test("public cookies use exact __Host names and mandatory security attributes", () => {
  assert.equal(PUBLIC_USER_SESSION_COOKIE_NAME, "__Host-cm_user_session");
  assert.equal(PUBLIC_DISCORD_OAUTH_STATE_COOKIE_NAME, "__Host-cm_oauth_state");
  assert.equal(PUBLIC_PRIVACY_REAUTH_COOKIE_NAME, "__Host-cm_privacy_reauth");
  const session = createPublicUserSession({
    now: new Date("2026-08-25T10:00:00.000Z"),
    randomBytes: () => Buffer.alloc(32, 1),
  });
  assert.equal(
    session.cookie,
    `__Host-cm_user_session=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000; Secure`,
  );
  assert.doesNotMatch(session.cookie, /Domain=/i);
  assert.equal(clearPublicOAuthStateCookie(), "__Host-cm_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure");
  assert.equal(clearPublicPrivacyReauthCookie(), "__Host-cm_privacy_reauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure");
});

test("public OAuth state is profile-, purpose-, cookie-, and age-bound", () => {
  const now = () => new Date("2026-08-25T10:00:00.000Z");
  const cookie = publicOAuthStateCookie("public-state", "/settings", {
    secret,
    purpose: "login",
    legal: { version: "2026-08-25", termsDigest: "terms", privacyDigest: "privacy", ageConfirmed: true, acceptedAt: "2026-08-25T10:00:00.000Z" },
    now,
  });
  assert.match(cookie, /^__Host-cm_oauth_state=/);
  assert.match(cookie, /; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600; Secure$/);
  assert.doesNotMatch(cookie, /Domain=/i);
  const request = { headers: { cookie: cookie.split(";", 1)[0] } };
  assert.deepEqual(readPublicOAuthStateCookie(request, secret, { now }), {
    profile: "public",
    state: "public-state",
    returnTo: "/settings",
    purpose: "login",
    legal: { version: "2026-08-25", termsDigest: "terms", privacyDigest: "privacy", ageConfirmed: true, acceptedAt: "2026-08-25T10:00:00.000Z" },
    createdAt: "2026-08-25T10:00:00.000Z",
  });

  const timbersteelPayload = JSON.stringify({
    state: "public-state",
    returnTo: "/settings",
    purpose: "login",
    createdAt: "2026-08-25T10:00:00.000Z",
  });
  const timbersteelState = signedOAuthStateValue(timbersteelPayload, secret);
  assert.equal(readPublicOAuthStateCookie({ headers: { cookie: `__Host-cm_oauth_state=${encodeURIComponent(timbersteelState)}` } }, secret, { now }), null);
  assert.equal(readPublicOAuthStateCookie(request, secret, { now: () => new Date("2026-08-25T10:10:01.000Z") }), null);
});

test("recent public privacy proof is signed, short-lived, and bound to one public session", () => {
  const reauthenticatedAt = "2026-08-25T10:00:00.000Z";
  const cookie = publicPrivacyReauthCookie({
    userId: 7,
    discordId: "123",
    sessionTokenHash: "public-session-hash",
    reauthenticatedAt,
  }, { secret });
  assert.match(cookie, /^__Host-cm_privacy_reauth=/);
  assert.match(cookie, /; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600; Secure$/);
  const req = { headers: { cookie: cookie.split(";", 1)[0] } };
  assert.deepEqual(readPublicPrivacyReauthCookie(req, secret, {
    now: () => new Date("2026-08-25T10:09:59.000Z"),
  }), {
    profile: "public",
    userId: 7,
    discordId: "123",
    sessionTokenHash: "public-session-hash",
    reauthenticatedAt,
  });
  assert.equal(readPublicPrivacyReauthCookie(req, secret, {
    now: () => new Date("2026-08-25T10:10:01.000Z"),
  }), null);
});
