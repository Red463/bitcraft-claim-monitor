# Changelog

## 0.8.25-beta.1 - 2026-06-02

### Added

- Added a dedicated Discord Bot Control dashboard available from `/bot` and `bot.*` hostnames for bot setup, notification rules, channel routing, role watches, test messages and diagnostics.

### Changed

- Moved Discord bot settings out of the main Admin Console tab list and linked Admin to the dedicated bot dashboard.

## 0.8.24-beta.1 - 2026-06-02

### Changed

- Discord craft notifications now include the craft tier and use the tier colour as the embed accent when available.

## 0.8.23-beta.1 - 2026-06-02

### Changed

- Craft Watch Discord button replies now clarify that alerts always ping the configured role and the button only toggles whether the user has that role.

## 0.8.22-beta.1 - 2026-06-02

### Changed

- Craft Watch Discord button replies now explain that clicking Watch again removes the notification role.

## 0.8.21-beta.1 - 2026-06-02

### Changed

- Craft Watch Discord button failures now return a private diagnostic message instead of Discord's generic interaction failure.
- Craft Watch role add/remove attempts are now recorded in the Discord diagnostics log.

## 0.8.20-beta.1 - 2026-06-02

### Changed

- Craft notification Watch buttons now toggle configurable Discord profession roles instead of storing local watch/mute settings.
- Craft notifications now ping the configured profession role when a matching alert fires.
- Added configurable craft notification role IDs to the Discord admin settings.

## 0.8.19-beta.1 - 2026-06-02

### Changed

- Simplified the Structures page into a basic overview of structures, categories and tiers, removing slot summaries and API detail controls.
- Sidebar navigation items now use real page links so they can be opened in new tabs with middle-click or Ctrl-click.

## 0.8.18-beta.1 - 2026-06-02

### Changed

- Discord craft-start notifications now use a configurable minimum time-present delay instead of a progress percentage threshold, defaulting to five minutes.

## 0.8.17-beta.1 - 2026-06-02

### Added

- Added Discord craft-watch buttons to craft notifications so users can watch or mute profession alerts.
- Added `/craftwatch list` and `/craftwatch clear` slash commands for personal craft watch management.

## 0.8.16-beta.1 - 2026-06-02

### Added

- Added dedicated `/terms` and `/privacy` pages for Discord application submission, linked from the in-app Legal & Bot Terms and Privacy popups.

## 0.8.15-beta.1 - 2026-06-02

### Added

- Added in-app Legal & Bot Terms covering the optional Discord bot, community-app status, data source disclaimer, and bot usage expectations.
- Added Discord bot data processing notes to the Privacy & Analytics dialog and README.

## 0.8.14-beta.1 - 2026-06-01

### Fixed

- The embedded map URL is now persisted per browser and only changed by explicit map actions, preventing normal app refreshes from reloading the map and wiping map-side filters.

## 0.8.13-beta.1 - 2026-06-01

### Fixed

- Map focus from Public Craft Finder is now stored per browser and reflected in the page URL, so refreshing the Map page keeps the selected settlement/location.

## 0.8.12-beta.1 - 2026-06-01

### Changed

- App update Discord notifications now include the current release notes from the changelog directly in the embed.

## 0.8.11-beta.1 - 2026-06-01

### Fixed

- Discord craft notification filters now calculate production XP from the same BitJita fields as the Production page, including `totalActionsRequired` and `progress`.

## 0.8.10-beta.1 - 2026-06-01

### Fixed

- Reused production fallback keys now reset craft-start notification state when a completed craft becomes active again.

### Changed

- Discord diagnostics now include production poll rows showing active crafts returned by BitJita, baseline state and known craft counts.
- Scheduled supply reports no longer flood diagnostics with routine "not due yet" skips every polling cycle.

## 0.8.9-beta.1 - 2026-06-01

### Added

- Added an Admin > Discord diagnostics console that records sent, skipped and failed Discord notification attempts with routing, thresholds, allowed crafters, payload context and Discord response details.
- Discord test messages, app update checks and scheduled supply reports now write diagnostic records as well as live notifications.

## 0.8.8-beta.1 - 2026-06-01

### Fixed

- Craft Discord notifications no longer require the default notifications channel when routing to profession channels.
- Craft-start notifications are no longer marked as delivered when Discord sending is skipped.
- App update Discord notifications are now included in the generic notification enablement checks.
- Craft notification skips now record a visible Admin reason, including allowed-crafter mismatches or missing crafter names.

### Changed

