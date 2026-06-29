import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscordAuthorizeUrl,
  discordOAuthCallbackDecision,
  discordOAuthProfileAccount,
  discordOAuthProfileRequest,
  discordOAuthSuccessRedirect,
  discordOAuthTokenBody,
  discordOAuthTokenRequest,
} from "../src/server/discordOAuthFlow.mjs";

const enabledConfig = {
  enabled: true,
  clientId: "client-123",
  clientSecret: "secret-abc",
  redirectUri: "https://example.test/api/local/auth/discord/callback",
};

test("buildDiscordAuthorizeUrl preserves the existing Discord authorize parameters", () => {
  const authorize = new URL(buildDiscordAuthorizeUrl({
    config: enabledConfig,
    state: "state-token",
  }));

  assert.equal(authorize.origin + authorize.pathname, "https://discord.com/oauth2/authorize");
  assert.equal(authorize.searchParams.get("client_id"), "client-123");
  assert.equal(authorize.searchParams.get("response_type"), "code");
  assert.equal(authorize.searchParams.get("redirect_uri"), enabledConfig.redirectUri);
  assert.equal(authorize.searchParams.get("scope"), "identify");
  assert.equal(authorize.searchParams.get("state"), "state-token");
});

test("discordOAuthCallbackDecision redirects denied and invalid callbacks to safe return paths", () => {
  assert.deepEqual(discordOAuthCallbackDecision({
    config: enabledConfig,
    stateCookie: { state: "stored-state", returnTo: "/?page=admin" },
    state: "stored-state",
    code: "code",
    error: "access_denied",
  }), { ok: false, location: "/?page=admin&auth=discord-denied" });

  assert.deepEqual(discordOAuthCallbackDecision({
    config: enabledConfig,
    stateCookie: { state: "stored-state", returnTo: "https://evil.test/" },
    state: "wrong-state",
    code: "code",
    error: "",
  }), { ok: false, location: "/?page=dashboard&auth=discord-error" });
});

test("discordOAuthCallbackDecision accepts matching state and usable codes", () => {
  assert.deepEqual(discordOAuthCallbackDecision({
    config: enabledConfig,
    stateCookie: { state: "stored-state", returnTo: "/?page=market" },
    state: "stored-state",
    code: "code-123",
    error: "",
  }), { ok: true, code: "code-123", returnTo: "/?page=market" });
});

test("discordOAuthTokenBody preserves the existing token exchange form fields", () => {
  const body = discordOAuthTokenBody({ config: enabledConfig, code: "code-123" });

  assert.equal(body.get("client_id"), "client-123");
  assert.equal(body.get("client_secret"), "secret-abc");
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "code-123");
  assert.equal(body.get("redirect_uri"), enabledConfig.redirectUri);
});
test("discordOAuthProfileAccount preserves profile id validation and database field mapping", () => {
  assert.deepEqual(discordOAuthProfileAccount({
    id: " 1234567890 ",
    username: "user-name",
    global_name: "Global Name",
    avatar: "avatar-hash",
  }, "2026-06-29T12:00:00.000Z"), {
    discordId: "1234567890",
    username: "user-name",
    globalName: "Global Name",
    avatar: "avatar-hash",
    createdAt: "2026-06-29T12:00:00.000Z",
    lastLoginAt: "2026-06-29T12:00:00.000Z",
  });

  assert.deepEqual(discordOAuthProfileAccount({ id: 42 }, "2026-06-29T12:00:00.000Z"), {
    discordId: "42",
    username: "",
    globalName: "",
    avatar: "",
    createdAt: "2026-06-29T12:00:00.000Z",
    lastLoginAt: "2026-06-29T12:00:00.000Z",
  });

  assert.throws(
    () => discordOAuthProfileAccount({ id: "not-a-number" }, "2026-06-29T12:00:00.000Z"),
    /Discord profile did not include a usable id/,
  );
});
test("discordOAuthTokenRequest preserves the existing Discord token fetch shape", () => {
  const request = discordOAuthTokenRequest({ config: enabledConfig, code: "code-123" });

  assert.equal(request.url, "https://discord.com/api/v10/oauth2/token");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(request.init.headers, { "content-type": "application/x-www-form-urlencoded" });
  assert.equal(request.init.body.get("client_id"), "client-123");
  assert.equal(request.init.body.get("client_secret"), "secret-abc");
  assert.equal(request.init.body.get("grant_type"), "authorization_code");
  assert.equal(request.init.body.get("code"), "code-123");
  assert.equal(request.init.body.get("redirect_uri"), enabledConfig.redirectUri);
});

test("discordOAuthProfileRequest preserves the existing Discord profile fetch shape", () => {
  assert.deepEqual(discordOAuthProfileRequest("access-token"), {
    url: "https://discord.com/api/v10/users/@me",
    init: { headers: { authorization: "Bearer access-token" } },
  });
});
test("discordOAuthSuccessRedirect preserves the existing callback success header shape", () => {
  assert.deepEqual(discordOAuthSuccessRedirect({
    returnTo: "/?page=market",
    clearStateCookie: "clear-state",
    userSessionCookie: "user-session",
    adminSessionCookie: "admin-session",
  }), {
    location: "/?page=market",
    setCookie: ["clear-state", "user-session", "admin-session"],
  });

  assert.deepEqual(discordOAuthSuccessRedirect({
    returnTo: "/?page=dashboard",
    clearStateCookie: "clear-state",
    userSessionCookie: "user-session",
  }), {
    location: "/?page=dashboard",
    setCookie: ["clear-state", "user-session"],
  });
});
