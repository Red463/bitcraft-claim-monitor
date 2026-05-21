# Local Development

This project was exported from Replit. The local setup uses the same pnpm workspace, with defaults added so it runs on Windows without Replit environment variables.

## Requirements

- Node.js 24, matching `.replit`. Node 22 may also work, but 24 is the known target.
- pnpm. If needed, run `corepack enable` and then `corepack prepare pnpm@latest --activate`.

## Install

```sh
pnpm install
```

## Run

Run API and frontend together:

```sh
pnpm run dev
```

Or run them separately:

```sh
pnpm run dev:api
pnpm run dev:web
```

Default local ports:

- API: `http://localhost:8080`
- Frontend: `http://localhost:18428`

The Vite dev server proxies `/api` to `http://localhost:8080`, so browser requests use the same relative `/api/...` URLs as the generated client.

## Useful Checks

```sh
pnpm run typecheck
pnpm run build
```

Override ports when needed:

```sh
PORT=5173 pnpm run dev:web
PORT=8081 pnpm run dev:api
```

On PowerShell, set environment variables first:

```powershell
$env:PORT = "5173"
pnpm run dev:web
```
