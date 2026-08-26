# Resource Tier Colours Design

## Goal

Render native-map resource nodes with colours that communicate their catalog tier while keeping different resource types visually distinguishable. Colour assignment must be stable and independent of selection order.

## Behaviour

- Each supported BitCraft resource tier uses the application's existing tier colour as its base.
- Each resource type selects a deterministic variation from its tier's fixed colour range using its canonical resource ID.
- A resource type keeps the same colour when selections are reordered, added, removed, persisted, or restored.
- Different resource types in the same tier should usually receive different variations. Exact uniqueness is not required.
- Missing, invalid, or unsupported tier metadata uses the current green resource fallback.
- Enemy colours and all other map-layer colours remain unchanged.

## Architecture and data flow

`MapPage` already owns the Relay-backed resource catalog, including resource IDs and tiers. It will derive a small provider-neutral resource-style list for the selected resource IDs and pass it to `NativeMap`.

A focused pure map helper will own the tier palette and deterministic variation algorithm. It accepts a resource ID and tier and returns a CSS colour. The algorithm must not depend on array position or selection order.

`NativeMap` will index those styles by resource ID. Its dense resource canvas will resolve the point's typed resource identity to the assigned colour during drawing. The canvas remains a single layer with viewport culling and animation-frame batching; no DOM marker is introduced per resource node.

## Rendering

The base colours match the existing tier badge palette for tiers 1 through 10. Variations stay recognisably within that tier family by applying a bounded deterministic lightness adjustment rather than changing to an unrelated hue.

Resource points retain their existing size, stacking order, culling, and level-of-detail behaviour. Unknown resources use the existing `rgba(87, 225, 151, 0.9)` fallback.

## Testing

- Unit tests cover the tier base families, deterministic output, selection-order independence, same-tier variation across representative IDs, and fallback handling.
- Renderer boundary tests verify that selected catalog tier metadata reaches `NativeMap` and that dense resource drawing resolves per-point colours.
- Run the focused tests and the production build, then visually smoke-check two same-tier tracked resources on the native map.

## Scope

This change only affects native-map resource node colours. It does not change resource subscriptions, API responses, resource selection persistence, enemy rendering, node size, or map-layer controls.
