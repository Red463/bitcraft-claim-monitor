# Watchtower Siege and Empire Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make active watchtower siege badges open a detailed siege dialog and add a reusable full empire-details dialog to the Empires overview and siege drill-down.

**Architecture:** Keep BitJita fetching and normalization in the existing Node server, adding a cached endpoint that loads only one selected empire. Put active-siege derivation in a pure frontend helper, isolate each dialog in its own component, and let EmpiresPage own only selection/navigation state.

**Tech Stack:** Node.js 24 HTTP server, React, TypeScript, plain CSS, Lucide icons, Node test runner, pnpm/Corepack.

## Global Constraints

- Work only in apps/bitcraft-local and the release metadata already included in PR #26.
- Reuse the shared Dialog component and existing visual tokens; add no dependency or styling framework.
- Only siege records whose active value is exactly true may trigger Under Siege or appear in Siege Details.
- Keep dialogs viewport-fixed, viewport-bounded, internally scrollable, keyboard accessible, and responsive.
- Fetch only the selected empire for the details dialog; opening it must not run the all-empires watchtower scan.
- Preserve the existing watchtower row click and TowerAccessDialog outside the Under Siege trigger.
- Render missing source values as Unavailable and partial-source failures as inline warnings.

---

## File structure

- Modify apps/bitcraft-local/server.mjs: active-only siege normalization and the selected-empire detail endpoint.
- Create apps/bitcraft-local/src/pages/empires/siegePresentation.ts: pure participant filtering, role grouping, start-time, and duration helpers.
- Create apps/bitcraft-local/src/pages/empires/SiegeDetailsDialog.tsx: siege information and participant presentation.
- Create apps/bitcraft-local/src/pages/empires/EmpireDetailsDialog.tsx: selected-empire request cache, loading states, tabs, and detail presentation.
- Modify apps/bitcraft-local/src/pages/EmpiresPage.tsx: semantic triggers and dialog navigation state.
- Modify apps/bitcraft-local/src/styles/empires.css: focused trigger/dialog/tab/responsive styles.
- Modify apps/bitcraft-local/test/server.test.mjs: endpoint and active-only server behavior.
- Create apps/bitcraft-local/test/siege-presentation.test.mjs: pure siege helper coverage.
- Modify apps/bitcraft-local/test/empires-page-boundary.test.mjs: integration and modal-boundary assertions.
- Modify CHANGELOG.md: describe the user-visible detail dialogs in 0.39.0-beta.2.

---

### Task 1: Normalize only active siege participants

**Files:**
- Modify: apps/bitcraft-local/test/server.test.mjs
- Modify: apps/bitcraft-local/server.mjs:5724-5745, 5828-5833

**Interfaces:**
- Produces: normalizeEmpireTower(...).activeSiegeParticipants: array
- Produces: normalizeEmpireTower(...).underSiege: boolean
- Retains: siegeCount as a compatibility field, now equal to activeSiegeParticipants.length

- [ ] **Step 1: Write the failing server integration assertions**

Change the tower fixture to contain two active participant records plus one inactive historical record:

~~~js
{
  entityId: "tower-1",
  locationX: 111,
  locationZ: 222,
  energy: 75,
  upkeep: 10,
  active: true,
  nickname: "North Tower",
  siege: [
    { active: true, attacker: false, empireEntityId: "empire-1", empireName: "Test Empire", energy: 281, startTimestamp: "2026-07-18T23:55:20.000Z" },
    { active: true, attacker: true, empireEntityId: "empire-2", empireName: "Verdant", energy: 6710, startTimestamp: "2026-07-18T23:55:20.000Z" },
    { active: false, attacker: true, empireEntityId: "empire-old", empireName: "Old Empire", energy: 50, startTimestamp: "2026-06-01T00:00:00.000Z" },
  ],
}
~~~

Add assertions after regionalWatchtowers is fetched:

~~~js
assert.equal(regionalWatchtowers.towers[0].underSiege, true);
assert.equal(regionalWatchtowers.towers[0].siegeCount, 2);
assert.deepEqual(
  regionalWatchtowers.towers[0].activeSiegeParticipants.map((entry) => entry.empireName),
  ["Test Empire", "Verdant"],
);
assert.equal(regionalWatchtowers.summary.underSiege, 1);
~~~

- [ ] **Step 2: Run the server test and verify the new assertions fail**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server.test.mjs
~~~

Expected: FAIL because underSiege and activeSiegeParticipants do not exist and siegeCount is 3.

- [ ] **Step 3: Implement active-only server normalization**

Update normalizeEmpireTower:

~~~js
function normalizeEmpireTower(tower, empire, inactivity) {
  const siege = Array.isArray(tower?.siege) ? tower.siege : [];
  const activeSiegeParticipants = siege.filter((entry) => entry?.active === true);
  const locationX = nestedCoordinate(tower, "x");
  const locationZ = nestedCoordinate(tower, "z");
  return {
    id: String(tower?.entityId ?? tower?.id ?? ""),
    towerId: String(tower?.entityId ?? tower?.id ?? ""),
    empireId: empire.entityId,
    empireName: empire.name,
    nickname: String(tower?.nickname ?? tower?.name ?? "Watchtower"),
    locationX,
    locationZ,
    locationDimension: tower?.locationDimension ?? tower?.dimension ?? tower?.location?.dimension ?? null,
    energy: toNumber(tower?.energy),
    upkeep: toNumber(tower?.upkeep),
    active: tower?.active === true,
    underSiege: activeSiegeParticipants.length > 0,
    siegeCount: activeSiegeParticipants.length,
    activeSiegeParticipants,
    inactiveRisk: inactivity.inactiveRisk,
    lastLeaderLogin: inactivity.lastLeaderLogin,
    inactivityReason: inactivity.inactivityReason,
  };
}
~~~

