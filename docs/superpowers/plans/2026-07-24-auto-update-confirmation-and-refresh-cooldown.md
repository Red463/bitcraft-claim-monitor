# Automatic Update Confirmation and Refresh Cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirm automatic background app updates with a short-lived changelog notification and show the exact remaining global-refresh cooldown directly on its button.

**Architecture:** Add best-effort, tab-local marker helpers to the existing release-update utility, then let `AppShell` consume that marker and own the eight-second notification timer. Reuse the existing manual-refresh clock and cooldown calculation for the button countdown so browser and server cooldown behavior cannot diverge.

**Tech Stack:** React 19, TypeScript, Vite, plain CSS, Node test runner with TypeScript stripping.

## Global Constraints

- The updated-app notification appears only after an automatic hidden-tab reload.
- The notification copy is **App updated** and **You're now using the latest version.**
- The notification links to the repository `CHANGELOG.md` and dismisses after exactly 8,000 milliseconds.
- Storage failures must never prevent the application reload.
- The global refresh cooldown remains exactly 15 seconds and uses `cooldownRemainingMs`.
- The cooldown button displays whole seconds from `15s` through `1s`, remains disabled, and retains an exact tooltip and accessible label.
- Existing data-refresh behavior, notification history, release polling, and manual **Refresh now** behavior remain unchanged.
- Do not add dependencies or introduce a second cooldown timer.

---

### Task 1: Tab-local automatic update marker

**Files:**
- Modify: `apps/bitcraft-local/src/utils/releaseUpdate.ts`
- Modify: `apps/bitcraft-local/test/release-update.test.mjs`

**Interfaces:**
- Produces: `markAutomaticReleaseUpdate(storage: ReleaseUpdateStorage): boolean`
- Produces: `consumeAutomaticReleaseUpdate(storage: ReleaseUpdateStorage): boolean`
- Produces: `AUTOMATIC_RELEASE_UPDATE_KEY: "bitcraft.release.auto-updated"`
- Consumes: a storage object exposing `getItem`, `setItem`, and `removeItem`

- [ ] **Step 1: Write failing marker lifecycle tests**

Append these tests to `apps/bitcraft-local/test/release-update.test.mjs` and import the two new functions:

```js
import {
  consumeAutomaticReleaseUpdate,
  markAutomaticReleaseUpdate,
  normalizeReleaseBuildId,
  releaseUpdateDecision,
} from "../src/utils/releaseUpdate.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("automatic update marker is consumed exactly once", () => {
  const storage = memoryStorage();

  assert.equal(markAutomaticReleaseUpdate(storage), true);
  assert.equal(consumeAutomaticReleaseUpdate(storage), true);
  assert.equal(consumeAutomaticReleaseUpdate(storage), false);
});

test("automatic update marker ignores invalid values and unavailable storage", () => {
  const storage = memoryStorage();
  storage.setItem("bitcraft.release.auto-updated", "unexpected");
  assert.equal(consumeAutomaticReleaseUpdate(storage), false);

  const unavailable = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
    removeItem() { throw new Error("storage unavailable"); },
  };
  assert.equal(markAutomaticReleaseUpdate(unavailable), false);
  assert.equal(consumeAutomaticReleaseUpdate(unavailable), false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/release-update.test.mjs
```

Expected: FAIL because `markAutomaticReleaseUpdate` and `consumeAutomaticReleaseUpdate` are not exported.

- [ ] **Step 3: Implement the marker helpers**

Add to `apps/bitcraft-local/src/utils/releaseUpdate.ts`:

```ts
export const AUTOMATIC_RELEASE_UPDATE_KEY = "bitcraft.release.auto-updated";

type ReleaseUpdateStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function markAutomaticReleaseUpdate(storage: ReleaseUpdateStorage): boolean {
  try {
    storage.setItem(AUTOMATIC_RELEASE_UPDATE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function consumeAutomaticReleaseUpdate(storage: ReleaseUpdateStorage): boolean {
  try {
    const marked = storage.getItem(AUTOMATIC_RELEASE_UPDATE_KEY) === "1";
    storage.removeItem(AUTOMATIC_RELEASE_UPDATE_KEY);
    return marked;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/release-update.test.mjs
```

Expected: all release-update tests PASS.

- [ ] **Step 5: Commit the marker utility**

```powershell
git add apps/bitcraft-local/src/utils/releaseUpdate.ts apps/bitcraft-local/test/release-update.test.mjs
git commit -m "feat: track automatic app update reloads"
```

---

### Task 2: Updated-app confirmation notification

**Files:**
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs`

**Interfaces:**
- Consumes: `markAutomaticReleaseUpdate(window.sessionStorage): boolean`
- Consumes: `consumeAutomaticReleaseUpdate(window.sessionStorage): boolean`
- Produces: an eight-second `release-update-banner is-updated` status notification
- Produces: `CHANGELOG_URL` pointing to `https://github.com/Red463/bitcraft-claim-monitor/blob/main/CHANGELOG.md`

