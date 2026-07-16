# Craft Plan Discord Profession Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Leatherworking section across the Needs Board, row editor, effort progress, and Discord reports, and prefix Craft Planner notification titles with the configured plan name.

**Architecture:** Keep planner taxonomy as the canonical source for board professions and standardize its leather section to `Leatherworking`. Preserve the raw API section as diagnostic metadata, expose the planner-default section separately to the row editor, and make Discord resolve effort section keys through its existing profession aliases so legacy `Leatherwork` snapshots remain valid.

**Tech Stack:** React 19, TypeScript 5.9, Node.js 24 ESM, Node test runner, Vite, plain CSS (no CSS changes expected).

## Global Constraints

- Use `Leatherworking` as the canonical planner section; continue accepting `leatherwork` as a Discord input/effort alias.
- Overview titles use `<plan name> - Crafting Progress`; profession titles use `<plan name> - <Profession> Progress`.
- Blank or unavailable plan names retain the existing generic titles.
- Explicit Needs Board section overrides take precedence over taxonomy defaults.
- Missing effort data must produce the existing unavailable state, never a false `0.0%` profession value.
- Do not change effort weights, coverage rules, Discord schedules, permissions, channels, or delivery.
- Do not send real Discord notifications during tests or browser verification.
- Add no dependency, migration, changelog entry, or version bump.

---

## File Map

- `apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.mjs`: owns canonical Needs Board section names and material-family taxonomy.
- `apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts`: builds board groups and exposes raw API versus planner-default row metadata.
- `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`: initializes the row override dialog and owns its user-facing copy.
- `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs`: maps materials and effort sections to Discord professions and builds report titles.
- `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`: unit coverage for canonical board grouping and row metadata.
- `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`: source boundary coverage for row-editor state and copy.
- `apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs`: unit coverage for profession aliases, overrides, unavailable behavior, and titles.

### Task 1: Canonical Leatherworking taxonomy and planner-default metadata

**Files:**
- Modify: `apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.mjs:1-22`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts:21-30,96-121`
- Test: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs:313-328`

**Interfaces:**
- Consumes: `plannerTaxonomyFor(material)` and existing `material.apiSection`.
- Produces: `NeedRow.plannerSection: string`, the taxonomy-derived section before an explicit override; canonical taxonomy output `Leatherworking`.

- [ ] **Step 1: Write the failing Needs Board regression test**

Replace the leather expectation in the existing operational-order test and add a focused metadata test:

```js
test("buildNeedsBoard follows Sync ordering for operational rows and sections", () => {
  const board = buildNeedsBoard([
    { key: "items:1", name: "Basic Citric Berry", tag: "Citric Berry", tier: 1, section: "Foraging", required: 1, missing: 1 },
    { key: "items:2", name: "Basic Berry", tag: "Berry", tier: 1, section: "Foraging", required: 1, missing: 1 },
    { key: "items:3", name: "Basic Leather", tag: "Leather", tier: 1, section: "Leatherworking", required: 1, missing: 1 },
    { key: "items:4", name: "Basic Cloth", tag: "Cloth", tier: 1, section: "Tailoring", required: 1, missing: 1 },
    { key: "items:5", name: "Basic Animal Food", tag: "Animal Food", tier: 1, section: "Taming", required: 1, missing: 1 },
  ], []);

  assert.deepEqual(board.map((group) => [group.section, group.rows.map((row) => row.name)]), [
    ["Foraging", ["Berry", "Citric Berry"]],
    ["Leatherworking", ["Leather"]],
    ["Tailoring", ["Cloth"]],
    ["Taming", ["Animal Food"]],
  ]);
});

test("buildNeedsBoard keeps planner and raw API sections distinct", () => {
  const board = buildNeedsBoard([{
    key: "items:3",
    name: "Basic Leather",
    tag: "Leather",
    tier: 1,
    section: "Carpentry",
    apiSection: "Carpentry",
    required: 10,
    missing: 5,
  }], []);

  assert.equal(board[0].section, "Leatherworking");
  assert.equal(board[0].rows[0].plannerSection, "Leatherworking");
  assert.equal(board[0].rows[0].apiSection, "Carpentry");
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
```

Expected: FAIL because the group is still `Leatherwork` and `plannerSection` is undefined.

- [ ] **Step 3: Standardize taxonomy and expose the planner section**

In `craftPlanningTaxonomyData.mjs`, change the section-order entry:

```js
"Leatherwork", "Masonry", "Mining", "Scholar", "Smithing", "Tailoring", "Taming", "Others",
```

