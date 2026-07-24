# Empire Membership History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator-only Empire Membership page that records compact locally observed join, departure, and rejoin periods for the configured settlement's empire.

**Architecture:** A dedicated `empireMembership.mjs` repository owns roster validation, transactional period synchronization, retention, and read models. The existing background collector fetches the current empire roster every 60 seconds and feeds the repository without storing roster snapshots. A read-only authenticated admin endpoint supplies a focused React admin section with local search and 30-day/all-retained filters.

**Tech Stack:** Node.js 24+, `node:sqlite` `DatabaseSync`, Node HTTP server, React, TypeScript, Vite, plain CSS, Node test runner, pnpm.

## Global Constraints

- Work only in `apps/bitcraft-local` plus the approved design and plan documents.
- Use the BitJita empire detail endpoint as the current-roster source; do not treat claim membership `createdAt` as an empire join timestamp.
- Initial members must display **Present when tracking began** and must not receive fabricated join dates.
- Store membership periods and tracking sessions only; never store recurring roster snapshots or raw empire responses.
- Require two consecutive successful complete omissions before confirming a departure.
- Failed, partial, malformed, or suspiciously empty responses must not change membership periods.
- Retain ended periods for exactly 365 days and run cleanup no more than once every seven days.
- Preserve open periods indefinitely and never run automatic `VACUUM`.
- Show only the currently configured empire and require an authenticated administrator for every membership-history response.
- Do not add dependencies, Discord notifications, exports, pagination, changelog entries, or version changes in this implementation.

---

## File Structure

### Create

- `apps/bitcraft-local/src/server/empireMembership.mjs` — roster normalization, transactional repository, retention, diagnostics, and admin read model.
- `apps/bitcraft-local/src/components/admin/AdminEmpireMembershipSection.tsx` — presentational admin membership page with search, filters, summaries, and states.
- `apps/bitcraft-local/src/styles/admin-empire-membership.css` — focused responsive styles for the new admin page.
- `apps/bitcraft-local/test/server-empire-membership.test.mjs` — repository, synchronization, retention, and read-model tests.
- `apps/bitcraft-local/test/admin-empire-membership-boundary.test.mjs` — frontend composition, copy, and layout boundary checks.

### Modify

- `apps/bitcraft-local/src/server/schemaBootstrap.mjs` — additive membership tables and indexes.
- `apps/bitcraft-local/src/server/collectorSettings.mjs` — dedicated 60-second side-effect collector configuration.
- `apps/bitcraft-local/src/server/adminPermissions.mjs` — explicit read permission for the admin endpoint.
- `apps/bitcraft-local/src/settingsDefaults.ts` — frontend default collector setting.
- `apps/bitcraft-local/src/components/admin/adminDisplay.ts` — administrator-facing collector purpose.
- `apps/bitcraft-local/src/components/admin/AdminPanel.tsx` — Insights tab registration, data loading, and component composition.
- `apps/bitcraft-local/server.mjs` — repository initialization, collector execution, diagnostics shaping, and authenticated route.
- `apps/bitcraft-local/test/server-schema-bootstrap.test.mjs` — schema contract.
- `apps/bitcraft-local/test/server-collector-settings.test.mjs` — collector defaults and cadence.
- `apps/bitcraft-local/test/server-admin-permissions.test.mjs` — least-privilege endpoint mapping.
- `apps/bitcraft-local/test/admin-sections-boundary.test.mjs` — focused component ownership.
- `apps/bitcraft-local/test/server.test.mjs` — end-to-end collection and authenticated API coverage.

---

### Task 1: Add the additive membership schema

**Files:**

- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
- Modify: `apps/bitcraft-local/test/server-schema-bootstrap.test.mjs`

**Interfaces:**

- Produces tables `empire_membership_tracking` and `empire_membership_periods`.
- Produces indexes used by `createEmpireMembershipRepository(db)` in Task 2.

- [ ] **Step 1: Write the failing schema contract**

Add these fragments to the existing critical-schema test and add a real in-memory migration assertion:

```js
import { DatabaseSync } from "node:sqlite";

for (const fragment of [
  "CREATE TABLE IF NOT EXISTS empire_membership_tracking",
  "CREATE TABLE IF NOT EXISTS empire_membership_periods",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_empire_membership_active_tracking",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_empire_membership_open_period",
  "CREATE INDEX IF NOT EXISTS idx_empire_membership_current",
  "CREATE INDEX IF NOT EXISTS idx_empire_membership_departures",
  "CREATE INDEX IF NOT EXISTS idx_empire_membership_retention",
]) {
  assert.match(schemaBootstrapSql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

test("membership history schema is additive and preserves existing data", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.prepare("INSERT INTO app_settings VALUES (?, ?, ?)").run("claim_id", "123", "2026-07-24T00:00:00.000Z");

  applySchemaBootstrap(db);
  applySchemaBootstrap(db);

  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'claim_id'").get().value, "123");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM empire_membership_tracking").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM empire_membership_periods").get().count, 0);
  db.close();
});
```

