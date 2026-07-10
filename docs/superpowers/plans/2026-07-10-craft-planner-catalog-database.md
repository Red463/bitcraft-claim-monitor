# Craft Planner Catalog Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace planner-time BitJita recipe discovery with a normalized, weekly refreshed SQLite catalog while preserving live stock and active-craft reads.

**Architecture:** Normalize item/cargo identities, recipes, inputs, outputs, and probabilistic item-list outputs into indexed SQLite tables. A resumable refresh service populates those tables from BitJita; planner calculations consume a catalog adapter and never fetch item/cargo details during normal page loads. Existing JSON cache rows remain available for migration diagnostics only.

**Tech Stack:** Node.js 24, node:sqlite, Node test runner, React/TypeScript, Vite.

## Global Constraints

- Keep settlement/player/deployable inventory and active craft data live.
- Keep `recipe_catalog_entries.detail_json` temporarily, but do not use it as the planner's primary source.
- Preserve item/cargo `itemType` semantics and identity separation.
- Prefer crafting/gathering routes over package/unpack transport routes.
- Missing catalog data must produce diagnostics; never infer catalog identity from names.
- Refresh runs weekly and can be triggered manually by an authorized admin.

---

### Task 1: Normalized Catalog Schema And Repository

**Files:**
- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
- Modify: `apps/bitcraft-local/src/server/preparedStatements.mjs`
- Create: `apps/bitcraft-local/src/server/gameCatalog.mjs`
- Create: `apps/bitcraft-local/test/game-catalog.test.mjs`

- [ ] Write failing tests for item/cargo identity separation, recipe normalization, probabilistic outputs, transport-route detection, and local graph reads.
- [ ] Run the focused test and confirm the missing catalog API failure.
- [ ] Add normalized tables, indexes, repository statements, and pure normalization/query helpers.
- [ ] Run focused tests and confirm they pass.

### Task 2: Weekly Resumable Catalog Refresh

**Files:**
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/server/scheduledJobs.mjs`
- Modify: `apps/bitcraft-local/test/server.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

- [ ] Write failing tests for weekly registration, resumable progress, duplicate-run suppression, and normalized writes.
- [ ] Run focused tests and confirm the expected failures.
- [ ] Implement catalog crawl orchestration for `/items`, `/cargo`, and detail endpoints with persisted progress and controlled batches.
- [ ] Add status and manual refresh admin endpoints guarded by settings permission and CSRF.
- [ ] Run focused tests and confirm they pass.

### Task 3: Planner Local Catalog Adapter

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

- [ ] Write failing tests proving full-chain calculation uses local catalog rows, authoritative Berry/T6 grouping, byproduct routes, transport-route deprioritization, and missing-catalog diagnostics.
- [ ] Run focused tests and confirm failures are caused by planner catalog reads not existing.
- [ ] Implement the catalog adapter and remove item/cargo detail fetches from normal planner calculation.
- [ ] Keep live stock and active craft deductions unchanged.
- [ ] Run focused tests and confirm they pass.

### Task 4: Admin Catalog Diagnostics

**Files:**
- Modify: `apps/bitcraft-local/src/components/planning/CraftPlanManager.tsx`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

- [ ] Write a failing boundary test for refresh action, progress, counts, last success, and failures.
- [ ] Add a compact catalog diagnostics block and manual refresh action to the planner manager.
- [ ] Run the focused test and production build.

### Task 5: Verification And Review

- [ ] Run `corepack pnpm --filter @workspace/bitcraft-local run build`.
- [ ] Run `corepack pnpm --filter @workspace/bitcraft-local test`.
- [ ] Review the complete diff for migration safety, API pressure, and sensitive admin data exposure.
