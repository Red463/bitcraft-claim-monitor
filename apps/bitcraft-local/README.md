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

Persistent history is stored at `apps/bitcraft-local/data/bitcraft-local.sqlite`. Keep the dev server running while testing so market listing snapshots and activity events continue to be recorded every refresh cycle.

In production, the Node server records snapshots itself every 30 seconds, so market and activity history continues collecting without a browser left open.

The Admin page is protected by a local server-side session. On first run, open Admin and create the initial password. The password is stored as a salted scrypt hash in SQLite, and the browser receives an HttpOnly session cookie. Administrator mutations additionally require a same-origin session token.

For isolated testing, set `BITCRAFT_LOCAL_DATA_DIR` before running the dev server to point at a different database directory.

For hosting on an Ubuntu VPS, see [`DEPLOYMENT.md`](../../DEPLOYMENT.md). The production build is served by the Node application:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
NODE_ENV=production ADMIN_SETUP_KEY=choose-a-one-time-key BITCRAFT_LOCAL_DATA_DIR=/var/lib/bitcraft-claim-monitor corepack pnpm --filter @workspace/bitcraft-local run start
```

Use the one-time setup key when creating the first production admin, then restart the process without that variable. The full systemd and Caddy procedure is in the deployment guide.

License: repository-wide `AGPL-3.0-only`. See the root [`LICENSE`](../../LICENSE), [`NOTICE`](../../NOTICE), and [`TRADEMARKS.md`](../../TRADEMARKS.md).