- [ ] **Step 2: Run the schema test and confirm it fails**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-schema-bootstrap.test.mjs
```

Expected: FAIL because the two tables and membership indexes are absent.

- [ ] **Step 3: Add the tables and indexes to the bootstrap SQL**

Add the following tables near the other server-owned operational history tables:

```sql
CREATE TABLE IF NOT EXISTS empire_membership_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empire_id TEXT NOT NULL,
  empire_name TEXT NOT NULL,
  tracking_started_at TEXT NOT NULL,
  last_success_at TEXT,
  tracking_ended_at TEXT,
  initial_roster_complete INTEGER NOT NULL DEFAULT 0,
  last_cleanup_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS empire_membership_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_session_id INTEGER NOT NULL,
  empire_id TEXT NOT NULL,
  player_entity_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  observed_joined_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_missing_at TEXT,
  observed_left_at TEXT,
  departure_confirmed_at TEXT,
  period_ended_at TEXT,
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('departure', 'tracking_ended')),
  initial_roster INTEGER NOT NULL DEFAULT 0,
  rejoin INTEGER NOT NULL DEFAULT 0,
  missing_checks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tracking_session_id) REFERENCES empire_membership_tracking(id)
);
```

Add these indexes with the existing index declarations:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_empire_membership_active_tracking
  ON empire_membership_tracking ((1))
  WHERE tracking_ended_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_empire_membership_open_period
  ON empire_membership_periods (tracking_session_id, player_entity_id)
  WHERE period_ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_empire_membership_current
  ON empire_membership_periods (tracking_session_id, period_ended_at, observed_joined_at DESC, player_name);

CREATE INDEX IF NOT EXISTS idx_empire_membership_departures
  ON empire_membership_periods (empire_id, end_reason, observed_left_at DESC, player_entity_id);

CREATE INDEX IF NOT EXISTS idx_empire_membership_retention
  ON empire_membership_periods (period_ended_at)
  WHERE period_ended_at IS NOT NULL;
```

- [ ] **Step 4: Run the schema test and confirm it passes**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-schema-bootstrap.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the schema**

```powershell
git add apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/test/server-schema-bootstrap.test.mjs
git commit -m "feat: add empire membership history schema"
```

---

### Task 2: Implement roster normalization and membership synchronization

**Files:**

- Create: `apps/bitcraft-local/src/server/empireMembership.mjs`
- Create: `apps/bitcraft-local/test/server-empire-membership.test.mjs`

**Interfaces:**

- Produces `normalizeEmpireMembershipRoster(payload, expectedEmpireId)`.
- Produces `createEmpireMembershipRepository(db)`.
- Repository methods:

```ts
syncRoster(input: {
  empireId: string;
  empireName: string;
  members: Array<{ playerEntityId: string; playerName: string }>;
  observedAt: string;
}): {
  sessionId: number;
  initialRoster: boolean;
  created: number;
  updated: number;
  suspected: number;
  closed: number;
  pruned: number;
  currentMembers: number;
};

stopTracking(input: { observedAt: string }): { stopped: boolean; endedPeriods: number };
adminView(input: { now: string }): EmpireMembershipAdminView;
```

- Consumed by the collector and API in Tasks 3 and 4.

- [ ] **Step 1: Write failing normalization and baseline tests**

Create the test file with an in-memory database helper:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  createEmpireMembershipRepository,
  normalizeEmpireMembershipRoster,
} from "../src/server/empireMembership.mjs";

function repository() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  return { db, repository: createEmpireMembershipRepository(db) };
}

const initialPayload = {
  empire: { entityId: "empire-1", name: "Cairn" },
  members: [
    { entityId: "player-1", playerName: "Alice" },
    { playerEntityId: "player-2", username: "Bob" },
  ],
};

test("normalization requires a complete non-empty matching roster", () => {
  assert.deepEqual(normalizeEmpireMembershipRoster(initialPayload, "empire-1"), {
    empireId: "empire-1",
    empireName: "Cairn",
    members: [
      { playerEntityId: "player-1", playerName: "Alice" },
      { playerEntityId: "player-2", playerName: "Bob" },
    ],
  });
  assert.throws(() => normalizeEmpireMembershipRoster({}, "empire-1"), /member roster/i);
  assert.throws(() => normalizeEmpireMembershipRoster({ empire: { entityId: "empire-1" }, members: [] }, "empire-1"), /empty/i);
  assert.throws(() => normalizeEmpireMembershipRoster({ ...initialPayload, partial: true }, "empire-1"), /partial/i);
  assert.throws(() => normalizeEmpireMembershipRoster(initialPayload, "empire-2"), /does not match/i);
});

