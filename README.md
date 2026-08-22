# BitCraft Claim Monitor

BitCraft Claim Monitor is a local-first settlement operations dashboard for
BitCraft. The maintained application is [`apps/bitcraft-local`](./apps/bitcraft-local/).
Historical exports are not maintained application code; material under
`docs/relay-migration/` and older changelog entries is retained as migration and
release evidence.

Public repository: [Red463/bitcraft-claim-monitor-relay](https://github.com/Red463/bitcraft-claim-monitor-relay)

Canonical application: [app.timbersteeltrade.com](https://app.timbersteeltrade.com)

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

Use [`.env.example`](./.env.example) as the process and secret configuration
entrypoint. The monitored claim, active regions, and most Discord operational
settings are managed through authenticated Admin and stored in SQLite. The bot
token can be stored as a protected application secret; environment variables
can override the token and Discord identity fields. Provider, process,
data-directory, delivery-mode, startup, and bot-network safeguards are
environment configuration. OAuth has the separate fallback rules described
below. Never commit credentials or player tokens.

Preview mode forces normal Discord delivery to record mode and disables gateway
startup:

```text
BITCRAFT_DEPLOYMENT_MODE=preview
DISCORD_DELIVERY_MODE=record
ENABLE_DISCORD_STARTUP=false
DISCORD_SANDBOX_CHANNEL_ID=
```

Automatic channel delivery and DMs are recorded, the gateway is disabled, and
command registration requires live mode. This is not a global outbound-network
block: `ENABLE_DISCORD_NETWORK` defaults to enabled, and an authenticated manual
test can call Discord when an exact valid `DISCORD_SANDBOX_CHANNEL_ID` is
configured. To block bot delivery, manual bot API calls, and Discord interaction
handling, also set:

```text
ENABLE_DISCORD_NETWORK=false
```

That setting does not guard Discord OAuth start, callback, token, or profile
requests. OAuth is enabled whenever both a client ID and secret resolve:

- client ID: `DISCORD_OAUTH_CLIENT_ID` when defined, otherwise the resolved bot
  application ID (`DISCORD_APPLICATION_ID` when defined, otherwise Admin's
  stored `discord_json.applicationId`); a defined blank value masks the
  lower-priority client-ID source;
- client secret: non-empty `DISCORD_OAUTH_CLIENT_SECRET`, otherwise protected
  SQLite secret `discord_oauth_client_secret`;
- redirect URI: non-empty `DISCORD_OAUTH_REDIRECT_URI`, otherwise the request
  origin's `/api/local/auth/discord/callback` (canonical mode forces
  `https://app.timbersteeltrade.com/api/local/auth/discord/callback`).

The redirect alone does not enable OAuth. To suppress server-side Discord
bot/API/OAuth traffic, use `ENABLE_DISCORD_NETWORK=false` and leave/clear all
client-ID and client-secret sources above so `discordOAuthConfig.enabled` is
false. In particular, a blank environment client secret does not mask a stored
SQLite secret. Clear the stored application ID through authenticated Admin;
clearing the protected OAuth secret requires an approved database-secret
procedure because the ordinary Discord settings form does not write it.

This is not whole-browser network isolation. Authenticated UI can render stored
Discord avatar URLs from `cdn.discordapp.com`, which the Content Security Policy
allows, so a browser may fetch those assets directly. Suppress remote avatar
assets separately when that matters; the application does not document a single
setting that disables them. Routine tests use record mode or a loopback fake
Discord service, never a real destination.

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

## License metadata warning

The application is unofficial and is not affiliated with Clockwork Labs.
BitCraft names and assets belong to their respective owners.

The canonical legal files, [LICENSE](./LICENSE) and [NOTICE](./NOTICE), state
AGPL-3.0-only. The root `package.json` currently declares `MIT`; that package
metadata is stale and contradicts the legal files pending maintainer/legal
correction. Do not infer licensing from the package field. See also the
[trademark guidance](./TRADEMARKS.md).
