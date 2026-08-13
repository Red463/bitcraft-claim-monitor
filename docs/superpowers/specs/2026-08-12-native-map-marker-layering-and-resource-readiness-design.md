# Native Map Marker Layering and Resource Readiness Design

## Goal

Make live players and selected resources immediately legible and reliably visible above ordinary map geometry, fix cold-start resource tracking, and render the supplied claim badges without artificial padding or shadow.

## Player presentation

Player positions remain exact, selected, online, monitored, non-excluded Relay features. Each player renders as an 8-pixel solid dot using the existing deterministic colour allocator, surrounded by a subtle approximately 24-pixel pulse in the same colour. Player markers live in a dedicated Leaflet pane above resources, claims, roads, and other ordinary features. The pulse does not replace the accessible name, tooltip, title, or keyboard-readable alternative.

## Resource presentation

Selected resources keep the existing canvas renderer so thousands of points do not create DOM-marker growth. The resource canvas moves into a dedicated Leaflet pane above claims, roads, and other ordinary features but below players. Viewport culling, animation-frame batching, layer visibility, and bounded point limits remain unchanged. Enemy rendering is not changed by this work.

## Cold resource readiness

The live resource join is already verified and produces complete bounded generations. The observed failure occurs because a cold snapshot request can read its newly acquired spatial lease before the initial subscription generation is applied. A resource request for a verified configured-region type returned unavailable initially, then returned 917 features from the same scope after the session warmed.

The spatial-scope lease will expose a bounded readiness wait. Snapshot requests that need live spatial data wait up to a short server-owned deadline for the first complete generation. Event streams remain fast to establish and continue using generation notifications. If Relay does not produce a complete generation within the deadline, the existing partial/unavailable response is retained; no coordinates are inferred and no unbounded retry is introduced. Equivalent scopes continue sharing one session.

## Claim badge presentation

Claim badges use the supplied tier images edge-to-edge within the existing 40-pixel marker footprint. The claim wrapper has zero padding, no drop shadow, no border, and a transparent background. A hexagonal crop follows the supplied outer badge shape so the square source background does not appear. Existing zoom scaling and tier selection remain unchanged.

## Layer order

From highest to lowest:

1. Selected online players.
2. Selected resource points.
3. Ordinary markers such as claims and watchtowers.
4. Roads, terrain, and water.

Focus/waypoint behavior remains independently visible and is not weakened by this ordering.

## Testing and acceptance

- Unit-test bounded spatial readiness for immediate, delayed, timeout, and shared-scope cases.
- API/boundary-test that cold verified resource scopes wait for a usable first generation without changing partial timeout behavior.
- Renderer boundary-test dedicated player/resource panes and their relative z-indexes.
- CSS boundary-test the small player dot/pulse and zero-padding, shadow-free claim crop.
- Build and run the complete backend/frontend test suite.
- Restart the smoke server and visually verify two distinct live player dots, player labels, selected resource points, layer ordering, claim badges, no iframe, no remote map assets, and no console errors at desktop and phone widths.

## Non-goals

This change does not add resource clustering, DOM resource markers, trails, offline player positions, enemy verification, new map layers, or a different resource refresh cadence.
