# Task 3 report — public settlement discovery and snapshots

## Status

Implemented the visitor-driven public settlement, catalog, recipe, and icon APIs behind the existing public HostProfile router and `PUBLIC_PROFILE_ENABLED`. The implementation creates no background refresh, interval, configured-claim runtime, or durable game-data writer.

The production build passes. Task 3 focused tests pass. The complete package test command ran once and reported 2,636 passed, 11 failed, and 3 skipped; all 11 failures are pre-existing Task 2 production-host fixture failures described under Concerns.

## Implementation

- Extended `RelayHttpClient` with the Relay's documented `/claim?name=<substring>` search request.
- Added NFKC search normalization, visible-text limits, canonical unsigned-64 validation, safe hint projection, and exact/prefix/substring ranking capped at 20.
- Added request-driven caches with exact limits:
  - search: 60 seconds fresh, 5 minutes stale-if-error, 256 entries, 2 MiB;
  - snapshot: 20 seconds fresh, 2 minutes stale-if-error, 128 entries, 32 MiB total, 4 MiB per entry;
  - topology: 60 seconds.
- Added LRU byte accounting, stale age/warnings, and identical-work single-flight without background timers.
- Added a global public Relay gate with four active and twelve queued calls; excess work returns `503` with `Retry-After`. Snapshot domain work runs with at most two upstream reads at once.
- Added per-IP sliding-window settlement limits: search 6/30 seconds and 30/10 minutes; snapshot 4/30 seconds and 20/10 minutes.
- Snapshot loading fetches the exact claim and topology before optional domains, validates claim identity and region, coalesces members/citizens onto one roster read, combines current/completed crafts, and rejects embedded claim mismatches even for empty projections.
- Reused existing Relay normalizers and added typed `items:<id>` / `cargo:<id>` keys while retaining all IDs and amounts as exact decimal strings.
- Added a safe public catalog/recipe wrapper with explicit display projections and recursive URL/origin/config/token/secret removal. The public icon endpoint reuses the existing bounded same-origin icon service without exposing its metadata source.
- Added public response mapping for `400`, `404`, `429`, `502`, and `503` plus `Retry-After`; optional domain source failures remain `200` with warnings.
- Wired concrete handlers only for the public host while the flag is enabled. Timbersteel hosts still deny `/api/public/**`; disabled public profiles still return `404` without invoking public work.

## Files

- `apps/bitcraft-local/src/server/public/publicData.mjs` — public validation, caches, gate, limiter, snapshot/search services, safe catalog wrapper, and API router.
- `apps/bitcraft-local/src/server/public/router.mjs` — feature-gated delegation to concrete public handlers.
- `apps/bitcraft-local/src/server/game-data/http.ts` — documented Relay claim-name search method.
- `apps/bitcraft-local/server.mjs` — dependency injection and host-gated public route wiring.
- `apps/bitcraft-local/test/public-data.test.mjs` — normalization, exact IDs, ranking, cache, stale, byte, concurrency, queue, rate, snapshot, typed identity, catalog, and mismatch coverage.
- `apps/bitcraft-local/test/public-api-router.test.mjs` — route and public error-mapping coverage.
- `apps/bitcraft-local/test/relay-topology-http.test.mjs` — Relay search request contract.
- `apps/bitcraft-local/test/host-profile-boundaries.test.mjs` — real server/SQLite public isolation fingerprint.

## Relay contract evidence

The Relay contract is not ambiguous. Its own HTTP documentation states that `/claim` accepts `name` as a claim-name substring and documents `/claim/<id>`, `/members`, `/inventory`, `/citizens`, and `/crafts?completed=<bool>`. Read-only live probes confirmed:

- `/claim?name=concordia` returns an array of claim hints with `entity_id`, `name`, `region`, tier, and owner display data;
- `/claim/<id>` returns the exact claim;
- members and inventory carry embedded claim metadata;
- current and completed crafts use the documented boolean query and carry embedded claim metadata.

