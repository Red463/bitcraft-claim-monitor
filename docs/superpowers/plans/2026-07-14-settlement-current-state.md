# Settlement Current State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace append-only settlement snapshots with one current baseline row per settlement while preserving activity-change detection and removing all unused snapshot APIs, settings, and UI.

**Architecture:** SQLite stores one `settlement_state_current` row keyed by `claim_id`. Each worker collection compares the new scalar summary with that row, writes activity events, and upserts the baseline in one transaction. A one-time transactional migration seeds the current row from each settlement's newest snapshot and then drops the legacy table.

**Tech Stack:** Node.js 24, `node:sqlite`, Node test runner, React, TypeScript, Vite, pnpm, systemd.

## Global Constraints

- Historical snapshot charts and snapshot API compatibility are intentionally removed.
- `activity_events` remains the permanent settlement-change history.
- Live page data continues to come from BitJita through the local proxy.
- No raw payload is stored in `settlement_state_current`.
- Baseline and activity writes must be atomic.
- Multiple simultaneous users and page freshness must remain unaffected.
- Retain a fresh pre-migration VPS database backup until production verification is accepted.

## File Map

- Create `apps/bitcraft-local/src/server/settlementState.mjs`: pure summary and activity-change helpers.
- Create `apps/bitcraft-local/test/server-settlement-state.test.mjs`: helper and migration behaviour.
- Modify `apps/bitcraft-local/src/server/schemaBootstrap.mjs`: replace the legacy table definition with `settlement_state_current`.
- Modify `apps/bitcraft-local/src/server/schemaMigrations.mjs`: seed current rows transactionally and drop `snapshots`; remove snapshot indexes.
- Modify `apps/bitcraft-local/src/server/preparedStatements.mjs`: current-state read/upsert statements.
- Modify `apps/bitcraft-local/server.mjs`: current-state collection flow; remove snapshot APIs, retention, counts, and settings.
- Remove `apps/bitcraft-local/src/server/snapshotPlanning.mjs` and its dedicated test after callers move.
- Modify `apps/bitcraft-local/src/server/collectorSettings.mjs`: remove `snapshotHistory`.
- Modify `apps/bitcraft-local/src/api/localHistory.ts`, `apps/bitcraft-local/src/api/localHistoryInclude.ts`, `apps/bitcraft-local/src/types/app.ts`, `apps/bitcraft-local/src/AppShell.tsx`, and `apps/bitcraft-local/src/pages/DashboardPage.tsx`: stop loading and passing unused snapshots.
- Modify `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`, `apps/bitcraft-local/src/components/admin/ServerHealthSection.tsx`, and `apps/bitcraft-local/src/components/admin/adminDisplay.ts`: remove snapshot counters, retention, pruning, and legacy descriptions.
- Update focused boundary tests, `CHANGELOG.md`, and `apps/bitcraft-local/package.json`.

---

### Task 1: Transactional Legacy Migration

**Files:**
- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
- Modify: `apps/bitcraft-local/src/server/schemaMigrations.mjs`
- Modify: `apps/bitcraft-local/test/server-schema-bootstrap.test.mjs`
- Modify: `apps/bitcraft-local/test/server-schema-migrations.test.mjs`
- Create: `apps/bitcraft-local/test/server-settlement-state.test.mjs`

**Interfaces:**
- Produces: `applySettlementStateMigration(db)`.
- Produces table: `settlement_state_current(claim_id, captured_at, supplies, treasury, members_count, buildings_count, market_count, updated_at)`.

- [ ] **Step 1: Write failing schema and migration tests**

Add assertions that bootstrap SQL creates `settlement_state_current` and no longer creates `snapshots`. In an in-memory database, create legacy `snapshots`, insert two settlements with older and newer rows, call the wished-for migration, and assert the newest row per settlement was retained and `snapshots` no longer exists:

```js
test("settlement state migration keeps the newest legacy snapshot per claim and removes history", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      supplies REAL,
      treasury REAL,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER,
      raw_json TEXT NOT NULL
    );
    INSERT INTO snapshots (claim_id,captured_at,supplies,treasury,members_count,buildings_count,market_count,raw_json)
    VALUES
      ('a','2026-07-14T10:00:00.000Z',10,20,3,4,5,'{}'),
      ('a','2026-07-14T11:00:00.000Z',11,21,4,5,6,'{}'),
      ('b','2026-07-14T09:00:00.000Z',30,40,7,8,9,'{}');
  `);

  applySettlementStateMigration(db);

  assert.deepEqual(db.prepare("SELECT * FROM settlement_state_current ORDER BY claim_id").all(), [
    { claim_id: "a", captured_at: "2026-07-14T11:00:00.000Z", supplies: 11, treasury: 21, members_count: 4, buildings_count: 5, market_count: 6, updated_at: "2026-07-14T11:00:00.000Z" },
    { claim_id: "b", captured_at: "2026-07-14T09:00:00.000Z", supplies: 30, treasury: 40, members_count: 7, buildings_count: 8, market_count: 9, updated_at: "2026-07-14T09:00:00.000Z" },
  ]);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='snapshots'").get(), undefined);
});
```

- [ ] **Step 2: Run migration tests and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/server-schema-bootstrap.test.mjs test/server-schema-migrations.test.mjs test/server-settlement-state.test.mjs
```

Expected: FAIL because `applySettlementStateMigration` and the new table do not exist.

- [ ] **Step 3: Implement the table and migration**

Replace the snapshot bootstrap table with:

```sql
CREATE TABLE IF NOT EXISTS settlement_state_current (
  claim_id TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL,
  supplies REAL,
  treasury REAL,
  members_count INTEGER,
  buildings_count INTEGER,
  market_count INTEGER,
  updated_at TEXT NOT NULL
);
```

Implement `applySettlementStateMigration(db)` so it always creates the current table, detects the legacy table through `sqlite_schema`, then runs this work inside `BEGIN IMMEDIATE`/`COMMIT` with rollback on error:

```sql
INSERT INTO settlement_state_current (
  claim_id, captured_at, supplies, treasury, members_count,
  buildings_count, market_count, updated_at
)
SELECT
  s.claim_id, s.captured_at, s.supplies, s.treasury, s.members_count,
  s.buildings_count, s.market_count, s.captured_at
FROM snapshots s
WHERE NOT EXISTS (
  SELECT 1
  FROM snapshots newer
  WHERE newer.claim_id = s.claim_id
    AND (
      newer.captured_at > s.captured_at
      OR (newer.captured_at = s.captured_at AND newer.id > s.id)
    )
)
ON CONFLICT(claim_id) DO UPDATE SET
  captured_at = excluded.captured_at,
  supplies = excluded.supplies,
  treasury = excluded.treasury,
  members_count = excluded.members_count,
  buildings_count = excluded.buildings_count,
  market_count = excluded.market_count,
  updated_at = excluded.updated_at;
DROP TABLE snapshots;
```

Remove both snapshot index statements. Call the migration after schema bootstrap and before prepared statements are created.

- [ ] **Step 4: Run focused migration tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit the migration**

```powershell
git add apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/src/server/schemaMigrations.mjs apps/bitcraft-local/test/server-schema-bootstrap.test.mjs apps/bitcraft-local/test/server-schema-migrations.test.mjs apps/bitcraft-local/test/server-settlement-state.test.mjs
git commit -m "refactor: migrate snapshots to current state"
```

---

### Task 2: Current-State Activity Collection

**Files:**
- Create: `apps/bitcraft-local/src/server/settlementState.mjs`
- Remove: `apps/bitcraft-local/src/server/snapshotPlanning.mjs`
- Modify: `apps/bitcraft-local/src/server/preparedStatements.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server-prepared-statements.test.mjs`
- Remove: `apps/bitcraft-local/test/server-snapshot-planning.test.mjs`
- Modify: `apps/bitcraft-local/test/server-settlement-state.test.mjs`

**Interfaces:**
- Produces: `settlementStateSummary(payload)` returning `{ claimId, supplies, treasury, membersCount, buildingsCount, marketCount }`.
- Produces: `settlementStateActivityChanges(previous, summary, { supplyMetadata })` with the existing activity-event shape.
- Prepared statements: `getSettlementState`, `upsertSettlementState`.

