# Whole-App Performance and Reliability Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Restore complete Relay catalog ingestion, close the highest-risk correctness and durability gaps, reduce avoidable data work, and make data quality and performance measurable without broad application rewrites.

**Architecture:** Preserve the provider-neutral Relay seam, per-domain last-good publication, specialized market/map APIs, and plain React/SQLite stack. Add durable hand-offs and explicit metadata at existing seams; replace repeated scans with compact indexed views; make refresh invalidation domain-aware; and introduce retention only through an observable, backup-gated rollout.

**Tech Stack:** Node.js 24, React, TypeScript, Vite, Node HTTP, node:sqlite, official SpacetimeDB SDK/CLI 2.7.0, pnpm, Node test runner, plain CSS.

**Spec:** docs/reviews/2026-08-21-whole-app-developer-guide-and-review.md

## Implementation status — reconciled 22 August 2026

The task bodies below preserve the original implementation instructions. Their
checkboxes now distinguish completed repository work from deployment,
observation, owner-approval, production-backup, and browser-evidence gates that
remain open. “Complete” in this matrix means implemented and locally verified;
it does not mean deployed to production.

| Task | Repository outcome | Commits | Remaining external or observational gates |
| --- | --- | --- | --- |
| 1 | Complete: schema diagnostics and typed heartbeats are durable; fresh live schemas were captured; global and regional live verification passed; six domains, including buildings, were recovered in the built smoke | `46ae9981`, `5bbe9fbc`, `c1c55756` | Re-run live verification whenever Relay schema/topology changes; the fail-closed gate remains authoritative |
| 2 | Complete: game data is claim/panel scoped and late completions cannot cross scopes | `c3e8f597`, `a7907718` | Broad interactive throttled-navigation smoke was unavailable; focused behavior and build evidence exists |
| 3 | Complete locally: trusted-proxy resolution, bounded telemetry, report-only profiles, and enforced global concurrency gates are implemented | `23538446`, `c187f7f2`, `8dc34e3b`, `71f8798e` | Inspect deployed Caddy, run public spoof probes, collect the first seven-day report-only window, choose limits, then collect the post-enforcement seven-day window; client profiles remain report-only |
| 4 | Complete: Discord rows use atomic renewable SQLite leases with token-conditioned completion and at-least-once semantics | `591978d2`, `83cf98fd`, `64676561` | No real Discord delivery was tested; the external acknowledgement duplicate window remains inherent |
| 5 | Complete: responses expose local generation coherence, exact dependencies, and bounded per-domain quality preserved into React | `a0def33a`, `22ffc8a2`, `0caed25f` | No claim of simultaneous upstream observation; broad fresh/partial/unavailable browser smoke was unavailable |
| 6 | Complete: winning market generations and compact transitions commit atomically; a leased worker dispatcher applies idempotent history/activity/Discord enqueue after restart | `8846d152`, `acf658c7` | Network delivery remains outside the dispatcher and was not exercised against real Discord |
| 7 | Complete: 20 favorite identities use one bounded typed request and a generation/scope cache; retained benchmark proves parity and reduced request/CPU/byte shape | `bd65be0c`, `5a4546c4` | Production/staging latency evidence remains open; the favorite profile remains report-only |
| 8 | Complete: exact history ownership and domain-scoped generation watchers now cover provider-neutral pages with hidden-tab and retry safeguards | `41a165db`, `f827ac23`, `f865e716`, `a24ead2e`, `d5d737b9` | Named-page browser/telemetry smoke was blocked locally; behavior is covered by focused tests |
| 9 | Complete: navigation cache is scope-safe, LRU-bounded to 8 entries/4 MiB with a 5-minute TTL, and refuses oversized/unknown entries | `36105a67`, `285d1f0f`, `9cbe56ce`, `5237e988`, `dd579fe5` | Full route-loop heap/browser evidence remains open |
| 10 | Complete only for disabled/report-only machinery: rollups, diagnostics, dry-run, backup checks, and fail-closed readers are implemented; enabled defaults false, allowlist is empty, and no prune route exists | `61220153`, `d4f0f67d`, `b825419b`, `f02b8e18`, `8ea15c6c`, `38ceea1b` | Production baseline, complete reader parity, per-table product/dependency/legal approval, approved production backup root plus verified restore, seven dry-run days, deployment approval, and any later enablement remain open |
| 11 | Complete: one public bootstrap resolves config/auth/legal/build before claim hooks; operational popups use the shared Dialog; protected bot settings remain authenticated | `1c96b789`, `97548b36`, `0e550501` | No separate in-app browser click-through was claimed; mounted DOM tests and HTTP smoke provide local evidence |
| 12 | Complete: contributor/operator READMEs and maintained architecture docs were reconciled, including Discord/OAuth/browser-CDN scope and the unresolved license-metadata contradiction | `4324ffbb`, `ffa52550`, `34056c6e`, `a6ab2b4d` | `LICENSE`/`NOTICE` say AGPL-3.0-only while root `package.json` says MIT; maintainer/legal correction remains outside this plan |

No task in this matrix authorizes a production deployment, destructive history
deletion, client rate-limit enforcement, or real Discord delivery.

## Global constraints

- Work in apps/bitcraft-local and directly related documentation only.
- Preserve the fail-closed schema fingerprint gate and durable last-good data.
- Do not import Relay wire records into React or history tables.
- Preserve decimal-string 64-bit IDs and typed item/cargo identity.
- Keep current-state publication independent from slow history, analytics, and Discord delivery.
- Do not send real Discord notifications during tests.
- Do not enable destructive retention until dry-run evidence, rollup verification, and a verified backup exist.
- Add focused behavioral tests before each implementation change.
- Run the full build and test suite at every phase gate.
- Keep each pull request independently deployable and reversible.
- Do not bundle AppShell or server.mjs cleanup unrelated to the task being implemented.

## Dependency and delivery map

    Task 1: schema diagnostics and binding recovery
       |
       +------------------------------+
                                      |
    Task 2: scope-safe browser data   |
    Task 3: telemetry/trusted limits -+--> Task 7: favorite quote batching
    Task 4: Discord leasing ----------+--> Task 6 delivery activation
    Task 5: generation/domain status -+--> Task 8: refresh/request waste
    Task 2 + Task 8 --------------------> Task 9: bounded browser cache
    Task 3 telemetry ------------------> Task 10: retention and rollups
    Task 2 + Task 5 -------------------> Task 11: popup/bootstrap UX

Tasks 2, 3, 4, and 5 can be developed independently while fresh schema capture/regeneration is under way; public-route telemetry and proxy hardening do not need to wait for external binding recovery. Task 6's durable SQLite work can be developed independently, but its Discord delivery activation must not be deployed before Task 4. Task 7 should use Task 3 metrics. Task 8 follows Task 5 to avoid conflicting AppShell contract edits. Task 10 is deliberately last because it can delete historical data.

---

### Task 1: Make schema health truthful and recover the global catalog

**Files:**

