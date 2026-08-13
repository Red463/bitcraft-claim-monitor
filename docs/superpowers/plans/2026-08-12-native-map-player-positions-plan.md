# Native Map Player Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live-verify Relay player/mobile identity and fixed-point coordinates, then show only selected online monitored players with stable, distinguishable marker colours.

**Architecture:** Keep the existing server authorization fence and bounded regional `mobile_entity_state` subscriptions. Strengthen the live verifier and volatile-generation tests before enabling the independent player gate. Isolate deterministic palette allocation in a pure browser-neutral helper and pass its output into the existing Leaflet glyph marker factory.

**Tech Stack:** Node.js 24, React, TypeScript, Leaflet 1.9.x, typed SpacetimeDB Relay subscriptions, Node test runner, plain CSS.

## Global Constraints

- Only selected, online, non-excluded members of the configured monitored claim may enter subscriptions or responses.
- Player/mobile identity must be a direct decimal-string entity-ID match; never coerce entity IDs to JavaScript `number`.
- Mobile positions use overworld dimension `1` and exact `/1000` conversion to `map-xz`.
- Offline or unavailable last-known positions are never persisted, returned, or retained as last-good map features.
- Failed live verification or a schema fingerprint mismatch leaves the player layer unavailable.
- Browsers connect only to same-origin app routes and never directly to Relay or third-party maps.
- Committed fixtures and documentation must contain no private player IDs, usernames, or exact player coordinates.
- No new framework, database migration, position history, trails, or admin colour configuration.

---

### Task 1: Strengthen the live player verification harness

**Files:**
- Modify: `apps/bitcraft-local/scripts/verify-relay-map-spatial-live.mjs`
- Modify: `docs/research/native-map-live-coordinate-reference.md`
- Test: `apps/bitcraft-local/test/map-spatial-projection.test.mjs`

**Interfaces:**
- Consumes: `RelayMapSpatialSession.start({ scope: { claimId, regionId, playerIds, resourceIds, enemyTypes } })`.
- Produces: an operator-only JSON report containing selected-player match counts, raw fixed-point coordinates, scaled map coordinates, dimensions, bounds, and schema fingerprint; no committed private fixture.

- [ ] **Step 1: Extend the projection test with the wished-for player evidence fields**

Add assertions proving a selected mobile row is normalized losslessly and rejected when its entity ID is not selected:

```js
assert.deepEqual(normalized.data.players[0], {
  playerEntityId: "216172782115643288",
  regionId: "19",
  locationX: 90_000,
  locationZ: 100_000,
  dimension: "1",
  observedAt: "2026-08-11T12:00:00.000Z",
});
assert.equal(normalized.data.players.some(({ playerEntityId }) => playerEntityId === "999"), false);
```

- [ ] **Step 2: Run the focused test and record the expected RED result**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-spatial-projection.test.mjs
```

Expected: FAIL because the current fixture/assertion does not yet exercise unmatched mobile-row exclusion and the verifier lacks player evidence output.

- [ ] **Step 3: Add private operator evidence to the verifier**

Calculate reports without writing them to disk:

```js
const playerFixtures = snapshot.data.players.map((row) => ({
  playerEntityId: row.playerEntityId,
  raw: { x: row.locationX, z: row.locationZ, dimension: row.dimension },
  map: { x: row.locationX / 1000, z: row.locationZ / 1000 },
}));
```

Include `requestedPlayerCount`, `matchedPlayerCount`, `playerBounds`, and `playerFixtures` in stdout. Fail closed if a requested ID is absent, dimension is not `1`, scaled coordinates are outside `0..38400`, or the schema fingerprint differs from the generated manifest.

- [ ] **Step 4: Run the focused projection test**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Capture live evidence for a current online monitored player**

Read current online monitored IDs from the same-origin smoke API, select one ID, then run:

```powershell
$env:BITCRAFT_REGION_ID='19'
$env:BITCRAFT_MAP_PLAYER_IDS='<selected-online-monitored-decimal-id>'
$env:BITCRAFT_MAP_RESOURCE_IDS=''
node apps/bitcraft-local/scripts/verify-relay-map-spatial-live.mjs
```

Expected: `ok:true`, one direct player/mobile match, dimension `1`, bounded fixed-point coordinates, and map coordinates equal to raw coordinates divided by `1000`.

- [ ] **Step 6: Independently compare the scaled coordinate**

Use the existing external-map rollback URL for that same selected player or a user-observed in-game coordinate. Record only the non-sensitive conclusion, schema fingerprint, elapsed time, and scale/dimension result in `docs/research/native-map-live-coordinate-reference.md`. Do not record the ID, username, or coordinate.

- [ ] **Step 7: Verify selection removal**

Rerun with `BITCRAFT_MAP_PLAYER_IDS=''` and assert the query list contains no `mobile_entity_state` query and the resulting player count is zero. Record this non-sensitive result in the reference.

- [ ] **Step 8: Commit the verified harness and evidence conclusion**

```powershell
git add apps/bitcraft-local/scripts/verify-relay-map-spatial-live.mjs apps/bitcraft-local/test/map-spatial-projection.test.mjs docs/research/native-map-live-coordinate-reference.md
git commit -m "test(map): verify live player coordinates"
```

---

### Task 2: Lock down volatile player removal and enable the server gate

**Files:**
- Modify: `apps/bitcraft-local/test/map-spatial-session.test.mjs`
- Modify: `apps/bitcraft-local/test/map-snapshot.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Review: `apps/bitcraft-local/src/server/game-data/mapSpatialSession.ts`
- Review: `apps/bitcraft-local/src/server/mapSnapshot.mjs`

