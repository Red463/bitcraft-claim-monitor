# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses beta semantic versioning. See [VERSIONING.md](VERSIONING.md) for the release policy.

Historical beta version headings have been normalised to follow SemVer more closely. The original `1.0.0-beta.1` entry is preserved as the first beta, and earlier patch-heavy beta versions such as `1.0.40-beta.1` are now represented as `1.0.0-beta.41`. Release dates and changelog content have been preserved.

## [Unreleased]

## [1.0.0-beta.99] - 2026-06-30

### Changed

- Split snapshot recording into a short settlement snapshot write followed by separate market-listing and production sync phases, reducing how long worker transactions hold the SQLite writer lock.

## [1.0.0-beta.98] - 2026-06-30

### Changed

- Added resumable worker budgets for storage activity and member market-trade imports so expensive collector work continues across runs instead of scanning every building or member in one pass.
- Added worker budget environment controls for storage activity and market trade import batch sizes and runtimes.

## [1.0.0-beta.97] - 2026-06-29

### Added

- Added a separate production worker service for polling, history imports, scheduled jobs, and Discord background work.

### Changed

- Changed production startup so the public web service serves requests without running expensive background collectors in the same process.
- Increased the default snapshot-history collector interval and added SQLite snapshot indexes to reduce repeated API and database load.
- Added SQLite busy-timeout startup pragmas so concurrent web and worker database access waits briefly instead of failing immediately.

## [1.0.0-beta.96] - 2026-06-29

### Changed

- Improved release-readiness structure by moving more SQLite schema, default settings, owner bootstrap, release metadata, and scheduled-job logic into focused tested server helpers.
- Improved browser notification reliability by scoping signed-in deal-alert deduplication per user and documenting the remaining live-source verification checks.
- Improved public-release CSS and UX safeguards for shared sort controls, app chrome controls, and Public Craft Finder actions.
- Updated README, developer, notification, and release-readiness documentation with current verification evidence and remaining live-source blockers.

## [1.0.0-beta.95] - 2026-06-29

### Changed

- Improved release-readiness structure by moving Discord OAuth flow decisions into a focused tested server helper.
- Updated developer and release-readiness documentation with the latest OAuth helper boundary and verification evidence.

## [1.0.0-beta.94] - 2026-06-29

### Changed

- Improved release-readiness structure by moving DB-backed session lookup, Discord OAuth config, and OAuth state secret handling into focused tested server helpers.
- Documented the `/bot` notification exception as an accepted release decision and updated release-readiness verification evidence.

## [1.0.0-beta.93] - 2026-06-29

### Changed

- Improved release-readiness structure by moving legacy password hashing and admin sign-in throttling into focused tested server helpers.
- Updated developer and release-readiness documentation with the latest password-auth and login-attempt helper boundaries.

## [1.0.0-beta.92] - 2026-06-29

### Changed

- Improved release-readiness structure by moving admin/app session policy and Discord OAuth state handling into focused tested server helpers.
- Updated developer and release-readiness documentation with the latest auth helper boundaries and verification evidence.

## [1.0.0-beta.91] - 2026-06-29

### Changed

- Improved BitJita proxy reliability with tested cache TTLs, request deduplication, timeout handling, and stale-if-error fallback.
- Improved release-readiness structure by moving admin permissions, public user payloads, admin mutation guards, and auth identity helpers out of the production server into focused tested modules.
- Updated developer and release-readiness documentation with the latest server helper boundaries and verification evidence.

## [1.0.0-beta.90] - 2026-06-29

### Changed

- Improved release-readiness stylesheet ownership by moving Production and Public Craft Finder selectors into page-owned CSS modules.
- Renamed reused command/filter styling primitives to neutral `command-filter-*` classes and added guard coverage to prevent page-specific names returning.
- Updated release-readiness and developer documentation with the latest CSS ownership boundaries.

## [1.0.0-beta.89] - 2026-06-29

### Added

- Added live-source notification verification guidance for production queue changes and signed-in market deal alerts.

### Changed

- Improved browser notification reliability by keeping market activity, deal-alert, and production queue sources in a tested app-level source queue.
- Updated release-readiness documentation with the current live-source notification blockers.

## [1.0.0-beta.88] - 2026-06-29

### Changed

- Improved release-readiness structure by moving the admin console and user settings dialog out of the app shell.
- Added focused admin display helpers and boundary tests so release-critical shell responsibilities stay easier to review.
- Expanded notification verification coverage for every routed page and supported browser notification type.

## [1.0.0-beta.87] - 2026-06-29

### Changed

- Improved release-readiness structure by removing the legacy main page bundle after moving Production and Market into dedicated page modules.
- Split Market price finder and buy-order finder tools into focused market-owned components.
- Updated developer and release-readiness documentation with the latest page and market tool boundaries.

## [1.0.0-beta.86] - 2026-06-29

### Changed

- Improved release-readiness structure by moving Inventory, Map, and Public Craft Finder pages out of the legacy main page bundle.
- Moved shared active-region loading and labels into a tested hook so page components no longer own duplicate region helper logic.
- Updated developer and release-readiness documentation with the latest page boundaries.

## [1.0.0-beta.85] - 2026-06-29

### Changed

- Improved release-readiness structure by moving routed Leaderboard and Production page styles into focused page-owned stylesheets.
- Reduced duplicated browser helper code in the main page bundle by reusing shared analytics and URL query helpers.
- Updated developer and release-readiness documentation with the latest page-helper and stylesheet boundaries.

## [1.0.0-beta.84] - 2026-06-28

### Changed

- Improved release-readiness structure by moving scheduled job, market activity, production activity, and recipe catalog helpers out of the production server into focused tested modules.
- Updated developer and release-readiness documentation with the latest server helper boundaries.

## [1.0.0-beta.83] - 2026-06-28

### Added

- Added a tested release notification matrix covering routed pages, supported browser notification types, and the intentional bot-dashboard exception.

### Changed

- Improved release-readiness structure by moving request-body parsing, rate limiting, visitor IP privacy helpers, and Empires page styles into focused modules with tests where applicable.
- Updated developer and release-readiness documentation with the latest server, notification, and stylesheet boundaries.

## [1.0.0-beta.82] - 2026-06-28

### Changed

- Improved release-readiness structure by moving HTTP response, cookie, request-origin, and CSRF helpers out of the production server into focused tested modules.
- Updated developer and release-readiness documentation with the latest server helper boundaries.

### Fixed

- Confirmed admin settings responses keep submitted Discord bot tokens redacted while preserving configured-token status.
## [1.0.0-beta.81] - 2026-06-28

### Changed

- Improved release-readiness structure by moving market listing, best-seller sorting, production craft, and activity-log helpers into focused page utility modules.
- Updated developer and release-readiness documentation with the latest page-helper extraction boundaries.

## [1.0.0-beta.80] - 2026-06-28

### Added

- Added focused server route-group tests and helper coverage for visitor logging route classification.

### Changed

- Improved release-readiness structure by moving shared app chrome styles and route classification helpers into focused modules.
- Documented the remaining public-release browser notification and server architecture verification gaps.

### Fixed

- Fixed notification toasts appearing behind the floating help control and added browser sound helper coverage.

## [1.0.0-beta.79] - 2026-06-28

### Changed

- Improved browser notification settings reliability by normalizing saved toast and sound preferences before account sync, UI rendering, and sound playback.
- Moved browser user-settings styles into a focused stylesheet so settings, account-linking, and theme-editor rules are easier to maintain.

### Fixed

- Fixed corrupted or outdated browser notification settings from disabling important notification gates or selecting invalid sound/volume values.
## [1.0.0-beta.78] - 2026-06-28

### Changed

- Improved notification reliability by centralising market, deal alert, production craft, toast stack, and notification log handling in tested helpers.
- Moved notification-specific UI rules into a focused stylesheet and documented the styling boundary for future release work.

### Fixed

- Fixed duplicate persisted notifications replacing newer entries by ensuring the newest matching notice wins before the notification log is capped.

## [1.0.0-beta.77] - 2026-06-28

### Added

- Added maintainer documentation covering the current app structure, data flow, notifications, styling conventions, and release-readiness blockers.
- Added focused tests for extracted notification, activity, map, market analytics, and member identity helpers.

### Changed

- Improved release-readiness structure by moving notification, activity, map, market analytics, and member identity logic into clearer focused modules.
- Expanded the example environment file with the app's local, production, BitJita, Discord, background task, and GeoIP settings.
- Documented browser notification smoke coverage for market listing and sale alerts across the main app pages.

### Fixed

- Fixed admin-role access to user-management routes while keeping viewer-level users blocked.

## [1.0.0-beta.76] - 2026-06-28

### Changed

- Improved large-page performance by caching heavy player, passive craft, and production craft helper responses with background refresh and stale-data indicators.

### Fixed

- Reduced duplicate BitJita and local helper work during overlapping refreshes to avoid 502s on API-heavy pages while preserving last known good data.
## [1.0.0-beta.75] - 2026-06-27

### Fixed

- Improved live stability during BitJita outages by serving recent cached data where possible, deduplicating heavy empire scans, and logging slow or failed requests with more detail.
## [1.0.0-beta.74] - 2026-06-27

### Added

- Added clickable watchtower coordinates and watchtower access details on the Empires page.

### Fixed

- Fixed Empires watchtower scans timing out by returning partial or cached data when BitJita is slow.

## [1.0.0-beta.73] - 2026-06-27

### Added

- Added an Empires page with regional empire overview and claimed watchtower scouting tools.
## [1.0.0-beta.72] - 2026-06-26