- Modify: apps/bitcraft-local/src/server/game-data/topology.ts
- Modify: apps/bitcraft-local/src/server/game-data/persistedRuntimeHealth.ts
- Modify: apps/bitcraft-local/src/server/game-data/globalCatalogRuntime.ts
- Modify: apps/bitcraft-local/src/server/schemaBootstrap.mjs
- Modify: apps/bitcraft-local/src/server/schemaMigrations.mjs
- Modify: apps/bitcraft-local/src/server/game-data/bindings/schema-manifest.json
- Replace only when changed: apps/bitcraft-local/src/server/game-data/bindings/global/
- Replace only when changed: apps/bitcraft-local/src/server/game-data/bindings/regional/
- Modify: apps/bitcraft-local/server.mjs
- Modify: apps/bitcraft-local/test/relay-topology-http.test.mjs
- Modify: apps/bitcraft-local/test/persisted-runtime-health.test.mjs
- Modify: apps/bitcraft-local/test/relay-schema-manifest.test.mjs
- Modify: apps/bitcraft-local/test/global-catalog-runtime.test.mjs
- Modify: apps/bitcraft-local/test/server-schema-bootstrap.test.mjs
- Modify: apps/bitcraft-local/test/server-schema-migrations.test.mjs
- Reference procedure: docs/superpowers/plans/2026-08-17-refresh-relay-bindings.md

**Interfaces:**

- Add a SchemaFingerprintDiagnostic value with sourceKey, schemaUrl, expected, observed, attemptedAt, status, and error.
- Persist typed subscription heartbeat independently from Relay HTTP provider health. Add runtime_state to provider_subscription_health with connected, disconnected, and blocked_by_schema values.
- Keep assertSchemaFingerprint as a hard gate.
- Update schema-manifest fingerprints to the SHA-256 of exact live version-9 schema response bytes.

- [x] **Step 1: Write failing topology and health tests**

Add cases that prove:

- a schema download error is retained with URL, time, and cause;
- an expected/observed mismatch is shown explicitly;
- recent HTTP polling cannot make a disconnected typed global subscription appear connected;
- secrets and full schema payloads are never included in public/admin health.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/relay-topology-http.test.mjs test/persisted-runtime-health.test.mjs

Expected: FAIL because the diagnostic fields and separate typed heartbeat are absent.

- [x] **Step 2: Implement the smallest diagnostic contract**

Have topology discovery preserve fingerprint failures rather than replacing them with a null fingerprint. Add runtime_state TEXT NOT NULL DEFAULT 'disconnected' to provider_subscription_health through an additive migration, persist blocked_by_schema when fingerprint gating prevents startup, and keep the last heartbeat separate from Relay HTTP health. Persist the diagnostic in provider_source_health.details_json. Update Admin health composition to derive values dynamically:

    source: global
    typedState: blocked_by_schema
    expectedFingerprint: manifest.schemas.global.fingerprint
    observedFingerprint: latestTopology.global.schemaFingerprint
    attemptedAt: diagnostic.attemptedAt
    error: Relay global schema fingerprint mismatch

Redact URLs only if they can contain credentials; normal Relay source URLs are operational metadata.

- [x] **Step 3: Run focused diagnostics tests**

Run the command from Step 1. Expected: PASS.

- [x] **Step 4: Capture exact live schema evidence**

Follow the capture and pinned-generator verification in docs/superpowers/plans/2026-08-17-refresh-relay-bindings.md:

- discover the ready global and regional databases from Relay topology;
- download exact /schema?version=9 response bytes;
- calculate SHA-256;
- require agreement with the topology fingerprint;
- wrap each response in the v9 RawModuleDef shape;
- verify the pinned SpacetimeDB 2.7.0 executable and archive hash.

Record the observed fingerprints in the manifest fixture before generation. Do not weaken or bypass the runtime gate.

- [x] **Step 5: Generate into fresh staging directories**

Use the pinned CLI command shape:

    spacetime generate --lang typescript --module-def tmp/relay-bindings/global-schema-v9.json --out-dir tmp/relay-bindings/global-stage --yes --no-config
    spacetime generate --lang typescript --module-def tmp/relay-bindings/regional-schema-v9.json --out-dir tmp/relay-bindings/regional-stage --yes --no-config

Regenerate only a binding directory whose fresh captured hash changed. The dated 21 August smoke evidence indicates that global is likely to change, but the new capture is authoritative. Regenerate regional only if its newly captured hash differs from 3d0b4c9bba59f7b1daad5122369599ea557e333124c4f778079a45af1683f65b.

- [x] **Step 6: Validate before replacement**

Compile staged bindings, apply the documented PlayerVoteAnswer repair only if the current generated output still needs it, then atomically replace the changed tracked directory. Update capturedAt, fingerprints, hashes, database identity, and generated file counts in schema-manifest.json.

- [x] **Step 7: Run focused and full verification**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/relay-schema-manifest.test.mjs test/global-catalog-session.test.mjs test/global-catalog-runtime.test.mjs test/server-schema-bootstrap.test.mjs test/server-schema-migrations.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test
    corepack pnpm --filter @workspace/bitcraft-local run verify:relay-global-live
    corepack pnpm --filter @workspace/bitcraft-local run verify:relay-region-live

Expected: build and tests pass; live global and primary-region subscriptions apply without a fingerprint mismatch.

- [x] **Step 8: Verify recovered user data**

On a built smoke server, request skills, buildings, research, public-crafts, market, and region domains. Confirm:

- global typed health is connected/applied;
- skills and buildings are no longer unavailable unless a new source-specific error explains why;
- warning counts materially fall or are grouped into actionable classes;
- last-good data was never cleared during recovery.

Do not bump the version or changelog until this task is explicitly prepared for release.

---

### Task 2: Prevent previous page or claim data from entering a new scope

**Files:**

- Modify: apps/bitcraft-local/src/api/gameDataLoader.ts
- Modify: apps/bitcraft-local/src/types/app.ts
- Modify: apps/bitcraft-local/src/AppShell.tsx
- Create: apps/bitcraft-local/test/game-data-loader-scope.test.mjs
- Modify: apps/bitcraft-local/test/appshell-navigation-boundary.test.mjs

**Interfaces:**

- Add scopeKey to the game-data loader state.
- Preserve retained data only when state.scopeKey equals requested claimId:panel.
- Allow a matching cache entry to seed the new scope.
- Expose a bounded reset helper only if needed by tests; do not add a browser-global testing API.

- [x] **Step 1: Write the failing scope transition test**

Cover these transitions:

1. dashboard claim A succeeds;
2. members claim A has no cache and must immediately expose loading with data null;
3. dashboard claim A retains its own data during a refresh;
4. dashboard claim B must never expose claim A data;
5. a matching members claim A cache entry may be shown immediately.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-data-loader-scope.test.mjs

Expected: FAIL because loader state is not scope-tagged.

- [x] **Step 2: Implement scope-tagged state**

On claimId or activePanel change:

- calculate requestedScopeKey;
- if a matching cache entry exists, set that data with the new scope;
- if not, set loading true, error null, data null, and the new scope;
- on fetch completion, ignore results whose scope no longer matches;
- on same-scope refresh, retain data and update loading/error only.

AppShell must compose a page only from data whose scopeKey matches its active claim/page.

- [x] **Step 3: Run focused tests and build**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-data-loader-scope.test.mjs test/appshell-navigation-boundary.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build

Expected: PASS.

- [ ] **Step 4: Browser smoke the risk path**

