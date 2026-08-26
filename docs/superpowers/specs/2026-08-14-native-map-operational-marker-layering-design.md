# Native Map Operational Marker Layering Design

**Date:** 2026-08-14  
**Status:** Approved design

## Goal

Keep claims, watchtowers, other operational map icons, player markers, and their tooltips readable when dense resource nodes cover the same area.

## Root cause

The native map currently places the resource canvas in a custom pane at z-index `650`. Leaflet's default marker pane is `600`, so resource nodes paint above claims, watchtowers, waystones, markets, and focus markers. Leaflet's tooltip pane also defaults to `650`; because the custom resource pane is appended later, resource nodes can paint over tooltips as well.

## Approved stacking order

The map will use this explicit bottom-to-top order:

1. Dense resource markers: `550`
2. Operational icons in Leaflet's normal marker pane: `600`
3. Player markers: `700`
4. Leaflet tooltips: `750`

Terrain, water, biome masks, roads, and the synthetic ocean retain their existing lower pane order.

## Implementation

Keep the current marker architecture and make three focused changes during map initialization:

- Lower `native-map-resources` from `650` to `550`.
- Assign the shared operational canvas renderer to Leaflet's `markerPane`, covering the claim fallback used when tier metadata is unavailable.
- Raise Leaflet's existing `tooltipPane` to `750`.

Claims, watchtowers, waystones, markets, empire markers, and focus markers continue using Leaflet's default marker pane. Players retain their dedicated `native-map-players` pane at `700`. No marker creation, data flow, resource loading, canvas drawing, or interaction code changes.

## Rejected alternatives

### Dedicated panes for every marker category

This would make the hierarchy more explicit but would require changing every marker and renderer construction path. The existing Leaflet marker pane already groups the operational icons correctly, so the added wiring is unnecessary.

### CSS-only overrides

CSS could target Leaflet's generated pane classes, but that would split pane ownership between React initialization and the stylesheet and remain sensitive to DOM insertion order. The map already assigns custom pane z-indexes directly, so initialization remains the authoritative seam.

## Verification

- Update the focused map boundary test to require resource `550`, operational marker `600`, player `700`, and tooltip `750` ordering, including the shared canvas renderer's pane.
- Run the focused map boundary and dense-marker tests with Node capped at 256 MiB.
- Build and visually smoke-test through remote CI/deployment if publication is requested; do not run the local full build or suite because broad Node workloads previously exhausted workstation memory.
- At dense-resource zoom, confirm claims and watchtowers remain fully visible, player markers remain above operational icons, and hover/focus tooltips paint above every marker layer.

## Non-goals

- Changing marker sizes, colors, shapes, or hit targets.
- Changing which features are tracked or shown.
- Changing resource loading, pagination, viewport culling, or canvas performance.
- Changing terrain, water, road, or biome rendering.