### Added

- Added optional notification sounds with selectable tones, preview, and volume controls in user settings.

### Changed

- Enabled the Alert Pop notification sound by default for new browser settings.
- Reworked the local smoke server health check so the launcher returns reliably during frontend testing.

## [1.0.0-beta.71] - 2026-06-26

### Changed

- Redesigned the Market Analytics best sellers section as a visual leaderboard with ranking controls.
- Hardened the local smoke server workflow so frontend testing can reuse the running server without unreliable restarts.

## [1.0.0-beta.70] - 2026-06-23

### Fixed

- Fixed live server restarts caused by transient BitJita network timeouts in background tasks.
- Improved BitJita timeout logging and preferred IPv4 upstream connections on the VPS.

## [1.0.0-beta.69] - 2026-06-23

### Changed

- Improved page switching performance by aborting stale page refreshes and avoiding unnecessary production data requests on non-production pages.
## [1.0.0-beta.68] - 2026-06-23

### Changed

- Added per-item deal watch thresholds so users can choose how far below average a watched market item must be before alerting.
## [1.0.0-beta.67] - 2026-06-23

### Added

- Added Discord-linked Market Deal Watchlists so users can watch Price Finder items for below-average regional sell listings.
- Added scheduled deal scanning, in-app deal alerts, and best-effort Discord direct messages for watched market items.

### Changed

- Added admin controls for deal watch limits, alert thresholds, minimum confirmed sale baselines, and Discord direct message alerts.
## [1.0.0-beta.66] - 2026-06-21

### Fixed

- Fixed corrupted footer punctuation in the main app footer.

## [1.0.0-beta.65] - 2026-06-20

### Changed

- Improved the admin background collection settings with clearer wording and a less crowded layout.

## [1.0.0-beta.64] - 2026-06-19

### Changed

- Slowed the top refresh progress animation so refresh cycles feel less distracting.

## [1.0.0-beta.63] - 2026-06-19

### Fixed

- Fixed the top refresh progress line causing a brief horizontal scrollbar during refresh cycles.

## [1.0.0-beta.62] - 2026-06-19

### Changed

- Added a subtle top-edge refresh progress line while keeping the sidebar as the main refresh status indicator.

## [1.0.0-beta.61] - 2026-06-19

### Changed

- Improved page switching performance by briefly reusing recently loaded page data while live refreshes continue normally.
- Removed the floating page refresh notice so refresh state is shown only in the sidebar.

## [1.0.0-beta.60] - 2026-06-19

### Changed

- Improved the profession focus card with tier-coloured level pills, rank markers, and a compact tier distribution view.

## [1.0.0-beta.59] - 2026-06-19

### Fixed

- Added BitJita request timeouts so slow production refreshes fail gracefully instead of leaving the page stuck refreshing.

## [1.0.0-beta.58] - 2026-06-19

### Changed

- Updated the professions page so adventure skills use the same sortable table layout as professions while remaining in a separate section.

## [1.0.0-beta.57] - 2026-06-18

### Removed

- Removed the public `/wiki` knowledge base, related API endpoints, generated wiki data setup, route handling, page component, and styles after the feature caused app instability.

## [1.0.0-beta.56] - 2026-06-18

### Changed

- Redesigned the public wiki into a player-facing game wiki with guide cards, searchable item, cargo, recipe, profession, and output-reference entries.
- Improved wiki generation so it built friendly pages from the newest available local game data tables instead of exposing raw cached recipe JSON.

## [1.0.0-beta.55] - 2026-06-18

### Added

- Added a public BitCraft server mechanics guide with source-backed notes on claim treasury, crafting XP, gathering, loot, research, market state, and unconfirmed mechanics.
- Added a public `/wiki` knowledge base with admin-editable guide pages and generated recipe/output reference entries from local discovery data.

## [1.0.0-beta.54] - 2026-06-18

### Changed

- Updated project documentation to reflect current BitJita API reliability notes, Discord-backed admin login, deployment guidance, and the live BitJita proxy data model.
- Refactored the frontend app shell so the entrypoint, navigation, theme, settings defaults, analytics, and helper logic are split into focused modules for easier maintenance.

### Fixed

- Fixed the BitJita refresh issue banner so it renders as an opaque overlay above page content.

## [1.0.0-beta.53] - 2026-06-17

### Changed

- Restored main app pages to refresh live BitJita data through the local proxy instead of using SQLite current-state tables for page display.
- Clarified Admin collector wording so background collectors are described as history and notification support rather than the source of live page data.

## [1.0.0-beta.52] - 2026-06-16

### Fixed

- Fixed in-app notifications so market listing and sale toasts are detected from a dedicated background feed instead of only firing after opening the Activity page.

## [1.0.0-beta.51] - 2026-06-15

### Fixed

- Fixed inventory rows that only expose a BitJita tag, such as berries and meat, so the tag is shown as the item name instead of `Unknown item`.

## [1.0.0-beta.50] - 2026-06-15

### Fixed

- Fixed inventory item names so BitJita display metadata on inventory slots is preserved in the local inventory table.

## [1.0.0-beta.49] - 2026-06-15

### Fixed

- Fixed Regional Buy Order sale baselines so stale empty bucket rows are cleaned up instead of staying in the database.
- Improved Regional Buy Order sale baselines to store compact price-stat metadata instead of raw empty bucket dumps.

## [1.0.0-beta.48] - 2026-06-15

### Fixed

- Fixed Regional Buy Order opportunity baselines so cargo buy orders use the same BitJita price-history endpoint as Price Finder.
- Improved Regional Buy Order opportunity baselines to use BitJita's 7-day average sale price when available.

## [1.0.0-beta.47] - 2026-06-15

### Fixed

- Fixed Regional Buy Order sales baselines so stale buy orders from old region scans no longer create zero-value sale averages for unrelated regions.
- Fixed Regional Buy Order sales baselines so empty BitJita sale-history responses are not saved as confirmed sale averages.

## [1.0.0-beta.46] - 2026-06-15

### Changed

- Improved Regional Buy Order sale baseline scheduled-job progress so Admin shows checked, saved, failed, and current-item details while the job runs.

### Fixed

- Fixed slow BitJita sale-history requests blocking the whole Regional Buy Order sale baseline job by timing out individual item lookups and continuing with the remaining items.
- Fixed BitJita refresh issue banners so they overlay the page instead of shifting dashboard content down.

## [1.0.0-beta.45] - 2026-06-15

### Fixed

- Fixed Regional Buy Order sale baselines so completed item baselines appear while the scheduled job is still running.
- Fixed the page refresh indicator so it no longer shifts page content down during background updates.

## [1.0.0-beta.44] - 2026-06-15

### Changed

- Reduced Regional Buy Order collector load by scanning only the monitored settlement region every 30 minutes.
- Moved Regional Buy Order sales baseline refreshes into a separate daily scheduled job.

## [1.0.0-beta.43] - 2026-06-15

### Changed

- Added clearer page refresh indicators so users can see when data is updating in the background.
- Improved Admin refresh, collection, endpoint check, and scheduled-job buttons with visible busy states during slow actions.

## [1.0.0-beta.42] - 2026-06-15

### Changed

- Added live collector progress details to the sidebar Last Refresh hover panel and Admin collection status while refreshes are running.
- Reduced repeated regional buy-order sales baseline lookups by reusing cached 7-day sale averages for longer between collector runs.
- Normalised compact money summary cards to show `K`, `M`, and `B` without an extra gold suffix.

## [1.0.0-beta.41] - 2026-06-15

### Changed

- Improved the Admin loading screen animation and reduced visual clutter while administrator access is being verified.
- Fixed sidebar Last Refresh spacing so the label and timestamp no longer run together.

## [1.0.0-beta.40] - 2026-06-14

### Changed

- Changed the Map resource category filter to use BitJita resource tags directly instead of broad grouped categories.

## [1.0.0-beta.39] - 2026-06-14

### Fixed

- Fixed the Region page missing live region details when BitJita returns a settlement region name without a numeric region id.
- Fixed the Map resource category filter only showing exact-match categories such as Stone by grouping BitJita resource tags into the app's broader resource categories.

## [1.0.0-beta.38] - 2026-06-14

### Changed

- Split major main-app pages and shared interface pieces into focused frontend modules to make future page work safer to maintain.
- Improved page data resilience so local page views keep the latest successful data when one refresh domain temporarily fails.

## [1.0.0-beta.37] - 2026-06-14

### Fixed

- Fixed duplicate market notifications and stale notification timestamps when listing events were reprocessed.

## [1.0.0-beta.36] - 2026-06-14

### Fixed

- Fixed the Admin database browser hiding columns after the first ten fields.

## [1.0.0-beta.35] - 2026-06-14

### Added

- Added search, row count controls, and pagination to Admin recent security events.

## [1.0.0-beta.34] - 2026-06-14

### Fixed

- Fixed existing SQLite databases not receiving newer current-state table columns during startup migration.

## [1.0.0-beta.33] - 2026-06-14

### Fixed

- Fixed the research current table staying empty by storing BitJita research responses that use the `technologies` field.

## [1.0.0-beta.32] - 2026-06-13

### Fixed

- Fixed page data being cleared when a partial BitJita refresh failed, so pages keep showing the latest successful local data during API blips.

## [1.0.0-beta.31] - 2026-06-13

### Added

- Added ipapi.co as a cached server-side GeoIP provider so visitor location statistics no longer require large local GeoIP imports.
- Added Admin controls for choosing ipapi.co, local GeoIP database mode or disabled GeoIP lookup, plus configurable provider cache retention.

