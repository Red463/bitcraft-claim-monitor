# Relay Siege Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unresolved current-siege roles with proven attacker/defender identities and expose authoritative successful/failed siege outcomes from bounded Relay notifications, while keeping cancellation explicitly `removed_or_unknown`.

**Architecture:** Reuse the continuously connected global SpacetimeDB connection. Its static subscription gains only the small notification-description catalog; a second, replaceable subscription reads `empire_notification_state` by exact Empire IDs supplied by the regional Empire runtime. A pure normalizer pairs only exact timestamp/template-replacement counterpart events, and the existing atomic `empires` generation receives compact current roles and recent outcomes without a feature SQL table or scheduler.

**Tech Stack:** Node.js 24+, TypeScript, official `spacetimedb` SDK/generated bindings, React, Node test runner, built-in SQLite only for existing derived history.

## Global Constraints

- Never infer a cancellation from disappearance, inactivity, zero energy, or an unmatched notification; publish `removed_or_unknown`.
- `empire_node_siege_state.empire_entity_id` is the attacker; the joined `empire_node_state.empire_entity_id` is the defender, as proven by the 2026-08-01 live notification diagnostic.
- Successful attack requires an exact `SuccessfulSiege` plus `FailedDefense` pair; successful defense requires exact `FailedSiege` plus `SuccessfulDefense`.
- Counterpart pairs must have the same upstream timestamp and identical replacement tuple.
- Subscribe to notification state only through exact configured/local Empire IDs. Do not use `SELECT * FROM empire_notification_state`.
- Preserve decimal IDs as strings and convert the upstream `i32` seconds timestamp explicitly.
- Do not add a current-state, cache, sweep, or work SQL table. Do not add a scheduled acquisition job.
- Preserve the last complete notification projection during subscription replacement, reconnect, or malformed updates.
- Runtime and built output must remain free of BitJita routes, requests, assets, configuration, retries, and fallbacks.

---

### Task 1: Pure notification normalization and pairing

**Files:**
- Create: `apps/bitcraft-local/src/server/game-data/siegeNotifications.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/normalizers.ts`
- Test: `apps/bitcraft-local/test/siege-notifications.test.mjs`
- Test: `apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs`

**Interfaces:**
- Consumes raw generated-binding rows from `empire_notification_desc` and `empire_notification_state`.
- Produces:

```ts
type SiegeNotificationKind =
  | "marked"
  | "started_attack"
  | "started_defense"
  | "attack_won"
  | "defense_won"
  | "attack_failed"
  | "defense_failed";

type NormalizedSiegeNotification = {
  entityId: string;
  empireEntityId: string;
  kind: SiegeNotificationKind;
  occurredAt: string;
  replacements: [string, string];
};

type SiegeOutcome = {
  eventKey: string;
  occurredAt: string;
  watchtowerLabel: string;
  encodedLocation: string;
  attackerEmpireEntityId: string;
  defenderEmpireEntityId: string;
  outcome: "attacker_won" | "defender_won";
};

export function normalizeAndPairSiegeNotifications(
  descriptions: unknown[],
  notifications: unknown[],
): { notifications: NormalizedSiegeNotification[]; outcomes: SiegeOutcome[]; warnings: string[] };
```

- `normalizeRegionalEmpires(...)` marks each normalized siege row with `role: "attacker"` and `defenderEmpireEntityId` from its joined node owner. It no longer emits the unresolved-role warning.

- [ ] **Step 1: Write failing pure tests**

Cover:

```ts
assert.deepEqual(pair(["SuccessfulSiege", "FailedDefense"]).outcome, "attacker_won");
assert.deepEqual(pair(["FailedSiege", "SuccessfulDefense"]).outcome, "defender_won");
assert.equal(unmatched.outcomes.length, 0);
assert.match(unmatched.warnings[0], /unmatched/i);
assert.equal(cancelLike.outcomes.length, 0);
assert.equal(currentSiege.role, "attacker");
assert.equal(currentSiege.defenderEmpireEntityId, "node-owner-id");
```

Also prove duplicate notification IDs, malformed decimal IDs, non-two-element replacements, unknown enum variants, invalid/overflowing seconds, and mismatched timestamp/replacement tuples fail closed.

