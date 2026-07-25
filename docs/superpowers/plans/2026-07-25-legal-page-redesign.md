# Legal Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken card-heavy Terms and Privacy layouts with responsive reading pages and simplify operator identity copy in the acceptance flow.

**Architecture:** Keep the existing policy model, routes, and dialog components. Reshape only the dedicated-page composition in `LegalDialogs.tsx`, use scoped styles in `app-chrome.css`, and update policy copy at its existing source in `legalPolicy.mjs`.

**Tech Stack:** React, TypeScript, plain CSS, Node test runner, Vite.

## Global Constraints

- Preserve all existing legal subjects, retention periods, providers, consent requirements, and data-removal behaviour.
- The acceptance dialog must not display the operator's personal identity paragraph.
- Terms must identify Thomas Bush once as the operator; Privacy must identify Thomas Bush as controller with `privacy@timbersteeltrade.com`.
- Published copy must not say the project is “not a company”, “not a separate legal entity”, or that no separate company controls it.
- Dedicated pages remain dark, responsive, keyboard accessible, and searchable without accordions.
- Do not add dependencies or refactor unrelated application UI.

---

### Task 1: Simplify Published Legal Identity Copy

**Files:**
- Modify: `apps/bitcraft-local/test/legal-policy.test.mjs`
- Modify: `apps/bitcraft-local/src/legal/legalPolicy.mjs`

**Interfaces:**
- Consumes: `legalPolicyForEnvironment(environment)`
- Produces: `policy.operator.status` as a concise operator sentence, with Terms and Privacy controller sections derived from the same validated operator.

- [ ] **Step 1: Update the policy test to define the desired copy**

Replace the company-status assertions with:

```js
assert.equal(policy.operator.status, "Timbersteel Claim Monitor is operated by Thomas Bush.");
const publishedCopy = JSON.stringify([policy.operator, policy.terms.sections, policy.privacy.sections]);
assert.doesNotMatch(publishedCopy, /not a company|separate legal entity|no separate company/i);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/legal-policy.test.mjs
```

Expected: FAIL because the existing status contains company-denial wording.

- [ ] **Step 3: Implement concise operator/controller wording**

Set the default and validated status to:

```js
const status = `${operator.projectName} is operated by ${operator.controllerName}.`;
```

Use that sentence in the Terms operator section. Start the Privacy controller section directly with:

```js
`${operator.controllerName}, based in ${operator.controllerCountry}, is the controller for the personal data described here. Contact: ${operator.privacyEmail}.`
```

Remove only the company-denial sentences.

- [ ] **Step 4: Run the focused test**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/legal-policy.test.mjs
```

Expected: all legal policy tests PASS.

### Task 2: Build the Dedicated Reading Layout and Clean Acceptance Dialog

**Files:**
- Modify: `apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/components/main/LegalAcceptanceDialog.tsx`
- Modify: `apps/bitcraft-local/src/components/main/LegalDialogs.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`

**Interfaces:**
- Consumes: `DEFAULT_LEGAL_POLICY`, existing `TermsContent` and `PrivacyContent`
- Produces: `DedicatedLegalPage({ type })` with `.legal-document-header`, `.legal-document-layout`, `.legal-section-nav`, and `.legal-document-content`.

- [ ] **Step 1: Add focused boundary assertions**

Assert that the acceptance dialog no longer renders:

```js
assert.doesNotMatch(dialog, /<p>\{policy\.operator\.status\}<\/p>/);
```

Assert the dedicated page has a reading layout:

```js
assert.match(legalDialogs, /className="legal-document-layout"/);
assert.match(legalDialogs, /className="legal-document-content"/);
assert.doesNotMatch(legalDialogs, /<aside className="legal-meta"/);
assert.match(css, /\.legal-document-layout\s*\{[^}]*grid-template-columns:/s);
assert.match(css, /\.legal-section-nav\s*\{[^}]*position:\s*sticky;/s);
assert.match(css, /\.legal-document-content \.terms-section\s*\{[^}]*border-top:/s);
```

- [ ] **Step 2: Run the boundary test and verify it fails**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs
```

Expected: FAIL because the old component uses the operator paragraph, pill navigation, and card sections.

- [ ] **Step 3: Reshape the dedicated page**

Keep compact dialog content unchanged. For dedicated pages:

- render a title, one-sentence description, legal version, effective date, and Open app action in `.legal-document-header`;
- render navigation and content in `.legal-document-layout`;
- place `LegalSections`, retention table, provider list, and notice inside `.legal-document-content`;
- render metadata as an ordinary compact block, never an `<aside>`;
- keep existing semantic section IDs and link targets.

- [ ] **Step 4: Implement scoped responsive styles**

Use:

```css
.legal-document-layout {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(0, 760px);
  gap: clamp(28px, 4vw, 56px);
  align-items: start;
}

.legal-section-nav {
  position: sticky;
  top: 24px;
}

.legal-document-content .terms-section {
  border: 0;
  border-top: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
}
```

At `max-width: 900px`, switch the layout to one column and reset the section navigation to `position: static`. Scope the new section treatment to `.legal-document-content` so modal Terms/Privacy dialogs retain their compact cards.

- [ ] **Step 5: Run the boundary and policy tests**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs apps/bitcraft-local/test/legal-policy.test.mjs
```

Expected: both files PASS.

### Task 3: Verify, Release, and Deploy

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/bitcraft-local/package.json`

**Interfaces:**
- Consumes: completed legal page implementation
- Produces: a tested beta release, pushed branch, merged PR, and deployed production build.

- [ ] **Step 1: Browser-verify desktop and mobile**

Build and start the stable smoke server:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
node scripts/start-bitcraft-local-smoke.mjs --restart
```

Inspect `/terms` and `/privacy` at desktop and narrow viewports. Confirm no giant metadata panel, no page-level horizontal scrolling, readable text, working section anchors, and a single-column narrow layout.

- [ ] **Step 2: Run full verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: build succeeds and all tests pass.

- [ ] **Step 3: Prepare the release**

Increment the current beta counter in `apps/bitcraft-local/package.json`. Add a dated changelog entry under `Changed` describing the readable Terms/Privacy redesign and simplified legal acceptance copy.

- [ ] **Step 4: Commit and publish**

Stage only the legal redesign, tests, design/plan records, changelog, and package version. Commit, push `codex/legal-page-redesign`, and open a ready pull request against `main`.

- [ ] **Step 5: Merge and deploy**

Wait for required PR checks, merge the PR, dispatch the repository's production deployment workflow using the merged `main`, and wait for a successful conclusion. Confirm the production `/terms` and `/privacy` routes respond after deployment.