Open evidence gate: browser-control setup was unavailable. Focused loader and
AppShell behavior, build, and API health passed; no interactive throttled
navigation result is claimed.

Using the built smoke server:

- navigate Dashboard -> Inventory -> Members on first visits;
- change the configured claim in an isolated test database if available;
- throttle the game-data request;
- confirm a skeleton/retained same-scope page appears, never a previous route or claim.

---

### Task 3: Measure hot routes, trust proxy identity explicitly, and stage protective limits

**Files:**

- Modify: apps/bitcraft-local/src/server/httpRateLimit.mjs
- Create: apps/bitcraft-local/src/server/routePerformance.mjs
- Modify: apps/bitcraft-local/server.mjs
- Modify: apps/bitcraft-local/src/server/serverHealth.mjs
- Modify: apps/bitcraft-local/src/components/admin/ServerHealthSection.tsx
- Modify: apps/bitcraft-local/test/server-http-rate-limit.test.mjs
- Create: apps/bitcraft-local/test/server-route-performance.test.mjs
- Modify: apps/bitcraft-local/test/server.test.mjs
- Modify: apps/bitcraft-local/test/server-health.test.mjs
- Modify: deploy/Caddyfile.example

**Interfaces:**

- requestAddress(req, { trustedProxyAddresses }) uses X-Forwarded-For only when the socket peer is trusted.
- createRoutePerformanceTelemetry({ maxEntries }) records bounded path, status, durationMs, responseBytes, and projectionMs values.
- Add dedicated burst/sustained policies gameDataRead, orderBookRead, and favoriteQuotesRead rather than reusing one ambiguous bucket.
- createHeavyRouteGate({ maxConcurrent, maxQueued }) bounds total concurrent projections independently of client identity.

- [x] **Step 1: Write trusted-proxy tests**

Prove:

- loopback proxy plus X-Forwarded-For returns the first forwarded client;
- an untrusted remote peer ignores a spoofed X-Forwarded-For;
- IPv4-mapped loopback is trusted;
- an empty header falls back to remoteAddress.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-http-rate-limit.test.mjs

Expected: FAIL on the untrusted-peer case.

- [x] **Step 2: Implement explicit proxy trust**

Default trusted peers to 127.0.0.1, ::1, and ::ffff:127.0.0.1. Allow an explicit deployment setting for additional reverse-proxy peers. Update and test deploy/Caddyfile.example so Caddy explicitly overwrites the forwarding header at the proxy boundary; do not merely assume the current example does so. In staging and production, inspect the deployed Caddy config and send a spoofed forwarding-header probe through the public proxy to prove runtime parity with the example.

- [x] **Step 3: Write route telemetry tests**

Use a fake response to prove:

- content-length is recorded when supplied;
- JSON response byte count is recorded by the send helper when not predeclared;
- projection timing is separate from total request timing;
- only normalized paths are retained, never claim IDs, item IDs, cookies, or query strings;
- the ring buffer remains capped.

- [x] **Step 4: Implement bounded telemetry**

Instrument:

- /api/local/game-data,
- /api/local/market/overview,
- /api/local/market/order-book,
- the future favorite-quotes route,
- /api/local/history,
- /api/local/admin/server-health.

Expose p50/p95/p99 duration, response bytes, status/429 counts, and sample count in authenticated Server Health. Do not expose user identifiers or raw query strings.

- [x] **Step 5: Add report-only route profiles and a global concurrency gate**

Start with these report-only client profiles:

- gameDataRead: burst 12, sustained 90 per minute;
- orderBookRead before Task 7: burst 25, sustained 120 per minute;
- orderBookRead after Task 7: burst 8, sustained 60 per minute;
- favoriteQuotesRead after Task 7: burst 8, sustained 60 per minute.

Record would-limit decisions without returning 429 for seven days. In parallel, bound server-wide projection concurrency to 8 active game-data requests and 8 active market projection requests, with at most 16 queued in each class. When a queue is full, return 503 with Retry-After: 1. This protects CPU/memory even if per-client identity is distributed or spoofed.

After seven report-only days, set enforced burst and sustained values to at least 25 percent above the observed legitimate p99 profile, never below the documented normal scripted flow. Preserve Retry-After and x-rate-limit-source. Do not describe the per-client policy as protective until Task 7 removes the favorites fan-out and enforcement is enabled.

- [x] **Step 6: Add endpoint tests**

Prove each policy records would-limit in report-only mode, returns 429 only after enforcement and exhaustion, and cannot be bypassed by normal refresh headers. Prove the global gate caps active work, queues only 16, and returns bounded 503 responses beyond that. Add a response-size assertion helper but do not make current smoke sizes a permanent budget yet.

- [x] **Step 7: Run local automated verification**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-http-rate-limit.test.mjs test/server-route-performance.test.mjs test/server-health.test.mjs test/server.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test

Deploy report-only profiles first. After enforcement, begin a second seven-day observation window and require fewer than 0.1 percent legitimate same-origin refresh attempts to receive 429, with zero 429 responses in the scripted normal-flow smoke. Revert to report-only if that gate is missed.

- [ ] **External rollout gate:** inspect staging/production Caddy, run public
  spoof probes, collect seven report-only days, approve thresholds, enable
  client-profile enforcement, and pass the second seven-day observation window.

---

### Task 4: Atomically lease Discord notification rows

**Files:**

- Create: apps/bitcraft-local/src/server/discordOutboxLease.mjs
- Modify: apps/bitcraft-local/src/server/schemaBootstrap.mjs
- Modify: apps/bitcraft-local/src/server/schemaMigrations.mjs
- Modify: apps/bitcraft-local/src/server/preparedStatements.mjs
- Modify: apps/bitcraft-local/server.mjs
- Create: apps/bitcraft-local/test/server-discord-outbox-lease.test.mjs
- Modify: apps/bitcraft-local/test/server-discord-outbox-storage.test.mjs
- Modify: apps/bitcraft-local/test/server-discord-sandbox-integration.test.mjs

**Interfaces:**

- createDiscordOutboxLeaser(db, { workerId, leaseMs, now })
- claimNext({ maxAttempts }): LeasedDiscordNotification | null
- markSent({ id, leaseToken, response, finishedAt })
- markSkipped({ id, leaseToken, reason, finishedAt })
- markFailed({ id, leaseToken, error, retryAt, finishedAt })
- recoverExpiredLeases(at)

The leased row includes id, leaseToken, lockedBy, lockedAt, and leaseExpiresAt.

The lease duration must exceed the configured Discord request timeout plus completion-write margin. If a delivery can legitimately run longer, renew the lease conditionally by leaseToken before expiry.

- [x] **Step 1: Write concurrency and recovery tests**

With two leaser instances over the same SQLite database, prove:

- only one worker can claim one eligible row;
- a second worker gets a different row or null;
- a non-expired lease is not reclaimed;
- an expired lease returns to eligible state;
- a stale lease token cannot mark a row sent;
- attempts increase once per claimed delivery attempt;
- sent rows are never reclaimed;
- lease duration/renewal covers the outbound request timeout.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-discord-outbox-lease.test.mjs

Expected: FAIL because the leaser does not exist.

- [x] **Step 2: Add safe additive schema**