### Changed

- Changed the GeoIP refresh job to skip local downloads when ipapi.co provider mode is active.

## [1.0.0-beta.30] - 2026-06-13

### Fixed

- Fixed oversized legacy GeoIP JSON fallback files being loaded into memory during normal app startup and visitor lookup.

## [1.0.0-beta.29] - 2026-06-13

### Fixed

- Fixed MaxMind GeoLite2 City imports exhausting Node memory by storing imported IP ranges in SQLite instead of a large JSON lookup file.

## [1.0.0-beta.28] - 2026-06-13

### Changed

- Improved MaxMind GeoLite2 City imports so GeoIP refreshes process only the required CSV files and show clearer progress while running.

## [1.0.0-beta.27] - 2026-06-13

### Changed

- Changed manual scheduled-job runs to start in the background so long GeoIP refreshes no longer leave the Admin page waiting for the request to finish.

### Fixed

- Added visible GeoIP refresh progress details while scheduled jobs are running.

## [1.0.0-beta.26] - 2026-06-13

### Fixed

- Fixed scheduled jobs staying stuck as running after a server crash or timeout.

## [1.0.0-beta.25] - 2026-06-13

### Fixed

- Fixed background polling and GeoIP download failures being able to take the local server offline.

## [1.0.0-beta.24] - 2026-06-13

### Changed

- Changed the Admin session-loading animation to remain visible briefly before entering the console.

## [1.0.0-beta.23] - 2026-06-13

### Added

- Added MaxMind GeoLite2 City CSV ZIP support for scheduled local GeoIP refreshes using separate account ID and license key fields.
- Added an animated Admin session-loading screen.

### Changed

- Improved Admin GeoIP configuration wording and masked saved MaxMind license keys in settings/database views.

## [1.0.0-beta.22] - 2026-06-13

### Added

- Added server-side visitor security logging with short-term full IP retention, anonymised IP/hash storage and Admin reporting.
- Added optional local GeoIP lookup support and a scheduled GeoIP database refresh job for approximate visitor location statistics.

### Changed

- Documented visitor security logging separately from optional analytics cookies.

## [1.0.0-beta.21] - 2026-06-13

### Changed

- Changed normal page data loading to prefer dedicated SQLite current tables instead of the raw domain payload cache.
- Improved current-table population for members, player details, inventory, construction, production, research, region and market data.

### Fixed

- Fixed member permission columns in the database browser showing zeroes when BitJita reports permissions using non-boolean field shapes.
- Fixed construction current data so material requirements, added materials and storage coverage follow the same logic as the construction page.

## [1.0.0-beta.20] - 2026-06-13

### Changed

- Changed the first-visit analytics consent prompt into a blocking modal with clearer anonymous usage-tracking wording.
- Rotated the analytics consent storage key so users are prompted again after the wording change.

### Fixed

- Fixed the Admin database browser showing stale rows when switching tables quickly.

## [1.0.0-beta.19] - 2026-06-13

### Changed

- Improved the Admin database browser with table stats, clearer search, and export actions.
- Improved Admin configuration timing controls so interval units are explicit.
- Improved BitJita endpoint check results with summary stats and a readable sortable table.

### Fixed

- Fixed sidebar last-refresh spacing so the label and timestamp no longer overlap.
- Fixed Admin being interrupted by the full administrator-session loading screen during normal display refreshes.

## [1.0.0-beta.18] - 2026-06-13

### Added

- Added SQLite-backed domain current tables for claim, members, players, professions, production, inventory, construction, research and region data.
- Added page-ready local endpoints under `/api/local/pages/:page` so normal app pages read the latest server-collected data locally.
- Added configurable per-domain collector settings in Admin, including enabled state and collection interval.
- Added domain change event storage for meaningful server-detected changes such as member and production state changes.

### Changed

- Changed automatic page refreshes to read server-held SQLite domain data instead of rebuilding pages from a single cached settlement-state blob.
- Changed server collection to refresh due domains independently and reuse recent local domain data for domains that are not due yet.
- Updated project documentation to describe the server-owned domain-table refresh architecture.

### Removed

- Removed the legacy `current_claim_state` all-in-one cache table and its fallback usage.

## [1.0.0-beta.17] - 2026-06-13

### Added

- Added a sidebar refresh hover panel showing when each server collector last updated.

### Fixed

- Fixed online members showing "Playing 0m" when BitJita reports them online without a usable session timestamp.

## [1.0.0-beta.16] - 2026-06-13

### Added

- Added server-owned settlement refresh caching so browsers read the latest server-held BitJita data instead of each tab refreshing BitJita independently.
- Added collector status metadata and Admin controls for separate display refresh and server collection intervals.

### Changed

- Improved the BitJita refresh issue banner so it stays compact and preserves page spacing.
- Changed main app pages to use local server-held app data for automatic refreshes, reducing browser-driven BitJita request fan-out.
- Changed server collection to preserve the latest successful settlement data when BitJita refreshes fail.

### Fixed

- Fixed server collection using short-lived production cache during manual polls, so changed craft data is not masked by cached production responses.

## [1.0.0-beta.15] - 2026-06-13

### Added

- Added sortable column headers to shared app data tables.

### Changed

- Changed offline Leaderboard current-session values to show a dash instead of "Unavailable".

## [1.0.0-beta.14] - 2026-06-13

### Fixed

- Fixed the Leaderboard Online/Sessions tab showing members as offline because it was not loading player-detail status data.

## [1.0.0-beta.13] - 2026-06-13

### Added

- Added Leaderboard tabs for Contribution, Professions, Activity, Market, and Online/Sessions settlement comparisons.
- Added BitJita total played and total signed-in values to the Leaderboard Online/Sessions tab when player detail data provides them.

## [1.0.0-beta.12] - 2026-06-13

### Changed

- Improved Craft Calculator recipe route selection with clearer route cards and route-type labels.
- Changed Craft Calculator defaults to prefer normal processing recipes over unpack/package routes when multiple recipe routes are available.

## [1.0.0-beta.11] - 2026-06-13

### Changed

- Moved Map URL diagnostics out of the public Map page into a new Admin Diagnostics tab for future troubleshooting tools.
- Changed the Dashboard online member card fallback from "Session active" to a clearer playtime unavailable label.
- Removed the Craft Calculator calculation notes panel to reduce clutter when multiple recipe options exist.

## [1.0.0-beta.10] - 2026-06-12

### Changed

- Improved Map player tracking diagnostics and prevented temporary player-detail failures from emptying the member roster used by the map.

## [1.0.0-beta.9] - 2026-06-12

### Added

- Added editable schedules for Admin scheduled jobs, including daily, weekly and monthly run options.
- Added Admin member tracking controls so specific claim members can be hidden from member-derived app pages while remaining visible for re-enabling in Admin.
- Added Activity search across the full stored settlement history instead of only the recent loaded event window.

### Changed

- Improved BitJita refresh issue banners with expanded diagnostics, loaded data counts, page context and copyable troubleshooting logs.

### Fixed

- Fixed the Admin database browser returning to the Status tab after refreshes by persisting the selected Admin tab.

## [1.0.0-beta.8] - 2026-06-12

### Added

- Added direct recipe materials to Craft Calculator so users can compare immediate recipe inputs with fully expanded source materials.
- Added a technical application overview covering current architecture, pages, data flow, integrations, security, and risk areas.

## [1.0.0-beta.7] - 2026-06-12

### Added

- Added a reusable scheduled-jobs system with an Admin status panel for viewing, enabling, disabling and manually running background jobs.
- Added a local recipe catalog cache used by Craft Calculator, with a daily midnight job to refresh known recipe records from BitJita.

### Changed

- Changed Craft Calculator recipe expansion to use locally cached recipe details where possible instead of repeatedly fetching each recipe directly from BitJita.

### Fixed

- Made Craft Calculator ingredient lookups more resilient to BitJita rate limits by caching recipe details, reducing lookup bursts, and treating failed child ingredients as source materials instead of failing the whole plan.

## [1.0.0-beta.6] - 2026-06-12

### Changed

- Changed local BitJita proxy rate limiting so cached and deduplicated responses do not count as new upstream request pressure.

### Fixed

- Fixed Admin and Activity no-poll pages clearing the last good BitJita data snapshot during navigation.

## [1.0.0-beta.5] - 2026-06-12

### Changed

- Reduced avoidable BitJita polling while viewing Admin and increased the local BitJita proxy rate-limit ceiling for normal dashboard refresh workloads.

### Fixed

- Improved HTTP 429 refresh warnings so local rate limiting is easier to distinguish from upstream BitJita issues.

## [1.0.0-beta.4] - 2026-06-12

### Added

- Added Discord-backed administrator access with `red463` seeded as the default owner admin by Discord ID.

### Changed

- Replaced the Admin sign-in and administrator management UI with Discord account approval instead of separate app passwords.

## [1.0.0-beta.3] - 2026-06-12

### Changed

- Removed the visible "not syncing" suffix from active-region dropdown labels.
- Updated Production's active/paused state to recognize craft progress that moves during refreshes, while keeping contribution recording limited to BitJita contribution data.

## [1.0.0-beta.2] - 2026-06-12

### Added

- Added a shared active-region source backed by BitJita region status data, including admin fallback IDs for temporary seasonal regions.

### Changed

- Updated Map, Market tools and Public Craft Finder region selectors to use the shared active-region list instead of stale hardcoded region IDs.

## [1.0.0-beta.1] - 2026-06-12

### Changed