- [ ] **Step 1: Write failing current-state tests**

Move the pure summary/change tests to the new module and add prepared-statement assertions:

```js
assert.match(statements.getSettlementState.sql, /FROM settlement_state_current/);
assert.match(statements.upsertSettlementState.sql, /ON CONFLICT\(claim_id\) DO UPDATE/);
assert.equal(Object.hasOwn(statements, "latestSnapshot"), false);
assert.equal(Object.hasOwn(statements, "insertSnapshot"), false);
```

Add a boundary assertion that the server transaction reads current state, writes activity events, and then upserts current state without inserting snapshots.

- [ ] **Step 2: Run current-state tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/server-settlement-state.test.mjs test/server-prepared-statements.test.mjs test/server-collector-settings.test.mjs
```

Expected: FAIL because the new module and statements are missing.

- [ ] **Step 3: Implement current-state collection**

Create the pure helper by retaining the existing numeric normalization and change descriptions under current-state names. Replace snapshot statements with:

```js
getSettlementState: db.prepare(`
  SELECT claim_id, captured_at, supplies, treasury, members_count, buildings_count, market_count, updated_at
  FROM settlement_state_current
  WHERE claim_id = ?
`),
upsertSettlementState: db.prepare(`
  INSERT INTO settlement_state_current (
    claim_id, captured_at, supplies, treasury, members_count,
    buildings_count, market_count, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(claim_id) DO UPDATE SET
    captured_at = excluded.captured_at,
    supplies = excluded.supplies,
    treasury = excluded.treasury,
    members_count = excluded.members_count,
    buildings_count = excluded.buildings_count,
    market_count = excluded.market_count,
    updated_at = excluded.updated_at
`),
```

Replace `writeSettlementSnapshot` with `recordSettlementState`. Within one transaction, generate activity only when a previous row exists, then upsert the current values. Call it once after each successful current-data refresh; remove `enqueueSnapshot`, snapshot due gating, and the `snapshotHistory` collector status updates.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit runtime collection**

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/src/server/settlementState.mjs apps/bitcraft-local/src/server/preparedStatements.mjs apps/bitcraft-local/test/server-settlement-state.test.mjs apps/bitcraft-local/test/server-prepared-statements.test.mjs apps/bitcraft-local/test/server-collector-settings.test.mjs
git rm apps/bitcraft-local/src/server/snapshotPlanning.mjs apps/bitcraft-local/test/server-snapshot-planning.test.mjs
git commit -m "refactor: track current settlement baseline"
```

---

### Task 3: Remove Snapshot Backend Surface

**Files:**
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/server/collectorSettings.mjs`
- Modify: `apps/bitcraft-local/src/server/defaultAppSettings.mjs`
- Modify: `apps/bitcraft-local/test/server-collector-settings.test.mjs`
- Modify: `apps/bitcraft-local/test/server-default-app-settings.test.mjs`
- Modify: `apps/bitcraft-local/test/server.test.mjs`
- Modify: `apps/bitcraft-local/test/server-health-boundary.test.mjs`

**Interfaces:**
- Removes `/api/local/snapshots`.
- Removes `snapshots` from `/api/local/history` allowed includes and payloads.
- Removes `snapshot_retention_days`, the prune endpoint, and `snapshotHistory` collector configuration.

- [ ] **Step 1: Write failing backend-removal tests**

Add boundary assertions that the relevant server source contains none of:

```js
for (const legacy of [
  "/api/local/snapshots",
  "snapshotRetentionDays",
  "snapshot_retention_days",
  "maintenance/prune",
  "snapshotHistory(",
  'snapshotHistory: { label:',
]) assert.doesNotMatch(serverSource, new RegExp(escapeRegExp(legacy)));
```

Update integration expectations so `/api/local/history?include=dashboard` contains no snapshots member, and remove direct snapshot endpoint fixtures.

- [ ] **Step 2: Run backend boundary/integration tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/server-collector-settings.test.mjs test/server-default-app-settings.test.mjs test/server-health-boundary.test.mjs test/server.test.mjs
```

