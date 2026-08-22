# BitCraft Claim Monitor

BitCraft Claim Monitor is a local-first settlement operations dashboard for
BitCraft. The maintained application is [`apps/bitcraft-local`](./apps/bitcraft-local/).
Historical exports are not maintained application code; material under
`docs/relay-migration/` and older changelog entries is retained as migration and
release evidence.

Public repository: [Red463/bitcraft-claim-monitor-relay](https://github.com/Red463/bitcraft-claim-monitor-relay)

Preview: [relay.timbersteeltrade.com](https://relay.timbersteeltrade.com)

## What it provides

- Settlement status, members, professions, inventory, crafts, construction,
  research, recruitment, equipment, activity, and planning tools.
- Settlement and regional market views, favorites, price/history views, deal
  watches, and locally observed trade reporting.
- Region, empire, public-craft, deposit, and map views.
- Authenticated administration plus Discord configuration, notifications, and
  bot controls.
- Server-owned collection, history, diagnostics, and delivery work that
  continues without a browser open.

## Runtime and data boundaries

The server-owned ingestion process (the worker role in separated production)
discovers Relay topology and acquires current game state through two paths:

- bounded Relay HTTP-cache reads for joined claim, member, inventory, craft,
  deposit, and storage-log data; and
- generated, typed SpacetimeDB subscriptions for global catalogs and regional
  state.

Relay-specific field names, nullable shapes, timestamps, and numeric encodings
are normalized under `apps/bitcraft-local/src/server/game-data/`. Wire records
do not enter React or history tables. IDs and large amounts remain decimal
strings, and item/cargo kind remains part of each identity.

Each validated domain is published atomically to the current-state repository.
SQLite retains the durable last-good domain boundary, locally observed history,
provider transitions, notification/outbox state, settings, accounts, privacy
records, and diagnostics. Current-state publication is independent of slower
history, analytics, and Discord work. Claim-market transitions are committed
durably with the winning market generation and dispatched by the worker after
publication.

The web process serves same-origin, provider-neutral `/api/local/*` routes.
React never connects to Relay or SpacetimeDB directly. Multi-domain responses
include per-domain status and `meta.coherence`; `coherent` means the known local
application generations and declared enrichment dependencies agree. It does
not mean that every upstream source observed the game at the same instant.
Domains may deliberately be mixed, stale, partial, or unavailable while other
last-good domains remain usable.

Open provider-neutral pages watch only their claim and owned domains through
local generation events. SSE is the low-latency path. Craft Monitor uses a
one-second recovery poll; other interval provider pages use a 30-second recovery
poll. Hidden tabs do not poll and catch up once when visible. Manual-only and
non-provider pages do not create a generation watcher. These recovery polls are
separate from the normal page refresh schedule.

Discord outbox delivery uses durable SQLite leases and is intentionally
at-least-once: a process failure after Discord accepts a request but before the
local acknowledgement can still produce a duplicate retry.

See the [application overview](./docs/application-overview.md) for the complete
runtime flow and the [developer guide](./docs/developer-guide.md) for code
boundaries.

## Requirements and local development

- Node.js 24 or newer
- Corepack
- pnpm `11.1.3`, pinned by the root `packageManager` field

Run from the repository root:

```powershell
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
```

The development command starts:

- Vite at `http://localhost:19428`
- the local Node API at `http://127.0.0.1:19430`

Build and test:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

The optional built smoke server uses `http://127.0.0.1:18449`; it is not a
third normal development service. See the [developer guide](./docs/developer-guide.md#testing-boundaries)
for its commands.

## Configuration and Discord safety

Use [`.env.example`](./.env.example) as the configuration entrypoint. The
monitored claim and active regions are managed in the application; provider,
process, data-directory, OAuth, and Discord settings come from the environment.
Never commit credentials or player tokens.

Preview mode is fail-closed for Discord:

```text
BITCRAFT_DEPLOYMENT_MODE=preview
DISCORD_DELIVERY_MODE=record
ENABLE_DISCORD_STARTUP=false
DISCORD_SANDBOX_CHANNEL_ID=
```

Automatic delivery, DMs, gateway startup, and command registration remain
recorded or disabled. An authenticated administrator can send a manual test
only to the exact configured sandbox channel. Routine tests use record mode or
a loopback fake Discord service, never a real destination.

Operational-history retention is also safe by default: deletion is disabled,
the approved table allowlist is empty, and Admin/scheduled execution is dry-run
only. Do not enable pruning without the documented ownership, parity, backup,
and observation evidence.

## Known data limits

- Typed ingestion is tied to checked-in schema fingerprints. A mismatch stops
  the affected generation and preserves last-good data until matching bindings
  are generated, tested, and deployed.
- A response's receipt age is not necessarily upstream observation age; some
  sources do not provide an observation timestamp.
- Siege cancellation is not distinguishable from a removed or unknown state.
- Confirmed marketplace sales do not expose purchaser identity.
- Regional trade totals cover confirmed sales observed locally since the shown
  `observedSince`; they are not a complete upstream historical aggregate.
- A disappearing market order is not automatically a sale, and an unknown
  deposit state is not treated as active or harvestable.

The evidence and required product wording are recorded in
[known Relay semantic limits](./docs/relay-migration/unresolved-semantics-2026-08-02.md).

## Deployment and documentation

- [Deployment guide](./DEPLOYMENT.md) — preview, canonical cutover, backups,
  diagnostics, and rollback
- [Application overview](./docs/application-overview.md) — whole-app runtime
  architecture and data ownership
- [Developer guide](./docs/developer-guide.md) — contribution rules and
  verification commands
- [Notification system](./docs/notification-system.md) — notification and
  delivery behavior
- [Privacy operations runbook](./docs/privacy-operations-runbook.md) — privacy
  and deletion operations
- [Changelog](./CHANGELOG.md) and [versioning policy](./VERSIONING.md)

The application is unofficial and is not affiliated with Clockwork Labs.
BitCraft names and assets belong to their respective owners. Repository code is
licensed under [AGPL-3.0-only](./LICENSE); see [NOTICE](./NOTICE) and
[trademark guidance](./TRADEMARKS.md).
