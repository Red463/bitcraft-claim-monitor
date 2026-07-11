# Personal Fishing Route View

## Summary

Add a user-only fishing preference to the Craft Planning Needs Board. Each user can choose whether their board expresses unresolved Fish Oil demand as Ocean Fish or Lake Fish without changing the shared admin craft plan or another user's view.

The calculation must account for all interchangeable stock and tracked craft output before converting the remaining Fish Oil requirement into the selected fish route.

## User Experience

- Add a compact segmented control to the Fishing section header with two options:
  - `Ocean`
  - `Lake`
- Default to `Ocean` to preserve the current board presentation.
- Persist the selection in browser-local state under a key such as `planning.fishingRoute`.
- Show only the selected raw-fish route row for interchangeable Fish Oil demand.
- Keep unrelated Fishing rows such as Baitfish and Crushed Shells unchanged.
- Keep the Fish Oil row visible because it communicates the processed material requirement and its current coverage.
- The preference must not modify admin route overrides, saved plan settings, or other users' views.

## Calculation Contract

For each tier, calculate the unresolved Fish Oil requirement before converting it to a fish quantity.

Count the following toward Fish Oil coverage:

- Fish Oil already present in all counted inventory sources.
- Fish Oil output from tracked crafts, including completed uncollected crafts.
- Ocean Fish already present, converted using the selected verified Ocean Fish recipe yield.
- Lake Fish already present, converted using the selected verified Lake Fish recipe yield.
- Relevant tracked fish-processing craft output where it produces Fish Oil.

The remaining oil-equivalent demand is:

```txt
remainingOil = max(0, requiredOil - availableOilEquivalent - trackedOilOutput)
```

The displayed preferred fish quantity is:

```txt
preferredFishNeeded = ceil(remainingOil / guaranteedOilYieldPerFish)
```

Use the guaranteed output quantity from the normalized local catalog. Do not average a guaranteed range or infer yields from item names. For example, an Ocean Fish route with a guaranteed minimum of 3 Fish Oil uses `3`, while a Lake Fish route yielding 1 uses `1`.

Existing stock of either fish type reduces the shared oil-equivalent deficit regardless of the user's selected display route. This prevents the board from asking a Lake-preferring user to gather oil already covered by stored Ocean Fish, and vice versa.

## Data Flow

The server remains responsible for the authoritative shared plan, inventory totals, tracked crafts, route alternatives, and catalog yields. It should expose enough normalized route contribution data for the frontend to calculate the personal route view without changing the saved plan.

The frontend applies the persisted Ocean/Lake preference to the Fishing Needs Board presentation. The derived view must not write back to the plan API.

If the server response does not contain a verified route or guaranteed yield for the selected fish type, retain the shared plan's existing Fishing rows and show a compact unavailable message beside the selector. Do not guess a conversion.

## Multi-User Behaviour

This feature is a personal calculation view, not a gathering assignment system. Multiple users can choose different routes and each will see the full remaining requirement after current stock and tracked crafts are deducted.

The app cannot subtract another user's intended future gathering without a separate shared commitment feature. No commitment, quantity entry, reservation, or assignment workflow is included in this change.

## Components And Boundaries

- `CraftPlanningPage` owns the persisted preference and selector.
- A pure fishing-route calculation helper converts shared Fish Oil demand and route contributions into the selected fish requirement.
- The Needs Board builder accepts the derived Fishing presentation without changing grouping for other activities.
- The server planner exposes normalized fish route yields and interchangeable stock contributions from the local catalog.

## Error Handling

- Missing catalog route: preserve the current board data and mark the selected preference unavailable.
- Invalid persisted preference: normalize to `ocean`.
- Zero remaining oil demand: show the selected fish row as covered or omit it consistently with the board's existing covered-row behaviour.
- Catalog values with no positive guaranteed yield: reject the conversion and report catalog diagnostics rather than dividing by an inferred value.

## Testing

- Ocean preference converts remaining Fish Oil demand using the verified Ocean Fish guaranteed yield.
- Lake preference converts the same demand using the verified Lake Fish guaranteed yield.
- Existing Fish Oil, Ocean Fish, and Lake Fish all reduce the remaining oil-equivalent requirement.
- Tracked Fish Oil crafts reduce the remaining requirement.
- Completed uncollected Fish Oil crafts are counted.
- The result rounds up to a whole fish.
- The result never becomes negative.
- Switching the preference changes only the local board presentation.
- Admin route overrides and persisted plan settings are not modified.
- A missing or invalid route yield does not trigger name-based or average-yield fallback logic.
- The preference persists across refreshes in the same browser.

## Non-Goals

- Coordinating or assigning gathering work between users.
- Allowing users to enter a quantity.
- Replacing the admin's shared recipe-route controls.
- Applying personal route preferences to non-fishing materials in this change.
