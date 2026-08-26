# Native Map Synthetic Ocean Colour Design

## Goal

Make the synthetic ocean underlay blend with the deep open ocean visible along generated terrain-tile boundaries. The zoomed-out world must no longer show a lighter rectangular background around the generated regions.

## Scope

- Change only the decorative synthetic-ocean colour treatment.
- Keep the existing world bounds, layer ordering, availability rules, and provider-neutral data flow.
- Do not regenerate terrain packs or introduce synthetic terrain, water, or biome data.
- Do not add remote assets, animation, browser-side Relay access, or a second independently maintained ocean palette.

## Colour Source

The regular ocean renderer starts from `TERRAIN_WATER_COLOURS.ocean` and applies depth shading. Generated region edges predominantly show deep open ocean, while the current underlay uses the lighter unshaded base colour.

The underlay will derive a representative deep-ocean colour from the canonical ocean palette using the same maximum-depth channel adjustment as the terrain renderer. The derivation must live at a shared palette seam, or be locked by a cross-module test, so a future ocean-palette change updates the underlay consistently.

## Rendering

The synthetic SVG will contain one world-sized rectangle filled with the derived deep-ocean colour. The existing large light and dark radial gradients will be removed because they create different mismatch levels around different region edges.

Real terrain and water tiles remain above the underlay and retain their detailed depth, shoreline, and texture shading. The underlay remains decorative, non-interactive, clipped to the verified world bounds, and shown only when a usable terrain generation exists.

## Failure Behaviour

Existing behavior is unchanged:

- If the terrain status is unavailable or lacks a generation, do not show synthetic ocean.
- If SVG layer creation fails, contain the failure and leave the coordinate fallback usable.
- Stale last-good terrain may continue to use the synthetic underlay.

## Verification

- Unit-test that the synthetic fill is derived from the canonical ocean palette and represents deep rather than unshaded ocean.
- Unit-test that the SVG contains only the world-sized base rectangle and no gradient definitions or ellipses.
- Retain controller, bounds, availability, accessibility, and no-remote-asset coverage.
- Run only memory-capped focused local tests on this workstation.
- Use remote CI for the clean-install build and full application suite if the change is published.
- Visually smoke-test the zoomed-out world and confirm the generated tile boundaries blend into the synthetic ocean.

## Acceptance Criteria

- Empty corner areas visually match the deep ocean surrounding generated regions.
- No large lighter or darker synthetic patches remain.
- Terrain, water, roads, markers, and resource rendering are unchanged.
- Future canonical ocean-palette changes continue to flow into the synthetic underlay.
