# Empire Hexite Reserve Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Empire Hexite estimate with separately sortable stored-Energy, stored-Capsule, and combined Watchtower-Energy columns using the verified 1,000-energy Capsule deployment value.

**Architecture:** Keep collection and persistence unchanged, but separate the live 100 HE crafting cost from a new 1,000 Watchtower-energy domain constant in the aggregate contract. Extend the focused presentation module to format each metric, then render three compact columns through the existing `DataTable` numeric sort accessor.

**Tech Stack:** Node.js 24, `node:sqlite`, Node test runner, React, TypeScript, Vite, plain CSS.

## Global Constraints

- `capsuleEnergyCost` remains the live crafting cost returned by `/parameters`.
- `capsuleWatchtowerEnergyValue` is exactly `1000` until BitJita exposes an authoritative field.
- Watchtower Energy is `energy.total + capsules.readyTotal × capsuleWatchtowerEnergyValue`.
- Completed Foundry Capsules remain `null`, unavailable, and excluded.
- Missing values display `Queued`, `Scanning`, or `Unavailable`, never zero.
- All three metrics sort numerically with unavailable rows last in either direction.
- Preserve the existing dense horizontally scrollable table; add no modal, card, dependency, or framework.

---

### Task 1: Separate Capsule crafting cost from Watchtower energy value

**Files:**
- Modify: `apps/bitcraft-local/src/server/empireHexite.mjs`
- Test: `apps/bitcraft-local/test/server-empire-hexite.test.mjs`
- Test: `apps/bitcraft-local/test/server.test.mjs`

**Interfaces:**
- Produces: `HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE = 1000`.
- Produces: `hexiteReserves.capsuleWatchtowerEnergyValue: number` on pending, calculated, partial, and error payloads.
- Preserves: `hexiteReserves.capsuleEnergyCost`, populated from `/parameters`.
- Changes: `estimatedEnergyEquivalent` to the combined Watchtower Energy formula.

- [ ] **Step 1: Write the failing aggregate tests**

In `test/server-empire-hexite.test.mjs`, import the new constant and change the main aggregate assertions to distinguish creation cost from deployment value:

```js
import {
  HEXITE_CAPSULE_CARGO_ID,
  HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE,
  HEXITE_ENERGY_ITEM_ID,
  aggregateEmpireHexite,
  // existing imports remain
} from "../src/server/empireHexite.mjs";

assert.equal(HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE, 1_000);
assert.equal(result.energy.total, 1_184);
assert.equal(result.capsules.readyTotal, 43);
assert.equal(result.capsuleEnergyCost, 100);
assert.equal(result.capsuleWatchtowerEnergyValue, 1_000);
assert.equal(result.estimatedEnergyEquivalent, 44_184);
```

Update repository expectations that include Capsules:

```js
assert.equal(repository.snapshotForEmpire("e1").estimatedEnergyEquivalent, 5_130);
assert.equal(refreshed.estimatedEnergyEquivalent, 2_210);
assert.equal(repository.snapshotForEmpire("e1").estimatedEnergyEquivalent, 1_010);
assert.equal(repository.snapshotForEmpire("e1").capsuleWatchtowerEnergyValue, 1_000);
```

For the end-to-end refresh fixture whose final snapshot currently expects `410`, use these exact assertions:

```js
const snapshot = repository.snapshotForEmpire("e1");
assert.equal(snapshot.energy.total, 110);
assert.equal(snapshot.capsules.readyTotal, 3);
assert.equal(snapshot.capsuleEnergyCost, 100);
assert.equal(snapshot.capsuleWatchtowerEnergyValue, 1_000);
assert.equal(snapshot.estimatedEnergyEquivalent, 3_110);
```

Add `capsuleWatchtowerEnergyValue: 1_000` to the exact failed-discovery snapshot expected object; its `estimatedEnergyEquivalent` remains `null`.

- [ ] **Step 2: Run the focused backend test and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/server-empire-hexite.test.mjs
```

Expected: FAIL because `HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE` is not exported and Capsule totals still use `capsuleEnergyCost`.

- [ ] **Step 3: Implement the domain constant and formula**

In `src/server/empireHexite.mjs`, add the constant beside the item IDs:

```js
export const HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE = 1_000;
```

In `aggregateEmpireHexite`, preserve the live creation cost but calculate deployment value separately:

```js
const cost = capsuleEnergyCost == null ? null : number(capsuleEnergyCost);
const watchtowerEnergyValue = HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE;
const hasScan = Boolean(calculatedAt);

