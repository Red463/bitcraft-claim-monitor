# Task 5 report: generation coherence and per-domain quality

## Status

Implemented and verified on `codex/app-performance-reliability`.

The provider-neutral game-data response now exposes backward-compatible `meta` and `domainStatus` fields while retaining the existing `domains`, flattened client fields, timestamps, partial/last-good data, and HTTP 200/503 behavior.

## RED evidence

### Server contract

Production code was unchanged when the required route test first ran:

```text
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-data-repository-route.test.mjs

tests 31, pass 24, fail 7
```

The failures were the expected missing-contract failures: `body.meta` and `body.domainStatus` were absent for coherent, mixed, unavailable, dependency, and stale-last-good assertions.

The catalog repository test was also RED before its production edit:

```text
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/provider-catalog-repository.test.mjs

tests 7, pass 6, fail 1
TypeError: repository.getRevision is not a function
```

### Client contract

The new client contract test ran before client production edits:

```text
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-data-client-contract.test.mjs

tests 2, pass 0, fail 2
```

Legacy flattened fields were already present, but `domainStatus` and `responseMeta` were `undefined`, proving the existing client dropped the new response contract.

### Presentation behavior

The page-quality helper tests ran before their production functions existed:

```text
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-game-data-warnings.test.mjs

tests 4, pass 2, fail 2
TypeError: gameDataQualitySummaries is not a function
```

A later self-review RED proved stale last-good `lastError` text was missing from `domainStatus.warnings`; the route test failed with `warnings: []` instead of `warnings: ["Relay HTTP 503"]` before the status-only warning was added.

## GREEN implementation

### Server response semantics

- Added `meta.coherence`, `availableGenerations`, `newestGeneration`, and `oldestGeneration`.
- Added an explicit status for every requested domain, including unavailable domains with `generation: null`, `freshness: "unavailable"`, unknown confidence, null provenance/age, and the exact unavailable warning.
- Available statuses preserve generation, freshness, confidence, age, warnings, provenance, and declared dependencies.
- Coherence is `unavailable` when no requested domain is available, `coherent` when all available primary/dependency generations match, and `mixed` when more than one local generation participates.
- Missing requested domains do not make otherwise coherent available domains mixed.
- Age-stale data remains visible even without `lastError`; stale last-good data retains generation/provenance and exposes its last error in status warnings.
- Existing envelope data, source timestamps, partial errors, status codes, and last-good availability are unchanged.

Coherence deliberately means only local application-generation/dependency coherence. It does not claim upstream sources observed the world simultaneously. Individual `sourceObservedAt` and `receivedAt` values remain authoritative.

### Request-time enrichment dependencies

- `catalogRepository.getRevision()` exposes only `{ generation, sourceKey, receivedAt }` for the current global catalog revision.
- The live game-data composition captures one catalog revision lazily inside the actual synchronous composed read, after any heavy-route queue wait.
- Catalog-enriched inventory, craft, public-craft, market, equipment, construction, research, and recruitment responses declare the exact catalog revision used for request-time labels/descriptions.
- Inventory declares the exact `inventory-banks` snapshot generation when Town Bank data is composed.
- Crafts declares the exact `public-crafts` snapshot generation when supplemental visibility data is composed.
- Different catalog, inventory-bank, or public-craft revisions participate in response coherence and make it mixed.

The focused `apps/bitcraft-local/server.mjs` edit was necessary because the request-time catalog and supplemental projection reads are wired there; no unrelated server cleanup was included.

### Client preservation and AppShell presentation

- `loadGameData` retains the legacy flattened domain fields and exact `partialErrors`, and now returns `domainStatus` plus `responseMeta`.
- Global stale is true when a requested available domain is stale; an unavailable domain alone does not mark available fresh data stale.
- `gameDataLoader` keeps status/meta with the active scope and navigation cache without leaking state across claim/page scopes.
- AppShell shows a dense one-line issue summary and a native expandable provenance/warning detail area.
- Dashboard, Professions, Research, Local Market, Region, and Public Craft Finder use explicit affected-panel labels.
- Warnings are grouped by stable domain/message pattern, show a count, and retain no more than three concrete examples per group.
- Expanded details show local generations, source keys/receive times, enrichment dependencies, and the explicit local-coherence caveat.

## Verification evidence

Final required focused gate:

```text
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-data-repository-route.test.mjs test/provider-catalog-repository.test.mjs test/game-data-client-contract.test.mjs test/page-game-data-warnings.test.mjs

tests 44, pass 44, fail 0
```

Fresh production build after the final self-review fixes:

```text
corepack pnpm --filter @workspace/bitcraft-local run build

exit 0
```

The build completed server/provider/bindings TypeScript, asset verification, client TypeScript, Vite production bundles, and Relay runtime-boundary verification.

Single full app-suite run:

```text
corepack pnpm --filter @workspace/bitcraft-local test

tests 2427, pass 2424, fail 0, skipped 3
```

