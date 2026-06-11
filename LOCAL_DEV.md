# Local Development

The maintained app lives in `apps/bitcraft-local`. Historical Replit export artifacts are no longer part of the active workspace.

## Requirements

- Node.js 24 or newer.
- Corepack-enabled pnpm. From a fresh machine, run `corepack enable` before installing.

## Install

```sh
corepack pnpm install
```

## Run The App

Run the local frontend and API together:

```sh
corepack pnpm --filter @workspace/bitcraft-local run dev
```

Default local ports:

- Frontend: `http://localhost:18428`
- Local API: `http://127.0.0.1:18430`

Useful separate commands:

```sh
corepack pnpm --filter @workspace/bitcraft-local run dev:web
corepack pnpm --filter @workspace/bitcraft-local run dev:db
```

## Stable Browser Smoke Server

For Codex/in-app-browser testing, prefer the production-style smoke server on port `18449`:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open:

```txt
http://127.0.0.1:18449/?page=dashboard
```

The smoke server uses `.dev-data` and has background polling disabled, so it is safe for local UI verification.

## Checks

```sh
corepack pnpm --filter @workspace/bitcraft-local run test
corepack pnpm --filter @workspace/bitcraft-local run build
```

Root workspace checks:

```sh
corepack pnpm run typecheck
corepack pnpm run build
```
