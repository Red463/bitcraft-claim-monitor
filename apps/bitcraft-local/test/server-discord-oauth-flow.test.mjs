import assert from "node:assert/strict";
import test from "node:test";

import * as discordOAuthFlow from "../src/server/discordOAuthFlow.mjs";
import {
  DISCORD_OAUTH_REQUEST_TIMEOUT_MS,
  DiscordOAuthRequestError,
  buildDiscordAuthorizeUrl,
  discordOAuthCallbackDecision,
  discordOAuthDiagnosticLine,
  discordOAuthFailureRedirect,
  discordOAuthJsonRequest,
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
  assert.equal(authorize.searchParams.get("integration_type"), "0");
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

test("discordOAuthJsonRequest returns JSON and emits only bounded diagnostics", async () => {
  const diagnostics = [];
  const times = [100, 142];
  const result = await discordOAuthJsonRequest({
    stage: "token",
    request: {
      url: "https://discord.test/oauth2/token?code=secret-code",
      init: {
        method: "POST",
        body: new URLSearchParams({ code: "secret-code", client_secret: "secret-value" }),
      },
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "secret-access-token" }),
    }),
    now: () => times.shift(),
    onDiagnostic: (event) => diagnostics.push(event),
  });

  assert.deepEqual(result, { access_token: "secret-access-token" });
  assert.deepEqual(diagnostics, [
    { stage: "token", event: "start" },
    { stage: "token", event: "success", status: 200, durationMs: 42 },
  ]);
  const serialized = JSON.stringify(diagnostics);
  assert.doesNotMatch(serialized, /secret-code|secret-value|secret-access-token|discord\.test/);
  assert.equal(DISCORD_OAUTH_REQUEST_TIMEOUT_MS, 10_000);
});

test("discordOAuthJsonRequest classifies bounded Discord failures", async () => {
  const cases = [
    {
      name: "http",
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: "secret-body" }) }),
      reason: "http",
      status: 401,
    },
    {
      name: "network",
      fetchImpl: async () => { throw new Error("secret-network-message"); },
      reason: "network",
      status: null,
    },
    {
      name: "response",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError("secret-response-body"); },
      }),
      reason: "response",
      status: 200,
    },
  ];

  for (const entry of cases) {
    const diagnostics = [];
    await assert.rejects(
      discordOAuthJsonRequest({
        stage: "profile",
        request: { url: "https://discord.test/users/@me", init: {} },
        fetchImpl: entry.fetchImpl,
        now: (() => {
          const times = [10, 15];
          return () => times.shift();
        })(),
        onDiagnostic: (event) => diagnostics.push(event),
      }),
      (error) => error instanceof DiscordOAuthRequestError
        && error.stage === "profile"
        && error.reason === entry.reason
        && error.status === entry.status,
      entry.name,
    );
    assert.deepEqual(diagnostics.at(-1), {
      stage: "profile",
      event: "failure",
      reason: entry.reason,
      ...(entry.status == null ? {} : { status: entry.status }),
      durationMs: 5,
    });
    assert.doesNotMatch(JSON.stringify(diagnostics), /secret-network-message|secret-response-body|secret-body/);
  }
});

test("discordOAuthJsonRequest aborts a stalled Discord request", async () => {
  const diagnostics = [];
  await assert.rejects(
    discordOAuthJsonRequest({
      stage: "token",
      request: { url: "https://discord.test/oauth2/token", init: {} },
      timeoutMs: 5,
      fetchImpl: (_url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
      onDiagnostic: (event) => diagnostics.push(event),
    }),
    (error) => error instanceof DiscordOAuthRequestError
      && error.stage === "token"
      && error.reason === "timeout",
  );
  assert.equal(diagnostics.at(-1).event, "failure");
  assert.equal(diagnostics.at(-1).reason, "timeout");
});

test("discordOAuthJsonRequest classifies a stalled response body as timeout", async () => {
  const diagnostics = [];
  await assert.rejects(
    discordOAuthJsonRequest({
      stage: "profile",
      request: { url: "https://discord.test/users/@me", init: {} },
      timeoutMs: 5,
      fetchImpl: async (_url, init) => ({
        ok: true,
        status: 200,
        json: () => new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        }),
      }),
      onDiagnostic: (event) => diagnostics.push(event),
    }),
    (error) => error instanceof DiscordOAuthRequestError
      && error.stage === "profile"
      && error.reason === "timeout"
      && error.status === 200,
  );
  assert.equal(diagnostics.at(-1).event, "failure");
  assert.equal(diagnostics.at(-1).reason, "timeout");
  assert.equal(diagnostics.at(-1).status, 200);
});

