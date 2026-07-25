# Notification Defaults and Market Income Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default new-user browser notifications and sounds to off, and add honest 7-day, 30-day, and one-year ranges with a labelled Y-axis to the dashboard market-income chart.

**Architecture:** Keep notification migration behavior in the existing normalization module so missing preferences use the new defaults while explicit saved booleans survive. Expand the existing market-history aggregate to 365 daily rows, derive range-specific lifetime cumulative points in `marketAnalytics.ts`, and keep the chart presentation in the existing dashboard widget and stylesheet.

**Tech Stack:** React, TypeScript, plain CSS, Node HTTP server, `node:sqlite`, Node test runner, pnpm.

## Global Constraints

- Existing saved notification preferences must not be overwritten.
- Discord direct-message preferences remain independent and unchanged.
- The dashboard defaults to `7D` and offers `30D` and `1Y`.
- Partial stored history must be labelled instead of represented as observed zero-sale days.
- No new framework, charting package, or state library.
- Use existing `Segmented`, dashboard card, formatting, and theme patterns.
- Keep backend history reads bounded to 365 daily aggregate rows.

---

### Task 1: Privacy-first notification defaults

**Files:**
- Modify: `apps/bitcraft-local/test/notification-sounds.test.mjs`
- Modify: `apps/bitcraft-local/src/notifications/userToastSettings.ts`

**Interfaces:**
- Consumes: Existing `normalizeNotificationSoundSettings(settings)` and `normalizeUserToastSettings(settings)`.
- Produces: `DEFAULT_NOTIFICATION_SOUND_SETTINGS.soundEnabled === false` and missing toast-category preferences normalized to `false`.

- [ ] **Step 1: Change the tests to express the new missing-value defaults**

Update the corrupted/missing-setting assertions:

```js
assert.deepEqual(normalizeNotificationSoundSettings(null), {
  soundEnabled: false,
  soundId: "alert-pop",
  soundVolume: 0.55,
  soundByType: {},
});

assert.deepEqual(normalizeUserToastSettings("bad saved value"), {
  marketListings: false,
  marketSales: false,
  production: false,
  soundEnabled: false,
  soundId: "alert-pop",
  soundVolume: 0.55,
  soundByType: {},
});
```

Keep the existing explicit-state assertion proving `soundEnabled: true` and explicit category booleans are preserved.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/notification-sounds.test.mjs
```

Expected: failure because the current defaults are `true`.

- [ ] **Step 3: Change only the shared missing-value defaults**

In `userToastSettings.ts`, set:

```ts
export const DEFAULT_NOTIFICATION_SOUND_SETTINGS: NotificationSoundSettings = {
  soundEnabled: false,
  soundId: "alert-pop",
  soundVolume: 0.55,
  soundByType: {},
};

export const DEFAULT_USER_TOAST_SETTINGS: UserToastSettings = {
  marketListings: false,
  marketSales: false,
  production: false,
  ...DEFAULT_NOTIFICATION_SOUND_SETTINGS,
};
```

Do not alter `booleanSetting` or the explicit boolean branches in either normalizer; those branches preserve existing user choices.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/notification-sounds.test.mjs
```

Expected: all notification sound/settings tests pass.

- [ ] **Step 5: Commit the notification-default change**

```sh
git add apps/bitcraft-local/test/notification-sounds.test.mjs apps/bitcraft-local/src/notifications/userToastSettings.ts
git commit -m "fix: default browser notifications to off"
```

### Task 2: Range-aware cumulative market-income data

**Files:**
- Modify: `apps/bitcraft-local/test/market-analytics.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/market/marketAnalytics.ts`

**Interfaces:**
- Produces: `export type MarketIncomeRangeDays = 7 | 30 | 365`.
- Produces: `MARKET_INCOME_RANGES` with IDs `"7"`, `"30"`, and `"365"`.
- Produces: `buildMarketIncomeSummary(dailyRows, endAt, rangeDays, lifetimeTotal)` returning totals, `trend`, `requestedStartDay`, `availableStartDay`, and `partialRange`.
- Consumes later: `DashboardPage.tsx` uses the exported type/options and summary metadata.