- Reworked the floating utility buttons into a compact footer-aware dock with clearer icon contrast and tidier notification badges.
- Reworked the Construction page into a clearer gather-first view with compact material rows, project filters and a consolidated missing-materials list.
- Moved Admin out of the main sidebar into the floating utility dock and User Settings to keep normal navigation focused on player-facing pages.
- Hid Admin shortcuts from the floating dock and User Settings unless an administrator session is active.
- Removed the listed-time helper notice from Market listings to reduce visual clutter.

### Removed

- Removed inactive pin/watchlist controls from Production, Market pricing and Browser Settings until a visible pinned-items surface is rebuilt.

## [0.9.27-beta.1] - 2026-06-11

### Changed

- Updated toast notifications to use the current dashboard-style colours and show item thumbnails with tier-coloured borders when item data is available.
- Changed Construction progress bars to show material contribution completion instead of build effort progress.
- Reworked the main sidebar into grouped collapsible sections to reduce navigation clutter.
- Added a sidebar Discord sign-in link and changed the first-visit sign-in prompt to use the same direct OAuth link as User Settings.
- Removed the visible Quick Find button from the sidebar while keeping keyboard command search available through Ctrl+K.
- Added an in-app BitJita data warning banner when refreshes fail or production craft details only partially update.
- Improved BitJita HTTP error messages so temporary API failures are shown as readable app alerts instead of raw endpoint errors.

## [0.9.26-beta.1] - 2026-06-11

### Fixed

- Updated Leaderboard cards and filter controls to match the current dashboard-style card surfaces and metric styling.
- Renamed the Leaderboard summary metric from Recorded Progress to Recorded Contribution.

## [0.9.25-beta.1] - 2026-06-11

### Added

- Added a Contribution Leaderboard page that records observed settlement craft contributions by member and profession.
- Added a first-visit Discord sign-in prompt so users can link their character and save server-side preferences when Discord login is enabled.

### Changed

- Grouped utility pages under a Tools flyout in the sidebar.
- Reworked Browser Settings into focused sections for account, theme, preferences, and local data.
- Added endpoint-specific BitJita proxy cache policies so stable catalog data is cached longer while live settlement data stays short-lived.
- Added a server-side Dashboard data aggregate so the Dashboard loads its live BitJita bundle through one local endpoint instead of many browser proxy requests.
- Moved dashboard/member/map player detail loading behind one cached local endpoint to reduce browser request fan-out.
- Consolidated local history polling onto the main app refresh cycle to avoid duplicate background timers per page.
- Added an Admin setup checklist and a clearer Discord bot workflow summary to make setup gaps easier to find.
- Improved admin success/error feedback and changed destructive admin/bot actions to require typed confirmation.
- Added a focused Phase 6 stylesheet module for setup, workflow and mobile shell polish.
- Updated local development and agent documentation for the current maintained app and smoke-server workflow.

### Fixed

- Fixed duplicate Discord craft-start notifications when BitJita reports the same active craft with a different current crafter.
- Fixed the sidebar Tools menu visibility, changed it to an overlay so it no longer compresses the sidebar, and moved Browser Settings navigation to top tabs so the dialog no longer stays oversized on short sections.

### Removed

- Removed historical Replit export artifacts from the active workspace.

## [0.9.24-beta.1] - 2026-06-10

### Fixed

- Fixed duplicate Discord craft-start notifications when BitJita changes a craft entity ID, Discord delivery is skipped or fails, or a craft briefly disappears from polling.

## [0.9.23-beta.1] - 2026-06-09

### Changed

- Improved the main app footer spacing, support button styling, and sidebar collapse animation.

## [0.9.22-beta.1] - 2026-06-09

### Added

- Added a Market Buy Order Finder tab for finding active regional buy orders by item, with best price, total demand, total value, and order details.
- Added a Craft Calculator page that uses BitJita recipe data to calculate source materials and step-by-step crafting chains.
- Added recipe route selectors to the Craft Calculator when BitJita exposes multiple valid recipes for an output or intermediate material.

### Fixed

- Fixed the Buy Order Finder region filter so returned buy orders are locally filtered to the selected region even if the API returns a broader result set.
- Fixed Craft Calculator source-material chains for items whose production recipe is exposed through BitJita output-helper items, such as wood logs from trunks.

## [0.9.21-beta.1] - 2026-06-08

### Fixed

- Fixed the footer support button so it renders reliably without depending on the third-party Buy Me a Coffee embed script.

## [0.9.20-beta.1] - 2026-06-08

### Changed

- Switched the repository license from PolyForm Noncommercial to AGPL-3.0-only and added explicit notice/trademark guidance for attribution and branding.
- Added a Buy Me a Coffee support link to the main app footer.
- Replaced the plain footer support link with the embedded Buy Me a Coffee button configuration.

## [0.9.19-beta.1] - 2026-06-08

### Changed

- Updated Market live listings to label the per-item amount as Unit Price and show a separate Total Price column for the full listing value.

## [0.9.18-beta.1] - 2026-06-07

### Added

- Added Void, Ocean, and Crimson browser theme presets.

### Changed

- Updated the Violet browser theme description to avoid research-specific wording.

## [0.9.17-beta.1] - 2026-06-07

### Changed

- Continued Phase 4 frontend modularization by moving shared formatting, item/equipment normalization, owner labels, browser persistence hooks, badges, item displays, metric components, API polling hooks, and app data normalization into focused modules.
- Moved the Members, Professions, Construction, Research, Region, and Sync views into dedicated page modules and removed the dead legacy Overview implementation from the main app shell.

## [0.9.16-beta.1] - 2026-06-07

### Added

- Added private settlement crafts to the Production page when BitJita returns them through member craft data, with private craft badges and a browser setting to hide them.

### Fixed

- Fixed Production current-crafter chips so member names and counts render as one clean pill.

## [0.9.15-beta.1] - 2026-06-07

### Changed

- Improved BitJita proxy performance by sharing duplicate in-flight API requests and using a bounded short-lived cache for repeated frontend refreshes.
- Reduced local history polling from three separate browser requests to one combined endpoint for market, activity, and snapshot history.
- Reduced BitJita player-detail fan-out by only loading per-member online/session details on Dashboard, Members, and Map pages where that data is displayed.
- Reduced local history polling payloads by loading market history only on the Market page and trend snapshots only on the Dashboard while keeping activity notifications available everywhere.
- Reduced main BitJita refresh fan-out by loading heavier settlement endpoints only on the pages that display them, while keeping shared claim, member, and craft data available for app-wide shell features and production notifications.
- Limited browser snapshot writes to the Dashboard page so snapshots are recorded only when the full snapshot inputs are loaded.
- Capped paginated BitJita listing and region fetches to avoid large bursts of simultaneous requests while preserving complete results.
- Capped Production passive-craft member lookups to avoid refreshing every member request at once while preserving the same passive craft results.
- Moved Dashboard activity summaries and treasury net calculations server-side so non-Activity pages can refresh with smaller local history payloads.
- Split Discord bot dashboard sections into lazy-loaded chunks so ordinary app pages download less admin-only UI code up front.
- Reduced background local-history polling on non-Activity pages while keeping Activity and Market refreshes more responsive.
- Capped player-detail and craft-contribution refreshes to avoid large simultaneous BitJita request bursts while preserving per-item fallback behavior.
- Capped market sale/cancellation reconciliation checks during polling so closed or changed listings no longer trigger unbounded BitJita trade-history lookups.
- Reduced non-Activity local-history payload sizes while keeping the full retained history available on the Activity page.
- Split production frontend bundles into dedicated vendor chunks for React, icons, and other dependencies so repeat visits can reuse cached framework code.
- Capped combined local-history activity limits server-side so oversized history requests cannot create unnecessarily large database reads.
- Added a cached local Map catalog endpoint so resources and creatures load through one reusable server-side aggregation instead of separate browser BitJita requests.
- Capped pinned market watch price-history refreshes so watchlist items no longer request every tracked market price at once.
- Moved settlement member passive-craft summaries behind one cached local endpoint so the Production page no longer makes a separate browser BitJita request for every member.

## [0.9.9-beta.1] - 2026-06-07

### Security

- Added administrator roles and route-level permission checks for settings, data export, backups, analytics, linked accounts, Discord management, Discord moderation, and administrator account management.
- Preserved existing administrator access by migrating current admin users to the Owner role.

### Changed

- Added role selection and role editing to the Admin Console administrator management screen.

## [0.9.8-beta.1] - 2026-06-07

### Security

- Added baseline browser security headers for API, static frontend, file download, branding, and BitJita proxy responses.
- Added route-specific request body limits so oversized public and admin requests are rejected predictably.
- Added route-class rate limiting for auth, Discord OAuth, analytics, Discord interactions, BitJita proxying, region lookups, and local snapshot collection.
- Hardened Discord OAuth state cookies with a server-side HMAC signature to reject tampered callback state.

### Fixed

- Improved oversized request handling so rejected bodies return `413` instead of a generic server error.

## [0.9.7-beta.1] - 2026-06-06

### Changed

- Improved Production controls spacing so member, sorting, and crafter filters align cleanly.
- Redesigned Construction project cards to make required materials, storage, and missing quantities easier to scan.
- Standardised Market tools layout so Live Listings, Analytics, and Price Finder keep a consistent height.
- Improved Admin status card spacing to better match the updated dashboard styling.

### Added

- Added crown styling beside the monitored settlement owner's member name where that user appears in the app.

### Fixed

- Prevented crown styling from being applied to owners of other settlements in regional views.

## [0.9.6-beta.1] - 2026-06-06

### Fixed

