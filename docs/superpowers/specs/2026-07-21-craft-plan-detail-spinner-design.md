# Craft Planning Detail Spinner Fix

## Problem

The item-detail loading icon is static even though it communicates an active loading state. The React markup gives the `LoaderCircle` icon the class `spin`, but Craft Planning defines its reusable rotation animation on `.is-spinning`. No `.spin` rule exists, so the icon receives no animation.

## Design

- Use the existing `is-spinning` class on the item-detail `LoaderCircle`.
- Keep the existing `craft-plan-spin` keyframes and 0.8-second linear rotation.
- Preserve the existing `prefers-reduced-motion` rule, which intentionally disables this non-essential rotation for players who request reduced motion.
- Do not add a new global animation class or animate the surrounding status container.

## Testing

- Extend the Craft Planning CSS boundary test to verify the icon uses `is-spinning`.
- Verify that `.is-spinning` still references `craft-plan-spin` and that the reduced-motion override remains present.
- Run the focused boundary test and the production build.
