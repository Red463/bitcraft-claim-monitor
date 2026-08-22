# Developer guide

Work from the repository root. The active application is
`apps/bitcraft-local`; do not recreate historical exports.

## Requirements and commands

- Node.js 24+
- Corepack
- pnpm pinned by the root `packageManager`

```powershell
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
corepack pnpm run typecheck
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Development addresses are `http://localhost:19428` for Vite and
`http://127.0.0.1:19430` for the Node API. Vite proxies `/api/*` only to the
local server.

## Data-flow rules

1. React asks provider-neutral local routes for page domains. The main route is
   `/api/local/game-data`.
2. The server reads atomic normalized generations from the current-state
   repository.
3. `RelayBitCraftProvider` populates generations from bounded Relay HTTP-cache
   adapters and official typed SpacetimeDB subscriptions.
4. Provider generation events invalidate the claim-scoped owned domains of open
   provider-neutral pages. SSE is primary; the recovery poll is one second for
   Craft Monitor and 30 seconds for other interval provider pages. Hidden tabs
   do not poll, and manual or non-provider pages create no watcher.
5. Missing live inputs preserve and label last-good data as stale.

Never import Relay wire DTOs into React. Never put raw wire records directly
into history tables. Keep Relay field names, timestamps, encodings, and
nullable-shape handling inside
`apps/bitcraft-local/src/server/game-data/normalizers/`.

IDs and large integral amounts must remain decimal strings or BigInts until
formatting. Include `item` or `cargo` in every catalog key.

## Provider changes

The `GameDataProvider` interface is the stable seam. Add behavior vertically:

1. identify the authoritative Relay HTTP route or typed table;
2. add a fixture proving semantics;
3. normalize to a provider-neutral domain;
4. commit through a complete staging generation;
5. persist history/events only when the feature needs durable observation;
6. expose the domain through `/api/local/game-data` or a focused
   provider-neutral local route;
7. wire the page and collector to the same repository;
8. test last-good, malformed, reconnect, and schema-mismatch paths.

Do not implement a BSATN codec. Generate bindings with the pinned official
SpacetimeDB CLI/SDK versions. A schema fingerprint change requires regenerated
bindings and deployment; ingestion must not guess.

`DirectBitCraftProvider` is reserved for a later adapter. Provider-specific
changes must not require another React or database redesign.

## Persistence decisions

Create a durable table only when at least one of these is true:

- upstream history can expire;
- transitions, charts, dedupe, or notifications require local observation;
- the state belongs to a user, administrator, legal record, Discord workflow,
  outbox, or audit log;
- restart recovery or atomic generation swapping requires a normalized
  projection;
- operational health and backup correctness need durable evidence.

Do not add a table merely to avoid a live Relay read. Live pages consume
committed Relay generations as soon as possible. Document additions and
retirements in `docs/relay-migration/table-inventory.md`.

The runtime retired-table authorizer is enabled by integration tests; accessing
a retired table is a failure rather than a silent fallback.

## Local APIs

For `/api/local/game-data`:

- enforce the configured monitored claim;
- enforce configured active regions;
- return partial envelopes independently;
- return `200` with stale last-good envelopes;
- return `503` only when no requested domain has ever loaded;
- use the existing refresh coordinator for manual refresh.

Generation refreshes use the same coordinator with single-flight coalescing and
at most one trailing cycle. Only generation-triggered failures use the bounded
5/10/20/30-second retry; an ordinary interval failure waits for the next normal
interval, and success resets generation backoff.

For `/api/local/history`, keep ownership narrow: Dashboard owns
`activity,market,dashboard`, Activity owns `activity`, and Local Market owns
`market`. An empty include means no fetch and no refresh-task enrollment; do not
clear retained owned history while a same-scope refresh is in flight.

Admin mutations require authenticated permissions, same-origin validation, and
CSRF. Never expose tokens, setup keys, OAuth secrets, or protected settings.

## Background and Discord behavior

Ingestion, history, collectors, and outbox processing must continue without a
browser. Scheduled work may derive history or perform operational maintenance;
it must not be the normal source of current page data.

Preview is shadow-only:

```text
DISCORD_DELIVERY_MODE=record
ENABLE_DISCORD_STARTUP=false
DISCORD_SANDBOX_CHANNEL_ID=<explicit-test-channel>
```

Automated preview delivery and command registration stay disabled.
An authenticated administrator may explicitly send a manual test only to the
exact sandbox Discord channel in `DISCORD_SANDBOX_CHANNEL_ID`. A supplied
nonmatching channel is rejected. Automatic jobs, the outbox, DMs, gateway
startup, and command registration remain recorded or disabled and cannot use
this exception. Tests use a local fake Discord origin and must never send real
Discord messages.

## Assets

Use the local resolver for every game icon. Browser runtime code must not
construct remote icon URLs; the only approved runtime exception is the bounded
server-side `/api/local/game-icon/:itemType/:itemId` fallback.

`apps/bitcraft-local/assets/game-icons-manifest.json` is the explicit exception
to provider-name scans: it is immutable build-time provenance and is not
fetched at runtime. Preserve original URL, local path, SHA-256 digest, retrieval
date, catalog identity, and permission reference. The asset verifier must fail
for missing files, duplicate identities, and digest mismatches.

## Testing boundaries

Use focused Node tests while developing, then run the app test suite for
backend, database, provider, polling, notification, or Discord changes. Always
run the build for production TypeScript changes.

Relay-specific coverage should include:

- decimal-string round trips and item/cargo collisions;
- seconds/milliseconds/microseconds conversion;
- partial/cache-not-ready HTTP responses;
- initial subscription and insert/update/delete/reconnect flows;
- generation swap and restart recovery;
- schema fingerprint mismatch;
- storage/listing/event dedupe;
- sold versus removed-or-cancelled semantics;
- stale last-good responses;
- region pool limits and idle close;
- zero upstream browser routes or asset requests.

For built browser smoke:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
node scripts/start-bitcraft-local-smoke.mjs --restart
```

The smoke server uses `http://127.0.0.1:18449`; the normal Relay API remains on
port `19430`.

## Deployment

The standalone preview repository deploys through the `relay-preview` GitHub
environment to `https://relay.timbersteeltrade.com`. Deployment identities are:

- `/opt/bitcraft-claim-monitor-relay`
- `/var/lib/bitcraft-claim-monitor-relay`
- `/var/backups/bitcraft-claim-monitor-relay`
- `/etc/bitcraft-claim-monitor-relay.env`
- `/usr/local/bin/update-bitcraft-claim-monitor-relay`
- `bitcraft-claim-monitor-relay.service`
- `bitcraft-claim-monitor-relay-worker.service`

The preview API listens on `19430`. The updater installs an exact tested SHA and
never replaces the live Caddyfile. Follow `DEPLOYMENT.md` for one-time
bootstrap, diagnostics, backup, rollback, soak, and cutover.