- Fixed Discord character-link selection so member names are shown and submitted instead of raw player IDs.

## [0.9.5-beta.1] - 2026-06-06

### Added

- Added optional Discord sign-in for app users.
- Added Discord-to-character link requests with admin approval from the Admin page.
- Added Discord mod-log notifications when users request a character link review.
- Added signed-in account settings save/load so users can keep browser preferences on the server.

### Security

- Kept Discord OAuth client secrets server-side through environment or app secret storage instead of exposing them to the browser.

## [0.9.4-beta.1] - 2026-06-06

### Added

- Added Custom theme controls for page-gradient stop positions and gradient height.

### Changed

- Expanded Custom theme import, export, and saving so all preset-controlled theme settings are preserved, including gradient shape values.

## [0.9.3-beta.1] - 2026-06-06

### Added

- Added browser-local theme import and export controls so users can copy, download, share, and restore theme JSON.
- Added a saved Custom theme preset so users can switch between built-in presets and their own saved theme.

### Changed

- Improved the browser-local theme editor with clearer labels, a collapsible advanced editor, a closer app preview, and dedicated page-gradient controls.
- Expanded the browser-local theme editor with card surface, card heading, metric value, icon background, active highlight, active border, and hover border controls.
- Changed the theme editor entry point so the Custom preset opens the advanced theme controls instead of using a separate Edit Theme button.

### Fixed

- Fixed theme controls so the sidebar colour and advanced colour inputs update the actual rendered app surfaces.
- Fixed Dashboard and shared KPI cards so theme changes affect card gradients, card titles, metric values, icons, active states, and hover borders.
- Fixed browser-local themes so shared main-app cards, filters, tables, controls, and page panels outside Dashboard also consume the selected theme colours.

## [0.9.2-beta.1] - 2026-06-06

### Added

- Added a browser-local theme editor to User Settings with presets, grouped colour controls, live preview, and reset-to-default.

### Removed

- Removed the Admin Theme tab so theme changes are user-specific rather than server-wide.

## [0.9.1-beta.1] - 2026-06-06

### Changed

- Restyled the main app sidebar to match the new Dashboard visual language.
- Standardised main app page backgrounds on the new black-to-charcoal gradient.
- Adjusted sidebar brand sizing so the current settlement name fits without removing truncation for longer names.
- Made the main app background gradient consistent across short and long pages by fixing the lighter section to the top of the viewport.

### Fixed

- Fixed the Dashboard treasury chart so it uses daily snapshots and no longer draws vertical spike charts from clustered refresh samples.

## [0.9.0-beta.1] - 2026-06-06

### Changed

- Restyled the Inventory page with the new Dashboard visual language, including a Dashboard-style topbar, summary cards, compact filters, polished core material cards, and cleaner container panels.
- Improved the Inventory filter panel so dropdowns have clear labels, search fields use a cleaner single-surface style, and the non-empty toggle no longer dominates the filter area.
- Restyled the Public Craft Finder page with the new Dashboard/Production visual language, including summary cards, a compact filter panel, and a cleaner results table.
- Restyled the Construction page with the new Dashboard visual language, including summary cards, a cleaner gather-next panel, and elevated project cards.
- Restyled the Research page with the new Dashboard visual language, including summary cards, labelled filters, and cleaner completed/available research lanes.
- Restyled the Market page with the new Dashboard visual language, including a trade-focused topbar, summary cards, cleaner filters, richer analytics panels, and a polished Price Finder.
- Restyled the Region page with the new Dashboard visual language, including a compact topbar, elevated rank cards, equal-height regional context panels, and a cleaner rankings table.
- Restyled the Map page topbar, player filters, resource finder, and map frame colours to match the new Dashboard visual language.
- Restyled the Sync page shell with the new Dashboard-style topbar and background while preserving the embedded board.
- Restyled the Activity page with the new Dashboard visual language, including summary cards, clearer filters, and a more polished timeline feed.
- Restyled the Admin page and its tabs with the new Dashboard visual language, including the console shell, tab bar, cards, forms, metric cards, tables, and list rows.
- Restyled the floating Settings, Updates, and Help controls and their popups to match the new Dashboard visual language.
- Filtered treasury and supply-only entries out of the Dashboard recent activity card so it stays focused on other settlement activity.

### Fixed

- Fixed Market Price Finder layout stretching so switching tabs no longer enlarges the header, KPI cards, or tool panel.

## [0.8.65-beta.1] - 2026-06-05

### Changed

- Refined the Production page command controls into a compact panel and updated active craft card headings to match the Dashboard heading style.

## [0.8.64-beta.1] - 2026-06-05

### Changed

- Updated Dashboard, Professions, and Production card headings to use the same compact Dashboard heading style while retaining section icons.

## [0.8.63-beta.1] - 2026-06-05

### Fixed

- Fixed top-right metadata spacing on the Production and Professions pages so tier badges no longer crowd their labels.
- Cleaned up the Production passive craft table row background so it no longer shows an unintended gradient band.

## [0.8.62-beta.1] - 2026-06-05

### Changed

- Restyled the Production page around the new Dashboard visual language with elevated KPI cards, cleaner production controls, richer craft cards, and a polished passive craft section.

## [0.8.61-beta.1] - 2026-06-05

### Changed

- Restyled the Professions page to match the new Dashboard and Members visual language while preserving tier colours in the professions table.

## [0.8.60-beta.1] - 2026-06-05

### Fixed

- Shortened Dashboard region wealth values to compact million notation.
- Fixed the Dashboard treasury trend axis so it shows a seven-day timeline instead of repeating the same date label.

### Changed

- Restyled the Members page around the new Dashboard visual language with elevated summary cards, cleaner roster rows, and a darker command-centre surface.

## [0.8.59-beta.1] - 2026-06-04

### Changed

- Removed the old Overview page from main navigation so Dashboard is the single home page.
- Redirected old Overview and Buildings page URLs to Dashboard to avoid stale or broken entry points.

## [0.8.58-beta.1] - 2026-06-04

### Added

- Added a new Dashboard page as the default home page, styled separately from the existing Overview page to more closely match the supplied command-centre mockup.

### Changed

- Updated the main navigation and default page setting so new sessions open on Dashboard while the existing Overview page remains available.

## [0.8.57-beta.1] - 2026-06-04

### Changed

- Redesigned the main app Overview page into a denser settlement command-centre dashboard with KPI cards, supply, treasury, activity, online member, production, attention and settlement detail sections.
- Restyled Overview around a sharper blue-black dashboard palette inspired by the new mockup direction.
- Renamed the unclear market presence KPI to Trade Listings and kept the metric limited to current settlement listing counts.
- Added a real treasury trend chart powered by locally recorded settlement snapshots, with an honest empty state until enough snapshots exist.

## [0.8.56-beta.1] - 2026-06-04

### Changed

- Refactored main-app API parsing for supply runway and Construction project materials into tested shared helpers.

### Fixed

- Fixed Overview supply runway parsing so it accepts both documented and currently observed BitJita run-out field names.
- Added regression coverage for BitJita construction requirements, project contributions, stored inventory quantities, timestamp parsing and wrapped/direct API arrays.

## [0.8.55-beta.1] - 2026-06-03

### Added

- Added a stable local smoke-server launcher and agent instructions for browser testing on `http://127.0.0.1:18449/`.

### Fixed

- Matched the floating help button styling to the Settings and Updates action buttons.
- Fixed Construction project materials by reading BitJita's full consumed item/cargo requirement stacks instead of only already-added project materials.
- Fixed Construction material labels so project contributions and storage quantities are shown separately.
- Widened Overview hero metric sizing so the Online, Construction and Market labels no longer crowd or overlap.

## [0.8.54-beta.1] - 2026-06-03

### Changed

- Removed the Members table View column so member details open only by clicking a member row.
- Replaced the Professions sword icon with a graduation-cap icon in navigation and profession summary cards.
- Moved Browser Settings and Updates out of the sidebar into floating app action buttons.
- Added a collapsible Resource Finder panel on the Map page to free more space for the map.
- Reset the Resource Finder collapse preference so the Map page opens expanded by default after this update.

### Fixed

- Tightened Overview hero metric sizing to prevent the top-right metric labels from overflowing.
- Matched paired card heights on the Professions and Region pages for a cleaner layout.

## [0.8.53-beta.1] - 2026-06-03

### Removed

- Removed the main app Structures page, sidebar entry, default-page option, and related page-specific styling.

### Changed

- Redirected old Structures page links and saved browser/default-page settings back to Overview so existing users do not land on a blank removed page.
- Replaced the Overview Structures shortcut with a Construction shortcut.

## [0.8.52-beta.1] - 2026-06-03

### Changed

- Renamed Discord craft notification buttons from `Watch <profession>` to `Toggle <profession> Notifications` so the action is clearer after notifications are already enabled.

### Fixed

- Made Discord craft notification toggle buttons check the member's current server roles before adding or removing notification roles.

## [0.8.51-beta.1] - 2026-06-03

### Fixed

- Standardised Discord bot dashboard tab alignment so capped-width sections start from the same left edge instead of some tabs appearing centred and others left-aligned.

## [0.8.50-beta.1] - 2026-06-03

### Fixed

- Fixed Discord app-update notifications so they read the current Keep a Changelog version section and include actual release notes instead of a vague fallback message.
- Reduced long app-update note lists before sending to Discord, with a pointer to the full changelog when extra notes are omitted.

## [0.8.49-beta.1] - 2026-06-03

### Added

- Added Discord role-panel controls to hide the helper `Selection` / `Selections` embed section from self-assign role messages.
- Added a Discord welcome-flow control to hide the `Next step` embed section from welcome messages.

