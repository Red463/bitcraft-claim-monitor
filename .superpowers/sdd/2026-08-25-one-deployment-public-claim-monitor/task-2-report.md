# Task 2 report — host profiles and public router skeleton

## Implementation

- Added a server-owned exact host-profile resolver for Timbersteel and public hosts. It accepts forwarded host data only when the peer is loopback, rejects unknown production hosts with HTTP 421, and permits the documented development/smoke hosts.
- Added the profile router before all existing API/session handling. It serves `GET /api/profile`, fails closed across the Timbersteel/public API namespaces, and blocks public access to local, Discord, bot, and Admin routes before any session lookup.
- Public feature flags are server-owned and default false: `PUBLIC_PROFILE_ENABLED`, `PUBLIC_COLLABORATION_ENABLED`, and `PUBLIC_LEGAL_CONFIGURATION_CONFIRMED`.
- Split startup into lazy `TimbersteelRoot` and `PublicRoot`. The Timbersteel bootstrap, Featurebase, and existing application imports remain in `TimbersteelRoot`; the isolated public root only resolves the public route skeleton.
- Added the supported public paths and the `claim-monitor.public.*` browser-key helper. Unsupported public paths resolve to public not-found.

## Files

- `apps/bitcraft-local/server.mjs`
- `apps/bitcraft-local/src/server/public/hostProfiles.mjs`
- `apps/bitcraft-local/src/server/public/router.mjs`
- `apps/bitcraft-local/src/main.tsx`
- `apps/bitcraft-local/src/TimbersteelRoot.tsx`
- `apps/bitcraft-local/src/api/profile.ts`
- `apps/bitcraft-local/src/public/PublicRoot.tsx`
- `apps/bitcraft-local/src/public/routes.mjs`
- `apps/bitcraft-local/src/public/routes.d.mts`
- Focused host, public-router, frontend-profile, and updated bootstrap-boundary tests.

## TDD evidence

1. RED: `node --experimental-strip-types --test test/host-profiles.test.mjs` failed with `host profile resolver must exist`.
   GREEN: the same command passed after adding `hostProfiles.mjs`.
2. RED: `node --experimental-strip-types --test test/host-profile-boundaries.test.mjs` (with the required elevated local dependency access) failed because `GET /api/profile` returned 404 rather than 200.
   GREEN: the focused host/profile suite passed after the early server delegation and public router were added.
3. RED: `node --experimental-strip-types --test test/public-router.test.mjs` failed with `public route boundary must exist`.
   GREEN: the same command passed after adding the public route and storage-key boundary.
4. RED: `node --experimental-strip-types --test test/frontend-profile.test.mjs` failed with `profile client must exist`.
   GREEN: the frontend-profile and public-router tests passed after the profile client and lazy roots were added.
5. The first full build exposed profile narrowing and `.mjs` declaration errors. A focused `tsc -p tsconfig.json --noEmit` reproduced them; the final focused type check passed after explicit profile normalization and `routes.d.mts` were added.

## Verification

- Focused boundary checks: 12 passed, 0 failed.
- `corepack pnpm --filter @workspace/bitcraft-local run build` — passed (exit 0).
- `corepack pnpm --filter @workspace/bitcraft-local test` — passed: 2,633 tests, 2,630 passed, 0 failed, 3 skipped.
- `node scripts/start-bitcraft-local-smoke.mjs --restart` — passed.
- `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:18449/api/local/health` — `200`.

## Self-review

- The host/profile decision happens before the existing route telemetry and every existing session lookup.
- The public root does not import the Timbersteel bootstrap, history, Admin, bot, notifications, generation watcher, or configured game-data loader modules.
- Existing Timbersteel storage keys were left unchanged; the new public helper always prefixes keys with `claim-monitor.public.`.
- Public API routing deliberately returns not-found while the public feature flags are off; Task 3 owns concrete public API handlers.

## Concerns

None for Task 2. The smoke launcher remains running at `http://127.0.0.1:18449/` as the normal local verification process.

## Fix round 1 — public API catch-all and production localhost gate

### Findings addressed

- Public hosts now deny every `/api/**` path other than the already-handled `GET /api/profile` and `/api/public/**` namespace. This happens in the host-profile router before the existing downstream routes can inspect sessions.
- Server startup now permits development host aliases only when `NODE_ENV` is not production. `BITCRAFT_TEST=true` no longer relaxes the production host boundary.

### TDD evidence

1. RED: `node --experimental-strip-types --test test/host-profiles.test.mjs` failed `public host router handles every non-public API path before downstream routing` because the router returned `false` for `/api/future/internal-status`.
   GREEN: the same test passed after the public `/api/**` catch-all denial was added.
2. RED: `node --experimental-strip-types --test test/host-profile-boundaries.test.mjs` failed `production rejects public.localhost even in the test runtime` because `/api/profile` returned `200`, not `421`.
   GREEN: the same test passed after removing the `isTestRuntime` production override.

### Fix verification

Command:

```sh
node --experimental-strip-types --test test/host-profiles.test.mjs
node --experimental-strip-types --test test/host-profile-boundaries.test.mjs
node --experimental-strip-types --test test/public-router.test.mjs
```

Output: 6 tests passed, 0 failed.