- [ ] **Step 1: Add failing tests for lifetime anchoring and partial coverage**

Add tests equivalent to:

```js
test("buildMarketIncomeSummary anchors a seven-day range to lifetime income", () => {
  const summary = buildMarketIncomeSummary([
    { day: "2026-06-01", salesCount: 1, unitsSold: 1, totalValue: 100 },
    { day: "2026-06-24", salesCount: 1, unitsSold: 2, totalValue: 10 },
    { day: "2026-06-25", salesCount: 1, unitsSold: 3, totalValue: 20 },
  ], "2026-06-25", 7, 130);

  assert.equal(summary.partialRange, false);
  assert.equal(summary.requestedStartDay, "2026-06-19");
  assert.equal(summary.trend[0].value, 100);
  assert.deepEqual(summary.trend.at(-1), { at: "2026-06-25", value: 130 });
});

test("buildMarketIncomeSummary does not invent observations before stored history", () => {
  const summary = buildMarketIncomeSummary([
    { day: "2026-06-24", salesCount: 1, unitsSold: 2, totalValue: 10 },
    { day: "2026-06-25", salesCount: 1, unitsSold: 3, totalValue: 20 },
  ], "2026-06-25", 30, 30);

  assert.equal(summary.partialRange, true);
  assert.equal(summary.availableStartDay, "2026-06-24");
  assert.equal(summary.trend[0].at, "2026-06-24");
});
```

Also assert the stable range definitions:

```js
assert.deepEqual(MARKET_INCOME_RANGES, [
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "30D", days: 30 },
  { id: "365", label: "1Y", days: 365 },
]);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/market-analytics.test.mjs
```

Expected: failure because range parameters and coverage metadata do not exist.

- [ ] **Step 3: Implement range normalization and cumulative projection**

Add:

```ts
export type MarketIncomeRangeDays = 7 | 30 | 365;

export const MARKET_INCOME_RANGES = [
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "30D", days: 30 },
  { id: "365", label: "1Y", days: 365 },
] as const;
```

Update `buildMarketIncomeSummary` so it:

1. Normalizes and sorts valid daily rows.
2. Calculates the inclusive requested start as `end day - (rangeDays - 1)`.
3. Uses the later of requested start and the oldest stored sale day as the first plotted day.
4. Marks `partialRange` when the oldest stored sale is later than the requested start.
5. Starts running cumulative income at `lifetimeTotal - sum(rows on or after the plotted start)`.
6. Adds each calendar day's income through the end date, carrying the prior value across observed no-sale days only after the safe plotted start.
7. Preserves aggregate sales/unit/value fallbacks from normalized rows.

Return:

```ts
{
  totalValue,
  salesCount,
  unitsSold,
  trend,
  requestedStartDay,
  availableStartDay: firstDay ?? null,
  partialRange,
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/market-analytics.test.mjs
```

Expected: all market analytics tests pass.

- [ ] **Step 5: Commit the range analytics**

```sh
git add apps/bitcraft-local/test/market-analytics.test.mjs apps/bitcraft-local/src/pages/market/marketAnalytics.ts
git commit -m "feat: calculate ranged market income trends"
```

### Task 3: Return one year of bounded daily market aggregates

**Files:**
- Create: `apps/bitcraft-local/test/market-history-range-boundary.test.mjs`
- Modify: `apps/bitcraft-local/server.mjs`

**Interfaces:**
- Produces: `MARKET_DAILY_HISTORY_LIMIT = 365`.
- Produces: Existing `marketHistory()` response shape with `daily` expanded from 30 to at most 365 rows.
- Consumes later: Dashboard continues reading `marketHistory.daily`; no API route or response-key change.

- [ ] **Step 1: Add a failing source-boundary test**