## [0.8.48-beta.1] - 2026-06-03

### Fixed

- Fixed Discord self-assign single-role panels so clicking an active option actually removes that role instead of only reporting it as removed.
- Made Discord self-assign role buttons check the member's current server roles before adding or removing roles, reducing stale interaction state issues.

## [0.8.47-beta.1] - 2026-06-03

### Changed

- Reworked the Discord bot Channels and Craft Watch pages into cleaner centred routing panels that match the Colour Roles layout.
- Tightened Discord bot moderation and role-manager card sizing for a more consistent 1080p desktop layout.

### Fixed

- Fixed the Discord notification settings footer so endpoint, slash command, token and delivery text no longer runs together.

## [0.8.46-beta.1] - 2026-06-03

### Changed

- Polished the Discord bot dashboard layout with clearer status cards, compact colour-role rows and theme-matched toggle controls.
- Collapsed Discord role-panel editors into readable expandable sections so the Role Panels page is easier to navigate.
- Improved bot dashboard mobile behaviour to avoid clipped setup controls on narrow screens.

### Fixed

- Fixed Discord bot setup status fields visually running together.
- Fixed broken emoji preset display in the Discord role-panel editor.

## [0.8.45-beta.1] - 2026-06-03

### Changed

- Refined the app-wide CSS tokens for more consistent card, input, focus, disabled and compact-control styling.
- Improved responsive behaviour for the main sidebar, bot dashboard navigation and map layout on desktop, tablet and mobile screens.
- Reduced visible refresh jitter by disabling row re-entry animations during background data updates.

### Fixed

- Fixed small-label readability, long-name wrapping and touch-target sizing across dense dashboard controls.
- Added stronger keyboard focus states and clearer scroll cues for wide tables and map resource lists.

## [0.8.44-beta.1] - 2026-06-02

### Fixed

- Fixed the Discord bot page rendering blank by removing hook-order-sensitive diagnostics calculations from the admin render path.
- Hardened Discord diagnostics log handling when the status payload is missing or not yet loaded.

## [0.8.43-beta.1] - 2026-06-02

### Fixed

- Fixed Discord app-update notifications by reading the server version from package metadata instead of a stale hardcoded value.
- Added release-key tracking for app-update announcements using version plus git revision when available, so deploys are not silently skipped after code-only changes.
- Tightened app-update delivery bookkeeping so a release is only marked announced after the Discord send succeeds.
- Audited Discord notification routing and filters for market, craft, supplies, scheduled reports, app updates and test notifications.
- Limited low-supply Discord alerts to one successful post per 24 hours while supplies remain below the configured runway threshold.
- Reworked the Discord diagnostics panel into readable cards with delivery counts and event-type filtering.

## [0.8.42-beta.1] - 2026-06-02

### Fixed

- Fixed Discord poll and RSVP button clicks failing with `formatNumber is not defined`.
- Scoped Discord bot action/report output to each dashboard tab so results no longer appear under unrelated sections.
- Reworked the Custom Commands tab so commands are always listed there and existing commands can be selected for editing.

## [0.8.41-beta.1] - 2026-06-02

### Fixed

- Fixed the Discord bot Posts & Events form so Poll, RSVP and Embed title fields no longer mirror each other while typing.
- Fixed Discord poll and RSVP button responses to show readable option names and live vote counts instead of internal option keys.
- Updated Discord poll and RSVP messages after button votes so the visible message counts stay current.
- Made Discord warnings send a member DM and staff mod-log message while recording delivery diagnostics for failed sends.
- Updated Discord AutoMod rule creation to send mod-notes alerts and clarified that Discord exempts Administrator and Manage Server users.
- Added a configurable Discord mod-log channel and routed moderation warning logs and AutoMod alerts through it.

## [0.8.40-beta.1] - 2026-06-02

### Added

- Expanded the Discord bot dashboard with Safety Rules, Member Records, Posts & Events, and Custom Commands sections.
- Added Discord moderation records for warnings, mod notes, case logs, member profile lookups and temporary bans.
- Added Discord-native safety tools for keyword auto-moderation rules, slowmode, channel lockdown and nickname format reports.
- Added Discord-only community tools for polls, event RSVPs, clean embed posting and custom slash command responses.

## [0.8.39-beta.1] - 2026-06-02

### Added

- Added a Discord bot moderation section with member timeouts, timeout removal, kicks, bans, unbans, channel message purges and ban-list lookup.
- Added clearer Discord moderation result cards and audit-log reasons so actions are easier to verify.
- Made Discord bot post/update controls more visually obvious across the bot dashboard.

## [0.8.38-beta.1] - 2026-06-02

### Added

- Added a persisted collapsible sidebar mode that switches the main navigation to an icon-only rail for more page space.
- Updated the sidebar brand to use the monitored settlement name and refreshed the Discord CTA icon/text.

## [0.8.37-beta.1] - 2026-06-02

### Changed

- Updated the Overview treasury card to show today's recorded treasury income, spending and net movement instead of an unsupported treasury runway.
- Colour-coded the Overview supply run-out date by runway health and tightened Overview production wording.
- Matched the Overview attention card height to the adjacent settlement details card.

## [0.8.36-beta.1] - 2026-06-02

### Changed

- Reworked Discord role cleanup, channel checks and inactive member reports into readable dashboard views instead of raw JSON.
- Reworked the Discord bot Tools tab with clearer report cards, posting tools and readable report output.
- Reworked the Discord audit log tool result into a readable activity list instead of raw JSON.

## [0.8.35-beta.1] - 2026-06-02

### Added

- Added Discord Gateway presence support so the Timbersteel Trade bot can appear online with configurable status text.
- Added the `/help` Discord slash command with app and feature-request links.
- Added Discord role-panel management for citizen/member, profession, event and timezone self-assign roles with reusable post/update controls.
- Added Discord welcome-flow controls for welcome messages, rules acknowledgement and starter-role assignment.
- Added Discord bot tools for audit logs, inactive member checks, role cleanup, channel permission checks, announcements, pinned info updates and scheduled events.
- Reworked the Discord bot dashboard navigation into a grouped sidebar so future bot features remain easier to find.
- Split Discord role tools into a dedicated Roles category and added a Role Manager tab for creating Discord roles from the app.
- Added emoji presets to Discord role-panel options so profession buttons can be configured without manually typing emoji.
- Reworked Discord role-panel options into cleaner cards with a Discord-style preview and expandable edit controls.
- Fixed Discord role member counts so failed member-list syncs are shown as unavailable instead of misleadingly reporting zero members.
- Cleaned up Discord notification setting fields so dropdowns and numeric inputs have consistent full-width sizing.

## [0.8.34-beta.1] - 2026-06-02

### Changed

- General bug fixes.

## [0.8.33-beta.1] - 2026-06-02

### Changed

- General bug fixes.

## [0.8.32-beta.1] - 2026-06-02

### Changed

- Added huntable animals to the map resource finder and aligned map resource categories with the BC Codex category set.
- Compactly redesigned the Discord colour-role editor and made colour selector buttons use consistent neutral Discord styling with emoji colour markers.

## [0.8.31-beta.1] - 2026-06-02

### Added

- Added Discord colour-role management with a dedicated bot dashboard tab, editable bot-created colour roles, selector-channel configuration and a button message that enforces one colour role per user.

## [0.8.30-beta.1] - 2026-06-02

### Changed

- Cleaned up the dedicated Discord bot dashboard with tighter overview cards, compact section navigation, balanced setup/status panels, denser channel/role grids, a clearer notification-test page, a rebalanced notification rules page and a more deliberate diagnostics layout.
- Improved Discord role manageability labels so roles explain whether the bot can manage them, whether they are integration-managed, or whether the bot role needs moving higher in Discord.
- Fixed Discord discovery so the app fetches the bot's guild member record by bot user ID, allowing role hierarchy checks to detect the bot's highest role correctly.

## [0.8.29-beta.1] - 2026-06-02

### Added

- Added a BitJita-powered resource finder sidebar to the Map page, with resource search, tier/category filters, region selection and resource tracking through BitCraft Map `resourceId` URLs while retaining default online-player tracking.
- Changed the Map page region selector back to a compact dropdown and expanded the map workspace so more of the viewport is used for the map and resource finder.

## [0.8.28-beta.1] - 2026-06-02

### Changed

- Reworked the Discord bot dashboard for 1080p desktop displays with a horizontal category bar and cleaner notification rule groups, while keeping the compact narrow-screen layout readable.

## [0.8.27-beta.1] - 2026-06-02

### Added

- Added Discord server discovery from the configured bot token, including channels, roles, members, role counts and bot role manageability checks.
- Bot dashboard channel and craft-watch role settings now use discovered Discord dropdowns instead of manual ID entry.
- Added a discovered role directory showing role colours, member counts and whether the bot can manage each role.

## [0.8.26-beta.1] - 2026-06-02

### Changed

- Reworked the Discord Bot Control dashboard into sectioned categories for setup, notifications, channels, roles, tests and diagnostics.
- Removed the duplicate save button from the bot setup card so bot settings rely on the floating unsaved-changes save bar.

## [0.8.25-beta.1] - 2026-06-02

### Added

- Added a dedicated Discord Bot Control dashboard available from `/bot` and `bot.*` hostnames for bot setup, notification rules, channel routing, role watches, test messages and diagnostics.

### Changed

- Moved Discord bot settings out of the main Admin Console tab list and linked Admin to the dedicated bot dashboard.

## [0.8.24-beta.1] - 2026-06-02

