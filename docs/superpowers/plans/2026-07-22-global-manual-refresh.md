# Global Manual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the floating refresh button force-refresh every live data source owned by the active page, with consistent progress feedback and a 15-second browser/server anti-spam guard.

**Architecture:** Add a small request-scoped manual-refresh coordinator shared through React context. Automatic polling keeps its numeric token and normal caches; manual requests carry a UUID in the `x-manual-refresh-id` header, bypass eligible caches, register active-page promises with the coordinator, and are independently limited by a server guard keyed by client address and UUID.

**Tech Stack:** React 19, TypeScript, plain CSS, Node.js HTTP server, Node test runner, existing BitJita proxy/cache and rate-limit modules.

## Global Constraints

- Manual refresh cooldown is exactly 15 seconds from the accepted click.
- One manual refresh may fan out to at most 40 same-origin requests carrying the accepted UUID.
- Automatic polling continues to use browser and server caches.
- Manual refresh preserves page filters, selections, scroll position, current data, and open dialogs.
- The weekly probability-catalogue refresh is not triggered.
- Existing data remains visible on partial or complete refresh failure.
- No new runtime dependencies or state libraries.

---

### Task 1: Server manual-refresh admission guard

**Files:**
- Create: `apps/bitcraft-local/src/server/manualRefreshGuard.mjs`
- Create: `apps/bitcraft-local/test/server-manual-refresh-guard.test.mjs`

**Interfaces:**
- Produces: `createManualRefreshGuard({ cooldownMs, maxRequests, now })`
- Produces: `guard.authorize(clientKey, refreshId)` returning `{ allowed, forceRefresh, retryAfterSeconds, reason }`
- Produces: `MANUAL_REFRESH_HEADER`, `MANUAL_REFRESH_COOLDOWN_MS`, and `MANUAL_REFRESH_MAX_REQUESTS`

- [ ] **Step 1: Write the failing guard tests**

```js
test("manual refresh guard admits one UUID and its bounded fan-out", () => {
  let now = 1_000;
  const guard = createManualRefreshGuard({ cooldownMs: 15_000, maxRequests: 3, now: () => now });
  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
  assert.deepEqual(guard.authorize("203.0.113.9", REQUEST_A), {
    allowed: false,
    forceRefresh: false,
    retryAfterSeconds: 15,
    reason: "fanout-limit",
  });
});

test("manual refresh guard rejects a second UUID until cooldown expires", () => {
  let now = 1_000;
  const guard = createManualRefreshGuard({ cooldownMs: 15_000, maxRequests: 40, now: () => now });
  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
  assert.equal(guard.authorize("203.0.113.9", REQUEST_B).allowed, false);
  now += 15_001;
  assert.equal(guard.authorize("203.0.113.9", REQUEST_B).allowed, true);
});

test("missing refresh ids are ordinary cached requests and malformed ids are rejected", () => {
  const guard = createManualRefreshGuard();
  assert.deepEqual(guard.authorize("203.0.113.9", ""), { allowed: true, forceRefresh: false, retryAfterSeconds: 0, reason: "ordinary" });
  assert.equal(guard.authorize("203.0.113.9", "not-a-uuid").reason, "invalid-id");
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-manual-refresh-guard.test.mjs`

Expected: FAIL because `manualRefreshGuard.mjs` does not exist.

- [ ] **Step 3: Implement the bounded guard**

