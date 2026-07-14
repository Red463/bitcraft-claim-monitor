# Craft Planner Player Bank Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent per-player Banks source that counts all BitJita-visible settlement banks as confirmed Craft Planner stock while preserving player and settlement ownership.

**Architecture:** Extend the normalized source rules with `bankPlayerIds`, split player inventory payloads into personal inventory, bank, and deployable sources, and fetch the union of Inventory/Bank players once per live calculation. Bank sources enter the existing confirmed-stock aggregation path, so every planner and Discord view receives the same quantities without separate calculations.

**Tech Stack:** Node.js 24, Node test runner, React, TypeScript, plain CSS, existing BitJita proxy/cache, existing Craft Planner modules.

## Global Constraints

- Banks are independently enabled per player through `bankPlayerIds`.
- One Banks toggle includes every BitJita-visible bank returned for that player, across all settlements.
- Existing and new plans default bank tracking off.
- Bank quantities are confirmed stock; never estimate unavailable or malformed bank contents.
- Preserve player ownership and settlement names in stock-location details.
- Fetch at most once per player per calculation when Inventory and Banks are both enabled.
- Preserve BitJita `itemType`: `0` resolves as an item and `1` resolves as cargo.
- Add no database table, external dependency, public route, or background polling job.
- Keep changes focused in `apps/bitcraft-local`; do not refactor unrelated planner code.

---

## File Map

- `apps/bitcraft-local/src/server/craftPlanning.mjs` — normalize `bankPlayerIds` and accept bank sources in confirmed-stock calculation.
- `apps/bitcraft-local/src/server/craftPlanSources.mjs` — classify, label, deduplicate, and return player bank sources; calculate the unique players whose inventory endpoint is needed.
- `apps/bitcraft-local/server.mjs` — fetch each selected player's inventory once, route selected inventory/bank/deployable families, and report source-specific failures.
- `apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx` — add the independent Banks toggle and supporting copy.
- `apps/bitcraft-local/src/styles/craft-planning.css` — keep three player-source controls dense and responsive.
- `apps/bitcraft-local/test/craft-planning.test.mjs` — configuration defaults and confirmed bank-stock calculations.
- `apps/bitcraft-local/test/craft-plan-sources.test.mjs` — bank classification, multi-settlement isolation, deduplication, labels, and item/cargo semantics.
- `apps/bitcraft-local/test/craft-planning-need-details.test.mjs` — player, bank, and settlement stock-location labels.
- `apps/bitcraft-local/test/craft-planning-boundary.test.mjs` — server wiring, independent UI controls, copy, and responsive CSS boundaries.

---

### Task 1: Normalize Independent Bank-player Configuration

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:133-154`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs:187-220`

**Interfaces:**
- Produces: `config.sourceRules.bankPlayerIds: string[]`
- Compatibility: absent `bankPlayerIds` always becomes `[]`; it must not inherit `playerIds` or `craftPlayerIds`.

- [ ] **Step 1: Write failing normalization tests**

Add assertions to the existing source-rule normalization test and add a compatibility test:

```js
test("normalizeCraftPlanConfig preserves independent bank players", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: 1, itemType: 0 }],
    sourceRules: {
      playerIds: ["player-inventory"],
      craftPlayerIds: ["player-crafts"],
      bankPlayerIds: ["player-bank", "player-bank", ""],
    },
  });

  assert.deepEqual(config.sourceRules.playerIds, ["player-inventory"]);
  assert.deepEqual(config.sourceRules.craftPlayerIds, ["player-crafts"]);
  assert.deepEqual(config.sourceRules.bankPlayerIds, ["player-bank"]);
});

test("normalizeCraftPlanConfig keeps banks off for existing plans", () => {
  const config = normalizeCraftPlanConfig({
    sourceRules: { playerIds: ["player-1"], craftPlayerIds: ["player-1"] },
  });
  assert.deepEqual(config.sourceRules.bankPlayerIds, []);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```sh