test("first synchronization establishes an initial roster without join dates", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  const result = repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:00:00.000Z" });
  const rows = db.prepare("SELECT * FROM empire_membership_periods ORDER BY player_entity_id").all();

  assert.equal(result.initialRoster, true);
  assert.equal(result.created, 2);
  assert.deepEqual(rows.map((row) => ({
    player: row.player_entity_id,
    initial: row.initial_roster,
    joined: row.observed_joined_at,
    ended: row.period_ended_at,
  })), [
    { player: "player-1", initial: 1, joined: null, ended: null },
    { player: "player-2", initial: 1, joined: null, ended: null },
  ]);
  db.close();
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-empire-membership.test.mjs
```

Expected: FAIL because `empireMembership.mjs` does not exist.

- [ ] **Step 3: Implement strict roster normalization**

Create `empireMembership.mjs` with these constants and normalization rules:

```js
export const EMPIRE_MEMBERSHIP_RETENTION_DAYS = 365;
export const EMPIRE_MEMBERSHIP_CLEANUP_INTERVAL_DAYS = 7;

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeEmpireMembershipRoster(payload, expectedEmpireId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Empire member roster response is invalid");
  }
  if (payload.partial === true || (Array.isArray(payload.errors) && payload.errors.length)) {
    throw new Error("Empire member roster response is partial");
  }
  if (!Array.isArray(payload.members)) {
    throw new Error("Empire member roster is missing");
  }
  if (payload.members.length === 0) {
    throw new Error("Empire member roster is unexpectedly empty");
  }

  const empire = payload.empire && typeof payload.empire === "object" ? payload.empire : {};
  const empireId = text(empire.entityId ?? empire.id ?? expectedEmpireId);
  if (!empireId || empireId !== text(expectedEmpireId)) {
    throw new Error("Empire member roster does not match the configured empire");
  }

  const members = new Map();
  for (const member of payload.members) {
    const playerEntityId = text(member?.entityId ?? member?.playerEntityId ?? member?.id);
    const playerName = text(member?.playerName ?? member?.username ?? member?.userName);
    if (!playerEntityId || !playerName) {
      throw new Error("Empire member roster contains an invalid member");
    }
    members.set(playerEntityId, { playerEntityId, playerName });
  }

  return {
    empireId,
    empireName: text(empire.name) || "Unknown empire",
    members: [...members.values()].sort((a, b) => a.playerEntityId.localeCompare(b.playerEntityId)),
  };
}
```

- [ ] **Step 4: Implement transactional baseline and unchanged-roster synchronization**

Create prepared statements inside `createEmpireMembershipRepository(db)` for:

- active tracking session lookup;
- session insert/update/end;
- open-period lookup;
- previous-period existence;
- period insert;
- current-member update/reset;
- first-missing update;
- departure close;
- tracking-ended close;
- cleanup;
- current and departure read queries.

Use one explicit transaction helper:

```js
function transaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
```

The baseline branch must insert a tracking session, create initial periods with `observed_joined_at = null`, and mark `initial_roster_complete = 1` in the same transaction. The unchanged branch must update `player_name`, `last_seen_at`, reset `first_missing_at` and `missing_checks`, and insert no additional period.

Return exact counters from the transaction so collector diagnostics do not query or expose raw rows.

- [ ] **Step 5: Add and pass an unchanged-roster test**

Add:

```js
test("unchanged rosters update in place and preserve the baseline", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:00:00.000Z" });
  const result = repo.syncRoster({
    ...roster,
    members: roster.members.map((member) => member.playerEntityId === "player-1" ? { ...member, playerName: "Alice Renamed" } : member),
    observedAt: "2026-07-24T12:01:00.000Z",
  });

  assert.equal(result.created, 0);
  assert.equal(result.updated, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM empire_membership_periods").get().count, 2);
  assert.equal(db.prepare("SELECT player_name FROM empire_membership_periods WHERE player_entity_id = 'player-1'").get().player_name, "Alice Renamed");
  db.close();
});
```

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-empire-membership.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the baseline repository**

```powershell
git add apps/bitcraft-local/src/server/empireMembership.mjs apps/bitcraft-local/test/server-empire-membership.test.mjs
git commit -m "feat: track empire membership periods"
```

---

### Task 3: Complete departure, rejoin, session, retention, and read-model behavior

**Files:**

- Modify: `apps/bitcraft-local/src/server/empireMembership.mjs`
- Modify: `apps/bitcraft-local/test/server-empire-membership.test.mjs`

**Interfaces:**

- Completes the repository API introduced in Task 2.
- `adminView({ now })` returns:

```ts
type EmpireMembershipAdminView = {
  tracking: null | {
    sessionId: number;
    empireId: string;
    empireName: string;
    trackingStartedAt: string;
    lastSuccessAt: string | null;
  };
  summary: {
    currentMembers: number;
    joinedLast30Days: number;
    departedLast30Days: number;
    rejoinsLast30Days: number;
  };
  currentMembers: Array<{
    id: number;
    playerEntityId: string;
    playerName: string;
    membershipStatus: "initial" | "joined" | "rejoined";
    observedJoinedAt: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  departedMembers: Array<{
    id: number;
    playerEntityId: string;
    playerName: string;
    observedLeftAt: string;
    departureConfirmedAt: string;
    previousStatus: "joined" | "rejoined";
  }>;
  retentionDays: 365;
  generatedAt: string;
};
```

- [ ] **Step 1: Write failing transition tests**

Add tests covering the complete state machine:

```js
test("departures require two complete omissions and recovery cancels suspicion", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:00:00.000Z" });

  const aliceOnly = { ...roster, members: roster.members.filter((member) => member.playerEntityId === "player-1") };
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-24T12:01:00.000Z" });
  assert.equal(db.prepare("SELECT missing_checks FROM empire_membership_periods WHERE player_entity_id = 'player-2'").get().missing_checks, 1);

  repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:02:00.000Z" });
  assert.equal(db.prepare("SELECT missing_checks FROM empire_membership_periods WHERE player_entity_id = 'player-2'").get().missing_checks, 0);

  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-24T12:03:00.000Z" });
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-24T12:04:00.000Z" });
  const departed = db.prepare("SELECT * FROM empire_membership_periods WHERE player_entity_id = 'player-2'").get();
  assert.equal(departed.observed_left_at, "2026-07-24T12:03:00.000Z");
  assert.equal(departed.departure_confirmed_at, "2026-07-24T12:04:00.000Z");
  assert.equal(departed.end_reason, "departure");
  db.close();
});