Reuse locked_at and add:

- locked_by TEXT,
- lease_token TEXT,
- lease_expires_at TEXT.

Add an index supporting status, next_attempt_at, lease_expires_at, and id. Migrations must preserve existing rows and make pending/failed rows immediately eligible.

- [x] **Step 3: Implement atomic claiming**

Use a short BEGIN IMMEDIATE transaction:

1. select the oldest eligible pending/failed row below max attempts;
2. conditionally update it to sending with a new random lease token and expiry;
3. return the row only when the update changes one row;
4. commit before any network call.

Delivery happens outside the transaction. Every completion update must include WHERE id = ? AND lease_token = ? AND status = 'sending'.

This guarantees one active claimant, not exactly-once external delivery. A crash after Discord accepts a request but before markSent can cause an at-least-once retry. Preserve the canonical cutover unknown-outcome suppression and expose duplicate-risk diagnostics.

- [x] **Step 4: Replace the process-local selection path**

processDiscordNotificationOutbox may retain its process-local boolean as a cheap optimization, but correctness must come from leases. The canonical cutover special case should use the same generic lease protocol while preserving its unknown-outcome retry suppression.

- [x] **Step 5: Verify without real Discord**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-discord-outbox-lease.test.mjs test/server-discord-outbox-storage.test.mjs test/server-discord-sandbox-integration.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test

Use the local fake Discord origin only.

---

### Task 5: Expose generation coherence and preserve per-domain quality in React

**Files:**

- Modify: apps/bitcraft-local/src/server/game-data/contracts.ts
- Modify: apps/bitcraft-local/src/server/game-data/gameDataRoute.ts
- Modify: apps/bitcraft-local/src/server/catalogRepository.mjs
- Modify: apps/bitcraft-local/src/api/gameData.ts
- Modify: apps/bitcraft-local/src/api/gameDataLoader.ts
- Modify: apps/bitcraft-local/src/types/app.ts
- Modify: apps/bitcraft-local/src/AppShell.tsx
- Modify: apps/bitcraft-local/test/game-data-repository-route.test.mjs
- Modify: apps/bitcraft-local/test/provider-catalog-repository.test.mjs
- Modify: apps/bitcraft-local/test/page-game-data-warnings.test.mjs
- Create: apps/bitcraft-local/test/game-data-client-contract.test.mjs

**Interfaces:**

Add a backward-compatible response meta structure:

    meta: {
      coherence: "coherent" | "mixed" | "unavailable",
      availableGenerations: number[],
      newestGeneration: number | null,
      oldestGeneration: number | null
    }

Each domain status exposes:

    {
      generation,
      freshness,
      confidence,
      ageMs,
      warnings,
      provenance,
      dependencies
    }

Catalog-enriched domains declare catalog: { generation, sourceKey, receivedAt }. inventories additionally declares inventory-banks, and crafts declares public-crafts when that supplemental projection is composed.

The flattened legacy data fields remain during migration.

Coherence means only that all returned application envelopes and their declared enrichment dependencies came from the same local application commit/generation. It does not claim that upstream sources observed the world at the same instant. Individual source/receive timestamps remain authoritative.

- [x] **Step 1: Write server contract tests**

Prove:

- two domains from one batch are coherent;
- independently current generations are mixed;
- an unavailable domain does not make available coherent domains mixed;
- every requested-but-missing domain has an explicit unavailable status with generation null;
- inventories declares the inventory-banks enrichment generation;
- crafts declares the public-crafts enrichment generation when that supplemental data is composed;
- inventory and craft responses declare the global catalog repository generation/revision used for request-time labels and descriptions;
- matching primary envelopes enriched with a different catalog revision are mixed;
- a primary envelope and differently generated enrichment dependency are mixed;
- age-stale without lastError remains visible in domain status;
- generation and provenance are present for stale last-good envelopes.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-data-repository-route.test.mjs

Expected: FAIL because response coherence is absent.

- [x] **Step 2: Add server metadata without changing availability semantics**

Do not force domains into one transaction or blank partial data. Expose the current catalog repository metadata from catalogRepository.mjs and compute local application-commit coherence from available envelope generations plus catalog, inventory-banks, and public-crafts dependency revisions. A request-time enrichment revision that was not part of the same local composite read must make the response mixed. Preserve individual sourceObservedAt/receivedAt so consumers cannot mistake local coherence for upstream temporal consistency. Keep HTTP 200/503 behavior unchanged.

- [x] **Step 3: Write client contract tests**

Prove loadGameData returns:

- flattened data for existing pages,
- domainStatus keyed by every requested domain, including unavailable domains,
- responseMeta,
- global stale when any requested available domain is stale,
- exact unavailable/partial warnings without discarding them.

- [x] **Step 4: Preserve and present domain status**

Store domainStatus in gameDataLoader. AppShell should show a concise summary such as:

    Research stale (4m); Market partial (88 warnings)

Use an expandable details area for provenance and warning samples. Do not render hundreds of duplicate warnings; group by stable warning code/message and show count plus up to three examples.

At least Dashboard, Professions, Research, Local Market, Region, and Public Craft Finder should label their affected panels in the same delivery or in immediately following page-specific commits.

- [x] **Step 5: Run automated verification**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-data-repository-route.test.mjs test/provider-catalog-repository.test.mjs test/game-data-client-contract.test.mjs test/page-game-data-warnings.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test

Browser-smoke one fresh, one partial, and one unavailable domain.

- [ ] **Browser evidence gate:** fresh/partial/unavailable rendered states were
  not interactively smoked because the local Windows process/browser path was
  unavailable. Contract, presentation-model, full-suite, and build evidence is
  recorded in the Task 5 report.

---

### Task 6: Make local-market transitions restart-safe

**Activation dependency:** The durable SQLite implementation can be developed independently. Enable its Discord delivery path only after Task 4; use Task 5 generation metadata where practical.

**Files:**

- Modify: apps/bitcraft-local/src/server/game-data/claimMarketRuntime.ts
- Modify: apps/bitcraft-local/src/server/game-data/currentStateRepository.ts
- Modify: apps/bitcraft-local/src/server/relayMarketTransitions.mjs
- Modify: apps/bitcraft-local/src/server/schemaBootstrap.mjs
- Modify: apps/bitcraft-local/src/server/schemaMigrations.mjs
- Create: apps/bitcraft-local/src/server/marketTransitionDispatcher.mjs
- Modify: apps/bitcraft-local/server.mjs
- Modify: apps/bitcraft-local/test/claim-market-runtime.test.mjs
- Modify: apps/bitcraft-local/test/game-data-repository-route.test.mjs
- Modify: apps/bitcraft-local/test/relay-market-transitions.test.mjs
- Create: apps/bitcraft-local/test/market-transition-dispatcher.test.mjs

**Interfaces:**

