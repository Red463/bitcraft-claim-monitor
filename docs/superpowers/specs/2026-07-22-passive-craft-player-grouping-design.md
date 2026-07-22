# Passive Craft Player Grouping Design

## Goal

Make tracked passive-craft coverage in the Craft Planning item details panel compact and readable by showing one summary row per player instead of one row per passive craft.

## Behaviour

- Group passive craft sources by stable player identity, falling back to the displayed player name when no identifier is available.
- Preserve ordinary active crafts as individual rows.
- Sum expected and guaranteed output independently within each player group; this is a presentation-only aggregation and does not change planner material calculations.
- Show the number of passive crafts, a status breakdown such as `6 ready · 2 processing`, and a compact structure breakdown such as `Large Farming Field ×8`.
- Show the BitJita location warning once per grouped player when any underlying craft lacks location data.
- Sort grouped entries consistently with ready output first, then by player name.

## Layout

- Use a two-column grid for each tracked-craft row: descriptive content uses `minmax(0, 1fr)` and the expected/guaranteed totals use an intrinsic right-aligned column.
- Allow long craft, structure, and player text to wrap rather than collide with the totals.
- At narrow widths, stack totals below the description while retaining clear alignment and spacing.
- Keep the existing dense operational styling and avoid adding expansion controls or nested cards.

## Verification

- Add focused helper tests for passive grouping, independent expected/guaranteed sums, status counts, structure counts, and ordinary active-craft preservation.
- Update the Craft Planning boundary test to cover the grouped summary markup.
- Run the app test suite and production build.
- Browser-smoke the item detail modal at desktop and narrow widths when practical.