to:

```js
"Leatherworking", "Masonry", "Mining", "Scholar", "Smithing", "Tailoring", "Taming", "Others",
```

Then change the row-map property:

```js
Leatherwork: ["Cleaned Pelt", "Hideworking Salt", "Tannin", "Tanned Pelt", "Leather", "Refined Leather", "Textile"],
```

to:

```js
Leatherworking: ["Cleaned Pelt", "Hideworking Salt", "Tannin", "Tanned Pelt", "Leather", "Refined Leather", "Textile"],
```

In `craftPlanningNeedsBoard.ts`, extend `NeedRow` and construct rows with a distinct planner default:

```ts
export type NeedRow = {
  name: string;
  apiName: string;
  overrideKey: string;
  apiSection: string;
  plannerSection: string;
  sectionOverride: string | null;
  rowNameOverride: string | null;
  maxMissing: number;
  cells: Map<string, NeedCell>;
};
```

Replace the section derivation and row creation inside `buildNeedsBoard` with:

```ts
const sectionOverride = overrideMatchesFamily && material.sectionOverride != null ? String(material.sectionOverride) : null;
const plannerSection = taxonomy.section || String(material.section ?? "Other");
const section = sectionOverride || plannerSection;
const rowNameOverride = overrideMatchesFamily && material.rowNameOverride != null ? String(material.rowNameOverride).trim() || null : null;
const rowName = rowNameOverride || apiName;
const apiSection = String(material.apiSection ?? material.section ?? "Other");
const column = columnForNeed(material);
if (!groups.has(section)) groups.set(section, new Map());
const rows = groups.get(section)!;
if (!rows.has(rowOverrideKey)) rows.set(rowOverrideKey, {
  name: rowName,
  apiName,
  overrideKey: rowOverrideKey,
  apiSection,
  plannerSection,
  sectionOverride,
  rowNameOverride,
  maxMissing: 0,
  cells: new Map(),
});
```

- [ ] **Step 4: Run the focused test and verify green**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
```

Expected: PASS with no failed tests.

- [ ] **Step 5: Commit the taxonomy unit**

```powershell
git add -- apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.mjs apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
git commit -m "fix: align leatherworking planner taxonomy"
```

### Task 2: Make the row editor follow planner defaults

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:196-219,552-555`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:52-58`

**Interfaces:**
- Consumes: `NeedRow.plannerSection` from Task 1 and `NeedRow.sectionOverride`.
- Produces: row-editor initial section `row.sectionOverride ?? row.plannerSection` and planner-default copy.

- [ ] **Step 1: Write the failing page boundary assertions**

Replace the existing reset-copy assertion and add source-of-truth assertions:

```js
assert.match(page, /Row display name/);
assert.match(page, /Planner default:/);
assert.match(page, /Use planner defaults/);
assert.doesNotMatch(page, /Use API defaults/);
assert.match(page, /section:\s*row\.sectionOverride\s*\?\?\s*row\.plannerSection/);
assert.doesNotMatch(page, /section:\s*row\.sectionOverride\s*\?\?\s*row\.apiSection/);
assert.match(page, /Save row/);
```

- [ ] **Step 2: Run the boundary test and verify red**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: FAIL because the page still says `API default`, offers `Use API defaults`, and initializes from `row.apiSection`.

- [ ] **Step 3: Update the dialog state and copy**

Replace the dialog description and reset button with:

```tsx
<p>Planner default: {selectedSectionOverride.row.apiName} in {selectedSectionOverride.row.plannerSection}. Overrides apply to the same row across craft goals.</p>
```

```tsx
<button className="toolbar-button" type="button" onClick={() => void saveRowOverride(selectedSectionOverride.row, null, null)}>Use planner defaults</button>
```

Replace the row-button click handler with:

```tsx
onClick={() => setSelectedSectionOverride({
  row,
  section: row.sectionOverride ?? row.plannerSection,
  name: row.rowNameOverride ?? row.apiName,
})}
```

- [ ] **Step 4: Run the page boundary and Needs Board tests**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
```

Expected: PASS with no failed tests.

- [ ] **Step 5: Commit the row-editor unit**

```powershell
git add -- apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "fix: use planner sections in row editor"
```