- [ ] **Step 2: Run the tests and confirm the new module/fields are absent**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/siege-notifications.test.mjs apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs
```

Expected: FAIL because `siegeNotifications.ts` and proven role fields do not exist.

- [ ] **Step 3: Implement exact normalization**

Use the existing generated enum object shape, map only the seven listed siege variants, convert `timestamp` with `new Date(seconds * 1000).toISOString()` after safe-integer/range validation, and preserve the two replacement strings exactly.

Build pair keys as:

```ts
const pairKey = `${occurredAt}\u0000${replacements[0]}\u0000${replacements[1]}`;
```

Emit an outcome only for one unique complementary pair. Duplicate or ambiguous candidates add a warning and emit no outcome.

- [ ] **Step 4: Implement proven current roles**

When normalizing each regional siege row, join `buildingEntityId` to the already-normalized node owner and emit:

```ts
{
  ...siege,
  role: "attacker",
  defenderEmpireEntityId: nodeOwnerEmpireEntityId,
}
```

Reject a siege whose building has no node owner rather than assigning a role without both identities.

- [ ] **Step 5: Run focused tests**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/siege-notifications.test.mjs apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/siegeNotifications.ts apps/bitcraft-local/src/server/game-data/normalizers.ts apps/bitcraft-local/test/siege-notifications.test.mjs apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs
git commit -m "feat: normalize authoritative siege outcomes"
```

---

### Task 2: Bounded dynamic subscription on the global connection

**Files:**
- Modify: `apps/bitcraft-local/src/server/game-data/globalCatalogSession.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/globalCatalogRuntime.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/topology.ts` only if the existing equality-query helper cannot safely encode the scope
- Test: `apps/bitcraft-local/test/global-catalog-session.test.mjs`
- Test: `apps/bitcraft-local/test/global-catalog-runtime.test.mjs`

**Interfaces:**
- `GLOBAL_CATALOG_QUERIES` adds `SELECT * FROM empire_notification_desc`.
- `RelayGlobalCatalogSession.setEmpireNotificationScope(empireIds: string[]): Promise<boolean>` owns a replaceable subscription containing only indexed equality predicates on `empire_notification_state.empire_entity_id`.
- `GlobalCatalogSnapshot` adds:

```ts
siegeNotifications: ReturnType<typeof normalizeAndPairSiegeNotifications>;
changed: Array<"catalogs" | "region" | "empire-foundries" | "empire-notifications">;
```

- `RelayGlobalCatalogRuntime.setEmpireNotificationScope(empireIds: string[]): Promise<boolean>` retains the normalized scope across topology reconnects and forwards compact snapshots through `onEmpireNotifications`.

- [ ] **Step 1: Write failing session tests**

Prove:

- no unbounded `SELECT * FROM empire_notification_state` appears;
- IDs are deduplicated, decimal-validated, numerically sorted, and emitted through indexed equality queries;
- an identical scope is a no-op;
- a replacement subscription is applied before its snapshot replaces last-good data;
- stale callbacks from an unsubscribed scope cannot publish;
- insert/update/delete on notification state queues one coalesced notification snapshot;
- empty scope unsubscribes notification state but keeps the static catalog connection alive;
- stop removes listeners and both subscription handles.

