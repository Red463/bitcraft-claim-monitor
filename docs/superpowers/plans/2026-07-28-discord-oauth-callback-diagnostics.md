# Discord OAuth Callback Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound Discord OAuth callback network waits and produce secret-free evidence identifying whether token exchange, profile lookup, or local session persistence fails.

**Architecture:** Add one dependency-injected JSON request helper and pure diagnostic/redirect formatters to the existing Discord OAuth flow module. Keep request orchestration in `server.mjs`, route both Discord calls through the helper, and terminate every failure with a safe redirect and cleared state cookie.

**Tech Stack:** Node.js 24, native `fetch`, `AbortSignal.timeout`, Node test runner, existing Node HTTP server and SQLite session flow.

## Global Constraints

- Outbound token and profile requests each time out after exactly `10_000` milliseconds.
- Do not log request URLs, bodies, OAuth codes, states, access tokens, cookies, Discord IDs, usernames, IP addresses, user agents, raw response bodies, or thrown network messages.
- Diagnostic fields are limited to `stage`, `event`, `status`, `reason`, and `durationMs`.
- Failure reasons are limited to `timeout`, `http`, `network`, `response`, and `local`.
- Do not retry authorization-code exchanges.
- Do not add a diagnostics HTTP endpoint, force IPv4, or change Discord scopes, installation contexts, redirect URIs, permissions, or administrator authorization rules.
- Preserve the existing safe return-path policy and clear the OAuth-state cookie on every callback failure.
- Keep the three unrelated untracked planning documents out of every commit.

## File Structure

- Modify `apps/bitcraft-local/src/server/discordOAuthFlow.mjs`: own the bounded Discord JSON request, typed failure metadata, diagnostic-line formatting, and safe failure redirect construction.
- Modify `apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs`: test request success, all failure classifications, timeout behavior, diagnostic redaction, and safe redirects.
- Modify `apps/bitcraft-local/server.mjs`: wire the callback stages to the helper and emit diagnostics through the journal.
- Create `apps/bitcraft-local/test/server-discord-oauth-callback-boundary.test.mjs`: protect the callback wiring and ensure direct unbounded Discord fetches do not return.
- Modify `CHANGELOG.md` and `apps/bitcraft-local/package.json`: release `0.48.1-beta.4`.

---

### Task 1: Bounded Discord OAuth request and safe formatting helpers

**Files:**
- Modify: `apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs`
- Modify: `apps/bitcraft-local/src/server/discordOAuthFlow.mjs`

**Interfaces:**
- Produces: `DISCORD_OAUTH_REQUEST_TIMEOUT_MS = 10_000`
- Produces: `DiscordOAuthRequestError`, with public `stage`, `reason`, and nullable `status` fields
- Produces: `discordOAuthJsonRequest({ request, stage, fetchImpl?, timeoutMs?, now?, onDiagnostic? })`
- Produces: `discordOAuthDiagnosticLine(event)`
- Produces: `discordOAuthFailureRedirect({ returnTo, stage, reason })`
- Consumes: existing request descriptors from `discordOAuthTokenRequest` and `discordOAuthProfileRequest`

- [ ] **Step 1: Add failing success and redaction tests**

Add these imports:

```js
import {
  DISCORD_OAUTH_REQUEST_TIMEOUT_MS,
  DiscordOAuthRequestError,
  discordOAuthDiagnosticLine,
  discordOAuthFailureRedirect,
  discordOAuthJsonRequest,
} from "../src/server/discordOAuthFlow.mjs";
```

Add a success test using a request that deliberately contains secret-looking values:

```js
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
```

- [ ] **Step 2: Add failing classification and timeout tests**

Add table-driven tests for HTTP, network, and response errors:

```js
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
```

- [ ] **Step 3: Add failing formatter and redirect tests**

```js
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
});
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
node --test apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs
```

Expected: FAIL because the new exports do not exist.

- [ ] **Step 5: Implement `DiscordOAuthRequestError` and `discordOAuthJsonRequest`**

Add to `discordOAuthFlow.mjs`:

```js
export const DISCORD_OAUTH_REQUEST_TIMEOUT_MS = 10_000;

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
  let response;
  try {
    response = await fetchImpl(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(timeoutMs),
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
  } catch {
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    onDiagnostic({ stage, event: "failure", reason: "response", status: response.status, durationMs });
    throw new DiscordOAuthRequestError(stage, "response", response.status);
  }
}
```

- [ ] **Step 6: Implement bounded diagnostic and redirect formatters**

```js
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
  return `${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}`
    + `auth=discord-error&reason=discord-${safeStage}-${safeReason}`;
}
```

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```bash
node --test apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs
```

