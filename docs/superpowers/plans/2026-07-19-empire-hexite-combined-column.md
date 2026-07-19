# Empire Hexite Reserves Combined Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three Empire Hexite metric columns with one sortable, accessible Hexite Reserves summary that shows the known Watchtower-energy minimum and corrects stale ×100 aggregates.

**Architecture:** Normalize published aggregate payloads at the repository read boundary so all API consumers receive HE plus Capsules ×1,000. Add one frontend summary presenter that independently derives the same known minimum from component totals, then render it in one table cell with a native `<details>` disclosure for provenance.

**Tech Stack:** Node.js 24, `node:sqlite`, React, TypeScript, plain CSS, Node test runner, Vite, pnpm via Corepack.

## Global Constraints

- Keep the existing Treasury column unchanged.
- Use exactly 1,000 Watchtower energy per completed Capsule; keep the live BitJita Capsule crafting cost as detail-only context.
- Treat completed but uncollected Foundry Capsules as unavailable and excluded.
- Display a known lower bound with `≥`, not an approximate value with `≈`.
- Pending, scanning, and unavailable states must never render as zero.
- Keep unavailable sort values last through the existing optional numeric sort behavior.
- Use a native keyboard-focusable disclosure; do not add a modal.
- Preserve contained horizontal table scrolling and avoid root-level mobile overflow.
- Add no dependencies and make no unrelated refactors.

---

### Task 1: Normalize published Watchtower totals and source status

**Files:**
- Modify: `apps/bitcraft-local/src/server/empireHexite.mjs`
- Test: `apps/bitcraft-local/test/server-empire-hexite.test.mjs`

**Interfaces:**
- Consumes: persisted aggregate objects with `energy.total`, `capsules.readyTotal`, `coverage`, `status`, and possibly stale `estimatedEnergyEquivalent`/`capsuleWatchtowerEnergyValue` values.
- Produces: exported `normalizePublishedEmpireHexite(value)` and repository `snapshotForEmpire(empireId)` results normalized to the current 1,000-energy Capsule value.

- [ ] **Step 1: Write failing aggregate-status and stale-snapshot tests**

Add imports for `normalizePublishedEmpireHexite` and add these focused cases:

```js
test("fresh Empire Hexite sources publish a complete known-inventory status", () => {
  const result = aggregateEmpireHexite({
    treasury: 10,
    capsuleEnergyCost: 100,
    players: [{ state: "fresh", energy: 5, capsules: 1 }],
    claims: [{ state: "fresh", energy: 5, capsules: 2, reserveCapsules: 2 }],
    calculatedAt: "2026-07-19T10:00:00.000Z",
  });

  assert.equal(result.status, "complete");
  assert.equal(result.estimatedEnergyEquivalent, 3_020);
});

test("published Empire Hexite snapshots recompute stale conversion totals on read", () => {
  const stale = {
    status: "partial",
    calculatedAt: "2026-07-19T10:00:00.000Z",
    estimatedEnergyEquivalent: 92_261,
    capsuleEnergyCost: 100,
    capsuleWatchtowerEnergyValue: 0,
    energy: { treasury: 16_300, playerInventories: 20_000, sharedClaimInventories: 1_261, total: 37_561 },
    capsules: { playerInventories: 150, sharedClaimInventories: 397, reserveBuildings: 397, foundry: null, readyTotal: 547 },
    coverage: {
      players: { fresh: 317, reused: 0, missing: 0, total: 317 },
      claims: { fresh: 12, reused: 0, missing: 0, total: 12 },
      foundry: "unavailable",
    },
    errors: [],
  };

  const normalized = normalizePublishedEmpireHexite(stale);
  assert.equal(normalized.estimatedEnergyEquivalent, 584_561);
  assert.equal(normalized.capsuleWatchtowerEnergyValue, 1_000);
  assert.equal(normalized.status, "complete");
});

test("published unavailable snapshots stay unavailable", () => {
  const normalized = normalizePublishedEmpireHexite({
    status: "error",
    estimatedEnergyEquivalent: null,
    energy: { total: 100 },
    capsules: { readyTotal: 2 },
  });

  assert.equal(normalized.estimatedEnergyEquivalent, null);
  assert.equal(normalized.status, "error");
  assert.equal(normalized.capsuleWatchtowerEnergyValue, 1_000);
});
```