### Task 3: Align Discord effort lookup and notification titles

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs:18-28,81-128`
- Test: `apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs:62-160,230-270`

**Interfaces:**
- Consumes: `plan.config.name`, compatibility fallback `plan.name`, `effort.sections`, and `normalizeCraftPlanReportProfession(value)`.
- Produces: alias-aware `effortSectionForProfession(effort, profession)`, consistent report titles, and unavailable state for unmatched visible profession effort.

- [ ] **Step 1: Add failing Leatherworking, override, missing-effort, and title tests**

Add these tests after the existing taxonomy tests:

```js
test("Discord resolves legacy Leatherwork effort as Leatherworking progress", () => {
  const leather = [{
    name: "Basic Leather",
    tag: "Leather",
    section: "Carpentry",
    required: 100,
    available: 50,
    missing: 50,
    hasRecipeUsages: true,
  }];
  const report = buildCraftPlanDiscordReport({
    enabled: true,
    targets: [{}],
    materials: leather,
    effortProgress: makeEffortProgress({ overall: 50, Leatherwork: 50 }),
  });

  assert.equal(report.state, "ready");
  assert.deepEqual(report.professions.map(({ name, completion }) => [name, completion]), [["Leatherworking", 50]]);
});

test("Discord profession grouping respects explicit Needs Board section overrides", () => {
  const report = buildCraftPlanDiscordReport({
    enabled: true,
    targets: [{}],
    materials: [{
      name: "Rough Wood Log",
      tag: "Wood Log",
      section: "Forestry",
      sectionOverride: "Farming",
      required: 100,
      available: 25,
      missing: 75,
      hasRecipeUsages: true,
    }],
    effortProgress: makeEffortProgress({ overall: 25, Farming: 25 }),
  });

  assert.deepEqual(report.professions.map(({ name, completion }) => [name, completion]), [["Farming", 25]]);
});

test("Discord reports become unavailable instead of showing false zero profession effort", () => {
  const report = buildCraftPlanDiscordReport({
    enabled: true,
    targets: [{}],
    materials: [{ name: "Basic Leather", tag: "Leather", required: 10, available: 5, missing: 5, hasRecipeUsages: true }],
    effortProgress: makeEffortProgress({ overall: 50, Carpentry: 50 }),
  });

  assert.equal(report.state, "unavailable");
  assert.equal(report.overall, undefined);
});

test("Craft Planner Discord titles include the configured plan name", () => {
  const plan = withEffort({
    enabled: true,
    config: { name: "  T6 Push  " },
    materials,
    targets: [{}],
  });

  assert.equal(buildCraftPlanDiscordReport(plan).title, "T6 Push - Crafting Progress");
  assert.equal(buildCraftPlanDiscordReport(plan, "forestry").title, "T6 Push - Forestry Progress");
  assert.equal(buildCraftPlanDiscordReport(plan, "leatherworking").title, "T6 Push - Leatherworking Progress");
  assert.equal(buildCraftPlanDiscordReport({ enabled: false, config: { name: "T6 Push" } }).title, "T6 Push - Crafting Progress");
});
```

Keep the existing generic-title assertions unchanged; they cover the blank/unavailable-name fallback.

- [ ] **Step 2: Run the Discord report test and verify red**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
```

Expected: FAIL with legacy Leatherwork at `0`, the override grouped under Forestry, missing effort reported as ready, and unprefixed titles.

- [ ] **Step 3: Add canonical helpers and override-aware material classification**

Add these helpers below `normalizeCraftPlanReportProfession` and replace `materialProfession`:

```js
function craftPlanReportTitle(plan = {}, profession = "") {
  const base = profession ? `${profession} Progress` : "Crafting Progress";
  const configuredName = String(plan?.config?.name ?? "").trim();
  const compatibilityName = String(plan?.name ?? "").trim();
  const planName = configuredName || compatibilityName;
  return planName ? `${planName} - ${base}` : base;
}

function effortSectionForProfession(effort = {}, profession = "") {
  const sections = effort?.sections && typeof effort.sections === "object" ? effort.sections : {};
  if (sections[profession]?.completion != null) return sections[profession];
  return Object.entries(sections).find(([name]) => normalizeCraftPlanReportProfession(name) === profession)?.[1];
}

function materialProfession(material = {}) {
  const taxonomy = plannerTaxonomyFor(material);
  if (taxonomy.hidden) return "";
  const sectionOverride = String(material.sectionOverride ?? "").trim();
  return normalizeCraftPlanReportProfession(sectionOverride || taxonomy.section || material.section || material.profession || "");
}
```

- [ ] **Step 4: Replace report construction with alias-aware effort validation and titles**

Replace `buildCraftPlanDiscordReport` with:

