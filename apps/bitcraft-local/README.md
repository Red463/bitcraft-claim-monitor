# BitCraft Local Monitor

A clean local-first rebuild of the Replit-exported claim monitor.

Run it from the repo root:

```sh
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
```

Open `http://localhost:18428`.

The dev command starts two local services:

- Vite frontend on `http://localhost:18428`
- SQLite history API on `http://127.0.0.1:18430`

The Vite dev server proxies `/api/bitjita/*` to `https://bitjita.com/api/*` and `/api/local/*` to the local SQLite API.

Persistent history and cached tool data are stored at `apps/bitcraft-local/data/bitcraft-local.sqlite`. Normal browser pages refresh live data through the local `/api/bitjita/*` proxy, while local tables retain market history, activity history, contribution history, analytics, notifications, recipe cache, regional buy-order cache, and diagnostics.

In production, the Node server runs background collectors itself, so market, activity, production contribution and notification history continues collecting without a browser left open. Collector intervals and enabled states are configurable from Admin.

Notification generation, deduplication, settings and verification notes are documented in [docs/notification-system.md](../../docs/notification-system.md).

Maintainer architecture notes are in [docs/developer-guide.md](../../docs/developer-guide.md), and current public-release blockers are tracked in [docs/release-readiness-audit.md](../../docs/release-readiness-audit.md).

The Admin page is protected by a local server-side session. Current deployments use Discord-backed administrator accounts, with the default owner Discord ID seeded by the server. Legacy password-based admin setup exists only as a compatibility path and should normally remain disabled. Administrator mutations additionally require a same-origin session token.

For isolated testing, set `BITCRAFT_LOCAL_DATA_DIR` before running the dev server to point at a different database directory.

For hosting on an Ubuntu VPS, see [`DEPLOYMENT.md`](../../DEPLOYMENT.md). The production build is served by the Node application:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
NODE_ENV=production BITCRAFT_LOCAL_DATA_DIR=/var/lib/bitcraft-claim-monitor corepack pnpm --filter @workspace/bitcraft-local run start
```

Configure Discord OAuth/bot settings before relying on Discord admin login in production. The full systemd and Caddy procedure is in the deployment guide.

License: repository-wide `AGPL-3.0-only`. See the root [`LICENSE`](../../LICENSE), [`NOTICE`](../../NOTICE), and [`TRADEMARKS.md`](../../TRADEMARKS.md).
