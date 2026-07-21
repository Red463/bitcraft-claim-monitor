# Craft Planner Producer Route Availability Design

## Goal

Keep genuine processing routes visible and selectable even when validated probability values are temporarily unavailable. Prevent packaging conversions from replacing normal production routes in the Craft Planner.

This addresses the shared failure behind examples such as:

- Exquisite Wispweave Filament selecting `Unpack {1}` instead of processing an Exquisite Wispweave plant through its products output.
- Rough Straw showing no acquisition route even though Embergrain and rice processing can produce it.
- Any other item-list or byproduct output losing its producer relationship when the probability snapshot is unavailable.

The Needs Board continues to group rows by the existing item family/tag. Detail-dialog titles continue to show the exact tiered item name, such as `Exquisite Wispweave Filament`.

## Domain model

Producer relationships and numeric yield confidence are separate facts:

- A producer relationship answers, "Which recipe or gathering route can produce this item?"
- Probability status answers, "Can the planner safely calculate expected and guaranteed quantities for this route?"

Losing a validated probability snapshot may make yield-dependent calculations unavailable, but it must not erase known producer relationships or turn the item into a gathered/vendor source.

Transport conversions are logistics routes rather than default production routes. Pack, unpack, and equivalent cargo/item conversions remain catalogued and may remain available through an explicit route override or a clearly labelled logistics alternative, but automatic production selection must never choose them.

## Catalogue and planner data flow

The local catalogue repository continues to store direct recipe links, item-list/byproduct producer links, item/cargo identity, transport classification, and the latest validated probability snapshot.

`collectLocalCatalogCraftPlanDetails` will always load and traverse known item-list/byproduct producer links. Requiring validated probabilities will affect only the availability of numeric yield fields; it will no longer remove producer links, probabilistic recipes, or item-list possibilities from the route graph.

Each probabilistic route will carry an explicit status:

- `validated`: expected and guaranteed quantities came from the current or last successfully published validated snapshot.
- `unavailable`: the producer relationship is known, but no validated yield is available.

When the status is `validated`, existing expected-output, buffered craft-count, effort, and input-expansion calculations continue normally.

When the status is `unavailable`:

- The real producer recipe, station or activity, and immediate source chain remain visible.
- Yield-dependent quantities and effort are displayed as unavailable rather than estimated from flattened or incomplete values.
- Recursive material expansion stops at the unavailable yield edge because the planner cannot safely determine the required input quantity.
- The affected item remains a production dependency with a data-quality warning; it is not silently treated as gathered.

Failed catalogue refreshes continue to retain the last successfully published probability snapshot transactionally. The unavailable state therefore applies only when a database has never completed probability publication or the stored snapshot is genuinely absent.

## Route selection

Automatic route selection follows this order:

1. A valid explicit route override.
2. A valid non-transport production route.
3. No automatic production route.

It must not fall back to a transport route. Transport recipes remain distinguishable in route metadata so the UI and planner cannot accidentally present an unpack operation as the normal way to manufacture an item.

For an item-list output with several producers, all valid non-transport producer routes remain available for comparison and route override. This includes every catalogued Embergrain or rice producer for Straw rather than a hard-coded Embergrain-only mapping.

No item-name, tier-name, family-name, or recipe-name heuristic will be added to reconstruct producer relationships. BitJita and the normalized catalogue remain the source of truth.

## User interface

The existing Needs Board family grouping and exact tier-cell behaviour remain unchanged.

The "How to get this" panel will:

- Prefer and display the selected non-transport producer chain.
- Show all eligible producer alternatives through the existing route-selection affordance.
- Label unavailable probabilistic quantities clearly, for example `Validated output rate unavailable`.
- Explain that the route is known but required completions and inputs cannot be calculated until a validated probability snapshot is available.
- Avoid the current copy that says the item is treated as a raw gathered/vendor input when a producer relationship is known.

Package conversions will not appear as the automatically selected craft route. If surfaced as an alternative, they must be explicitly labelled as logistics rather than production.

## Error handling and diagnostics

Catalogue diagnostics will distinguish these states:

- Producer relationship missing from the catalogue.
- Producer relationship available but validated probability unavailable.
- Producer relationship and validated probability both available.
- Only transport conversions available.

Warnings remain additive and item-specific enough to identify the affected catalog key. A probability refresh failure must not delete the last valid snapshot or compatibility aggregates.

## Verification

Implementation begins with a regression test that reproduces both user-visible symptoms under `requireValidatedProbabilities: true` and no probability snapshot:

- A byproduct output with a real producer and an unpack recipe must retain the real producer and must not select unpack automatically.
- A byproduct-only output must retain and display its producer relationship instead of appearing source-less.

Additional generic coverage must prove:

- Multiple non-transport producers remain available.
- Unavailable probabilities suppress unsafe numeric calculations only.
- Validated snapshots continue producing the existing expected and guaranteed calculations.
- An explicit transport override remains possible if current route-override compatibility requires it.
- Automatic production selection never returns a route marked as transport.
- Failed probability publication preserves the previous validated snapshot and route calculations.
- Family grouping and exact tiered modal titles remain unchanged.

The focused planner and catalogue tests, full application test suite, production build, and a browser smoke check of Wispweave Filament and Straw are required.

## Non-goals

- Renaming exact tiered items in the detail dialog.
- Changing Needs Board family grouping.
- Guessing probabilities from item or recipe names.
- Treating BitJita flattened item-list values as validated probability data.
- Redesigning the Craft Planning page or route-selection interface.
- Changing stock, active-craft, or guaranteed-output accounting outside the unavailable-probability edge.

## Acceptance criteria

- The Filament family remains one Needs Board row, and the T5 modal remains titled `Exquisite Wispweave Filament`.
- Exquisite Wispweave Filament defaults to its Wispweave plant processing chain rather than `Unpack {1}`.
- Rough Straw lists Embergrain and every other valid catalogued processing route.
- The same behaviour applies to every item-list/byproduct output without item-specific exceptions.
- Missing validated probabilities produce an honest unavailable state without hiding routes or inventing quantities.
- A failed refresh keeps the last validated snapshot and its working planner calculations.
- Automatic production selection never chooses a package transport conversion.
