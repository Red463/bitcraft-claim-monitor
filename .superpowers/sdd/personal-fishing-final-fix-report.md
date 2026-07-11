# Personal Fishing Route Final Fix Report

Date: 2026-07-11
Branch: `codex/personal-fishing-route-task-1`
Base before this fix wave: `4611b8a`

## Status

Implemented the complete final-review fix wave. All Critical and Important findings are fixed, and all practical Minor findings are addressed. No changelog, package version, release metadata, or design/plan documentation was changed.

## Changes

### Guaranteed catalog yields

- Added `game_catalog_item_list_outputs.guaranteed_quantity REAL NOT NULL DEFAULT 0` to the bootstrap schema and idempotent additive migration list.
- Bumped `GAME_CATALOG_NORMALIZATION_VERSION` from `2` to `3`, so catalogs normalized under the old expected-only contract are considered stale.
- Catalog normalization now keeps both:
  - `quantity`: expected yield, preserving existing planner behavior.
  - `guaranteedQuantity`: the minimum outcome when the raw distribution covers the full probability mass; otherwise `0`.
- Updated local catalog repository inserts, selects, and mapped records to round-trip `guaranteedQuantity`.
- Local catalog planner details now carry the guaranteed value with the existing expected value and probability data.

### Planner and tracked crafts

- Item-list route synthesis now carries expected and guaranteed outputs separately.
- Personal fishing routes accept probabilistic distributions only when a positive verified guaranteed quantity is present.
- Tracked craft outputs now expose `guaranteedQuantity`:
  - deterministic direct outputs guarantee their full quantity;
  - full distributions guarantee their minimum outcome;
  - partial distributions retain expected output but guarantee zero.
- `computeCraftPlan()` keeps expected tracked quantities for the authoritative Needs Board, while the personal fishing projection uses a separate guaranteed tracked total for Fish Oil and route fish.
- Invalid Ocean/Lake catalog yields now add actionable Catalog diagnostics warnings.
- Added an end-to-end regression from raw Fish Products distributions through normalization, SQLite repository reads, local detail collection, and personal route computation.

### Safe board projection and frontend

- Personal route transformation now validates tier coverage across both canonical Ocean and Lake rows before replacing either row.
- Canonical route rows moved by an admin section override cause an all-or-nothing fallback to the untouched authoritative board, preventing duplicate routes and inconsistent totals.
- The unavailable route message now uses `role="status"` and `aria-live="polite"`.
- Scoped count-badge CSS to direct activity-filter button spans so the `Fishing route` label no longer receives badge styling.
- Added executable behavior regressions for unselected-route tier loss and section overrides. The project has no DOM/component test dependency, so browser persistence and request isolation remain covered by existing source-boundary assertions plus pure malformed-preference normalization tests.

## Verification

### Red phase

Command:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-schema-migrations.test.mjs test/game-catalog.test.mjs test/craft-plan-sources.test.mjs test/craft-planning.test.mjs test/craft-planning-fishing-view.test.mjs test/craft-planning-boundary.test.mjs
```

Initial result: exit `1`, `101` tests, `87` passed, `14` failed. Failures matched the missing migration/version, guaranteed catalog data, tracked guaranteed output, end-to-end route availability, diagnostics, tier/section fallback, aria-live, and CSS selector requirements.

Intermediate result after the main implementation: exit `1`, `101` tests, `99` passed, `2` failed. Both failures exposed the planner warning collection type (`Array` versus `Set`) and were fixed without changing the expected behavior.

### Focused green phase

Command:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-schema-migrations.test.mjs test/game-catalog.test.mjs test/craft-plan-sources.test.mjs test/craft-planning.test.mjs test/craft-planning-fishing-view.test.mjs test/craft-planning-boundary.test.mjs
```

Result: exit `0`, `101` tests passed, `0` failed.

### Production build

Command:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Result: exit `0`. TypeScript completed without errors; Vite transformed `1808` modules and completed the production build. Vite emitted the existing advisory that one minified chunk exceeds `500 kB`; this fix wave did not introduce a new dependency or bundle split.

### Full suite

Command:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Result: exit `0`, `546` tests passed, `0` failed.

### Diff checks

Command:

```powershell
git diff --check
```

Result: exit `0`, no whitespace errors. Git printed only the repository's normal LF-to-CRLF working-copy warnings.

Command:

```powershell
git diff --name-only | Select-String -Pattern 'CHANGELOG|package.json|docs/'
```

Result: exit `0` with no matches. No changelog, version, or `docs/` files changed.

## Migration And Deployment

1. Deploy the commit and restart the application service normally. Startup applies the additive `guaranteed_quantity` column migration automatically; no destructive migration and no manual SQL are required.
2. Existing catalog rows receive the safe default `0`, so they cannot be treated as guaranteed before refresh.
3. Run one complete Recipe catalog refresh after deployment and wait for it to finish. Normalization version `3` marks version `2` catalog data as outdated, and the refresh repopulates both expected and guaranteed quantities from raw BitJita distributions.
4. Confirm Catalog diagnostics does not report non-positive Ocean/Lake Fish Oil yields for valid tiers after the refresh.

No database backup/restore, data deletion, or additional VPS migration command is required beyond the normal pre-deployment backup policy.

## Final Review

- Standards axis: no remaining findings. The patch follows the existing additive schema migration, repository, planner, focused module, plain CSS, and test patterns.
- Spec/review axis: no remaining Critical, Important, or practical Minor findings.
- Residual concern: component-level `localStorage`/fetch interaction testing would require introducing a DOM test harness or dependency that the app does not currently use. This was not added during the focused final-review wave.
