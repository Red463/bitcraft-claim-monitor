# Native Map Panel Polish and Global Region Filter Design

## Goal

Polish the native map tool panels and move region selection into the map toolbar so the map has one clear, persistent region scope.

## Toolbar and region scope

A compact Region select will appear directly after the existing Layers, Biomes, Players, and Resources buttons. It will use the same height, border, background, typography, focus treatment, and responsive density as those buttons. Its visible value will be `All regions` or the selected Relay region label.

The selector is the single map-region scope. Choosing a region filters every region-scoped map source, including claims, claim areas, roads, watchtowers, terrain detail, resources, and later region-scoped layers. `All regions` restores the complete configured world scope. Tracked player positions remain independent of this filter so a tracked player does not disappear merely by crossing a region boundary.

The existing persisted `map.regions` preference remains authoritative. No migration is required. Invalid or no-longer-ready stored regions fall back to `All regions` rather than producing an empty map.

## Resource Finder

The Region field will be removed from the Resource Finder. Tier and Category remain inside the panel in a balanced two-column row, collapsing cleanly on narrow screens.

The resource panel itself will not scroll on desktop. Search, filters, tracked chips, messages, and the footer remain fixed within the panel; only the result list receives vertical overflow. On mobile, the viewport-bounded bottom sheet may scroll only when the available screen height cannot contain the panel, while the result list remains the primary scrolling surface.

## Player rows

Settlement player rows will use explicit columns for the selection toggle, player name/status, and marker colour. The colour dot will be positioned after the toggle and outside its visual footprint, with enough separation and stacking to remain visible in checked and unchecked states. This changes presentation only; selection and stable-colour behavior remain unchanged.

## Panel close controls

Every map tool panel will share one close-button treatment: a 28-by-28-pixel transparent icon control, a correctly centred 15-pixel X, muted neutral colour at rest, and a higher-contrast hover/focus state. It will not inherit the oversized filled global icon-button appearance.

## Accessibility and responsive behavior

The Region select retains a visible accessible name and keyboard-native select behavior. Existing tool-panel Escape handling and focus restoration remain unchanged. All controls retain visible focus outlines and minimum mobile touch spacing.

## Verification

- Boundary tests will prove Region is outside the Resource Finder and drives the native map's region-scoped request inputs.
- CSS boundary tests will lock the player-row columns, close-button sizing, and single-scroll-region behavior.
- The production build will run.
- The running smoke map will be checked at desktop and mobile widths for toolbar fit, region filtering, player-dot visibility, panel close controls, and resource scrolling.

## Out of scope

This change does not alter Relay subscriptions, region discovery, resource identities, player-coordinate collection, terrain generation, or the failed global-player coordinate gate.