No response semantics were invented.

## TDD RED/GREEN evidence

Each production slice began with a focused failing behavior and was rerun green:

1. Relay search RED: `client.searchClaims is not a function`; GREEN: documented encoded `name` query passed.
2. Search validation RED: public module missing; GREEN: NFKC, visible Unicode, and canonical unsigned-64 cases passed.
3. Ranking RED: `publicSettlementHints is not a function`; GREEN: exact/prefix/substring order and safe fields passed.
4. Cache single-flight RED: cache factory missing; GREEN: identical work coalesced and fresh reuse passed.
5. Stale RED: Relay error escaped; GREEN: bounded stale-if-error with age/error passed.
6. Byte limits RED: unimplemented limits; GREEN: LRU total and per-entry caps passed.
7. Queue RED: public gate missing; GREEN: four active, twelve queued, seventeenth rejected.
8. Rate RED: limiter missing; GREEN: exact burst/sustained search and snapshot windows passed.
9. Search service RED: service missing; GREEN: name search and exact-ID `/claim/<id>` revalidation passed.
10. Snapshot RED: snapshot method missing; GREEN: topology/claim checks, roster coalescing, two-read concurrency, crafts merge, and exact typed data passed.
11. Catalog RED: wrapper missing; GREEN: typed safe search and sanitized recipe detail passed.
12. API routing RED: missing router export; GREEN: all five public APIs and error mapping passed.
13. Embedded scope RED: empty mismatched craft payload was accepted; GREEN: embedded claim identity/region mismatch now returns `502`.

The real SQLite fingerprint test was then added as an isolation gate and passed without requiring a production change.

## Verification

Focused commands:

```sh
node --experimental-strip-types --test test/public-data.test.mjs test/public-api-router.test.mjs test/relay-topology-http.test.mjs
```

Result: 28 passed, 0 failed.

```sh
node --experimental-strip-types --test test/host-profile-boundaries.test.mjs
```

Result: 3 passed, 0 failed, including the enabled-public SQLite fingerprint test.

```sh
node --experimental-strip-types --test test/host-profiles.test.mjs
```

Result: 2 passed, 0 failed as part of the earlier combined focused run.

Full build:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Result: passed, including server/bindings compilation, asset verification, frontend typecheck/build, and Relay runtime-boundary verification.

Initial complete package test before post-review maintenance:

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Result: 2,650 tests; 2,636 passed, 11 failed, 3 skipped. Every Task 3 focused and isolation test passed. The 11 failures were production-mode server fixtures polling `127.0.0.1` without an allowlisted Host after Task 2 intentionally removed the `BITCRAFT_TEST` production bypass.

Representative diagnosis:

```sh
node --experimental-strip-types --test test/server-security-boundaries.test.mjs
```

Result: 4 startup-health timeouts. A one-off server launch with the same environment logged a healthy listener; current Task 2 code returns `421` to the fixture's localhost Host, while the working Task 2 host integration supplies `app.timbersteeltrade.com`. The production allowlist was deliberately not relaxed.

## Isolation proof

The enabled public-host integration starts a fake Relay and the real application server, fingerprints these SQLite tables after startup, performs public search and exact claim snapshot requests, and proves the fingerprints remain byte-identical:

- `app_settings`
- `craft_plan_settings`
- `domain_payload_current`
- `settlement_state_current`
- `market_events`
- `market_trades`
- `activity_events`
- `provider_transition_outbox`
- `discord_notification_outbox`

The public module contains no `currentClaimId`, current-state repository, history/outbox writer, settings writer, interval, timeout, or upstream URL. The only Relay/cache work is initiated by a handled visitor request.

## Self-review

