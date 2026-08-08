import assert from "node:assert/strict";
import test from "node:test";

import { dashboardClaimRegionLabel } from "../src/pages/dashboardView.ts";
import { orderMembersByDefault } from "../src/pages/membersView.ts";
import { sortIndexedRows } from "../src/utils/tableSort.ts";

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

test("Explicit DataTable sorting overrides the Members default row order", () => {
  const defaultRows = orderMembersByDefault([
    { playerEntityId: "1", username: "Zed", player: { signedIn: true, sessionSeconds: 540 } },
    { playerEntityId: "2", username: "Ada", player: { signedIn: false, lastActiveTimestamp: "2026-08-08T10:00:00.000Z" } },
  ]);

  assert.deepEqual(defaultRows.map((member) => member.username), ["Zed", "Ada"]);
  assert.deepEqual(
    sortIndexedRows(defaultRows.map((row, index) => ({ row, index })), (row) => row.username, "asc")
      .map(({ row }) => row.username),
    ["Ada", "Zed"],
  );
});
