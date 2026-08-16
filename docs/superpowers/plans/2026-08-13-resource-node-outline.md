# Resource Node Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subtle dark outline to native-map resource dots so individual nodes remain distinguishable when zoomed out.

**Architecture:** Extend the existing `DensePointLayer` canvas presentation with an optional stroke colour and width. Enable that presentation only when constructing the resource layer; the enemy layer continues using fill-only rendering.

**Tech Stack:** React, TypeScript, Leaflet 1.9, Canvas 2D, Node test runner, Vite.

## Global Constraints

- Preserve existing tier-based and stable resource variant fill colours.
- Use a near-black `1.25px` outline.
- Preserve the current resource radius, viewport culling, level-of-detail behavior, and layer ordering.
- Do not change enemy or player markers.
- Add no dependencies.

---

### Task 1: Resource Canvas Outline

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: the existing `DensePointLayer` constructor, `RESOURCE_NODE_FALLBACK_COLOUR`, and per-node colour callback.
- Produces: an optional constructor presentation `{ strokeColour?: string; strokeWidth?: number }` used only by the resource layer.

- [ ] **Step 1: Write the failing renderer boundary test**

Add assertions proving the resource layer opts into the outline and the enemy layer does not:

```js
assert.match(nativeMap, /new DensePointLayer\(RESOURCE_NODE_FALLBACK_COLOUR, "native-map-resources", \{ strokeColour: "rgba\(3, 8, 12, \.92\)", strokeWidth: 1\.25 \}\)/);
assert.match(nativeMap, /context\.strokeStyle = this\.#strokeColour/);
assert.match(nativeMap, /context\.lineWidth = this\.#strokeWidth/);
assert.match(nativeMap, /if \(this\.#strokeColour && this\.#strokeWidth > 0\) context\.stroke\(\)/);
assert.match(nativeMap, /new DensePointLayer\("rgba\(255, 112, 112, 0\.92\)"\)\.addTo\(map\)/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm exec node --test test/map-page-boundary.test.mjs
```

Expected: FAIL because `DensePointLayer` has no stroke presentation and the resource construction does not specify an outline.

- [ ] **Step 3: Implement the optional canvas outline**

In `DensePointLayer`, add optional private stroke fields and constructor input:

```ts
#strokeColour: string | null;
#strokeWidth: number;

constructor(
  colour: string | ((point: MapFeature) => string),
  pane = "overlayPane",
  presentation: { strokeColour?: string; strokeWidth?: number } = {},
) {
  super();
  this.#colour = colour;
  this.#pane = pane;
  this.#strokeColour = presentation.strokeColour ?? null;
  this.#strokeWidth = presentation.strokeWidth ?? 0;
}
```

After defining each circular path, stroke before filling so the fill retains its full visible radius:

```ts
context.beginPath();
context.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
if (this.#strokeColour && this.#strokeWidth > 0) {
  context.strokeStyle = this.#strokeColour;
  context.lineWidth = this.#strokeWidth;
  context.stroke();
}
context.fill();
```

Construct the resource layer with the approved presentation:

```ts
resourcesRef.current = new DensePointLayer(
  RESOURCE_NODE_FALLBACK_COLOUR,
  "native-map-resources",
  { strokeColour: "rgba(3, 8, 12, .92)", strokeWidth: 1.25 },
).addTo(map);
```

Leave the enemy construction unchanged.

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```powershell
corepack pnpm exec node --test test/map-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: the focused test and production build both pass.

- [ ] **Step 5: Refresh and visually verify smoke**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Reload `http://127.0.0.1:18449/?page=map`, select multiple resources, zoom out, and confirm that resource dots retain their fill colours while the dark outline separates adjacent nodes. Confirm no new browser console errors.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): outline resource nodes"
```