node --experimental-strip-types --test test/craft-planning.test.mjs
```

Expected: FAIL because `bankPlayerIds` is absent.

- [ ] **Step 3: Add the normalized field**

In `normalizeCraftPlanConfig`, normalize the new list independently:

```js
const playerIds = uniqueStrings(raw.sourceRules?.playerIds);
const craftPlayerIds = Array.isArray(raw.sourceRules?.craftPlayerIds)
  ? uniqueStrings(raw.sourceRules.craftPlayerIds)
  : playerIds;
const bankPlayerIds = uniqueStrings(raw.sourceRules?.bankPlayerIds);
```

Return it with the existing source rules:

```js
sourceRules: {
  storageContainerIds: uniqueStrings(raw.sourceRules?.storageContainerIds),
  playerIds,
  craftPlayerIds,
  bankPlayerIds,
  deployableContainerIds: uniqueStrings(raw.sourceRules?.deployableContainerIds),
},
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```sh
node --experimental-strip-types --test test/craft-planning.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the configuration change**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "feat: configure player bank tracking"
```

---

### Task 2: Classify and Preserve Player Bank Sources

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanSources.mjs:1-4, 177-282`
- Modify: `apps/bitcraft-local/test/craft-plan-sources.test.mjs:118-215`

**Interfaces:**
- Produces: `isPlayerBankInventory(inventory, inventoryName): boolean`
- Produces: `selectedPlayerInventoryIds(sourceRules): string[]`
- Extends: `playerInventoryContainerSources(...).banks: Array<PlayerBankSource>`
- `PlayerBankSource` shape: `{ sourceId, label, type: "Player bank", playerId, playerName, containerName, claimName, items }`.

- [ ] **Step 1: Replace the old bank-exclusion assertion with failing bank-source tests**

Extend the wrapped inventory fixture to include two settlements and a repeated row, then assert:

```js
const banks = result.banks;
assert.deepEqual(banks.map((source) => source.sourceId), [
  "player-1:town-bank-1",
  "player-1:town-bank-2",
]);
assert.deepEqual(banks.map((source) => source.label), [
  "Town Bank — Timbersteel Trade",
  "Town Bank — Remote Settlement",
]);
assert.equal(banks[0].playerName, "Modular");
assert.equal(banks[0].type, "Player bank");
assert.deepEqual(banks[0].items.map((item) => item.name), ["Honey"]);
assert.deepEqual(result.inventory.items.map((item) => item.name), ["Simple Wood Log"]);
assert.equal(result.deployableOptions.some((source) => /Town Bank/.test(source.label)), false);
```

Add player-selection and identity tests:

```js
test("selectedPlayerInventoryIds returns one request id for inventory and bank selections", () => {
  assert.deepEqual(selectedPlayerInventoryIds({
    playerIds: ["player-1", "player-2"],
    bankPlayerIds: ["player-1", "player-3"],
  }), ["player-1", "player-2", "player-3"]);
});

test("player banks preserve item and cargo identity", () => {
  const result = playerInventoryContainerSources("player-1", "Modular", {
    inventories: [{
      entityId: "bank-1",
      inventoryName: "Town Bank",
      claimName: "Remote Settlement",
      pockets: [
        { contents: { itemId: 700, itemType: 0, quantity: 4 } },
        { contents: { itemId: 700, itemType: 1, quantity: 6 } },
      ],
    }],
  });
  assert.deepEqual(result.banks[0].items.map((item) => [item.kind, item.id, item.quantity]), [
    ["items", "700", 4],
    ["cargo", "700", 6],
  ]);
});
```

- [ ] **Step 2: Run the source tests and verify they fail**

Run:

```sh
node --experimental-strip-types --test test/craft-plan-sources.test.mjs
```

Expected: FAIL because `banks` and `selectedPlayerInventoryIds` do not exist.

- [ ] **Step 3: Add bank classification, labels, deduplication, and selected-player union**

Add focused helpers:

```js
export function isPlayerBankInventory(inventory = {}, inventoryName = "") {
  const name = String(inventoryName || inventory.inventoryName || inventory.name || inventory.type || "").trim();
  return /town bank|settlement bank|claim bank|community bank|\bbank\b/i.test(name);
}