- claimMarketRuntime commits the market DomainSnapshotBatch with one ProviderTransition in the same transaction.
- commitGenerationWithTransition returns { published, changedDomains, generation }; published is true only when the market upsert advanced current state and the transition row was inserted.
- Transition key: claim-market:{claimId}:market:{generation}.
- Payload version 1 contains claimId, generation, observedAt, and compact derived transition events, not full previous/current snapshots.
- createMarketTransitionDispatcher({ repository, writer, workerId, leaseMs, now, retryPolicy }) exposes drain({ claimId, limit }).
- CurrentStateRepository exposes claimPendingTransition, renewTransitionLease, ackTransition with leaseToken, recordTransitionError with leaseToken, and expired-lease recovery.
- The writer exposes applyDerived({ claimId, events, observedAt, manageTransaction }) while retaining apply for compatibility.
- The dispatcher writes idempotent history/activity/Discord-enqueue effects and conditionally acknowledges the leased provider transition in one SQLite transaction.

- [x] **Step 1: Write the crash-window test**

Simulate:

1. a previous market generation exists;
2. a new snapshot is applied;
3. the process stops immediately after repository commit and before side-effect dispatch;
4. a new repository/dispatcher instance starts;
5. the pending transition writes market_events, market_trades when evidence proves a sale, activity_events, and Discord outbox rows;
6. the transition is acknowledged;
7. a second drain inserts nothing and enqueues nothing;
8. two dispatcher instances cannot claim the same transition;
9. an expired transition lease recovers, while a stale lease token cannot acknowledge it.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/claim-market-runtime.test.mjs test/market-transition-dispatcher.test.mjs

Expected: FAIL because claimMarketRuntime only calls commitGeneration and an in-memory callback.

- [x] **Step 2: Separate derivation from writing**

Reuse deriveRelayMarketTransitions before the current-state commit. Add applyDerived to write an already validated compact event list. It owns a transaction by default and can join the dispatcher's existing transaction when manageTransaction is false. Preserve current source_key/trade_id idempotency.

The transition payload must not contain:

- full market snapshots,
- user secrets,
- guessed purchaser identity,
- or inferred sales without closed-listing evidence.

- [x] **Step 3: Commit generation and transition atomically**

Replace commitGeneration with commitGenerationWithTransition in claimMarketRuntime. Have the repository return an explicit published result. Insert the transition only when the market-domain upsert actually wins and advances current state; a stale/equal rejected generation returns published false and must not create a transition row. Publish the current generation after commit as today. Trigger the dispatcher asynchronously; failure records attempts/lastError and leaves the row pending.

- [x] **Step 4: Lease provider transitions atomically**

Add locked_by, lease_token, locked_at, and lease_expires_at to provider_transition_outbox through an additive migration. Claim with BEGIN IMMEDIATE and conditional updates, complete by matching leaseToken, and recover expired leases. Test with two repository/dispatcher instances over one real SQLite file.

- [x] **Step 5: Start one worker-owned dispatcher**

Start a bounded drain loop in the worker role. A web-process kick may wake work only through the same repository lease rules. For each claimed row, start one SQLite transaction, call applyDerived with manageTransaction false, conditionally delete the transition by transition_key plus lease_token, and commit. Roll back both effects and acknowledgement on any error. Use batches no larger than 25 and exponential retry capped at five minutes.

Do not replay arbitrary historical snapshots. Only process version-1 durable transition rows created after this cutover.

- [x] **Step 6: Integrate Discord safely**

applyDerived may enqueue Discord rows inside the same durable side-effect transaction. Actual network delivery occurs later through the leased outbox from Task 4. Never call Discord during the provider commit.

- [x] **Step 7: Verify**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/claim-market-runtime.test.mjs test/game-data-repository-route.test.mjs test/relay-market-transitions.test.mjs test/market-transition-dispatcher.test.mjs test/server-schema-bootstrap.test.mjs test/server-schema-migrations.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test

Add a bounded restart smoke using a temporary SQLite database and record-mode Discord. Confirm current market publication is not delayed by dispatcher failure.

---

### Task 7: Replace the 20-request market favorites fan-out

**Depends on:** Task 3 telemetry.

**Files:**

- Modify: apps/bitcraft-local/src/server/regionalMarketViews.mjs
- Modify: apps/bitcraft-local/server.mjs
- Modify: apps/bitcraft-local/src/pages/market/globalMarket.ts
- Modify: apps/bitcraft-local/src/pages/market/MarketOverview.tsx
- Modify: apps/bitcraft-local/test/regional-market-views.test.mjs
- Modify: apps/bitcraft-local/test/global-market-data.test.mjs
- Modify: apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
- Modify: apps/bitcraft-local/test/server.test.mjs

**Interfaces:**

- Add POST /api/local/market/favorite-quotes.
- Request:

      {
        "regionId": "19",
        "items": [
          { "itemType": "item", "itemId": "30" },
          { "itemType": "cargo", "itemId": "30" }
        ]
      }

- Limit items to 20, require unique typed identities, and reject a body above 16 KB.
- Response:

      {
        "generation": 123,
        "freshness": "fresh",
        "quotes": {
          "item:30": { "bestSell": "125", "bestBuy": "120", "sellCount": 2, "buyCount": 1 }
        }
      }

- [x] **Step 1: Write the view test**

Build a snapshot containing item:30 and cargo:30 with overlapping numeric IDs. Prove:

- identities never collide;
- the snapshot is indexed once;
- best buy/sell and liquidity counts match the existing order-book view;
- region filters are enforced;
- missing identities return null/zero compact quotes.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/regional-market-views.test.mjs

Expected: FAIL because regionalMarketFavoriteQuotesView is absent.

- [x] **Step 2: Implement one-pass quote indexing**

Filter the active regional-market snapshot once, build a Map keyed by itemType:itemId, and derive only compact quote fields. Cache the resulting index by committed generation plus normalized region scope, with a maximum of eight generation/scope entries and 2 MB estimated index bytes. Invalidate on generation or region-scope change. Keep catalog-derived labels out of this quote cache; if implementation adds any catalog-derived field, include catalog generation/revision in the cache key.

- [x] **Step 3: Add the bounded public route**

Parse a JSON body capped at 16 KB, validate max 20 unique typed identities, apply favoriteQuotesRead rate limiting and the global market projection gate, and return projection timing/bytes through Task 3 telemetry. This is a same-origin read-only projection and does not need CSRF; it must not mutate watches, favorites, or server state.

- [x] **Step 4: Replace client Promise.all**

MarketOverview sends one request per refresh. Keep one AbortController, preserve retained quotes during refresh, and map the response by typed identity. Remove the per-favorite order-book loop.

- [x] **Step 5: Verify parity and performance**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/regional-market-views.test.mjs test/global-market-data.test.mjs test/global-market-ui-boundary.test.mjs test/server.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test

Using 20 favorites, verify one quote request per cycle and record old versus new projection CPU, total requests, bytes, and p95. Success requires identical displayed quotes and materially less total server work.

---

### Task 8: Stop unused history requests and make page invalidation domain-aware

**Depends on:** Complete Task 5's AppShell/client-contract changes first, or isolate this task on a separate branch and rebase before implementation.

**Files:**

- Modify: apps/bitcraft-local/src/api/localHistoryInclude.ts
- Modify: apps/bitcraft-local/src/api/localHistory.ts
- Modify: apps/bitcraft-local/src/refresh/pageRefresh.mjs
- Modify: apps/bitcraft-local/src/refresh/pageRefresh.d.mts
- Modify: apps/bitcraft-local/src/refresh/generationWatcher.mjs
- Modify: apps/bitcraft-local/src/AppShell.tsx
- Modify: apps/bitcraft-local/test/local-history.test.mjs
- Modify: apps/bitcraft-local/test/global-market-routing.test.mjs
- Modify: apps/bitcraft-local/test/page-refresh.test.mjs
- Modify: apps/bitcraft-local/test/appshell-navigation-boundary.test.mjs