Expected: FAIL on remaining legacy routes/settings.

- [ ] **Step 3: Remove the backend surface**

Remove snapshot history functions/routes, retention validation/settings, admin prune route, database counts, and collector ownership. Change `localHistory` default includes to `market` and `activity` only:

```js
const sections = include instanceof Set && include.size
  ? include
  : new Set(["market", "activity"]);
```

Keep the collector label for the live claim domain focused on current settlement data; do not add a replacement history collector.

- [ ] **Step 4: Run focused backend tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit backend removal**

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/src/server/collectorSettings.mjs apps/bitcraft-local/src/server/defaultAppSettings.mjs apps/bitcraft-local/test/server-collector-settings.test.mjs apps/bitcraft-local/test/server-default-app-settings.test.mjs apps/bitcraft-local/test/server-health-boundary.test.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "refactor: remove snapshot backend surface"
```

---

### Task 4: Remove Snapshot Frontend and Admin UI

**Files:**
- Modify: `apps/bitcraft-local/src/api/localHistory.ts`
- Modify: `apps/bitcraft-local/src/api/localHistoryInclude.ts`
- Modify: `apps/bitcraft-local/src/types/app.ts`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/pages/DashboardPage.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/ServerHealthSection.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/adminDisplay.ts`
- Modify: `apps/bitcraft-local/test/local-history.test.mjs`
- Create: `apps/bitcraft-local/test/snapshot-removal-boundary.test.mjs`

**Interfaces:**
- `LocalHistoryState` no longer contains `snapshots`.
- `Dashboard` no longer accepts a `snapshots` prop.
- Dashboard history include becomes `market,activity,dashboard` as required by active widgets.

- [ ] **Step 1: Write failing frontend boundary tests**

Update local-history expectations:

```js
assert.equal(localHistoryIncludeForPanel("dashboard"), "activity,market,dashboard");
```

Create `snapshot-removal-boundary.test.mjs` to read `AppShell.tsx`, `DashboardPage.tsx`, `AdminPanel.tsx`, `ServerHealthSection.tsx`, and `localHistory.ts`. Assert that the Dashboard signature and `AppShell` call do not mention a snapshots prop, local history has no snapshots state, and Admin source has no “Remove Expired Snapshots”, “Snapshot retention”, or snapshot count card.

- [ ] **Step 2: Run frontend boundary tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/local-history.test.mjs test/snapshot-removal-boundary.test.mjs test/dashboard-page-boundary.test.mjs test/appshell-admin-boundary.test.mjs
```

Expected: FAIL on legacy snapshot UI and state.

- [ ] **Step 3: Remove unused frontend state and controls**

Initialize local history without snapshots:

```ts
const [state, setState] = React.useState<LocalHistoryState>({
  market: null,
  activity: [],
  activityTotal: 0,
  dashboard: null,
  error: null,
  refreshToken: 0,
});
```

Remove snapshot parsing, props, comments, retention fields, status cards, maintenance buttons, and collector descriptions. Preserve market/activity/dashboard data loading and every unrelated admin setting.

- [ ] **Step 4: Run focused frontend tests and build**

Run the selected Step 2 tests, then:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests pass; TypeScript and Vite build exit 0.

- [ ] **Step 5: Commit frontend removal**

```powershell
git add apps/bitcraft-local/src/api/localHistory.ts apps/bitcraft-local/src/api/localHistoryInclude.ts apps/bitcraft-local/src/types/app.ts apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/pages/DashboardPage.tsx apps/bitcraft-local/src/components/admin/AdminPanel.tsx apps/bitcraft-local/src/components/admin/ServerHealthSection.tsx apps/bitcraft-local/src/components/admin/adminDisplay.ts apps/bitcraft-local/test/local-history.test.mjs apps/bitcraft-local/test/snapshot-removal-boundary.test.mjs apps/bitcraft-local/test/dashboard-page-boundary.test.mjs apps/bitcraft-local/test/appshell-admin-boundary.test.mjs
git commit -m "refactor: remove snapshot dashboard surface"
```

---

### Task 5: Release Verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/bitcraft-local/package.json`