export function selectedPlayerInventoryIds(sourceRules = {}) {
  return [...new Set([
    ...(Array.isArray(sourceRules.playerIds) ? sourceRules.playerIds : []),
    ...(Array.isArray(sourceRules.bankPlayerIds) ? sourceRules.bankPlayerIds : []),
  ].map(String).map((value) => value.trim()).filter(Boolean))];
}

function playerBankLabel(inventoryName, claimName) {
  const bank = String(inventoryName ?? "Town Bank").trim() || "Town Bank";
  const claim = String(claimName ?? "").trim();
  return claim ? `${bank} — ${claim}` : bank;
}
```

Inside `playerInventoryContainerSources`, create `const banksById = new Map()`. Classify banks before the settlement-storage skip:

```js
if (isPlayerBankInventory(inventory, inventoryName)) {
  if (!banksById.has(rawSourceId)) {
    const claimName = String(inventory.claimName ?? inventory.claim?.name ?? "").trim();
    banksById.set(rawSourceId, {
      sourceId: rawSourceId,
      label: playerBankLabel(inventoryName, claimName),
      type: "Player bank",
      playerId: String(playerId),
      playerName: String(label),
      containerName: inventoryName,
      claimName: claimName || null,
      items,
    });
  }
  continue;
}
if (isSettlementStorageInventory(inventory, inventoryName)) continue;
```

Return `banks: [...banksById.values()]` alongside inventory and deployables. Ensure `items` is calculated before bank classification.

- [ ] **Step 4: Run source tests and verify they pass**

Run:

```sh
node --experimental-strip-types --test test/craft-plan-sources.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit source classification**

```sh
git add apps/bitcraft-local/src/server/craftPlanSources.mjs apps/bitcraft-local/test/craft-plan-sources.test.mjs
git commit -m "feat: classify player bank inventories"
```

---

### Task 3: Count Selected Banks as Confirmed Stock

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:1152-1174`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-need-details.test.mjs`

**Interfaces:**
- Extends: `computeCraftPlan({ ..., bankSources?: Source[] })`
- Consumes bank sources produced by Task 2.
- Bank sources use the existing `addSourceTotals` confirmed-quantity path.

- [ ] **Step 1: Write a failing confirmed-bank calculation test**

```js
test("computeCraftPlan counts selected player banks as confirmed stock with source ownership", () => {
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "900", kind: "items", name: "Simple Plank", quantity: 10, itemType: 0 }],
      sourceRules: { bankPlayerIds: ["player-1"] },
    }),
    detailsByKey: new Map([[recipeKey("items", "900"), {
      item: { id: "900", itemType: 0, name: "Simple Plank", tier: 2 },
    }]]),
    bankSources: [{
      sourceId: "player-1:bank-remote",
      label: "Town Bank — Remote Settlement",
      type: "Player bank",
      playerId: "player-1",
      playerName: "Modular",
      items: [{ id: "900", kind: "items", itemType: 0, name: "Simple Plank", quantity: 7 }],
    }],
  });

  const material = plan.materials.find((row) => row.id === "900");
  assert.equal(material.available, 7);
  assert.equal(material.missing, 3);
  assert.deepEqual(material.sources.map((source) => ({
    label: source.label,
    type: source.type,
    playerName: source.playerName,
    quantity: source.quantity,
  })), [{
    label: "Town Bank — Remote Settlement",
    type: "Player bank",
    playerName: "Modular",
    quantity: 7,
  }]);
});

test("groupNeedCellSources labels player banks with owner and settlement", () => {
  const groups = groupNeedCellSources({
    items: [{
      sources: [{
        sourceId: "player-1:bank-remote",
        label: "Town Bank — Remote Settlement",
        type: "Player bank",
        playerName: "Modular",
        quantity: 7,
      }],
    }],
  });
  assert.equal(groups[0].label, "Modular — Town Bank — Remote Settlement");
  assert.equal(groups[0].quantity, 7);
});
```

- [ ] **Step 2: Run the planner test and verify it fails**

Run:

```sh
node --experimental-strip-types --test test/craft-planning.test.mjs test/craft-planning-need-details.test.mjs
```

Expected: FAIL with `available` equal to zero.

