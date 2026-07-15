# Craft Planner Material Family Identity

## Problem

The Needs Board currently uses a material's section-override key as its displayed-row grouping key. Materials that share an API tag therefore collapse into one row even when they are separate product families. In the live plan, `Brick` and `Unfired Brick` both use the `Brick` tag, so Unfired Brick quantities are added to the Brick cells and its row disappears.

## Design

The planner will derive a stable material-family identity from the canonical row name produced by the existing taxonomy logic. That identity will be used for both displayed-row grouping and row-level configuration.

- Quality and tier variants belonging to the same family will continue to share a row. For example, Sturdy Unfired Brick and Fine Unfired Brick will appear in the `Unfired Brick` row under T3 and T4.
- Distinct families that happen to share an API tag will remain separate. `Brick` and `Unfired Brick` will have independent rows and independent override keys.
- Existing ordinary tag-based identities will remain unchanged when the canonical family name matches the API tag, preserving current configuration wherever no collision exists.
- No brick-specific exception will be introduced; the correction will apply to any future shared-tag family collision.

## Data Flow

The server-side craft-plan result will expose the stable family override key for each material. The frontend Needs Board will group materials by that key while continuing to use the existing taxonomy name for display and ordering. Cell totals will therefore aggregate only within a family and tier.

## Compatibility

Existing overrides keyed to unambiguous tags will continue to work. A previously shared `tag:Brick` override will no longer control both families; Brick retains the tag identity, while Unfired Brick receives a distinct family identity. This is intentional because the two rows must be independently configurable.

## Verification

Regression coverage will prove that:

1. Brick and Unfired Brick remain separate despite sharing the `Brick` tag.
2. T3 and T4 Unfired Brick variants remain combined into one family row.
3. Quantities are assigned to the correct family and tier.
4. Row-name and section overrides can target the two families independently.
5. Existing Needs Board tests, the complete application test suite, and the production build pass.