test("a confirmed return creates a rejoin and hides the old departure", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  const aliceOnly = { ...roster, members: roster.members.filter((member) => member.playerEntityId === "player-1") };
  repo.syncRoster({ ...roster, observedAt: "2026-07-01T12:00:00.000Z" });
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-02T12:00:00.000Z" });
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-02T12:01:00.000Z" });
  repo.syncRoster({ ...roster, observedAt: "2026-07-03T12:00:00.000Z" });

  const periods = db.prepare("SELECT * FROM empire_membership_periods WHERE player_entity_id = 'player-2' ORDER BY id").all();
  assert.equal(periods.length, 2);
  assert.equal(periods[1].rejoin, 1);
  assert.equal(periods[1].observed_joined_at, "2026-07-03T12:00:00.000Z");
  assert.equal(repo.adminView({ now: "2026-07-24T12:00:00.000Z" }).departedMembers.length, 0);
  db.close();
});
```

- [ ] **Step 2: Run the tests and confirm the transition cases fail**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-empire-membership.test.mjs
```

Expected: FAIL on missing departure/rejoin behavior.

- [ ] **Step 3: Implement the two-check state machine**

Within `syncRoster`:

```js
for (const period of openPeriods) {
  const member = currentMembers.get(period.player_entity_id);
  if (member) {
    statements.markSeen.run(member.playerName, observedAt, observedAt, period.id);
    updated += 1;
    continue;
  }
  if (Number(period.missing_checks) < 1) {
    statements.markFirstMissing.run(observedAt, observedAt, period.id);
    suspected += 1;
    continue;
  }
  const leftAt = period.first_missing_at || observedAt;
  statements.confirmDeparture.run(leftAt, observedAt, leftAt, observedAt, period.id);
  closed += 1;
}
```

For every current member without an open period, insert a period with `rejoin = 1` when `previousPeriodExists.get(empireId, playerEntityId)` returns a row. Use `observedAt` for `observed_joined_at`, `first_seen_at`, and `last_seen_at`.

- [ ] **Step 4: Add failing session-boundary and retention tests**

```js
test("changing empire ends the prior session without recording departures", () => {
  const { db, repository: repo } = repository();
  const cairn = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...cairn, observedAt: "2026-07-24T12:00:00.000Z" });
  repo.syncRoster({
    empireId: "empire-2",
    empireName: "Second Empire",
    members: [{ playerEntityId: "player-9", playerName: "Nina" }],
    observedAt: "2026-07-24T13:00:00.000Z",
  });

  const oldRows = db.prepare("SELECT end_reason, observed_left_at FROM empire_membership_periods WHERE empire_id = 'empire-1'").all();
  assert.equal(oldRows.every((row) => row.end_reason === "tracking_ended" && row.observed_left_at === null), true);
  assert.equal(repo.adminView({ now: "2026-07-24T13:01:00.000Z" }).tracking.empireId, "empire-2");
  db.close();
});

test("weekly cleanup removes only ended periods older than 365 days", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...roster, observedAt: "2025-07-01T00:00:00.000Z" });
  repo.stopTracking({ observedAt: "2025-07-02T00:00:00.000Z" });
  const result = repo.syncRoster({ ...roster, observedAt: "2026-07-24T00:00:00.000Z" });
  assert.equal(result.pruned, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM empire_membership_periods WHERE period_ended_at IS NULL").get().count, 2);
  db.close();
});
```

- [ ] **Step 5: Implement session ending, bounded cleanup, and the read model**

Implement `stopTracking` so it:

1. starts a transaction;
2. closes all open periods in the active session with `period_ended_at = observedAt`, `end_reason = 'tracking_ended'`, and `observed_left_at = null`;
3. sets `tracking_ended_at = observedAt`;
4. returns the number of ended periods.

When `syncRoster` receives a different empire ID, call the same private end-session operation inside the current transaction, then create a new baseline session.

Cleanup is due only when `MAX(last_cleanup_at)` across all tracking sessions is null or at least seven days old. This keeps cleanup globally bounded even if the configured settlement changes empire. Delete:

```sql
DELETE FROM empire_membership_periods
WHERE period_ended_at IS NOT NULL
  AND period_ended_at < ?
```

Use `new Date(Date.parse(observedAt) - 365 * 24 * 60 * 60 * 1000).toISOString()` as the cutoff, then update `last_cleanup_at` on the active session.

Build `adminView` from the active session:

- current rows are open periods for the active session;
- observed joins/rejoins sort newest first;
- initial rows sort after observed rows by player name;
- departure candidates are `end_reason = 'departure'` for the active empire;
- remove candidates whose player has an open period in the active session;
- retain only the latest departure per currently absent player;
- calculate 30-day summary counts from the returned rows and current periods.

- [ ] **Step 6: Run repository tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-empire-membership.test.mjs
```

Expected: all repository tests PASS.

- [ ] **Step 7: Commit the completed state machine**

```powershell
git add apps/bitcraft-local/src/server/empireMembership.mjs apps/bitcraft-local/test/server-empire-membership.test.mjs
git commit -m "feat: record empire departures and rejoins"
```

---

### Task 4: Integrate the dedicated background collector

**Files:**

- Modify: `apps/bitcraft-local/src/server/collectorSettings.mjs`
- Modify: `apps/bitcraft-local/src/settingsDefaults.ts`
- Modify: `apps/bitcraft-local/src/components/admin/adminDisplay.ts`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server-collector-settings.test.mjs`
- Modify: `apps/bitcraft-local/test/server.test.mjs`