return {
  estimatedEnergyEquivalent: hasScan
    ? totalEnergy + readyTotal * watchtowerEnergyValue
    : null,
  capsuleEnergyCost: cost,
  capsuleWatchtowerEnergyValue: watchtowerEnergyValue,
  // existing energy, capsules, coverage, status, timestamps, and errors
};
```

Do not make the combined value depend on `/parameters`; the upstream value remains metadata about crafting cost only.

- [ ] **Step 4: Verify the aggregate and persistence tests GREEN**

Run the same focused command. Expected: all `server-empire-hexite` tests pass with the new 1,000-value expectations.

- [ ] **Step 5: Add failing local API contract assertions**

In `test/server.test.mjs`, extend `calculatedHexitePayload` and API assertions:

```js
const calculatedHexitePayload = {
  estimatedEnergyEquivalent: 8_100,
  capsuleEnergyCost: 100,
  capsuleWatchtowerEnergyValue: 1_000,
  energy: { treasury: 5_000, playerInventories: 100, sharedClaimInventories: 0, total: 5_100 },
  capsules: { playerInventories: 1, sharedClaimInventories: 2, reserveBuildings: 2, foundry: null, readyTotal: 3 },
  // existing coverage/status/timestamps/errors
};

assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.energy.total, 5_100);
assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.capsules.readyTotal, 3);
assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.capsuleEnergyCost, 100);
assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.capsuleWatchtowerEnergyValue, 1_000);
assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.estimatedEnergyEquivalent, 8_100);
```

Also assert the initial pending payload exposes `capsuleWatchtowerEnergyValue: 1000` while `estimatedEnergyEquivalent` remains `null`.

- [ ] **Step 6: Run the local API test and verify RED then GREEN**

First run before adding the production field to confirm the new assertion fails, then run again after the Step 3 implementation:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/server.test.mjs
```

Expected final result: all server integration tests pass.

- [ ] **Step 7: Commit the backend semantic correction**

```powershell
git add apps/bitcraft-local/src/server/empireHexite.mjs apps/bitcraft-local/test/server-empire-hexite.test.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "fix: value Hexite Capsules as Watchtower energy"
```

---

### Task 2: Present the three reserve metrics without conflating their meanings

**Files:**
- Modify: `apps/bitcraft-local/src/pages/empires/hexitePresentation.ts`
- Test: `apps/bitcraft-local/test/empires-hexite-presentation.test.mjs`

**Interfaces:**
- Produces: `HexiteReserveMetric = "energy" | "capsules" | "watchtower"`.
- Produces: `presentHexiteReserveMetric(value, metric, nowMs?)` returning the existing `HexiteReservePresentation` shape.
- Produces: `describeHexiteReserveMetric(value, metric)` for metric-specific tooltips.
- Preserves: `presentHexiteReserves` and `describeHexiteReserves` as Watchtower-metric compatibility wrappers.

- [ ] **Step 1: Write failing presentation tests for all three metrics**

Replace the single calculated-presentation fixture with:

```ts
const calculated = {
  status: "partial",
  refreshing: false,
  estimatedEnergyEquivalent: 44_184,
  capsuleEnergyCost: 100,
  capsuleWatchtowerEnergyValue: 1_000,
  calculatedAt: "2026-07-18T10:00:00.000Z",
  energy: { treasury: 1_059, playerInventories: 109, sharedClaimInventories: 16, total: 1_184 },
  capsules: { readyTotal: 43, reserveBuildings: 37 },
  coverage: {
    players: { fresh: 1, reused: 1, missing: 1, total: 3 },
    claims: { fresh: 1, reused: 0, missing: 0, total: 1 },
    foundry: "unavailable",
  },
};

assert.equal(presentHexiteReserveMetric(calculated, "energy").primary, "1,184 HE");
assert.equal(presentHexiteReserveMetric(calculated, "energy").sortValue, 1_184);
assert.equal(presentHexiteReserveMetric(calculated, "capsules").primary, "43");
assert.equal(presentHexiteReserveMetric(calculated, "capsules").secondary, "37 in Hexite Reserves");
assert.equal(presentHexiteReserveMetric(calculated, "capsules").sortValue, 43);

const watchtower = presentHexiteReserveMetric(calculated, "watchtower", Date.parse("2026-07-18T12:00:00.000Z"));
assert.equal(watchtower.primary, "≈ 44,184 energy");
assert.equal(watchtower.secondary, "43 capsules × 1,000");
assert.equal(watchtower.detail, "Partial · 75% scanned · 2h ago");
assert.equal(watchtower.sortValue, 44_184);
```

Add a loop proving pending/error behavior for every metric:

```ts
for (const metric of ["energy", "capsules", "watchtower"] as const) {
  assert.equal(presentHexiteReserveMetric({ status: "pending", refreshing: false }, metric).primary, "Queued");
  assert.equal(presentHexiteReserveMetric({ status: "pending", refreshing: true }, metric).primary, "Scanning");
  assert.equal(presentHexiteReserveMetric({ status: "error" }, metric).primary, "Unavailable");
  assert.equal(presentHexiteReserveMetric({ status: "error" }, metric).sortValue, null);
}
```