Create:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("market history returns a bounded year of daily aggregates", () => {
  assert.match(server, /const MARKET_DAILY_HISTORY_LIMIT = 365;/);
  assert.match(server, /LIMIT \\?\\s*`\\)\\.all\\(\\.\\.\\.tradeArgs, MARKET_DAILY_HISTORY_LIMIT\\)\\.reverse\\(\\)/s);
  assert.doesNotMatch(server, /GROUP BY day\\s*ORDER BY day DESC\\s*LIMIT 30/s);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
node --test apps/bitcraft-local/test/market-history-range-boundary.test.mjs
```

Expected: failure because the server still embeds `LIMIT 30`.

- [ ] **Step 3: Bind the 365-row limit in the daily query**

Define the constant near other market collection constants:

```js
const MARKET_DAILY_HISTORY_LIMIT = 365;
```

Change only the daily query tail:

```js
GROUP BY day
ORDER BY day DESC
LIMIT ?
`).all(...tradeArgs, MARKET_DAILY_HISTORY_LIMIT).reverse();
```

Keep sale events, live listings, pending events, totals, and their existing limits unchanged.

- [ ] **Step 4: Run focused server verification**

Run:

```sh
node --test apps/bitcraft-local/test/market-history-range-boundary.test.mjs
node --test apps/bitcraft-local/test/server.test.mjs
```

Expected: both commands pass.

- [ ] **Step 5: Commit the bounded history expansion**

```sh
git add apps/bitcraft-local/test/market-history-range-boundary.test.mjs apps/bitcraft-local/server.mjs
git commit -m "feat: expose one year of daily market history"
```

### Task 4: Add range controls and a labelled Y-axis

**Files:**
- Create: `apps/bitcraft-local/test/dashboard-market-income-chart.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/DashboardPage.tsx`
- Modify: `apps/bitcraft-local/src/components/main/DashboardWidgets.tsx`
- Modify: `apps/bitcraft-local/src/styles/dashboard.css`

**Interfaces:**
- Consumes: `MARKET_INCOME_RANGES`, `MarketIncomeRangeDays`, and range-aware `buildMarketIncomeSummary`.
- Consumes: Shared `Segmented` component.
- Produces: `DashboardCardHeader.control?: React.ReactNode`.
- Produces: `DashboardTrend.yAxisLabel?: string`.

- [ ] **Step 1: Add a failing dashboard structure/accessibility test**

Create a source-boundary test that asserts:

```js
assert.match(dashboardPage, /MARKET_INCOME_RANGES/);
assert.match(dashboardPage, /useState<MarketIncomeRangeDays>\\(7\\)/);
assert.match(dashboardPage, /<Segmented/);
assert.match(dashboardPage, /label="Market income range"/);
assert.match(dashboardPage, /yAxisLabel="Cumulative gold"/);
assert.match(widgets, /dashboard-chart-y-axis/);
assert.match(widgets, /aria-label=\\{yAxisLabel\\}/);
assert.match(styles, /\\.dashboard-chart-controls/);
assert.match(styles, /\\.dashboard-chart-y-axis/);
```

Also assert `DashboardPage` reads the real server total:

```js
assert.match(dashboardPage, /totals\\?\\.trackedValue/);
```

- [ ] **Step 2: Run the dashboard test and verify it fails**

Run:

```sh
node --test apps/bitcraft-local/test/dashboard-market-income-chart.test.mjs
```

Expected: failure because the range controls and Y-axis do not exist.

- [ ] **Step 3: Wire range selection into the dashboard**

In `DashboardPage.tsx`:

- Import `Segmented`.
- Import `MARKET_INCOME_RANGES` and `MarketIncomeRangeDays`.
- Add top-level state:

```ts
const [marketIncomeRange, setMarketIncomeRange] = React.useState<MarketIncomeRangeDays>(7);
```

- Resolve lifetime income from `marketHistory?.totals?.trackedValue` with `totalValue` as a compatibility fallback.
- Call the range-aware summary with the selected days and lifetime income.
- Pass this header control:

```tsx
<Segmented
  label="Market income range"
  options={MARKET_INCOME_RANGES.map((range) => ({ id: String(range.days), label: range.label }))}
  value={String(marketIncomeRange)}
  onChange={(value) => setMarketIncomeRange(Number(value) as MarketIncomeRangeDays)}
/>
```

- Add the partial-data note only when `marketIncome.partialRange` and `availableStartDay` are set:

```tsx
<p className="dashboard-chart-coverage">
  Stored sales begin {shortDateLabel(marketIncome.availableStartDay)}
</p>
```

- Pass `yAxisLabel="Cumulative gold"` to `DashboardTrend`.

- [ ] **Step 4: Generalize the chart to supplied ranges and render Y ticks**

In `DashboardWidgets.tsx`:

- Add `control?: React.ReactNode` to `DashboardCardHeader` and render it in a `.dashboard-chart-controls` wrapper.
- Remove the hardcoded seven-day filtering from `DashboardTrend`; its `points` prop is now already range-scoped.
- Use the first and last supplied timestamps for the X domain.
- Reserve a left plotting margin for Y tick labels.
- Derive four rounded tick values spanning the displayed min/max; add a small symmetric range for flat data.
- Render horizontal grid lines and SVG `<text>` elements with compact gold values.
- Render a Y-axis title with `aria-label={yAxisLabel}`.
- Choose at most seven evenly distributed X labels from the plotted points.
- Keep tooltip selection, exact values, latest-point marker, and accessible summary behavior.

- [ ] **Step 5: Style compact controls, axes, and coverage copy**

In `dashboard.css`:

```css
.dashboard-chart-controls { display: flex; justify-content: flex-end; }
.dashboard-chart-controls .segmented { flex-wrap: nowrap; }
.dashboard-chart-controls .segmented > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.dashboard-chart-controls .segmented button { min-height: 26px; padding: 0 8px; }
.dashboard-chart-y-axis { fill: #8f9aaa; font-size: 11px; }
.dashboard-chart-y-title,
.dashboard-chart-coverage { color: #8f9aaa; font-size: 11px; }
```

Add a narrow-container rule that lets the card header wrap while keeping the range buttons together. Maintain existing dark operational styling and focus states.

- [ ] **Step 6: Run focused tests and the production build**

Run:

```sh
node --test apps/bitcraft-local/test/dashboard-market-income-chart.test.mjs
node --experimental-strip-types --test apps/bitcraft-local/test/market-analytics.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: all tests pass and Vite completes without TypeScript errors.

- [ ] **Step 7: Commit the dashboard UI**

```sh
git add apps/bitcraft-local/test/dashboard-market-income-chart.test.mjs apps/bitcraft-local/src/pages/DashboardPage.tsx apps/bitcraft-local/src/components/main/DashboardWidgets.tsx apps/bitcraft-local/src/styles/dashboard.css
git commit -m "feat: add market income chart ranges and axis"
```

### Task 5: Full verification and visual smoke check

**Files:**
- Modify only if verification exposes a scoped defect.

**Interfaces:**
- Consumes: All prior task outputs.
- Produces: A build- and test-verified branch with visual evidence for the changed dashboard.

- [ ] **Step 1: Run repository checks**

Run:

```sh
git diff --check origin/main...HEAD
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: clean diff, successful build, zero test failures.

- [ ] **Step 2: Start the stable local smoke server**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: the launcher returns promptly and health returns a successful JSON response.

- [ ] **Step 3: Browser-check the dashboard**

Open:

```txt
http://127.0.0.1:18449/?page=dashboard
```

Verify:

- `7D`, `30D`, and `1Y` controls are visible and keyboard-focusable.
- Selecting each range changes the plotted date span without a new page load.
- Y-axis gold values and `Cumulative gold` are visible without hover.
- Exact-value hover still works.
- Partial coverage copy appears only when the requested range predates stored sales.
- The card remains readable at desktop and narrow widths.

- [ ] **Step 4: Review final scope**

Run:

```sh
git status --short
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: only the approved design/plan, notification defaults, market analytics/history, dashboard widget/style, and focused tests are present. Do not update version or changelog unless the user later asks to push, deploy, publish, or prepare a release.
