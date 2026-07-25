# Admin Character Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the admin Linked Accounts character selector on direct `/admin` and `/bot` loads.

**Architecture:** Add a focused loader for the existing public claim-members proxy. `AdminPanel` uses supplied members when available and otherwise loads the configured claim roster when Linked Accounts is active, passing loading and failure state into `AdminAccessSection`.

**Tech Stack:** React, TypeScript, Node test runner, existing `/api/bitjita` proxy.

## Global Constraints

- Preserve existing assignment, approval, duplicate-link, authentication, and authorization behavior.
- Do not introduce dependencies or backend routes.
- Keep the change within the admin roster data flow.

---

### Task 1: Tested settlement-member loader

**Files:**
- Create: `apps/bitcraft-local/src/components/admin/adminSettlementMembers.ts`
- Create: `apps/bitcraft-local/test/admin-settlement-members.test.mjs`

**Interfaces:**
- Produces: `loadAdminSettlementMembers(claimId: string, fetcher?: typeof fetch): Promise<AnyRecord[]>`

- [ ] **Step 1: Write the failing test**

Test that the loader requests the encoded configured claim, returns members from
both `{ members: [...] }` and direct-array payloads, and rejects a failed HTTP
response with a readable message.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --experimental-strip-types --test test/admin-settlement-members.test.mjs`

Expected: FAIL because `adminSettlementMembers.ts` does not exist.

- [ ] **Step 3: Write the minimal loader**

Build `/api/bitjita/claims/{encodedClaimId}/members`, validate the HTTP result,
parse JSON, and normalize only array-shaped member payloads.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --experimental-strip-types --test test/admin-settlement-members.test.mjs`

Expected: PASS.

### Task 2: AdminPanel fallback roster ownership

**Files:**
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminAccessSection.tsx`
- Modify: `apps/bitcraft-local/test/admin-character-assignment-boundary.test.mjs`

**Interfaces:**
- Consumes: `loadAdminSettlementMembers`
- Produces: sorted effective members plus `membersLoading` and `membersError` for `AdminAccessSection`

- [ ] **Step 1: Extend the failing boundary test**

Require the panel to call the fallback loader for `settings.claimId`, refresh it
with linked accounts, and pass loading/error state to the access section.

- [ ] **Step 2: Run the boundary test to verify it fails**

Run: `node --experimental-strip-types --test test/admin-character-assignment-boundary.test.mjs`

Expected: FAIL because the panel does not yet own fallback roster loading.

- [ ] **Step 3: Implement the minimal panel and selector changes**

Load the roster only for the Linked Accounts tab when supplied members are
empty. Refresh both data sources from the existing refresh button. Display
loading, empty, and failure copy and disable assignment until a roster member is
available.

- [ ] **Step 4: Run focused tests**

Run: `node --experimental-strip-types --test test/admin-settlement-members.test.mjs test/admin-character-assignment-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 5: Verify the release build and full suite**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Run: `corepack pnpm --filter @workspace/bitcraft-local test`

Expected: both commands exit successfully with zero failing tests.

- [ ] **Step 6: Review and commit**

Review `git diff origin/main...HEAD` against this design and repository
standards, then commit only the scoped files.