- Confirmed all numeric limits match the brief verbatim.
- Confirmed exact claim, embedded roster/inventory/craft claim, and Relay topology region checks happen before data is returned.
- Confirmed `members` and `citizens` share one Relay roster response.
- Confirmed item ID `42` and cargo ID `42` remain distinct typed identities.
- Confirmed optional source errors cannot silently substitute configured Timbersteel data.
- Confirmed public errors do not expose Relay/internal details and recipe payloads cannot expose upstream URL/configuration keys.
- Confirmed disabled/public/Timbersteel host routing remains fail-closed.
- Confirmed no changelog, version, service, dependency, configured runtime, or schema changes were introduced.

## Concerns

- Public caches and rate limits are process-local as required for the current single-process deployment. A later multi-replica deployment will need shared coordination, already reserved for deployment documentation work.

## Post-review complete-suite maintenance

The original complete-package RED exposed these 11 production-mode fixture failures:

- `record-mode Admin manual tests post only to the local fake sandbox channel`
- `maintenance hold blocks Discord network and leaves pre-start outbox rows untouched`
- `public and Admin health redact persisted schema errors from every diagnostic path`
- `non-owners cannot grant or revoke owner access, and the final active owner remains enabled`
- `owner role changes revoke affected sessions and leave an audit record`
- `Discord commands from another guild are rejected before dispatch`
- `password setup cannot create an Admin session outside Timbersteel OAuth`
- `server collection paginates listings and protects production mutations`
- `background polling failures keep the server online`
- `retired recipe catalog refresh route, scheduler key, and tables are absent`
- `regional market retirement cleanup runs after the older collector marker`

Root cause: all fixtures intentionally launched the server in production mode, but polled and exercised it through a raw `127.0.0.1:<port>` Host. Task 2 correctly made localhost development hosts unavailable in production. The server therefore returned `421` before the old health helpers could observe readiness. The production HostProfile rule was not changed and no `BITCRAFT_TEST` bypass was restored.

Test-only files changed:

- `apps/bitcraft-local/test/support/timbersteelFetch.mjs`
- `apps/bitcraft-local/test/server-discord-sandbox-integration.test.mjs`
- `apps/bitcraft-local/test/server-schema-health-redaction.test.mjs`
- `apps/bitcraft-local/test/server-security-boundaries.test.mjs`
- `apps/bitcraft-local/test/server.test.mjs`

The shared fixture adapter routes only explicitly registered local application origins through `node:http` with the exact `Host: app.timbersteeltrade.com`. It rewrites the matching test Origin to `https://app.timbersteeltrade.com`, preserves typed request bodies with an explicit content length, exposes the response body as a stream with native-fetch timing, and delegates fake Relay/Discord/upstream origins to the native fetch implementation.

Focused GREEN command:

```sh
node --experimental-strip-types --test test/server-security-boundaries.test.mjs test/server-schema-health-redaction.test.mjs test/server-discord-sandbox-integration.test.mjs test/server.test.mjs
```

Result: 11 passed, 0 failed.

Final complete-package GREEN command:

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Result: 2,650 tests; 2,647 passed, 0 failed, 3 skipped. The three skips are the existing Windows symlink-permission skips.

Final build command:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Result: passed, including server/bindings compilation, asset verification, frontend typecheck/build, and Relay runtime-boundary verification.

## Fix round 1/5: public boundary hardening

### Implementation

- Added `RelayHttpMalformedResponseError` at the Relay HTTP seam. JSON `SyntaxError` responses are typed as malformed (`502`) and are not retried; response-body transport failures remain retryable source failures.
- Required claim/search/topology reads translate malformed Relay JSON to sanitized `PublicDataError` responses with status `502`.
- Optional roster, inventory, and craft failures now remain `200` but return explicit domain envelopes with fixed public warning codes/messages. Malformed and temporarily unavailable sources are distinguished, including one-of-two craft projection failures.
- Replaced interpolated stale and optional exception messages with fixed warnings. No exception message, URL, endpoint, header, configuration, password, API key, token, secret, or error detail is returned.
- Replaced recipe key blacklisting with an explicit recursive allowlist and a fixed `provider: "relay"` projection.
- Tightened unsigned-64 conversion: numeric inputs must be non-negative safe integers; canonical decimal strings and in-range BigInts remain exact.
- Added visitor-driven, no-timer limiter pruning. The limiter prunes expired buckets opportunistically, caps active `(kind, IP)` buckets at 4,096, and deterministically fails closed for a new key until the earliest active bucket expires.
- The deferred exact-ID whitespace Minor was intentionally not changed.

