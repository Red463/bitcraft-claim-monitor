# BitCraft Claim Monitor

BitCraft Claim Monitor is a settlement operations dashboard built around the public [BitJita API](https://bitjita.com/docs/api). It combines live settlement information with locally persisted market and activity history, providing one place to check supplies, members, skills, production, storage, research, trade, and regional context.

The maintained application is in [`apps/bitcraft-local`](./apps/bitcraft-local). The `artifacts/` folders remain from the original Replit export and are not the application used for current development or deployment.

## What It Does

- Displays live public data for a selected BitCraft settlement.
- Refreshes live views automatically every 30 seconds without clearing visible content during background refreshes.
- Records market listings, market events, activity events, and snapshots in a local SQLite database.
- Provides confirmed sales analytics using BitJita trade data.
- Helps players find large public crafts for skill XP and navigate directly to their locations on the world map.
- Embeds the settlement's BitCraft Sync board for material planning and shared goals.
- Provides a protected local admin area for application configuration, theme editing, and database inspection.

## Application Pages

### Overview

The command-center view for the monitored settlement:

- Settlement tier, region, owner, member count, structure count, and market listing count.
- Online member count and shortcuts into Members, Structures, and Market.
- Supply runway using the API run-out timestamp and the current hourly/daily supply upkeep.
- Treasury balance alongside the current supply upkeep and claimed tile count.
- Work queue summaries for production, construction, and research.
- Attention prompts for low supplies, active projects, and market state.

### Members

The public settlement roster and member detail view:

- Online/offline state and session or last-login information.
- Settlement roles and build/inventory permissions.
- Total skill level.
- Public member drill-down data including Toolbelt profession tools, currently equipped gear, buffs, housing, passive crafts, market collections, and traveler tasks when returned by the API.
- Selecting a member from the roster sets the Production eligibility filter; the selector on the Production page can switch or clear it at any time.

### Skills

A settlement-wide skill coverage dashboard:

- Total settlement level and XP.
- Highest skill and top-member summaries.
- Skill focus view with average level, current best tier, and strongest members.
- Heatmap table of members across all available skills.
- Sorting by member, total level, highest skill, or a selected skill.

BitCraft skill tier display follows the game's level bands: T1 begins at level 0, T2 at level 20, T3 at level 30, and so on; a player is not shown as reaching T6 until level 60.

### Production

Production is split into settlement jobs and global public opportunities.

**Settlement production**

- Current crafts at settlement structures.
- Output tier badges, effort applied, effort to craft, total XP, and XP remaining where supplied by the API.
- Configurable sorting, defaulting to highest tier first.
- Optional selected-member highlighting based on public skill levels and matching profession tools held in that member's public Toolbelt inventory; tool tier is displayed, while tool power determines effort contributed per action.
- Recent contributor records.
- Activity status based on contribution recency:
  - `Active now`: a contribution was received within the last five minutes.
  - `Paused`: progress exists, but no recent contribution was recorded.
  - `Queued`: no progress has been applied yet.
  - `Ready`: required effort is complete.

BitJita does not expose a live "player is holding the craft action now" flag. The five-minute activity window is a practical indicator based on the latest available contribution event.

**Public Crafts**

- Public incomplete crafts across the world, intended to help players locate XP-grinding opportunities.
- Skill filter including `All Skills`.
- Region filter defaulting to the monitored settlement's region.
- Results ranked by remaining effort.
- Settlement, required skill level, available XP, owner, and clickable location.
- Clicking a location opens the Map page focused on the selected craft destination.

### Inventory

Storage and material visibility across settlement containers:

- Collapsible containers showing their stored item stacks.
- Filters for item name, container, type, tier, rarity, and building.
- Core material totals split by tier:
  - Ingots and ores/concentrates.
  - Planks and raw wood forms.
  - Bricks and clay/unfired forms.
  - Leather and raw hide forms.
  - Cloth, fibre, thread, and textiles.
- Item detail inspection for recipe and related public API data.

Container `volume` is intentionally not displayed: the available API value represents slot/container capacity rather than a meaningful total of occupied material volume.

### Construction

- Current construction projects.
- Progress for each active project.
- Required material comparison against currently stored inventory.
- A "What to Gather Next" summary for missing construction materials.

### Structures

- Settlement structures grouped by their operational category.
- Search and filtering for easier inspection of large settlements.
- Slot and station summaries for crafting, refining, storage, and housing.
- Structure details where supplied by BitJita.

The app uses `Structures` terminology because BitCraft data may classify containers and similar assets as buildings, while players commonly distinguish operational stations and settlement structures.

### Research

- Current technology being researched.
- Completed and available research lists.
- Tier and name filtering.
- Supply cost visibility for available technologies when returned by the API.

### Market

**Live Listings**

- Current buy and sell listings.
- Filter by settlement member, item, tier, and rarity.
- Listing date and age when the BitJita listing timestamp is available.

**Analytics**

- Confirmed sales count, units sold, sales revenue, and average sale value.
- Best-selling items ranked by confirmed units sold.
- Revenue by day.
- Recent individual confirmed sales.

Sales analytics intentionally use confirmed BitJita trade history instead of attempting to treat every disappeared listing as a sale. A listing that disappears without a confirmed trade may have been removed or cancelled.

### Region

- Regional settlement ranking table with sortable columns.
- Rankings and summary statistics for the monitored settlement.
- Regional online and trade summaries when available.
- Nearby or comparable settlement information.

### Map

An embedded [BitCraft Map](https://bitcraftmap.com/) view:

- Tracks selected settlement members when live player data is available.
- Enables settlement and road layers by default.
- Displays a focused waypoint when opened from a Public Crafts location.
- Includes a link to open the current map view in a full browser tab.

### Sync

Embeds a configured [BitCraft Sync](https://bitcraftsync.app/) settlement board, used for shared materials, crafting goals, and shopping requirements.

The configured board URL can be changed through Admin.

### Activity

- Locally recorded settlement changes over time.
- Public API storage movement events.
- Filters for storage, treasury, supplies, market, members, and structures.
- Optional compact view to reduce repeated low-signal entries.

### Admin

Admin controls local application settings, not access to public gameplay data. Public BitCraft data remains visible without an admin account.

Admin features:

- Select which settlement/claim ID the dashboard monitors.
- Configure the embedded BitCraft Sync URL.
- Customize the application colour theme.
- Inspect local SQLite tables and stored data during testing.

Authentication behavior:

- The first account is the single local `admin` user.
- Passwords are stored as salted `scrypt` hashes.
- Login sessions use an `HttpOnly`, `SameSite=Lax` cookie.
- In production, first-time admin creation requires the server-side `ADMIN_SETUP_KEY`.

## Data Sources And Persistence

### Public Live Data

Live game data is read from the public BitJita API through the application's same-origin proxy:

```text
/api/bitjita/* -> https://bitjita.com/api/*
```

The dashboard uses endpoints for claims, members, citizens, structures, inventories, construction, research, crafts, markets, player information, storage logs, region status, and trade summaries.

See [`BITJITA_API_AUDIT.md`](./BITJITA_API_AUDIT.md) for the endpoint audit performed during development.

### Local Database

The Node server owns a SQLite database called `bitcraft-local.sqlite`.

It records:

| Table | Purpose |
| --- | --- |
| `snapshots` | Settlement state captured over time |
| `market_listings` | Currently and previously observed listings |
| `market_events` | Listing lifecycle and reconciled trade events |
| `activity_events` | Settlement activity history |
| `admin_users` | Local admin credentials |
| `admin_sessions` | Authenticated sessions |
| `app_settings` | Settlement, Sync, and theme configuration |

Development default:

```text
apps/bitcraft-local/data/bitcraft-local.sqlite
```

Production default configured by the deployment service:

```text
/var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite
```

In production, the server polls and records snapshots every 30 seconds even when nobody has the website open.

## Tech Stack

- React and TypeScript frontend.
- Vite development/build toolchain.
- Node.js server using built-in `node:sqlite`.
- SQLite persistence.
- Caddy reverse proxy and HTTPS termination for VPS hosting.
- systemd application service for production.

## Local Development

### Requirements

- Node.js 24 or newer.
- Corepack/pnpm. The repository is configured for `pnpm@11.1.3`.

### Install

From the repository root:

```bash
corepack enable
corepack pnpm install
```

### Run The Maintained App

```bash
corepack pnpm --filter @workspace/bitcraft-local run dev
```

Default development URLs:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:18428` |
| Local SQLite/API server | `http://127.0.0.1:18430` |

To use alternate ports in PowerShell:

```powershell
$env:PORT = "18433"
$env:LOCAL_API_PORT = "18434"
corepack pnpm --filter @workspace/bitcraft-local run dev
```

### Build Check

```bash
corepack pnpm --filter @workspace/bitcraft-local run build
```

### Isolated Development Database

To avoid writing test history into the default local database:

```powershell
$env:BITCRAFT_LOCAL_DATA_DIR = "C:\tmp\bitcraft-monitor-data"
corepack pnpm --filter @workspace/bitcraft-local run dev
```

## Configuration

Supported application server environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `APP_HOST` | Host interface for production server | `127.0.0.1` |
| `APP_PORT` | Production HTTP port | `18430` |
| `LOCAL_API_PORT` | Development local API port | `18430` |
| `PORT` | Development Vite frontend port | `18428` |
| `BITCRAFT_LOCAL_DATA_DIR` | SQLite storage directory | `apps/bitcraft-local/data` |
| `BITJITA_API_ORIGIN` | Alternate BitJita upstream origin | `https://bitjita.com` |
| `ADMIN_SETUP_KEY` | One-time key required to create the first production admin | unset |
| `ENABLE_SERVER_POLLING` | Override server-side snapshot polling | enabled in production |
| `SNAPSHOT_INTERVAL_MS` | Polling interval, minimum 10 seconds | `30000` |

## VPS Deployment

The intended production setup is:

- Ubuntu VPS.
- Node.js 24.
- Application installed at `/opt/bitcraft-claim-monitor`.
- Persistent data at `/var/lib/bitcraft-claim-monitor`.
- systemd running the Node application on `127.0.0.1:18430`.
- Caddy serving the public HTTPS domain and reverse proxying to the application.

Full first-time instructions are in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

For a normal update after changes have been pushed to GitHub:

```bash
cd /opt/bitcraft-claim-monitor
sudo -u bitcraft git pull --ff-only
sudo -u bitcraft corepack pnpm install --frozen-lockfile
sudo -u bitcraft corepack pnpm --filter @workspace/bitcraft-local run build
systemctl restart bitcraft-claim-monitor
systemctl status bitcraft-claim-monitor --no-pager -l
curl http://127.0.0.1:18430/api/local/health
```

The database directory is outside the Git checkout, so ordinary code updates do not erase accumulated market or activity history.

## Repository Layout

```text
apps/bitcraft-local/                 Maintained application
  src/main.tsx                       React UI and dashboard pages
  server.mjs                         SQLite API, BitJita proxy, auth, production server
  dev.mjs                            Local frontend/API launcher
deploy/                              systemd and Caddy production configuration
DEPLOYMENT.md                        VPS installation and maintenance guide
BITJITA_API_AUDIT.md                 Public API audit and integration notes
artifacts/                           Original exported/Replit application artifacts
```

## Security Notes

- Gameplay information displayed by the dashboard comes from public BitJita endpoints.
- Admin access protects local configuration and local persisted database inspection.
- Do not commit `bitcraft-local.sqlite`, setup keys, environment files containing secrets, or VPS backups.
- Keep the production Node process bound to localhost and expose it through HTTPS with Caddy.
- Back up the SQLite database separately from the Git repository.

## Links

- Application repository: [github.com/Red463/bitcraft-claim-monitor](https://github.com/Red463/bitcraft-claim-monitor)
- Feature requests and bug reports: [GitHub Issues](https://github.com/Red463/bitcraft-claim-monitor/issues)
- BitJita API documentation: [bitjita.com/docs/api](https://bitjita.com/docs/api)
- BitCraft Map: [bitcraftmap.com](https://bitcraftmap.com/)
- BitCraft Sync: [bitcraftsync.app](https://bitcraftsync.app/)

## Disclaimer

This project is an independent community tool. It is not an official BitCraft, BitJita, BitCraft Map, or BitCraft Sync product.
