# Route Loading and Recipe Label Clarity Design

## Goal

Make navigation loading feel intentional, make acquisition routes distinguishable by the source material a player will use, and prevent route-save feedback from leaking into unrelated item-detail panels.

## Scope

This change covers the shared application route-loading fallback and Craft Planning acquisition-route presentation. It does not change catalogue storage, recipe selection behaviour, probability calculations, or route identifiers.

## Route Loading

Replace both plain `Loading page...` Suspense fallbacks with one shared route-loading skeleton.

The skeleton will contain:

- A compact page-title placeholder aligned with normal page content.
- Three restrained summary placeholders.
- One wide content placeholder that suggests a table or dashboard region.
- A page-specific accessible status such as `Loading Dashboard...` when the destination label is available, with `Loading page...` as the startup fallback.

The skeleton will use the existing dark surface, border, and muted-text tokens. Its shimmer will be subtle and will stop when `prefers-reduced-motion: reduce` is active. It will not use an oversized empty-state card or leave the user with a large unexplained black region.

## Acquisition Route Labels

The existing route-presentation helper remains the single source for route labels in cards, dropdowns, and detail sections.

Recipe names containing unresolved catalogue placeholders such as `{0}`, `{1}`, or equivalent numeric brace tokens are internal templates and must never be shown directly to players. For these routes, the helper will derive the public label from the route inputs and output, for example:

- `Process Fine Wolf Carcass -> Fine Animal Hair`
- `Process Fine Bear Carcass -> Fine Animal Hair`
- `Process Fine Deer Carcass -> Fine Animal Hair`

The verb `Process` is used for placeholder-bearing processing recipes. Existing meaningful recipe names remain unchanged. The station is appended using the current station-label behaviour when it is not already present.

If input metadata is unavailable, the helper will use a clean fallback such as `Produce Fine Animal Hair at Fine Hunting Station`. It will not number otherwise indistinguishable routes or expose internal recipe IDs in the primary label.

When more than one route is offered, the chooser will explain the reason for the choice with player-facing copy: `<count> processing routes available - choose the source material you plan to use.` This copy applies wherever the comparable route-card chooser is shown.

The sanitising rule applies to every acquisition route, not only animal processing.

## Item-Scoped Save Feedback

Success and error feedback for route changes and safety-buffer changes will be associated with the affected item key. Feedback renders only when that key matches the item currently open in the detail panel.

After a successful route update, `Acquisition route updated.` remains visible while the same item stays open, including after its detail data refreshes. Opening a different item hides the prior message. Returning to the original item does not resurrect stale feedback after the panel has been closed or another item has been opened.

Needs Board row-override feedback remains in its own row-editing flow and is not displayed as item-detail feedback.

## Accessibility and Responsive Behaviour

- Route-loading status uses `role="status"`, `aria-live="polite"`, and `aria-busy="true"` without announcing decorative skeleton shapes.
- Route choices remain native radio inputs with their existing keyboard and focus behaviour.
- New helper copy wraps inside the existing viewport-bounded item-detail panel.
- Loading motion respects the existing reduced-motion contract.
- Route distinctions use text, not colour alone.

## Error Handling

- Missing or malformed recipe names fall back to input/output-derived labels.
- Missing inputs fall back to a clean output/station label.
- A failed route save shows an item-scoped error and keeps the previously selected route.
- Loading skeletons remain purely presentational; existing route error boundaries continue to own failed page loads.

## Verification

Add focused tests for:

- Page-loading markup, destination-aware accessible copy, skeleton structure, and reduced-motion styling.
- Placeholder removal for numeric brace tokens.
- Distinct labels for routes with different animal or material inputs.
- Clean fallback labels when input metadata is unavailable.
- Consistent labels across route cards and dropdowns through the shared helper.
- Success and error feedback rendering only for the affected item key.

Then run the full BitCraft Local test suite and production build. Browser-smoke page navigation and the item-detail route chooser when the local database has suitable plan data; otherwise verify the built loading state and route styles and report that fixture limitation.