### Changed

- Discord craft notifications now include the craft tier and use the tier colour as the embed accent when available.

## [0.8.23-beta.1] - 2026-06-02

### Changed

- Craft Watch Discord button replies now clarify that alerts always ping the configured role and the button only toggles whether the user has that role.

## [0.8.22-beta.1] - 2026-06-02

### Changed

- Craft Watch Discord button replies now explain that clicking Watch again removes the notification role.

## [0.8.21-beta.1] - 2026-06-02

### Changed

- Craft Watch Discord button failures now return a private diagnostic message instead of Discord's generic interaction failure.
- Craft Watch role add/remove attempts are now recorded in the Discord diagnostics log.

## [0.8.20-beta.1] - 2026-06-02

### Changed

- Craft notification Watch buttons now toggle configurable Discord profession roles instead of storing local watch/mute settings.
- Craft notifications now ping the configured profession role when a matching alert fires.
- Added configurable craft notification role IDs to the Discord admin settings.

## [0.8.19-beta.1] - 2026-06-02

### Changed

- Simplified the Structures page into a basic overview of structures, categories and tiers, removing slot summaries and API detail controls.
- Sidebar navigation items now use real page links so they can be opened in new tabs with middle-click or Ctrl-click.

## [0.8.18-beta.1] - 2026-06-02

### Changed

- Discord craft-start notifications now use a configurable minimum time-present delay instead of a progress percentage threshold, defaulting to five minutes.

## [0.8.17-beta.1] - 2026-06-02

### Added

- Added Discord craft-watch buttons to craft notifications so users can watch or mute profession alerts.
- Added `/craftwatch list` and `/craftwatch clear` slash commands for personal craft watch management.

## [0.8.16-beta.1] - 2026-06-02

### Added

- Added dedicated `/terms` and `/privacy` pages for Discord application submission, linked from the in-app Legal & Bot Terms and Privacy popups.

## [0.8.15-beta.1] - 2026-06-02

### Added

- Added in-app Legal & Bot Terms covering the optional Discord bot, community-app status, data source disclaimer, and bot usage expectations.
- Added Discord bot data processing notes to the Privacy & Analytics dialog and README.

## [0.8.14-beta.1] - 2026-06-01

### Fixed

- The embedded map URL is now persisted per browser and only changed by explicit map actions, preventing normal app refreshes from reloading the map and wiping map-side filters.

## [0.8.13-beta.1] - 2026-06-01

### Fixed

- Map focus from Public Craft Finder is now stored per browser and reflected in the page URL, so refreshing the Map page keeps the selected settlement/location.

## [0.8.12-beta.1] - 2026-06-01

### Changed

- App update Discord notifications now include the current release notes from the changelog directly in the embed.

## [0.8.11-beta.1] - 2026-06-01

### Fixed

- Discord craft notification filters now calculate production XP from the same BitJita fields as the Production page, including `totalActionsRequired` and `progress`.

## [0.8.10-beta.1] - 2026-06-01

### Fixed

- Reused production fallback keys now reset craft-start notification state when a completed craft becomes active again.

### Changed

- Discord diagnostics now include production poll rows showing active crafts returned by BitJita, baseline state and known craft counts.
- Scheduled supply reports no longer flood diagnostics with routine "not due yet" skips every polling cycle.

## [0.8.9-beta.1] - 2026-06-01

### Added

- Added an Admin > Discord diagnostics console that records sent, skipped and failed Discord notification attempts with routing, thresholds, allowed crafters, payload context and Discord response details.
- Discord test messages, app update checks and scheduled supply reports now write diagnostic records as well as live notifications.

## [0.8.8-beta.1] - 2026-06-01

### Fixed

- Craft Discord notifications no longer require the default notifications channel when routing to profession channels.
- Craft-start notifications are no longer marked as delivered when Discord sending is skipped.
- App update Discord notifications are now included in the generic notification enablement checks.
- Craft notification skips now record a visible Admin reason, including allowed-crafter mismatches or missing crafter names.

### Changed

- Craft notification defaults are now 40,000 total XP and 1% start progress.

## [0.8.7-beta.1] - 2026-06-01

### Fixed

- App update Discord notifications now use the configured Updates channel instead of always posting to the default notifications channel.

## [0.8.6-beta.1] - 2026-06-01

### Changed

- Craft-start Discord notifications are now only marked as delivered after Discord accepts the message, so permission failures can be retried.
- Admin now shows the latest Discord notification delivery status, including channel errors such as missing access.

## [0.8.5-beta.1] - 2026-06-01

### Added

- Added a floating Admin save prompt that appears when settings have unsaved changes, with Save and Revert actions.

## [0.8.4-beta.1] - 2026-06-01

### Changed

- Simplified Admin > Discord so the channel list is the single place to configure Discord channel IDs, including profession craft channels.
- Reworked Discord notification settings into grouped cards to reduce clutter.
- Replaced checkbox styling across the app with theme-matched toggle switches.

## [0.8.3-beta.1] - 2026-06-01

### Added

- Added a scheduled Discord supplies report, defaulting to every three days in the configured mod-notes channel.
- Added a named Discord channel list and dropdown-based routing for market, supply, app update, and craft notifications.

### Changed

- Admin > Discord is grouped around bot credentials, channel configuration, notification routing, craft channels, and test previews.

## [0.8.2-beta.1] - 2026-06-01

### Added

- Discord craft notifications now have separate start and completion toggles.
- Added configurable Discord craft notification filters for minimum total XP, minimum start progress, and allowed crafter usernames.
- Added configurable per-profession Discord channel routing for craft notifications, with Timbersteel's current craft channel IDs as defaults.

## [0.8.1-beta.1] - 2026-06-01

### Changed

- Low-supplies Discord notifications now use configurable supply runway days, defaulting to alerts below seven days of supplies.
- Supply-change activity metadata now includes calculated runway, daily upkeep, and run-out time for more accurate Discord alerts.

## [0.8.0-beta.1] - 2026-06-01

### Added

- Optional Discord bot integration with admin-managed settings, protected bot-token storage, test-message sending, and slash command registration.
- Discord slash commands for settlement supplies, online members, active crafts, and item price checks.
- Discord notifications for new listings, confirmed sales, craft starts, craft completions, and optional low-supplies changes.
- Server-side production job tracking so craft start/completion events can be recorded consistently.

## [0.7.9-beta.1] - 2026-06-01

### Changed

- Member Toolbelt cards now use the shared colour-coded rarity badge.

## [0.7.8-beta.1] - 2026-06-01

### Changed

- Price Finder suggestions now mirror BitJita's available-item market filtering by hiding output/input pseudo-items and items with no buy or sell orders.
- Item rarity is now displayed as a consistent colour-coded badge across market, inventory, price finder and member equipment views.

## [0.7.7-beta.1] - 2026-06-01

### Changed

- Gear preset slot labels now match in-game terminology: Heart, Jewellery, Head, Hands, Torso, Belt, Legs and Feet.

## [0.7.6-beta.1] - 2026-06-01

### Changed

- Gear presets now render a curated set of visible in-game equipment slots, including empty placeholders, while still hiding unused/internal server slots.

## [0.7.5-beta.1] - 2026-06-01

### Changed

- Gear preset cards now show only equipped items instead of rendering BitJita's empty placeholder slots as visible equipment slots.

## [0.7.4-beta.1] - 2026-06-01

### Changed

- Replaced the manual local settings profile dropdown with automatic browser-specific settings.
- Pinned overview items, filters, density and notification preferences now persist in local browser storage without requiring analytics cookie consent.
- Added a browser settings reset action for clearing local app preferences without touching admin settings or settlement data.

## [0.7.3-beta.1] - 2026-06-01

### Changed

- Production activity now uses BitJita craft contribution timestamps and only marks a craft active when it was worked in the last 30 seconds.
- Overview production counts now use the same 30-second active-craft rule.
- Market listing tracking now preserves BitJita's original listing timestamp when available.
- Storage activity summaries now include the container name directly in deposit/withdrawal text.
- Research now surfaces settlement tier, supply cap, tile cap, and researched workstation tier unlocks from claim technology data.
- Region now shows live region status alongside online player and trade-volume data.
- Professions now prefer BitJita skill metadata when available instead of relying only on local static skill groupings.
- Price Finder now shows a simple confidence label based on available completed-trade count.

## [0.7.2-beta.1] - 2026-06-01

### Added

- Added browser-local User Settings for display density, notification preferences, selected profile, and profile-specific pinned overview items.
- Added a clear-filters action to the Map page and persisted player map selections.

### Changed

- Overview supply runway now uses the settlement's max-supplies research cap for the progress bar while keeping the days/hours runway text.
- Construction now separates item and cargo requirements, labels required materials versus settlement storage availability, and avoids item/cargo ID collisions.
- Activity now sorts by parsed event timestamps and keeps timeline markers vertically centered.
- Member gear presets now show empty reported slots instead of hiding them.
- Inventory search placeholders now clearly identify item and container search.

### Fixed

- Price Finder suggestions now hide BitJita output/input pseudo-items that are not valid market items.
- Member table rows are vertically centered for cleaner roster readability.

## [0.7.1-beta.1] - 2026-05-27

### Added

