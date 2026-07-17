# Craft Plan Smithing Route Recovery Design

## Goal

Restore the missing Refined Ferralith Ingot, Ferralith Ingot, molten metal, and ore dependency chain in Craft Planning while keeping package and unpack routes available as explicit alternatives.

Production recipes must be preferred automatically. Transport routes must remain visible in route selectors and may become the default only when no valid production route exists.

## Root Cause

BitJita's item detail payload contains correct stack identities alongside incorrect parallel display metadata for several tier-one smithing recipes.

For example:

- Refined Ferralith Ingot correctly consumes item `1050001`, but the matching display entry calls it `Exquisite Construction Materials Pack`.
- Ferralith Ingot correctly outputs item `1050001`, but its recipe and output display are also labelled as the construction-materials pack.
- The affected stack entries are ordinary items, not cargo.

The local catalog currently classifies a recipe as transport when package-related words appear anywhere in the recipe or display text. It therefore marks genuine all-item smithing recipes as package routes. Craft Planning then excludes those recipes from automatic selection, so dependency expansion stops at Refined Ferralith Ingot and never reaches ordinary ingots or ore.

## Catalog Identity and Transport Classification

Treat the typed recipe stacks as authoritative for identity and transport structure:

- Match items by the combination of `kind` and `id`.
- Preserve `itemType` semantics: regular items are `items`; cargo is `cargo`.
- Do not let a contradictory parallel display name change an item's identity or route type.

A recipe may be classified as a transport route only when both conditions are true:

1. At least one consumed or crafted stack is cargo.
2. The recipe, station, or cargo-aligned display metadata indicates packaging, unpacking, bundling, crating, or transport.

This keeps genuine cargo production such as metal frames available as a production recipe while preventing an all-item smithing recipe from becoming transport merely because BitJita supplied a misleading `Pack` label.

Apply the same structural safeguard when reading existing normalized recipe rows. This makes already-stored false transport flags harmless immediately, without waiting for the entire catalog to refresh.

Increment the game-catalog normalization version so the normal refresh process rebuilds persisted flags using the corrected classifier. This is a data refresh, not a destructive schema migration.

## Canonical Route Labels

When a direct all-item recipe's transport-looking name contradicts the canonical identity of its primary output, display a neutral label derived from the output entity, such as `Craft Ferralith Ingot`.

Keep correct recipe names unchanged. Route IDs and saved route overrides continue to use stable recipe identifiers, so correcting display text does not invalidate existing configuration.

## Route Selection Policy

Use the following precedence for every Craft Planning route selection:

1. A valid explicit route override selected by the user.
2. The first valid non-transport route in the existing recipe preference order.
3. The first valid transport route when no non-transport route is available.

A valid route must still pass the existing recursion and blocked-input checks. Package and unpack recipes must not create an infinite dependency cycle.

Route alternatives returned to the UI must include both production and transport recipes. Therefore:

- A material with a production and an unpack route defaults to production and lists unpack in the dropdown.
- Selecting the unpack route explicitly is honoured.
- A material with only an unpack route defaults to unpack and exposes its package input.
- A route whose input would immediately recurse into an already-active dependency remains ineligible for automatic expansion.

No UI redesign is required; the existing route dropdown continues to render the alternatives supplied by the planner.

## Dependency Expansion

With the corrected catalog and selection policy, the normal planner recursion expands:

```text
Refined Pyrelite Ingot
  -> Refined Ferralith Ingot
  -> Ferralith Ingot
  -> Molten Ferralith
  -> Ferralith Ore Concentrate
  -> Ferralith Ore Piece
  -> Ferralith Ore Chunk
```

Stock allocation, active-craft coverage, required quantities, profession grouping, and route overrides continue to use the existing calculation model.

## Testing

Follow test-driven development with focused regressions:

- A live-shaped Refined Ferralith payload with a misleading item display is normalized as a production recipe.
- A live-shaped Ferralith Ingot payload with a misleading recipe/output name is normalized as production and receives a canonical display label.
- Existing normalized all-item recipes with stale false transport flags are treated as production when read.
- Genuine package and unpack recipes remain transport routes.
- A production route is selected ahead of a transport route.
- Transport routes remain present in route alternatives and the route dropdown data.
- An explicit transport-route override is honoured.
- A transport route is selected automatically when it is the only valid option.
- Blocked package cycles do not recurse indefinitely.
- The Refined Pyrelite scenario expands through Refined Ferralith to Ferralith ore requirements.

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

No live Discord notifications or external mutations are needed for verification.

## Non-goals

- No Craft Planning layout or dropdown redesign.
- No change to stock counting, active-craft coverage, or effort formulas.
- No broad correction of unrelated BitJita display metadata.
- No new route-priority database model.
- No new dependency or framework.
- No changelog entry, package-version bump, deployment, or push during ordinary implementation unless requested.
