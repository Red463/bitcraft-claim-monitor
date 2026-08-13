# Native Map Tool Panels and Global Player Tracking Design

## Goal

Increase the usable native-map area by moving Player Tracking and Resource Finder into the map toolbar, redesign the Resource Finder for clearer scanning and selection, and allow users to track explicitly selected BitCraft players outside the monitored settlement without weakening the app's same-origin Relay, access-control, or live-position privacy boundaries.

At the measured `1146 x 912` desktop viewport, the current layout gives the map a `531 x 632` canvas because the Resource Finder reserves 320 pixels and Player Tracking consumes a separate 58-pixel row. Removing those permanent surfaces gives the map the full 861-pixel workspace width and recovers the player-row height. The expected visible map-area increase is approximately 80% at that viewport.

## Selected interaction model

The map has one toolbar containing, in order:

1. Layers
2. Biomes
3. Players
4. Resources

Only one tool panel may be open at a time. Opening another tool closes the current panel. Clicking the active trigger, its close action, the map outside the panel, or pressing Escape closes the panel. Escape restores focus to the trigger that opened it.

On desktop, each tool opens as a purpose-sized popover anchored beneath its toolbar trigger. The popover overlays the map and never changes the Leaflet viewport dimensions. Map pan and zoom remain available outside the open panel.

On narrow screens, the same panel content opens as an internally scrolling bottom sheet approximately two-thirds of the available map height. The map remains visible above the sheet. The sheet does not navigate away from the map or expose a second modal layer.

Desktop triggers show an icon, short label, and useful count where applicable, such as `Players · 2` or `Resources · 2`. At phone widths, the triggers may collapse visible labels to compact icons and counts, but retain full accessible names and tooltips.

The optional URL focus banner remains above the map. The workspace below it becomes one full-width map frame rather than a resource-panel/map grid.

## Resource Finder

The Resource Finder uses the approved balanced-explorer design in a desktop popover approximately 380 pixels wide, bounded by the available map viewport.

Its information hierarchy is:

1. Header with tracked count and close action.
2. Search field.
3. Compact Region, Tier, and Category filters.
4. Tracked-resource chips with individual removal and a clear action.
5. Scrollable result list.
6. Sticky footer with visible/total counts and `Show more` when required.

Each result is a dense, full-row toggle containing the game icon, full resource name, category, tier badge, and tracked state. Clicking anywhere on the row tracks or removes the typed resource identity. Long names truncate only where necessary and retain an accessible full label.

`All regions` remains a real multi-region tracking scope. Region, tier, category, search, selected resources, and bounded result-window behavior retain their current semantics. Typed resource identities remain lossless in URL state and persisted selection state.

The panel preserves usable last-good resource results while a new partition selection loads. Loading, partial, unavailable, and row-budget conditions are shown beside the affected selection without clearing unrelated usable points. The mobile bottom sheet uses the same data and actions with touch-sized controls and wrapped filters.

## Player Tracking panel

Player Tracking uses one complete panel rather than a quick panel followed by a second manager dialog.

The panel exposes three views:

- `Settlement`: the monitored claim roster and the default view.
- `All players`: bounded global BitCraft username search.
- `Tracked`: the combined selected settlement and external players.

The existing Auto, Online, All, and None presets remain available but affect settlement members only. They never add, remove, or alter explicitly tracked external players. External selections have individual removal plus a distinct `Clear external players` action.

The Settlement view searches the already loaded roster locally. Rows show selection state, online state, member status, stable marker colour, and whether a current live position exists.

The All players view requires a normalized query of at least three characters. It returns at most 20 results and never exposes a browsable unfiltered directory. A result shows the current username, online state, whether it is a monitored member, whether it is already tracked, and the stable marker colour it will use.

Online and offline external players may be selected. External selections persist locally across page reloads until removed. An offline selected player remains in the panel as `Offline — waiting for live position`; the map never renders or retains an offline last-known coordinate. When a current live position later becomes available, the marker appears automatically.

Persistence is keyed by the decimal-string player ID. A stored display label is only a temporary reload fallback; every successful directory or live-identity response replaces it with the current Relay username so player renames do not create a second identity.

The toolbar player count includes all selected identities. The panel summary separately reports online, settlement, and external counts. Stable marker colours continue to derive from lossless decimal-string player IDs and remain accessible through labels rather than colour alone.

## Global player directory service

Add a provider-neutral, server-owned endpoint:

```text
GET /api/local/map/players/search?q=<normalized username query>
```

The route:

- enforces the existing `page:map` access decision;
- rejects queries shorter than three normalized characters;
- caps results at 20;
- rate-limits repeated search requests;
- returns only decimal-string player ID, current username, monitored-member status, and current online state;
- never returns coordinates; and
- never logs result bodies or the resolved identity list.

The underlying bounded service uses the generated global `player_lowercase_username_state`, `player_username_state`, and current signed-in data behind the provider seam. The browser does not connect to Relay or receive Relay wire records. Exact or prefix matching must use indexed normalized username data; the service must not subscribe to or return the complete username table for each browser request.

The client debounces global searches, cancels or ignores stale responses, and displays loading, empty, unavailable, unauthorized, and rate-limited states inside the Player panel.

## External live-position service

External positions use a separate volatile global player-position session rather than broadening the current monitored-member regional session.

For the exact selected external player IDs, the server subscribes to the minimum verified global identity, signed-in, and `mobile_entity_state` rows. The total selected-player safety ceiling remains 250 across settlement and external identities. The service must canonicalize equivalent selections so clients share identical bounded sessions.

Before production enablement, live evidence must verify:

