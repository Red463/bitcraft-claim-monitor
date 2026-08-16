# Tracked Resource Pill Marker Colours

## Goal

Make each tracked resource pill use the same stable colour as that resource's marker on the native map. The treatment must remain readable in the dark resource finder and must not introduce a second colour-allocation path.

## Design

`MapPage` already creates the final `selectedResourceColours` map used by the resource canvas. It will pass that same map to `MapResourceFinderPanel`. The panel will resolve a tracked resource token to its numeric resource ID and look up the final colour by that ID.

Each resolved pill will expose the colour through pill-scoped CSS variables. The existing pill shape and removal interaction remain unchanged. CSS will use the marker colour for the border and text/icon, plus a low-opacity tinted background. Hover and focus will strengthen the tint while preserving the existing keyboard focus treatment.

The panel will not recalculate tier or tierless colours. This guarantees that catalog-wide tierless allocation, ordinary tier allocation, and future marker-colour changes stay identical between the canvas and the tracked list.

## Fallbacks

- Unknown tokens, enemies, or resources without an allocated marker colour retain the current gold pill appearance.
- Malformed tokens are not coerced to JavaScript numbers.
- The colour map remains derived state; it is not persisted separately.

## Scope

This change affects only tracked resource pills in the resource finder. Result rows, resource markers, selection limits, Relay requests, and persisted tracked selections are unchanged.

## Verification

- A focused component boundary test will prove that `MapPage` passes the existing final colour map to the finder.
- A focused finder test will prove that a typed `resource:<id>` pill receives the mapped colour and that an unmapped token retains the fallback.
- The production frontend build will verify the React and CSS integration.
- A visual browser smoke check will confirm the border, text/icon, tint, hover/focus readability, and exact correspondence with visible map markers.
