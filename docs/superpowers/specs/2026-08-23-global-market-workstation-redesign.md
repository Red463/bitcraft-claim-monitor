# Global Market Workstation Redesign

## Goal

Turn the global Market page into a coherent, decision-first workstation for finding items, evaluating opportunities, and monitoring saved items. The settlement/local-market page remains unchanged.

## Scope

This redesign covers the global Market route and its Overview, Browse, Deals, Buy Orders, Deal Watch, and Stalls workspaces. It preserves the existing Relay-backed APIs and provider-neutral data contracts. It does not add backend storage, database migrations, dependencies, or new market semantics.

## Information Architecture

The primary navigation becomes:

1. **Overview** — a personal market briefing and the default entry point.
2. **Browse** — catalog discovery, item order books, and locally observed price history.
3. **Opportunities** — arbitrage routes and premium buy-order demand in one workspace.
4. **Saved** — browser-local favorites and account-backed alert watches in one workspace.
5. **Stalls** — barter stall discovery and offer details.

Legacy query-string tabs remain accepted and redirect to their new canonical workspace. `deals` and `buy-orders` resolve to Opportunities; `deal-watch` resolves to Saved. Existing access targets continue to control the underlying content, so a user only sees sections they are authorized to use.

## Shared Market Toolbar

The page header contains the title, concise purpose, a single authoritative region selector, a compact freshness indicator, and primary workspace navigation. The decorative region pill is removed. The toolbar remains visible while users scroll on wider layouts and collapses cleanly on mobile.

The selected region applies consistently to Overview, Browse, Saved defaults, and Stalls. Opportunities may enter an explicit multi-region comparison state without silently changing the shared region. When comparison is active, the interface labels it clearly.

Technical Relay methodology is removed from the permanent footer and exposed through concise contextual help. Freshness copy is human-readable, such as `Updated 2m ago`, while detailed warnings remain visible when data is stale or unavailable.

## Overview

Overview prioritizes decisions rather than raw activity:

- Saved items with current best buy, best sell, spread, and order depth.
- Best current arbitrage opportunities.
- Market pulse containing movers and liquidity when sufficient data exists.
- Watch status or alert-oriented guidance when the user has no saved items.

Recent open orders and active order hubs are removed from the primary Overview. Empty data-dependent modules do not occupy large dashboard cards; they collapse to concise explanatory states.

## Browse

Browse retains catalog search and filters but makes the result-to-detail transition explicit.

- Filters use one availability selector: `Any`, `For sale`, `Wanted`, or `Both`.
- A `Clear filters` action appears whenever filters are active.
- The catalog exposes sortable market signals: lowest sell, highest buy, spread, order count, and liquidity when supplied by the existing API.
- Desktop uses a results/detail workflow that preserves search context; compact layouts use a visible `Back to results` action.
- Selecting an item preserves filters and catalog position.

Item detail presents three primary metrics—best sell, best buy, and spread—followed by compact secondary depth and order counts. Best locations are shown when available. Actions include Save, Watch when authorized, and map access for located orders.

The price-history visualization becomes an accessible SVG time-series chart with visible axes, start/end labels, high/low context, keyboard-focusable points, and an accessible summary. It uses existing locally observed history only and never implies complete global sales coverage.

## Opportunities

Opportunities unifies two complementary decision modes:

- **Arbitrage routes** from the existing Deals workspace.
- **High-value demand** from the existing Buy Order Finder and its premium-to-history analysis.

The modes use a secondary segmented control rather than separate top-level workspaces. Arbitrage filters support minimum quantity, profit percentage, and comparison regions. Summary values emphasize matching opportunities, unit profit, and route potential. Redundant `Available`, `Wanted`, and `Max trade` columns become one compact trade-depth presentation while preserving sortable values needed to understand a route.

High-value demand retains global search, sorting, opportunity confidence copy, and pagination. Its five equal metric cards are reduced to the most decision-relevant values, with secondary counts shown compactly.

## Saved

Saved combines favorites and Deal Watch without changing their storage models:

- Favorites remain browser-local.
- Deal watches remain authenticated, account-backed alert records.
- A saved item can be inspected in Browse and, when signed in, configured with an alert threshold.
- Signed-out users receive one explanatory state and one Discord sign-in action.
- Existing watch rows retain enable, threshold, last-checked, last-alert, and remove actions.

This design does not silently migrate browser favorites into user accounts.

## Stalls

Stalls remains a dedicated workspace because barter offers have a distinct mental model. Search, active-only filtering, pagination, map actions, and the viewport-fixed offer dialog remain. The dialog adds focus management: initial focus, focus containment, Escape close, and focus restoration.

## Visual System

The market page uses fewer nested bordered cards and a clearer hierarchy:

- One main workspace surface with separators for secondary sections.
- Gold for selection, green for profitable outcomes, and a distinct cool accent for buy-side demand.
- Primary values use stronger type; ordinary operational text is at least 12px and table text targets 13px.
- Repeated decorative metric icons are reduced.
- Filters and tables preserve the dense operational-dashboard character.
- Active rows, keyboard focus, loading, empty, stale, and error states are visually distinct.

Mobile navigation does not rely on an unexplained clipped tab row. It uses an affordance that visibly supports horizontal navigation, while tables retain labeled horizontal scrolling where necessary.

## Accessibility

- Primary and secondary tabs expose tab/panel relationships and arrow-key navigation.
- Catalog suggestions support combobox keyboard navigation, active option semantics, Escape close, and Enter selection.
- Charts provide visible labels and keyboard-accessible values.
- Icon-only map actions retain accessible names.
- The stall dialog traps focus and restores it after close.
- Focus indicators remain visible against the dark theme.

## State and Compatibility

Existing bookmarked item URLs and legacy Market tab aliases continue to work. The default canonical global Market route becomes Overview. Browse query filters stay encoded in the URL. Opportunity mode, Saved, and Stalls maintain their existing local state unless a canonical tab mapping is required.

No API route, Relay normalization, SQLite schema, Discord delivery behavior, or admin permission rule changes as part of this redesign.

## Testing

Focused tests cover:

- Canonical routing from legacy tabs to the new workspaces and Overview default.
- Availability-filter mapping and filter reset behavior.
- Opportunity workspace mode and access-aware rendering.
- Accessible chart geometry and empty data behavior.
- Combobox keyboard selection.
- Stall dialog focus helpers where practical.

Verification runs the maintained app build and full test suite. A browser smoke pass checks Overview, Browse item selection/back behavior, Opportunities modes, Saved signed-out state, Stalls dialog, responsive layout, and console errors.

## Non-goals

- Redesigning the settlement/local-market page.
- Adding server APIs, migrations, or a new charting dependency.
- Treating locally observed confirmed trades as complete global history.
- Changing Discord notification delivery semantics.
- Replacing the app-wide styling system.