**Interfaces:**

- localHistoryIncludeForPanel returns:
  - dashboard -> activity,market,dashboard;
  - activity -> activity;
  - settlement-market -> market;
  - every other page -> empty string.
- useLocalHistory performs no fetch and enrolls no refresh task when include is empty.
- PageRefreshController gains invalidateGeneration() for any non-manual provider page.
- Generation-triggered fetch failures retry at 5, 10, 20, then 30 seconds with single-flight/coalescing; an ordinary interval failure retains its existing next-interval behavior.
- Generation watcher recovery poll:
  - Craft Monitor: 1 second;
  - interval provider pages: 30 seconds;
  - manual/non-provider pages: no watcher.

- [x] **Step 1: Write failing history ownership tests**

Change expectations so Market, Members, Map, Craft Calculator, and Sync return an empty include. Add a fake-fetch test proving no /history request occurs and the page refresh cycle can still complete.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/local-history.test.mjs test/global-market-routing.test.mjs

Expected: FAIL because activity is always included.

- [x] **Step 2: Implement the skip**

Return stable empty local history state for pages that own no history projection. Do not clear Dashboard/Activity/Local Market state during their same-scope refresh.

- [x] **Step 3: Write generation invalidation tests**

Prove:

- a dashboard generation event starts one coalesced generation cycle;
- repeated events while a request is active queue one trailing cycle;
- events for domains outside the current watcher scope do not trigger;
- hidden tabs do not poll;
- visibility catch-up triggers one cycle;
- Craft Calculator and Sync create no watcher;
- the 30-second recovery poll does not replace SSE latency.
- failed generation-triggered cycles use bounded 5/10/20/30-second retry without accumulating requests;
- a later successful cycle resets generation failure backoff.

- [x] **Step 4: Generalize invalidation**

Start one watcher when usesProviderNeutralGameData(activePanel) is true. Pass pageDomains(activePanel), claimId, and the correct poll interval. Add a generation cycle reason to the refresh controller, define the bounded retry above, and keep one trailing invalidation during an active request. Do not change manual refresh cooling or Craft Monitor's near-live behavior.

- [x] **Step 5: Correct architecture documentation**

Update docs/application-overview.md, docs/developer-guide.md, and docs/relay-migration/README.md only after the runtime behavior matches their generation-event claim. If implementation deliberately retains interval-only pages, correct those documents instead.

- [x] **Step 6: Verify structural request reduction**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/local-history.test.mjs test/global-market-routing.test.mjs test/page-refresh.test.mjs test/appshell-navigation-boundary.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test

Smoke Dashboard, Members, Map, Activity, Local Market, Craft Monitor, Calculator, and Sync. Use Task 3 telemetry to confirm unused /history requests disappear.

- [ ] **Browser/telemetry evidence gate:** named-page smoke and live Task 3
  request telemetry were blocked by the local Windows dependency-access issue.
  Focused tests prove the zero-request ownership and watcher contracts.

---

### Task 9: Bound the browser navigation cache

**Depends on:** Task 2 scope safety and Task 3 payload telemetry.

**Files:**

- Modify: apps/bitcraft-local/src/api/gameDataLoader.ts
- Create: apps/bitcraft-local/src/api/pageNavigationCache.ts
- Create: apps/bitcraft-local/test/page-navigation-cache.test.mjs
- Modify: apps/bitcraft-local/test/game-data-loader-scope.test.mjs

**Interfaces:**

- createPageNavigationCache({ maxEntries = 8, maxBytes = 4194304, ttlMs = 300000, now })
- get(scopeKey), set(scopeKey, value), clearClaim(claimId), clear(), stats()
- LRU eviction by last access.
- Entries include claimId, panel, generation/coherence metadata, storedAt, and approximate serialized bytes.

- [x] **Step 1: Write cache behavior tests**

Prove:

- the ninth distinct entry evicts the least recently used when maxEntries is 8;
- entries are also evicted until estimated resident bytes are at or below 4 MB;
- one entry larger than 4 MB is returned to the active caller but is not cached;
- an entry older than five minutes is not returned;
- reading an entry refreshes LRU order but not its absolute TTL;
- clearClaim removes only that claim;
- item/cargo and domain metadata survive unchanged;
- stats report hit, miss, eviction, entries, and approximate bytes.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-navigation-cache.test.mjs

Expected: FAIL because the cache module does not exist.

- [x] **Step 2: Replace the unbounded Map**

Inject the cache into gameDataLoader. Clear the previous claim after a confirmed configuration switch. Keep maxEntries, maxBytes, and TTL as code-level conservative defaults; do not add a user setting. Capture payload bytes from Content-Length or from the already-read response text before JSON.parse. Do not run a second full JSON.stringify solely to estimate cache size.

- [ ] **Step 3: Verify memory and navigation behavior**

Open evidence gate: focused cache/loader checks passed, but the full interactive
route loop and heap measurement were not completed because of the recorded
Windows process/dependency lock.

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-navigation-cache.test.mjs test/game-data-loader-scope.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build

Navigate through every page twice and confirm warm back-navigation remains fast while resident cache entries never exceed eight or 4 MB. Record heap before and after the full route loop.

---

### Task 10: Add operational history retention and rollups safely

**Depends on:** Task 3 telemetry and a verified backup. This task is destructive only after its explicit enable gate.

**Files:**

- Create: apps/bitcraft-local/src/server/operationalHistoryRetention.mjs
- Modify: apps/bitcraft-local/src/server/schemaBootstrap.mjs
- Modify: apps/bitcraft-local/src/server/schemaMigrations.mjs
- Modify: apps/bitcraft-local/src/server/scheduledJobs.mjs
- Modify: apps/bitcraft-local/src/server/defaultAppSettings.mjs
- Modify: apps/bitcraft-local/server.mjs
- Modify: apps/bitcraft-local/src/components/admin/ServerHealthSection.tsx
- Modify: apps/bitcraft-local/src/components/admin/AdminDataSection.tsx
- Create: apps/bitcraft-local/test/server-operational-history-retention.test.mjs
- Modify: apps/bitcraft-local/test/server-schema-bootstrap.test.mjs
- Modify: apps/bitcraft-local/test/server-schema-migrations.test.mjs
- Modify: apps/bitcraft-local/test/server-health.test.mjs
- Modify: apps/bitcraft-local/test/market-analytics.test.mjs
- Modify: apps/bitcraft-local/test/monitoring-history.test.mjs

**Interfaces and policy:**

- operationalHistoryRetentionEnabled defaults to false.
- operationalHistoryRetentionDays defaults to 365 and accepts 90-3650.
- operationalHistoryRetentionTables defaults to an empty allowlist; only tables with recorded owner approval may be added.
- Dry-run is always available and returns counts/oldest timestamps without deleting.
- Add daily rollups needed by existing long-range market/activity/contribution reports before deleting raw rows.
- Delete in bounded batches of at most 5,000 rows per transaction.
- Never delete current state, outbox rows, audit/legal records, or rows newer than the cutoff.