- [ ] **Step 1: Write failing AppShell and CSS boundary tests**

Extend `apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs`:

```js
test("automatic release reload shows one short-lived changelog confirmation", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.match(appShell, /consumeAutomaticReleaseUpdate\(window\.sessionStorage\)/);
  assert.match(appShell, /markAutomaticReleaseUpdate\(window\.sessionStorage\)[\s\S]*window\.location\.reload\(\)/);
  assert.match(appShell, /const RELEASE_UPDATED_NOTICE_MS = 8_000/);
  assert.match(appShell, /window\.setTimeout\(\(\) => setReleaseUpdatedNotice\(false\), RELEASE_UPDATED_NOTICE_MS\)/);
  assert.match(appShell, /App updated/);
  assert.match(appShell, /You're now using the latest version\./);
  assert.match(appShell, /CHANGELOG_URL/);
  assert.match(appShell, /View changelog/);
  assert.match(appShell, /release-update-banner is-updated/);
  assert.match(css, /\.release-update-banner\.is-updated/);
  assert.match(css, /\.release-update-banner\.is-updated a/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs
```

Expected: FAIL because the marker handoff, success notification, changelog link, and success styles do not exist.

- [ ] **Step 3: Add the update marker handoff and dismissal state**

In `apps/bitcraft-local/src/AppShell.tsx`:

1. Import `CheckCircle2` from `lucide-react`.
2. Import `consumeAutomaticReleaseUpdate` and `markAutomaticReleaseUpdate` from `./utils/releaseUpdate`.
3. Add constants:

```ts
const CHANGELOG_URL = `${GITHUB_REPOSITORY}/blob/main/CHANGELOG.md`;
const RELEASE_UPDATED_NOTICE_MS = 8_000;
```

4. Beside the existing release update state, add:

```ts
const [releaseUpdatedNotice, setReleaseUpdatedNotice] = React.useState(
  () => consumeAutomaticReleaseUpdate(window.sessionStorage),
);
```

5. Add the dismissal effect:

```ts
React.useEffect(() => {
  if (!releaseUpdatedNotice) return undefined;
  const timer = window.setTimeout(() => setReleaseUpdatedNotice(false), RELEASE_UPDATED_NOTICE_MS);
  return () => window.clearTimeout(timer);
}, [releaseUpdatedNotice]);
```

6. Inside the existing release polling effect, replace both automatic reload calls with:

```ts
function reloadForReleaseUpdate() {
  markAutomaticReleaseUpdate(window.sessionStorage);
  window.location.reload();
}
```

Use `reloadForReleaseUpdate()` for the `"reload"` decision and when a prompted tab becomes hidden. Leave the visible **Refresh now** button's direct `window.location.reload()` unchanged so a user-initiated reload does not set the marker.

- [ ] **Step 4: Render and style the confirmation**

Give an actionable pending update priority over the confirmation:

```tsx
{releaseUpdateBuildId ? (
  <div className="release-update-banner" role="status" aria-live="polite">
    <div>
      <strong>Update available</strong>
      <span>A newer version is ready. Refresh to use the latest app.</span>
    </div>
    <button className="toolbar-button primary" onClick={() => window.location.reload()}>
      <RefreshCw size={14} /> Refresh now
    </button>
  </div>
) : releaseUpdatedNotice ? (
  <div className="release-update-banner is-updated" role="status" aria-live="polite">
    <CheckCircle2 size={20} aria-hidden="true" />
    <div>
      <strong>App updated</strong>
      <span>
        You're now using the latest version.{" "}
        <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">View changelog</a>
      </span>
    </div>
  </div>
) : null}
```

Add focused styles to `apps/bitcraft-local/src/styles/app-chrome.css`:

```css
.release-update-banner.is-updated {
  width: min(430px, calc(100vw - 34px));
  justify-content: flex-start;
  border-color: color-mix(in srgb, var(--good) 42%, transparent);
}
.release-update-banner.is-updated > svg {
  flex: 0 0 auto;
  color: var(--good);
}
.release-update-banner.is-updated strong { color: var(--good); }
.release-update-banner.is-updated a {
  color: var(--active-color);
  font-weight: 700;
  text-underline-offset: 2px;
}
.release-update-banner.is-updated a:hover { color: #fff; }
.release-update-banner.is-updated a:focus-visible {
  outline: 2px solid var(--focus-border);
  outline-offset: 2px;
  border-radius: 3px;
}
```

- [ ] **Step 5: Run focused release tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/release-update.test.mjs apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs
```

Expected: all release-update tests PASS.

- [ ] **Step 6: Commit the confirmation notification**

```powershell
git add apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs
git commit -m "feat: confirm automatic app updates"
```

---

### Task 3: Visible refresh cooldown countdown

**Files:**
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs`