- [ ] **Step 2: Run the backend test and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/server-empire-hexite.test.mjs
```

Expected: FAIL because `normalizePublishedEmpireHexite` is not exported and the all-fresh aggregate still reports `partial`.

- [ ] **Step 3: Implement current-value normalization**

Add a nullable finite-number helper, coverage-state helper, and public normalizer near `aggregateEmpireHexite`:

```js
function optionalFiniteNumber(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function aggregateStatus(value) {
  const groups = [value?.coverage?.players, value?.coverage?.claims];
  const reused = groups.reduce((sum, group) => sum + number(group?.reused), 0);
  const missing = groups.reduce((sum, group) => sum + number(group?.missing), 0);
  return reused > 0 || missing > 0 ? "partial" : "complete";
}

export function normalizePublishedEmpireHexite(value) {
  if (!value || typeof value !== "object") return value ?? null;
  const normalized = {
    ...value,
    capsuleWatchtowerEnergyValue: HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE,
  };
  if (value.estimatedEnergyEquivalent == null) return normalized;

  const energy = optionalFiniteNumber(value.energy?.total);
  const capsules = optionalFiniteNumber(value.capsules?.readyTotal);
  if (energy == null || capsules == null) return normalized;

  normalized.estimatedEnergyEquivalent = energy + capsules * HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE;
  normalized.status = aggregateStatus(normalized);
  return normalized;
}
```

In `aggregateEmpireHexite`, construct `sourceCoverage` once and set status from it:

```js
const sourceCoverage = {
  players: coverage(players),
  claims: coverage(claims),
  foundry: "unavailable",
};

// In the returned object:
coverage: sourceCoverage,
status: hasScan ? aggregateStatus({ coverage: sourceCoverage }) : "pending",
```

Normalize repository reads:

```js
snapshotForEmpire(empireId) {
  const row = statements.snapshotForEmpire.get(String(empireId));
  return row ? normalizePublishedEmpireHexite(parseJson(row.payload_json, null)) : null;
},
```

- [ ] **Step 4: Run the backend test and verify GREEN**

Run the same focused command. Expected: all `server-empire-hexite` tests PASS, including existing partial/reused/missing cases.

- [ ] **Step 5: Commit the backend checkpoint**

```powershell
git add apps/bitcraft-local/src/server/empireHexite.mjs apps/bitcraft-local/test/server-empire-hexite.test.mjs
git commit -m "fix: normalize Empire Watchtower energy snapshots"
```

---

### Task 2: Add the combined Hexite Reserves presenter

**Files:**
- Modify: `apps/bitcraft-local/src/pages/empires/hexitePresentation.ts`
- Test: `apps/bitcraft-local/test/empires-hexite-presentation.test.mjs`

**Interfaces:**
- Consumes: the existing `HexiteReserves` API object, including component totals, coverage, timestamps, and errors.
- Produces: `presentHexiteReserveSummary(value, nowMs?)` returning `{ primary, secondary, status, sortValue, tone, details }`.
- Preserves: existing metric presenter exports until all consumers have migrated.

- [ ] **Step 1: Write failing combined-presentation tests**

Import `presentHexiteReserveSummary` and add a fixture matching the screenshot regression:

```js
const complete = {
  status: "partial",
  refreshing: false,
  estimatedEnergyEquivalent: 92_261,
  capsuleEnergyCost: 100,
  capsuleWatchtowerEnergyValue: 0,
  calculatedAt: "2026-07-19T06:00:00.000Z",
  energy: {
    treasury: 16_300,
    playerInventories: 20_000,
    sharedClaimInventories: 1_261,
    total: 37_561,
  },
  capsules: { readyTotal: 547, reserveBuildings: 397 },
  coverage: {
    players: { fresh: 317, reused: 0, missing: 0, total: 317 },
    claims: { fresh: 12, reused: 0, missing: 0, total: 12 },
    foundry: "unavailable",
  },
  errors: [],
};

test("combined Hexite summary derives a compact known minimum from components", () => {
  const result = presentHexiteReserveSummary(complete, Date.parse("2026-07-19T10:00:00.000Z"));
  assert.equal(result.primary, "≥ 584.6K tower energy");
  assert.equal(result.secondary, "37.6K HE + 547 Capsules");
  assert.equal(result.status, "Known inventories scanned · 4h ago");
  assert.equal(result.sortValue, 584_561);
  assert.equal(result.tone, "muted");
  assert.match(result.details.join("\n"), /397 in Hexite Reserve buildings/);
  assert.match(result.details.join("\n"), /cost 100 HE to craft and provide 1,000 Watchtower energy/);
  assert.match(result.details.join("\n"), /Foundry.*unavailable/i);
});

test("combined Hexite summary distinguishes reused and missing inventory sources", () => {
  const reused = structuredClone(complete);
  reused.coverage.players = { fresh: 316, reused: 1, missing: 0, total: 317 };
  assert.match(presentHexiteReserveSummary(reused).status, /Some inventory data reused/);
  assert.equal(presentHexiteReserveSummary(reused).tone, "warn");

  const missing = structuredClone(complete);
  missing.coverage.claims = { fresh: 11, reused: 0, missing: 1, total: 12 };
  assert.match(presentHexiteReserveSummary(missing).status, /Inventory scan incomplete/);
  assert.equal(presentHexiteReserveSummary(missing).tone, "warn");
});

test("combined Hexite summary keeps queued, scanning, and unavailable values out of numeric sorting", () => {
  assert.equal(presentHexiteReserveSummary({ status: "pending", refreshing: false }).primary, "Queued");
  assert.equal(presentHexiteReserveSummary({ status: "pending", refreshing: true }).primary, "Scanning");
  assert.equal(presentHexiteReserveSummary({ status: "error" }).primary, "Unavailable");
  assert.equal(presentHexiteReserveSummary({ status: "error" }).sortValue, null);
});
```

- [ ] **Step 2: Run the presentation test and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/empires-hexite-presentation.test.mjs
```

Expected: FAIL because `presentHexiteReserveSummary` does not exist.

- [ ] **Step 3: Implement the combined presenter**

Import `formatCompactNumber` and add the summary type and presenter:

```ts
import { formatCompactNumber } from "../../utils/format";

export type HexiteReserveSummaryPresentation = {
  primary: string;
  secondary: string;
  status: string;
  sortValue: number | null;
  tone: "muted" | "warn" | "danger";
  details: string[];
};

const WATCHTOWER_ENERGY_PER_CAPSULE = 1_000;

export function presentHexiteReserveSummary(
  value: HexiteReserves | null | undefined,
  nowMs = Date.now(),
): HexiteReserveSummaryPresentation {
  if (!value || value.status === "pending") {
    return {
      primary: value?.refreshing ? "Scanning" : "Queued",
      secondary: value?.refreshing ? "First sweep in progress" : "Awaiting first sweep",
      status: "Foundry output unavailable",
      sortValue: null,
      tone: "muted",
      details: ["Completed Foundry Capsules are unavailable from BitJita and excluded."],
    };
  }

  const energy = optionalNumber(value.energy?.total);
  const capsules = optionalNumber(value.capsules?.readyTotal);
  if (energy == null || capsules == null) {
    return {
      primary: "Unavailable",
      secondary: "No usable reserve total",
      status: "Foundry output unavailable",
      sortValue: null,
      tone: "danger",
      details: ["The Hexite breakdown is not available until the scan completes."],
    };
  }

  const knownTotal = energy + capsules * WATCHTOWER_ENERGY_PER_CAPSULE;
  const groups = [value.coverage?.players, value.coverage?.claims];
  const reused = groups.reduce((sum, group) => sum + number(group?.reused), 0);
  const missing = groups.reduce((sum, group) => sum + number(group?.missing), 0);
  const status = missing > 0
    ? `Inventory scan incomplete · ${ageLabel(value.calculatedAt, nowMs)}`
    : reused > 0
      ? `Some inventory data reused · ${ageLabel(value.calculatedAt, nowMs)}`
      : `Known inventories scanned · ${ageLabel(value.calculatedAt, nowMs)}`;
  const tone = missing > 0 || reused > 0 ? "warn" : "muted";
  const cost = value.capsuleEnergyCost == null ? "unavailable" : formatted(value.capsuleEnergyCost);
  const details = [
    `Known Watchtower energy: at least ${formatted(knownTotal)}`,
    `Stored HE: ${formatted(energy)} total`,
    `Treasury: ${formatted(value.energy?.treasury)} HE`,
    `Player wallets and storage: ${formatted(value.energy?.playerInventories)} HE`,
    `Shared claim storage: ${formatted(value.energy?.sharedClaimInventories)} HE`,
    `Ready Capsules: ${formatted(capsules)}; ${formatted(value.capsules?.reserveBuildings)} in Hexite Reserve buildings`,
    `Capsules cost ${cost} HE to craft and provide ${formatted(WATCHTOWER_ENERGY_PER_CAPSULE)} Watchtower energy when deployed.`,
    `Player sources: ${formatted(value.coverage?.players?.fresh)} fresh, ${formatted(value.coverage?.players?.reused)} reused, ${formatted(value.coverage?.players?.missing)} missing`,
    `Claim sources: ${formatted(value.coverage?.claims?.fresh)} fresh, ${formatted(value.coverage?.claims?.reused)} reused, ${formatted(value.coverage?.claims?.missing)} missing`,
    "Completed Foundry Capsules are unavailable from BitJita and excluded.",
  ];
  if (Array.isArray(value.errors) && value.errors.length) details.push(`Scan errors: ${value.errors.slice(0, 3).join("; ")}`);

  return {
    primary: `≥ ${formatCompactNumber(knownTotal)} tower energy`,
    secondary: `${formatCompactNumber(energy)} HE + ${formatted(capsules)} Capsules`,
    status,
    sortValue: knownTotal,
    tone,
    details,
  };
}
```

- [ ] **Step 4: Run the presentation test and verify GREEN**

Run the same focused command. Expected: all presentation tests PASS with exact `≥`, composition, status, and detail copy.

- [ ] **Step 5: Commit the presentation checkpoint**

```powershell
git add apps/bitcraft-local/src/pages/empires/hexitePresentation.ts apps/bitcraft-local/test/empires-hexite-presentation.test.mjs
git commit -m "feat: present combined Empire Hexite reserves"
```

---

### Task 3: Replace the three columns with one accessible disclosure

**Files:**
- Modify: `apps/bitcraft-local/src/pages/EmpiresPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/empires.css`
- Test: `apps/bitcraft-local/test/empires-page-boundary.test.mjs`

**Interfaces:**
- Consumes: `presentHexiteReserveSummary(value, nowMs?)` from Task 2.
- Produces: one sortable `Hexite Reserves` DataTable column and a native Details disclosure per calculated row.

- [ ] **Step 1: Replace the existing three-column boundary test with a failing combined-column test**

```js
test("Empire overview presents one combined Hexite Reserves column", () => {
  assert.match(empiresPage, /\["Hexite Reserves",/);
  assert.doesNotMatch(empiresPage, /\["Hexite Energy",/);
  assert.doesNotMatch(empiresPage, /\["Capsules",/);
  assert.doesNotMatch(empiresPage, /\["Watchtower Energy",/);
  assert.match(empiresPage, /presentHexiteReserveSummary\(row\.hexiteReserves\)\.sortValue/);
  assert.match(empiresPage, /<details className="hexite-reserve-details">/);
  assert.match(empiresPage, /<summary>Details<\/summary>/);
  assert.match(empiresPage, /Known minimum from treasury and inventories; completed Foundry output is unavailable\./);
  assert.match(empiresCss, /\.hexite-reserve-cell\s*\{[^}]*min-width:\s*230px/s);
  assert.match(empiresCss, /\.hexite-reserve-details summary:focus-visible/);
});
```

- [ ] **Step 2: Run the page boundary test and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/empires-page-boundary.test.mjs
```

Expected: FAIL because the page still defines three metric columns and has no Details disclosure.

- [ ] **Step 3: Implement one combined cell and column**

Replace metric imports with `presentHexiteReserveSummary`. Replace the current cell with:

```tsx
function HexiteReserveCell({ value }: { value: AnyRecord }) {
  const presentation = presentHexiteReserveSummary(value);
  return (
    <span className="hexite-reserve-cell" aria-label={`${presentation.primary}. ${presentation.secondary}. ${presentation.status}`}>
      <strong>{presentation.primary}</strong>
      <small>{presentation.secondary}</small>
      <span className={`hexite-reserve-status ${presentation.tone}`}>{presentation.status}</span>
      {presentation.details.length ? (
        <details className="hexite-reserve-details">
          <summary>Details</summary>
          <span className="hexite-reserve-detail-lines">
            {presentation.details.map((line) => <span key={line}>{line}</span>)}
          </span>
        </details>
      ) : null}
    </span>
  );
}
```

Replace the three DataTable entries with:

```tsx
["Hexite Reserves", (row) => <HexiteReserveCell value={row.hexiteReserves ?? {}} />, (row) => presentHexiteReserveSummary(row.hexiteReserves).sortValue],
```

Replace the long note with:

```tsx
<p className="hexite-reserve-note"><Zap size={14} /> Known minimum from treasury and inventories; completed Foundry output is unavailable.</p>
```

- [ ] **Step 4: Simplify the Hexite CSS and style native disclosure states**

Replace the metric-specific widths with:

```css
.hexite-reserve-cell {
  display: grid;
  gap: 2px;
  min-width: 230px;
  line-height: 1.25;
}

.hexite-reserve-details {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
}

.hexite-reserve-details summary {
  width: fit-content;
  color: var(--text);
  cursor: pointer;
}

.hexite-reserve-details summary:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.hexite-reserve-detail-lines {
  display: grid;
  gap: 3px;
  margin-top: 6px;
  max-width: 320px;
  white-space: normal;
}
```

Keep primary and secondary values on one line. Allow only expanded detail lines to wrap.

- [ ] **Step 5: Run focused tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/empires-page-boundary.test.mjs test/empires-hexite-presentation.test.mjs test/server-empire-hexite.test.mjs test/server.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: focused tests PASS and TypeScript/Vite build succeeds.

- [ ] **Step 6: Commit the UI checkpoint**

```powershell
git add apps/bitcraft-local/src/pages/EmpiresPage.tsx apps/bitcraft-local/src/styles/empires.css apps/bitcraft-local/test/empires-page-boundary.test.mjs
git commit -m "feat: combine Empire Hexite reserves column"
```

---

### Task 4: Full verification and review

**Files:**
- Review: all files changed since commit `9ae0ff0`
- Modify only if a failing check or review finding requires a focused correction.

**Interfaces:**
- Consumes: completed backend, presenter, and UI checkpoints.
- Produces: verified branch ready to update the existing pull request.

- [ ] **Step 1: Run the full test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: every test passes with zero failures.

- [ ] **Step 2: Run a fresh production build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript check and Vite production build succeed.

- [ ] **Step 3: Browser-check desktop and mobile**

Start the production smoke server because backend code changed:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

At `http://127.0.0.1:18449/?page=empires`, verify at 1440×900 and 390×844:

- Only one Hexite Reserves column is present.
- The screenshot fixture scenario would read `≥ 584.6K tower energy` and `37.6K HE + 547 Capsules`.
- Details opens with keyboard and pointer and exposes exact provenance.
- Table overflow stays inside the labelled table wrapper.
- The document does not overflow horizontally.
- No console errors or warnings appear.

- [ ] **Step 4: Run the code-review workflow**

Use the `code-review` skill with fixed point `9ae0ff0`. Resolve any Standards or Spec P0/P1 findings, rerun the affected focused checks, and record lower-priority follow-ups without broad refactoring.

- [ ] **Step 5: Inspect the final diff and branch state**

```powershell
git diff --check 9ae0ff0..HEAD
git status --short --branch
git log --oneline 9ae0ff0..HEAD
```

Expected: no whitespace errors, no uncommitted production changes, and the three intended implementation commits are present.
