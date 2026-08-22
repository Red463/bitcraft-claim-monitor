# BitCraft Claim Monitor application

This is the maintained application package. Run commands from the repository
root with Node.js 24+, Corepack, and the pnpm version pinned in the root
`package.json`.

## Local development

```powershell
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
```

The development command starts Vite at `http://localhost:19428` and the local
Node API at `http://127.0.0.1:19430`. Vite proxies same-origin `/api/*` requests
to that API. Set `BITCRAFT_LOCAL_DATA_DIR` to use an isolated SQLite directory.

Configuration starts at [`.env.example`](../../.env.example). Do not put real
credentials in the repository.

## Checks

```powershell
corepack pnpm --filter @workspace/bitcraft-local run typecheck
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

## Optional built smoke server

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

The smoke server at `http://127.0.0.1:18449` is optional and serves the built
application. It is not part of the normal two-service development command.

For architecture, contribution, and hosting details, use the root
[`README.md`](../../README.md), [`docs/developer-guide.md`](../../docs/developer-guide.md),
and [`DEPLOYMENT.md`](../../DEPLOYMENT.md).
