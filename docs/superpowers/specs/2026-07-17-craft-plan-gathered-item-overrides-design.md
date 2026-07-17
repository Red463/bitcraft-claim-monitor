# Craft Plan Gathered-Item Overrides

## Goal

Allow an administrator to mark the exact Craft Planning cell they opened as gathered rather than crafted. The marked material remains a required item with normal stock and active-craft accounting, but the planner stops looking for recipes that produce it.

This addresses circular or misleading catalog routes such as Stone Carvings being presented as obtainable from packages that themselves require Stone Carvings.

## Expansion Boundary

The override stops dependency expansion toward the marked material's producers and their ingredients. It does not remove recipes that consume the marked material.

For example:

```text
Planned package
  -> requires Stone Carvings
     -> stop; gather or stock Stone Carvings
```

Stone Carvings remains visible as a requirement and its `Used for` context continues to show the planned package. A package that appears only as an alleged way to obtain Stone Carvings disappears from the requirement chain. A package that is independently required by another target remains.

## Override Identity and Persistence

Persist the override in the existing craft-plan configuration as a set of typed item keys, preserving the distinction between ordinary items and cargo. Each key uses the existing `kind:id` identity.

The control applies to the exact tier cell opened, not to the whole material family. When one displayed cell represents multiple underlying item identities, one toggle operation adds or removes every identity represented by that cell. This keeps the UI unit and saved operation aligned.

Configuration normalization must:

- accept only valid, non-empty typed item keys;
- remove duplicates and produce stable ordering;
- default safely to an empty set for existing plans;
- preserve the field through Manage Plan loads and saves.

Existing recipe-route and safety-buffer settings for a marked key remain stored but dormant. They are ignored while the gathered override is active and become effective again if the override is removed.

## Planner Calculation

Pass the normalized gathered-key set through both local catalog traversal and requirement calculation.

When requirement recursion reaches a gathered key:

1. Resolve its canonical display metadata where available.
2. Allocate counted stock and guaranteed active output using the existing rules.
3. Add the full required quantity to the material requirement map.
4. Do not select a producer recipe, add a producer step, recurse into producer inputs, apply a probabilistic safety buffer, or expose producer routes.

Local catalog traversal should load enough identity data to display the marked item, then stop traversing its producer/byproduct graph. This prevents misleading package routes from being pulled into the detailed plan or generating related catalog warnings.

Each returned material should state whether it is covered by the gathered override. Source-route output for a gathered material must be empty even when the catalog contains recipes or a saved route override.

Stock counts, missing quantities, section/row grouping, downstream usages, targets, active-craft coverage, and progress formulas otherwise remain unchanged.

## Item Detail Interface

Add the control to the existing `How to get this` card in the cell detail dialog.

For authenticated administrators:

- Show a compact `Treat this cell as gathered` checkbox/toggle with helper text explaining that it stops producer-recipe expansion while retaining the item as a requirement.
- Save immediately through the existing authenticated Craft Plan endpoint and CSRF protection.
- Disable the control while saving and expose success or error feedback using the dialog's existing status patterns.
- Keep the dialog open and refresh its plan/detail data so the new state is visible immediately.

For ordinary users, do not show an interactive control.

When the override is active for the cell:

- Replace recipe-route content with a concise gathered-source explanation.
- State that the item must be gathered or supplied from counted stock.
- Show a normal in-app link to `/?page=map`, labelled `Open Map resource finder`.
- Keep the `Used for` section visible.

The Map page does not currently support resource-item preselection in its URL, so this version links to the resource finder without claiming to preselect the material.

If a cell ever contains a mixture of marked and unmarked underlying keys because catalog grouping changed, the interface should disclose that mixed state. The next toggle action normalizes the entire currently displayed cell to either marked or unmarked.

## Audit Behaviour

Treat gathered-item changes as explicit enable/disable audit events rather than a generic settings save.

Each event records:

- the administrator already captured by the existing audit route;
- category `Gathered item`;
- the typed item identity;
- the best available item name, with the typed key as a fallback;
- whether the override was enabled or disabled.

When a multi-identity cell is toggled, record one change for each underlying item identity whose saved state changed. The Manage Plan Audit tab renders these alongside its existing source-toggle events.

## Error Handling and Compatibility

- Existing saved plans require no migration because a missing override field normalizes to an empty set.
- A failed save leaves the prior planner state in place and presents the error in the detail dialog.
- Missing catalog detail must not prevent an administrator from marking an already displayed cell as gathered.
- Removing an override restores normal recipe discovery using any retained route or buffer configuration.
- No new database table, framework, dependency, or public permission is required.

## Verification

Follow test-driven development with focused regression coverage:

- Configuration normalization accepts, deduplicates, validates, and stably orders gathered keys.
- Marking Stone Carvings retains its required quantity and downstream `Used for` relationship while removing package producer requirements and routes.
- Marking a material with available stock still allocates stock normally and does not create a producer step for the shortage.
- Independently required package targets remain present.
- Exact-cell behavior affects all identities in the opened cell but no other tier or family member.
- Dormant route and multiplier settings are restored when gathering is disabled.
- Local catalog traversal does not recurse through a gathered item's producer graph.
- Admin saves require the existing authentication and CSRF protections.
- The audit log records names, identities, actors, and enabled/disabled state.
- The detail dialog exposes the admin toggle only to administrators, keeps `Used for` visible, and shows the Map resource-finder link for active overrides.
- The production build and full application test suite pass.

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

No live Discord notifications or other external mutations are needed for verification.

## Non-goals

- No family-wide or all-tier gathered override.
- No automatic classification of items as gathered.
- No modification of game-catalog recipe data.
- No Map resource preselection or Map-page redesign.
- No removal of downstream recipes that consume a gathered item.
- No changelog entry, version bump, deployment, or push during ordinary implementation unless requested.