- [ ] **Step 1: Record a production-like baseline**

Before schema or delete code, capture:

- row counts and rows/day for market_events, market_trades, activity_events, and production_contribution_events;
- oldest/newest occurred_at;
- table/index and WAL bytes;
- current backup duration and verification result;
- EXPLAIN QUERY PLAN for market leaderboard, observed trades, activity search, and contribution diagnostics.

For each table, record its product owner and every report, repair, replay, notification, audit, or legal dependency. production_contribution_events must not enter the deletion allowlist while attribution/profession repair needs unrecoverable raw fields. Store only aggregated evidence and approval records in the task/PR; do not commit a database.

- [x] **Step 2: Write dry-run and boundary tests**

Fixture rows at:

- cutoff minus one second,
- exactly cutoff,
- cutoff plus one second,
- multiple claims,
- duplicate source keys,
- rows represented by rollups.

Prove disabled mode and dry-run delete nothing. Prove enabled mode never removes at/after cutoff and uses bounded batches.

- [x] **Step 3: Add rollups**

Create narrow daily aggregate tables only for fields required by existing reports. Keys must include claim, UTC day, typed item identity where relevant, and the dimensions used by the report. Track an idempotent completion watermark per source table/day.

Build and commit rollups first. In a separate transaction, prune only raw periods whose watermark is complete and whose table is in the approved allowlist. A rollup failure must prevent pruning but must not roll back already valid earlier rollups.

Do not copy raw_json into rollups.

- [ ] **Step 4: Replace broad readers**

Partial only: Server Health uses fixed SQL aggregates and market daily readers
use fail-closed hybrid rollup/raw logic. Full parity for all long-range
per-trade and actor-detail consumers is not proven, so no table is approved for
pruning.

- Market leaderboard reads an explicit time window or aggregate table.
- Regional observed trade charts combine retained raw detail with daily rollups and keep observedSince honest.
- Server Health contribution diagnostics use SQL COUNT and conditional SUM/COUNT expressions, never SELECT of every event row.

Add parity tests comparing old fixture results with rollup-backed results.

- [x] **Step 5: Add Admin preview and enable gate**

Admin Database/Health shows:

- oldest row and row count per table,
- estimated rows eligible,
- last dry-run,
- last prune and duration,
- database/WAL bytes,
- backup status,
- configured days and enabled state.

Changing enabled from false to true requires an explicit confirmation plus a backup created within 24 hours whose manifest hash, restored temporary database, and PRAGMA integrity_check have all passed in a machine-recorded verification result.

- [x] **Step 6: Verify locally with deletion disabled**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-operational-history-retention.test.mjs test/server-schema-bootstrap.test.mjs test/server-schema-migrations.test.mjs test/server-health.test.mjs test/market-analytics.test.mjs test/monitoring-history.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test

Deploy with operationalHistoryRetentionEnabled=false. Run dry-run daily for seven days and review counts, report parity, database growth, backup time, and query p95.

- [ ] **Deployment evidence gate:** deploy disabled/report-only machinery and
  collect seven consecutive dry-run days plus production baseline, report
  parity, database/WAL growth, backup duration, and query p95 evidence.

- [ ] **Step 7: Explicitly enable after approval**

Only after per-table owner approval and a machine-verified backup:

1. add only approved tables to the retention allowlist and enable 365-day retention;
2. run one 5,000-row batch;
3. verify reports and database integrity;
4. checkpoint SQLite;
5. continue bounded scheduled batches;
6. retain rollback instructions and the backup until the observation period completes.

---

### Task 11: Finish high-value browser UX and bootstrap cleanup

**Depends on:** Task 2 scope safety and Task 5 domain status.

**Files:**

- Modify: apps/bitcraft-local/src/components/main/AppPopupManager.tsx
- Modify: apps/bitcraft-local/src/components/main/Dialog.tsx only if a small extension is required
- Modify: apps/bitcraft-local/src/main.tsx
- Modify: apps/bitcraft-local/src/AppShell.tsx
- Create: apps/bitcraft-local/src/api/bootstrap.ts
- Modify: apps/bitcraft-local/server.mjs
- Modify: apps/bitcraft-local/test/app-popups.test.mjs
- Create: apps/bitcraft-local/test/app-popup-dialog-boundary.test.mjs
- Modify: apps/bitcraft-local/test/appshell-import-boundary.test.mjs
- Modify: apps/bitcraft-local/test/server.test.mjs

**Interfaces:**

- AppPopupManager renders through the shared Dialog primitive.
- Operational popups refresh on visibility and at a five-minute fallback interval, or through a local invalidation event if one is added.
- A single bootstrap response supplies public config and auth/session summary needed by main.tsx and AppShell.
- Claim-scoped data does not start until bootstrap config resolves.

- [x] **Step 1: Write popup behavior tests**

Using the existing Dialog contract as the reference, prove an app popup:

- moves focus inside,
- traps Tab/Shift+Tab,
- closes on Escape when dismissible,
- restores focus,
- locks body scroll,
- includes a visible accessible title,
- records dismissal once.

Also prove a visibility refresh fetches newly active popups and does not refetch continuously in a hidden tab.

- [x] **Step 2: Reuse Dialog**

Remove the raw aria-modal implementation from AppPopupManager. Extend Dialog only with the minimum props needed for a non-dismissible operational message.

- [x] **Step 3: Write bootstrap request-count tests**

Prove initial load performs one auth/session/bootstrap request, does not request DEFAULT_CLAIM_ID before config resolves, and passes Featurebase identity to the provider without another /auth/me request.

- [x] **Step 4: Consolidate bootstrap**

Prefer a backward-compatible /api/local/bootstrap response:

    {
      "config": { "claimId": "1369094286777412590", "refreshSeconds": 30 },
      "auth": { "authenticated": false, "featurebaseJwt": null },
      "legal": { "acceptanceRequired": false },
      "build": { "version": "0.58.0-beta.4", "buildSha": "c081890cc330" }
    }

Do not expose administrator-only settings or secrets. main.tsx loads it once and passes initial state to AppShell.

- [x] **Step 5: Verify**

Run:

    corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/app-popups.test.mjs test/app-popup-dialog-boundary.test.mjs test/appshell-import-boundary.test.mjs test/server.test.mjs
    corepack pnpm --filter @workspace/bitcraft-local run build
    corepack pnpm --filter @workspace/bitcraft-local test

Perform keyboard-only smoke of an operational popup, legal dialog, account dialog, and page navigation.

---

### Task 12: Make the GitHub-facing README accurate and useful

**Depends on:** Complete the implemented tasks first so documentation describes shipped behavior rather than intent.

**Files:**

- Modify: README.md
- Modify: apps/bitcraft-local/README.md only where it would otherwise contradict the root README
- Modify: docs/application-overview.md and docs/developer-guide.md only for implementation facts changed by this plan

**Requirements:**

