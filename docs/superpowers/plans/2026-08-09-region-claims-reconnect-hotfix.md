# Regional Claims Reconnect Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make regional claims recover authoritatively after a Relay disconnect without creating one username subscription per claim.

**Architecture:** `RelayRegionClaimsSession` will use one confirmed four-table regional subscription and publish only after that subscription applies. `RelayRegionClaimsRuntime` will store the repository generation used by `domain_payload_current` in subscription health, making the route's snapshot and heartbeat generations directly comparable.

**Tech Stack:** Node.js 24+, TypeScript, generated SpacetimeDB bindings, `node:test`, built-in SQLite.

## Global Constraints

- Retain the 12,000-row regional apply guard.
- Preserve last-good data and its error until a complete replacement snapshot commits.
- Do not change HTTP interfaces or database schemas.
- Do not send Discord notifications or modify market history.
- Do not deploy or restart production without separate authorization.

---

### Task 1: Single authoritative regional subscription

**Files:**
- Modify: `apps/bitcraft-local/test/region-claims-session.test.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/regionClaimsSession.ts`

**Interfaces:**
- Consumes: generated regional binding tables and `normalizeRegionalClaims(...)`.
- Produces: one `RegionalClaimsSnapshot` after the four-table subscription applies.

- [ ] **Step 1: Write the failing test**

Extend the session fixture to capture subscribed query arrays and add assertions equivalent to:

```js
assert.deepEqual(subscribedQueries, [[
  "SELECT * FROM claim_state",
  "SELECT * FROM claim_local_state",
  "SELECT * FROM building_claim_desc",
  "SELECT * FROM player_username_state",
]]);
assert.equal(snapshots.length, 1);
assert.equal(snapshots[0].data.claims[0].ownerPlayerUsername, "Modular");
```

Add a username-table update assertion proving a second snapshot is queued without creating another subscription.

- [ ] **Step 2: Run test to verify it fails**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local test -- region-claims-session.test.mjs
```

Expected: FAIL because the session currently creates separate base and per-owner subscriptions.

- [ ] **Step 3: Write minimal implementation**

In `RelayRegionClaimsSession`:

- Subscribe once to the four confirmed queries.
- On apply, attach listeners and call `#applySnapshot(connection)` directly.
- Attach the same coalesced snapshot callback to all four cached tables.
- Remove owner subscription handles, owner epochs, owner refresh queues, and their teardown logic.
- Keep the existing normalization and row-budget checks unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run the same focused test command and expect all session tests to pass without Relay SDK warnings.

- [ ] **Step 5: Commit**

```sh
git add apps/bitcraft-local/test/region-claims-session.test.mjs apps/bitcraft-local/src/server/game-data/regionClaimsSession.ts
git commit -m "fix: collapse regional claims subscriptions"
```

### Task 2: Comparable reconnect health generations

**Files:**
- Modify: `apps/bitcraft-local/test/region-claims-runtime.test.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/regionClaimsRuntime.ts`

**Interfaces:**
- Consumes: `currentStateRepository.nextGeneration(claimId)`.
- Produces: `provider_subscription_health.generation` equal to the committed `domain_payload_current.generation`.

- [ ] **Step 1: Write the failing test**

Capture committed generations and health writes. Use a repository generation such as `7_460_995` while the session snapshot generation is `1`, then assert:

```js
assert.equal(writes[0].generation, 7_460_995);
assert.equal(healthWrites.at(-1).generation, 7_460_995);
assert.equal(healthWrites.at(-1).connected, true);
assert.equal(healthWrites.at(-1).lastError, null);
```

Add a disconnect/reconnect case in which the failed heartbeat remains errored until the replacement session publishes, then becomes clean at the new repository generation.

- [ ] **Step 2: Run test to verify it fails**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local test -- region-claims-runtime.test.mjs
```

Expected: FAIL because health currently stores the session-local generation.

- [ ] **Step 3: Write minimal implementation**

Assign `const storedGeneration = currentStateRepository.nextGeneration(claimId)` before commit, use it in the batch, and set `#lastGeneration = storedGeneration` only after commit succeeds. Persist clean connected health from that successful commit; startup socket connection alone must not clear the previous failed state.

- [ ] **Step 4: Run test to verify it passes**

Run the runtime test and the repository/route test:

```sh
corepack pnpm --filter @workspace/bitcraft-local test -- region-claims-runtime.test.mjs game-data-repository-route.test.mjs
```

Expected: PASS with heartbeat and snapshot generations aligned.

- [ ] **Step 5: Commit**

```sh
git add apps/bitcraft-local/test/region-claims-runtime.test.mjs apps/bitcraft-local/src/server/game-data/regionClaimsRuntime.ts
git commit -m "fix: align regional claims heartbeat generation"
```

### Task 3: Verification and review

**Files:**
- Review all files changed from `origin/main`.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a committed, release-ready hotfix with no production mutation.

- [ ] **Step 1: Run focused verification**

```sh
corepack pnpm --filter @workspace/bitcraft-local test -- region-claims-session.test.mjs region-claims-runtime.test.mjs game-data-repository-route.test.mjs
```

- [ ] **Step 2: Run full verification**

```sh
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 3: Review the branch**

Review `origin/main...HEAD` for both repository standards and the approved design. Resolve every Critical or Important finding and rerun affected checks.

- [ ] **Step 4: Inspect final state**

```sh
git diff --check origin/main...HEAD
git status --short
```

Expected: no whitespace errors and a clean worktree.