1. A global username entity ID directly matches the global mobile entity ID.
2. The global signed-in source removes or invalidates the position on logout.
3. Dividing mobile X and Z by exactly 1000 produces the existing static map coordinate space.
4. Only overworld dimension `1` is accepted.
5. Positions remain within the verified world bounds.
6. A position can be assigned to the correct verified world region without guessing.
7. Deselection, missing rows, deletion, disconnect, and schema mismatch remove the public marker immediately.

Until every gate passes, external live positions are explicitly unavailable while monitored-member tracking retains its current verified behavior. The implementation must not fall back to regional scanning or infer a location from stale state.

External player positions are independent of the Resource Finder's region filter and may appear anywhere in the verified world. The normalized public feature retains decimal-string IDs, current username, explicit map coordinates, region, dimension, observation time, and provider-neutral availability metadata.

Position updates remain event-driven. No polling loop, durable position history, or offline last-good player generation is introduced. Other valid selected players remain visible when one selected identity is unavailable.

## Authorization and privacy

Both search and live-position routes enforce `page:map` server-side. Existing renderer-mode behavior and map-page access rules remain authoritative.

The server accepts only bounded explicit player selections. It does not expose the global player directory, all online players, or unbounded mobile rows. Search rate limiting and minimum-query length prevent the UI from becoming a bulk enumeration endpoint.

Do not log coordinates, complete player selections, search response bodies, snapshot bodies, or full resolved identity sets. Do not persist external player coordinates in SQLite, browser storage, diagnostics, analytics, or history. Browser persistence contains only the explicit tracked player identity and display label needed to restore the selection.

Schema mismatch, disconnect, logout, exclusion, deselection, or absence from the current complete live generation removes the coordinate. Static map layers may independently retain last-good data.

## Component boundaries

Extract focused components instead of adding more UI responsibility to `MapPage.tsx` or renderer responsibility to `NativeMap.tsx`:

- `MapToolDock` owns the exclusive active-tool state, trigger semantics, anchored desktop placement, mobile bottom-sheet placement, outside-click behavior, and focus restoration.
- `MapResourceFinderPanel` owns Resource Finder presentation and delegates existing selection/filter actions to `MapPage`.
- `MapPlayerTrackingPanel` owns settlement presets, roster filtering, global search presentation, external selections, and combined tracked presentation.
- A small global-player search client/state helper owns debouncing, stale-response fencing, and provider-neutral response validation.

`MapPage` continues to own roster/catalog loading, resource and player selection state, URL persistence, and callbacks. `NativeMap` continues to own Leaflet lifecycle, layer visibility, biome highlighting, renderer status, markers, and map data requests.

`NativeMap` receives Players and Resources tool descriptors/content from `MapPage`, combines them with its Layers and Biomes descriptors, and renders the shared controlled `MapToolDock`. Layers and Biomes move from private open state to the same controlled active-tool state; their map-specific data remains inside `NativeMap`.

## Accessibility and responsive behavior

The tool row has an accessible toolbar label. Every trigger exposes `aria-expanded`, `aria-controls`, a full accessible name, and the relevant count. Panels have unique IDs and labelled headings.

Opening a panel moves focus to its heading or primary search control. Escape closes the panel and returns focus to its trigger. Keyboard users can traverse every filter, result, member, and action. Resource and player rows expose full text and checked/tracked state without relying on colour.

Panel overflow is internal and viewport-bounded. The page never requires scrolling to find an open tool. Mobile controls meet existing touch-target expectations. Reduced-motion settings remain respected by player marker pulses.

## Error and freshness behavior

Tool errors remain local to the affected panel. A player-search failure does not hide the map or settlement roster. A resource-partition failure does not clear unrelated loaded resources. A global external-position failure does not remove verified monitored-member positions.

Panels distinguish initial loading, partial results, stale static data, live unavailable data, empty search results, invalid queries, authorization failures, rate limiting, and schema incompatibility. Player positions never use stale freshness; external identities may remain selected while their position is unavailable.

The existing visibility pause remains: dense refresh and rendering pause while the page is hidden, then reconnect and fetch the latest generation when visible again.

## Testing and acceptance

Automated coverage includes:

- exclusive tool opening, outside click, Escape, focus entry, and trigger focus restoration;
- full-width desktop workspace and bottom-sheet mobile boundaries;
- Layers and Biomes retaining their current behavior under controlled open state;
- resource search/filter/selection persistence, typed identities, result-window expansion, and loading transitions;
- settlement-only preset semantics and external-selection persistence;
- global username search normalization, minimum length, bounded results, current names, 64-bit IDs, authorization, rate limiting, and stale-response fencing;
- direct global username/mobile identity, `/1000` conversion, dimension and bounds filtering, verified region assignment, and complete-generation behavior;
- logout, delete, deselection, exclusion, disconnect, and schema-mismatch removal with no offline last-good coordinate;
- aggregate player caps and canonical shared scopes;
- stable accessible marker colours across member and external players;
- privacy assertions proving coordinates and complete selections never enter logs, browser persistence, diagnostics, or history; and
- native mode making no iframe, third-party tile, or direct Relay browser request.

Browser acceptance covers the desktop anchored Resource and Player panels, phone bottom sheets, map pan/zoom outside overlays, selection persistence across reload, an offline external player becoming live, and clean console/network behavior on the smoke server.

## Out of scope

- Player trails or position history.
- Persisting offline last-known coordinates.
- Showing every online player without explicit selection.
- Browser-direct Relay subscriptions.
- Region-by-region player discovery as a fallback for an unverified global source.
- Admin-assigned marker colours.
- Redesigning the map status/freshness panel beyond any positioning needed to avoid tool collisions.
- Changing resource subscription semantics, resource rendering budgets, terrain, roads, or other map layers.
