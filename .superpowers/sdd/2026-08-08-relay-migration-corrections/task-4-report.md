# Task 4 Report — Images and Research UI

## Status

Implemented Task 4 in the isolated `relay-corrections` worktree while preserving Tasks 1–3 through `75be022`. No production, VPS, deployment, Discord, or live game-data mutation was performed.

## Behavior delivered

- Game images now try the resolved Relay catalog `/game-icons` asset, the bounded same-origin `/api/local/game-icon/:itemType/:itemId` fallback, then the existing text placeholder.
- The public fallback accepts only exact `item|cargo` plus decimal IDs, queries the matching BitJita metadata endpoint, rejects caller-supplied URLs, restricts metadata and image hosts to the configured allowlist, requires `image/*`, rejects oversized bodies, times out bounded requests, and returns cache headers or a 404.
- Missing `/game-icons/*` files now return JSON 404 instead of the frontend HTML shell.
- Browser policy tests allow only the audited server fallback files; the browser continues to make no direct BitJita requests.
- CSP `img-src` adds only `https://cdn.discordapp.com` beyond the existing sources.
- Research now has exactly two lanes: Completed Technology and Available Research. Researching, available, and locked unresearched technologies stay in Available; locked cards show Locked and prerequisite badges. The Current Research lane and its empty-state summary are removed.
- Version and changelog are updated to `0.51.0-beta.5`.

## Main files

- `apps/bitcraft-local/src/server/gameIconFallback.mjs`
- `apps/bitcraft-local/server.mjs`
- `apps/bitcraft-local/src/server/httpRoutes.mjs`
- `apps/bitcraft-local/src/utils/gameAssets.mjs`
- `apps/bitcraft-local/src/components/main/ItemDisplay.tsx`
- `apps/bitcraft-local/src/pages/ResearchPage.tsx`
- `apps/bitcraft-local/src/pages/researchView.ts`
- `apps/bitcraft-local/src/styles/research.css`
- `apps/bitcraft-local/test/game-icon-fallback.test.mjs`
- `apps/bitcraft-local/test/relay-current-documentation-boundary.test.mjs`
- `apps/bitcraft-local/package.json`
- `CHANGELOG.md`

## TDD evidence

### Focused RED

```powershell
node --experimental-strip-types --test test/game-icon-fallback.test.mjs test/game-icon-resolver.test.mjs test/research-view.test.mjs test/research-lanes-boundary.test.mjs test/server-route-groups.test.mjs test/no-bitjita-fetch.test.mjs
```

Observed before production changes: exit 1, 5 passed / 9 failed. Expected failures covered the absent secure fallback module, source-order helper, frontend-shell guard, CSP update, Research two-lane projection, and locked-entry presentation.

The server integration assertion was also observed red before correct route registration. Its first direct run was blocked before assertions by sandboxed pnpm-link access; the escalated rerun reached the integration and passed after registration.

### Focused GREEN

The focused command above passed 19 / 19. The server integration file passed 4 / 4, including the public fallback route and missing `/game-icons` JSON 404.

The first full suite run exposed the intentionally obsolete broad runtime-URL policy. After narrowing that policy to the exact audited server files, its focused test passed 3 / 3.

## Final verification

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Observed: exit 0. Server/provider TypeScript, bindings, asset verification, frontend TypeScript, Vite client build, and Relay runtime boundaries passed.

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Observed: exit 0, 1,674 passed / 0 failed.

## Smoke and browser verification

- Stable smoke server health returned HTTP 200 with version `0.51.0-beta.5` and build `527dad5`.
- Response CSP contained `img-src 'self' data: https://cdn.discordapp.com`.
- A missing `/game-icons/...` request returned JSON HTTP 404, not HTML.
- A malformed `/api/local/game-icon/items/42` request returned HTTP 400.
- Dashboard, Local Market, Craft Monitor, Members, Research, and `/bot` loaded in the in-app browser with zero console warnings/errors.
- The isolated smoke `.dev-data` contained no committed Relay generation, so data-dependent craft icons/names, Local Market item icons, Discord avatars, grouped passive-craft rows, Members Last Seen rows, and Research cards could not render for visual inspection. Their projection, fallback, and boundary behavior is covered by focused tests and the full suite.

## Commits

- `527dad5` — Add secure game icon fallback and simplify research
- `3499b5f` — Narrow runtime icon source policy

## Two-axis review

- Standards: no findings after applying the explicit Task 4 requirements as the approved exceptions to the repository's general retired-provider rules. No persuasive Fowler smell findings.
- Spec: no implemented-but-wrong behavior or material scope creep. The first pass identified only the then-uncommitted report and its verification record; this report commit closes both findings.

## Concerns

- The BitJita fallback was verified with deterministic mocked metadata/image responses and unavailable-route integration. No live BitJita request was sent.
- Browser smoke verification was structurally clean but data-limited as described above.
- No production/VPS action is required from this implementation task; rollout remains with the controller.

## Controller fix round 1

Addressed every P1/P2 controller finding:

- Applied `RATE_LIMITS.proxy` before the public game-icon handler.
- Added a bounded response cache and in-flight request coalescing keyed by `itemType:itemId`.
- Normalized timeout, response-byte, cache-TTL, and cache-size settings to positive bounded values; metadata is byte-bounded before JSON parsing and redirects remain rejected.
- Appended `.webp` to extensionless BitJita icon assets while preserving approved existing extensions.
- Made game-icon identity selection atomic at one record level, including Inventory's existing `type: Item|Cargo` shape, without mixing top-level and nested identity fields.
- Narrowed the runtime provider policy to the exact approved origin literals and call sites, and removed the dead `readSourceTree` helper.

### Round 1 RED evidence

- Fallback/resolver/policy tests: 9 passed / 5 failed before production changes. Failures covered extensionless assets, metadata bounds, invalid-limit normalization, missing request coalescing/cache, and Inventory identity handling.
- Server integration: 3 passed / 1 failed before route limiting; all 601 game-icon requests returned 404 instead of producing a local 429.

### Round 1 GREEN evidence

```powershell
node --experimental-strip-types --test test/game-icon-fallback.test.mjs
node --experimental-strip-types --test test/game-icon-resolver.test.mjs
node --experimental-strip-types --test test/relay-current-documentation-boundary.test.mjs
node --experimental-strip-types --test test/server.test.mjs
```

Observed: 8 / 8 fallback, 3 / 3 resolver, 3 / 3 policy, and 4 / 4 server tests passed. The server limiter test avoids a synthetic forwarded address because that would deliberately create an unrelated second GeoIP cache entry later in the integration test.

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Observed: exit 0. Server/provider TypeScript, generated bindings, asset verification, frontend TypeScript, Vite client build, and Relay runtime-boundary verification passed. The first 120-second wrapper attempt timed out without a build error; the fresh 300-second run completed successfully in 120.4 seconds.
