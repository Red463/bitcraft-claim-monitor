# BitCraft Claim Monitor

BitCraft Claim Monitor is a settlement operations dashboard built around the public [BitJita API](https://bitjita.com/docs/api). It combines live settlement information with locally persisted market and activity history, providing one place to check supplies, members, professions, skills, production, storage, research, trade, and regional context.

The application is currently in beta and under active development. Versioning follows semantic versioning with a beta pre-release suffix while features and data presentation continue to evolve.

The maintained application is in [`apps/bitcraft-local`](./apps/bitcraft-local). The `artifacts/` folders remain from the original Replit export and are not the application used for current development or deployment.

## What It Does

- Displays live public data for a selected BitCraft settlement.
- Refreshes live views automatically at a configurable interval without clearing visible content during background refreshes.
- Records market listings, completed member trades, market events, activity events, and snapshots in a local SQLite database.
- Imports retained confirmed-sales history from BitJita completed trades, with settlement-member filtering.
- Helps players find large public crafts for skill XP and navigate directly to their locations on the world map.
- Displays lightweight in-app notifications for new listings, confirmed sales, and settlement craft queue changes while the dashboard is open.
- Optionally sends Discord bot notifications and provides slash commands for supplies, online members, active crafts, and item price checks.
- Provides a floating help panel on every page with version, documentation, changelog, and issue-reporting links.
- Supports opt-in first-party usage analytics with an in-app cookie notice, privacy controls and Admin reporting.
- Embeds the settlement's BitCraft Sync board for material planning and shared goals.
- Provides a protected admin console for configuration, branding, theme editing, diagnostics, account management, audit history, database inspection, exports and backups.
- Stores Discord bot tokens as protected server secrets, hidden from the admin database browser.

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
- Total recorded levels across professions and skills.
- Public member drill-down data including Toolbelt profession tools, currently equipped gear, buffs, housing, grouped passive craft output history, market collections, and quests when returned by the API.
- Selecting a member from the roster sets the Production eligibility filter; the selector on the Production page can switch or clear it at any time.

### Professions

A settlement-wide profession coverage dashboard:

- Profession-only level totals, highest-profession and top-member summaries.
- Profession focus view with average level, current best tier, and strongest members.
- Heatmap table covering the API `Profession` category.
- Separate Skills summary for the API `Adventure` category: Cooking, Construction, Taming, Slayer, Merchanting and Sailing.
- Sorting by member, profession total, highest profession, or a selected profession.

BitCraft profession tier display follows the game's level bands: T1 begins at level 0, T2 at level 20, T3 at level 30, and so on; a player is not shown as reaching T6 until level 60.

### Production

Settlement production and member passive output tracking:

- Current crafts at settlement structures.
- Output tier badges, effort applied, effort to craft, total XP, and XP remaining where supplied by the API.
- Configurable sorting, defaulting to highest tier first.
- Optional selected-member highlighting based on public skill levels and matching profession tools held in that member's public Toolbelt inventory; a tool can complete crafts up to one tier above its own, while tool power determines effort contributed per action.
- Recent contributor records.
- Recent public passive craft output aggregated for members in the monitored settlement, with resolved item names, member, structure, quantity, and completion status. BitJita does not identify where a passive craft occurred, so this is member history rather than settlement-location activity.
- Activity status based on contribution recency:
  - `Active now`: a contribution was received within the last five minutes.
  - `Paused`: progress exists, but no recent contribution was recorded.
  - `Queued`: no progress has been applied yet.
  - `Ready`: required effort is complete.

BitJita does not expose a live "player is holding the craft action now" flag. The five-minute activity window is a practical indicator based on the latest available contribution event.

### Public Craft Finder

- Public incomplete crafts across the world, intended to help players locate XP-grinding opportunities.
- Skill filter including `All Skills`.
- Region filter defaulting to the monitored settlement's region.
- Sortable results, initially ranked by remaining effort.
- Settlement, required skill level, available XP, owner, and clickable location.
- Clicking a location opens the Map page focused on the selected craft destination.

### Inventory

Storage and material visibility across settlement containers:

- Collapsible containers showing their stored item stacks.
- Filters for item name, container, type, tier, rarity, and building.
- Finished core material totals split by tier: ingots, planks, bricks, leather, and cloth. Raw ingredients and intermediate forms are excluded.
- Clickable core-material cards that filter the container list to stored stacks of the selected finished material.
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

- Completed and available research lists.
- The page does not show an active research state because technology unlocks are immediate.
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

Sales analytics use completed BitJita sell trades only after completed order history identifies the monitored settlement as the listing claim. Trade fills are retained in the local database by trade ID. The first successful collection backfills available completed orders from this market for current settlement members, and later tracked sales continue to be recorded. Live Listings remains scoped to the monitored settlement and follows paginated BitJita responses so active listings outside the first page are not closed incorrectly.

**Price Finder**

- Type-ahead item lookup across the BitJita market catalogue.
- Region dropdown defaulting to the monitored settlement's region, with all-region and available-region options.
- BitJita completed-trade average prices over 24 hours, 7 days and 30 days.
- Suggested list price based on the most recent available average, alongside recent trades and volume for judgement.
- Pin useful market items to the Overview watchlist.

### Monitoring Experience

- Browser refresh restores the current page and applicable Market or Public Craft Finder context.
- `Ctrl+K` or `/` opens quick navigation for pages, Price Finder and settlement members.
- Overview watchlist pins finished core materials, market items and production crafts for regular checks.
- Notification inbox retains recent market and production alerts after toast messages disappear.
- Compact/comfortable density modes make long tables easier to scan on different displays.
- Background updates preserve visible page content and briefly highlight changing figures.

### Region

- Regional settlement ranking table with sortable columns.
- Rankings and summary statistics for the monitored settlement.
- Regional online and trade summaries when available.
- Nearby or comparable settlement information.

### Map

An embedded [BitCraft Map](https://bitcraftmap.com/) view:

- Tracks selected settlement members when live player data is available.
- Enables settlement and road layers by default.
- Displays a focused waypoint when opened from a Public Craft Finder location.
- Includes a link to open the current map view in a full browser tab.

### Sync

Embeds a configured [BitCraft Sync](https://bitcraftsync.app/) settlement board, used for shared materials, crafting goals, and shopping requirements.

The configured board URL can be changed through Admin.

### Activity

- Locally recorded settlement changes over time.
- Public API storage movement events limited to known containers belonging to the monitored settlement.
- Timeline cards identify named settlement containers for deposits and withdrawals when nickname data is available.
- Deployable storage, including carts, wagons, boats and similar mobile containers, is excluded.
- Filters for storage, treasury, supplies, market, members, and structures.
- Member filter for attributed storage and market actions; settlement-wide system events are shown only in the all-members view.
- Optional compact view to reduce repeated low-signal entries.
- Storage history is collected by the server in the background and read locally by browsers, avoiding slow container-log requests during page refreshes; the member filter roster is loaded separately without blocking the timeline.

### Admin

Admin controls local application settings, not access to public gameplay data. Public BitCraft data remains visible without an admin account.

Admin features:

- Select which settlement/claim ID the dashboard monitors.
- Configure the embedded BitCraft Sync URL.
- Choose the default opening page, Public Craft Finder region, refresh interval, notification categories and snapshot retention window.
- Configure optional Discord bot notifications, test delivery, and register slash commands.
- Review or clear consented first-party usage analytics, including popular pages, recorded engagement time and feature usage.
- Customize the application colour theme with live preview and presets.
- Upload a logo shown in the app and a favicon shown in the browser tab.
- Review server collection health and run public BitJita endpoint diagnostics, including per-container Activity storage timing.
- Inspect, search and export local SQLite tables during testing.
- Create and download database backups, and prune expired snapshots without deleting market/activity history.
- Manage multiple administrator accounts, sessions and passwords.
- Review administrator actions and sign-in attempts.

### Discord Bot

The Discord integration is optional and runs inside the existing Node server. It can post settlement notifications to a configured channel and exposes Discord slash commands at `/api/discord/interactions`.

Available commands:

- `/supplies` shows settlement supplies, upkeep and runway.
- `/online` shows online settlement members.
- `/crafts` lists active settlement crafts, optionally filtered by skill text.
- `/price` looks up recent BitJita sale pricing for an item, defaulting to the monitored settlement region.
- `/craftwatch list` shows your personal craft profession watches and mutes.
- `/craftwatch clear` removes your craft watch settings.

Discord setup is managed in **Admin > Discord**. The bot token is stored in the protected `app_secrets` table or can be supplied with `DISCORD_BOT_TOKEN`; it is not returned through the settings API or shown in the admin table browser.

Craft notifications include **Watch profession** and **Mute profession** buttons. Watching a profession makes future matching craft alerts mention that Discord user; muting suppresses those personal watch mentions.

#### Discord Bot Terms

The Discord bot is optional and provided as part of this unofficial community app. It posts settlement notifications and responds to slash commands using public BitJita data and locally stored app data. Bot output is informational only and may be delayed, incomplete or inaccurate.

Using the bot means Discord command names, command options, server IDs, channel IDs, user IDs, delivery status, and notification diagnostics may be processed by this app and Discord so the bot can respond and administrators can diagnose delivery issues. Server administrators can disable notifications, remove the bot, rotate the bot token, or delete local diagnostic/history data from the administration tools.

Dedicated public pages are available for Discord application submission:

- Terms of Service: `/terms`
- Privacy Policy: `/privacy`

Authentication behavior:

- The first administrator is created from the Admin page; additional administrators can then be created there.
- Passwords are stored as salted `scrypt` hashes.
- Login sessions use an `HttpOnly`, `SameSite=Lax` cookie.
- Administrator changes require a session-bound request token and same-origin request validation.
- Repeated failed logins are temporarily throttled.
- In production, first-time admin creation requires the server-side `ADMIN_SETUP_KEY`.
- Production history collection is server-owned; public browsers cannot submit snapshots.

### Privacy And Analytics

Analytics are disabled until a visitor explicitly selects **Accept Analytics** in the cookie notice or Privacy & Analytics dialog. The app remains fully usable when analytics are declined.

When accepted, first-party cookies store the user's consent and a random browser identifier for up to 180 days. The application records section page views, time spent in each section and high-level feature usage including Market tabs, Price Finder searches, member-details opening, Production eligibility filters, Public Craft Finder controls, map links, and Activity filters. Raw analytics events are retained for up to 90 days, and results are available to administrators in **Admin > Analytics**, where all analytics data can also be deleted.

The app does not include BitCraft usernames, selected member identities, typed search text, admin credentials, item IDs, item names, region query values, or database contents in analytics events. Visitors may withdraw permission at any time through **Privacy & Analytics**, which removes the analytics browser identifier.

The optional Discord bot does not use analytics cookies. When enabled, Discord slash commands and notifications may process Discord server, channel and user identifiers, command options, public BitJita data, and notification delivery diagnostics. This is separate from browser analytics consent and is required for the bot features to operate.

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
| `market_trades` | Imported, deduplicated completed sell trades for settlement members |
| `activity_events` | Settlement activity history |
| `analytics_events` | Consented first-party aggregate usage analytics |
| `admin_users` | Local admin credentials |
| `admin_sessions` | Authenticated sessions |
| `app_settings` | Settlement, Sync, display, branding and collection configuration |
| `admin_audit_log` | Administrative changes and operations |
| `admin_login_events` | Successful and failed sign-in records |

Development default:

```text
apps/bitcraft-local/data/bitcraft-local.sqlite
```

Production default configured by the deployment service:

```text
/var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite
```

The server polls and records snapshots and settlement storage activity every 30 seconds even when nobody has the website open. Browser views read that persisted Activity history locally rather than waiting for every storage API request.
Uploaded branding is stored under `branding/` and administrator-created SQLite backups under `backups/` inside the same data directory.

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
| `BITJITA_APP_IDENTIFIER` | Identifier sent with upstream BitJita requests | project GitHub identifier |
| `ADMIN_SETUP_KEY` | One-time key required to create the first production admin | unset |
| `ENABLE_SERVER_POLLING` | Override server-side snapshot polling | enabled in production |
| `SNAPSHOT_INTERVAL_MS` | Polling interval, minimum 10 seconds | `30000` |
| `DISCORD_BOT_TOKEN` | Optional Discord bot token override | admin-stored secret |
| `DISCORD_APPLICATION_ID` | Optional Discord application ID override | admin setting |
| `DISCORD_PUBLIC_KEY` | Optional Discord interactions public key override | admin setting |
| `DISCORD_GUILD_ID` | Optional Discord guild ID override for command registration | admin setting |
| `DISCORD_CHANNEL_ID` | Optional Discord notification channel ID override | admin setting |

## VPS Deployment

The intended production setup is:

- Ubuntu VPS.
- Node.js 24.
- Application installed at `/opt/bitcraft-claim-monitor`.
- Persistent data at `/var/lib/bitcraft-claim-monitor`.
- systemd running the Node application on `127.0.0.1:18430`.
- Caddy serving `https://app.timbersteeltrade.com` as the public HTTPS domain, with `https://claim.timbersteeltrade.com` and `https://claim.hostred.co.uk` redirected to it.

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

## License

This project is licensed under the PolyForm Noncommercial 1.0.0 license.

You are free to:

- Self-host
- Modify
- Fork
- Deploy personal/community instances

You may NOT:

- Sell this software
- Offer it as a paid service
- Monetise it commercially without permission

Attribution to the original project and author must be retained.

Original project by Tom Bush:
[github.com/Red463](https://github.com/Red463)

## Links

- Application repository: [github.com/Red463/bitcraft-claim-monitor](https://github.com/Red463/bitcraft-claim-monitor)
- Feature requests and bug reports: [GitHub Issues](https://github.com/Red463/bitcraft-claim-monitor/issues)
- BitJita API documentation: [bitjita.com/docs/api](https://bitjita.com/docs/api)
- BitCraft Map: [bitcraftmap.com](https://bitcraftmap.com/)
- BitCraft Sync: [bitcraftsync.app](https://bitcraftsync.app/)

## Disclaimer

This project is an independent community tool. It is not an official BitCraft, BitJita, BitCraft Map, or BitCraft Sync product.
