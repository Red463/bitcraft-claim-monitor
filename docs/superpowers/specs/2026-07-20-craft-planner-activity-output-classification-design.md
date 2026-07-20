# Craft Planner Activity and Output Classification

## Goal

Classify Craft Planner acquisition routes by where the player performs the action and classify each result independently by whether it is guaranteed. Gathering is reserved for obtaining something directly from a world resource node. Any action performed at a bench, station, camp, or other workstation is crafting, regardless of the profession it trains or requires.

This fixes station recipes such as splitting a Simple Wood Trunk being presented as a gathering byproduct merely because the recipe requires Forestry.

## Domain rules

Profession and activity type are separate concepts:

- `skillName` continues to describe the profession requirement and planner section.
- `activityKind` describes how the player performs the action: `craft` or `gathering`.
- A workstation requirement always makes the action `craft`.
- A route is `gathering` only when it is explicitly known to represent direct acquisition from a world resource node.
- Output certainty is independent of activity type.

The resulting presentation matrix is:

| Activity | Guaranteed result | Non-guaranteed result |
| --- | --- | --- |
| World resource node | Gathering output | Gathering byproduct |
| Bench or station | Craft output | Craft byproduct |

An item-list result is guaranteed when its guaranteed yield is equal to its expected yield, allowing for a small numeric tolerance. A result with expected yield above its guaranteed yield is variable.

## Catalog representation

Add `activityKind` to normalized recipe records and persist it as `activity_kind` in the local game catalog. The database column will default to `craft` so existing workstation recipes cannot continue to be mislabeled as gathering before their next refresh.

Recipe normalization will preserve provenance rather than merging every recipe source without its meaning:

- Entries from `craftingRecipes` are `craft`.
- Entries from `extractionRecipes` are `gathering` only when they have no workstation requirement; a workstation requirement takes precedence and makes them `craft`.
- Synthetic routes created for known world resource-node output records are explicitly `gathering`.
- `recipesUsingItem` entries reuse an authoritative matching recipe classification when available. A standalone reference defaults to `craft`; it must not be inferred as gathering from its profession name.

The local catalog repository will write and read this value, and planner recipe reconstruction will expose it. The Forestry/Fishing/Foraging/Mining skill-name set will no longer decide activity type.

## Planner route classification

Route classification will combine activity type and output certainty:

- `craft` plus guaranteed result becomes a normal craft route.
- `craft` plus variable result becomes a craft-byproduct route.
- `gathering` plus guaranteed result becomes a gathering-output route.
- `gathering` plus variable result becomes a gathering-byproduct route.

The existing gathering-route preference will continue, but it will apply only to routes explicitly classified as world-node gathering. Workstation recipes will remain eligible for normal recipe selection and route overrides.

Existing expected-yield, guaranteed-yield, action-count, input-expansion, multiplier, and stock calculations remain unchanged. This design changes classification and presentation, not quantities.

## User interface

The "How to get this" panel will use route-specific language:

- Normal craft routes show the recipe, workstation, inputs, and craft count.
- Variable workstation results are labelled `Craft byproduct` and retain their recipe inputs and processing actions.
- Direct world-node results are labelled `Gathering output`.
- Variable world-node results are labelled `Gathering byproduct` and retain expected-yield wording per gathering action.

For "Split into Simple Wood Log Output", the panel must present:

- Activity: craft.
- Workstation: Tier 2 Forestry Station, using the catalog's current station name.
- Input: one Simple Wood Trunk per craft.
- Guaranteed output: six Simple Wood Logs per craft.
- Variable craft byproduct: Simple Amber Resin.

The profession may still be shown as Forestry, but it must not change the activity wording.

## Data migration and refresh

The schema change must be additive and preserve existing catalog data. Existing rows receive the safe default `craft`. Subsequent catalog refreshes populate explicit activity metadata from the API recipe source and synthetic world-node construction.

No destructive migration or catalog reset is required. If production needs genuine gathering routes classified immediately after deployment, the existing catalog refresh operation can be run once; otherwise the scheduled refresh will update them.

## Tests and verification

Add focused coverage for:

- The exact Simple Wood Log fixture: Forestry Station, one trunk input, six expected logs, six guaranteed logs, and variable resin.
- A workstation recipe remaining `craft` when its profession is Forestry, Fishing, Foraging, Hunting, or Mining.
- A true world resource-node route being classified as gathering.
- Guaranteed and variable results being classified independently from activity type.
- Catalog normalization, persistence, migration default, and reconstruction of `activityKind`.
- The "How to get this" panel rendering craft, craft-byproduct, gathering-output, and gathering-byproduct wording correctly.
- Existing route selection, required quantities, and expected-yield calculations remaining unchanged.

Verification requires the application build and full test suite because the change touches catalog persistence, planner logic, and frontend route rendering.

## Non-goals

- Changing BitJita recipe quantities or probability interpretation.
- Changing profession section assignment.
- Redesigning the Craft Planner dialog.
- Reworking stock, active-craft, or progress accounting.
- Inferring gathering from recipe names, profession names, or broad item tags.

## Acceptance criteria

- Simple Wood Log is presented as the guaranteed output of a Forestry Station craft, not as a gathering byproduct.
- Simple Amber Resin is presented as the variable craft byproduct of that recipe.
- No bench or station action is labelled gathering.
- Only explicitly identified world resource-node acquisition routes use gathering language.
- Guaranteed and variable quantities remain numerically unchanged.
- Existing catalog data survives the additive migration.