Production files changed:

- `apps/bitcraft-local/src/server/game-data/http.ts`
- `apps/bitcraft-local/src/server/public/publicData.mjs`

Focused tests changed:

- `apps/bitcraft-local/test/relay-topology-http.test.mjs`
- `apps/bitcraft-local/test/public-data.test.mjs`
- `apps/bitcraft-local/test/public-api-router.test.mjs`

### TDD RED/GREEN evidence

1. Malformed JSON seam RED returned raw `SyntaxError` and retried; GREEN returns `RelayHttpMalformedResponseError` with code `RELAY_MALFORMED_JSON`, status `502`, and one attempt. A separate RED proved body-stream transport errors were incorrectly classified; GREEN retains their retryable source semantics.
2. Required/search mapping RED returned `503 Public Relay data is temporarily unavailable`; GREEN returns sanitized `502` for name search, exact-ID search, and required snapshot inputs.
3. Optional malformed-domain RED omitted the requested domains and exposed exception details in root warnings; GREEN returns `data: null` with fixed `relay_*_malformed` domain warnings. Partial crafts retain the valid projection and use `relay_crafts_partial_malformed`.
4. Warning/recipe boundary RED returned interpolated stale strings and passed `endpoint`, `headers`, `password`, `apiKey`, `errorDetails`, `diagnostic`, and nested private fields; GREEN returns fixed warning objects and only explicitly allowlisted recipe/display fields.
5. Identifier RED converted the unsafe Number `9007199254740992` to a rounded decimal ID; GREEN rejects unsafe, fractional, and negative Numbers while preserving exact string/BigInt u64 values. Settlement hints, snapshot IDs, catalog search IDs, and recipe IDs are covered.
6. Limiter RED admitted a fourth unique key despite a configured capacity of three; GREEN fails closed with deterministic `Retry-After`, preserves existing-key rate state, and admits the new key after lazy expiry pruning.

### Verification

Complete Task 3 focused plus host/isolation command:

```sh
node --experimental-strip-types --test test/public-data.test.mjs test/public-api-router.test.mjs test/relay-topology-http.test.mjs test/host-profile-boundaries.test.mjs test/host-profiles.test.mjs
```

Result: 48 passed, 0 failed. The enabled-public-host SQLite fingerprint test again proved settings, current repositories, history, and outboxes remain byte-identical.

Production build:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Result: passed, including server/bindings compilation, asset verification, frontend typecheck/build, and Relay runtime-boundary verification.

Complete package test:

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Result: 2,665 tests; 2,662 passed, 0 failed, 3 skipped. The skips are the existing Windows symlink-permission skips.

The first in-sandbox host/isolation attempt was invalidated by Windows denying the sandbox identity access to the already-installed `jsonwebtoken` package. The exact command was rerun outside the sandbox and passed 5/5; no dependency or manifest was changed.

### Fix-round self-review and concerns

- The Relay seam distinguishes malformed JSON from transport interruption and does not expose parser details.
- All public exception-derived warnings are fixed projections; the recipe response is allowlist-only at every depth.
- Limiter memory is bounded to 4,096 buckets and at most each policy's sustained event count per bucket; pruning creates no timer or visitor-absent work.
- The production HostProfile rule, configured claim/runtime/repositories, services, dependencies, version, and changelog remain unchanged.
- Public caches and rate limits remain process-local by design for the current single-process deployment.