- [ ] **Step 3: Add bank sources to confirmed totals**

Extend the function parameters and source aggregation:

```js
export function computeCraftPlan({
  config,
  detailsByKey = new Map(),
  storageSources = [],
  playerSources = [],
  bankSources = [],
  deployableSources = [],
  activeCrafts = [],
  craftSourceErrors = [],
  catalogWarnings = [],
} = {}) {
```

```js
addSourceTotals(availableTotals, storageSources, "Settlement storage", unavailableSources);
addSourceTotals(availableTotals, playerSources, "Player inventory", unavailableSources);
addSourceTotals(availableTotals, bankSources, "Player bank", unavailableSources);
addSourceTotals(availableTotals, deployableSources, "Player deployable", unavailableSources);
```

- [ ] **Step 4: Run planner tests and verify they pass**

Run:

```sh
node --experimental-strip-types --test test/craft-planning.test.mjs test/craft-planning-need-details.test.mjs
```

Expected: PASS, including existing confirmed/guaranteed effort tests.

- [ ] **Step 5: Commit confirmed-stock support**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-need-details.test.mjs
git commit -m "feat: count selected player banks"
```

---

### Task 4: Wire One Shared Player-inventory Request into Live Plans

**Files:**
- Modify: `apps/bitcraft-local/server.mjs:48, 1965-2000, 2233-2275, 9577-9579`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:125-155, 225-255`

**Interfaces:**
- Consumes: `selectedPlayerInventoryIds(sourceRules)` and `sources.banks` from Task 2.
- Consumes: `computeCraftPlan({ bankSources })` from Task 3.
- Produces source-specific unavailable entries labeled `Player inventory` and/or `Player bank`.

- [ ] **Step 1: Add failing server-wiring boundary assertions**

```js
assert.match(manager, /bankPlayerIds/);
assert.match(manager, />Banks</);
assert.match(computedCraftPlan, /selectedPlayerInventoryIds\(config\.sourceRules\)/);
assert.match(computedCraftPlan, /config\.sourceRules\.bankPlayerIds/);
assert.match(computedCraftPlan, /bankSources/);
assert.match(computedCraftPlan, /sources\.banks/);
assert.match(computedCraftPlan, /computeCraftPlan\(\{[\s\S]*bankSources/);
```

Also assert that the selected-player loop contains one `/players/${playerId}/inventories` fetch and conditionally routes both source families:

```js
const playerInventoryLoop = computedCraftPlan.match(/for \(const playerId of selectedPlayerInventoryIds[\s\S]*?return computeCraftPlan/)?.[0] ?? "";
assert.equal((playerInventoryLoop.match(/\/players\/\$\{encodeURIComponent\(playerId\)\}\/inventories/g) ?? []).length, 1);
assert.match(playerInventoryLoop, /playerIds\.includes/);
assert.match(playerInventoryLoop, /bankPlayerIds\.includes/);
```

- [ ] **Step 2: Run the boundary test and verify it fails**

Run:

```sh
node --experimental-strip-types --test test/craft-planning-boundary.test.mjs
```

Expected: FAIL because bank server wiring is absent.

- [ ] **Step 3: Import the selected-player helper and update admin discovery**

Extend the existing import:

```js
import {
  craftPlanCatalogLookup,
  playerInventoryContainerSources,
  selectedPlayerInventoryIds,
  settlementStorageSourcesFromInventories,
  sourceItemsFromSlots,
  trackedCraftPlanOutputs,
} from "./src/server/craftPlanSources.mjs";
```

In `craftPlanAdminResponse`, discover deployables for the unique Inventory/Bank player union:

```js
const selectedInventoryPlayers = new Set(selectedPlayerInventoryIds(config.sourceRules));
for (const member of members.filter((entry) => selectedInventoryPlayers.has(String(entry.playerEntityId ?? entry.entityId ?? "")))) {
```

- [ ] **Step 4: Route live Inventory and Banks independently from one fetch**

Replace the `config.sourceRules.playerIds` loop with:

```js
const playerSources = [];
const bankSources = [];
const deployableSources = [];
const inventoryPlayerIds = new Set(config.sourceRules.playerIds.map(String));
const bankPlayerIds = new Set(config.sourceRules.bankPlayerIds.map(String));

for (const playerId of selectedPlayerInventoryIds(config.sourceRules)) {
  const label = memberNames.get(playerId) ?? playerId;
  try {
    const payload = await fetchBitjita(`/players/${encodeURIComponent(playerId)}/inventories`, { timeoutMs: 6000, cache: true });
    const sources = playerInventoryContainerSources(playerId, label, payload, config.sourceRules.deployableContainerIds);
    if (inventoryPlayerIds.has(playerId)) {
      playerSources.push(enrichCraftPlanSourcesFromLocalCatalog(gameCatalogRepository, sources.inventory, catalogWarnings));
    }
    if (bankPlayerIds.has(playerId)) {
      bankSources.push(...enrichCraftPlanSourcesFromLocalCatalog(gameCatalogRepository, sources.banks, catalogWarnings));
    }
    deployableSources.push(...enrichCraftPlanSourcesFromLocalCatalog(gameCatalogRepository, sources.deployables, catalogWarnings));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (inventoryPlayerIds.has(playerId)) {
      playerSources.push({ sourceId: playerId, label: `${label} inventory`, type: "Player inventory", unavailable: true, error: message, items: [] });
    }
    if (bankPlayerIds.has(playerId)) {
      bankSources.push({ sourceId: `${playerId}:banks`, label: `${label} banks`, type: "Player bank", playerId, playerName: label, unavailable: true, error: message, items: [] });
    }
  }
}
```

Pass `bankSources` into `computeCraftPlan` and include `banks: config.sourceRules.bankPlayerIds.length` in the existing audit metadata.

- [ ] **Step 5: Run focused server and planner tests**

Run:

```sh
node --experimental-strip-types --test test/craft-plan-sources.test.mjs test/craft-planning.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit server orchestration**

```sh
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "feat: load selected player banks"
```

---

### Task 5: Add the Independent Banks Toggle to the Manager

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx:14-28, 90-120, 270-283, 501-504`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css:122-131`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:125-180`

**Interfaces:**
- Consumes and saves: `config.sourceRules.bankPlayerIds`.
- Extends: `playerSourceCard` with `banksChecked` and `onBanksChange`.
- Copy: Banks counts every BitJita-visible settlement bank for the selected player, including other settlements.

- [ ] **Step 1: Add failing manager and CSS assertions**

```js
assert.match(manager, /bankPlayerIds: string\[\]/);
assert.match(manager, /bankPlayerIds: \[\]/);
assert.match(manager, /<span>Banks<\/span>/);
assert.match(manager, /Every visible settlement bank/);
assert.match(manager, /updateSource\("bankPlayerIds"/);
assert.match(styles, /\.craft-plan-player-source-toggles\s*\{[^}]*grid-template-columns:/s);
assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.craft-plan-player-source-toggles/s);
```

- [ ] **Step 2: Run the boundary test and verify it fails**

Run:

```sh
node --experimental-strip-types --test test/craft-planning-boundary.test.mjs
```

Expected: FAIL because the manager has no Banks control.

- [ ] **Step 3: Extend manager types and empty defaults**

```ts
sourceRules: {
  storageContainerIds: string[];
  playerIds: string[];
  craftPlayerIds: string[];
  bankPlayerIds: string[];
  deployableContainerIds: string[];
};
```

Add `bankPlayerIds: []` to `emptyConfig`, and extend `updateSource`:

```ts
function updateSource(
  kind: "storageContainerIds" | "playerIds" | "craftPlayerIds" | "bankPlayerIds" | "deployableContainerIds",
  id: string,
  checked: boolean,
) {
```

- [ ] **Step 4: Add the third independent player control**

Extend `playerSourceCard` parameters and included state:

```tsx
function playerSourceCard(
  source: AnyRecord,
  inventoryChecked: boolean,
  craftsChecked: boolean,
  banksChecked: boolean,
  onInventoryChange: (checked: boolean) => void,
  onCraftsChange: (checked: boolean) => void,
  onBanksChange: (checked: boolean) => void,
) {
  return (
    <article className={`craft-plan-source-card${inventoryChecked || craftsChecked || banksChecked ? " is-included" : ""}`} key={source.playerId}>
      <header>
        <div><strong>{source.label}</strong><small>Player tracking</small></div>
        <div className="craft-plan-player-source-toggles">
          <label className="compact-toggle"><input type="checkbox" checked={inventoryChecked} onChange={(event) => onInventoryChange(event.target.checked)} /><span>Inventory</span></label>
          <label className="compact-toggle"><input type="checkbox" checked={craftsChecked} onChange={(event) => onCraftsChange(event.target.checked)} /><span>Crafts</span></label>
          <label className="compact-toggle"><input type="checkbox" checked={banksChecked} onChange={(event) => onBanksChange(event.target.checked)} /><span>Banks</span></label>
        </div>
      </header>
    </article>
  );
}
```

Pass `config.sourceRules.bankPlayerIds.includes(playerId)` and `updateSource("bankPlayerIds", playerId, checked)` at the call site. Replace the Players guidance with:

```tsx
<p className="legend">Choose personal inventories, active crafts, and banks independently. Banks counts every visible settlement bank for that player, including banks at other settlements, as confirmed stock.</p>
```

- [ ] **Step 5: Add compact responsive layout**

```css
.craft-plan-player-source-toggles {
  display: grid;
  grid-template-columns: repeat(3, max-content);
  justify-content: end;
  gap: 6px 10px;
}

@media (max-width: 700px) {
  .craft-plan-player-source-toggles {
    grid-template-columns: 1fr;
    justify-items: start;
  }
}
```

Use existing control colors, focus behavior, card density, and 6–9px radii. Do not add a modal, animation, or new component library.

- [ ] **Step 6: Run boundary tests and build**

Run:

```sh
node --experimental-strip-types --test test/craft-planning-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the manager UI**

```sh
git add apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "feat: add player bank controls"
```

---

### Task 6: Complete Integration and Release Verification

**Files:**
- Review: all files changed in Tasks 1–5
- Test: `apps/bitcraft-local/test/craft-plan-sources.test.mjs`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Test: `apps/bitcraft-local/test/craft-planning-need-details.test.mjs`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Verifies the end-to-end contract from saved `bankPlayerIds` through BitJita parsing, confirmed totals, effort progress, item source details, and compact planner consumers.

- [ ] **Step 1: Run the focused feature suite**

```sh
node --experimental-strip-types --test \
  test/craft-plan-sources.test.mjs \
  test/craft-planning.test.mjs \
  test/craft-planning-need-details.test.mjs \
  test/craft-planning-boundary.test.mjs \
  test/craft-plan-effort-progress.test.mjs \
  test/server-craft-plan-discord-reports.test.mjs
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run the complete application suite**

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: PASS with zero failures.

- [ ] **Step 3: Run the production build**

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite build PASS. The existing large-chunk warning is non-blocking.

- [ ] **Step 4: Run focused UI detection**

```powershell
node .agents/skills/impeccable/scripts/detect.mjs --json apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx apps/bitcraft-local/src/styles/craft-planning.css
```

Expected: no new actionable findings for the modified manager controls.

- [ ] **Step 5: Browser-check desktop and narrow manager layouts**

From the repository root:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open `http://127.0.0.1:18449/?page=planning`, then verify:

- Manage Plan → Players & Deployables shows Inventory, Crafts, and Banks independently.
- Enabling only Banks highlights the player card and saves without enabling Inventory or Crafts.
- Three controls remain readable without horizontal overflow at desktop and approximately 760px width.
- When fixture or live bank data is available, Stock locations shows player, bank, settlement, and quantity.
- A bank request failure shows an unavailable source and contributes zero stock.

- [ ] **Step 6: Inspect the final diff and working tree**

```sh
git diff --check origin/main..HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors and no uncommitted feature files.

- [ ] **Step 7: Request code review**

Use `superpowers:requesting-code-review` with base `origin/main`, current `HEAD`, this plan, and the design specification. Fix every Critical and Important finding, rerun the affected tests, then rerun the complete suite and build.
