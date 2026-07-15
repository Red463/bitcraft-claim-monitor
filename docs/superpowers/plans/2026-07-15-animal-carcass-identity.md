# Animal Carcass Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count shared collected Cervus and Scrofa carcasses against their gendered Craft Planning recipe requirements.

**Architecture:** Normalize only confirmed gendered Animal cargo IDs at the existing recipe-input display boundary. Keep stock aggregation exact-keyed so quantities cannot be duplicated across aliases.

**Tech Stack:** Node.js, JavaScript modules, Node test runner, React application build via pnpm.

## Global Constraints

- Map `cargo:3` to `cargo:4` and `cargo:5` to `cargo:6` only.
- Do not infer aliases from names, tiers, tags, or icons.
- Do not merge Elder Scrofa or any other Animal cargo.
- Do not add dependencies or refactor unrelated planner code.

---

### Task 1: Normalize confirmed collected-animal identities

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`

**Interfaces:**
- Consumes: recipe input stacks passed through `stackDisplay(stack, displays, index)`.
- Produces: planner material identities using collected cargo IDs for the two confirmed mappings.

- [x] **Step 1: Write the failing behavior test**

Add a table-driven test that builds a one-step recipe for Female Cervus, Female Scrofa, and Elder Scrofa. Assert that the first two use and count the collected cargo IDs while Elder Scrofa remains unchanged.

- [x] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm --filter @workspace/bitcraft-local test -- --test-name-pattern="normalizes collected animal carcasses"`

Expected: FAIL because the planner still returns `cargo:3` and `cargo:5` with zero available stock.

- [x] **Step 3: Implement explicit recipe-input normalization**

Add a constant map for the two confirmed identities and a small normalization helper. Apply it inside `stackDisplay` after the recipe input display is assembled.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `corepack pnpm --filter @workspace/bitcraft-local test -- --test-name-pattern="normalizes collected animal carcasses"`

Expected: PASS.

- [x] **Step 5: Run regression verification**

Run: `corepack pnpm --filter @workspace/bitcraft-local test`

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: all tests pass and the production build completes successfully.