The three skips are existing Windows/environment skips. The full suite was run once as requested. The later narrow self-review fixes were covered by the final 44-test focused gate and fresh full production build above.

## Browser smoke

Fresh, partial, and unavailable visual states could not be browser-smoked safely.

The prescribed backend restart was attempted once:

```text
node scripts/start-bitcraft-local-smoke.mjs --force-restart
```

It failed because Windows denied the recorded process-tree stop (`taskkill ... ERROR: Access denied`) and the replacement process repeatedly failed with:

```text
Error: EPERM: operation not permitted, open '...node_modules\\jsonwebtoken\\index.js'
```

`http://127.0.0.1:18449/api/local/health` did not respond. Per `AGENTS.md`, the launcher was not retried. A read-only search found no existing game-data quality fixture/injection route, so no partial/unavailable state was invented.

## Self-review

- Confirmed response coherence includes every available primary generation and every declared catalog/inventory-bank/public-craft dependency generation.
- Confirmed unavailable requested domains are explicit but excluded from mixed/coherent generation comparison.
- Confirmed catalog revision capture happens at the composed read, not before a possible queue wait.
- Confirmed only actually composed inventory-bank/public-craft snapshots are declared.
- Confirmed all catalog-backed request-time projections declare the captured global revision.
- Confirmed legacy envelope and flattened data fields, timestamps, partial errors, status codes, and last-good behavior remain intact.
- Confirmed no upstream temporal-coherence claim is made in code or UI.
- Confirmed decimal-string IDs and item/cargo identity are untouched.
- Confirmed warning details group repeated dynamic messages and cap examples at three without discarding the client contract.
- Confirmed AppShell hooks were not added or reordered; the new notice is hook-free.
- Confirmed fresh coherent pages render no extra notice and operational issue pages use dense existing chrome.
- Confirmed no schema gate, Relay wire boundary, database schema, Discord behavior, changelog, version, or controller document was changed.

## Reviewer fix round 1

This section supersedes the original catalog-revision coherence description above. Relay source generation and current-state application generation are separate namespaces and are no longer compared directly.

### Fix-round RED evidence

The four focused files ran before fix-round production edits:

```text
node --experimental-strip-types --test \
  test/provider-catalog-repository.test.mjs \
  test/game-data-repository-route.test.mjs \
  test/game-data-composition.test.mjs \
  test/page-game-data-warnings.test.mjs

tests 46, pass 40, fail 6
```

The failures proved all requested boundaries: the production composition helper did not exist, catalog revision still exposed the Relay generation as an application generation, unknown dependency generations polluted `availableGenerations`, and warning details were an unbounded array with no omitted-count model.

### Corrected generation semantics

- `catalogRepository.getRevision(publicationSnapshot)` now reports `sourceGeneration` separately from the dependency's application `generation`.
- A catalog application generation is available only when the current-state `catalogs` publication exactly matches the durable catalog source state by provider, source key, database, schema fingerprint, and receive time.
- The synchronous composite read is the atomic link: an update between catalog replacement and current-state publication cannot invent coherence. A mismatch or legacy/missing publication link returns `generation: null` while preserving source provenance.
- Coherence compares only known application generations. An available response with an unknown dependency generation is `mixed`; null is not included in `availableGenerations`. If no requested domain is available, coherence remains `unavailable`.
- Tests prove that coincidentally equal source/application numbers are not coherent, different source numbers can be coherent through the same validated application publication, and legacy/unknown links are mixed.

### Production composition seam

- Added `gameDataComposition.ts`, exported through the production game-data index and called directly by `server.mjs`.
- The helper is created before the heavy-route gate but reads/caches the catalog publication only when the first catalog-enriched domain is transformed, after the gate completes.
- Its behavioral test proves exact catalog-enriched coverage and conditional `inventory-banks`/`public-crafts` dependencies without starting an external server.

### Bounded warning details

- Warning details now cap the entire rendered model at 12 groups and each group at three examples.
- Embedded alphanumeric identifiers are stabilized before grouping.
- The model exposes total, omitted-group, and omitted-warning counts; AppShell renders the omitted summary.
- A high-cardinality behavioral test proves 50 warnings collapse to a bounded 12-group model with correct counts.
- A direct AppShell SSR boundary was attempted but was not practical in this environment because loading React from the worktree failed with `EPERM`. The production-consumed render model is behaviorally covered, and the client production build verifies the AppShell integration.

### Fix-round verification

Focused GREEN gate:

```text
node --experimental-strip-types --test \
  test/provider-catalog-repository.test.mjs \
  test/game-data-repository-route.test.mjs \
  test/game-data-composition.test.mjs \
  test/page-game-data-warnings.test.mjs

tests 47, pass 47, fail 0
```

The final client-inclusive Task 5 gate also included `test/game-data-client-contract.test.mjs` and passed `49/49`, confirming the enriched dependency object remains preserved end to end.

