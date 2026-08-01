# BitCraft Claim Monitor

BitCraft Claim Monitor is a local-first settlement operations dashboard for
BitCraft. This standalone repository uses the public
[BitCraft Sync Relay](https://relay.bitcraftsync.app/) for current game data and
does not expose an upstream API to React.

Repository: [Red463/bitcraft-claim-monitor-relay](https://github.com/Red463/bitcraft-claim-monitor-relay)

Preview: [relay.timbersteeltrade.com](https://relay.timbersteeltrade.com)

The maintained application is `apps/bitcraft-local`. Its public product name
remains “BitCraft Claim Monitor”; Relay-specific names are used for repository,
deployment, data, backup, and service isolation.

## Data architecture

`RelayBitCraftProvider` is the current server-side provider. It combines:

- bounded Relay HTTP-cache reads for joined claim, membership, inventory,
  craft, storage-log, and deposit data;
- official typed SpacetimeDB subscriptions for global catalogs and regional
  state;
- normalizers that are the only code allowed to understand Relay field names,
  wire timestamps, or numeric encodings;
- atomic committed Relay generations in the current-state repository.

React uses provider-neutral local routes, primarily:

```http
GET /api/local/game-data?claimId=<decimal-id>&domains=claim,members
```

The browser never calls Relay or SpacetimeDB directly. Open pages listen for
provider generation events and refetch the domains they own, so healthy updates
normally appear quickly without waiting for a broad scheduled acquisition job.
A bounded poll remains a recovery path if an event is missed.

Each domain envelope includes freshness, confidence, age, warnings, and source
provenance. During an outage, the server returns last-good data marked stale
when available. It returns `503` only when none of the requested domains has
ever loaded.

The `GameDataProvider` seam keeps React, local routes, and persistence
transport-neutral. A later `DirectBitCraftProvider` can implement the same
interface without another UI or database rewrite.

## SQLite ownership

SQLite is not a substitute for live provider reads. It owns only:

- normalized current-domain and catalog projections needed for atomic
  generations, joins, and restart recovery;
- durable history and events used by charts, analytics, notifications, storage
  activity, and locally observed market transitions;
- user, admin, legal, analytics-consent, and Discord state;
- operational health, outbox, deduplication, backup, and audit records.

Retired snapshot/catalog acquisition tables and browser-submitted snapshots do
not populate live views. See
[`docs/relay-migration/table-inventory.md`](./docs/relay-migration/table-inventory.md)
for the current table-by-table ownership decision.

## Features

The application provides settlement dashboards for claim status, members,
professions, production, public crafts, inventory, construction, research,
recruitment, equipment, market, region, empires, map/layout, deposits, activity,
planning tools, and administration. Background collection, history,
notifications, and Discord outbox processing continue without a browser.

IDs remain decimal strings across browser and persistence boundaries. Item and
cargo identities include their kind so equal numeric IDs never collide.
Historical charts clearly describe their locally observed time window.

## Local icons and provenance

All runtime game icons are local files under
`apps/bitcraft-local/public/game-icons/`; the browser never requests a remote
icon host. `apps/bitcraft-local/assets/game-icons-manifest.json` is the one
intentional historical-source exception: it records immutable build-time
provenance including the original URL, local path, digest, retrieval time,
catalog identity, and permission reference. Original URLs in that manifest are
never fetched at runtime.

The build validates the manifest, SHA-256 digests, missing files, and duplicate
catalog identities.

## Development

Requirements:

- Node.js 24 or newer
- Corepack
- the pinned pnpm version from `package.json`

```powershell
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
```

Default Relay-clone development addresses:

- frontend: `http://localhost:19428`
- local API: `http://127.0.0.1:19430`

Verification:

```powershell
corepack pnpm run typecheck
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

The Vite server proxies same-origin `/api/*` requests only to the local Node
server on port `19430`.

## Configuration

Start with [`.env.example`](./.env.example). Important groups are:

- `BITCRAFT_RELAY_ORIGIN`, `ENABLE_RELAY_PROVIDER`, and
  `ENABLE_RELAY_GLOBAL_CATALOG` for provider topology;
- `RELAY_*` pool, refresh, rotation, and stale thresholds for bounded regional
  work;
- `BITCRAFT_LOCAL_DATA_DIR` for the fresh standalone SQLite data directory;
- `DISCORD_DELIVERY_MODE=record` and `ENABLE_DISCORD_STARTUP=false` for
  preview-safe shadow delivery. Authenticated Admin manual tests may send only
  to the exact `DISCORD_SANDBOX_CHANNEL_ID`; automatic work remains recorded
  and cannot use this exception.

Do not commit credentials or player tokens.

## Deployment

The Relay clone runs beside the maintained application with isolated
identities:

- install: `/opt/bitcraft-claim-monitor-relay`
- data: `/var/lib/bitcraft-claim-monitor-relay`
- backups: `/var/backups/bitcraft-claim-monitor-relay`
- environment: `/etc/bitcraft-claim-monitor-relay.env`
- updater: `/usr/local/bin/update-bitcraft-claim-monitor-relay`
- web: `bitcraft-claim-monitor-relay.service`
- worker: `bitcraft-claim-monitor-relay-worker.service`
- preview API port: `19430`
- preview host: `relay.timbersteeltrade.com`

The **Deploy Relay preview** workflow uses the `relay-preview` GitHub
environment to deploy exact tested SHAs. Preview units
force Discord record mode and disable startup/command registration. Only an
authenticated manual test can post to the configured sandbox Discord channel.
Caddy routing is a one-time supervised bootstrap and the updater never
overwrites the live Caddyfile.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for setup, diagnostics, backups, rollback,
and cutover gates.

## Documentation

- [`docs/application-overview.md`](./docs/application-overview.md) — runtime
  architecture and data flow
- [`docs/developer-guide.md`](./docs/developer-guide.md) — implementation rules
  and commands
- [`docs/relay-migration/parity-matrix.md`](./docs/relay-migration/parity-matrix.md)
  — page, collector, job, and notification parity
- [`docs/relay-migration/table-inventory.md`](./docs/relay-migration/table-inventory.md)
  — SQLite ownership and retired tables
- [`CHANGELOG.md`](./CHANGELOG.md) — historical release record

Historical migration evidence and changelog entries retain source names for
auditability; they are not active runtime configuration.

## License and legal

This is an unofficial community application and is not affiliated with Clockwork
Labs. BitCraft game names and assets belong to their respective owners. Review
the in-app Terms and Privacy pages before any public deployment.
