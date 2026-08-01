# BitCraft Claim Monitor

> **Relay migration clone:** This standalone repository is migrating the
> application from BitJita to the public
> [BitCraft Sync Relay](https://relay.bitcraftsync.app/). Dashboard claim data
> and the Members roster now use the provider-neutral local game-data route.
> Remaining pages and background collectors are tracked in the
> [relay parity matrix](./docs/relay-migration/parity-matrix.md) and must not be
> treated as migrated until their entries pass.
>
> The global item/cargo catalog now has a live typed SpacetimeDB subscription
> behind the server provider boundary. Local game-icon resolution and manifest
> validation are implemented, but the approved asset files and written
> permission reference still need to be supplied before that slice is complete.

BitCraft Claim Monitor is a settlement operations dashboard combining current
game data with locally persisted market and activity history. Relay wire and
HTTP records are normalized behind a server-side provider so React and durable
history do not depend on an upstream transport shape.

The application is currently in beta and under active development. Versioning follows semantic versioning with a beta pre-release suffix while features and data presentation continue to evolve. See [VERSIONING.md](./VERSIONING.md) for the release policy.

The maintained application is in [`apps/bitcraft-local`](./apps/bitcraft-local). Historical Replit export artifacts have been removed from the active workspace so new development stays focused on the maintained app.

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

### Dashboard

The command-center view for the monitored settlement:

- Settlement tier, region, owner, member count, structure count, and market listing count.
- Online member count and shortcuts into Members, Production, Construction, and Market.
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
- Pin useful market items to the notification inbox and relevant market views.

### Monitoring Experience

- Browser refresh restores the current page and applicable Market or Public Craft Finder context.
- `Ctrl+K` or `/` opens quick navigation for pages, Price Finder and settlement members.
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
- Manage Discord-backed administrator accounts, roles and sessions.
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

Craft-start notifications can be filtered by minimum total XP, allowed crafter names and a configurable time-present delay. The default delay is five minutes, so mistaken crafts that are cancelled quickly do not alert.

#### Discord Bot Terms

The Discord bot is optional and provided as part of this unofficial community app. It posts settlement notifications and responds to slash commands using public BitJita data and locally stored app data. Bot output is informational only and may be delayed, incomplete or inaccurate.

Using the bot means Discord command names, command options, server IDs, channel IDs, user IDs, delivery status, and notification diagnostics may be processed by this app and Discord so the bot can respond and administrators can diagnose delivery issues. Server administrators can disable notifications, remove the bot, rotate the bot token, or delete local diagnostic/history data from the administration tools.

Dedicated public pages are available for Discord application submission:

- Terms of Service: `/terms`
- Privacy Policy: `/privacy`

Authentication behavior:

- Administrator access is Discord-backed by default, with the owner Discord ID seeded by the server.
- Legacy password-based admin setup still exists as a compatibility path, but should normally remain disabled.
- Legacy passwords, where enabled, are stored as salted `scrypt` hashes.
- Login sessions use an `HttpOnly`, `SameSite=Lax` cookie.
- Administrator changes require a session-bound request token and same-origin request validation.
- Repeated failed logins are temporarily throttled.
- Production history collection is server-owned; public browsers cannot submit snapshots.

### Privacy And Analytics

Analytics are disabled until a visitor explicitly selects **Accept Analytics** in the cookie notice or Privacy & Analytics dialog. The app remains fully usable when analytics are declined.

When accepted, first-party cookies store the user's consent and a random browser identifier for up to 180 days. The application records section page views, time spent in each section and high-level feature usage including Market tabs, Price Finder searches, member-details opening, Production eligibility filters, Public Craft Finder controls, map links, and Activity filters. Raw analytics events are retained for up to 90 days, and results are available to administrators in **Admin > Analytics**, where all analytics data can also be deleted.

The app does not include BitCraft usernames, selected member identities, typed search text, admin credentials, item IDs, item names, region query values, or database contents in analytics events. Visitors may withdraw permission at any time through **Privacy & Analytics**, which removes the analytics browser identifier.

The canonical legal pages are `/terms` and `/privacy`. The default deployment identifies the controller as **Thomas Bush, operating as Timbersteel Claim Monitor**; Timbersteel Claim Monitor is a project/trading name, not a company or separate legal entity. Contact: `privacy@timbersteeltrade.com`. Other operators must override and review:

```text
LEGAL_CONTROLLER_NAME
LEGAL_PROJECT_NAME
LEGAL_PRIVACY_EMAIL
LEGAL_CONTROLLER_COUNTRY
LEGAL_GOVERNING_LAW
LEGAL_MINIMUM_AGE
LEGAL_CONFIGURATION_CONFIRMED=true
```

Discord Developer Portal fields should point to `https://timbersteeltrade.com/terms` and `https://timbersteeltrade.com/privacy`, with the configured OAuth redirect URI. Legal acceptance is separate from optional analytics consent. Signed-in users can export, unlink, clear granular data, or delete their account under **User Settings → Privacy & Data**. Authorised administrators can perform an assisted ordinary-account deletion under **Admin → Linked Accounts**; this uses the same recovery-safe deletion coordinator, preserves separate administrator identities and Discord membership, and does not roll back if its notification DM fails. A `LEGAL_VERSION` or document-content change requires a reviewed version/effective-date update and prompts existing users on their next visit.

Separately from optional analytics cookies, the server records short-term request security logs for abuse prevention and operational diagnostics. These records include the request time, route group, status class, user-agent hash, anonymised IP prefix, hashed IP, and the full IP address for a limited retention window. Full IP retention defaults to 7 days, and older records keep only anonymised/hash data. If a local GeoIP database source is configured, the server can also attach approximate country/city statistics without sending visitor IPs to a third-party lookup service. The GeoIP refresh job supports simple JSON/CSV sources and MaxMind GeoLite2 City CSV ZIP downloads using separate MaxMind account ID and license key fields in Admin configuration.

The optional Discord bot does not use analytics cookies. When enabled, Discord slash commands and notifications may process Discord server, channel and user identifiers, command options, public BitJita data, and notification delivery diagnostics. This is separate from browser analytics consent and is required for the bot features to operate.

## Data Sources And Persistence

### Public Live Data

The target browser contract is the provider-neutral same-origin route:

```text
/api/local/game-data?claimId=<configured-claim>&domains=claim,members
```

The server discovers Relay topology and cache readiness, normalizes Relay data,
and atomically stores last-complete domain generations. During migration, only
the domains marked as implemented in
[`docs/relay-migration/parity-matrix.md`](./docs/relay-migration/parity-matrix.md)
are provider-neutral. Legacy routes remain solely as enumerated migration work;
final acceptance removes `/api/bitjita/*` completely.

### Local Database

The Node server owns a SQLite database called `bitcraft-local.sqlite`.

It records:

| Table | Purpose |
| --- | --- |
| `snapshots` | Settlement state captured over time |
| `domain_payload_current` | Latest successful background collector payloads used for history, diagnostics and stale-status context |
| `market_listings` | Currently and previously observed listings |
| `market_events` | Listing lifecycle and reconciled trade events |
| `market_trades` | Imported, deduplicated completed sell trades for settlement members |
| `activity_events` | Settlement activity history |
| `analytics_events` | Consented first-party aggregate usage analytics |
| `visitor_security_events` | Short-term request security logs and anonymised visitor location statistics |
| `admin_users` | Discord-backed administrator accounts and optional legacy credentials |
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
/var/lib/bitcraft-claim-monitor-relay/bitcraft-local.sqlite
```

Migrated browser pages read normalized current state from `/api/local/game-data`.
The relay worker owns collection so snapshots and notifications continue without
a browser open. Unmigrated pages and collectors are explicitly tracked and block
production cutover.

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
| Frontend | `http://localhost:19428` |
| Local SQLite/API server | `http://127.0.0.1:19430` |

To use alternate ports in PowerShell:

```powershell
$env:PORT = "19433"
$env:LOCAL_API_PORT = "19434"
corepack pnpm --filter @workspace/bitcraft-local run dev
```

### Build Check

```bash
corepack pnpm --filter @workspace/bitcraft-local run build
```

### Test Check

```bash
corepack pnpm --filter @workspace/bitcraft-local test
```

Use [`docs/developer-guide.md`](./docs/developer-guide.md) for architecture conventions and [`docs/release-readiness-audit.md`](./docs/release-readiness-audit.md) for the current public-release evidence and blockers. Live browser notification source checks that cannot be proven by sample smoke notices are tracked in [`docs/notification-live-source-verification.md`](./docs/notification-live-source-verification.md).

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
| `APP_PORT` | Production HTTP port | `19430` |
| `LOCAL_API_PORT` | Development local API port | `19430` |
| `PORT` | Development Vite frontend port | `19428` |
| `BITCRAFT_LOCAL_DATA_DIR` | SQLite storage directory | `apps/bitcraft-local/data` |
| `BITCRAFT_RELAY_ORIGIN` | Relay topology and joined-cache origin | `https://relay.bitcraftsync.app` |
| `BITCRAFT_APP_IDENTIFIER` | Stable clone identifier used for local hashing | relay repository identifier |
| `ENABLE_RELAY_PROVIDER` | Enable worker-side Relay ingestion | enabled |
| `RELAY_HTTP_REFRESH_MS` | Live Relay HTTP-domain refresh loop, bounded to 5-60 seconds | `15000` |
| `DISCORD_DELIVERY_MODE` | `record` stores delivery evidence without sending; `live` sends | `record` |
| `BITJITA_API_ORIGIN` | Alternate BitJita upstream origin | `https://bitjita.com` |
| `BITJITA_APP_IDENTIFIER` | Identifier sent with upstream BitJita requests | project GitHub identifier |
| `ADMIN_SETUP_KEY` | Optional compatibility key for legacy first-admin password setup | unset |
| `DEFAULT_OWNER_DISCORD_ID` | Discord user ID seeded as the owner administrator | `145544610234630144` |
| `DISCORD_OAUTH_CLIENT_ID` | Discord OAuth client ID for sign-in | admin setting/application ID |
| `DISCORD_OAUTH_CLIENT_SECRET` | Discord OAuth client secret for sign-in | unset |
| `DISCORD_OAUTH_REDIRECT_URI` | Explicit Discord OAuth callback URL | inferred from request origin |
| `ENABLE_LEGACY_ADMIN_PASSWORD_AUTH` | Re-enable legacy password admin login | disabled |
| `BITCRAFT_PROCESS_ROLE` | Process role: `web`, `worker`, or `all` | `web` in production, `all` locally |
| `ENABLE_SERVER_POLLING` | Override worker-side snapshot polling | enabled when background jobs are allowed |
| `SQLITE_BUSY_TIMEOUT_MS` | SQLite lock wait timeout for web/worker access | `5000` |
| `SNAPSHOT_INTERVAL_MS` | Polling interval, minimum 10 seconds | `30000` |
| `STORAGE_ACTIVITY_MAX_RUNTIME_MS` | Worker runtime budget for one storage activity pass | `15000` |
| `STORAGE_ACTIVITY_BATCH_SIZE` | Worker building batch size for storage activity resume passes | `25` |
| `MARKET_TRADES_MAX_RUNTIME_MS` | Worker runtime budget for one member trade import pass | `15000` |
| `MARKET_TRADES_BATCH_SIZE` | Worker member batch size for market trade resume passes | `20` |
| `DISCORD_BOT_TOKEN` | Optional Discord bot token override | admin-stored secret |
| `DISCORD_APPLICATION_ID` | Optional Discord application ID override | admin setting |
| `DISCORD_PUBLIC_KEY` | Optional Discord interactions public key override | admin setting |
| `DISCORD_GUILD_ID` | Optional Discord guild ID override for command registration | admin setting |
| `DISCORD_CHANNEL_ID` | Optional Discord notification channel ID override | admin setting |

## Relay Preview Deployment

The standalone preview setup is:

- Ubuntu VPS.
- Node.js 24.
- Application installed at `/opt/bitcraft-claim-monitor-relay`.
- Persistent data at `/var/lib/bitcraft-claim-monitor-relay`.
- systemd running the web Node process on `127.0.0.1:19430` and a separate worker process for collectors and scheduled jobs.
- Caddy serving the preview at `https://relay.timbersteeltrade.com`.

Full isolated bootstrap, protected configuration, Caddy merge, rollback, backup,
privacy-ledger recovery, and diagnostic instructions are in
[`DEPLOYMENT.md`](./DEPLOYMENT.md).

For a normal preview release, merge the reviewed pull request, manually run
**Deploy Relay preview** from `main` in GitHub Actions, and approve the protected
`relay-preview` environment deployment. The workflow verifies the exact commit
before preparing an immutable Relay release. It does not deploy or restart the
maintained application.

The preview uses its own fresh database outside the Git checkout and forces
Discord delivery to record-only mode while parity soaking is in progress.

## Repository Layout

```text
apps/bitcraft-local/                 Maintained application
  src/main.tsx                       React bootstrap only
  src/AppShell.tsx                   App orchestration, routing, auth, settings, notifications
  src/pages/                         Dashboard page components and page-owned helpers
  src/components/                    Extracted React components
  src/api/                           Frontend API hooks and fetch helpers
  src/notifications/                 Browser notification generation and dedupe helpers
  src/styles/                        Incremental stylesheet modules
  server.mjs                         SQLite API, BitJita proxy, auth, production server
  dev.mjs                            Local frontend/API launcher
deploy/                              systemd and Caddy production configuration
DEPLOYMENT.md                        VPS installation and maintenance guide
docs/developer-guide.md              Maintainer architecture and contribution guide
docs/notification-system.md          Browser notification architecture and verification notes
docs/notification-live-source-verification.md  Live-source notification verification runbook
docs/release-readiness-audit.md      Current public-release readiness audit and blockers
BITJITA_API_AUDIT.md                 Public API audit and integration notes
```

## Security Notes

- Gameplay information displayed by the dashboard comes from public BitJita endpoints.
- Admin access protects local configuration and local persisted database inspection.
- Do not commit `bitcraft-local.sqlite`, setup keys, environment files containing secrets, or VPS backups.
- Keep the production Node process bound to localhost and expose it through HTTPS with Caddy.
- Back up the SQLite database separately from the Git repository.

## License

This project is licensed under the **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`).

That means you can:

- Clone, fork, self-host, and modify the project
- Publish your own version
- Run a modified hosted version, provided you also make the corresponding source code available under AGPL-3.0

Additional repository guidance:

- Attribution and repository notices are described in [`NOTICE`](./NOTICE)
- Project/app branding expectations are described in [`TRADEMARKS.md`](./TRADEMARKS.md)

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
