# Native Map Biome Rendering and Highlighting Design

## Goal

Render every Relay biome correctly, including blended terrain cells, and make each biome easy to locate from the map key without adding continuous terrain generation or third-party requests.

## Scope

This change will:

- Decode the packed biome identities and densities in `terrain_chunk_state`.
- Give every current Relay biome identity a stable colour.
- Blend contributing biome colours in pre-generated terrain tiles.
- List every live biome descriptor in the map key.
- Pre-generate sparse biome highlight-mask tiles for the installed terrain generation.
- Preview a biome on pointer hover or keyboard focus.
- Allow a biome highlight to be pinned by click for touch and keyboard users.

This change will not alter roads, claims, resources, players, terrain collection cadence, or the provider-neutral browser boundary.

## Verified Relay Encoding

`terrain_chunk_state.biomes` and `terrain_chunk_state.biome_density` are parallel `u32` arrays. Each terrain cell packs up to four byte-sized values into each `u32`, in least-significant-byte-first order.

For a cell:

- biome byte 0 is the primary biome identity;
- biome bytes 1 through 3 are secondary blend identities;
- zero-valued trailing biome bytes are unused;
- each biome byte is paired with the density byte at the same position;
- observed primary density is `128`, while secondary densities vary below that value.

For example, biome value `0x0102040A` and density value `0x0A404A80` decode to:

1. biome `10`, density `128`;
2. biome `4`, density `74`;
3. biome `2`, density `64`;
4. biome `1`, density `10`.

Decoding must use unsigned bit operations and return only non-zero biome identities with positive density. Malformed or missing density bytes fall back to density `128` for the primary identity and do not invent secondary contributions.

## Biome Catalogue and Palette

The palette is keyed by stable numeric biome type, not by display-name substring. It includes the 19 currently generated identities:

| ID | Relay name |
|---:|---|
| 0 | Dev |
| 1 | Calm Forest |
| 2 | Pine Woods |
| 3 | Snowy Peaks |
| 4 | Breezy Grasslands |
| 5 | Autumn Forest |
| 6 | Misty Tundra |
| 7 | Desert Wasteland |
| 8 | Swamp |
| 9 | Rocky Garden |
| 10 | Open Ocean |
| 11 | Safe Meadows |
| 12 | Cave |
| 13 | Jungle |
| 14 | Sapwoods |
| 15 | Deserted Beach |
| 16 | Tropical Canopy |
| 17 | Volcanic Crag |
| 18 | Uncharted Ocean |

The shared palette remains the single source for tile generation and legend swatches. A future Relay biome ID not yet in the palette is still returned in the catalogue and shown in the key with the existing unknown-ground colour. Its terrain remains visible and produces one bounded warning per generation rather than silently disappearing.

The terrain palette version increases so the installed bundle is regenerated once. Relay does not supply authoritative biome colour values, so colour changes remain deliberate versioned application changes.

## Terrain Colour Composition

Ground cells blend the RGB colour of every decoded contributor using its density as the weight. Alpha remains opaque. Existing deterministic texture, elevation, relief, and density shading is applied after the base blend.

Water-body semantics continue to select the water surface palette so lakes, rivers, oceans, ocean-biome cells, and swamp water retain depth and shoreline shading. Their underlying decoded biome contributors are still recorded in highlight masks, allowing Open Ocean and other water-associated biomes to be identified.

If no valid contributor can be decoded, the renderer uses the unknown-ground colour and emits a bounded warning.

## Pre-generated Highlight Masks

Terrain bundle generation creates an additional sparse tile channel for each biome actually present in a tile. It does not create blank files for absent biomes.

Each mask tile:

- uses the same bounds, zoom range, coordinates, generation, and tile size as terrain tiles;
- is transparent where the selected biome has no contribution;
- reproduces the cell's final rendered terrain or water colour where the selected biome contributes;
- sets pixel alpha to `round(255 * (0.45 + 0.55 * contributionDensity / strongestDensity))`, clamped to `115..255`;
- is stored and served through the existing local tile-store boundary;
- is immutable and generation-busted like terrain and road tiles.

The route shape is:

```text
GET /api/local/map/tiles/biome-<0..255>/<z>/<x>/<y>.webp?generation=<decimal>
```