**Interfaces:**
- Consumes: `manualRefreshCooldownMs: number`
- Consumes: `manualRefreshCooldownSeconds: number`
- Produces: `manualRefreshIsCoolingDown: boolean`
- Produces: `.refresh-cooldown-countdown` visible text from `15s` through `1s`

- [ ] **Step 1: Write failing countdown rendering tests**

Add to the global refresh test in `apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs`:

```js
assert.match(appShell, /const manualRefreshIsCoolingDown = !manualRefreshIsRefreshing && manualRefreshCooldownMs > 0/);
assert.match(appShell, /manualRefreshIsCoolingDown \? "is-cooldown"/);
assert.match(appShell, /className="refresh-cooldown-countdown"/);
assert.match(appShell, /\{manualRefreshCooldownSeconds\}s/);
assert.match(appShell, /manualRefreshIsCoolingDown\s*\?\s*\(\s*<span[\s\S]*:\s*\(\s*<RefreshCw size=\{18\}/);
```

Add to `apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs`:

```js
test("manual refresh cooldown is visible without relying on colour alone", () => {
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.match(css, /\.floating-actions \.floating-action-item\.is-cooldown\s*\{[^}]*border-color:[^}]*background:[^}]*opacity:\s*1/s);
  assert.match(css, /\.refresh-cooldown-countdown\s*\{[^}]*font[^}]*min-width:/s);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs
```

Expected: FAIL because the visible countdown and cooldown styles do not exist.

- [ ] **Step 3: Render the countdown from the existing clock**

In `apps/bitcraft-local/src/AppShell.tsx`, after calculating the cooldown seconds:

```ts
const manualRefreshIsCoolingDown = !manualRefreshIsRefreshing && manualRefreshCooldownMs > 0;
```

Update the button class and content:

```tsx
className={`floating-action-item ${
  manualRefreshIsRefreshing ? "is-refreshing" : manualRefreshIsCoolingDown ? "is-cooldown" : ""
}`}
```

```tsx
{manualRefreshIsCoolingDown ? (
  <span className="refresh-cooldown-countdown" aria-hidden="true">
    {manualRefreshCooldownSeconds}s
  </span>
) : (
  <RefreshCw size={18} />
)}
```

Keep the existing `disabled`, `aria-disabled`, `aria-busy`, `title`, and `aria-label` properties unchanged.

- [ ] **Step 4: Add the cooldown visual treatment**

Add to `apps/bitcraft-local/src/styles/app-chrome.css` beside the refreshing state:

```css
.floating-actions .floating-action-item.is-cooldown,
.floating-actions .floating-action-item.is-cooldown:disabled {
  color: var(--active-color);
  border-color: color-mix(in srgb, var(--active-color) 42%, transparent);
  background: color-mix(in srgb, var(--active-bg) 40%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
  cursor: not-allowed;
  opacity: 1;
}
.refresh-cooldown-countdown {
  min-width: 28px;
  color: inherit;
  font: 800 11px/1 "JetBrains Mono", monospace;
  letter-spacing: -.04em;
  text-align: center;
}
```

- [ ] **Step 5: Run focused refresh tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/manual-refresh.test.mjs apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs
```

Expected: all manual-refresh tests PASS, including the existing exact 15-second calculation tests.

- [ ] **Step 6: Commit the countdown**

```powershell
git add apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs
git commit -m "feat: show refresh cooldown countdown"
```

---

### Task 4: Full verification and browser smoke

**Files:**
- Verify only; no source files should change.

**Interfaces:**
- Consumes: the completed update-confirmation and cooldown implementations.
- Produces: build, test, and visual verification evidence.

- [ ] **Step 1: Run the production build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 2: Run the complete application test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests PASS with zero failures.

- [ ] **Step 3: Check the final diff**

```powershell
git diff --check origin/main...HEAD
git status --short
```

Expected: no whitespace errors and no uncommitted files.

- [ ] **Step 4: Browser-smoke the two states when practical**

Start the established smoke server:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Verify:

- The cooldown button displays `15s`, counts down once per second, stays disabled, then restores the refresh icon.
- The tooltip reports the same remaining seconds.
- A tab carrying `sessionStorage["bitcraft.release.auto-updated"] = "1"` displays **App updated**, links to the changelog, and removes the popup after eight seconds.
- The marker is removed after consumption and the popup does not return on a normal reload.
- The popup and cooldown button remain readable at desktop and narrow widths.

If the smoke launcher does not return within 15 seconds or fails because worktree dependencies are unavailable, stop retrying, inspect `.codex-dev/bitcraft-local-smoke.err.log`, and report the blocker alongside the successful build and test evidence.