**Interfaces:**

- Consumes `normalizeEmpireMembershipRoster` and `createEmpireMembershipRepository`.
- Produces collector key `empireMembership`.
- Produces safe collector diagnostics for Task 5's admin API.

- [ ] **Step 1: Write failing collector-setting tests**

Add:

```js
test("empire membership tracking has an independent bounded cadence", () => {
  assert.deepEqual(domainCollectorDefaults.empireMembership, {
    label: "Empire membership history",
    intervalSeconds: 60,
  });
  const normalized = normalizeCollectorSettings({
    empireMembership: { enabled: true, intervalSeconds: 5 },
  });
  assert.deepEqual(normalized.empireMembership, {
    label: "Empire membership history",
    enabled: true,
    intervalSeconds: 15,
  });
});
```

In the server integration fixture, add a counter for `/api/empires/empire-1` and, immediately after the existing authenticated `collect-now` call, inspect the test database:

```js
const trackedMembership = await waitForCondition("empire membership baseline", () => writeDatabaseWithRetry(dbPath, (database) => {
  const tracking = database.prepare("SELECT empire_id, empire_name, initial_roster_complete FROM empire_membership_tracking WHERE tracking_ended_at IS NULL").get();
  const periods = database.prepare("SELECT COUNT(*) AS count FROM empire_membership_periods WHERE period_ended_at IS NULL").get();
  return tracking && Number(periods?.count) === 4 ? { tracking, count: Number(periods.count) } : null;
}));
assert.deepEqual(trackedMembership, {
  tracking: { empire_id: "empire-1", empire_name: "Test Empire", initial_roster_complete: 1 },
  count: 4,
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-collector-settings.test.mjs test/server.test.mjs
```

Expected: FAIL because the collector and endpoint are not registered.

- [ ] **Step 3: Register the collector defaults and operator copy**

Add to both server and frontend defaults:

```js
empireMembership: { label: "Empire membership history", intervalSeconds: 60 },
```

```ts
empireMembership: { label: "Empire membership history", enabled: true, intervalSeconds: 60 },
```

Add this purpose to `COLLECTOR_PURPOSES`:

```ts
empireMembership: "Records compact observed empire joins, confirmed departures, and rejoins without storing roster snapshots.",
```

Do not add the tables to `collectorCurrentTables`, because its existing counter assumes every table is keyed by `claim_id`. The collector will publish its own safe counts from repository results.

- [ ] **Step 4: Initialize the repository and add the collector runner**

Import and initialize once beside the other server repositories:

```js
import {
  createEmpireMembershipRepository,
  normalizeEmpireMembershipRoster,
} from "./src/server/empireMembership.mjs";

const empireMembershipRepository = createEmpireMembershipRepository(db);
```

Add:

```js
function claimEmpireId(claim) {
  return String(claim?.empireEntityId ?? claim?.empireId ?? "").trim();
}

async function runEmpireMembershipCollector(claim, force = false) {
  const key = "empireMembership";
  if (!sideEffectCollectorDue(key, force)) return;
  const startedAt = collectorAttempt(key, "Fetching current empire roster");
  const observedAt = new Date().toISOString();
  try {
    const empireId = claimEmpireId(claim);
    if (!empireId) {
      const stopped = empireMembershipRepository.stopTracking({ observedAt });
      setCollectorStatus(key, { rowCount: 0, trackingStopped: stopped.stopped });
      collectorSuccess(key, startedAt);
      return;
    }
    const payload = await fetchBitjita(`/empires/${encodeURIComponent(empireId)}`, {
      timeoutMs: Math.min(8000, BITJITA_FETCH_TIMEOUT_MS),
      forceRefresh: true,
    });
    const roster = normalizeEmpireMembershipRoster(payload, empireId);
    const result = empireMembershipRepository.syncRoster({ ...roster, observedAt });
    setCollectorStatus(key, {
      rowCount: result.currentMembers,
      currentEmpireId: roster.empireId,
      currentEmpireName: roster.empireName,
      created: result.created,
      updated: result.updated,
      suspectedDepartures: result.suspected,
      confirmedDepartures: result.closed,
      pruned: result.pruned,
    });
    collectorSuccess(key, startedAt);
  } catch (error) {
    collectorFailure(key, startedAt, error);
    console.warn(`Empire membership collection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

Call it after current claim state is recorded and before unrelated side-effect collectors:

```js
recordSettlementState({ claimId, claim, membersCount: members.length, buildingsCount: buildings.length, market: currentData.market ?? { listings: [] } });
await runEmpireMembershipCollector(claim, force);
await runMarketListingsCollector(claimId, currentData, force);
```

The runner catches its own failure so a membership-history warning cannot stop storage, market, production, or Discord collection.

- [ ] **Step 5: Run collector and integration tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-collector-settings.test.mjs test/server-empire-membership.test.mjs test/server.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the collector**

```powershell
git add apps/bitcraft-local/src/server/collectorSettings.mjs apps/bitcraft-local/src/settingsDefaults.ts apps/bitcraft-local/src/components/admin/adminDisplay.ts apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server-collector-settings.test.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: collect current empire membership"
```

