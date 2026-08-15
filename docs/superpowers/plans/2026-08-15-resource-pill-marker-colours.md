# Tracked Resource Pill Marker Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each tracked resource pill use the exact stable colour assigned to that resource's native-map marker.

**Architecture:** `MapPage` remains the sole owner of the final selected-resource colour map and passes it to both the canvas renderer and the resource finder. `MapResourceFinderPanel` resolves typed `resource:<id>` tokens without numeric coercion and exposes the resolved colour through a pill-scoped CSS variable; CSS provides the border, text/icon, and subtle tint while unmapped tokens retain the existing gold styling.

**Tech Stack:** React, TypeScript, plain CSS, Node.js test runner.

## Global Constraints

- Reuse `selectedResourceColours`; do not introduce a second colour allocator.
- Keep typed resource IDs as decimal strings and never coerce them to JavaScript numbers.
- Unknown, enemy, and unmapped tokens retain the current gold pill appearance.
- Do not change resource markers, Relay requests, selection limits, or persistence.
- Do not run the local full suite or full production build because this machine previously crashed from excessive Node.js memory use.

---

### Task 1: Share marker colours with tracked resource pills

**Files:**
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-resource-finder-panel.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: `selectedResourceColours: Readonly<Record<string, string>>`, already produced by `selectedResourceColourMap(...)` in `MapPage`.
- Produces: `MapResourceFinderPanel` prop `resourceColours: Readonly<Record<string, string>>` and CSS variable `--map-resource-chip-colour` on mapped resource pills.

- [ ] **Step 1: Write failing boundary tests for colour-map ownership and pill styling**

Add assertions to `map-page-boundary.test.mjs` proving the existing map is passed to the finder:

```js
test("Map page shares final resource marker colours with the tracked resource pills", () => {
  const mapPage = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");

  assert.match(mapPage, /const selectedResourceColours = React\.useMemo/);
  assert.match(mapPage, /resourceByToken=\{resourceByToken\}\s+resourceColours=\{selectedResourceColours\}\s+resources=\{renderedResources\}/);
});
```

Extend `map-resource-finder-panel.test.mjs` to prove typed lookup, CSS-variable wiring, and fallback-by-omission:

```js
test("tracked resource pills reuse their final native marker colours", async () => {
  const panel = await readFile(new URL("../src/pages/map/MapResourceFinderPanel.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/map.css", import.meta.url), "utf8");

  assert.match(panel, /resourceColours: Readonly<Record<string, string>>/);
  assert.match(panel, /token\.startsWith\("resource:"\)/);
  assert.match(panel, /resourceColours\[resourceId\]/);
  assert.match(panel, /--map-resource-chip-colour/);
  assert.doesNotMatch(panel, /Number\(resourceId\)|parseInt\(resourceId/);
  assert.match(css, /\.map-selected-resources button\.has-marker-colour/);
  assert.match(css, /color-mix\(in srgb, var\(--map-resource-chip-colour\)/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: FAIL because `MapResourceFinderPanel` does not yet accept or apply `resourceColours`, `MapPage` does not pass the prop, and the colour-aware CSS selector is absent.

- [ ] **Step 3: Pass the existing final colour map into the finder**

In `MapPage.tsx`, add the prop without deriving new state:

```tsx
const resourceFinder = <MapResourceFinderPanel
  // existing props
  resourceColours={selectedResourceColours}
  // existing callbacks
/>;
```

In `MapResourceFinderPanel.tsx`, import the CSS property type and declare the prop:

```tsx
import type { CSSProperties } from "react";

resourceColours: Readonly<Record<string, string>>;
```

Inside the tracked-token map, resolve only canonical typed resource tokens and apply a CSS variable only when a final colour exists:

```tsx
const resourceId = token.startsWith("resource:")
  ? token.slice("resource:".length)
  : "";
const resourceColour = resourceId ? resourceColours[resourceId] : "";
const colourStyle = resourceColour
  ? ({ "--map-resource-chip-colour": resourceColour } as CSSProperties)
  : undefined;

return <button
  type="button"
  key={token}
  className={resourceColour ? "has-marker-colour" : undefined}
  style={colourStyle}
  onClick={() => onRemove(token)}
  aria-label={`Stop tracking ${label}`}
>
  {label}<X size={12} aria-hidden="true" />
</button>;
```

- [ ] **Step 4: Add the accessible tint treatment**

Keep the existing gold rule as the fallback, then add focused overrides in `map.css`:

```css
.map-selected-resources button.has-marker-colour {
  border-color: color-mix(in srgb, var(--map-resource-chip-colour) 58%, transparent);
  background: color-mix(in srgb, var(--map-resource-chip-colour) 12%, transparent);
  color: var(--map-resource-chip-colour);
}
.map-selected-resources button.has-marker-colour:hover,
.map-selected-resources button.has-marker-colour:focus-visible {
  border-color: color-mix(in srgb, var(--map-resource-chip-colour) 88%, white 12%);
  background: color-mix(in srgb, var(--map-resource-chip-colour) 20%, transparent);
}
```

- [ ] **Step 5: Run focused GREEN verification**

Run:

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/map-resource-node-colours.test.mjs
git diff --check
```

Expected: all focused tests PASS with zero failures; `git diff --check` produces no output.

- [ ] **Step 6: Inspect the focused diff**

Run:

```powershell
git diff -- apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Confirm that no Relay request, selection-limit, marker-rendering, or persistence logic changed.

- [ ] **Step 7: Commit the implementation**

```powershell
git add apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): match tracked pills to marker colours"
```

The local full suite and full production build remain skipped for machine safety. Before a release, push the branch and require GitHub Actions to run the complete test suite and production build remotely.