**Interfaces:**
- Release version: increment the beta counter from the current `0.32.0-beta.N` release.

- [ ] **Step 1: Search for remaining legacy references**

```powershell
rg -n "snapshotHistory|snapshot_retention_days|snapshotRetentionDays|/api/local/snapshots|Remove Expired Snapshots|CREATE TABLE IF NOT EXISTS snapshots|FROM snapshots|INTO snapshots" apps/bitcraft-local
```

Expected: no production references; test fixtures may mention `snapshots` only inside the migration test.

- [ ] **Step 2: Update release metadata**

Add user-facing changelog entries under the new release:

```markdown
### Changed

- Replaced settlement snapshot history with one current settlement baseline while preserving Activity history.

### Removed

- Removed unused snapshot history APIs, retention controls, and Dashboard loading.
```

Increment `apps/bitcraft-local/package.json` to the same beta version.

- [ ] **Step 3: Run complete verification**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm --filter @workspace/bitcraft-local run build
git diff --check
```

Expected: zero test failures, successful build, and no whitespace errors.

- [ ] **Step 4: Commit the release**

```powershell
git add CHANGELOG.md apps/bitcraft-local/package.json
git commit -m "chore: release current settlement state"
```

- [ ] **Step 5: Push main after verification**

```powershell
git push origin HEAD:main
```

Expected: GitHub `main` advances to the verified release commit.

---

### Task 6: VPS Backup, Migration, Cleanup, and Smoke Check

**Files:**
- Create on VPS: `/var/lib/bitcraft-claim-monitor/backups/bitcraft-local-pre-current-state-20260714.sqlite`
- Modify through deployment: `/var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite`

**Interfaces:**
- Uses existing `update-bitcraft-monitor` deployment helper.
- Keeps `/var/lib/bitcraft-claim-monitor/backups/bitcraft-local-pre-snapshot-compact-20260714.sqlite` unchanged.

- [ ] **Step 1: Record the expected newest state and create a fresh backup**

With Caddy, web, and worker stopped under a restoration trap, checkpoint WAL and record:

```sql
SELECT claim_id, captured_at, supplies, treasury, members_count, buildings_count, market_count
FROM snapshots
ORDER BY captured_at DESC, id DESC
LIMIT 1;
```

Copy the checkpointed database with preserved owner/mode to:

```text
/var/lib/bitcraft-claim-monitor/backups/bitcraft-local-pre-current-state-20260714.sqlite
```

Restart services if the backup step fails.

- [ ] **Step 2: Deploy the release**

```bash
update-bitcraft-monitor
```

Expected: updater reports the new version, web and worker active, local health `ok=true`, and public HTTP 200.

- [ ] **Step 3: Verify migration data before vacuuming**

Run read-only SQL and compare it with Step 1:

```sql
SELECT * FROM settlement_state_current;
SELECT COUNT(*) AS legacy_tables
FROM sqlite_schema
WHERE type = 'table' AND name = 'snapshots';
PRAGMA integrity_check;
```

Expected: current row matches the newest legacy row, `legacy_tables = 0`, and integrity is `ok`.

- [ ] **Step 4: Reclaim database space**

Stop Caddy, web, and worker under a restoration trap. Run `PRAGMA wal_checkpoint(TRUNCATE)`, switch temporarily to delete journal mode, run `VACUUM`, restore WAL, preserve `bitcraft:bitcraft` ownership and mode `600`, and restart all services.

- [ ] **Step 5: Run production smoke checks**

Verify:

```bash
systemctl is-active caddy.service bitcraft-claim-monitor.service bitcraft-claim-monitor-worker.service
curl -fsS --max-time 10 http://127.0.0.1:18430/api/local/health
curl -fsS --max-time 60 'http://127.0.0.1:18430/api/local/craft-plan?claimId=1369094286777412590' >/dev/null
free -h
```

Also confirm `settlement_state_current` has one row, no new `snapshots` table appears after a worker interval, recent warning journals are empty or understood, and the database file is materially smaller.

- [ ] **Step 6: Retain backups pending user acceptance**

Do not delete either VPS backup during this rollout. Report both paths and sizes so the user can authorize their later removal.
