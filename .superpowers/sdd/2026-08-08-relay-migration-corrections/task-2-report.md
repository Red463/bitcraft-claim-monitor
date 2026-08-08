# Task 2 Report — Members, Presence, and Warning Accuracy

## Status

Implemented Task 2 in the isolated `relay-corrections` worktree. No production, VPS, deployment, Discord, or external game-data mutation was performed.

## Files

### Runtime and normalization

- `apps/bitcraft-local/src/server/game-data/http.ts`
- `apps/bitcraft-local/src/server/game-data/playerPresenceService.ts`
- `apps/bitcraft-local/src/server/game-data/normalizers.ts`
- `apps/bitcraft-local/src/server/game-data/primaryRegionPlayerSession.ts`
- `apps/bitcraft-local/src/server/game-data/primaryRegionRuntime.ts`

### Provider-neutral presentation

- `apps/bitcraft-local/src/utils/normalize.ts`
- `apps/bitcraft-local/src/pages/memberPresence.ts`
- `apps/bitcraft-local/src/pages/MembersPage.tsx`
- `apps/bitcraft-local/src/pages/RegionPage.tsx`
- `apps/bitcraft-local/src/api/pageGameDataWarnings.ts`
- `apps/bitcraft-local/src/AppShell.tsx`

### Tests and release metadata

- `apps/bitcraft-local/test/player-presence-service.test.mjs`
- `apps/bitcraft-local/test/member-presence-presentation.test.mjs`
- `apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs`
- `apps/bitcraft-local/test/primary-region-player-session.test.mjs`
- `apps/bitcraft-local/test/primary-region-runtime.test.mjs`
- `apps/bitcraft-local/test/relay-topology-http.test.mjs`
- `apps/bitcraft-local/test/game-data-repository-route.test.mjs`
- `apps/bitcraft-local/test/page-game-data-warnings.test.mjs`
- `apps/bitcraft-local/package.json`
- `CHANGELOG.md`

## Behavior delivered

- Primary-region player rows now carry `presenceRegionId` and `presenceSource: "regional"`.
- Only normalized monitored members with `presenceSource: "unavailable"` are sent to Relay `GET /player/{entityId}`.
- Player-detail requests use a 60,000 ms cache boundary, shared in-flight deduplication, and a global concurrency semaphore capped at four.
- Successful player detail preserves Relay region, boolean `signed_in`, normalized last-active and last-login timestamps, and marks the source `relay-player`.
- HTTP, identity, missing-field, and malformed-detail failures preserve `signedIn: null`, `presenceRegionId: null`, and `presenceSource: "unavailable"`; they do not infer offline.
- Primary-region omission is no longer a snapshot warning or global `partialErrors` entry.
- Member display precedence is confirmed online, valid last-active, valid last-login, then Never. Unknown presence renders `Presence unavailable` rather than Offline.
- Missing optional regional owner usernames are exposed at `coverage.missingOwnerUsernameCount`, remain local to Region diagnostics, and no longer create a global warning or lookup fanout.
- Saved-data copy says refresh continues only while loading/manual refresh is active; otherwise it reports that live refresh is unavailable.
- Version and changelog were advanced to `0.51.0-beta.3`.

## TDD evidence

### First red

Command:

```powershell
node --experimental-strip-types --test test/player-presence-service.test.mjs test/member-presence-presentation.test.mjs test/relay-game-data-normalizers.test.mjs test/page-game-data-warnings.test.mjs test/game-data-repository-route.test.mjs
```

Observed: exit 1, 59 passed / 9 failed. Failures were the absent presence service and presentation helper, missing stale-copy helper, old owner-warning contract, and old omitted-member `signedIn: false` plus global warning behavior.

### Wiring red

The new HTTP and runtime wiring was temporarily removed after adding its focused tests.

```powershell
node --experimental-strip-types --test test/relay-topology-http.test.mjs test/primary-region-runtime.test.mjs
```

Observed: exit 1, 16 passed / 2 failed. The client had no `player` method and the runtime never constructed/called the injected presence service.

### Focused green

```powershell
node --experimental-strip-types --test test/player-presence-service.test.mjs test/member-presence-presentation.test.mjs test/relay-game-data-normalizers.test.mjs test/page-game-data-warnings.test.mjs test/game-data-repository-route.test.mjs test/relay-topology-http.test.mjs test/primary-region-runtime.test.mjs
```

Observed: exit 0, 86 passed / 0 failed.

## Final verification

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Observed: exit 0. Server/provider TypeScript, bindings, assets, frontend TypeScript, Vite client build, and Relay runtime boundaries completed successfully.

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Observed: exit 0, 1,646 passed / 0 failed.

The first sandboxed full-suite attempt had one intentionally stale session fixture and two spawned-server health timeouts. The session fixture was updated. Systematic reproduction showed the spawned server exited because the sandbox could not read the existing pnpm `exceljs` junction and therefore resolved a nonexistent fallback `index.js`; rerunning the unchanged suite with access to the existing junctions passed all tests.

## Commits

- `bd9ccaf` — Correct Relay member presence and warnings
- Final report/test-fixture commit: recorded in Git immediately after this report was written.

## Concerns

- Live Relay verification of Allusion was intentionally not performed because the controller reserved production/live rollout and verification.
- Player-detail failures intentionally remain per-member `unavailable` metadata and are not promoted to global warnings, matching the brief; operators must inspect the affected member rather than a global banner.
