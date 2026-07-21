# Passive Crafts in Craft Planning

## Goal

Count live passive crafts, such as growing crops, toward the shared settlement Craft Planning board so materials already being produced are not planned twice.

## Scope

- Reuse the players selected under **Tracked crafts**. Do not add another player selector or toggle.
- Load each selected player's BitJita passive crafts alongside their normal active crafts.
- Count only passive records whose status is `processing` or `complete`. Passive crafts are not modelled as queued.
- Treat `processing` as **Passive craft in progress** and `complete` as **Passive craft ready to collect**.
- Keep the existing shared-plan behavior: passive output changes material coverage for every user viewing the board.

## Data Flow

For each configured craft-tracked player, the server requests `/players/{id}/passive-crafts?status=all`. A focused normalizer filters unsupported states and converts passive records into the planner's existing tracked-output shape without mixing them with ordinary craft identity.

Passive direct outputs and item-list products use the same catalogue probability expansion as normal active crafts. Deterministic quantities are guaranteed. Probabilistic co-products contribute their expected quantity to material planning and their guaranteed minimum to confirmed progress, matching the current planner model.

The planner deduplicates passive records by their passive craft identity before aggregating quantities. Passive craft IDs are kept distinct from ordinary craft IDs so the two sources cannot overwrite one another.

## User Interface

Item details identify passive sources separately from ordinary active crafts and show:

- the contributing player;
- the reported structure;
- whether the craft is in progress or ready to collect;
- expected versus guaranteed quantity under the existing planner wording; and
- a short note that BitJita does not report the passive craft's settlement location.

No new board column or planner configuration control is added.

## Failure Handling

A passive-craft request failure is isolated to that player. Normal stock, inventories, and active crafts continue to calculate. The planner reports the unavailable passive source in its existing source diagnostics rather than treating the missing data as zero with no explanation.

Malformed records, records without usable outputs, and statuses other than `processing` or `complete` are ignored safely.

## Tests

Focused tests will cover:

- processing passive crafts counted as in-progress output;
- complete passive crafts counted as ready-to-collect output;
- deterministic and probabilistic farming product expansion;
- unsupported statuses excluded;
- passive and ordinary craft identities kept separate;
- per-player passive API failure surfaced without breaking the plan; and
- the item-detail source labels and location warning.

The completed implementation must pass the focused planner tests, full application test suite, and production build.