**Interfaces:**
- Consumes: `authorizedMapPlayerIds(...)`, current online player rows, excluded member IDs, and complete `map-spatial` generations.
- Produces: `MAP_PLAYER_MOBILE_IDENTITY_VERIFIED = true` and public `kind:"player"` features only for the currently authorized set.

- [ ] **Step 1: Write failing session and snapshot removal tests**

Add a session test that deletes the selected `mobile_entity_state` row, fires its delete listener, advances the debounce clock, and expects the next complete generation to contain no players. Add snapshot assertions for logout and exclusion after a previously populated spatial input:

```js
assert.deepEqual(buildMapSnapshot({
  scope,
  mobileIdentityVerified: true,
  members: [{ playerEntityId: "101" }],
  players: [{ entityId: "101", signedIn: false }],
  spatial: liveSpatial,
}).layers.players, []);
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-spatial-session.test.mjs test/map-snapshot.test.mjs test/map-page-boundary.test.mjs
```

Expected: FAIL until the gate is enabled and any missing delete/removal semantics are implemented.

- [ ] **Step 3: Implement the minimal volatile behavior**

If the existing delete listener already publishes an empty complete generation, retain it unchanged. Otherwise, ensure `mapSpatialSession.ts` reads the current table cache after delete and commits the empty `players` array. Do not fall back to a previous player generation in `mapSnapshot.mjs`.

After Task 1 live acceptance succeeds, change only:

```js
const MAP_PLAYER_MOBILE_IDENTITY_VERIFIED = true;
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: PASS, including unselected, offline, excluded, and deleted players absent from outputs.

- [ ] **Step 5: Commit the server gate and removal contract**

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/src/server/game-data/mapSpatialSession.ts apps/bitcraft-local/src/server/mapSnapshot.mjs apps/bitcraft-local/test/map-spatial-session.test.mjs apps/bitcraft-local/test/map-snapshot.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): enable verified live player positions"
```

---

### Task 3: Add deterministic collision-aware player colours

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/playerMarkerColours.mjs`
- Create: `apps/bitcraft-local/src/pages/map/playerMarkerColours.d.mts`
- Create: `apps/bitcraft-local/test/map-player-marker-colours.test.mjs`

**Interfaces:**
- Produces: `assignPlayerMarkerColours(playerIds: string[]): Record<string, string>`.
- Produces: `PLAYER_MARKER_PALETTE: readonly string[]` for renderer/CSS tests.

- [ ] **Step 1: Write failing pure helper tests**

```js
test("player colours are stable and unique within the visible palette", () => {
  const ids = ["1369094286756659093", "576460752388321942", "1224979098660030450"];
  const first = assignPlayerMarkerColours(ids);
  const reordered = assignPlayerMarkerColours(ids.toReversed());
  assert.deepEqual(first, reordered);
  assert.equal(new Set(Object.values(first)).size, ids.length);
});