Fresh production build after the final UI provenance update:

```text
corepack pnpm --filter @workspace/bitcraft-local run build

exit 0
```

The single requested full-suite run completed with one unrelated broad server-test failure:

```text
corepack pnpm --filter @workspace/bitcraft-local test

tests 2432, pass 2428, fail 1, skipped 3
```

The failure was `server collection paginates listings and protects production mutations`: its Discord sandbox assertion expected channel `666666666666666666` but observed a stale asynchronous message for `555555555555555555`. No Task 5 code participates in that channel selection. A narrow rerun could not start its child server (`Server exited with code 1`), consistent with the existing local process-start/EPERM constraint; the full suite was not looped.

### Fix-round smoke and self-review

The browser smoke was not retried because the initial round already documented the exact process-stop/EPERM blocker and there is no fixture injection for fresh/partial/unavailable states.

- Confirmed only application-generation values enter the coherence set.
- Confirmed source generation remains separately visible in the response and AppShell provenance detail.
- Confirmed legacy/unknown publication relationships fail closed as mixed without inventing equality.
- Confirmed the composition helper is the helper used by `server.mjs`, remains lazy across the queue gate, and declares only actually composed supplemental snapshots.
- Confirmed warning output has both per-group and total-group bounds with explicit omission accounting.
- Confirmed no hooks, schema, controller docs, changelog, version, 64-bit ID handling, or typed item/cargo identities changed.

## Reviewer fix round 2

Round 2 closes the remaining fail-open catalog cases from round 1. Catalog-enriched available domains now always declare a catalog dependency, and an application publication links only through the exact source generation that produced it.

### Round-2 RED evidence

Before production edits, the focused witness command was:

```text
node --experimental-strip-types --test \
  test/provider-catalog-repository.test.mjs \
  test/game-data-composition.test.mjs \
  test/global-catalog-runtime.test.mjs \
  test/game-data-repository-route.test.mjs

tests 55, pass 52, fail 3
```

The three failures proved that an absent catalog returned no dependency, catalog publications did not persist their source generation, and an older publication could falsely link after a same-metadata/same-receive-time source-generation advance.

### Fail-closed publication identity

- New provider-neutral `catalogs` current-state payloads persist `sourceGeneration` alongside the catalog counts in the existing atomic domain publication.
- `catalogRepository.getRevision(publicationSnapshot)` requires that persisted source generation to exactly equal the current durable catalog source generation, in addition to the existing provider/source/database/schema/receive-time checks.
- A legacy publication has no `data.sourceGeneration`; it therefore resolves to `generation: null` and remains mixed until the next successful catalog publication. This is a safe additive payload default and requires no destructive database migration or schema rewrite.
- A test advances the catalog from source generation 8 to 9 with identical metadata and `receivedAt`; the generation-8 publication does not link, while the exact generation-9 publication does.

### Explicit unavailable dependency

- When the catalog repository has no source revision and returns `null`, catalog-enriched domains declare `{ generation: null, sourceGeneration: null, sourceKey: "global", receivedAt: null }`.
- This explicit unknown dependency makes an otherwise available catalog-enriched response `mixed` without adding null to `availableGenerations`.
- Non-enriched domains do not receive the dependency and remain coherent when their own application generations are coherent.
- The dependency contract now allows a null receive time only for explicit unavailable dependency provenance; existing populated dependency timestamps remain unchanged.

### Round-2 verification

Final client-inclusive focused gate:

```text
node --experimental-strip-types --test \
  test/provider-catalog-repository.test.mjs \
  test/game-data-composition.test.mjs \
  test/global-catalog-runtime.test.mjs \
  test/game-data-repository-route.test.mjs \
  test/game-data-client-contract.test.mjs \
  test/page-game-data-warnings.test.mjs

tests 62, pass 62, fail 0
```

Production build:

```text
corepack pnpm --filter @workspace/bitcraft-local run build

exit 0
```

Single round-2 full-suite run:

```text
corepack pnpm --filter @workspace/bitcraft-local test

tests 2433, pass 2430, fail 0, skipped 3
```

The three skips are existing Windows environment skips. The unrelated broad server race from round 1 did not recur.

Browser smoke was not retried, as required, because the initial report already records the exact process-stop/EPERM blocker and unavailable fixture injection.

### Round-2 self-review

- Confirmed catalog absence, legacy publication metadata, and catalog replacement crash windows all fail closed.
- Confirmed same-timestamp source revisions cannot alias because the persisted source generation is exact.
- Confirmed catalog publication and current-state application generation retain their distinct namespaces.
- Confirmed unavailable catalog dependency provenance is explicit and backward compatible.
- Confirmed non-enriched domains are unaffected.
- Confirmed no schema, controller docs, smoke state, hook order, HTTP semantics, 64-bit identity, or typed item/cargo identity changed.
