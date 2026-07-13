# Authoritative Craft Planner Coverage

## Goal

Make Craft Planner coverage represent quantities that either exist now or are guaranteed by crafts that are already active. Planned recipes, planned gathering actions, expected yields, and probabilistic byproducts must never reduce shortages.

## Coverage Rules

- Count inventory from selected settlement, player, and deployable sources as available stock.
- Count only `guaranteedQuantity` from selected active crafts as in-progress coverage.
- Count expected or probabilistic active-craft outputs as zero unless their guaranteed quantity is greater than zero.
- Do not count any output from a recipe or gathering route that the planner proposes but which is not currently active.
- Calculate each shortage as `required - available stock - guaranteed active output`, clamped to zero.
- Continue showing routes and expected yields under “How to get this” as informational guidance only.

## Calculation and Data Flow

The requirement solver will stop feeding projected secondary outputs back into later calculation passes. Planned outputs will no longer satisfy other requirements or appear as covered quantities on materials, targets, totals, Needs Board cells, Gather Next, personal views, or Discord reports.

Active craft normalization may continue discovering primary and secondary outputs, but the calculation will use its existing guaranteed quantity field globally. Source drill-down rows will therefore match the in-progress quantity shown on the board.

Compact and detail responses will remain compatible where practical. Any retained `plannedOutput` field will be zero and will not participate in calculations; presentation code will stop presenting it as coverage.

## Interface

- Needs Board cells show stored stock and guaranteed active output only.
- The item detail header and Stock Locations remain consistent with board coverage.
- Active craft rows include only guaranteed quantities.
- Route panels may describe possible or expected byproducts, clearly separated from coverage.
- Overall completion, profession completion, Gather Next, and Discord reports use the authoritative-only quantities.

## Failure and Edge Cases

- Missing guarantee metadata is handled conservatively: direct deterministic craft outputs retain their known guaranteed quantity; uncertain possibility outputs count as zero.
- Completed-but-uncollected tracked crafts remain active coverage when their guaranteed output is known.
- Excess stock or guaranteed active output may satisfy a requirement but never produces negative missing quantities.
- Forecast-only outputs cannot hide a blocked recipe or shortage.

## Testing

- A planned gathering byproduct must not reduce its own shortage or downstream requirements.
- A planned deterministic secondary output must not reduce coverage until its craft is active.
- A guaranteed output from an active craft must reduce the shortage.
- An expected but non-guaranteed output from an active craft must not reduce the shortage.
- Needs Board, compact response, detail response, Gather Next, personal views, totals, and Discord report progress must agree with the authoritative calculation.
- Existing inventory and direct guaranteed active-craft behavior must remain intact.

## Scope

This change does not remove recipe routes, gathering guidance, expected-yield information, safety buffers, source selection, or active-craft discovery. It only changes which quantities qualify as coverage.
