# Prospecting Catalogue Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make catalogue scans accept repeated probability components and model all prospecting routes without false full-resource calculations.

**Architecture:** Preserve raw recipe-output components in an additive table, coalesce them into the existing compatibility table, and persist one recipe-level gathering mode used by planner and workbook consumers. Prospecting is identified structurally and never uses displayed health as finite progress.

**Tech Stack:** Node.js 24, `node:sqlite`, Node test runner, React/TypeScript, ExcelJS.

## Global Constraints

- Preserve item and cargo identity in every key and table.
- Do not special-case catalogue IDs such as Argent Ore `60000`.
- Preserve route identifiers and deterministic recipe behavior.
- Retain the last validated probability snapshot on refresh failure.

---

### Task 1: Reproduce and fix duplicate recipe outputs

**Files:**
- Modify: `apps/bitcraft-local/test/game-catalog-probability.test.mjs`
- Modify: `apps/bitcraft-local/src/server/gameCatalog.mjs`
- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
- Modify: `apps/bitcraft-local/src/server/schemaMigrations.mjs`

**Interfaces:**
- Consumes: BitJita `extractedItemStacks` entries.
- Produces: `outputComponents` in normalized details, raw component SQL rows, and one aggregate `outputs` row per output key.

- [ ] Add an Argent-shaped test with five `cargo:60000` components and assert that `upsertDetail` no longer violates the unique constraint.
- [ ] Run `corepack pnpm --filter @workspace/bitcraft-local exec node --test test/game-catalog-probability.test.mjs` and confirm the new assertion fails at the existing insert.
- [ ] Add `game_catalog_recipe_output_components` through bootstrap and additive schema creation, preserving component index, quantity, occurrence rate, and yield basis.
- [ ] Coalesce normalized outputs by key: sum expected quantities and guaranteed quantities while retaining all components.
- [ ] Persist and read aggregate rows and raw component rows transactionally.
- [ ] Rerun the focused test and confirm it passes.

### Task 2: Classify prospecting and suppress finite-node calculations

**Files:**
- Modify: `apps/bitcraft-local/test/game-catalog-probability.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/src/server/gameCatalog.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs`

**Interfaces:**
- Produces: recipe `gatheringMode` (`ordinary` or `prospecting`) and route `probabilityStatus`.

- [ ] Add failing tests proving a non-Argent prospecting-shaped recipe is classified without an ID allowlist and has no full-resource yield/equivalents.
- [ ] Add a failing control test proving an ordinary gathering recipe still uses finite resource health.
- [ ] Persist `gathering_mode` additively and propagate it through recipe queries and route mapping.
- [ ] Exclude prospecting from completion-output and full-resource effort calculations while keeping expected yield per progress.
- [ ] Increment catalogue normalization and effort-model versions so existing installations rebuild affected data.
- [ ] Rerun the focused catalogue and planner tests.

### Task 3: Expose auditable prospecting data in the workbook and UI

**Files:**
- Modify: `apps/bitcraft-local/test/probability-workbook.test.mjs`
- Modify: `apps/bitcraft-local/src/server/probabilityWorkbook.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`

**Interfaces:**
- Consumes: gathering mode, component rows, expected-per-progress data.
- Produces: workbook `Raw Recipe Outputs` rows and prospecting-safe labels.

- [ ] Add a failing workbook test asserting a raw component sheet, gathering-mode column, blank prospecting full-resource formulas, and player-readable explanation.
- [ ] Add the raw component sheet with filters, frozen heading row, wrapped text, and one row per source component.
- [ ] Label prospecting routes as per extraction progress and explain that total node yield is unavailable because exhaustion is unknown.
- [ ] Hide full-resource equivalents in Craft Planning when `gatheringMode` is prospecting.
- [ ] Run the focused workbook and planner tests plus the frontend build.

### Task 4: Improve refresh failure context and complete verification

**Files:**
- Modify: `apps/bitcraft-local/test/game-catalog.test.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `CONTEXT.md`

**Interfaces:**
- Produces: fatal refresh errors containing target identity and nested recipe context.

- [ ] Add a failing refresh test asserting that a local persistence error names the current catalogue target.
- [ ] Wrap detail normalization/persistence errors with target kind, ID, name, and available recipe ID without changing retry classification.
- [ ] Confirm the glossary defines prospecting as a family of resources rather than an Argent-only behavior.
- [ ] Run `corepack pnpm --filter @workspace/bitcraft-local run build`.
- [ ] Run `corepack pnpm --filter @workspace/bitcraft-local test`.
- [ ] Review the complete diff against this design and the repository standards, then commit only task-related files.
