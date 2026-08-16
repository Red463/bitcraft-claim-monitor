# Public Craft Profession Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Public Craft Finder filtering after the Relay migration and rename its visible skill terminology to profession terminology.

**Architecture:** Keep the normalized Relay data flow unchanged. Apply the selected numeric profession identifier as a client-side predicate in the existing `filteredJobs` pipeline, then update only user-visible copy while preserving compatibility keys and analytics identifiers.

**Tech Stack:** React, TypeScript, Node.js test runner, pnpm, Vite

## Global Constraints

- Keep the existing `public-crafts.skill` persisted-state key and `skill` query parameter.
- Keep existing analytics event names and payload scopes.
- Do not change backend, Relay projection, database, navigation, or styling code.
- Use "Profession" in user-visible filter terminology.

---

### Task 1: Restore Profession Filtering and Update Copy

**Files:**
- Modify: `apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/publicCraftMath.ts`
- Test: `apps/bitcraft-local/test/public-craft-math.test.mjs`

**Interfaces:**
- Consumes: normalized public craft jobs with numeric `requiredSkillId`, persisted `skillId`, and `toNumber(value)`.
- Produces: `filterPublicCraftJobs(jobs, professionId, regionId)` and profession terminology in the rendered UI.

- [ ] **Step 1: Write the failing regression test**

Add a behavior test with mixed profession and region fixtures:

```js
test("public craft jobs filter by the selected profession and region", () => {
  const jobs = [
    { entityId: "1", requiredSkillId: 8, regionId: "19" },
    { entityId: "2", requiredSkillId: 4, regionId: "19" },
    { entityId: "3", requiredSkillId: 8, regionId: "20" },
  ];

  assert.deepEqual(math.filterPublicCraftJobs(jobs, "8", "19"), [jobs[0]]);
  assert.deepEqual(math.filterPublicCraftJobs(jobs, "All", "19"), [jobs[0], jobs[1]]);
  assert.deepEqual(math.filterPublicCraftJobs(jobs, "8", "All"), [jobs[0], jobs[2]]);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/public-craft-math.test.mjs
```

Expected: FAIL because `filterPublicCraftJobs` is not a function.

- [ ] **Step 3: Implement the minimal page fix**

Add the pure helper and call it from the existing `filteredJobs` pipeline:

```ts
export function filterPublicCraftJobs<T extends { requiredSkillId?: unknown; regionId?: unknown }>(
  jobs: readonly T[],
  professionId: string,
  regionId: string,
): T[] {
  return jobs
    .filter((job) => professionId === "All" || Number(job.requiredSkillId) === Number(professionId))
    .filter((job) => regionId === "All" || String(job.regionId) === regionId);
}

const filteredJobs = filterPublicCraftJobs(publicJobs, skillId, regionId)
```

Update only visible strings:

```tsx
const skillName = skillId === "All" ? "All Professions" : SKILL_NAMES[toNumber(skillId)] ?? "Selected profession";
<MiniStat icon={<GraduationCap />} label="Profession" value={skillName} />
<label className="inline-field"><span>Profession</span>
<option value="All">All Professions</option>
```

Change the empty-state guidance to `Choose another profession or region to broaden the results.` Leave internal identifiers unchanged.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/public-craft-math.test.mjs apps/bitcraft-local/test/public-craft-finder-page-boundary.test.mjs
```

Expected: all tests in the file PASS.

- [ ] **Step 5: Run application verification**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open `http://127.0.0.1:18449/?page=publiccrafts`, select a profession, and confirm the displayed rows and summary totals update while the page remains free of console errors.

- [ ] **Step 6: Commit the focused implementation**

```sh
git add apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx apps/bitcraft-local/src/pages/publicCraftMath.ts apps/bitcraft-local/test/public-craft-math.test.mjs docs/superpowers/plans/2026-08-16-public-craft-profession-filter.md
git commit -m "fix: restore public craft profession filter"
```
