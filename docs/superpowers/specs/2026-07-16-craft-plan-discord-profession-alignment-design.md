# Craft Plan Discord Profession Alignment Design

## Goal

Make Craft Planner profession names and progress consistent between the Needs Board, row override editor, effort calculation, and Discord reports. Prefix Craft Planner Discord notification titles with the configured plan name.

## Root Cause

The planner currently uses two names for the same profession:

- The Needs Board taxonomy stores and displays `Leatherwork`.
- Craft Plan configuration and Discord reports use `Leatherworking`.

Effort progress therefore records the section under `Leatherwork`, while Discord normalizes the displayed profession to `Leatherworking` and looks for an exact `Leatherworking` effort key. The missing lookup is converted to zero, producing the incorrect `0.0%` value even when requirements have progressed.

The Needs Board row override dialog has a related source-of-truth error. The board groups known material families using planner taxonomy, but the dialog initializes its section selector from the raw API/recipe section. A leather material may therefore appear under the leather section while its editor selects `Carpentry`. Resetting the row is also labelled `Use API defaults`, although the board actually falls back to planner taxonomy.

## Canonical Profession Name

Use `Leatherworking` as the canonical planner section name. Update the Needs Board taxonomy section order and row mapping from `Leatherwork` to `Leatherworking`.

This is compatible with persisted Craft Plan configuration because the server already accepts `Leatherworking` and does not accept `Leatherwork` as a saved section override. Other planner section names are outside this focused change.

Discord continues to accept both `leatherwork` and `leatherworking` as input aliases so existing commands and saved report rules remain compatible.

## Needs Board Row Editor

When opening the row override dialog:

- If the row has an explicit section override, select that override.
- Otherwise, select the section containing the row on the currently rendered Needs Board.
- Do not initialize the selector from the raw API/recipe section.

Update the explanatory copy to describe the planner default rather than the API default, and rename the reset action to `Use planner defaults`. Resetting continues to remove both the section and display-name overrides.

The correction applies to every taxonomy-grouped Needs Board row, not only leather materials.

## Effort and Discord Alignment

Effort calculation will naturally emit `Leatherworking` after the taxonomy rename. Discord report construction will also resolve effort sections through the existing profession normalizer instead of relying only on exact object keys. This compatibility lookup protects reports built from an older in-memory or persisted effort snapshot that still contains `Leatherwork`.

Discord material grouping will continue to hide taxonomy-hidden inputs. For visible rows, an explicit section override takes precedence over the taxonomy section so report grouping matches the effort model and the section chosen in Manage Plan.

Missing profession effort must not silently become `0.0%`. If no normalized effort section can be found for a requested profession, or for any visible profession in the overview grid, the existing unavailable-progress state is used rather than presenting false progress.

## Notification Titles

Read the configured title from `plan.config.name`, with `plan.name` as a compatibility fallback. Trim it before use.

When a non-empty plan name is available:

- Overview: `T6 Push - Crafting Progress`
- Profession-specific: `T6 Push - Leatherworking Progress`

When the plan name is empty or unavailable, retain the current generic titles:

- `Crafting Progress`
- `Leatherworking Progress`

Use the same title builder for ready, complete, disabled, empty, unknown-profession, empty-profession, and effort-unavailable reports created from a plan. The standalone unavailable-report helper has no plan context and remains `Crafting Progress`.

Discord embed sanitization and the existing 256-character title bound remain the final output boundary. Mentions remain suppressed.

## Testing

Follow test-driven development with focused regressions:

- A leather material classified by taxonomy produces a `Leatherworking` Needs Board group.
- Opening a taxonomy-grouped row uses its visible board section rather than a conflicting raw API section.
- The dialog copy and reset action refer to planner defaults.
- Leatherworking effort stored under either `Leatherworking` or legacy `Leatherwork` produces the correct non-zero Discord percentage.
- Explicit section overrides control both Discord material grouping and effort lookup.
- Overview and profession-specific reports include the configured plan name.
- Blank or unavailable plan names retain generic titles.
- Missing profession effort produces an unavailable report rather than a false `0.0%` value.

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Because the change affects frontend interaction and Discord output, browser-check the Needs Board row editor on the stable smoke server. Do not send a real Discord notification during verification.

## Non-goals

- No redesign of the Needs Board or Manage Plan dialog.
- No broad renaming of unrelated planner sections.
- No change to effort weighting or coverage rules.
- No Discord schedule, permission, channel, or delivery changes.
- No database migration, new dependency, changelog entry, or version bump during ordinary implementation.