- Member details now load BitJita equipment presets and show each available gear preset rather than only the currently equipped set.
- Added BitJita item thumbnails for member toolbelt tools, gear presets, inventory rows, production craft titles and price-finder suggestions, with text fallbacks when an icon is missing.
- Added a footer disclaimer for Clockwork Labs affiliation/trademark status and BitJita API data attribution.
- Member details now always show both gear preset slots, including an explicit not-reported state when BitJita does not return gear for a slot.
- Corrected gear preset mapping so the current equipment appears as Preset 1 and BitJita's saved alternate preset appears as Preset 2.
- Gear preset detection now compares actual equipped item slots instead of trusting BitJita's active flag, so members with differently flagged alternate presets still show Preset 2.
- The member gear "Current" marker now follows BitJita's active preset flag when the saved alternate preset is the selected one.

## [0.7.0-beta.1] - 2026-05-27

### Changed

- Replaced the external Plausible integration with opt-in first-party usage analytics stored in the application's SQLite database.
- Added a cookie notice requesting development-supporting analytics consent, with equally accessible decline and persistent preference controls.
- Added an Admin Analytics dashboard for visitor, session, page-view, engagement-time and feature-usage aggregates.

## [0.6.6-beta.1] - 2026-05-27

### Added

- Optional cookieless Plausible analytics configured from Admin, disabled until an administrator enables it with a Plausible per-site script URL.
- Manual, sanitized section page views and anonymous high-level feature events for Market, Price Finder, Production filtering, member details, Public Craft Finder and Activity controls.
- A Privacy & Analytics dialog accessible from the footer and help panel that discloses tracking state and excluded data.

## [0.6.5-beta.1] - 2026-05-27

### Changed

- Renamed the Production passive-craft history panel to Member Passive Crafts and clarified that the API identifies the member, but not the settlement location where the craft occurred.

## [0.6.4-beta.1] - 2026-05-27

### Changed

- Storage movements are now collected by the background server poller and persisted in Activity history rather than fetched from every browser viewing Activity.
- Activity loads its locally stored feed every 10 seconds; its member selector roster updates separately without blocking timeline display.
- Admin endpoint diagnostics now identify response times for each settlement storage container, with storage sync status visible in Collection Status.

## [0.6.3-beta.1] - 2026-05-27

### Changed

- Redesigned Activity as a summary and timeline view with event counts, clearer filters and category styling.
- Storage deposit and withdrawal entries now show the settlement container nickname when one is configured, falling back to its structure name.
- Added an Activity member selector for filtering attributed storage and market events by settlement member.

## [0.6.2-beta.1] - 2026-05-26

### Fixed

- Activity storage movements are now loaded from the monitored settlement's known storage structures rather than each member's global storage history.
- Storage activity excludes deployable containers such as carts, wagons, boats, ships and goats.

## [0.6.1-beta.1] - 2026-05-26

### Fixed

- Price Finder recent trades now display buyers returned by BitJita's live price-history payload under `buyerUsername`, while retaining support for `purchaserUsername`.

## [0.6.0-beta.1] - 2026-05-26

### Added

- Overview watchlist for core materials, Price Finder items, and production crafts.
- Notification inbox retaining recent market and production alerts, with links back to the relevant page.
- Keyboard quick navigation (`Ctrl+K` or `/`) for pages, Price Finder, and settlement members.
- Compact/comfortable data density control for repeat monitoring work.
- Shareable URL state for current pages, Market context and Public Craft Finder filters.

### Changed

- Background refreshes now show a discreet refresh state and highlight changed dashboard values without replacing loaded views.
- Initial loading uses dashboard-shaped skeletons, with short page/modal transitions and more responsive table/row hover states.
- Active production jobs now have animated effort progress cues and can be pinned to Overview.
- Table controls and headers remain accessible while reviewing longer data sets.

## [0.5.0-beta.1] - 2026-05-26

### Added

- Market `Price Finder` tab with smart item search against the BitJita catalogue.
- Region-selectable pricing analysis, defaulting to the monitored settlement region with options for all regions or a specific region.
- Completed-trade price summaries for the last 24 hours, 7 days, and 30 days, plus recent trade evidence and total volume.
- Suggested whole-gold listing price based on the most recent available BitJita completed-trade average.

### Changed

- Price Finder now provides a populated region dropdown rather than requiring users to enter region IDs.
- The last visited page and Market tab are restored after refreshing the app.

## [0.4.0-beta.1] - 2026-05-26

### Added

- Historical confirmed-sale importing for current members' completed orders at the monitored settlement market, using BitJita order claim identity and completed trade fills.
- Dedicated `market_trades` persistence keyed by BitJita trade ID, so imported history is retained without duplication across polling runs.

### Changed

- Market Analytics now uses authoritative completed trade records for orders proven to belong to the monitored settlement market rather than importing unrelated member sales.
- On first successful collection for a member, completed sell orders belonging to this market are backfilled; later verified tracked sales are retained in the same trade history.
- Admin status now reports retained confirmed trades separately from listing lifecycle events.

## [0.3.1-beta.1] - 2026-05-26

### Fixed

- Market collection now retrieves every listing page before reconciling closures, preventing listings beyond the first API page from being incorrectly marked removed.
- Market analytics now aggregate confirmed sales from retained database history, including when filtering by settlement member.
- Sale confirmation handles split fills of a listing instead of requiring one trade to cover the complete removed quantity, and does not reuse earlier fills for later drops.
- Snapshot writes are serialized and keep BitJita network requests outside the SQLite transaction.
- Region ranking collection now uses paginated, cached server-side enrichment with bounded detail lookups rather than repeated browser fan-out.

### Security

- Administrator-changing requests now require a same-origin session request token, and production rejects browser-submitted snapshots.
- Password hashing no longer blocks the Node event loop, and session lookup uses SHA-256 token hashes. Existing signed-in sessions expire after this update and administrators must sign in again.
- Admin status no longer exposes the host filesystem path of persistent storage.

### Changed

- Removed the obsolete legacy admin panel implementation.
- Added regression tests for market pagination, production snapshot protection, and administrator cross-origin request rejection.
- Added baseline security response headers to the Caddy deployment example.

## [0.3.0-beta.1] - 2026-05-26

### Added

- Operational admin console with status, endpoint diagnostics, configuration, theme, database, user, audit and backup tabs.
- Validated logo and favicon uploads stored in the persistent data directory; the logo appears in the dashboard identity and Overview, and the favicon updates the browser tab.
- Multiple administrator accounts, account activation controls, password resets and session invalidation tools.
- Audit records for administrative actions and recorded sign-in attempts.
- Filtered SQLite table browsing, CSV/JSON exports, server-side backup creation/download and snapshot retention cleanup.
- Configuration controls for default page, Public Craft Finder region, browser refresh interval, snapshot retention and toast notification categories.

### Security

- Added per-address and username login throttling after repeated failed sign-in attempts.
- Branding uploads are limited to authenticated administrators, supported image types and a 1 MB size cap.

## [0.2.0-beta.1] - 2026-05-26

### Added

- Tier badges across settlement views using the in-game tier colour palette, with translucent presentation in badges and the Professions heatmap.
- Production sorting by tier, XP, remaining effort, completion, and item name, with ascending and descending options.
- Member-based Production eligibility filtering from the Production page.
- Member profile sections for public Toolbelt profession tools and equipped gear.
- Tool power display for public Toolbelt tools and eligible Production jobs.
- Browser persistence for key filter and sort selections across refreshes.
- In-app toast notifications for new market listings, confirmed market sales, and settlement craft queue starts/completions.
- Sortable Public Crafts columns for craft, tier, settlement, requirement, effort, XP, and owner.
- Settlement-wide passive craft output history beneath active Production, aggregated from public member records.
- Floating help access on every page, including the current app version and direct documentation, changelog, bug-report, and feature-request links.
- Beta/work-in-progress notice in the global help panel.

### Changed

- Production eligibility now checks the selected member's public skill level and matching Toolbelt tool type.
- Production tool eligibility follows the one-tier allowance: a T1 tool can perform T2 crafts, T2 can perform T3 crafts, and so on; tool power determines effort contributed per action.
- Public Crafts defaults to all skills while retaining the monitored settlement region as the initial region filter.
- The Production member selector now lives on the Production page instead of the sidebar.
- Public Crafts has been moved from the Production page into its own `Public Craft Finder` navigation page.
- Supply runway on Overview now uses the API run-out timestamp and displays days and hours.
- Overview treasury information now presents the treasury balance and supply upkeep without treating supply upkeep as currency expenditure.
- Overview, Structures, Research, and Region have revised operational layouts with clearer summary hierarchy.
- Member details can be opened by clicking anywhere on the member row.
- Member passive crafts now resolve recipe placeholders to item names and present grouped recent output summaries; traveler tasks are labelled Quests without the redundant level column.
- Inventory core material cards now count finished stock only and filter the visible container contents when selected.
- The former Skills page is now Professions: its primary summaries and heatmap use API-classified professions, with Adventure skills displayed separately.
- Profession heatmap headings now use full horizontal labels with wider sortable columns for readability.
- Profession summary columns have dedicated header sizing to prevent sort controls overlapping their labels.
- The Professions heatmap no longer creates an unnecessary vertical scrollbar; it scrolls horizontally only when required by the wider columns.
- Profession table columns were compacted to fit standard 1080p desktop widths without a horizontal scrollbar.
- Region now explains that the Close Settlements panel lists settlements nearest to the monitored settlement.
- Research no longer presents an active/in-progress technology because settlement technology unlocks are instant.

### Fixed

- Profession tools were incorrectly read from equipped hand slots; they are now sourced from the public Toolbelt inventory returned by the BitJita API.
- Selected-member Production cards no longer flash into a pending Toolbelt-check state during each background refresh.
- Passive craft recipe templates now resolve numbered placeholders such as tanning recipes returned as `Tan {1}`.
