# Native Map Resource Framing Design

## Problem

The native map can successfully load a selected resource layer while showing no markers because the current claim-focused viewport does not intersect the resource coordinates. The status then reports a positive feature count even though viewport culling draws zero points.

## Approved behavior

- Treat selection as successful only when its returned locations can be discovered visually.
- For each new non-empty resource selection, wait for the first usable snapshot.
- If at least one selected resource is already visible, preserve the current view.
- If none are visible, fit the map to the returned resource bounds once with bounded padding and zoom.
- Do not reframe for later generations of the same selection, preserving user pan and zoom.
- Clearing the selection resets framing so a later selection can frame again.
- Enemy behavior is unchanged until its coordinate source is enabled and verified.

## Verification

A pure decision helper covers empty selections, visible results, off-screen results, and repeated generations. A renderer boundary test covers one-time `fitBounds` integration. Browser smoke verification selects a real configured-region resource and confirms visible canvas points after automatic framing.
