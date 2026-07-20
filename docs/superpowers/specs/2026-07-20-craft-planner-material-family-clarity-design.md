# Craft Planner Material Family Clarity

## Goal

Clarify that the Craft Planning shortage summary counts distinct materials, and group six cross-tier material families into one Needs Board row per family.

## Summary copy

- Change the summary card label from `Materials missing` to `Materials still short`.
- Change its supporting copy to `different materials after stock and tracked crafts`.
- Change the page-header metadata from `<count> missing items` to `<count> materials still short`.
- Keep the numeric value unchanged: it counts material records whose remaining `missing` quantity is greater than zero, not total missing units.

## Needs Board taxonomy

Use stable BitJita catalog tags as family identities and show each tier in the existing T1–T10 columns:

- `Timber` → Carpentry / `Timber`
- `Roots` → Foraging / `Plant Roots`
- `Brick Slab` → Masonry / `Brick Slab`
- `Nail` → Smithing / `Nails`
- `Rope` → Tailoring / `Rope`
- `Thread` → Tailoring / `Spool of Thread`

The taxonomy change must preserve separate exceptional families such as Ancient Nails, Rope Packages, and profession-dungeon loot because their catalog tags differ from the six approved tags.

## Verification

- Add a regression test using real Exquisite and Peerless catalog names/tags for all six families.
- Assert each family produces one row with T5 and T6 cells and a stable tag-based override key.
- Add copy boundary coverage for the summary card and header metadata.
- Run focused tests, the production build, and the full app test suite before pushing.
