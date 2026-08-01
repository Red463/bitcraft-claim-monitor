# BitCraft Local Monitor

A clean local-first rebuild of the Replit-exported claim monitor.

Run it from the repo root:

```sh
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
```

Open `http://localhost:19428`.

The dev command starts two local services:

- Vite frontend on `http://localhost:19428`
- SQLite history API on `http://127.0.0.1:19430`

The Vite dev server sends `/api/local/*` requests to the local Node API. Browser code uses provider-neutral local routes and never connects directly to Relay or SpacetimeDB.

Current game state is published as committed Relay generations and read immediately through provider-neutral local routes. SQLite stores the atomic last-good domain boundary, shared catalog projections, genuine history, user settings, notification/outbox state, and operational diagnostics; it is not a scheduled mirror that pages wait for.

In production, the Node worker maintains Relay HTTP refresh loops and typed SpacetimeDB subscriptions without a browser open. Generation commits and regional craft-progress transactions trigger history and notification side effects immediately. Scheduled work is limited to repair, retention, reporting, delivery, and maintenance rather than current page-data acquisition.

Notification generation, deduplication, settings and verification notes are documented in [docs/notification-system.md](../../docs/notification-system.md).

Maintainer architecture notes are in [docs/developer-guide.md](../../docs/developer-guide.md), and current public-release blockers are tracked in [docs/release-readiness-audit.md](../../docs/release-readiness-audit.md).

The Admin page is protected by a local server-side session. Current deployments use Discord-backed administrator accounts, with the default owner Discord ID seeded by the server. Legacy password-based admin setup exists only as a compatibility path and should normally remain disabled. Administrator mutations additionally require a same-origin session token.

For isolated testing, set `BITCRAFT_LOCAL_DATA_DIR` before running the dev server to point at a different database directory.

For hosting on an Ubuntu VPS, see [`DEPLOYMENT.md`](../../DEPLOYMENT.md). The production build is served by the Node application:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
NODE_ENV=production APP_PORT=19430 BITCRAFT_LOCAL_DATA_DIR=/var/lib/bitcraft-claim-monitor-relay corepack pnpm --filter @workspace/bitcraft-local run start
```

Configure Discord OAuth/bot settings before relying on Discord admin login in production. The full systemd and Caddy procedure is in the deployment guide.

License: repository-wide `AGPL-3.0-only`. See the root [`LICENSE`](../../LICENSE), [`NOTICE`](../../NOTICE), and [`TRADEMARKS.md`](../../TRADEMARKS.md).