---

### Task 5: Add the authenticated admin read endpoint

**Files:**

- Modify: `apps/bitcraft-local/src/server/adminPermissions.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server-admin-permissions.test.mjs`
- Modify: `apps/bitcraft-local/test/server.test.mjs`

**Interfaces:**

- Consumes `empireMembershipRepository.adminView({ now })`.
- Produces `GET /api/local/admin/empire-membership`.
- Returns the `EmpireMembershipAdminView` from Task 3 plus safe collector status.

- [ ] **Step 1: Add failing permission and authentication assertions**

Add:

```js
assert.equal(
  adminPermissionFor("GET", "/api/local/admin/empire-membership"),
  "status.view",
);
```

In `server.test.mjs`, add:

```js
const anonymousMembership = await fetch(`${origin}/api/local/admin/empire-membership`, {
  headers: { origin },
});
assert.equal(anonymousMembership.status, 401);

const viewerMembership = await fetch(`${origin}/api/local/admin/empire-membership`, {
  headers: { cookie: viewerCookie, origin },
});
assert.equal(viewerMembership.status, 200);
const viewerMembershipBody = await viewerMembership.json();
assert.equal(viewerMembershipBody.tracking.empireId, "empire-1");
assert.equal(Object.hasOwn(viewerMembershipBody, "adminUsers"), false);
assert.equal(Object.hasOwn(viewerMembershipBody, "settings"), false);

const ownerMembership = await fetch(`${origin}/api/local/admin/empire-membership`, {
  headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
});
assert.equal(ownerMembership.status, 200);
const ownerMembershipBody = await ownerMembership.json();
assert.equal(ownerMembershipBody.tracking.empireName, "Test Empire");
assert.equal(ownerMembershipBody.summary.currentMembers, 4);
assert.equal(ownerMembershipBody.currentMembers.every((member) => member.membershipStatus === "initial"), true);
```

- [ ] **Step 2: Run tests and confirm the explicit mapping or route fails**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-admin-permissions.test.mjs test/server.test.mjs
```

Expected: FAIL until the mapping and route exist.

- [ ] **Step 3: Add the least-privilege permission mapping**

Add before the default permission:

```js
if (pathname === "/api/local/admin/empire-membership") return "status.view";
```

This makes the page available to every authenticated administrator role while keeping it inside the existing admin authentication and same-origin boundary.

- [ ] **Step 4: Add a safe response shaper and route**

Add:

```js
function empireMembershipAdminPayload() {
  const view = empireMembershipRepository.adminView({ now: new Date().toISOString() });
  const status = pollStatus.collectors.empireMembership ?? {};
  return {
    ...view,
    collector: {
      enabled: status.enabled !== false,
      running: status.running === true,
      lastAttemptAt: status.lastAttemptAt ?? null,
      lastSuccessAt: status.lastSuccessAt ?? view.tracking?.lastSuccessAt ?? null,
      lastError: status.lastError ?? null,
      nextRunAt: status.nextRunAt ?? null,
    },
  };
}
```

Inside the authenticated `/api/local/admin/` route block, add:

```js
if (req.method === "GET" && url.pathname === "/api/local/admin/empire-membership") {
  return send(res, 200, empireMembershipAdminPayload());
}
```

- [ ] **Step 5: Run permission and route tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-admin-permissions.test.mjs test/server.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the admin endpoint**

```powershell
git add apps/bitcraft-local/src/server/adminPermissions.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server-admin-permissions.test.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: expose admin empire membership history"
```

---

### Task 6: Build the Empire Membership admin section

**Files:**

- Create: `apps/bitcraft-local/src/components/admin/AdminEmpireMembershipSection.tsx`
- Create: `apps/bitcraft-local/src/styles/admin-empire-membership.css`
- Create: `apps/bitcraft-local/test/admin-empire-membership-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/test/admin-sections-boundary.test.mjs`

**Interfaces:**

- Consumes the endpoint response from Task 5 as `data`.
- Receives explicit pending, error, and refresh props:

```ts
type AdminEmpireMembershipSectionProps = {
  data: EmpireMembershipAdminView | null;
  pending: boolean;
  error?: string | null;
  onRefresh: () => void;
};
```

- [ ] **Step 1: Write the failing frontend boundary tests**

Create:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
const componentUrl = new URL("../src/components/admin/AdminEmpireMembershipSection.tsx", import.meta.url);
const stylesUrl = new URL("../src/styles/admin-empire-membership.css", import.meta.url);

test("AdminPanel exposes a focused Empire Membership Insights tab", () => {
  assert.equal(existsSync(componentUrl), true);
  assert.match(panel, /type AdminTab = [^;]*"empire-membership"/);
  assert.match(panel, /key: "empire-membership", label: "Empire Membership"/);
  assert.match(panel, /<AdminEmpireMembershipSection\b/);
});

test("membership page uses clear observed-history copy and bounded controls", () => {
  const component = readFileSync(componentUrl, "utf8");
  assert.match(component, /Present when tracking began/);
  assert.match(component, /Joined in last 30 days/);
  assert.match(component, /All current members/);
  assert.match(component, /Departed in last 30 days/);
  assert.match(component, /All retained departures/);
  assert.match(component, /Rejoined/);
  assert.doesNotMatch(component, /claim.*createdAt/i);
});

test("membership admin layout is responsive and does not require horizontal page scrolling", () => {
  const styles = readFileSync(stylesUrl, "utf8");
  assert.match(styles, /\.empire-membership-grid\s*\{[^}]*grid-template-columns/s);
  assert.match(styles, /minmax\(0,\s*1fr\)/);
  assert.match(styles, /@media\s*\(max-width:/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
});
```