Assert tooltip semantics:

```ts
assert.match(describeHexiteReserveMetric(calculated, "energy"), /1,184 HE stored/);
assert.match(describeHexiteReserveMetric(calculated, "capsules"), /37 in Hexite Reserves/);
assert.match(describeHexiteReserveMetric(calculated, "watchtower"), /cost 100 HE to craft/i);
assert.match(describeHexiteReserveMetric(calculated, "watchtower"), /provide 1,000 Watchtower energy/i);
```

- [ ] **Step 2: Run the presentation test and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/empires-hexite-presentation.test.mjs
```

Expected: FAIL because the metric-aware functions do not exist.

- [ ] **Step 3: Implement metric-aware formatting**

Extend `HexiteReserves` with `energy.total` and `capsuleWatchtowerEnergyValue`, then add:

```ts
export type HexiteReserveMetric = "energy" | "capsules" | "watchtower";

function metricValue(value: HexiteReserves, metric: HexiteReserveMetric): number | null {
  const raw = metric === "energy"
    ? value.energy?.total
    : metric === "capsules"
      ? value.capsules?.readyTotal
      : value.estimatedEnergyEquivalent;
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function presentHexiteReserveMetric(
  value: HexiteReserves | null | undefined,
  metric: HexiteReserveMetric,
  nowMs = Date.now(),
): HexiteReservePresentation {
  if (!value || value.status === "pending") return pendingPresentation(value?.refreshing);
  const amount = metricValue(value, metric);
  if (amount == null) return unavailablePresentation();
  const status = value.status === "complete" ? "Complete" : "Partial";
  const detail = `${status} · ${coveragePercent(value)}% scanned · ${ageLabel(value.calculatedAt, nowMs)}`;
  if (metric === "energy") return {
    primary: `${formatted(amount)} HE`, secondary: "Loose energy stored", detail,
    sortValue: amount, tone: value.status === "complete" ? "good" : "warn",
  };
  if (metric === "capsules") return {
    primary: formatted(amount), secondary: `${formatted(value.capsules?.reserveBuildings)} in Hexite Reserves`, detail,
    sortValue: amount, tone: value.status === "complete" ? "good" : "warn",
  };
  return {
    primary: `≈ ${formatted(amount)} energy`,
    secondary: `${formatted(value.capsules?.readyTotal)} capsules × ${formatted(value.capsuleWatchtowerEnergyValue)}`,
    detail, sortValue: amount, tone: value.status === "complete" ? "good" : "warn",
  };
}
```

Extract the existing queued and unavailable literals into `pendingPresentation` and `unavailablePresentation` helpers so all three metrics share identical non-numeric states.

Implement `describeHexiteReserveMetric` with these exact facts:

```ts
if (metric === "energy") return `${formatted(value.energy?.total)} HE stored across treasury, member, and aligned-claim sources.`;
if (metric === "capsules") return `${formatted(value.capsules?.readyTotal)} ready Capsules; ${formatted(value.capsules?.reserveBuildings)} in Hexite Reserves.`;
```

For `watchtower`, retain source coverage/errors/Foundry copy and include:

```ts
`Capsules cost ${formatted(value.capsuleEnergyCost)} HE to craft and provide ${formatted(value.capsuleWatchtowerEnergyValue)} Watchtower energy when deployed.`
```

Keep compatibility wrappers:

```ts
export const presentHexiteReserves = (value: HexiteReserves | null | undefined, nowMs = Date.now()) =>
  presentHexiteReserveMetric(value, "watchtower", nowMs);

export const describeHexiteReserves = (value: HexiteReserves | null | undefined) =>
  describeHexiteReserveMetric(value, "watchtower");
```

- [ ] **Step 4: Run the presentation tests and verify GREEN**

Run the Step 2 command. Expected: all presentation and optional-sort tests pass.

- [ ] **Step 5: Commit the presentation seam**

```powershell
git add apps/bitcraft-local/src/pages/empires/hexitePresentation.ts apps/bitcraft-local/test/empires-hexite-presentation.test.mjs
git commit -m "feat: present Empire Hexite reserve metrics"
```

---

### Task 3: Render and verify the three sortable Empires columns

**Files:**
- Modify: `apps/bitcraft-local/src/pages/EmpiresPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/empires.css`
- Test: `apps/bitcraft-local/test/empires-page-boundary.test.mjs`

**Interfaces:**
- Consumes: `presentHexiteReserveMetric` and `describeHexiteReserveMetric` from Task 2.
- Produces: visible columns `Hexite Energy`, `Capsules`, and `Watchtower Energy`.

- [ ] **Step 1: Write the failing table-boundary test**

Add to `test/empires-page-boundary.test.mjs`:

```js
test("Empire overview separates stored Hexite from Watchtower energy", () => {
  assert.match(empiresPage, /\["Hexite Energy",/);
  assert.match(empiresPage, /\["Capsules",/);
  assert.match(empiresPage, /\["Watchtower Energy",/);
  assert.doesNotMatch(empiresPage, /\["Hexite Reserves",/);
  assert.match(empiresPage, /presentHexiteReserveMetric\(row\.hexiteReserves, "energy"\)\.sortValue/);
  assert.match(empiresPage, /presentHexiteReserveMetric\(row\.hexiteReserves, "capsules"\)\.sortValue/);
  assert.match(empiresPage, /presentHexiteReserveMetric\(row\.hexiteReserves, "watchtower"\)\.sortValue/);
  assert.match(empiresPage, /cost 100 HE to craft but provides 1,000 Watchtower energy/);
});
```

- [ ] **Step 2: Run the boundary test and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/empires-page-boundary.test.mjs
```

Expected: FAIL because the page still renders one `Hexite Reserves` column.

- [ ] **Step 3: Replace the single-purpose cell with a metric cell**

Update imports and the cell component in `EmpiresPage.tsx`:

```tsx
import {
  describeHexiteReserveMetric,
  presentHexiteReserveMetric,
  type HexiteReserveMetric,
} from "./empires/hexitePresentation";

function HexiteReserveCell({ value, metric }: { value: AnyRecord; metric: HexiteReserveMetric }) {
  const presentation = presentHexiteReserveMetric(value, metric);
  const title = describeHexiteReserveMetric(value, metric);
  return (
    <span className={`hexite-reserve-cell ${metric}`} title={title} aria-label={`${presentation.primary}. ${presentation.secondary}. ${presentation.detail}`}>
      <strong>{presentation.primary}</strong>
      <small>{presentation.secondary}</small>
      <span className={`hexite-reserve-status ${presentation.tone}`}>{presentation.detail}</span>
    </span>
  );
}
```

Replace the old column with:

```tsx
["Hexite Energy", (row) => <HexiteReserveCell value={row.hexiteReserves ?? {}} metric="energy" />, (row) => presentHexiteReserveMetric(row.hexiteReserves, "energy").sortValue],
["Capsules", (row) => <HexiteReserveCell value={row.hexiteReserves ?? {}} metric="capsules" />, (row) => presentHexiteReserveMetric(row.hexiteReserves, "capsules").sortValue],
["Watchtower Energy", (row) => <HexiteReserveCell value={row.hexiteReserves ?? {}} metric="watchtower" />, (row) => presentHexiteReserveMetric(row.hexiteReserves, "watchtower").sortValue],
```

Update the note to:

```tsx
<p className="hexite-reserve-note"><Zap size={14} /> Hexite Energy and completed Capsules include empire treasury, member, and aligned-claim holdings. A Capsule costs 100 HE to craft but provides 1,000 Watchtower energy when deployed. Foundry output is unavailable and excluded.</p>
```

- [ ] **Step 4: Keep the cells dense and the table scroll-contained**

In `styles/empires.css`, retain the existing grid and add metric widths:

```css
.hexite-reserve-cell.energy,
.hexite-reserve-cell.capsules {
  min-width: 148px;
}

.hexite-reserve-cell.watchtower {
  min-width: 190px;
}
```

Do not change the existing `.table-wrap` overflow behavior or mobile page width rules.

- [ ] **Step 5: Run the boundary and presentation tests GREEN**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/empires-page-boundary.test.mjs test/empires-hexite-presentation.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Run complete verification**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: zero failed tests and a successful TypeScript/Vite production build. The existing Vite chunk-size warning is non-blocking.

- [ ] **Step 7: Browser-check desktop and mobile**

Build and restart the stable smoke server because backend code changed:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
```

At `http://127.0.0.1:18449/?page=empires`, verify at 1280×720 and 390×844:

- all three column headers are visible through horizontal scrolling;
- queued/scanning/unavailable cells do not show numeric zero;
- calculated cells show separate Energy, Capsule, and Watchtower values;
- the page root does not horizontally overflow;
- `.table-wrap` owns horizontal overflow;
- no browser console errors occur.

- [ ] **Step 8: Commit and update the existing PR**

```powershell
git add apps/bitcraft-local/src/pages/EmpiresPage.tsx apps/bitcraft-local/src/styles/empires.css apps/bitcraft-local/test/empires-page-boundary.test.mjs
git commit -m "feat: split Empire Hexite reserve columns"
git push origin codex/empire-hexite-reserves
```

Confirm PR #24 remains draft, targets `main`, and contains only the Hexite feature/spec changes.