- Craft notification defaults are now 40,000 total XP and 1% start progress.

## 0.8.7-beta.1 - 2026-06-01

### Fixed

- App update Discord notifications now use the configured Updates channel instead of always posting to the default notifications channel.

## 0.8.6-beta.1 - 2026-06-01

### Changed

- Craft-start Discord notifications are now only marked as delivered after Discord accepts the message, so permission failures can be retried.
- Admin now shows the latest Discord notification delivery status, including channel errors such as missing access.

## 0.8.5-beta.1 - 2026-06-01

### Added

- Added a floating Admin save prompt that appears when settings have unsaved changes, with Save and Revert actions.

## 0.8.4-beta.1 - 2026-06-01

### Changed

- Simplified Admin > Discord so the channel list is the single place to configure Discord channel IDs, including profession craft channels.
- Reworked Discord notification settings into grouped cards to reduce clutter.
- Replaced checkbox styling across the app with theme-matched toggle switches.

## 0.8.3-beta.1 - 2026-06-01

### Added

- Added a scheduled Discord supplies report, defaulting to every three days in the configured mod-notes channel.
- Added a named Discord channel list and dropdown-based routing for market, supply, app update, and craft notifications.

### Changed

- Admin > Discord is grouped around bot credentials, channel configuration, notification routing, craft channels, and test previews.

## 0.8.2-beta.1 - 2026-06-01

### Added

- Discord craft notifications now have separate start and completion toggles.
- Added configurable Discord craft notification filters for minimum total XP, minimum start progress, and allowed crafter usernames.
- Added configurable per-profession Discord channel routing for craft notifications, with Timbersteel's current craft channel IDs as defaults.

## 0.8.1-beta.1 - 2026-06-01

### Changed

- Low-supplies Discord notifications now use configurable supply runway days, defaulting to alerts below seven days of supplies.
- Supply-change activity metadata now includes calculated runway, daily upkeep, and run-out time for more accurate Discord alerts.

## 0.8.0-beta.1 - 2026-06-01

### Added

- Optional Discord bot integration with admin-managed settings, protected bot-token storage, test-message sending, and slash command registration.
- Discord slash commands for settlement supplies, online members, active crafts, and item price checks.
- Discord notifications for new listings, confirmed sales, craft starts, craft completions, and optional low-supplies changes.
- Server-side production job tracking so craft start/completion events can be recorded consistently.

## 0.7.9-beta.1 - 2026-06-01

### Changed

- Member Toolbelt cards now use the shared colour-coded rarity badge.

## 0.7.8-beta.1 - 2026-06-01

### Changed

- Price Finder suggestions now mirror BitJita's available-item market filtering by hiding output/input pseudo-items and items with no buy or sell orders.
- Item rarity is now displayed as a consistent colour-coded badge across market, inventory, price finder and member equipment views.

## 0.7.7-beta.1 - 2026-06-01

### Changed

- Gear preset slot labels now match in-game terminology: Heart, Jewellery, Head, Hands, Torso, Belt, Legs and Feet.

## 0.7.6-beta.1 - 2026-06-01

### Changed

- Gear presets now render a curated set of visible in-game equipment slots, including empty placeholders, while still hiding unused/internal server slots.

## 0.7.5-beta.1 - 2026-06-01

### Changed

- Gear preset cards now show only equipped items instead of rendering BitJita's empty placeholder slots as visible equipment slots.

## 0.7.4-beta.1 - 2026-06-01

### Changed

- Replaced the manual local settings profile dropdown with automatic browser-specific settings.
- Pinned overview items, filters, density and notification preferences now persist in local browser storage without requiring analytics cookie consent.
- Added a browser settings reset action for clearing local app preferences without touching admin settings or settlement data.

## 0.7.3-beta.1 - 2026-06-01

### Changed

- Production activity now uses BitJita craft contribution timestamps and only marks a craft active when it was worked in the last 30 seconds.
- Overview production counts now use the same 30-second active-craft rule.
- Market listing tracking now preserves BitJita's original listing timestamp when available.
- Storage activity summaries now include the container name directly in deposit/withdrawal text.
- Research now surfaces settlement tier, supply cap, tile cap, and researched workstation tier unlocks from claim technology data.
- Region now shows live region status alongside online player and trade-volume data.
- Professions now prefer BitJita skill metadata when available instead of relying only on local static skill groupings.
- Price Finder now shows a simple confidence label based on available completed-trade count.

## 0.7.2-beta.1 - 2026-06-01

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
