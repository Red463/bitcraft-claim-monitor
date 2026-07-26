# Global Market Sortable Tables Design

## Summary

Add consistent clickable column sorting to the three Global Market tables that still use static headers:

- Overview: Top deals right now.
- Deals: filtered arbitrage results.
- Browse: selected item sell and buy order books.

The existing sortable tables in Buy Orders, item trade history, and Settlement Market remain unchanged. Deal Watch and Stalls remain card/list interfaces because they do not render tables.

## Goals

- Make every meaningful data column in the affected Global Market tables sortable.
- Reuse the dashboard's existing sortable `DataTable` interaction and styling.
- Preserve the current filters, displayed values, row actions, responsive overflow, and initial ordering.
- Sort numeric market values as numbers rather than formatted strings.
- Preserve keyboard access and expose the active direction to assistive technology.

## Non-goals

- Do not convert Deal Watch or Stalls into tables.
- Do not change API requests, pagination, market calculations, or filters.
- Do not add server-side sorting.
- Do not change the already-sortable Buy Orders, price-history trade, or Settlement Market tables.
- Do not make Map or other action-only columns sortable.

## Chosen Approach

Convert the three manual tables to the shared `DataTable` component.

Extend `DataTableColumn` with an optional fourth tuple member, `sortable`, which defaults to `true`. A column declared with `sortable: false` renders a plain header without a sort button or `aria-sort`. This keeps existing callers source-compatible while allowing Map columns to remain non-interactive.

Each converted market table supplies an explicit raw `sortValue` for every sortable column. This avoids relying on rendered text from badges, icons, nested labels, compact currency strings, or location sublabels.

Add optional `rowOffset` and `rowLimit` inputs to `DataTable`. Sorting always runs across the complete supplied row set before this display window is applied. Browse supplies its full filtered order book plus the current pagination window, so a header sort affects every matching order rather than only the current 25 rows.

The existing Deals and Browse sort dropdowns become redundant once all columns are directly sortable and will be removed. Their current initial behavior remains:

- Deals initially orders by highest unit profit.
- Browse sell orders initially order by lowest unit price.
- Browse buy orders initially order by highest unit price.

Header sorting is local browser state and does not modify the page URL.

## Interaction

Sortable headers use the established three-state cycle:

1. First activation sorts ascending.
2. Second activation sorts descending.
3. Third activation returns to the table's initial row order.

Every sortable header:

- Uses a native button.
- Shows the existing neutral, ascending, or descending indicator.
- Exposes `aria-sort` on its `<th>`.
- Is reachable and operable by keyboard.
- Preserves the existing visible focus treatment.

Map headers remain plain text and contain no disabled or misleading button.

## Column Semantics

### Overview: Top deals

| Column | Sort value |
|---|---|
| Item | Item or cargo display name |
| Buy at | Unit buy price |
| Sell at | Unit sell price |
| Profit | Unit profit |
| Qty | Maximum tradable quantity |
| Distance | Numeric distance |
| Map | Not sortable |

Sorting applies to the eight deals displayed in the Overview module.

### Deals

| Column | Sort value |
|---|---|
| Item | Item or cargo display name |
| Buy at | Unit buy price |
| Sell at | Unit sell price |
| Available | Source quantity |
| Wanted | Destination wanted quantity |
| Max trade | Maximum tradable quantity |
| Unit profit | Numeric unit profit |
| Gain | Numeric percentage gain |
| Distance | Numeric distance |
| Map | Not sortable |

Filtering occurs first; header sorting applies to all currently filtered rows.

### Browse order books

| Column | Sort value |
|---|---|
| Price | Numeric unit price |
| Quantity | Numeric quantity |
| Total | Numeric total value |
| Region | Region name |
| Settlement | Settlement name |
| Buyer/Seller | Player name |
| Map | Not sortable |

The same table definition handles sell and buy modes while updating the player header label.

## Data and State

No API or database changes are required.

`DataTable` retains its local active column and direction. The rows supplied by each market component retain their existing initial order so clearing a header sort restores the current default. When a display window is configured, it is applied after sorting.

Explicit sort values preserve item/cargo identity by using the normalized display name only for ordering; row keys, item actions, and map actions continue using their existing typed records.

## Responsive and Visual Behavior

- Reuse the existing `.table-sort-button`, `.table-sort-indicator`, and `.table-wrap` styles.
- Keep headers on one line within horizontally scrollable tables.
- Do not add new cards, toolbars, or decorative elements.
- Removing the redundant Deals and Browse sort dropdowns reduces toolbar width without changing the remaining filter controls.

## Testing

Add focused tests that fail before implementation and cover:

- The three affected market components use `DataTable`.
- Every data column supplies an explicit raw sort value.
- Map columns are declared non-sortable.
- Deals and Browse no longer render redundant sort dropdowns.
- `DataTable` renders non-sortable columns without a sort button or `aria-sort`.
- Browse sorting is applied before the current 25-row pagination window.
- Existing table-sort utility tests continue to cover numeric, text, and date ordering.

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Browser-check Overview, Deals, and Browse at desktop and narrow widths, including keyboard focus, direction indicators, row ordering, map actions, and console output.