Extend `admin-sections-boundary.test.mjs`:

```js
empireMembership: new URL("../src/components/admin/AdminEmpireMembershipSection.tsx", import.meta.url),
```

and assert its import and composition in `AdminPanel`.

- [ ] **Step 2: Run boundary tests and confirm they fail**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/admin-empire-membership-boundary.test.mjs test/admin-sections-boundary.test.mjs
```

Expected: FAIL because the tab and component do not exist.

- [ ] **Step 3: Create the focused presentational component**

Import its CSS directly from the component:

```tsx
import React from "react";
import { AlertTriangle, History, LogIn, LogOut, RefreshCw, RotateCcw, Users } from "lucide-react";
import "../../styles/admin-empire-membership.css";
import { DataTable } from "../main/DataTable";
import { SearchBox } from "../main/SearchBox";
import { Segmented } from "../main/Segmented";
import { Stat } from "../main/Stats";
import { AsyncState } from "../main/AsyncState";
import { dateLabel, formatNumber } from "../../utils/format";
```

Define stable row types matching Task 3. Use component-local state:

```tsx
type CurrentMember = {
  id: number;
  playerEntityId: string;
  playerName: string;
  membershipStatus: "initial" | "joined" | "rejoined";
  observedJoinedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

type DepartedMember = {
  id: number;
  playerEntityId: string;
  playerName: string;
  observedLeftAt: string;
  departureConfirmedAt: string;
  previousStatus: "joined" | "rejoined";
};

type EmpireMembershipAdminView = {
  tracking: null | {
    sessionId: number;
    empireId: string;
    empireName: string;
    trackingStartedAt: string;
    lastSuccessAt: string | null;
  };
  summary: {
    currentMembers: number;
    joinedLast30Days: number;
    departedLast30Days: number;
    rejoinsLast30Days: number;
  };
  currentMembers: CurrentMember[];
  departedMembers: DepartedMember[];
  retentionDays: number;
  generatedAt: string;
  collector: {
    enabled: boolean;
    running: boolean;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    nextRunAt: string | null;
  };
};

const [search, setSearch] = React.useState("");
const [currentRange, setCurrentRange] = React.useState<"30" | "all">("30");
const [departedRange, setDepartedRange] = React.useState<"30" | "all">("30");
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
const query = search.trim().toLowerCase();

const currentRows = (data?.currentMembers ?? []).filter((member) => {
  if (query && !member.playerName.toLowerCase().includes(query)) return false;
  if (currentRange === "all") return true;
  return member.observedJoinedAt != null && Date.parse(member.observedJoinedAt) >= cutoff;
});

const departedRows = (data?.departedMembers ?? []).filter((member) => {
  if (query && !member.playerName.toLowerCase().includes(query)) return false;
  return departedRange === "all" || Date.parse(member.observedLeftAt) >= cutoff;
});
```

Render:

- a warning banner when `collector.lastError` exists while retained data remains;
- an `AsyncState` loading state only when `data` is null and `pending` is true;
- a not-started state when `tracking` is null;
- four compact `Stat` cards;
- one search field shared by both tables;
- independent `Segmented` controls for current and departed tables;
- `DataTable` rows with Player, Status, Observed date, and Last seen/Confirmed columns;
- a refresh button using `onRefresh`;
- explicit empty/no-match copy based on whether a filter or search is active.

Use these status labels:

```tsx
function membershipLabel(row: CurrentMember) {
  if (row.membershipStatus === "initial") return "Present when tracking began";
  if (row.membershipStatus === "rejoined") return "Rejoined";
  return "Joined";
}
```

- [ ] **Step 4: Add focused responsive CSS**

Use existing tokens and dense dashboard spacing:

```css
.empire-membership-admin {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.empire-membership-toolbar,
.empire-membership-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.empire-membership-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
}

.empire-membership-grid > .form-card {
  min-width: 0;
}

.empire-membership-status {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.empire-membership-name,
.empire-membership-table td {
  overflow-wrap: anywhere;
}

.empire-membership-warning {
  border: 1px solid color-mix(in srgb, var(--danger) 52%, var(--border));
  background: color-mix(in srgb, var(--danger) 10%, var(--panel-2));
  color: var(--text);
  border-radius: var(--radius-card);
  padding: 10px 12px;
}

@media (max-width: 900px) {
  .empire-membership-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .empire-membership-status {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .empire-membership-status {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Keep horizontal overflow inside the existing `DataTable` wrapper rather than on the page.

- [ ] **Step 5: Register and load the new tab in AdminPanel**

Add `"empire-membership"` to `AdminTab` and add this Insights entry after Analytics:

```ts
{ key: "empire-membership", label: "Empire Membership", description: "Observed joins, confirmed departures, and current empire members" },
```

Add:

```tsx
const [empireMembershipData, setEmpireMembershipData] = React.useState<AnyRecord | null>(null);

async function refreshEmpireMembership() {
  setEmpireMembershipData(await api("/admin/empire-membership"));
}
```

Load only when selected:

```tsx
if (tab === "empire-membership") await refreshEmpireMembership();
```

Include the new tab in `extractedTabOwnsMessage`, then compose:

```tsx
{tab === "empire-membership" ? (
  <div className="admin-section empire-membership-admin">
    <AdminEmpireMembershipSection
      data={empireMembershipData}
      pending={isBusyAction("tab-load:empire-membership:discord:30:::1:50") || isBusyAction("empire-membership-refresh")}
      error={messageKind === "error" ? message : null}
      onRefresh={() => run(refreshEmpireMembership, undefined, "empire-membership-refresh")}
    />
  </div>
) : null}
```

Instead of depending on the full generated tab-load key in production code, introduce:

```tsx
const tabLoadPending = [...pendingActions].some((key) => key.startsWith(`tab-load:${tab}:`));
```

and pass `tabLoadPending || isBusyAction("empire-membership-refresh")`.

- [ ] **Step 6: Run boundary tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/admin-empire-membership-boundary.test.mjs test/admin-sections-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests PASS and Vite build completes without TypeScript errors.

- [ ] **Step 7: Commit the admin UI**

```powershell
git add apps/bitcraft-local/src/components/admin/AdminEmpireMembershipSection.tsx apps/bitcraft-local/src/components/admin/AdminPanel.tsx apps/bitcraft-local/src/styles/admin-empire-membership.css apps/bitcraft-local/test/admin-empire-membership-boundary.test.mjs apps/bitcraft-local/test/admin-sections-boundary.test.mjs
git commit -m "feat: add empire membership admin page"
```

---

### Task 7: Verify failure safety, complete coverage, and browser behavior

**Files:**

- Modify if a verification failure requires a focused correction:
  - `apps/bitcraft-local/src/server/empireMembership.mjs`
  - `apps/bitcraft-local/server.mjs`
  - `apps/bitcraft-local/src/components/admin/AdminEmpireMembershipSection.tsx`
  - `apps/bitcraft-local/src/styles/admin-empire-membership.css`
  - `apps/bitcraft-local/test/server-empire-membership.test.mjs`
  - `apps/bitcraft-local/test/admin-empire-membership-boundary.test.mjs`

**Interfaces:**

- Verifies the completed end-to-end feature; produces no new public interface.

- [ ] **Step 1: Add the remaining explicit failure-safety tests**

In `server-empire-membership.test.mjs`, verify that normalization errors happen before repository mutation:

```js
test("invalid roster responses cannot mutate retained membership", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:00:00.000Z" });
  const before = db.prepare("SELECT id, missing_checks, period_ended_at FROM empire_membership_periods ORDER BY id").all();

  for (const payload of [
    null,
    {},
    { empire: { entityId: "empire-1" }, members: [] },
    { ...initialPayload, errors: ["upstream incomplete"] },
    { ...initialPayload, members: [{ playerName: "Missing ID" }] },
  ]) {
    assert.throws(() => normalizeEmpireMembershipRoster(payload, "empire-1"));
  }

  const after = db.prepare("SELECT id, missing_checks, period_ended_at FROM empire_membership_periods ORDER BY id").all();
  assert.deepEqual(after, before);
  db.close();
});
```

Also assert:

- the 30-day boundary includes an event exactly at the cutoff;
- departed members are deduplicated to the latest departure per inactive player;
- an active rejoin removes that player from departed summaries;
- initial members do not increment `joinedLast30Days`;
- `stopTracking` is idempotent when no session is active.

- [ ] **Step 2: Run all focused tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-empire-membership.test.mjs test/server-schema-bootstrap.test.mjs test/server-collector-settings.test.mjs test/server-admin-permissions.test.mjs test/admin-empire-membership-boundary.test.mjs test/admin-sections-boundary.test.mjs test/server.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run the full app verification required for backend changes**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: build succeeds and all tests pass with zero failures.

- [ ] **Step 4: Browser-smoke the admin page**

Start the stable smoke server because this feature changes backend and frontend behavior:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open:

```text
http://127.0.0.1:18449/?page=admin
```

Verify:

1. **Empire Membership** appears under **Insights** only after admin sign-in.
2. The initial roster says **Present when tracking began**.
3. Search filters both tables without changing stored data.
4. The 30-day/all selectors are independent.
5. Rejoined members show **Rejoined** and do not appear under Departed.
6. A retained-data warning leaves the tables visible.
7. The two tables collapse to one column below 900px.
8. Long player names wrap and the page itself does not gain horizontal scrolling.
9. The browser console has no React, accessibility, or request errors.

- [ ] **Step 5: Inspect the final diff for scope**

Run:

```powershell
git diff --check origin/main...HEAD
git status --short
git diff --stat origin/main...HEAD
```

Expected:

- no whitespace errors;
- no database files, logs, `.codex-dev`, changelog, version, or unrelated files;
- only the files declared in this plan plus the approved design and plan documents.

- [ ] **Step 6: Commit any verification-only corrections**

If Step 4 or 5 required corrections, commit only those focused files:

```powershell
git add apps/bitcraft-local/src/server/empireMembership.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/src/components/admin/AdminEmpireMembershipSection.tsx apps/bitcraft-local/src/styles/admin-empire-membership.css apps/bitcraft-local/test/server-empire-membership.test.mjs apps/bitcraft-local/test/admin-empire-membership-boundary.test.mjs
git commit -m "fix: harden empire membership history"
```

If no corrections were required, do not create an empty commit.
