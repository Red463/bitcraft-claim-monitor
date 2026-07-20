# Craft Planner Stock Location Wrapping Design

## Problem

Long stock-location labels in the Craft Planning item-details modal are forced onto one line. The containing card allows horizontal overflow, so labels such as `Oddfawn — Town Bank — Timbersteel Trade` create a horizontal scrollbar.

## Approved behavior

- Stock-location labels wrap within the available column width.
- The stock quantity remains visible and aligned at the top-right of its row.
- Long unbroken labels may break safely rather than widening the card.
- The Stock locations card has no horizontal scrollbar.
- Vertical scrolling remains available when the list is taller than the viewport-bounded modal.
- Other item-detail rows retain their existing truncation behavior.

## Design

Keep the existing modal structure and two-column desktop layout. Scope the repair to `.craft-plan-stock-card`:

- allow stock row labels to wrap and use `overflow-wrap: anywhere` as a fallback;
- give the label flexible width and keep the quantity non-shrinking;
- top-align wrapped labels with quantities;
- add `min-width: 0` to the stock detail groups and rows so intrinsic content cannot widen the scroll area;
- suppress horizontal overflow on the Stock locations card while preserving its vertical overflow.

No React markup, data mapping, API behavior, modal dimensions, or unrelated planner layout will change.

## Accessibility and responsive behavior

The change preserves the existing semantic `details` and `summary` controls. Wrapped text remains fully readable instead of being truncated, and the layout works in both the desktop two-column modal and the existing single-column mobile layout.

## Verification

- Add a focused CSS boundary test covering wrapping, intrinsic-width containment, quantity sizing, and the absence of horizontal scrolling.
- Run the focused Craft Planning boundary tests.
- Run the complete application test suite.
- Run the production frontend build.
- Re-run the Impeccable layout detector and inspect the affected modal when the local smoke environment is available.

