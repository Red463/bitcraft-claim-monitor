# Changelog

## 0.7.1-beta.1 - 2026-05-27

### Added

- Member details now load BitJita equipment presets and show each available gear preset rather than only the currently equipped set.
- Added BitJita item thumbnails for member toolbelt tools, gear presets, inventory rows, production craft titles and price-finder suggestions, with text fallbacks when an icon is missing.
- Added a footer disclaimer for Clockwork Labs affiliation/trademark status and BitJita API data attribution.
- Member details now always show both gear preset slots, including an explicit not-reported state when BitJita does not return gear for a slot.
- Corrected gear preset mapping so the current equipment appears as Preset 1 and BitJita's saved alternate preset appears as Preset 2.
- Gear preset detection now compares actual equipped item slots instead of trusting BitJita's active flag, so members with differently flagged alternate presets still show Preset 2.
- The member gear "Current" marker now follows BitJita's active preset flag when the saved alternate preset is the selected one.

## 0.7.0-beta.1 - 2026-05-27

### Changed

- Replaced the external Plausible integration with opt-in first-party usage analytics stored in the application's SQLite database.
- Added a cookie notice requesting development-supporting analytics consent, with equally accessible decline and persistent preference controls.
- Added an Admin Analytics dashboard for visitor, session, page-view, engagement-time and feature-usage aggregates.

## 0.6.6-beta.1 - 2026-05-27

### Added

- Optional cookieless Plausible analytics configured from Admin, disabled until an administrator enables it with a Plausible per-site script URL.
- Manual, sanitized section page views and anonymous high-level feature events for Market, Price Finder, Production filtering, member details, Public Craft Finder and Activity controls.
- A Privacy & Analytics dialog accessible from the footer and help panel that discloses tracking state and excluded data.

## 0.6.5-beta.1 - 2026-05-27

### Changed

- Renamed the Production passive-craft history panel to Member Passive Crafts and clarified that the API identifies the member, but not the settlement location where the craft occurred.

## 0.6.4-beta.1 - 2026-05-27

### Changed

- Storage movements are now collected by the background server poller and persisted in Activity history rather than fetched from every browser viewing Activity.
- Activity loads its locally stored feed every 10 seconds; its member selector roster updates separately without blocking timeline display.
- Admin endpoint diagnostics now identify response times for each settlement storage container, with storage sync status visible in Collection Status.

## 0.6.3-beta.1 - 2026-05-27

### Changed

- Redesigned Activity as a summary and timeline view with event counts, clearer filters and category styling.
- Storage deposit and withdrawal entries now show the settlement container nickname when one is configured, falling back to its structure name.
- Added an Activity member selector for filtering attributed storage and market events by settlement member.

## 0.6.2-beta.1 - 2026-05-26

### Fixed

- Activity storage movements are now loaded from the monitored settlement's known storage structures rather than each member's global storage history.
- Storage activity excludes deployable containers such as carts, wagons, boats, ships and goats.

## 0.6.1-beta.1 - 2026-05-26

### Fixed

- Price Finder recent trades now display buyers returned by BitJita's live price-history payload under `buyerUsername`, while retaining support for `purchaserUsername`.

## 0.6.0-beta.1 - 2026-05-26

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

## 0.5.0-beta.1 - 2026-05-26

### Added

- Market `Price Finder` tab with smart item search against the BitJita catalogue.
- Region-selectable pricing analysis, defaulting to the monitored settlement region with options for all regions or a specific region.
- Completed-trade price summaries for the last 24 hours, 7 days, and 30 days, plus recent trade evidence and total volume.
- Suggested whole-gold listing price based on the most recent available BitJita completed-trade average.

### Changed

- Price Finder now provides a populated region dropdown rather than requiring users to enter region IDs.
- The last visited page and Market tab are restored after refreshing the app.

## 0.4.0-beta.1 - 2026-05-26

### Added

- Historical confirmed-sale importing for current members' completed orders at the monitored settlement market, using BitJita order claim identity and completed trade fills.
- Dedicated `market_trades` persistence keyed by BitJita trade ID, so imported history is retained without duplication across polling runs.

### Changed

- Market Analytics now uses authoritative completed trade records for orders proven to belong to the monitored settlement market rather than importing unrelated member sales.
- On first successful collection for a member, completed sell orders belonging to this market are backfilled; later verified tracked sales are retained in the same trade history.
- Admin status now reports retained confirmed trades separately from listing lifecycle events.

## 0.3.1-beta.1 - 2026-05-26

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

### Maintenance

- Removed the obsolete legacy admin panel implementation.
- Added regression tests for market pagination, production snapshot protection, and administrator cross-origin request rejection.
- Added baseline security response headers to the Caddy deployment example.

## 0.3.0-beta.1 - 2026-05-26

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

## 0.2.0-beta.1 - 2026-05-26

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