Change the watchtower summary to:

~~~js
underSiege: towers.filter((tower) => tower.underSiege).length,
~~~

- [ ] **Step 4: Run the focused server test**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server.test.mjs
~~~

Expected: PASS.

- [ ] **Step 5: Commit the active-only normalization**

~~~powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "fix: normalize active watchtower sieges"
~~~

---

### Task 2: Add the selected-empire detail endpoint

**Files:**
- Modify: apps/bitcraft-local/test/server.test.mjs
- Modify: apps/bitcraft-local/server.mjs:5628-5836, 9959-10015

**Interfaces:**
- Produces: GET /api/local/empires/details?empireId=<id>&regionId=<id>&inactiveDays=<days>
- Produces payload: { empire, members, claims, towers, activity, errors, partial, fetchedAt }
- Consumes: regionalEmpireOverview, fetchBitjita, normalizeEmpireMember, compareEmpireMembers, empireInactivity, normalizeEmpireTower, empireCacheLoad

- [ ] **Step 1: Write failing endpoint assertions**

Add a failEmpireTowers toggle beside failEmpireList and use it in the upstream tower fixture:

~~~js
let failEmpireTowers = false;

if (url.pathname === "/api/empires/empire-1/towers") {
  if (failEmpireTowers) return json(res, { error: "tower detail unavailable" }, 503);
  return json(res, [{
    entityId: "tower-1",
    locationX: 111,
    locationZ: 222,
    energy: 75,
    upkeep: 10,
    active: true,
    nickname: "North Tower",
    siege: [
      { active: true, attacker: false, empireEntityId: "empire-1", empireName: "Test Empire", energy: 281, startTimestamp: "2026-07-18T23:55:20.000Z" },
      { active: true, attacker: true, empireEntityId: "empire-2", empireName: "Verdant", energy: 6710, startTimestamp: "2026-07-18T23:55:20.000Z" },
      { active: false, attacker: true, empireEntityId: "empire-old", empireName: "Old Empire", energy: 50, startTimestamp: "2026-06-01T00:00:00.000Z" },
    ],
  }]);
}
~~~

Add validation, partial-result, and complete-payload checks beside the existing empire route assertions:

~~~js
const missingEmpireDetails = await fetch(origin + "/api/local/empires/details?regionId=19");
assert.equal(missingEmpireDetails.status, 400);

failEmpireTowers = true;
const partialEmpireDetails = await fetch(origin + "/api/local/empires/details?empireId=empire-1&regionId=19&inactiveDays=15").then((response) => response.json());
assert.equal(partialEmpireDetails.partial, true);
assert.deepEqual(partialEmpireDetails.towers, []);
assert.match(partialEmpireDetails.errors[0], /Watchtowers unavailable/);
failEmpireTowers = false;

const empireDetailsResponse = await fetch(origin + "/api/local/empires/details?empireId=empire-1&regionId=19&inactiveDays=14");
assert.equal(empireDetailsResponse.status, 200);
const empireDetails = await empireDetailsResponse.json();
assert.equal(empireDetails.empire.name, "Test Empire");
assert.equal(empireDetails.members.length, 4);
assert.equal(empireDetails.claims[0].name, "Timbersteel Trade");
assert.equal(empireDetails.towers[0].underSiege, true);
assert.equal(empireDetails.activity.onlineNow, 0);
assert.equal(empireDetails.activity.activeToday, 0);
assert.equal(empireDetails.activity.activeThisWeek, 0);
assert.equal(empireDetails.partial, false);

const unknownEmpireDetails = await fetch(origin + "/api/local/empires/details?empireId=missing&regionId=19");
assert.equal(unknownEmpireDetails.status, 404);
~~~

- [ ] **Step 2: Run the server test and verify the route is missing**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server.test.mjs
~~~

Expected: FAIL with a 404 for the new details route.

- [ ] **Step 3: Implement activity derivation and selected-empire loading**

Add:

~~~js
function empireActivity(members) {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  return {
    onlineNow: members.filter((member) => member.signedIn).length,
    activeToday: members.filter((member) => member.signedIn || lastLoginMs(member.lastLoginTimestamp) >= dayAgo).length,
    activeThisWeek: members.filter((member) => member.signedIn || lastLoginMs(member.lastLoginTimestamp) >= weekAgo).length,
  };
}

async function regionalEmpireDetails(empireId, regionId, inactiveDays = 14) {
  const days = Math.max(1, Math.min(365, toNumber(inactiveDays) || 14));
  const key = "details:" + regionId + ":" + empireId + ":" + days;
  return empireCacheLoad(key, async () => {
    const overview = await regionalEmpireOverview(regionId);
    const empire = overview.empires.find((entry) => String(entry.entityId) === String(empireId));
    if (!empire) return null;

    const [detailResult, towerResult] = await Promise.allSettled([
      fetchBitjita("/empires/" + encodeURIComponent(empireId), { timeoutMs: Math.min(8000, BITJITA_FETCH_TIMEOUT_MS) }),
      fetchBitjita("/empires/" + encodeURIComponent(empireId) + "/towers", { timeoutMs: Math.min(8000, BITJITA_FETCH_TIMEOUT_MS) }),
    ]);
    const errors = [];
    const detailPayload = detailResult.status === "fulfilled" ? detailResult.value : null;
    const towerPayload = towerResult.status === "fulfilled" ? towerResult.value : null;
    if (detailResult.status === "rejected") errors.push("Empire members unavailable: " + errorMessage(detailResult.reason));
    if (towerResult.status === "rejected") errors.push("Watchtowers unavailable: " + errorMessage(towerResult.reason));

    const detailEmpire = detailPayload?.empire ?? empire;
    const members = unwrap(detailPayload, "members", []).map(normalizeEmpireMember).sort(compareEmpireMembers);
    const inactivity = empireInactivity({ ...empire, ...detailEmpire }, members, days);
    const rawTowers = Array.isArray(towerPayload) ? towerPayload : unwrap(towerPayload, "towers", []);
    const towers = rawTowers.map((tower) => normalizeEmpireTower(tower, empire, inactivity)).filter((tower) => tower.towerId);
    return {
      empire: { ...empire, ...inactivity },
      members,
      claims: empire.claims ?? [],
      towers,
      activity: empireActivity(members),
      errors,
      partial: errors.length > 0,
      fetchedAt: new Date().toISOString(),
    };
  });
}
~~~

