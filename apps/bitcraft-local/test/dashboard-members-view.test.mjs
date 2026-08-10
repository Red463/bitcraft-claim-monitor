import assert from "node:assert/strict";
import test from "node:test";

import { dashboardClaimRegionLabel } from "../src/pages/dashboardView.ts";
import { orderMembersByDefault } from "../src/pages/membersView.ts";
import { readFileSync } from "node:fs";

test("Dashboard resolves the monitored claim region name from the global region catalog", () => {
  assert.equal(
    dashboardClaimRegionLabel({ regionId: 19 }, [
      { regionId: 18, regionName: "Ashenvale" },
      { regionId: 19, regionName: "Zephra" },
    ]),
    "R19 · Zephra",
  );
});

test("Dashboard falls back to a usable monitored claim region label", () => {
  assert.equal(dashboardClaimRegionLabel({ regionId: "19" }, []), "R19 · Region 19");
});

test("Dashboard member locations use presenceRegionId with catalog and unavailable fallbacks", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /const regionId = player\.presenceRegionId == null \? "" : String\(player\.presenceRegionId\)\.trim\(\);/);
  assert.match(dashboard, /regionNameById\.get\(regionId\) \?\? `R\$\{regionId\}`/);
  assert.match(dashboard, /regionName = regionId \? regionNameById\.get\(regionId\) \?\? `R\$\{regionId\}` : "Location unavailable"/);
});

test("Members default ordering puts online members by longest session, then recent offline members, then unavailable presence", () => {
  const members = [
    { playerEntityId: "9", username: "Unavailable", player: { presenceSource: "unavailable" } },
    { playerEntityId: "3", username: "Recent", player: { signedIn: false, lastActiveTimestamp: "2026-08-08T10:00:00.000Z" } },
    { playerEntityId: "2", username: "Short", player: { signedIn: true, sessionSeconds: 120 } },
    { playerEntityId: "1", username: "Long", player: { signedIn: true, sessionSeconds: 540 } },
    { playerEntityId: "4", username: "Older", player: { signedIn: false, lastLoginTimestamp: "2026-08-07T10:00:00.000Z" } },
  ];

  assert.deepEqual(orderMembersByDefault(members).map((member) => member.username), [
    "Long", "Short", "Recent", "Older", "Unavailable",
  ]);
});

test("Members default ordering breaks equal presence values by username then entity ID", () => {
  const members = [
    { playerEntityId: "3", username: "Ada", player: { signedIn: true, sessionSeconds: 60 } },
    { playerEntityId: "1", username: "ada", player: { signedIn: true, sessionSeconds: 60 } },
    { playerEntityId: "2", username: "Bea", player: { signedIn: true, sessionSeconds: 60 } },
  ];

  assert.deepEqual(orderMembersByDefault(members).map((member) => member.playerEntityId), ["1", "3", "2"]);
});

test("Members with missing or indeterminate player presence sort after confirmed offline members", () => {
  const members = [
    { playerEntityId: "1", username: "Ada" },
    { playerEntityId: "2", username: "Bea", player: { presenceSource: "regional" } },
    { playerEntityId: "3", username: "Zed", player: { signedIn: false } },
  ];

  assert.deepEqual(orderMembersByDefault(members).map((member) => member.username), [
    "Zed", "Ada", "Bea",
  ]);
});