Implement a map keyed by normalized client address. Each entry stores `{ refreshId, startedAt, expiresAt, requestCount }`. Empty IDs return an ordinary request; valid UUIDs establish or join the current window; a different UUID inside the window or request 41 returns a retry duration. Prune expired entries during authorization.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-manual-refresh-guard.test.mjs`

Expected: all guard tests pass.

- [ ] **Step 5: Commit the guard**

```powershell
git add apps/bitcraft-local/src/server/manualRefreshGuard.mjs apps/bitcraft-local/test/server-manual-refresh-guard.test.mjs
git commit -m "feat: guard forced refresh requests"
```

---

### Task 2: Request-scoped server cache bypass

**Files:**
- Modify: `apps/bitcraft-local/src/server/bitjitaProxyCache.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server-bitjita-proxy-cache.test.mjs`
- Create: `apps/bitcraft-local/test/server-manual-refresh-boundary.test.mjs`

**Interfaces:**
- Consumes: `createManualRefreshGuard`, constants, and `requestAddress(req)`
- Extends: `fetchUpstreamCached(upstream, { forceRefresh?: boolean, timeoutMs?: number })`
- Adds: `manualRefreshAccess(req, res)` returning `{ forceRefresh, refreshId } | null`; `null` means the response has already been sent as `400` or `429`
- Extends: planner workspace, dashboard, production, passive-craft, player-detail, empire, and other active-page aggregate loaders with `{ forceRefresh, refreshId }`

- [ ] **Step 1: Add failing proxy-cache and route boundary tests**

Add a proxy-cache test that primes a response, calls `fetchUpstreamCached(upstream, { forceRefresh: true })`, and asserts two upstream calls plus `cacheState === "miss"`. Add a concurrent force test proving identical upstream work remains deduplicated. Add a source boundary test requiring:

```js
assert.match(server, /x-manual-refresh-id/);
assert.match(server, /manualRefreshAccess\(req, res\)/);
assert.match(server, /fetchUpstreamCached\(upstream, \{ forceRefresh/);
assert.match(server, /dashboardData\([^\n]+\{ forceRefresh/);
assert.match(server, /computedCompactCraftPlanResponse\([^\n]+\{ forceRefresh, refreshId/);
assert.match(server, /settlementProductionCrafts\([^\n]+forceRefresh/);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-bitjita-proxy-cache.test.mjs test/server-manual-refresh-boundary.test.mjs`

Expected: FAIL because force-refresh support is absent.

- [ ] **Step 3: Add force-aware proxy-cache behavior**

Change the cache-hit condition to:

```js
if (!requestOptions.forceRefresh && cached && cached.expiresAt > requestedAt) {
  return { ...cached, cacheState: "hit" };
}
```

Keep the stale candidate and in-flight coalescing available during forced requests. A successful force request replaces the normal cache entry.

- [ ] **Step 4: Add server admission and response helpers**

Instantiate one guard. Read only `req.headers[MANUAL_REFRESH_HEADER]`, validate it with the guard, and send rejected responses as:

```js
send(res, status, {
  error: status === 429 ? "Manual refresh is cooling down. Please try again shortly." : "Invalid manual refresh identifier.",
  source: "manual-refresh-guard",
  retryAfter: decision.retryAfterSeconds,
}, decision.retryAfterSeconds ? { "retry-after": String(decision.retryAfterSeconds) } : {});
```

The header is internal and must never be copied into BitJita upstream headers or query strings.

- [ ] **Step 5: Propagate force options through eligible loaders**

Apply request-scoped bypasses to:

- `/api/bitjita/*` via `fetchUpstreamCached(upstream, { forceRefresh })`;
- `/api/local/dashboard-data` via `dashboardData(claimId, { forceRefresh })`;
- `/api/local/production/crafts`, `/passive-crafts`, and `/player-details` via `loadHelperCached(..., { forceRefresh })` and direct `fetchBitjita(..., { cache: !forceRefresh })` calls;
- `/api/local/craft-plan` and `/craft-plan/detail` via planner workspace options. Cache entries record `refreshId` so compact and detail requests sharing one UUID reuse the same newly forced calculation;
- active Empires/region helpers that currently retain live response caches.

Do not bypass immutable catalog policies or the weekly probability catalogue.

- [ ] **Step 6: Re-run focused server tests**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-manual-refresh-guard.test.mjs test/server-bitjita-proxy-cache.test.mjs test/server-manual-refresh-boundary.test.mjs test/server-http-rate-limit.test.mjs`

Expected: all focused server tests pass.

- [ ] **Step 7: Commit request-scoped bypasses**

```powershell
git add apps/bitcraft-local/src/server/bitjitaProxyCache.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server-bitjita-proxy-cache.test.mjs apps/bitcraft-local/test/server-manual-refresh-boundary.test.mjs
git commit -m "feat: bypass live caches for manual refresh"
```

---

### Task 3: Browser refresh request and task coordinator

**Files:**
- Create: `apps/bitcraft-local/src/refresh/manualRefresh.mjs`
- Create: `apps/bitcraft-local/src/refresh/ManualRefreshContext.tsx`
- Create: `apps/bitcraft-local/test/manual-refresh.test.mjs`

**Interfaces:**
- Produces: `createManualRefreshRequest(page, sequence, options)` returning `{ id, page, sequence, requestedAt }`
- Produces: `manualRefreshApplies(request, page)`, `manualRefreshHeaders(request, page)`, and `cooldownRemainingMs(startedAt, now)`
- Produces: `createManualRefreshTaskCoordinator({ onStateChange })` with `beginRequest`, `beginTask`, `finishTask`, `seal`, and `snapshot`
- Produces: `ManualRefreshProvider` and `useManualRefresh()` returning `{ request, trackPromise }`

- [ ] **Step 1: Write failing coordinator tests**

Cover:

```js
test("manual request applies only to the page where it was started", () => {
  const request = createManualRefreshRequest("planning", 2, { id: REQUEST_A, now: () => 1_000 });
  assert.equal(manualRefreshApplies(request, "planning"), true);
  assert.equal(manualRefreshApplies(request, "production"), false);
  assert.deepEqual(manualRefreshHeaders(request, "planning"), { "x-manual-refresh-id": REQUEST_A });
});

test("coordinator completes only after registration is sealed and every task settles", async () => {
  const changes = [];
  const coordinator = createManualRefreshTaskCoordinator({ onStateChange: (state) => changes.push(state) });
  coordinator.beginRequest(REQUEST_A);
  const finishMain = coordinator.beginTask(REQUEST_A, "main");
  const finishPage = coordinator.beginTask(REQUEST_A, "page");
  coordinator.seal(REQUEST_A);
  finishMain();
  assert.equal(coordinator.snapshot().status, "refreshing");
  finishPage();
  assert.equal(coordinator.snapshot().status, "complete");
});
```

Also test idempotent task completion, stale request IDs, failure aggregation, and exact 15-second cooldown arithmetic.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/manual-refresh.test.mjs`

Expected: FAIL because the refresh modules do not exist.

- [ ] **Step 3: Implement pure request and coordinator primitives**

Use `crypto.randomUUID()` only when the caller does not inject an ID. Store pending task keys in a `Set`, make returned finish callbacks idempotent, and retain errors only for the active request. `seal()` permits completion after React effects have registered their tasks.

- [ ] **Step 4: Implement the React context adapter**

`trackPromise(key, promise)` starts a coordinator task only when the context request applies to the current active page, returns the original promise, and always finishes in `.finally()`. It must not swallow rejections.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/manual-refresh.test.mjs`

Expected: all coordinator tests pass.

- [ ] **Step 6: Commit browser primitives**

```powershell
git add apps/bitcraft-local/src/refresh apps/bitcraft-local/test/manual-refresh.test.mjs
git commit -m "feat: coordinate active page refresh work"
```

---

### Task 4: Floating button lifecycle and accessible feedback

**Files:**
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs`
- Create: `apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs`

**Interfaces:**
- Consumes: refresh request/coordinator primitives and `ManualRefreshProvider`
- Passes: the active manual request and task tracker into `useBitjitaData`
- Exposes: `idle`, `refreshing`, and `cooldown` labels on the existing floating action button

- [ ] **Step 1: Add failing AppShell and CSS boundary tests**

Require the button to use a dedicated `requestManualRefresh` handler, `aria-live` status, `aria-busy`, computed cooldown text, `.is-refreshing`, and reduced-motion handling. Require the automatic interval to continue incrementing only the ordinary `refreshToken`.

- [ ] **Step 2: Run boundary tests and confirm RED**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/appshell-chrome-boundary.test.mjs test/manual-refresh-css-boundary.test.mjs`

Expected: FAIL on the missing lifecycle and styles.

- [ ] **Step 3: Implement AppShell manual-refresh state**

On an accepted click:

```tsx
const request = createManualRefreshRequest(active, manualRefreshSequenceRef.current + 1);
manualRefreshCoordinator.beginRequest(request.id);
setManualRefreshRequest(request);
window.setTimeout(() => manualRefreshCoordinator.seal(request.id), 0);
```

Reject clicks while coordinator status is `refreshing` or `cooldownRemainingMs(request.requestedAt, Date.now()) > 0`. Keep a lightweight one-second timer only while cooldown text is visible. Clear timers on unmount.

- [ ] **Step 4: Render consistent feedback**

Keep the existing button position and size. Rotate the existing `RefreshCw` icon only while requests are pending. After completion show `Data refreshed` through the existing toast/status mechanism, then expose `Refresh available in N seconds` until the cooldown ends. Set `disabled`, `aria-disabled`, `aria-busy`, `aria-label`, and `title` from the same derived state.

- [ ] **Step 5: Add restrained motion styles**

Use a single transform rotation keyframe on `.floating-action-item.is-refreshing svg`. Under `@media (prefers-reduced-motion: reduce)`, remove rotation and use the existing active color/state styling without motion.

- [ ] **Step 6: Run focused tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/appshell-chrome-boundary.test.mjs test/manual-refresh-css-boundary.test.mjs test/manual-refresh.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: focused tests and build pass.

- [ ] **Step 7: Commit the control lifecycle**

```powershell
git add apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs
git commit -m "fix: make global refresh state explicit"
```

---

### Task 5: Wire the main loader and active-page requests

**Files:**
- Modify: `apps/bitcraft-local/src/api/bitjita.ts`
- Modify: `apps/bitcraft-local/src/pages/DashboardPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/ProductionPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/LeaderboardPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/EmpiresPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/MarketPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/MembersPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/InventoryPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/empires/EmpireDetailsDialog.tsx`
- Modify: `apps/bitcraft-local/src/pages/empires/SiegeDetailsDialog.tsx`
- Create: `apps/bitcraft-local/test/manual-refresh-pages-boundary.test.mjs`

**Interfaces:**
- Consumes: `useManualRefresh()`, `manualRefreshApplies()`, and `manualRefreshHeaders()`
- Extends: `useBitjitaData(refreshToken, claimId, activePanel, manualRequest, trackPromise)`

- [ ] **Step 1: Add failing loader and page-consumer boundary tests**

Assert that `useBitjitaData` skips `pageNavigationCache` when the active manual request changes, includes the manual header on BitJita and local aggregate calls, and registers its request with the coordinator. Assert each listed page consumes `useManualRefresh`, includes `request?.sequence` in relevant effect dependencies, and tracks its promise.

- [ ] **Step 2: Run page boundary tests and confirm RED**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/manual-refresh-pages-boundary.test.mjs`

Expected: FAIL because page-owned fetches do not consume manual refresh context.

- [ ] **Step 3: Make the main loader distinguish automatic and manual refresh**

The navigation-cache early return becomes conditional:

```ts
const forced = manualRefreshApplies(manualRequest, activePanel);
if (!forced && cached && cachedAgeMs < PAGE_NAVIGATION_CACHE_TTL_MS) {
  // existing browser-cache result
}
```

Add the manual header to every request in that load, pass it to dashboard and production/player aggregate calls, preserve previous data while loading, and register the complete `load()` promise as the `main-data` task.

- [ ] **Step 4: Wire pages already receiving automatic tokens**

Craft Planning, Production, Leaderboard, and Public Craft Finder keep their automatic token behavior and additionally apply the manual header only when the request page matches. Craft Planning reloads an open need-detail response after its compact plan refresh completes. Production applies the same identifier to the main production aggregate, passive crafts, contributions, and selected-member Toolbelt request.

- [ ] **Step 5: Wire independent active-page live sources**

Add the context request sequence to live effects for Dashboard planner preview, Empires overview/watchtowers/open dialogs, Market member history, open Member details, and selected Inventory item details. Continue treating map/catalog and calculator catalog requests as static/user-driven rather than live refresh targets.

- [ ] **Step 6: Preserve state and partial data**

All updated effects must retain existing result data while loading and only replace it on success. Aborted requests caused by navigation do not report a refresh failure. A rejected request finishes its coordinator task and leaves its current data visible.

- [ ] **Step 7: Run focused page tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/manual-refresh-pages-boundary.test.mjs test/dashboard-page-boundary.test.mjs test/craft-planning-boundary.test.mjs test/production-page-boundary.test.mjs test/empires-page-boundary.test.mjs test/market-page-boundary.test.mjs test/inventory-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: all focused page tests and build pass.

- [ ] **Step 8: Commit page wiring**

```powershell
git add apps/bitcraft-local/src/api/bitjita.ts apps/bitcraft-local/src/pages apps/bitcraft-local/test/manual-refresh-pages-boundary.test.mjs
git commit -m "fix: refresh all active page data"
```

---

### Task 6: Full verification and browser smoke test

**Files:**
- Modify only if verification exposes a defect in the scoped implementation.

**Interfaces:**
- Verifies the completed manual-refresh flow end to end.

- [ ] **Step 1: Run the complete test suite**

Run: `corepack pnpm --filter @workspace/bitcraft-local test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the production build**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 3: Start the stable smoke server**

Run: `node scripts/start-bitcraft-local-smoke.mjs --force-restart`

Expected: command returns promptly and `curl.exe -s http://127.0.0.1:18449/api/local/health` reports `ok: true`.

- [ ] **Step 4: Browser-check the refresh lifecycle**

Verify Dashboard, Craft Planning, Production, Empires, and one open Member or Inventory detail:

- one click preserves current content and shows the rotating refresh icon;
- live network requests carry one shared UUID;
- the icon stops after all active-page work settles;
- the button remains disabled with a countdown for the remainder of 15 seconds;
- a repeated click cannot send another request;
- after 15 seconds a new click receives a new UUID and sends fresh requests;
- navigating during cooldown does not apply the old request to the new page;
- reduced-motion emulation removes rotation.

- [ ] **Step 5: Verify server rejection directly**

Send two forced requests with different UUID headers from the same client inside 15 seconds. Confirm the second returns `429`, `Retry-After`, and `source: manual-refresh-guard`. Confirm repeated same-UUID calls stop at 40.

- [ ] **Step 6: Inspect the final diff**

Run: `git diff --check HEAD~5..HEAD` and `git status --short`.

Expected: no whitespace errors and no generated logs, databases, or smoke-server files staged.
