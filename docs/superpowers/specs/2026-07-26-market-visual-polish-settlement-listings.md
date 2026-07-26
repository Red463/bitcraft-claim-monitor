# Market Visual Polish and Settlement Listings Fix

## Goal

Restore live monitored-settlement listings on Settlement Market and apply a balanced density/readability pass to the new global Market without changing its command-centre structure or functionality.

## Confirmed defect

The monitored claim currently has live listings, and the production BitJita proxy returns them. Settlement Market displays zero because `useBitjitaData` does not add the claim market endpoint when the active panel is `settlement-market`.

Settlement Market must fetch the same claim-scoped live listing feed that the former local Market route used. No collector or manual task is required before listings appear.

## Functional changes

- Add `settlement-market` to the frontend BitJita endpoint selection and request the monitored claim's complete paginated listing set.
- Keep the global `market` page independent from the monitored claim feed.
- Distinguish Settlement Market states:
  - live listings loaded but filters match nothing;
  - the monitored settlement has no live listings;
  - live listing refresh failed.
- Add regression coverage for the route-to-endpoint mapping.

## Visual changes

### Shared formatting

- Use the existing gold formatter for compact currency values so values render as `114.3K`, not `114.3Kg`.
- Present price and location as separate block-level lines in deal tables.
- Use explicit separators between item type, region, tier, rarity and category metadata.
- Preserve item/cargo identity and existing map behavior.

### Browse and Buy Orders

- Keep search, category, sort and availability switches in a coherent responsive filter bar.
- Group availability switches so they wrap together instead of leaving a lone full-width switch.
- Align the item icon, identity and Favorite action on one readable header row.
- Render six item metrics as a balanced responsive grid: six columns on wide workspaces, three at medium widths and two/one at narrow widths.
- Keep regional order summaries compact but legible.
- Reduce excess vertical spacing around order tabs, filters and tables.

### Deals and Overview

- Reduce empty-state height for browser-local Favorites.
- Separate price/location text in Overview and Deals.
- Use compact, consistent deal summary metrics without oversized empty cards.
- Keep the active-region controls horizontally scrollable when the region list exceeds the viewport.
- Preserve the dense table-first operational layout.

### Deal Watch

- Arrange item, region and threshold controls in a stable responsive grid.
- Give watch metadata defined columns/labels so region, threshold, last check and last alert do not run together.
- Keep Enable/Disable and Remove actions grouped with each rule.

### Stalls

- Present matching-stall and active-order totals in a compact summary strip.
- Reduce stall row height while keeping owner, claim, region, coordinates and active-order count readable.
- Keep View offers and Map actions together.
- Preserve the existing viewport-fixed, internally scrolling offer modal.

### Responsive and accessibility behavior

- Preserve horizontal table scrolling on narrow layouts.
- Maintain visible focus states and current button semantics.
- Avoid hiding information solely to achieve density.
- Use responsive breakpoints rather than fixed widths that only suit the supplied desktop screenshots.

## Scope boundaries

- No Hexite Exchange functionality.
- No navigation, routing or data-source redesign.
- No new UI framework or state library.
- No broad shared-component refactor.
- No change to global Market business rules, Deal Watch persistence or background aggregation.
- No destructive database change.

## Verification

- Add a focused regression test for Settlement Market endpoint selection.
- Run the complete application build and tests.
- Start the local smoke server and verify:
  - Settlement Market loads current claim listings without a manual task;
  - global Market tabs render without console errors;
  - the supplied desktop-width issues are resolved;
  - Browse, Deal Watch and Stalls remain usable at a narrow viewport.