test("player colour allocation is lossless and deterministic beyond Number safety", () => {
  assert.equal(
    assignPlayerMarkerColours(["9007199254740993"])["9007199254740993"],
    assignPlayerMarkerColours(["9007199254740993"])["9007199254740993"],
  );
});
```

- [ ] **Step 2: Run the new test and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-player-marker-colours.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement full-string hashing and deterministic probing**

Use a fixed accessible palette of at least 12 colours. Sort unique decimal strings with the existing length/locale decimal ordering. Hash every character using 32-bit integer arithmetic, select the first palette slot by `hash % palette.length`, and linearly probe unused slots for the current visible set. Reject blank/non-decimal IDs. After palette exhaustion, reuse the hashed slot deterministically.

- [ ] **Step 4: Run the helper test and verify GREEN**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit the pure colour allocator**

```powershell
git add apps/bitcraft-local/src/pages/map/playerMarkerColours.mjs apps/bitcraft-local/src/pages/map/playerMarkerColours.d.mts apps/bitcraft-local/test/map-player-marker-colours.test.mjs
git commit -m "feat(map): assign stable player marker colours"
```

---

### Task 4: Render distinguishable accessible player markers

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: `assignPlayerMarkerColours(playerIds)` from Task 3.
- Produces: Leaflet player markers with `--player-marker-color`, a `P` glyph/ring, display-name tooltip, title, and `aria-label`.

- [ ] **Step 1: Write failing renderer boundary tests**

Assert that `NativeMap.tsx` computes colours from the current `snapshot.layers.players`, passes the colour into `markerIcon`, sets a CSS custom property on player marker content, and retains the accessible label. Assert CSS provides a contrasting border and shadow in addition to fill colour.

- [ ] **Step 2: Run the boundary test and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-page-boundary.test.mjs test/map-player-marker-colours.test.mjs
```

Expected: FAIL because player markers do not yet consume the colour allocator.

- [ ] **Step 3: Implement marker styling**

Change the icon factory signature to:

```ts
function markerIcon(kind: string, presentation: MapMarkerPresentation, color?: string)
```

For `kind === "player"`, set `--player-marker-color` on the marker content and add a player-specific class. Before iterating snapshot layers, compute:

```ts
const playerColours = assignPlayerMarkerColours((snapshot.layers.players ?? []).map(({ playerEntityId, entityId }) => String(playerEntityId ?? entityId)));
```

Pass `playerColours[feature.playerEntityId ?? feature.entityId]` only for player markers. CSS uses the variable for fill, a two-tone outline, and a readable glyph; labels remain the non-colour distinction.

- [ ] **Step 4: Run focused renderer tests and verify GREEN**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit the player marker presentation**

```powershell
git add apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): distinguish live player markers"
```

---

### Task 5: End-to-end verification and smoke acceptance

**Files:**
- Modify only if evidence changes: `docs/research/native-map-live-coordinate-reference.md`

**Interfaces:**
- Consumes: verified server gate, volatile player snapshot, and deterministic marker renderer.
- Produces: a clean local branch and a running smoke server at `http://127.0.0.1:18449/?page=map`.

- [ ] **Step 1: Run focused player and privacy tests**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-spatial-projection.test.mjs test/map-spatial-session.test.mjs test/map-snapshot.test.mjs test/map-player-marker-colours.test.mjs test/map-page-boundary.test.mjs
```

Expected: all pass, zero failures.

- [ ] **Step 2: Run the full application suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failures; existing intentional skips only.

- [ ] **Step 3: Build the production app**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript, provider/bindings, asset verification, Vite build, and runtime boundary checks all succeed.

- [ ] **Step 4: Restart and health-check the smoke server**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: `ok:true` and the current commit build SHA.

- [ ] **Step 5: Browser-smoke selected online players**

At desktop and phone widths, select at least two online monitored players when available and confirm:

- player features use distinct stable colours;
- tooltips and keyboard-readable alternatives include the correct names;
- deselection removes the marker and its requested subscription scope;
- an offline or excluded player never appears;
- no iframe, remote image, direct Relay request, console error, failed fetch, or 429 occurs;
- terrain, roads, claims, and resource layers remain functional.

If only one online member is available, verify that player's live point and use the deterministic multi-player fixture for colour uniqueness; do not fabricate a second live position.

- [ ] **Step 6: Review and commit final evidence changes**

```powershell
git diff --check
git status --short
git add docs/research/native-map-live-coordinate-reference.md
git commit -m "docs(map): record player position acceptance"
```

Skip the final commit if the evidence reference did not change. Do not push, bump the version, or edit the changelog unless separately requested.
