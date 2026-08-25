# Task 4 report — isolated public shell

## Status

Implemented and committed the standalone public claim-monitor browser shell. It consumes only `/api/public/**` envelopes, never mounts a Timbersteel page, and keeps all browser preferences under `claim-monitor.public.*`.

## Implementation

- Added a focused public API client for settlement search, exact-ID snapshots, and the shared catalog. Every browser request uses `cache: "no-store"`; server-side public cache policy remains authoritative.
- Added public-only routing for overview, members/professions, inventory, crafts, calculator, account/settings/help/legal/plans placeholders, plus a public not-found state. Unsupported Timbersteel routes are resolved as public not-found by the client router.
- Built `PublicAppShell` from isolated components: generic navigation/branding, settlement search, recent settlements, snapshot page state, operational freshness/warning/error states, manual refresh, typed item/cargo display, roster skills, inventory, crafts, and catalog search.
- The claim ID from the URL is the snapshot authority. Settlement names remain display-only.
- Added claim-scoped preference keys and bounded recent-settlement storage. Invalid claim IDs and malformed storage are rejected safely.
- Added a visibility-aware 60-second refresh controller: no interval while hidden and precisely one catch-up refresh after visibility returns.
- Added a compact public-shell stylesheet using existing dashboard design tokens; no app-shell component or Timbersteel page was reused.

## Files

- `apps/bitcraft-local/src/public/PublicRoot.tsx`
- `apps/bitcraft-local/src/public/PublicAppShell.tsx`
- `apps/bitcraft-local/src/public/api.ts`
- `apps/bitcraft-local/src/public/preferences.mjs`
- `apps/bitcraft-local/src/public/visibleRefresh.mjs`
- `apps/bitcraft-local/src/public/routes.mjs`
- `apps/bitcraft-local/src/styles/public-shell.css`
- `apps/bitcraft-local/src/styles.css`
- `apps/bitcraft-local/test/public-shell.test.mjs`

## TDD evidence

RED:

```sh
node --experimental-strip-types --test test/public-shell.test.mjs
```

The new focused suite failed as expected because `preferences.mjs`, `visibleRefresh.mjs`, and `PublicAppShell.tsx` did not exist.

GREEN:

```sh
node --experimental-strip-types --test test/public-shell.test.mjs test/public-router.test.mjs
```

Result: 6 passed, 0 failed. Coverage includes the public feature matrix, exact route resolution, unsupported-route rejection, namespaced and claim-scoped preferences, bounded/deduplicated recents, visible-only 60-second refresh/catch-up, server-cache-preserving API client use, typed `catalogKey` display, and isolation checks.

## Verification

Focused tests:

```sh
node --experimental-strip-types --test test/public-shell.test.mjs test/public-router.test.mjs
```

Result: 6 passed, 0 failed.

Typecheck:

```sh
corepack pnpm --filter @workspace/bitcraft-local run typecheck
```

Result: passed.

Production build:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Result: passed, including server/bindings compilation, asset verification, frontend typecheck/build, and Relay runtime boundary verification.

Full package test:

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Result: passed.

Smoke:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s -H "Host: claim-monitor.com" http://127.0.0.1:18449/api/profile
```

The public host returned the expected public profile (`allowsAdmin: false`, `allowsDiscord: false`). Host-header route checks returned `200` for `/`, settlement overview, members, inventory, crafts, calculator, leaderboard, and map (the static app then applies its public not-found route for unsupported pages); `/admin` and `/bot` returned `404`; `/api/local/bootstrap` returned `404`.

The local smoke environment intentionally leaves `publicProfileEnabled` false, so a browser can only mount the Timbersteel profile on `127.0.0.1`. I did not alter smoke configuration or host mappings just to bypass that deployment guard. The focused route/import tests and host-header smoke cover the public shell boundary in this environment.

## Import-boundary proof

The public-root and shell test reads the public root, shell, and public API client and fails if they reference Timbersteel root/bootstrap/shell, Featurebase, behavioral telemetry, generation watcher, Admin/bot surfaces, or `/api/local/`. The public shell imports only React, Lucide icons, and sibling public modules; it does not import Timbersteel pages, configured game-data, history, notifications, or bot/admin code.

## Self-review

- URL claim IDs are validated by the public router and used for all settlement fetches.
- Search supports names and exact IDs through the public search envelope; recent entries are display hints only.
- Initial loading, unavailable, partial-warning, stale, and refresh-failure-with-last-good-state cases have distinct UI states.
- Inventory and crafts keep `items:<id>` and `cargo:<id>` distinct in their display labels.
- No feature feedback or telemetry initialization was added.
- No server, schema, dependency, version, changelog, configured-game-data, history, or notification code changed.

## Concerns

- The public production host must set `PUBLIC_PROFILE_ENABLED=true` before live public API content can be observed in a local browser. This implementation deliberately does not change that deployment flag.

## Fix round 1/5 — search-hint contract alignment

### Finding and fix

The public settlement API returns safe hint records keyed by `claimId`, but the initial client type and search-result links read `entityId`. A name or exact-ID result could therefore create `/settlements/undefined`.

- Added `publicSettlementPath()` as the single validated conversion from a public search hint to a claim route.
- Updated the public client `PublicHint` contract and search results to use `claimId` consistently.
- Covered both normal name-search and max unsigned-64 exact-ID selection, plus rejection of an `entityId`-only legacy-shaped hint.
- Preserved all approved Plans/collaboration skeleton paths (`/plans/new`, `/plans/:id`, `/shared-plans/:id`, and `/invites/:id`).

### RED

```sh
node --experimental-strip-types --test test/public-shell.test.mjs
```

Output: failed at module load as expected:

```txt
SyntaxError: The requested module '../src/public/routes.mjs' does not provide an export named 'publicSettlementPath'
```

### GREEN

```sh
node --experimental-strip-types --test test/public-shell.test.mjs test/public-router.test.mjs
```

Output: `7 passed, 0 failed`.

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Output: passed, including frontend TypeScript validation and Vite build.
