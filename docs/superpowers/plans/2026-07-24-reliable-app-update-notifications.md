# Reliable App Update Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably notify users when the browser starts a newer deployed app build, regardless of tab visibility or reload method.

**Architecture:** Extend the existing release-update utility into a small, deterministic state machine that compares the running build, the last successfully loaded build stored in `localStorage`, and the server build. `AppShell` will persist only builds that have actually loaded, check immediately on visibility changes, and reuse the existing update banners and eight-second confirmation timer.

**Tech Stack:** React 19, TypeScript, Vite, browser `localStorage`, Node test runner with TypeScript stripping, plain CSS.

## Global Constraints

- First-time visitors must not see an update confirmation.
- A new build must show **App updated** exactly once after automatic reload, **Refresh now**, manual refresh, or reopening the app.
- **App updated** must retain **View changelog** and dismiss after exactly 8,000 milliseconds.
- A visible old build must continue showing **Update available** before reload.
- A hidden old build must continue reloading automatically.
- Startup and every visibility change must trigger an immediate no-cache health check.
- A newly detected server build must not be persisted until that build is running in the browser.
- Storage and health-check failures must never interrupt rendering or reloads.
- Do not add dependencies, service workers, server state, or notification-history entries.

## File Structure

- `apps/bitcraft-local/src/utils/releaseUpdate.ts` owns build-ID normalization, best-effort persistent storage, and release transition decisions.
- `apps/bitcraft-local/test/release-update.test.mjs` exercises the complete build lifecycle without React or network mocks.
- `apps/bitcraft-local/src/AppShell.tsx` owns health polling, visibility events, reloads, and the two existing banners.
- `apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs` guards the AppShell integration and user-facing copy.

---

### Task 1: Persistent release lifecycle

**Files:**
- Modify: `apps/bitcraft-local/src/utils/releaseUpdate.ts:1-40`
- Modify: `apps/bitcraft-local/test/release-update.test.mjs:1-60`

**Interfaces:**
- Produces: `LAST_LOADED_RELEASE_BUILD_KEY: "bitcraft.release.last-loaded-build"`
- Produces: `readLastLoadedReleaseBuild(storage: ReleaseUpdateStorage): string`
- Produces: `writeLastLoadedReleaseBuild(storage: ReleaseUpdateStorage, buildId: string): boolean`
- Changes: `ReleaseUpdateDecision` to `"ignore" | "remember" | "updated" | "prompt" | "reload"`
- Changes: `releaseUpdateDecision({ currentBuildId, lastLoadedBuildId, nextBuildId, documentHidden }): ReleaseUpdateDecision`

- [ ] **Step 1: Replace the decision tests with the complete lifecycle**

Update the imports and decision tests in `apps/bitcraft-local/test/release-update.test.mjs`:

```js
import {
  LAST_LOADED_RELEASE_BUILD_KEY,
  normalizeReleaseBuildId,
  readLastLoadedReleaseBuild,
  releaseUpdateDecision,
  writeLastLoadedReleaseBuild,
} from "../src/utils/releaseUpdate.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("first visit remembers the running build without an update notice", () => {
  assert.equal(releaseUpdateDecision({
    currentBuildId: "",
    lastLoadedBuildId: "",
    nextBuildId: "abc123",
    documentHidden: false,
  }), "remember");
});

test("a newly loaded build reports one completed update", () => {
  assert.equal(releaseUpdateDecision({
    currentBuildId: "",
    lastLoadedBuildId: "abc123",
    nextBuildId: "def456",
    documentHidden: false,
  }), "updated");
});

test("an old running build prompts visibly and reloads while hidden", () => {
  assert.equal(releaseUpdateDecision({
    currentBuildId: "abc123",
    lastLoadedBuildId: "abc123",
    nextBuildId: "def456",
    documentHidden: false,
  }), "prompt");
  assert.equal(releaseUpdateDecision({
    currentBuildId: "abc123",
    lastLoadedBuildId: "abc123",
    nextBuildId: "def456",
    documentHidden: true,
  }), "reload");
});

test("the running build ignores unchanged and missing server builds", () => {
  assert.equal(releaseUpdateDecision({
    currentBuildId: "abc123",
    lastLoadedBuildId: "abc123",
    nextBuildId: "abc123",
    documentHidden: false,
  }), "ignore");
  assert.equal(releaseUpdateDecision({
    currentBuildId: "abc123",
    lastLoadedBuildId: "abc123",
    nextBuildId: "",
    documentHidden: false,
  }), "ignore");
});

test("last loaded build storage is normalized and best effort", () => {
  const storage = memoryStorage();
  assert.equal(readLastLoadedReleaseBuild(storage), "");
  assert.equal(writeLastLoadedReleaseBuild(storage, "  abc123  "), true);
  assert.equal(storage.getItem(LAST_LOADED_RELEASE_BUILD_KEY), "abc123");
  assert.equal(readLastLoadedReleaseBuild(storage), "abc123");
  assert.equal(writeLastLoadedReleaseBuild(storage, "   "), false);

  const unavailable = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
    removeItem() { throw new Error("storage unavailable"); },
  };
  assert.equal(readLastLoadedReleaseBuild(unavailable), "");
  assert.equal(writeLastLoadedReleaseBuild(unavailable, "abc123"), false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/release-update.test.mjs
```