```js
export function buildCraftPlanDiscordReport(plan = {}, requestedProfession = "") {
  if (!plan.enabled) return { state: "disabled", title: craftPlanReportTitle(plan), message: "Craft Planner is disabled." };
  if (!Array.isArray(plan.targets) || plan.targets.length === 0) return { state: "empty", title: craftPlanReportTitle(plan), message: "Craft Planner has no configured targets." };
  const profession = requestedProfession ? normalizeCraftPlanReportProfession(requestedProfession) : "";
  if (requestedProfession && !profession) return { state: "unknown_profession", title: craftPlanReportTitle(plan), message: "That profession is not available." };
  const title = craftPlanReportTitle(plan, profession);

  const all = relevantMaterials(plan);
  const selected = profession ? all.filter((material) => materialProfession(material) === profession) : all;
  if (profession && selected.length === 0) return { state: "empty_profession", title, message: `${profession} has no requirements in the current plan.`, profession };

  const effort = plan.effortProgress?.fishingVariants?.ocean ?? plan.effortProgress;
  const overallEffort = profession ? effortSectionForProfession(effort, profession) : effort?.overall;
  if (!effort || overallEffort?.completion == null) {
    return {
      state: "unavailable",
      title,
      message: boundedEffortWarning(plan.effortProgress),
      ...(profession ? { profession } : {}),
    };
  }

  const byProfession = new Map();
  for (const material of all) {
    const name = materialProfession(material);
    if (!name) continue;
    if (!byProfession.has(name)) byProfession.set(name, []);
    byProfession.get(name).push(material);
  }
  const professionEntries = [...byProfession.entries()].filter(([name]) => !profession || name === profession);
  const unresolvedProfession = professionEntries.some(([name]) => effortSectionForProfession(effort, name)?.completion == null);
  if (unresolvedProfession) {
    return {
      state: "unavailable",
      title,
      message: boundedEffortWarning(plan.effortProgress),
      ...(profession ? { profession } : {}),
    };
  }

  const shortages = selected
    .map((material) => ({ name: String(material.name ?? material.label ?? material.itemName ?? "Unknown item").slice(0, 100), missing: Math.max(0, number(material.missing)), profession: materialProfession(material) }))
    .filter((item) => item.missing > 0)
    .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name))
    .slice(0, profession ? 10 : 5);
  const overall = { ...summarize(selected), completion: number(overallEffort.completion) };
  const professions = professionEntries
    .map(([name, entries]) => ({ name, ...summarize(entries), completion: number(effortSectionForProfession(effort, name).completion) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    state: shortages.length === 0 ? "complete" : "ready",
    title,
    profession,
    overall,
    professions,
    shortages,
    ...(effortSectionForProfession(effort, "Fishing") || plan.effortProgress?.fishingVariants?.ocean ? { fishingRoute: "ocean" } : {}),
    calculatedAt: String(plan.totals?.calculatedAt ?? plan.calculatedAt ?? new Date().toISOString()),
  };
}
```

Leave `buildUnavailableCraftPlanDiscordReport()` generic because it has no plan argument.

- [ ] **Step 5: Run the focused Discord report test and verify green**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
```

Expected: PASS with no failed tests.

- [ ] **Step 6: Commit the Discord reporting unit**

```powershell
git add -- apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
git commit -m "fix: align craft plan Discord progress"
```

### Task 4: Full verification and visual smoke check

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: all deliverables from Tasks 1-3.
- Produces: build, full-suite, and browser evidence without sending Discord messages.

- [ ] **Step 1: Run all focused regressions together**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Build the maintained app**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 3: Run the complete maintained-app test suite**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: PASS with zero failed tests.

- [ ] **Step 4: Start the stable smoke server and confirm health**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: the launcher returns promptly and health returns a successful JSON response.

- [ ] **Step 5: Browser-check the Needs Board editor**

Open `http://127.0.0.1:18449/?page=planning` using the in-app browser session. Confirm:

- The board heading is `Leatherworking`, not `Leatherwork`.
- Opening a leather row shows `Leatherworking` in the section selector even when its raw API section is Carpentry.
- The dialog says `Planner default` and the reset control says `Use planner defaults`.
- No page, modal, or console error appears.

Do not invoke a Discord test-send endpoint; Discord output is covered by unit tests.

- [ ] **Step 6: Inspect final scope and working tree**

Run:

```powershell
git diff --check
git status --short
git log -4 --oneline
```

Expected: no whitespace errors; only intentional implementation state is present; the design, taxonomy, row-editor, and Discord commits are visible.
