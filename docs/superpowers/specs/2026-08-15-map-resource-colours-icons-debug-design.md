# Map Resource Colours, Icons, and Debug Display Design

**Date:** 2026-08-15

## Goal

Improve the native map's everyday presentation by giving tierless resources stable, distinguishable colours; showing the available BitCraft icon for every resource in the finder; and moving operational diagnostics behind an off-by-default Debug information control in the Layers panel.

## Scope

This change is limited to the native map resource presentation, the existing self-hosted game-icon vendoring workflow, and the Layers panel. It does not change Relay subscriptions, resource position transport, map generation, server limits, or production deployment.

## Tierless Resource Colours

Tiered resources retain the current tier base colours and deterministic within-tier variations.

Tierless resources use a separate high-contrast categorical sequence. The sequence is allocated deterministically from the complete resource catalog sorted by lossless decimal resource ID. Allocation never depends on selection or click order. Each catalogued tierless resource therefore receives its own stable slot, so Lost Shipment, Lost Wreckage, and Lost Treasure are visibly distinct.

The colour allocator remains provider-neutral and accepts normalized catalog metadata. Invalid or uncatalogued identities retain a safe fallback colour instead of inventing catalog data.

## Resource Finder Icons

The current finder already renders `ItemIcon`, and normalized resource descriptions already contain `iconAssetName`. The missing images occur because the vendoring script scans only catalog entities while resources are delivered as catalog descriptions.

The vendoring workflow will collect icon paths from both normalized catalog entities and normalized catalog descriptions, deduplicate paths, and preserve every catalog identity associated with a shared icon. Resource images remain committed/self-hosted under `/game-icons/`; the browser will not contact Relay, BitJita, or another asset host.

Unavailable upstream icon paths continue to be recorded in the manifest. The existing textual fallback remains for a genuinely unavailable or invalid asset, so one missing image cannot break the finder.

## Debug Information

The Layers panel gains a `Debug information` checkbox. It is off by default and saved with the existing defensive local map preferences.

When disabled:

- the top-right generation, freshness, warnings, and layer-count panel is hidden;
- the bottom canvas-map-points details panel is hidden; and
- the canvas accessibility/debug list is not constructed, avoiding unnecessary work.

When enabled, both panels retain their current content and semantics. The control affects presentation only; it does not disable health collection, warnings, map data, or rendering.

## Error Handling and Compatibility

- Existing saved map-layer preferences remain valid. The new debug preference defaults to false when absent.
- Tierless allocation uses decimal-string resource IDs and never coerces 64-bit identities to JavaScript numbers.
- A malformed icon path continues to be rejected by the existing game-asset path validator.
- Icon source failures remain explicit in the vendored manifest and do not create runtime third-party fallbacks.

## Verification

Focused tests will cover:

- deterministic tierless allocation independent of selection order;
- distinct colours for Lost Shipment, Lost Wreckage, and Lost Treasure fixtures;
- unchanged tiered colour behavior;
- catalog-description icon discovery and deduplication;
- resource finder icon metadata wiring;
- Debug information default, persistence, Layers-panel placement, and render gating.

Because this PC previously crashed from excessive Node memory use, local verification will use only memory-capped focused tests (for example `node --max-old-space-size=256 --test ...`). The local full suite, full build, icon-vendoring download, world generation, and dense benchmark will not be run during implementation.
