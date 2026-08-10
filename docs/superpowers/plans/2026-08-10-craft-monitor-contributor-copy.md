# Craft Monitor Contributor Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove internal attribution wording from Craft Monitor contributor rows while retaining the contributor name, progress, and XP.

**Architecture:** Keep the existing contribution data and attribution logic unchanged. Tighten the Production page presentation boundary so attribution confidence is used only to select the unknown-contributor fallback and is never rendered as technical copy.

**Tech Stack:** React, TypeScript, Node test runner, pnpm, Vite.

## Global Constraints

- Do not change backend schemas, API payloads, contribution calculations, or other pages.
- Retain `attributionConfidence` in the data model and existing unknown-contributor handling.
- Render only the contributor name, total progress contributed, and total XP contributed in each contributor row.
- Do not stage or modify `BITCRAFTSYNC_EXPLORER_AUDIT.md`.

---

### Task 1: Contributor Row Presentation

**Files:**
- Modify: `apps/bitcraft-local/test/production-page-boundary.test.mjs:80-84`
- Modify: `apps/bitcraft-local/test/production-contributor-copy-boundary.test.mjs:32-38`
- Modify: `apps/bitcraft-local/src/pages/ProductionPage.tsx:336-343`

**Interfaces:**
- Consumes: `person.contributorUsername`, `person.contributorEntityId`, `person.attributionConfidence`, `person.totalProgressContributed`, and `person.totalXpContributed` from the existing Craft Monitor projection.
- Produces: A contributor row containing the tracked owner name, formatted progress, and formatted XP with no attribution-confidence label.

- [ ] **Step 1: Write the failing boundary test**

Replace the positive technical-label assertions with these negative assertions while retaining the existing name, progress, XP, unknown-contributor, and key assertions:

```js
assert.doesNotMatch(source, />Matched action</);
assert.doesNotMatch(source, />Craft owner</);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
node --test apps/bitcraft-local/test/production-page-boundary.test.mjs
node --test apps/bitcraft-local/test/production-contributor-copy-boundary.test.mjs
```

Expected: FAIL because `ProductionPage.tsx` still renders `Matched action` and `Craft owner`.

- [ ] **Step 3: Remove the technical attribution labels**

Change the contributor row to:

```tsx
return <span key={person.contributorEntityId ?? `unknown:${job.entityId}`}><strong><TrackedOwnerName name={contributorName} claim={data.claim} members={data.members} /></strong> {formatDecimalQuantity(person.totalProgressContributed)} progress - {formatDecimalQuantity(person.totalXpContributed)} XP</span>;
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```sh
node --test apps/bitcraft-local/test/production-page-boundary.test.mjs
node --test apps/bitcraft-local/test/production-contributor-copy-boundary.test.mjs
```

Expected: PASS with zero failures.

### Task 2: Release Metadata and Verification

**Files:**
- Modify: `apps/bitcraft-local/package.json:3`
- Modify: `CHANGELOG.md:9`

**Interfaces:**
- Consumes: Current release version `0.53.2-beta.1`.
- Produces: Same-line release version `0.53.2-beta.2` and a user-facing changelog entry.

- [ ] **Step 1: Update release metadata**

Set the package version to `0.53.2-beta.2` and add this latest dated changelog section above `0.53.2-beta.1`:

```markdown
## [0.53.2-beta.2] - 2026-08-10

### Changed

- Simplified Craft Monitor contributor rows to show only who contributed, progress, and XP.
```

- [ ] **Step 2: Run the focused test and production build**

Run:

```sh
node --test apps/bitcraft-local/test/production-page-boundary.test.mjs apps/bitcraft-local/test/production-contributor-copy-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: Both commands exit zero.

- [ ] **Step 3: Review the exact release diff**

Run:

```sh
git diff --check
git diff -- apps/bitcraft-local/src/pages/ProductionPage.tsx apps/bitcraft-local/test/production-page-boundary.test.mjs apps/bitcraft-local/test/production-contributor-copy-boundary.test.mjs apps/bitcraft-local/package.json CHANGELOG.md docs/superpowers/plans/2026-08-10-craft-monitor-contributor-copy.md
```

Expected: No whitespace errors and only the approved UI, test, plan, version, and changelog changes.

- [ ] **Step 4: Commit the scoped release**

Run:

```sh
git add apps/bitcraft-local/src/pages/ProductionPage.tsx apps/bitcraft-local/test/production-page-boundary.test.mjs apps/bitcraft-local/test/production-contributor-copy-boundary.test.mjs apps/bitcraft-local/package.json CHANGELOG.md docs/superpowers/plans/2026-08-10-craft-monitor-contributor-copy.md
git commit -m "fix: simplify Craft Monitor contributor rows"
```

### Task 3: Publish and Deploy

**Files:**
- No source files changed.

**Interfaces:**
- Consumes: Verified branch `codex/remove-craft-attribution-copy` at version `0.53.2-beta.2`.
- Produces: A pushed branch, pull request to `main`, merged release, completed production deployment, and live Craft Monitor verification.

- [ ] **Step 1: Push the branch and create the pull request**

Push `codex/remove-craft-attribution-copy`, open a ready pull request to `main`, and include the behavior change and verification commands in its description.

- [ ] **Step 2: Merge and monitor deployment**

Merge the pull request after GitHub checks pass, then monitor the production deployment workflow until it completes successfully.

- [ ] **Step 3: Verify production**

Confirm the production health endpoint reports version `0.53.2-beta.2`, then browser-check Craft Monitor and confirm a contributor row displays name, progress, and XP without `Matched action` or `Craft owner`.