test("Discord OAuth diagnostics and failure redirects expose bounded values only", () => {
  assert.equal(discordOAuthDiagnosticLine({
    stage: "profile",
    event: "failure",
    reason: "timeout",
    durationMs: 10_002,
  }), "[discord-oauth] stage=profile event=failure reason=timeout durationMs=10002");

  assert.equal(discordOAuthFailureRedirect({
    returnTo: "/?page=admin",
    stage: "token",
    reason: "http",
  }), "/?page=admin&auth=discord-error&reason=discord-token-http");

  assert.equal(discordOAuthFailureRedirect({
    returnTo: "https://evil.test/?code=secret-code",
    stage: "profile",
    reason: "network",
  }), "/?page=dashboard&auth=discord-error&reason=discord-profile-network");

  assert.equal(discordOAuthFailureRedirect({
    returnTo: "/?page=dashboard",
    stage: "session",
    reason: "local",
  }), "/?page=dashboard&auth=discord-error&reason=discord-session");
});

function responseRecorder({ throwOnFirstWrite = false } = {}) {
  const writes = [];
  let ended = false;
  return {
    res: {
      writeHead(status, headers) {
        writes.push({ status, headers });
        if (throwOnFirstWrite && writes.length === 1) {
          throw new TypeError("secret-invalid-location");
        }
      },
      end() {
        ended = true;
      },
    },
    writes,
    ended: () => ended,
  };
}

test("Discord OAuth callback controller terminates token, profile, and session failures safely", async (t) => {
  assert.equal(typeof discordOAuthFlow.discordOAuthCallbackController, "function");
  const cases = [
    {
      name: "token",
      returnTo: "/?page=market",
      expectedLocation: "/?page=market&auth=discord-error&reason=discord-token-network",
      requestJson: async ({ stage, onDiagnostic }) => {
        onDiagnostic({ stage, event: "start" });
        onDiagnostic({ stage, event: "failure", reason: "network", durationMs: 3 });
        throw new DiscordOAuthRequestError("token", "network");
      },
      persistSession: async () => {
        throw new Error("unexpected session");
      },
    },
    {
      name: "profile",
      returnTo: "https://evil.test/?code=secret-code",
      expectedLocation: "/?page=dashboard&auth=discord-error&reason=discord-profile-response",
      requestJson: async ({ stage, onDiagnostic }) => {
        onDiagnostic({ stage, event: "start" });
        if (stage === "token") {
          onDiagnostic({ stage, event: "success", status: 200, durationMs: 2 });
          return { access_token: "secret-access-token" };
        }
        onDiagnostic({ stage, event: "failure", reason: "response", status: 200, durationMs: 4 });
        throw new DiscordOAuthRequestError("profile", "response", 200);
      },
      persistSession: async () => {
        throw new Error("unexpected session");
      },
    },
    {
      name: "session",
      returnTo: "/?page=admin\r\nx-secret: secret-state",
      expectedLocation: "/?auth=discord-error&reason=discord-session",
      throwOnFirstWrite: true,
      requestJson: async ({ stage, onDiagnostic }) => {
        onDiagnostic({ stage, event: "start" });
        onDiagnostic({ stage, event: "success", status: 200, durationMs: 2 });
        return stage === "token"
          ? { access_token: "secret-access-token" }
          : { id: "1234567890", username: "secret-profile" };
      },
      persistSession: async () => {
        throw new Error("secret-session-exception");
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const response = responseRecorder({ throwOnFirstWrite: entry.throwOnFirstWrite });
      const diagnostics = [];
      const result = await discordOAuthFlow.discordOAuthCallbackController({
        res: response.res,
        config: enabledConfig,
        code: "secret-code",
        returnTo: entry.returnTo,
        clearStateCookie: () => "oauth-state=; Max-Age=0",
        requestJson: entry.requestJson,
        persistSession: entry.persistSession,
        onDiagnostic: (event) => diagnostics.push(event),
      });

      assert.equal(result, true);
      assert.equal(response.ended(), true);
      assert.equal(response.writes.at(-1).status, 302);
      assert.equal(response.writes.at(-1).headers.location, entry.expectedLocation);
      assert.equal(response.writes.at(-1).headers["set-cookie"], "oauth-state=; Max-Age=0");
      assert.doesNotMatch(
        JSON.stringify({ diagnostics, finalWrite: response.writes.at(-1) }),
        /secret-code|secret-state|secret-access-token|secret-profile|secret-session-exception|secret-invalid-location/,
      );
    });
  }
});