Add the route before /api/local/empires/claim-members:

~~~js
if (req.method === "GET" && url.pathname === "/api/local/empires/details") {
  if (!rateLimit(req, res, "empire-details", RATE_LIMITS.expensiveLocal)) return;
  const empireId = String(url.searchParams.get("empireId") ?? "").trim();
  const regionId = String(url.searchParams.get("regionId") ?? "").trim();
  if (!empireId) return send(res, 400, { error: "Empire id is required" });
  if (!/^\d+$/.test(regionId)) return send(res, 400, { error: "Region id is required" });
  const inactiveDays = url.searchParams.get("inactiveDays") ?? 14;
  try {
    const details = await regionalEmpireDetails(empireId, regionId, inactiveDays);
    return details ? send(res, 200, details) : send(res, 404, { error: "Empire not found in region" });
  } catch (error) {
    return send(res, 502, { error: "Empire details unavailable", errors: [errorMessage(error)] });
  }
}
~~~

- [ ] **Step 4: Run the focused server test**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server.test.mjs
~~~

Expected: PASS, including validation, partial-source handling, detail normalization, claims, towers, activity, and not-found behavior.

- [ ] **Step 5: Commit the endpoint**

~~~powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: add focused empire details endpoint"
~~~

---

### Task 3: Add pure siege presentation helpers

**Files:**
- Create: apps/bitcraft-local/src/pages/empires/siegePresentation.ts
- Create: apps/bitcraft-local/test/siege-presentation.test.mjs
- Modify: apps/bitcraft-local/src/pages/empires/watchtowerPresentation.ts
- Modify: apps/bitcraft-local/test/watchtower-presentation.test.mjs

**Interfaces:**
- Produces: activeSiegeParticipants(tower): AnyRecord[]
- Produces: groupSiegeParticipants(tower): { attackers, defenders, startedAt }
- Produces: siegeDurationLabel(startedAt, now?): string
- Changes: isWatchtowerAtRisk reads underSiege first and retains siegeCount compatibility

- [ ] **Step 1: Write the failing pure-helper tests**

Create siege-presentation.test.mjs:

~~~js
import assert from "node:assert/strict";
import test from "node:test";
import { activeSiegeParticipants, groupSiegeParticipants, siegeDurationLabel } from "../src/pages/empires/siegePresentation.ts";

const tower = {
  activeSiegeParticipants: [
    { active: true, attacker: false, empireName: "Lucky Neko Company", startTimestamp: "2026-07-18T23:55:20.000Z" },
    { active: true, attacker: true, empireName: "Verdant", startTimestamp: "2026-07-18T23:55:20.000Z" },
    { active: false, attacker: true, empireName: "Historical" },
  ],
};

test("activeSiegeParticipants keeps only active records", () => {
  assert.deepEqual(activeSiegeParticipants(tower).map((entry) => entry.empireName), ["Lucky Neko Company", "Verdant"]);
});

test("groupSiegeParticipants separates roles and uses the earliest valid start", () => {
  const grouped = groupSiegeParticipants(tower);
  assert.deepEqual(grouped.attackers.map((entry) => entry.empireName), ["Verdant"]);
  assert.deepEqual(grouped.defenders.map((entry) => entry.empireName), ["Lucky Neko Company"]);
  assert.equal(grouped.startedAt, "2026-07-18T23:55:20.000Z");
});

test("siegeDurationLabel is deterministic and handles missing values", () => {
  assert.equal(siegeDurationLabel("2026-07-18T23:55:20.000Z", Date.parse("2026-07-19T15:40:20.000Z")), "15h 45m");
  assert.equal(siegeDurationLabel(null, Date.now()), "Unavailable");
});
~~~

Update the risk test to cover underSiege and active-only compatibility:

~~~js
assert.equal(isWatchtowerAtRisk({ underSiege: true, siegeCount: 0, inactiveRisk: false }), true);
assert.equal(isWatchtowerAtRisk({ underSiege: false, siegeCount: 0, inactiveRisk: false }), false);
~~~

- [ ] **Step 2: Run the helper tests and verify they fail**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/siege-presentation.test.mjs test/watchtower-presentation.test.mjs
~~~

Expected: FAIL because siegePresentation.ts is missing.

- [ ] **Step 3: Implement the helpers**

Create siegePresentation.ts:

~~~ts
import type { AnyRecord } from "../../main-app-data";

export function activeSiegeParticipants(tower: AnyRecord): AnyRecord[] {
  const rows = Array.isArray(tower.activeSiegeParticipants)
    ? tower.activeSiegeParticipants
    : Array.isArray(tower.siege)
      ? tower.siege
      : [];
  return rows.filter((entry) => entry?.active === true);
}