Invalid biome IDs, coordinates, zooms, or paths return `400`. A valid tile with no stored mask returns `404` with the existing short negative-cache policy. Tile response budgets and path traversal protection remain in force.

The installed manifest and `/api/local/map/tiles/status` add:

```ts
biomes: Array<{
  biomeType: number;
  name: string;
  description: string;
  hazardLevel: string;
  disallowPlayerBuild: boolean;
  present: boolean;
}>;
```

No Relay wire record enters React. The status projection remains provider-neutral and contains no coordinates or administrative configuration.

## Map Interaction

The key uses the live installed catalogue rather than a hard-coded list. Water surface entries remain in a separate section because they describe rendering surfaces rather than biome identities.

Every present biome row is a button:

- pointer enter previews that biome;
- pointer leave restores the pinned biome, or clears the preview when none is pinned;
- keyboard focus previews that biome;
- click toggles the pinned biome;
- `Escape` clears the pinned and previewed biome;
- `aria-pressed` reports the pinned state.

Absent biomes remain visible in the catalogue with a “Not present in this terrain generation” label. They cannot be previewed or pinned.

When a biome is active:

- terrain and water base panes use `filter: brightness(32%)`;
- one biome-mask tile layer appears above those panes;
- roads, claims, players, resources, enemies, watchtowers, waypoints, labels, controls, and popups remain undimmed;
- changing the active biome replaces the mask layer rather than accumulating layers.

The key includes the instruction “Hover or focus to preview; click to pin.” The pinned selection is intentionally session-only and is not added to the URL or persisted settings.

## Loading and Failure Behaviour

Opening the key never triggers Relay collection or terrain regeneration. It only reads the already-loaded tile status.

Mask requests use normal Leaflet viewport loading and are paused with the map when the page is hidden. Missing mask tiles remain transparent. A mask request failure must not remove or obscure the base map; the UI keeps the selected row marked and shows the existing map warning mechanism only for persistent layer unavailability.

Last-good terrain and its matching masks remain installed atomically. The application never mixes a new manifest with masks from an older generation. A failed bundle build retains the complete previous bundle.

## Performance and Storage Boundaries

- Only biomes present in a tile produce mask files.
- Empty mask tiles are omitted.
- Hover and focus previews use a 100 ms debounce before changing tile layers to avoid loading tiles while the pointer crosses rows. Pinning and clearing apply immediately.
- At most one biome mask layer exists at once.
- Mask tiles use the existing viewport culling, immutable browser cache, and generation cache busting.
- Bundle diagnostics report mask tile count and bytes separately from base terrain tile totals.
- Bundle installation retains the existing atomic staging and last-good semantics.

## Testing

Focused automated coverage will include:

- unsigned decoding of one through four packed biome and density bytes;
- malformed density fallback and empty-cell handling;
- weighted biome colour blending and deterministic shading;
- all 19 current palette identities and future-ID fallback;
- water rendering retaining surface colours while contributing to masks;
- sparse mask generation, alpha weighting, and omitted blank masks;
- tile route validation and generation-safe reads;
- manifest/status catalogue projection and presence flags;
- hover, leave, focus, click-to-pin, `Escape`, and unavailable-row behaviour;
- replacement and cleanup of the single Leaflet mask layer;
- marker and overlay panes remaining outside the dimmed terrain panes;
- same-origin browser boundaries.

Verification will run the focused tests during red-green cycles, the production build, the full application test suite because server and API behaviour change, and a smoke-browser check of the map at desktop and mobile widths.

## Acceptance Criteria

- Calm Forest, Pine Woods, Breezy Grasslands, Misty Tundra, Swamp, Rocky Garden, Open Ocean, and Safe Meadows render as distinct named biomes in the currently installed world.
- Blended cells no longer fall back to unknown merely because their biome value contains multiple packed identities.
- Every live catalogue biome appears in the key, including catalogued biomes absent from the installed terrain.
- Hover/focus visibly isolates a present biome without dimming operational overlays.
- Click pins the same highlight on pointer, touch, and keyboard interaction; `Escape` clears it.
- Terrain remains pre-generated and no browser request reaches Relay or a third-party map/tile provider.
- Failed regeneration or mask loading cannot replace the last-good base map with a partial bundle.
