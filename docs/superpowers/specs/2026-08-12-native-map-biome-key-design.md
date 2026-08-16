# Native Map Biome Key Design

## Goal

Add a compact map key beside the existing Layers control so users can identify the rendered land biomes and water types. The key must use the terrain renderer's canonical colours and must remain synchronized when that palette changes.

## Scope

- Add a `Key` button immediately beside `Layers` on the native map.
- Toggle a bounded, scrollable popover containing labelled colour swatches.
- Include grasslands, forest, desert, tundra, mountains, wetlands, volcanic terrain, unknown ground, lake, river, ocean, and swamp water.
- Explain that elevation, biome density, relief, coordinate texture, water depth, and shorelines create small variations around each displayed base colour.
- Keep the control keyboard accessible and usable at mobile widths.

The key does not identify roads, claims, resources, enemies, players, or other marker layers.

## Palette Ownership

Introduce a focused shared palette-definition module under `src/shared/`. It owns the palette version, canonical land and water RGBA values, display labels, and legend ordering.

The server terrain renderer imports those definitions for tile generation. The browser biome key imports the same definitions for swatches. No colour values are duplicated in React or CSS. A future palette change therefore updates both rendering and the key through one source, while the existing palette version continues to invalidate terrain tile generations.

The renderer retains ownership of dynamic shading. The key shows neutral base colours rather than attempting to list every shaded variation.

## UI Structure

The existing top-left map controls become one compact horizontal control group. `Layers` retains its current behaviour. `Key` uses the same button treatment and opens its own popover below the controls.

The key popover contains two labelled groups:

1. Land biomes.
2. Water types.

Each row contains a visible swatch and text label. The button exposes `aria-expanded` and `aria-controls`; the popover has an accessible label. Its dimensions remain viewport-bounded with internal scrolling.

Layers and Key may be toggled independently. Opening or closing the key does not modify map-layer visibility or persisted selections.

## Error and Compatibility Behaviour

The palette definition is bundled with the application, so the key requires no network request and has no loading state. Unknown terrain continues using the renderer's canonical unknown-ground colour and appears explicitly in the key.

Existing terrain shading, tile generation, palette-version invalidation, and map selection behaviour remain unchanged.

## Verification

- Unit tests prove legend entries derive from the same exported RGBA definitions used by the renderer.
- Boundary tests prove the Key button, accessible popover, water entries, and shared palette import are present without duplicated hard-coded colours.
- Existing terrain palette tests continue to pass.
- The application build passes.
- Smoke verification confirms the button sits beside Layers, opens and closes, remains usable at the current map viewport, and displays land and water swatches.

