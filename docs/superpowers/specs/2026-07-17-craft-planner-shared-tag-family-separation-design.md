# Craft Planner Shared-Tag Family Separation

## Problem

The Craft Planner Needs Board currently treats an API tag as a material-family identity unless the item name can be promoted to a longer row containing every word from that tag's existing row. All Braxite items use the API tag `Pebbles`, but `Braxite` is a same-length sibling name and does not contain `Pebbles`. Braxite therefore receives the `tag:Pebbles` identity and its quantities are added to the Pebbles row.

The same failure mode exists for other broad tags in the operational recipe-input catalog. The current audit found 22 same-row/same-tier collisions under seven tags: `Pebbles`, `Glass`, `Raw Meat`, `Ancient Hieroglyphs`, `Animal Food`, `Domesticated Animal Materials`, and `Tamed Animal`.

## Design

The shared planner taxonomy will distinguish an API classification tag from a canonical material-family identity.

- A declarative set of shared-tag family rules will match exact semantic family phrases in item names and return the canonical row, section, and stable family key.
- Quality and tier variants of one family will continue to share a row. For example, Rough through Flawless Braxite will share `row:Braxite` and occupy T1 through T10.
- Distinct families under one API tag will receive independent rows and override keys.
- The ordinary/base family retains its existing tag key where one exists. For example, Pebbles retains `tag:Pebbles`, while Braxite receives `row:Braxite`.
- Items under a declared shared tag that do not match a declared family will fall back to their exact item identity and full name instead of silently joining the tag row.
- Unknown, uncurated tags will also use exact item identity. This favours a visible extra row over an incorrect aggregate until the taxonomy explicitly recognises the family.
- Icons will remain display metadata only. They cannot be family identity because Stone Carvings and Stone Diagrams, and Raw Skitch Meat and Raw Crab Meat, reuse icons.

## Affected Families

The initial rule set will cover the current operational catalog audit:

- Mining: Pebbles and Braxite.
- Masonry: Glass and Sea Glass.
- Hunting: Raw Meat, Oyster Meat, Raw Skitch Meat, and Raw Crab Meat.
- Scholar: Hieroglyphs, Stone Carvings, and Stone Diagrams.
- Taming: Nubi Goat Food, Nubi Goat Vitamins, Sagi Bird Food, Sagi Bird Vitamins, distinct domesticated-animal materials, and distinct captured/domesticated animals.
- Existing Brick and Unfired Brick separation remains unchanged.

## Data Flow and Compatibility

`plannerTaxonomyFor` and `plannerOverrideKeyFor` remain the shared seam used by server-side craft-plan calculation, the frontend Needs Board, effort grouping, and Discord reports. No database schema or API response shape changes are required.

Existing unambiguous tag overrides continue to work. An override for a formerly combined tag applies only to the retained base family, where one exists. Newly split families receive independent `row:<family>` keys and use their canonical section/name until an administrator configures them independently. This mirrors the existing Brick/Unfired Brick behaviour.

## Verification

Regression coverage will prove that:

1. Pebbles and Braxite render as separate rows while all ten Braxite tiers stay in one row.
2. Every audited shared-tag family receives a distinct canonical row and key.
3. An unmatched item under a shared tag and an unknown uncurated tag use exact item identity rather than a shared tag key.
4. Existing ordinary families and Brick/Unfired Brick identities remain compatible.
5. Server-side section and row-name overrides target only the intended split family.
6. Focused tests, the full application test suite, and the production build pass.