export function groupSiegeParticipants(tower: AnyRecord) {
  const participants = activeSiegeParticipants(tower);
  const starts = participants
    .map((entry) => ({ raw: entry.startTimestamp ?? entry.startedAt ?? null, time: Date.parse(String(entry.startTimestamp ?? entry.startedAt ?? "")) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);
  return {
    attackers: participants.filter((entry) => entry.attacker === true),
    defenders: participants.filter((entry) => entry.attacker !== true),
    startedAt: starts[0]?.raw ?? null,
  };
}

export function siegeDurationLabel(startedAt: unknown, now = Date.now()): string {
  const started = Date.parse(String(startedAt ?? ""));
  if (!Number.isFinite(started) || started > now) return "Unavailable";
  const totalMinutes = Math.floor((now - started) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? days + "d" : "", hours || days ? hours + "h" : "", minutes + "m"].filter(Boolean).join(" ");
}
~~~

Update isWatchtowerAtRisk:

~~~ts
const underSiege = row.underSiege === true || String(row.underSiege ?? "").toLowerCase() === "true";
return underSiege || numericValue(row.siegeCount) > 0 || inactiveRisk;
~~~

- [ ] **Step 4: Run both focused presentation tests**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/siege-presentation.test.mjs test/watchtower-presentation.test.mjs
~~~

Expected: PASS.

- [ ] **Step 5: Commit the pure presentation layer**

~~~powershell
git add apps/bitcraft-local/src/pages/empires/siegePresentation.ts apps/bitcraft-local/src/pages/empires/watchtowerPresentation.ts apps/bitcraft-local/test/siege-presentation.test.mjs apps/bitcraft-local/test/watchtower-presentation.test.mjs
git commit -m "feat: add siege presentation helpers"
~~~

---

### Task 4: Build the two accessible detail dialogs

**Files:**
- Create: apps/bitcraft-local/src/pages/empires/SiegeDetailsDialog.tsx
- Create: apps/bitcraft-local/src/pages/empires/EmpireDetailsDialog.tsx
- Modify: apps/bitcraft-local/test/empires-page-boundary.test.mjs

**Interfaces:**
- SiegeDetailsDialog props: { tower: AnyRecord; onClose: () => void; onViewEmpire: (empireId: string) => void }
- EmpireDetailsDialog props: { empireId: string; regionId: string; inactiveDays: string; onClose: () => void; onBack?: () => void }
- EmpireDetailsDialog uses a module-level Map<string, AnyRecord> for successful session caching

- [ ] **Step 1: Add failing boundary tests for the new components**

Read both new component files and assert:

~~~js
const siegeDialog = readFileSync(new URL("../src/pages/empires/SiegeDetailsDialog.tsx", import.meta.url), "utf8");
const empireDialog = readFileSync(new URL("../src/pages/empires/EmpireDetailsDialog.tsx", import.meta.url), "utf8");

assert.match(siegeDialog, /<Dialog open title="Siege Details"/);
assert.match(siegeDialog, /groupSiegeParticipants/);
assert.match(siegeDialog, /Siege Duration/);
assert.match(siegeDialog, /Siege Started/);
assert.match(siegeDialog, /Attacking Empire/);
assert.match(siegeDialog, /Defending Empire/);
assert.match(siegeDialog, /onViewEmpire/);

assert.match(empireDialog, /\/empires\/details\?/);
assert.match(empireDialog, /AbortController/);
assert.match(empireDialog, /empireDetailsCache/);
assert.match(empireDialog, /role="tablist"/);
assert.match(empireDialog, /aria-selected=/);
assert.match(empireDialog, /Overview/);
assert.match(empireDialog, /Members/);
assert.match(empireDialog, /Claims/);
assert.match(empireDialog, /Towers/);
assert.match(empireDialog, /Retry/);
assert.match(empireDialog, /Back to Siege Details/);
~~~

- [ ] **Step 2: Run the boundary test and verify missing-file failure**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/empires-page-boundary.test.mjs
~~~

Expected: FAIL because the dialog files do not exist.

- [ ] **Step 3: Implement SiegeDetailsDialog**

Create SiegeDetailsDialog.tsx with the shared Dialog, pure grouping helpers, and a one-minute elapsed-duration refresh:

~~~tsx
import React from "react";
import { AlertTriangle, Landmark, MapPin, Shield, X, Zap } from "lucide-react";
import { Dialog } from "../../components/main/Dialog";
import type { AnyRecord } from "../../main-app-data";
import { dateLabel, formatNumber } from "../../utils/format";
import { coordinateText } from "./watchtowerPresentation";
import { groupSiegeParticipants, siegeDurationLabel } from "./siegePresentation";

type SiegeDetailsDialogProps = {
  tower: AnyRecord;
  onClose: () => void;
  onViewEmpire: (empireId: string) => void;
};

function ParticipantCard({ participant, role, onViewEmpire }: {
  participant: AnyRecord;
  role: "attacker" | "defender";
  onViewEmpire: (empireId: string) => void;
}) {
  const empireId = String(participant.empireEntityId ?? participant.empireId ?? "").trim();
  const label = role === "attacker" ? "Attacking Empire" : "Defending Empire";
  return (
    <article className={"siege-participant-card " + role}>
      <div className="siege-participant-head">
        <span className={"status-pill " + (role === "attacker" ? "danger" : "good")}>
          {role === "attacker" ? <AlertTriangle size={13} /> : <Shield size={13} />} {label}
        </span>
        <button type="button" className="toolbar-button" disabled={!empireId} onClick={() => onViewEmpire(empireId)}>View Empire</button>
      </div>
      <dl>
        <div><dt>Empire</dt><dd>{participant.empireName ?? "Unknown empire"}</dd></div>
        <div><dt><Zap size={13} /> {role === "attacker" ? "Attacker" : "Defender"} Energy</dt><dd>{participant.energy == null ? "Unavailable" : formatNumber(participant.energy)}</dd></div>
      </dl>
    </article>
  );
}

export function SiegeDetailsDialog({ tower, onClose, onViewEmpire }: SiegeDetailsDialogProps) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { attackers, defenders, startedAt } = groupSiegeParticipants(tower);
  const towerName = String(tower.displayName ?? tower.nickname ?? "Watchtower");
  return (
    <Dialog open title="Siege Details" description={"Detailed siege information for " + towerName} onClose={onClose} className="help-dialog siege-details-dialog" backdropClassName="help-overlay empires-watchtower-overlay">
      <header>
        <div><AlertTriangle /><h2>Siege Details</h2></div>
        <button type="button" onClick={onClose} aria-label="Close siege details"><X size={16} /></button>
      </header>
      <div className="siege-dialog-body">
        <p className="tower-access-note">Detailed information about the active siege affecting this Watchtower.</p>
        <section className="siege-tower-information">
          <h3>Tower Information</h3>
          <dl>
            <div><dt><Landmark size={14} /> Name</dt><dd>{towerName}</dd></div>
            <div><dt><MapPin size={14} /> Location</dt><dd>{coordinateText(tower)}</dd></div>
          </dl>
        </section>
        <h3 className="siege-section-title">Active Siege</h3>
        <section className="siege-active-summary">
          <span className="status-pill danger"><AlertTriangle size={13} /> Under Siege</span>
          <dl>
            <div><dt>Siege Duration</dt><dd>{siegeDurationLabel(startedAt, now)}</dd></div>
            <div><dt>Siege Started</dt><dd>{startedAt ? dateLabel(startedAt) : "Unavailable"}</dd></div>
          </dl>
        </section>
        {attackers.map((participant, index) => <ParticipantCard key={"attacker:" + String(participant.empireEntityId ?? index)} role="attacker" participant={participant} onViewEmpire={onViewEmpire} />)}
        {defenders.map((participant, index) => <ParticipantCard key={"defender:" + String(participant.empireEntityId ?? index)} role="defender" participant={participant} onViewEmpire={onViewEmpire} />)}
        {!attackers.length && !defenders.length ? <div className="empty-state compact">Active siege participant details are unavailable.</div> : null}
      </div>
    </Dialog>
  );
}
~~~

- [ ] **Step 4: Implement EmpireDetailsDialog**

Create EmpireDetailsDialog.tsx. Use successful session caching, abort stale requests, and render every tab from the normalized endpoint:

~~~tsx
import React from "react";
import { ArrowLeft, Castle, Clock, Crown, Landmark, MapPin, RadioTower, Users, X, Zap } from "lucide-react";
import { AsyncState } from "../../components/main/AsyncState";
import { AppSkeleton } from "../../components/main/AppChrome";
import { Dialog } from "../../components/main/Dialog";
import type { AnyRecord } from "../../main-app-data";
import { dateLabel, formatCompactNumber, formatNumber, timeAgo } from "../../utils/format";
import { presentHexiteReserveMetric } from "./hexitePresentation";
import { coordinateText } from "./watchtowerPresentation";

type EmpireDetailsState = {
  data: AnyRecord | null;
  loading: boolean;
  error: string | null;
};

type EmpireDetailsTab = "overview" | "members" | "claims" | "towers";

type EmpireDetailsDialogProps = {
  empireId: string;
  regionId: string;
  inactiveDays: string;
  onClose: () => void;
  onBack?: () => void;
};

const empireDetailsCache = new Map<string, AnyRecord>();

function compactDate(value: unknown) {
  return value ? timeAgo(value) + " (" + dateLabel(value) + ")" : "Unavailable";
}

export function EmpireDetailsDialog({ empireId, regionId, inactiveDays, onClose, onBack }: EmpireDetailsDialogProps) {
  const [tab, setTab] = React.useState<EmpireDetailsTab>("overview");
  const [retry, setRetry] = React.useState(0);
  const cacheKey = regionId + ":" + empireId + ":" + inactiveDays;
  const [state, setState] = React.useState<EmpireDetailsState>({ data: null, loading: true, error: null });

  React.useEffect(() => {
    setTab("overview");
  }, [empireId]);

  React.useEffect(() => {
    const cached = empireDetailsCache.get(cacheKey);
    if (cached && retry === 0) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    const params = new URLSearchParams({ empireId, regionId, inactiveDays });
    fetch("/api/local/empires/details?" + params, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Empire details HTTP " + response.status)))
      .then((payload) => {
        empireDetailsCache.set(cacheKey, payload);
        setState({ data: payload, loading: false, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ data: null, loading: false, error: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
  }, [cacheKey, empireId, inactiveDays, regionId, retry]);

  const data = state.data;
  const empire = data?.empire ?? {};
  const members: AnyRecord[] = Array.isArray(data?.members) ? data.members : [];
  const claims: AnyRecord[] = Array.isArray(data?.claims) ? data.claims : [];
  const towers: AnyRecord[] = Array.isArray(data?.towers) ? data.towers : [];
  const energy = presentHexiteReserveMetric(empire.hexiteReserves ?? {}, "energy");
  const watchtowerEnergy = presentHexiteReserveMetric(empire.hexiteReserves ?? {}, "watchtower");
  const tabs: Array<{ id: EmpireDetailsTab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members", count: members.length },
    { id: "claims", label: "Claims", count: claims.length },
    { id: "towers", label: "Towers", count: towers.length },
  ];

  return (
    <Dialog open title={String(empire.name ?? "Empire Details")} description="Empire activity, members, claims, towers, and reserves." onClose={onClose} className="help-dialog empire-details-dialog" backdropClassName="help-overlay empires-watchtower-overlay">
      <header>
        <div><Landmark /><h2>{empire.name ?? "Empire Details"}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close empire details"><X size={16} /></button>
      </header>
      <div className="empire-detail-body">
        {onBack ? <button type="button" className="toolbar-button empire-detail-back" onClick={onBack}><ArrowLeft size={14} /> Back to Siege Details</button> : null}
        {state.loading ? <AppSkeleton /> : null}
        {state.error ? <AsyncState kind="error" title="Unable to load empire details" detail={state.error} action={<button type="button" className="toolbar-button" onClick={() => setRetry((value) => value + 1)}>Retry</button>} /> : null}
        {data ? (
          <>
            <div className="empire-detail-heading">
              <span><Crown size={14} /> Leader: {empire.leader ?? "Unknown"}</span>
              <span><Clock size={14} /> Updated: {compactDate(data.fetchedAt ?? empire.updatedAt)}</span>
            </div>
            {data.partial || data.errors?.length ? <div className="warning-card">Some empire sources are unavailable: {(data.errors ?? []).join("; ")}</div> : null}
            <div className="empire-detail-summary">
              <span><Users /><small>Members</small><strong>{formatNumber(empire.memberCount ?? members.length)}</strong></span>
              <span><Castle /><small>Claims</small><strong>{formatNumber(empire.numClaims ?? claims.length)}</strong></span>
              <span><MapPin /><small>Territory</small><strong>{formatNumber(empire.territoryChunks)}</strong></span>
              <span><Zap /><small>Hexite Energy</small><strong>{energy.primary}</strong></span>
              <span><RadioTower /><small>Watchtower Energy</small><strong>{watchtowerEnergy.primary}</strong></span>
            </div>
            <div className="empire-detail-tabs" role="tablist" aria-label="Empire detail views">
              {tabs.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} className={tab === entry.id ? "active" : ""} onClick={() => setTab(entry.id)}>{entry.label}{entry.count == null ? null : <small>{formatNumber(entry.count)}</small>}</button>)}
            </div>
            <section className="empire-detail-panel" role="tabpanel">
              {tab === "overview" ? (
                <div className="empire-overview-grid">
                  <dl>
                    <div><dt>Online now</dt><dd>{formatNumber(data.activity?.onlineNow)}</dd></div>
                    <div><dt>Active today</dt><dd>{formatNumber(data.activity?.activeToday)}</dd></div>
                    <div><dt>Active this week</dt><dd>{formatNumber(data.activity?.activeThisWeek)}</dd></div>
                  </dl>
                  <dl>
                    <div><dt>Last leader login</dt><dd>{compactDate(empire.lastLeaderLogin)}</dd></div>
                    <div><dt>Leader activity</dt><dd><span className={"status-pill " + (empire.inactiveRisk ? "warn" : "good")}>{empire.inactiveRisk ? "Risk" : "Active"}</span></dd></div>
                    <div><dt>Regional claims</dt><dd>{formatNumber(empire.regionalClaims)}</dd></div>
                  </dl>
                </div>
              ) : null}
              {tab === "members" ? members.length ? <div className="empire-detail-list">{members.map((member) => <article key={member.entityId ?? member.username}><div><strong>{member.username ?? "Unknown"}</strong><small>{member.rankTitle ?? "Citizen"}{member.hasStorage ? " · Storage" : ""}{member.canAddHexite ? " · Add Hexite" : ""}</small></div><span>{member.signedIn ? "Online now" : compactDate(member.lastLoginTimestamp)}</span></article>)}</div> : <AsyncState kind="empty" title="No current member data available" detail="BitJita did not return members for this empire." compact /> : null}
              {tab === "claims" ? claims.length ? <div className="empire-detail-list">{claims.map((claim) => <article key={claim.claimId ?? claim.name}><div><strong>{claim.name ?? "Unknown claim"}</strong><small>{claim.ownerName ?? "Unknown owner"} · {coordinateText(claim)}</small></div><span>T{claim.tier ?? "?"} · {formatNumber(claim.supplies)} supplies · {formatCompactNumber(claim.treasury)}g</span></article>)}</div> : <AsyncState kind="empty" title="No current claim data available" detail="No regional claims are associated with this empire." compact /> : null}
              {tab === "towers" ? towers.length ? <div className="empire-detail-list">{towers.map((tower) => <article key={tower.towerId}><div><strong>{tower.nickname ?? "Watchtower"}</strong><small>{coordinateText(tower)} · {formatNumber(tower.energy)} energy · {formatNumber(tower.upkeep)} upkeep</small></div><span><span className={"status-pill " + (tower.active ? "good" : "muted")}>{tower.active ? "Active" : "Inactive"}</span> {tower.inactiveRisk ? <span className="status-pill warn">Risk</span> : null} {tower.underSiege ? <span className="status-pill danger">Under Siege</span> : <span className="status-pill muted">No siege</span>}</span></article>)}</div> : <AsyncState kind="empty" title="No current tower data available" detail="BitJita did not return claimed Watchtowers for this empire." compact /> : null}
            </section>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
~~~

- [ ] **Step 5: Run the focused boundary test**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/empires-page-boundary.test.mjs
~~~

Expected: PASS for shared Dialog usage, request lifecycle, tabs, retry, and siege participant rendering.

- [ ] **Step 6: Commit the dialog components**

~~~powershell
git add apps/bitcraft-local/src/pages/empires/SiegeDetailsDialog.tsx apps/bitcraft-local/src/pages/empires/EmpireDetailsDialog.tsx apps/bitcraft-local/test/empires-page-boundary.test.mjs
git commit -m "feat: add siege and empire detail dialogs"
~~~

---

### Task 5: Wire semantic triggers and single-surface navigation

**Files:**
- Modify: apps/bitcraft-local/src/pages/EmpiresPage.tsx: imports, state, columns, dialog rendering
- Modify: apps/bitcraft-local/test/empires-page-boundary.test.mjs

**Interfaces:**
- Consumes: SiegeDetailsDialog and EmpireDetailsDialog
- Page state: selectedSiegeTower, selectedEmpireId, empireBackTarget

- [ ] **Step 1: Write failing integration boundary assertions**

Replace the old span assertion and add:

~~~js
assert.match(empiresPage, /className="status-pill danger siege-status-trigger"/);
assert.match(empiresPage, /aria-label=\{[sS]*View siege details/);
assert.match(empiresPage, /event\.stopPropagation\(\);[sS]*setSelectedSiegeTower\(row\)/);
assert.match(empiresPage, /className="empire-details-trigger"/);
assert.match(empiresPage, /setSelectedEmpireId/);
assert.match(empiresPage, /<SiegeDetailsDialog/);
assert.match(empiresPage, /<EmpireDetailsDialog/);
assert.match(empiresPage, /onBack=/);
assert.doesNotMatch(empiresPage, /<span className="status-pill danger">Under Siege<\/span>/);
~~~

- [ ] **Step 2: Run the boundary test and verify it fails**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/empires-page-boundary.test.mjs
~~~

Expected: FAIL because the page still renders a non-interactive pill and no empire dialog.

- [ ] **Step 3: Add page selection state**

Add:

~~~ts
const [selectedSiegeTower, setSelectedSiegeTower] = React.useState<AnyRecord | null>(null);
const [selectedEmpireId, setSelectedEmpireId] = React.useState<string | null>(null);
const [empireBackTarget, setEmpireBackTarget] = React.useState<AnyRecord | null>(null);
~~~

Add actions:

~~~ts
const openEmpireDetails = (empireId: unknown, backToSiege: AnyRecord | null = null) => {
  const id = String(empireId ?? "").trim();
  if (!id) return;
  setEmpireBackTarget(backToSiege);
  setSelectedSiegeTower(null);
  setSelectedEmpireId(id);
};
~~~

- [ ] **Step 4: Replace overview and siege cells with semantic buttons**

Use:

~~~tsx
["Empire", (row) => (
  <button type="button" className="empire-details-trigger" onClick={(event) => {
    event.stopPropagation();
    openEmpireDetails(row.entityId);
  }}>
    {row.name}
  </button>
)],
~~~

And:

~~~tsx
["Siege", (row) => row.underSiege ? (
  <button
    type="button"
    className="status-pill danger siege-status-trigger"
    aria-label={"View siege details for " + (row.displayName ?? "watchtower")}
    onClick={(event) => {
      event.stopPropagation();
      setSelectedSiegeTower(row);
    }}
  >
    Under Siege
  </button>
) : <span className="status-pill muted">None</span>],
~~~

- [ ] **Step 5: Render exactly one detail surface**

After TowerAccessDialog, render:

~~~tsx
{selectedSiegeTower ? (
  <SiegeDetailsDialog
    tower={selectedSiegeTower}
    onClose={() => setSelectedSiegeTower(null)}
    onViewEmpire={(empireId) => openEmpireDetails(empireId, selectedSiegeTower)}
  />
) : null}
{selectedEmpireId ? (
  <EmpireDetailsDialog
    empireId={selectedEmpireId}
    regionId={regionId}
    inactiveDays={inactiveDays}
    onClose={() => {
      setSelectedEmpireId(null);
      setEmpireBackTarget(null);
    }}
    onBack={empireBackTarget ? () => {
      setSelectedEmpireId(null);
      setSelectedSiegeTower(empireBackTarget);
      setEmpireBackTarget(null);
    } : undefined}
  />
) : null}
~~~

- [ ] **Step 6: Run the focused frontend tests**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/empires-page-boundary.test.mjs test/siege-presentation.test.mjs test/watchtower-presentation.test.mjs
~~~

Expected: PASS.

- [ ] **Step 7: Commit page wiring**

~~~powershell
git add apps/bitcraft-local/src/pages/EmpiresPage.tsx apps/bitcraft-local/test/empires-page-boundary.test.mjs
git commit -m "feat: connect empire intelligence dialogs"
~~~

---

### Task 6: Style, responsive hardening, and release note

**Files:**
- Modify: apps/bitcraft-local/src/styles/empires.css
- Modify: apps/bitcraft-local/test/empires-page-boundary.test.mjs
- Modify: CHANGELOG.md

**Interfaces:**
- Consumes existing --border, --text, --muted, --good, --gold, and dashboard surface tokens
- Retains .empires-watchtower-overlay fixed viewport behavior

- [ ] **Step 1: Add failing CSS boundary assertions**

Add:

~~~js
assert.match(empiresCss, /\.siege-status-trigger\s*\{[^}]*cursor:\s*pointer/s);
assert.match(empiresCss, /\.empire-details-trigger:focus-visible/);
assert.match(empiresCss, /\.siege-details-dialog,[\s\S]*\.empire-details-dialog[\s\S]*max-height:\s*calc\(100vh - 40px\)/);
assert.match(empiresCss, /\.empire-detail-tabs/);
assert.match(empiresCss, /\.siege-participant-card\.attacker/);
assert.match(empiresCss, /\.siege-participant-card\.defender/);
assert.match(empiresCss, /@media\s*\(max-width:\s*760px\)[\s\S]*\.empire-detail-summary/s);
~~~

- [ ] **Step 2: Run the boundary test and verify style assertions fail**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/empires-page-boundary.test.mjs
~~~

Expected: FAIL because the feature-specific CSS is absent.

- [ ] **Step 3: Add focused CSS**

Add this focused feature block, then merge selectors with nearby rules only when doing so preserves the exact behavior:

~~~css
.siege-status-trigger {
  font: inherit;
  cursor: pointer;
}

.siege-status-trigger:focus-visible,
.empire-details-trigger:focus-visible {
  outline: 2px solid var(--active-color);
  outline-offset: 2px;
}

.empire-details-trigger {
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 0;
  font: inherit;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
}

.empire-details-trigger:hover {
  color: var(--active-color);
  text-decoration: underline;
}

.siege-details-dialog,
.empire-details-dialog {
  width: min(860px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow: hidden;
}

.siege-dialog-body,
.empire-detail-body {
  display: grid;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.siege-tower-information,
.siege-active-summary,
.siege-participant-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(4, 8, 14, .48);
  padding: 14px;
}

.siege-tower-information h3,
.siege-section-title {
  margin: 0 0 10px;
  font-size: 15px;
}

.siege-tower-information dl,
.siege-active-summary dl,
.siege-participant-card dl,
.empire-overview-grid dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.siege-tower-information dl div,
.siege-active-summary dl div,
.siege-participant-card dl div,
.empire-overview-grid dl div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.siege-tower-information dt,
.siege-active-summary dt,
.siege-participant-card dt,
.empire-overview-grid dt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}

.siege-tower-information dd,
.siege-active-summary dd,
.siege-participant-card dd,
.empire-overview-grid dd {
  margin: 0;
  color: var(--text);
  font-weight: 800;
  text-align: right;
}

.siege-active-summary {
  display: grid;
  gap: 12px;
}

.siege-participant-card.attacker {
  border-color: rgba(239, 100, 97, .46);
  background: rgba(82, 20, 24, .2);
}

.siege-participant-card.defender {
  border-color: rgba(78, 226, 138, .36);
  background: rgba(10, 65, 40, .18);
}

.siege-participant-head,
.empire-detail-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.empire-detail-heading span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.empire-detail-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.empire-detail-summary > span {
  display: grid;
  gap: 4px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: rgba(4, 8, 14, .48);
  padding: 12px;
}

.empire-detail-summary svg {
  color: var(--gold);
}

.empire-detail-summary small {
  color: var(--muted);
}

.empire-detail-summary strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.empire-detail-tabs {
  display: flex;
  gap: 6px;
  max-width: 100%;
  overflow-x: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: rgba(4, 8, 14, .52);
}

.empire-detail-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 32px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  padding: 5px 11px;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
}

.empire-detail-tabs button:hover,
.empire-detail-tabs button:focus-visible,
.empire-detail-tabs button.active {
  background: rgba(240, 198, 79, .14);
  color: var(--active-color);
}

.empire-detail-tabs button small {
  color: inherit;
}

.empire-detail-panel {
  min-height: 220px;
}

.empire-overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.empire-overview-grid dl,
.empire-detail-list article {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: rgba(4, 8, 14, .38);
  padding: 12px;
}

.empire-detail-list {
  display: grid;
  gap: 8px;
}

.empire-detail-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, auto);
  align-items: center;
  gap: 12px;
}

.empire-detail-list strong,
.empire-detail-list small {
  display: block;
}

.empire-detail-list small {
  margin-top: 3px;
  color: var(--muted);
}

.empire-detail-list article > span {
  color: var(--muted);
  text-align: right;
}

@media (max-width: 900px) {
  .empire-detail-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .empire-overview-grid,
  .empire-detail-list article {
    grid-template-columns: 1fr;
  }

  .empire-detail-list article > span {
    text-align: left;
  }
}

@media (max-width: 560px) {
  .siege-details-dialog,
  .empire-details-dialog {
    width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
  }

  .empire-detail-summary {
    grid-template-columns: 1fr;
  }
}
~~~

- [ ] **Step 4: Update the 0.39.0-beta.2 changelog**

Add under Added:

~~~markdown
### Added

- Added clickable Watchtower siege details with attacker and defender energy, plus reusable Empire details for members, claims, towers, activity, and Hexite reserves.
~~~

Retain the existing Fixed entry about participant-count semantics.

- [ ] **Step 5: Run focused tests and the production build**

Run:

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/empires-page-boundary.test.mjs test/siege-presentation.test.mjs test/watchtower-presentation.test.mjs test/server.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
~~~

Expected: all focused tests pass and Vite build exits 0.

- [ ] **Step 6: Commit styling and release note**

~~~powershell
git add apps/bitcraft-local/src/styles/empires.css apps/bitcraft-local/test/empires-page-boundary.test.mjs CHANGELOG.md
git commit -m "style: polish empire intelligence dialogs"
~~~

---

### Task 7: Full verification, browser QA, and PR update

**Files:**
- Verify all changed production, test, documentation, and release files
- Do not modify unrelated files

**Interfaces:**
- Consumes stable smoke URL: http://127.0.0.1:18449/?page=empires
- Produces an updated pushed branch for PR #26

- [ ] **Step 1: Run the complete test suite**

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local test
~~~

Expected: all tests pass.

- [ ] **Step 2: Run a fresh production build**

~~~powershell
corepack pnpm --filter @workspace/bitcraft-local run build
~~~

Expected: exit 0 with no TypeScript or Vite errors.

- [ ] **Step 3: Start the stable smoke server**

~~~powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
~~~

Expected: launcher returns promptly and health returns an OK JSON payload. Backend changed, so force-restart is required once.

- [ ] **Step 4: Browser-check the affected page**

Open http://127.0.0.1:18449/?page=empires and verify:

- Empire name opens Empire Details directly.
- Under Siege opens the current tower's Siege Details without opening TowerAccessDialog.
- View Empire replaces Siege Details; Back returns to Siege Details.
- Overview, Members, Claims, and Towers tabs render.
- Escape, close, focus return, and keyboard tab activation work.
- The dialog remains in the viewport at desktop and phone widths.
- Loading, empty, warning, unavailable, and retry states remain legible.
- Browser console has no new errors.

- [ ] **Step 5: Inspect the final diff and repository state**

~~~powershell
git diff --check
git status --short
git log --oneline origin/main..HEAD
~~~

Expected: no whitespace errors; only intended files are changed/committed.

- [ ] **Step 6: Push and update the existing draft PR**

~~~powershell
git push origin codex/watchtower-under-siege-label
gh pr view 26 --json url,state,isDraft,mergeable,headRefName
~~~

Expected: branch push succeeds and PR #26 remains open, draft, and mergeable.
