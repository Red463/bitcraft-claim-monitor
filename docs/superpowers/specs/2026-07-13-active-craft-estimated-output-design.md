# Active Craft Estimated Output Design

## Summary

Craft Planner coverage will distinguish between unsupported gathering forecasts and estimates backed by real active crafts.

Stored inventory and guaranteed active-craft output continue to count. Expected outputs from selected active or ready-to-collect crafts also count after aggregation and conservative rounding. Expected gathering byproducts never count because they are not backed by an active craft.

## Coverage Rules

For each material:

1. Count stored inventory from the selected settlement, player, and deployable sources.
2. Combine all output rows from selected active and ready-to-collect crafts for that material.
3. Sum expected craft output before rounding.
4. Count the greater of:
   - total guaranteed craft output; or
   - the combined expected craft output rounded down to a whole item.
5. Calculate shortage from required quantity minus stored inventory and counted craft output.

In formula form:

```text
countedCraftOutput = max(totalGuaranteedOutput, floor(totalExpectedOutput))
missing = max(0, required - storedInventory - countedCraftOutput)
```

Combining before rounding is required. Two selected crafts that each estimate `0.6` of an item therefore count as `floor(1.2) = 1`, rather than zero.

## Eligibility

Expected output may count only when it originates from a real selected craft returned by the active-craft data flow. This includes crafts still running and completed crafts waiting to be collected.

The following never count toward coverage:

- planned recipes that have not started;
- planned gathering or processing actions;
- expected yields from gathering routes;
- gathering byproducts such as Gypsite, Resin, Bark, or similar items when no corresponding craft is active.

No item, profession, or recipe allow-list will be introduced. Eligibility follows the presence of an actual selected craft record.

## Presentation

Planner consumers will keep estimated craft output visibly distinct from confirmed quantities. Where applicable, material details will identify:

- quantity in stock;
- guaranteed active-craft output;
- estimated active-craft output.

The counted active-craft total may reduce the shortage, but estimated output must not be labelled as stored, confirmed, or guaranteed.

Needs Board completion, item details, Gather Next, fishing projections, compact Craft Planner responses, and Discord Craft Planner reports must all use the same counted coverage value.

Expected gathering yields and probabilistic route information remain available under informational acquisition guidance such as “How to get this.” They do not affect coverage.

## Data Shape

The calculation layer will retain enough information to expose:

- total guaranteed active-craft output;
- total counted active-craft output;
- the estimated portion of counted output.

Existing `inProgress` consumers may continue to use the combined counted active-craft total, while focused fields or source metadata distinguish guaranteed and estimated portions for user-facing copy. Legacy `plannedOutput` remains excluded and must not be restored as a coverage input.

No database migration, external dependency, public route, configuration toggle, or manual allow-list is required.

## Failure Handling

- Missing or malformed expected quantities contribute zero.
- Missing guarantees contribute zero guaranteed output.
- Counted craft output cannot fall below a valid guaranteed total.
- Negative, non-finite, and fractional final counted quantities are rejected or normalized conservatively.
- If active-craft details cannot resolve an expected product, the Planner retains guaranteed direct output and does not infer the missing estimate from names.

## Testing

Focused tests will cover:

- combined fractional estimates rounded down after aggregation;
- multiple active crafts producing the same estimated output;
- guaranteed output remaining counted when it exceeds the rounded expectation;
- Embergrain-style processing output counting estimated Straw;
- ready-to-collect product crafts retaining expected output;
- unstarted crafting routes contributing no output;
- gathering-route byproducts such as Gypsite and Resin contributing no output;
- Planner UI and compact payloads distinguishing guaranteed and estimated active output;
- Needs Board, fishing projections, Gather Next, and Discord reports using the same coverage total;
- legacy `plannedOutput` remaining ignored.

## Compatibility

Source selection, craft-player selection, route selection, safety buffers, active-craft discovery, inventory counting, and informational expected-yield guidance remain unchanged.

This is a refinement of active-craft coverage, not a return to planned-output forecasting.
