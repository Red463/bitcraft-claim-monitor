# Effort-Weighted Craft Planner Progress

**Status:** Approved design

**Area:** Craft Planner, game catalog, Discord reports
**Created:** 14 July 2026

## Purpose

Replace quantity-weighted Craft Planner percentages with an effort-weighted model across every Needs Board section, the overall plan, and Craft Planner Discord reports.

The current calculation adds unlike units together. One fish, one shell, and one fish oil each contribute one unit, so low-yield source materials can dominate a profession even when the settlement has already completed expensive work. The new model answers a more useful question:

> How much of the original work required by this plan has confirmed stock and guaranteed active crafting already removed?

The model follows the broad approach used by BitCraft Sync without depending on its service, files, or implementation.

## Goals

- Calculate progress relative to a zero-inventory effort baseline.
- Apply the model to every section and to the overall plan.
- Count only confirmed stock and guaranteed active-craft output as completed effort.
- Preserve current item quantities, recipe choices, multipliers, taxonomy, and Fishing route controls.
- Make probabilistic requirements visible as estimates without treating them as completed work.
- Keep live-plan freshness and multi-user performance unchanged.
- Use one server-authored definition for the page and Discord reports.

## Non-Goals

- Matching BitCraft Sync's exact percentage for plans whose recipe graph or inventory scope differs.
- Importing or depending on BitCraft Sync data.
- Replacing the Needs Board quantities or cell statuses.
- Assigning monetary value to materials.
- Counting hypothetical, planned, or untracked output as completed.
- Adding a user-facing weight editor in the first version.

## Definitions

### Unit effort

Unit effort is the expected number of BitCraft actions needed to obtain one unit of an item or cargo through its most efficient verified acquisition route.

For a crafting route:

```text
unit effort = actions required / expected output quantity
```

Expected output quantity includes the output stack quantity and normalized probability. This value estimates planned work; it does not make probabilistic output count as completed.

For a gathered route:

```text
unit effort = 1 / (normalized acquisition probability × output quantity)
```

Only finite positive candidates are valid. When multiple verified candidates exist, the lowest positive unit effort is the catalog weight. Existing route overrides and Fishing choices remain authoritative for the requirement graph and therefore change which materials and quantities appear; the unit weight remains the intrinsic verified acquisition effort for that material.

### Baseline effort

The server calculates the same configured plan with:

- empty settlement, player, and deployable stock;
- no active crafts;
- the same targets and building progress;
- the same recipe overrides, multipliers, buffers, section overrides, and taxonomy;
- the corresponding Ocean or Lake Fishing route.

For a material requirement:

```text
material baseline effort = baseline required quantity × unit effort
```

Section baseline effort is the sum of its material baseline effort. Overall baseline effort is the sum of all sections, not an average of section percentages.

### Remaining confirmed effort

The live plan uses the same graph after applying only:

- counted confirmed stock from the configured sources; and
- guaranteed output from counted active crafts.

Estimated or probabilistic active-craft output remains visible but cannot satisfy requirements, stop downstream expansion, or reduce remaining effort.

```text
material remaining effort = confirmed missing quantity × unit effort
progress = 1 - (remaining effort / baseline effort)
```

Progress is clamped to 0–100%. A valid zero-effort plan is 100% complete. Values are rounded to one decimal place for the page and to the existing Discord precision.

## Catalog Model

Add an additive SQLite table for derived weights:

```text
game_catalog_effort_weights
- catalog_key primary key
- effort_weight
- method: crafting | gathering
- source_key
- model_version
- updated_at
```

The existing catalog refresh will retain the additional source information needed to derive weights:

- recipe action requirements;
- output quantities and probabilities;
- resource outputs, quantities, and acquisition probabilities.

Weight refresh is transactional. A completed catalog refresh replaces the derived weight set for the active model version. A failed or interrupted refresh leaves the last completed set readable.

The catalog normalization/model version will increase so production performs a compatible refresh after deployment. No destructive database migration is required.

### Missing weights

There is no silent weight of `1` and no fallback to quantity progress.

If a required material has no verified effort weight:

- that section's effort progress is unavailable;
- overall effort progress is unavailable;
- other fully weighted sections remain available;
- the API returns a bounded list/count of missing catalog keys and a clear warning;
- quantities and all non-percentage Needs Board functionality remain available.

This avoids false precision while catalog data is refreshing or incomplete.

## Planner Calculation

Create a focused effort-progress module rather than adding the model directly to the Needs Board component. Its interface accepts normalized baseline/current material requirements and a weight lookup, then returns compact aggregates.

The current display plan will use guaranteed active output for requirement satisfaction. Estimated active output remains in its existing separate fields and visual disclosure but does not reduce `missing` or suppress downstream requirements.

The server computes:

1. The live confirmed plan.
2. A cached zero-inventory baseline for the same stable configuration.
3. Effort aggregates by canonical section.
4. Ocean and Lake Fishing variants where verified routes exist.

Section overrides affect both baseline and live aggregation. Filtering, search, and “Shortages only” do not change the underlying result.

## Fishing Variants

Ocean/Lake is currently a browser preference, so the server cannot assume the visible route. The compact response will include both verified variants:

- Fishing baseline, remaining effort, and completion for Ocean.
- Fishing baseline, remaining effort, and completion for Lake.
- Overall baseline, remaining effort, and completion using each route.

