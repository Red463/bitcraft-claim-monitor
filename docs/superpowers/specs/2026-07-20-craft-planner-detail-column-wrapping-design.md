# Craft Planner Detail Column Wrapping

## Goal

Make every card in the craft-planner item-detail modal follow the same narrow-width behavior as Stock locations: no horizontal scrollbar, wrapped descriptive text, and numeric values aligned at the top-right.

## Design

- Scope the behavior to nested cards inside `.craft-plan-need-detail-grid` so unrelated detail rows elsewhere keep their current presentation.
- Hide horizontal overflow while preserving each card's existing vertical scrolling.
- Let descriptive row text shrink and wrap at natural boundaries, with `overflow-wrap: anywhere` as a fallback for unusually long unbroken content.
- Keep the numeric value non-shrinking and align rows at the top so the value remains at the top-right when the description wraps.
- Preserve the modal's current desktop two-column layout and existing single-column responsive breakpoint.

## Verification

- Extend the focused craft-planning CSS boundary test to cover the shared modal-card selectors.
- Run the application build and the focused CSS boundary test.
- Browser-check the item-detail modal at the narrow width shown in the supplied screenshots, confirming that no inner horizontal scrollbar remains.
