# Animal Carcass Identity Design

## Problem

The live BitJita recipe catalog can identify a hunted animal input by its gendered creature cargo while the collected carcass uses a shared cargo identity. Craft Planning currently matches stock by exact `kind:id`, so collected stock is not credited to those requirements.

Confirmed live catalog mappings on 2026-07-15:

- `cargo:3` Female Cervus becomes `cargo:4` Cervus when collected.
- `cargo:5` Female Scrofa becomes `cargo:6` Scrofa when collected.

Other Animal cargo entries, including `cargo:7` Elder Scrofa, remain distinct.

## Design

Normalize the two confirmed gendered cargo identities while converting recipe input stacks into planner materials. The normalized material uses the collected cargo ID and name, allowing the existing exact-key stock accounting to count inventory without duplicating quantities.

Use an explicit mapping rather than a name/tier heuristic. This prevents unrelated animals from being pooled and makes future catalog changes reviewable.

## Verification

Add behavior-level tests through `computeCraftPlan` proving that:

- Cervus stock satisfies a Female Cervus recipe requirement.
- Scrofa stock satisfies a Female Scrofa recipe requirement.
- Scrofa stock does not satisfy an Elder Scrofa requirement.

Run the focused Craft Planning tests, the full application test suite, and the production build.