The frontend selects the matching section and overall aggregates immediately when the user changes the toggle. No additional network request is required.

Discord has no browser preference and will use the canonical Ocean variant in version one. Reports will state the selected Fishing route when Fishing contributes to the result. Adding a separate Discord route setting is outside this scope.

## API Shape

The compact Craft Planner response gains a bounded summary:

```text
effortProgress
- modelVersion
- state: ready | partial | unavailable | empty
- overall: baselineEffort, remainingEffort, completion
- sections: keyed section aggregates
- fishingVariants
  - ocean: Fishing aggregate and adjusted overall aggregate
  - lake: Fishing aggregate and adjusted overall aggregate
- coverage
  - weightedRequiredMaterials
  - totalRequiredMaterials
  - missingWeightCount
  - bounded missingWeightKeys
- warnings
```

Raw effort route candidates and full weight tables are not sent to browsers.

## Caching and Concurrency

Zero-inventory baselines are keyed by a stable hash containing:

- normalized targets and building progress;
- recipe overrides;
- multipliers and buffers;
- section and row overrides;
- catalog effort model/revision;
- relevant planner model version.

Ocean and Lake aggregates may share the common non-Fishing baseline.

Safeguards:

- concurrent requests share one in-flight baseline promise;
- the cache stores compact aggregates and only the minimum per-material data needed for aggregation, not a second full API response;
- cache entry count and total estimated bytes are bounded;
- catalog/config changes invalidate affected baselines;
- the existing shared live Craft Planner calculation and 20-second freshness remain unchanged;
- a browser does not perform baseline work independently;
- baseline timing, cache hit/miss, in-flight reuse, and compact response bytes feed existing planner telemetry.

## User Interface

Replace percentage labels with explicit effort language:

- Overall: `57.2% effort complete`.
- Section: `Fishing 57.2% effort complete` or the compact equivalent that fits the existing table header.
- Supporting text: `Confirmed stock and guaranteed active crafts.`

The progress bar uses effort completion. Existing cell quantities remain unchanged.

Probabilistic source requirements receive a clear estimated indicator and accessible explanation. For example, `4,400 Lake Fish estimated from expected processing yield` must not look like a guaranteed conversion.

Unavailable behavior:

- Section: `Effort progress unavailable` with the catalog warning available in context.
- Overall: the same state if any included section lacks required weights.
- Loading/catalog refresh: no legacy quantity percentage flashes before the effort result is known.

The layout remains dense and consistent with the existing operational dashboard at desktop and narrow widths.

## Discord Reports

The shared report builder uses the server-authored effort summary for:

- overall Craft Planner percentage;
- every profession/section percentage;
- scheduled reports;
- slash-command reports;
- Send Test output.

Quantity coverage remains secondary context where useful. Reports must not independently reconstruct percentages from material quantities.

Unavailable and partial catalog states produce explicit report copy rather than a misleading fallback percentage.

## Error Handling

- Invalid or non-positive action, yield, probability, or derived weight is rejected.
- Catalog refresh errors retain the last completed compatible weights.
- An incompatible/missing model version makes progress unavailable until refresh completes.
- Missing route data affects only the corresponding Fishing variant when possible.
- Calculations never return `NaN`, infinity, negative progress, or progress above 100%.
- Warnings and diagnostics contain catalog keys/names only, never inventory contents or user identifiers.

## Testing

### Unit tests

- Recipe weight from action count and deterministic output.
- Recipe weight from probabilistic/quantity output.
- Gathering weight from probability and quantity.
- Lowest valid verified candidate selection.
- Invalid and missing candidate rejection.
- Zero-inventory baseline and confirmed remaining effort.
- Stock reduces effort.
- Guaranteed active output reduces effort.
- Estimated active output does not reduce effort or stop downstream expansion.
- Section and summed overall aggregation.
- Section overrides and canonical taxonomy.
- Ocean/Lake Fishing variants and overall adjustment.
- Zero-effort, missing-weight, partial, and unavailable states.

### Integration and regression tests

- Catalog refresh persists a complete compatible weight set transactionally.
- Failed refresh retains prior weights.
- Compact response contains bounded effort data only.
- Concurrent identical requests reuse one baseline calculation.
- Cache invalidates on plan/catalog model changes.
- The current Fishing scenario is represented by a deterministic fixture and is no longer quantity-dominated.
- Page and Discord reports consume the same effort aggregates.
- Existing quantities, shortages, route controls, and confirmed/estimated craft disclosures remain correct.

### Verification

- Focused effort/catalog/planner/frontend/Discord tests.
- Full `@workspace/bitcraft-local` test suite.
- Production build.
- Browser checks at desktop and narrow widths for ready, partial, unavailable, Ocean, Lake, empty, and disabled states.
- Performance comparison for cold baseline, warm baseline, concurrent reuse, compact payload size, and live Craft Planner latency.
- VPS smoke check after catalog refresh confirms useful weight coverage, stable memory, and matching page/Discord percentages.

## Rollout

1. Deploy the additive schema and effort model.
2. Trigger/allow the versioned catalog refresh to populate weights.
3. Keep progress unavailable until a compatible completed weight set exists.
4. Verify section coverage and the Fishing Ocean/Lake variants.
5. Confirm warm baseline reuse and live refresh latency before considering the rollout accepted.

No service controls, external monitoring dependency, or user-configurable weighting are introduced.
