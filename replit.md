# BitCraft Claim Monitor

A single-page React + Vite dashboard for monitoring a BitCraft Online settlement (claim ID: 1369094286777412590) using the Bitjita public API, styled with a dark fantasy / MMO aesthetic.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/bitcraft-monitor run dev` — run the frontend (port 18428, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Recharts + TanStack Query + Wouter
- API: Express 5 (proxy only — no database needed)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Fonts: Cinzel (serif/fantasy) + Inter

## Where things live

- `artifacts/bitcraft-monitor/` — React frontend SPA
  - `src/components/panels/` — one file per dashboard panel (10 panels total)
  - `src/components/ui/` — shared UI: StatCard, WarningCard, SectionHeader, shadcn components
  - `src/lib/constants.ts` — CLAIM_ID constant
  - `src/index.css` — dark fantasy theme (Cinzel font, amber/slate palette, CSS variables)
  - `src/App.tsx` — sidebar navigation + panel switcher
- `artifacts/api-server/` — Express proxy server
  - `src/routes/bitjita.ts` — all Bitjita proxy routes with response normalization
  - `src/routes/index.ts` — route registration
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/` — generated hooks + Zod schemas (do not edit manually)

## Architecture decisions

- **Backend proxy** avoids CORS when calling `https://bitjita.com/api` from the browser
- **Response normalization** in the proxy transforms Bitjita's API field names (e.g. `numTiles` → `tileCount`, `userName` → `username`) to match the OpenAPI schema; also unwraps nested objects (`{claim: {...}}` → flat object)
- **No database**: all data is live-fetched from Bitjita on every request; TanStack Query caches with a 2-minute stale time
- **Inventory item names**: resolved server-side by cross-referencing `item_id` with the lookup tables returned by the `/inventories` endpoint itself
- **Construction material names**: same cross-reference pattern using the `items` and `cargos` arrays from `/construction`

## Product

10-panel MMO-style dashboard:
1. **Overview** — claim vitals (supplies, treasury, upkeep, tiles, members, buildings, market count, supply run-out date)
2. **Members** — roster table with permissions, roles, and last-login time
3. **Map** — tile grid visualization of the claim layout
4. **Empire** — region comparison charts (supply, treasury, tiles, tier) vs. other claims in the same region
5. **Buildings** — grouped building browser with slot info (crafting, refining, storage, cargo, housing)
6. **Inventory** — per-building item browser with tier/rarity/type filters
7. **Construction** — active projects with material requirements and "what to gather next"
8. **Research** — split view of researched vs. available technologies
9. **Market** — sell/buy order browser with tier/rarity filters
10. **Activity** — snapshot diff tracker using localStorage to detect changes between sessions

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The Bitjita API returns `supplies` and `treasury` as **strings** — always parse with `Number()`
- Market listing `updatedAt` is a Unix timestamp in **microseconds** (divide by 1000 for `Date`)
- `regionId` from the Bitjita API is a **number** — must be converted to string for query params
- The `/inventories` endpoint does **not** include item names in inventory slots — names come from the top-level `items`/`cargos` lookup arrays in the same response
- `officerPermission` and `coOwnerPermission` in member responses are numbers (0/1), not booleans

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- CLAIM_ID is hardcoded in `artifacts/bitcraft-monitor/src/lib/constants.ts`
- Skill IDs (confirmed from `https://bitjita.com/api/skills`): 2=Forestry, 3=Carpentry, 4=Masonry, 5=Mining, 6=Smithing, 7=Scholar, 8=Leatherworking, 9=Hunting, 10=Tailoring, 11=Farming, 12=Fishing, 13=Cooking, 14=Foraging, 15=Construction, 17=Taming, 18=Slayer, 19=Merchanting, 21=Sailing
