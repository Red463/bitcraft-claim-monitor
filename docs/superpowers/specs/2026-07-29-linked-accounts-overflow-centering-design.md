# Linked Accounts Overflow Trigger Centering

## Goal

Center the vertical-ellipsis icon inside every Linked Accounts “More actions” trigger without changing row layout, menu behavior, or touch-target sizes.

## Design

- Keep the existing 36px desktop trigger and 44px narrow-screen trigger.
- Normalize the native `summary` element with zero padding and zero line height.
- Use explicit flex alignment on the trigger so its only visible child is centered on both axes.
- Render the Lucide SVG as a block to remove inline baseline space.
- Suppress both the standard `::marker` and WebKit details marker so browser-native disclosure markers cannot affect alignment.
- Preserve the existing hover, open, focus-visible, keyboard, and dropdown behavior.

## Scope

Only `apps/bitcraft-local/src/styles/admin.css` and its focused boundary test are in implementation scope. No React, menu, row-grid, API, or ordinary user Settings behavior changes.

## Verification

- Add boundary assertions for marker suppression and explicit trigger/SVG centering.
- Run the application build.
- Browser-check the Linked Accounts trigger at desktop width and below the existing narrow breakpoint.