- [ ] **Step 2: Run the session tests and confirm failure**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/global-catalog-session.test.mjs apps/bitcraft-local/test/global-catalog-runtime.test.mjs
```

Expected: FAIL because the dynamic scope API and snapshot group do not exist.

- [ ] **Step 3: Add the static description and dynamic state subscription**

Reuse the current `BindingConnection`; do not create another WebSocket. Keep separate handles for static catalogs and scoped notifications. Guard every scoped callback with a monotonically increasing scope generation:

```ts
const scopeGeneration = ++this.#notificationScopeGeneration;
if (scopeGeneration !== this.#notificationScopeGeneration) return;
```

Only swap `#notificationScopeIds` after `onApplied`; an error records health and leaves the previous compact projection owned by the Empire runtime.

- [ ] **Step 4: Preserve scope across runtime reconnect**

Store the requested IDs in `RelayGlobalCatalogRuntime`, apply them immediately after a replacement session starts, and expose notification subscription readiness/error in `health()` without making catalog readiness depend on notification readiness.

- [ ] **Step 5: Run focused tests**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/global-catalog-session.test.mjs apps/bitcraft-local/test/global-catalog-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/globalCatalogSession.ts apps/bitcraft-local/src/server/game-data/globalCatalogRuntime.ts apps/bitcraft-local/test/global-catalog-session.test.mjs apps/bitcraft-local/test/global-catalog-runtime.test.mjs
git commit -m "feat: subscribe to scoped siege notifications"
```

---

### Task 3: Atomic Empire integration and provider-neutral views

**Files:**
- Modify: `apps/bitcraft-local/src/server/game-data/empireRuntime.ts`
- Modify: `apps/bitcraft-local/src/server/empireViews.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/pages/empires/SiegeDetailsDialog.tsx`
- Modify: `apps/bitcraft-local/src/pages/EmpiresPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/empires.css`
- Test: `apps/bitcraft-local/test/empire-runtime.test.mjs`
- Test: `apps/bitcraft-local/test/empire-views.test.mjs`
- Test: `apps/bitcraft-local/test/siege-presentation.test.mjs`
- Test: `apps/bitcraft-local/test/empires-page-boundary.test.mjs`
- Test: `apps/bitcraft-local/test/server.test.mjs`

**Interfaces:**
- `RelayEmpireRuntime` dependency adds:

```ts
onNotificationScopeChanged?: (empireIds: string[]) => Promise<void> | void;
```

- `RelayEmpireRuntime.updateGlobalSiegeNotifications(snapshot)` atomically enriches last-good `empires` data with compact `siegeOutcomes` and notification warnings.
- `EmpireCombinedData` adds:

```ts
siegeOutcomes: SiegeOutcome[] | null;
```

- Current watchtower DTOs expose one attacker card per active siege row and one deduplicated defender card for the node owner.
- Empire views expose recent proven outcomes with `outcome: "attacker_won" | "defender_won"`. No DTO uses `cancelled`.

- [ ] **Step 1: Write failing runtime and view tests**

Prove:

- primary regional generations send the exact union of local settlement owners, node owners, and siege attackers to `onNotificationScopeChanged`;
- secondary-region rotation expands/reduces the scope from committed configured regions only;
- notification enrichment never delays the base regional generation;
- failed/replacing notification scope retains last-good outcomes with a warning;
- current siege details show the proven attacker and defender once each;
- successful and failed outcome pairings expose both Empire names and exact timestamps;
- unmatched events appear only as an availability warning, never as cancellation;
- configured-region route fencing still excludes removed regions.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/empire-runtime.test.mjs apps/bitcraft-local/test/empire-views.test.mjs apps/bitcraft-local/test/siege-presentation.test.mjs apps/bitcraft-local/test/empires-page-boundary.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: FAIL because the notification scope, outcomes, and proven defender presentation are absent.

- [ ] **Step 3: Wire runtime scope and snapshots**

After each complete configured regional generation, derive the exact active Empire ID set and call `onNotificationScopeChanged`. Coalesce identical sets. Wire:

```ts
onNotificationScopeChanged: (ids) =>
  relayGlobalCatalogRuntime.setEmpireNotificationScope(ids)
```

and:

```ts
onEmpireNotifications: (snapshot) =>
  relayEmpireRuntime.updateGlobalSiegeNotifications(snapshot)
```

The callback may run after both constants are initialized; no startup callback may dereference the later runtime before construction completes.

- [ ] **Step 4: Add provider-neutral current and outcome projections**

Join attacker and defender IDs through the existing Empire-name index. Keep all raw wire notification rows out of React and out of SQLite. Limit the browser DTO to the compact paired outcomes already retained by the upstream scoped state.

- [ ] **Step 5: Add dense outcome presentation**

In the existing Empire operational workspace:

- display Attacking Empire and Defending Empire for current sieges;
- add a compact “Recent Siege Outcomes” section with outcome, both Empire names, watchtower label, and time;
- show the explicit message “Cancelled or removed sieges are unavailable from Relay” rather than labelling an unmatched removal;
- preserve the existing viewport-fixed accessible dialog behavior.

- [ ] **Step 6: Run focused tests**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/empire-runtime.test.mjs apps/bitcraft-local/test/empire-views.test.mjs apps/bitcraft-local/test/siege-presentation.test.mjs apps/bitcraft-local/test/empires-page-boundary.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/empireRuntime.ts apps/bitcraft-local/src/server/empireViews.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/src/pages/empires/SiegeDetailsDialog.tsx apps/bitcraft-local/src/pages/EmpiresPage.tsx apps/bitcraft-local/src/styles/empires.css apps/bitcraft-local/test/empire-runtime.test.mjs apps/bitcraft-local/test/empire-views.test.mjs apps/bitcraft-local/test/siege-presentation.test.mjs apps/bitcraft-local/test/empires-page-boundary.test.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: expose proven siege roles and outcomes"
```

---

### Task 4: Evidence, zero-legacy checks, and live verifier

**Files:**
- Create: `apps/bitcraft-local/scripts/verify-relay-siege-notifications-live.mjs`
- Modify: `docs/relay-migration/diagnostic-findings.md`
- Modify: `docs/relay-migration/parity-matrix.md`
- Modify: `docs/relay-migration/evidence-baseline.md`
- Modify: `docs/relay-migration/table-inventory.md`
- Modify: `docs/relay-migration/README.md`
- Test: `apps/bitcraft-local/test/relay-live-verifier-boundary.test.mjs`
- Test: `apps/bitcraft-local/test/relay-no-bitjita-runtime.test.mjs`
- Test: `apps/bitcraft-local/test/sql-table-ownership-boundary.test.mjs`

**Interfaces:**
- The live verifier repeats the bounded primary-source proof using topology discovery and generated bindings, exits non-zero for schema mismatch/unbounded query/malformed pairing, and prints no secrets.
- Documentation records success/failure as implemented and cancellation as the sole unproven siege terminal state.

- [ ] **Step 1: Write the verifier boundary test**

Require:

- generated global/regional bindings and topology discovery;
- exact Empire-ID equality subscriptions;
- schema-manifest fingerprint checks;
- no unbounded notification-state query;
- no BitJita string;
- explicit counts for paired start, attacker-win, and defender-win events;
- explicit `cancellationSemantics: "unavailable"` output.

- [ ] **Step 2: Run the boundary and ownership tests to confirm failure**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/relay-live-verifier-boundary.test.mjs apps/bitcraft-local/test/relay-no-bitjita-runtime.test.mjs apps/bitcraft-local/test/sql-table-ownership-boundary.test.mjs
```

Expected: verifier boundary FAIL because the maintained script does not exist; ownership tests remain green.

- [ ] **Step 3: Implement and run the maintained live verifier**

```powershell
node apps/bitcraft-local/scripts/verify-relay-siege-notifications-live.mjs
```

Expected: current schema fingerprints match, exact bounded scopes apply, paired success/failure evidence is non-zero, and cancellation remains unavailable. If live rows have expired or the Relay is unavailable, retain the dated fixture evidence and record the live verification failure rather than changing semantics.

- [ ] **Step 4: Update evidence documents**

Record:

- the exact observed counts/timestamps from the verifier;
- current-role and successful/failed outcome parity;
- no SQL table/scheduler;
- cancellation as `removed_or_unknown`;
- Empire parity stays `in progress` until controlled cancellation/operator evidence or explicit owner approval retires cancelled-outcome parity.

- [ ] **Step 5: Run complete verification**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Also run:

```powershell
rg -n -i "bitjita|/api/bitjita|BITJITA_" apps/bitcraft-local/src apps/bitcraft-local/server.mjs apps/bitcraft-local/dist apps/bitcraft-local/dist-server
rg -n "empire_.*(cache|snapshot|sweep|work)|siege_.*(cache|snapshot|sweep|work)" apps/bitcraft-local/src/server apps/bitcraft-local/server.mjs
```

Expected: build and all tests PASS; runtime/built scans have no legacy-provider match; no new Empire/siege current-state table appears.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/scripts/verify-relay-siege-notifications-live.mjs apps/bitcraft-local/test/relay-live-verifier-boundary.test.mjs docs/relay-migration/diagnostic-findings.md docs/relay-migration/parity-matrix.md docs/relay-migration/evidence-baseline.md docs/relay-migration/table-inventory.md docs/relay-migration/README.md
git commit -m "docs: record proven relay siege semantics"
```

---

## Final review checklist

- [ ] Current siege rows identify the attacker and node-owning defender without inference beyond the recorded live proof.
- [ ] Only exact counterpart notification pairs create successful/failed outcomes.
- [ ] Cancellation and unmatched removals remain `removed_or_unknown`.
- [ ] Notification-state subscriptions are exact-Empire scoped and reuse the existing global connection.
- [ ] Base Empire generations do not wait for notification enrichment.
- [ ] Reconnect/scope replacement preserves last-good outcomes.
- [ ] Raw notification wire rows never enter React or a SQL current-state table.
- [ ] No scheduled siege acquisition job exists.
- [ ] Focused tests, live verifier, production build, complete suite, zero-BitJita scan, and SQL ownership checks pass.
- [ ] Evidence docs retain the cancellation gate rather than overclaiming cutover readiness.
