# Navigation and Route Naming Design

## Goal

Make the main navigation reflect the configured settlement and use clearer page names, while moving the Production and Region pages to matching canonical URLs without breaking saved legacy links.

## Navigation Labels

- The navigation group currently labelled `Settlement` displays the monitored claim name from normalized configured claim data.
- While claim data is unavailable or has no usable name, the group falls back to `Settlement`.
- The `Settlement Market` navigation item becomes `Local Market`.
- The `Production` navigation item becomes `Craft Monitor`.
- The Region navigation item remains labelled `Region`.

The dynamic group label is a render-time presentation value. The stable group ID remains `settlement` so persisted collapsed/open state continues to work when the configured settlement changes.

## Page Headings

- The Local Market page heading is `<claim name> Market`.
- If the claim name is unavailable, the market page heading is `Settlement Market`.
- The Production page heading becomes `Craft Monitor`.
- Genuine production terminology within the page remains unchanged where it describes production jobs, metrics, controls, notifications, or API data.

## Canonical Routes and Compatibility

- `?page=craft-monitor` is the canonical Craft Monitor route.
- `?page=region` is the canonical Region route.
- Legacy `?page=production` URLs resolve to Craft Monitor and are rewritten to `?page=craft-monitor`.
- Legacy `?page=empire` URLs resolve to Region and are rewritten to `?page=region`.
- Canonicalization uses history replacement so compatibility redirects do not add duplicate browser-history entries.
- Persisted legacy active-page values are migrated to their canonical equivalents when the app loads.

All page-route consumers use the canonical IDs, including the navigation model, active-panel type, page panel registry, access-control page targets, popup targeting, route help, page-aware BitJita loading, and route-related tests.

Empire remains the correct domain term for empire APIs, empire membership, empire data models, and the separate Empires page. Production remains the correct domain term for production data, styles, storage preferences, notification settings, analytics events, and implementation symbols.

## Access and Saved Configuration

Existing access-control rules and app popups that target the legacy page IDs must continue to apply after the rename. Normalization migrates legacy `page:production` and `page:empire` access targets, plus legacy popup page values, to their canonical equivalents rather than silently dropping administrator configuration.

## Verification

- Add focused tests for navigation labels, canonical route IDs, legacy URL replacement, persisted-page migration, and legacy configuration migration.
- Run the relevant navigation, access-control, popup, and BitJita page-loading tests during development.
- Run the full frontend build and test suite after implementation.
- Browser-smoke the sidebar, Local Market heading, Craft Monitor route, Region route, and legacy redirects at the stable local smoke URL.

## Out of Scope

- Renaming production APIs, production-domain utilities, CSS classes, analytics event names, or persisted production filters.
- Renaming empire APIs, database tables, membership features, domain models, or the separate Empires page.
- Visual restyling of the navigation or affected pages.
