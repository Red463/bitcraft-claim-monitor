# Developer guide

Work from the repository root. The maintained application is
[`apps/bitcraft-local`](../apps/bitcraft-local/); do not recreate or edit
historical exports unless a task explicitly requires it.

## Requirements and commands

- Node.js 24+
- Corepack
- pnpm `11.1.3`, pinned by the root `packageManager` field

```powershell
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
corepack pnpm --filter @workspace/bitcraft-local run typecheck
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Development addresses are `http://localhost:19428` for Vite and
`http://127.0.0.1:19430` for the Node API. Vite proxies same-origin `/api/*`
requests to the local API. Start configuration from [`.env.example`](../.env.example).

## Data-flow rules

1. The server-owned ingestion process discovers Relay topology and acquires
   joined HTTP-cache data plus generated typed global/regional subscription
   data; separated production assigns this work to the worker role.
2. Provider normalizers convert wire records into provider-neutral domains.
3. A complete validated domain publication becomes current atomically; other
   domains and dependencies may be on different application generations.
4. The web process composes current/last-good domains through `/api/local/*`.
5. React requests only those same-origin routes and preserves per-domain quality
   plus response coherence metadata.
6. Claim/domain watchers invalidate open provider-neutral pages; history and
   specialized endpoints retain their narrower ownership.
7. Durable history, analytics, transitions, and Discord work run after current
   publication and must not delay it.

Never import Relay wire DTOs into React or insert raw wire rows into history.
Keep Relay field names, timestamps, encodings, and nullable-shape handling under
`apps/bitcraft-local/src/server/game-data/`.

IDs and large integral amounts remain decimal strings or BigInts until display
formatting. Include `item` or `cargo` in every catalog and market key.

## Provider changes

For a Relay-backed field or domain:

1. identify the authoritative HTTP route or typed table and prove its semantics;
2. add a focused fixture or behavioral test;
3. normalize into a provider-neutral contract;
4. publish a complete per-domain generation;
5. persist history/events only when durable observation is required;
6. expose the result through `/api/local/game-data` or a focused local route;
7. wire pages and collectors to the same normalized boundary; and
8. test missing, malformed, stale, reconnect, and schema-mismatch behavior.

Do not implement a SpacetimeDB wire codec. Regenerate bindings with the pinned
official CLI/SDK procedure. A schema fingerprint mismatch must fail closed and
preserve last-good data; ingestion must not guess at a changed schema.

## API and browser behavior

For `/api/local/game-data`:

- enforce the configured monitored claim and active-region scope;
- return an explicit status for every requested domain;
- preserve available stale/partial last-good envelopes;
- return HTTP `503` only when no requested domain has ever loaded; and
- describe coherence only across known local application generations and exact
  dependency publications, never as simultaneous upstream observation.

Provider-neutral pages use a claim/domain-filtered SSE watcher. Craft Monitor's
recovery poll is one second; other interval provider pages use 30 seconds.
Hidden tabs do not poll. Manual-only and non-provider pages do not create a
watcher. Generation invalidations coalesce and failed generation cycles back
off at 5, 10, 20, then at most 30 seconds.

The navigation cache is scope-safe and bounded to eight entries, 4 MiB, and a
five-minute absolute TTL. Do not bypass its claim/panel completion guard or
cache an oversized/size-unknown response. The public bootstrap must resolve a
decimal claim ID before claim-scoped hooks start; protected Admin settings stay
behind authenticated routes and do not belong in the public bootstrap.

History ownership is exact: Dashboard owns `activity,market,dashboard`,
Activity owns `activity`, and Settlement Market owns `market`. An empty include
means no request and no refresh-task enrollment.

## Persistence and delivery

Add durable storage only for restart recovery, bounded indexed projections,
history/transitions, notifications/deduplication, user/admin/legal/privacy
state, audit, or operational evidence. Do not add a scheduled cache merely to
avoid a live current-state read.

Claim-market generations use the durable provider-transition outbox. Transition
dispatch writes idempotent history, activity, and Discord enqueue effects before
token-conditioned acknowledgement. Network delivery must never occur inside a
current-state or transition transaction.

Discord delivery uses durable SQLite leases and remains at-least-once. Every
network path must retain the current lease guard; a stale worker must not send
or complete a reclaimed row.

Preview and tests are no-send by default:

```text
BITCRAFT_DEPLOYMENT_MODE=preview
DISCORD_DELIVERY_MODE=record
ENABLE_DISCORD_STARTUP=false
DISCORD_SANDBOX_CHANNEL_ID=<optional-exact-test-channel>
```

Only an authenticated manual test may use the exact sandbox channel. Automatic
jobs, DMs, gateway startup, and command registration cannot use that exception.
Tests use record mode or a loopback fake Discord origin.

Operational-history deletion remains disabled and has an empty approved table
allowlist. Do not enable or expand it without owner/dependency approval, raw and
rollup reader parity, production baseline evidence, a machine-verified backup,
and the required observation period. `production_contribution_events` is not a
pruning candidate.

## Testing boundaries

Use focused Node tests while developing. For frontend logic, run the production
build. For backend, database, provider, polling, notification, Discord, or API
changes, run both the app build and test suite. Follow [`AGENTS.md`](../AGENTS.md)
for the lightest check appropriate to the change.

Optional built browser smoke:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

The smoke server uses `http://127.0.0.1:18449`. It does not replace the normal
development frontend/API ports.

Useful live provider verifiers are package scripts, but they contact live Relay
and should be run only when that evidence is required:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run verify:relay-global-live
corepack pnpm --filter @workspace/bitcraft-local run verify:relay-region-live
```

Never use live Discord delivery during routine verification.

## Source map and operations

- React entry and coordination: `apps/bitcraft-local/src/main.tsx` and
  `apps/bitcraft-local/src/AppShell.tsx`
- Page domain ownership: `apps/bitcraft-local/src/api/pageDomains.ts`
- Browser refresh: `apps/bitcraft-local/src/refresh/`
- Provider boundary: `apps/bitcraft-local/src/server/game-data/`
- Web composition: `apps/bitcraft-local/server.mjs`
- Worker entry: `apps/bitcraft-local/worker.mjs`
- Database modules: `apps/bitcraft-local/src/server/`
- Tests: `apps/bitcraft-local/test/`

For deployment identities, backups, rollback, and canonical cutover, follow
[`DEPLOYMENT.md`](../DEPLOYMENT.md). For runtime relationships and known data
limits, read the [application overview](./application-overview.md).