Expected: FAIL because `LAST_LOADED_RELEASE_BUILD_KEY`, `readLastLoadedReleaseBuild`, and `writeLastLoadedReleaseBuild` are not exported, and `releaseUpdateDecision` does not recognize the persisted build.

- [ ] **Step 3: Implement the persistent lifecycle utility**

Replace the automatic marker helpers and extend the decision function in `apps/bitcraft-local/src/utils/releaseUpdate.ts`:

```ts
export type ReleaseUpdateDecision = "ignore" | "remember" | "updated" | "prompt" | "reload";

export const LAST_LOADED_RELEASE_BUILD_KEY = "bitcraft.release.last-loaded-build";

type ReleaseUpdateStorage = Pick<Storage, "getItem" | "setItem">;

export function readLastLoadedReleaseBuild(storage: ReleaseUpdateStorage): string {
  try {
    return String(storage.getItem(LAST_LOADED_RELEASE_BUILD_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function writeLastLoadedReleaseBuild(storage: ReleaseUpdateStorage, buildId: string): boolean {
  const normalized = buildId.trim();
  if (!normalized) return false;
  try {
    storage.setItem(LAST_LOADED_RELEASE_BUILD_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

export function normalizeReleaseBuildId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const buildId = (payload as { buildId?: unknown }).buildId;
  return typeof buildId === "string" ? buildId.trim() : "";
}

export function releaseUpdateDecision({
  currentBuildId,
  lastLoadedBuildId,
  nextBuildId,
  documentHidden,
}: {
  currentBuildId: string;
  lastLoadedBuildId: string;
  nextBuildId: string;
  documentHidden: boolean;
}): ReleaseUpdateDecision {
  const current = currentBuildId.trim();
  const lastLoaded = lastLoadedBuildId.trim();
  const next = nextBuildId.trim();
  if (!next || current === next) return "ignore";
  if (!current) return lastLoaded && lastLoaded !== next ? "updated" : "remember";
  return documentHidden ? "reload" : "prompt";
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/release-update.test.mjs
```

Expected: all release-update tests PASS.

- [ ] **Step 5: Commit the utility and tests**

```powershell
git add -- apps/bitcraft-local/src/utils/releaseUpdate.ts apps/bitcraft-local/test/release-update.test.mjs
git commit -m "fix: persist loaded app releases"
```

---

### Task 2: AppShell update detection and confirmation

**Files:**
- Modify: `apps/bitcraft-local/src/AppShell.tsx:46,189-195,477-520,871-892`
- Modify: `apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs:1-30`

**Interfaces:**
- Consumes: `readLastLoadedReleaseBuild(window.localStorage): string`
- Consumes: `writeLastLoadedReleaseBuild(window.localStorage, buildId): boolean`
- Consumes: `releaseUpdateDecision({ currentBuildId, lastLoadedBuildId, nextBuildId, documentHidden }): ReleaseUpdateDecision`

- [ ] **Step 1: Write failing AppShell lifecycle boundary assertions**

Replace the two tests in `apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs` with:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AppShell checks releases on startup, intervals, and every visibility change", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appShell, /readLastLoadedReleaseBuild\(window\.localStorage\)/);
  assert.match(appShell, /releaseUpdateDecision\(\{[\s\S]*lastLoadedBuildId,[\s\S]*documentHidden: document\.hidden[\s\S]*\}\)/);
  assert.match(appShell, /window\.setInterval\(checkReleaseBuild, 60_000\)/);
  assert.match(appShell, /function handleReleaseVisibility\(\) \{[\s\S]*void checkReleaseBuild\(\);[\s\S]*\}/);
  assert.match(appShell, /document\.addEventListener\("visibilitychange", handleReleaseVisibility\)/);
});