Expected: all focused OAuth tests PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add apps/bitcraft-local/src/server/discordOAuthFlow.mjs apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs
git commit -m "feat: bound Discord OAuth requests"
```

---

### Task 2: Wire stage diagnostics and terminating failure redirects

**Files:**
- Modify: `apps/bitcraft-local/server.mjs`
- Create: `apps/bitcraft-local/test/server-discord-oauth-callback-boundary.test.mjs`

**Interfaces:**
- Consumes: `DiscordOAuthRequestError`, `discordOAuthDiagnosticLine`, `discordOAuthFailureRedirect`, and `discordOAuthJsonRequest` from Task 1
- Produces: journal lines prefixed `[discord-oauth]`
- Produces: safe callback redirects containing `auth=discord-error` and a bounded `reason`

- [ ] **Step 1: Write the failing callback boundary test**

Create `server-discord-oauth-callback-boundary.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const callbackStart = server.indexOf("async function handleDiscordOAuthCallback");
const callbackEnd = server.indexOf("\nfunction rejectStaleLegalAcceptance", callbackStart);
const callback = server.slice(callbackStart, callbackEnd);

test("Discord callback routes token and profile requests through bounded diagnostics", () => {
  assert.match(callback, /discordOAuthJsonRequest\(\{[\s\S]*stage:\s*"token"/);
  assert.match(callback, /discordOAuthJsonRequest\(\{[\s\S]*stage:\s*"profile"/);
  assert.match(callback, /discordOAuthDiagnosticLine/);
  assert.match(callback, /discordOAuthFailureRedirect/);
  assert.doesNotMatch(callback, /await fetch\(tokenRequest\.url/);
  assert.doesNotMatch(callback, /await fetch\(profileRequest\.url/);
});

test("Discord callback emits callback and session boundaries without logging request secrets", () => {
  assert.match(callback, /stage:\s*"callback",\s*event:\s*"start"/);
  assert.match(callback, /stage:\s*"session",\s*event:\s*"start"/);
  assert.match(callback, /stage:\s*"session",\s*event:\s*"success"/);
  assert.match(callback, /stage:\s*"session",\s*event:\s*"failure",\s*reason:\s*"local"/);
  assert.doesNotMatch(callback, /console\.(?:log|info|warn)\([^)]*(?:code|state|access_token|profile|req\.url)/);
});
```

- [ ] **Step 2: Run the boundary test and verify RED**

Run:

```bash
node --test apps/bitcraft-local/test/server-discord-oauth-callback-boundary.test.mjs
```

Expected: FAIL because the callback still contains direct `fetch` calls and no stage diagnostics.

- [ ] **Step 3: Import the Task 1 interfaces and add local response helpers**

Extend the existing `discordOAuthFlow.mjs` import in `server.mjs` with:

```js
DiscordOAuthRequestError,
discordOAuthDiagnosticLine,
discordOAuthFailureRedirect,
discordOAuthJsonRequest,
```

Add these focused server-local helpers next to the existing OAuth handlers:

```js
function logDiscordOAuthDiagnostic(event) {
  if (!isTestRuntime) console.info(discordOAuthDiagnosticLine(event));
}

function finishDiscordOAuthFailure(res, returnTo, stage, reason) {
  res.writeHead(302, {
    location: discordOAuthFailureRedirect({ returnTo, stage, reason }),
    "set-cookie": clearAuthStateCookie(),
  });
  res.end();
  return true;
}
```

- [ ] **Step 4: Replace direct token/profile fetches with bounded requests**

After legal/state validation, add:

```js
logDiscordOAuthDiagnostic({ stage: "callback", event: "start" });
```

Replace the token/profile fetch block with:

```js
let tokenJson;
try {
  tokenJson = await discordOAuthJsonRequest({
    request: discordOAuthTokenRequest({ config, code: callbackDecision.code }),
    stage: "token",
    onDiagnostic: logDiscordOAuthDiagnostic,
  });
} catch (error) {
  const failure = error instanceof DiscordOAuthRequestError
    ? error
    : new DiscordOAuthRequestError("token", "network");
  return finishDiscordOAuthFailure(res, returnTo, failure.stage, failure.reason);
}

let profile;
try {
  profile = await discordOAuthJsonRequest({
    request: discordOAuthProfileRequest(tokenJson.access_token),
    stage: "profile",
    onDiagnostic: logDiscordOAuthDiagnostic,
  });
} catch (error) {
  const failure = error instanceof DiscordOAuthRequestError
    ? error
    : new DiscordOAuthRequestError("profile", "network");
  return finishDiscordOAuthFailure(res, returnTo, failure.stage, failure.reason);
}
```

- [ ] **Step 5: Bound the local session-persistence stage**

Immediately before the privacy reauthentication/local account branches, emit:

```js
logDiscordOAuthDiagnostic({ stage: "session", event: "start" });
```

Wrap the existing privacy reauthentication and ordinary account/session
persistence code in one `try` block. Immediately before each successful return,
emit:

```js
logDiscordOAuthDiagnostic({ stage: "session", event: "success" });
```

Terminate unexpected local persistence failures without exposing the exception:

```js
} catch {
  logDiscordOAuthDiagnostic({
    stage: "session",
    event: "failure",
    reason: "local",
  });
  return finishDiscordOAuthFailure(res, returnTo, "session", "local");
}
```

Keep the existing explicit privacy mismatch `403` responses unchanged; emit the
session failure event only for thrown local errors, not expected authorization
decisions.

- [ ] **Step 6: Run focused callback tests**

Run:

```bash
node --test \
  apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs \
  apps/bitcraft-local/test/server-discord-oauth-callback-boundary.test.mjs
```

Expected: both focused test files PASS.

- [ ] **Step 7: Run the server integration test**

Run:

```bash
node --experimental-strip-types --test apps/bitcraft-local/test/server.test.mjs
```

Expected: PASS with existing OAuth start, invalid-state redirect, session, legal, and API behavior unchanged.

- [ ] **Step 8: Commit Task 2**

```bash
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server-discord-oauth-callback-boundary.test.mjs
git commit -m "feat: trace Discord OAuth callback stages"
```

---

### Task 3: Release, verify, publish, and diagnose production

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/bitcraft-local/package.json`

**Interfaces:**
- Consumes: completed Tasks 1 and 2
- Produces: release `0.48.1-beta.4`
- Produces: a deployed production build whose journal identifies the last OAuth callback stage

- [ ] **Step 1: Add the release entry**

Add immediately after `## [Unreleased]`:

```markdown
## [0.48.1-beta.4] - 2026-07-28

### Fixed

- Prevented Discord sign-in callbacks from waiting indefinitely and added privacy-safe callback diagnostics.
```

Set `apps/bitcraft-local/package.json`:

```json
"version": "0.48.1-beta.4"
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
node --test \
  apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs \
  apps/bitcraft-local/test/server-discord-oauth-callback-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run the complete backend test suite**

Run:

```bash
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests PASS with zero failures.

- [ ] **Step 4: Run the production build**

Run:

```bash
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite build PASS.

- [ ] **Step 5: Inspect the final diff and commit release metadata**

Run:

```bash
git diff --check
git status --short
git diff origin/main...HEAD
```

Confirm only the design, plan, OAuth helper/test, server callback/boundary test,
changelog, and package version are included. Then commit:

```bash
git add CHANGELOG.md apps/bitcraft-local/package.json
git commit -m "chore: release 0.48.1-beta.4"
```

- [ ] **Step 6: Push and open the production pull request**

```bash
git push -u origin codex/discord-oauth-callback-diagnostics
gh pr create \
  --repo Red463/bitcraft-claim-monitor \
  --base main \
  --head codex/discord-oauth-callback-diagnostics \
  --title "Diagnose stalled Discord OAuth callbacks" \
  --body-file C:/tmp/discord-oauth-callback-diagnostics-pr.md
```

The PR body must state the observed callback stall, the bounded diagnostic
design, privacy exclusions, release version, and exact build/test results.

- [ ] **Step 7: Merge and deploy after GitHub verification**

Confirm the PR head SHA and mergeability, merge to `main`, then dispatch:

```bash
gh workflow run deploy-production.yml \
  --repo Red463/bitcraft-claim-monitor \
  --ref main
```

Approve the protected `production` environment for that exact workflow run,
monitor both `verify` and `deploy` jobs to completion, then verify:

```bash
curl.exe -sS https://app.timbersteeltrade.com/api/local/health
```

Expected: `version` is `0.48.1-beta.4`, `ok` is `true`, and `buildId` matches the
merged revision prefix.

- [ ] **Step 8: Capture one production reproduction**

Ask the user to start one fresh Discord login. If the callback redirects, record
the bounded `reason` query parameter. Then ask the user to run:

```bash
sudo journalctl \
  -u bitcraft-claim-monitor \
  --since "5 minutes ago" \
  --no-pager |
grep '\[discord-oauth\]'
```

Expected: a callback entry followed by token/profile/session start and
success/failure lines. Use the final line to choose the next investigation; do
not apply another OAuth or networking change during this task.