- Treat `apps/bitcraft-local` as the maintained application and clearly identify historical material as documentation or migration evidence.
- Describe the actual Relay HTTP, typed subscription, normalization, current-state, history, worker, and browser boundaries without claiming stronger generation coherence or refresh behavior than the implementation provides.
- Provide a concise feature summary, supported Node/Corepack/pnpm requirements, exact development/build/test commands, default ports, configuration entrypoint, safe Discord defaults, deployment links, and known upstream/data limitations.
- Remove stale, duplicated, promotional, speculative, or migration-era copy that no longer helps an operator or contributor.
- Verify every linked local document exists and every documented package script is present.
- Record the GitHub repository review facts used for the rewrite: public repository, default branch `main`, maintained remote `Red463/bitcraft-claim-monitor-relay`, and the open issue/PR state observed during the review. Do not mutate GitHub repository settings, issues, or pull requests as part of a README-only cleanup.

- [x] **Step 1: Compare README claims with the implemented tree and GitHub metadata**

Build a claim checklist covering architecture, refresh behavior, current data gaps, setup commands, ports, deployment modes, and document links. Mark each claim as verified, corrected, removed, or deliberately qualified.

- [x] **Step 2: Rewrite the root README for contributors and operators**

Lead with what the application is and where it lives. Keep architecture and operational safety accurate but concise. Link to the whole-app guide, implementation documentation, deployment guide, changelog, and known semantic limits.

- [x] **Step 3: Reconcile the app-local README and changed architecture docs**

Remove contradictions without duplicating the full root README. Keep the app-local document focused on commands and local development.

- [x] **Step 4: Verify documentation truthfulness**

Inspect the documentation diff, resolve every local Markdown link, verify package scripts named in commands, and run the production build if any documented command or runtime path changed during the rewrite.

---

## Phase gates and success metrics

### Gate A: source recovery and correctness

**Reconciled status:** Repository and live-provider recovery work passed,
including global/regional live verification and the six-domain built smoke.
Scope safety is behaviorally tested. The separate throttled interactive-browser
navigation check remains open and no production deployment is claimed.

Tasks 1 and 2 complete when:

- the live global fingerprint matches the deployed manifest;
- typed global catalog applies successfully;
- skills/buildings/catalog-backed pages recover or show an exact remaining cause;
- no cross-page or cross-claim data appears during throttled navigation;
- build and full tests pass.

### Gate B: safe durable workflows

**Reconciled status:** The local correctness/durability contract passed.
Discord and provider-transition rows are leased, coherence/status reaches the
client, and restart/idempotency tests pass. Real Discord was not contacted and
delivery remains explicitly at-least-once. The quantitative current-market
publish-p95 and healthy transition-lag criteria below were not established as a
production-like baseline and remain open evidence gates.

Tasks 4, 5, and 6 complete when:

- two outbox consumers cannot claim the same Discord row;
- expired leases recover;
- an API response declares coherent versus mixed generations;
- per-domain quality reaches the client;
- two transition dispatchers cannot claim the same provider transition;
- a market transition survives process restart, and SQLite history/activity/Discord-enqueue effects remain idempotent under replay;
- external Discord delivery is explicitly at-least-once with the unknown-acknowledgement duplicate window documented;
- current market publish p95 does not regress by more than 10 percent from the pre-change baseline when history/Discord is unavailable, and healthy transition-outbox lag p95 is below five seconds.

### Gate C: measured performance

**Reconciled status:** The repository work is implemented: bounded telemetry,
global capacity gates, 20-to-1 favorite batching, exact history ownership,
generation watchers, and the 8-entry/4 MiB cache are present. This gate is not
closed because production-like baselines, deployed proxy probes, both seven-day
client-limit windows, and the 30-minute multi-tab heap/event-loop smoke remain
open. Client profiles are still report-only.

Tasks 3, 7, 8, and 9 complete when:

- route p50/p95/p99 and bytes are visible;
- heavy public routes have trusted-identity limits with fewer than 0.1 percent legitimate 429s over seven days and zero in the scripted normal flow;
- 20 market favorites use one compact request;
- unused 32 KB-style activity history requests disappear;
- provider-neutral pages react to owned generation changes;
- navigation cache stays at or below eight entries and 4 MB;
- a 30-minute smoke with five active market/dashboard tabs holds post-warm heap growth below 15 percent and event-loop p95 within 20 ms of its recorded baseline.

The first performance release gate is a recorded production-like baseline: hardware, server build/configuration, cache state, database rows/bytes, market order count, fixture identity, concurrent tabs, p50/p95/p99, response bytes, heap, and event-loop delay. Every before/after comparison must use that same recorded fixture, build/configuration, cache state, and concurrency. Set absolute latency/size budgets from that evidence. Until then, require these relative outcomes:

- favorite quote request count falls from 20 to 1 and same-fixture total projection CPU falls by at least 70 percent;
- game-data and history response bytes do not regress by more than 10 percent;
- Server Health contribution diagnostics use one aggregate SQL result, return a fixed field count, and remain below 10 KB;
- hidden tabs issue no normal page-domain or history refreshes; independent release-health polling is excluded unless intentionally changed.

### Gate D: bounded long-term operations

**Reconciled status:** Open. Disabled/report-only retention machinery and local
fixtures are complete, but no production table is approved or enabled. The
required production baseline, complete reader parity, owner/dependency/legal
approvals, approved backup root, verified production restore, seven dry-run
days, and bounded rollout have not occurred.

Task 10 completes only when:

- seven days of dry-run evidence is reviewed;
- long-range reports match rollup-backed fixtures;
- a current backup has a verified manifest hash, successful temporary restore, and passing PRAGMA integrity_check;
- pruning runs in bounded batches;
- database/WAL and backup growth stabilize;
- retention remains configurable and observable.

## Final release verification

**Reconciled status:** Not performed as a production release/deployment gate.
Task-level builds, suites, live-provider checks, mounted UI checks, and local
HTTP smokes are recorded in the task reports. No deployment, real Discord
delivery, retention deletion, version bump, or changelog update is implied.

After the selected tasks for a release are complete:

1. Review the diff for unrelated edits and secret/config leakage.
2. Run:

       corepack pnpm --filter @workspace/bitcraft-local run build
       corepack pnpm --filter @workspace/bitcraft-local test

3. Start the built smoke server and check:

       node scripts/start-bitcraft-local-smoke.mjs --force-restart
       curl.exe -s http://127.0.0.1:18449/api/local/health

4. Smoke Dashboard, Members, Professions, Craft Monitor, Craft Planning, Inventory, Construction, Research, Local Market, Global Market with 20 favorites, Region, Empires, Map, Activity, Public Crafts, Calculator, Sync, Admin, Bot, Terms, and Privacy.
5. Verify no real Discord deliveries were emitted.
6. Update CHANGELOG.md and apps/bitcraft-local/package.json only when the user asks to prepare/push/deploy a release.
7. Deploy independent phases separately, inspect health/metrics, and keep rollback available.

## Documentation updates when work lands

- Update docs/application-overview.md for actual generation/coherence behavior.
- Update docs/developer-guide.md for the bootstrap, domainStatus, outbox lease, and transition dispatcher interfaces.
- Update docs/relay-migration/table-inventory.md for rollups and retention ownership.
- Update docs/relay-migration/README.md only when runtime behavior matches its live-first claims.
- Update the binding README and schema manifest when generated bindings change.
- Record remaining upstream semantic limits without inventing unavailable values.