test("AppShell records loaded builds and confirms every completed update", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.doesNotMatch(appShell, /markAutomaticReleaseUpdate/);
  assert.doesNotMatch(appShell, /consumeAutomaticReleaseUpdate/);
  assert.match(appShell, /if \(decision === "remember"\)[\s\S]*writeLastLoadedReleaseBuild\(window\.localStorage, nextBuildId\)/);
  assert.match(appShell, /if \(decision === "updated"\)[\s\S]*writeLastLoadedReleaseBuild\(window\.localStorage, nextBuildId\)[\s\S]*setReleaseUpdatedNotice\(true\)/);
  assert.match(appShell, /const RELEASE_UPDATED_NOTICE_MS = 8_000/);
  assert.match(appShell, /window\.setTimeout\(\(\) => setReleaseUpdatedNotice\(false\), RELEASE_UPDATED_NOTICE_MS\)/);
  assert.match(appShell, /Update available/);
  assert.match(appShell, /App updated/);
  assert.match(appShell, /You're now using the latest version\./);
  assert.match(appShell, /CHANGELOG_URL/);
  assert.match(appShell, /View changelog/);
  assert.match(css, /\.release-update-banner\.is-updated/);
});
```

- [ ] **Step 2: Run the boundary test and verify RED**

Run:

```powershell
node --test apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs
```

Expected: FAIL because AppShell still uses the automatic session marker, does not read or write the last loaded build, and does not check on every visibility change.

- [ ] **Step 3: Integrate persistent release state into AppShell**

Change the release-update import in `apps/bitcraft-local/src/AppShell.tsx`:

```ts
import {
  normalizeReleaseBuildId,
  readLastLoadedReleaseBuild,
  releaseUpdateDecision,
  writeLastLoadedReleaseBuild,
} from "./utils/releaseUpdate";
```

Initialize the confirmation state without consuming a session marker:

```ts
const [releaseUpdatedNotice, setReleaseUpdatedNotice] = React.useState(false);
```

Replace the release-check effect with:

```ts
React.useEffect(() => {
  let cancelled = false;
  function reloadForReleaseUpdate() {
    window.location.reload();
  }
  function rememberBuildId(buildId: string) {
    appBuildIdRef.current = buildId;
    if (!cancelled) setAppBuildId(buildId);
  }
  function showReleaseUpdate(buildId: string) {
    releaseUpdateBuildIdRef.current = buildId;
    if (!cancelled) setReleaseUpdateBuildId(buildId);
  }
  async function checkReleaseBuild() {
    try {
      const response = await fetch(`${LOCAL_API}/health`, { cache: "no-store" });
      const nextBuildId = normalizeReleaseBuildId(response.ok ? await response.json() : null);
      const lastLoadedBuildId = readLastLoadedReleaseBuild(window.localStorage);
      const decision = releaseUpdateDecision({
        currentBuildId: appBuildIdRef.current,
        lastLoadedBuildId,
        nextBuildId,
        documentHidden: document.hidden,
      });
      if (decision === "remember") {
        rememberBuildId(nextBuildId);
        writeLastLoadedReleaseBuild(window.localStorage, nextBuildId);
      }
      if (decision === "updated") {
        rememberBuildId(nextBuildId);
        writeLastLoadedReleaseBuild(window.localStorage, nextBuildId);
        if (!cancelled) setReleaseUpdatedNotice(true);
      }
      if (decision === "prompt") showReleaseUpdate(nextBuildId);
      if (decision === "reload") reloadForReleaseUpdate();
    } catch {
      // A failed release check should not interrupt the dashboard.
    }
  }
  function handleReleaseVisibility() {
    if (document.hidden && releaseUpdateBuildIdRef.current) {
      reloadForReleaseUpdate();
      return;
    }
    void checkReleaseBuild();
  }
  void checkReleaseBuild();
  const timer = window.setInterval(checkReleaseBuild, 60_000);
  document.addEventListener("visibilitychange", handleReleaseVisibility);
  return () => {
    cancelled = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", handleReleaseVisibility);
  };
}, []);
```

Keep the existing **Refresh now** button as a normal `window.location.reload()`. The persisted old build remains unchanged until the new app instance completes its health check, so manual and automatic reloads converge on the same `"updated"` decision.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/release-update.test.mjs apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs
```

Expected: all release lifecycle and AppShell boundary tests PASS.

- [ ] **Step 5: Run production verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: the TypeScript/Vite production build passes and the complete app test suite passes.

- [ ] **Step 6: Check the focused diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: only the two release-update source files and their two tests are modified; unrelated untracked files remain unstaged.

- [ ] **Step 7: Commit the AppShell integration**

```powershell
git add -- apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/test/appshell-release-update-boundary.test.mjs
git commit -m "fix: confirm every deployed app update"
```

