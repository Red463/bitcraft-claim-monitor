import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer as createViteServer } from "vite";

import { pageDomains } from "../src/api/pageDomains.ts";
import { orderMembersByDefault } from "../src/pages/membersView.ts";
import * as tableSort from "../src/utils/tableSort.ts";

test("Dashboard requests the global region catalog with its page data", () => {
  assert.equal(pageDomains("dashboard").includes("region"), true);
});

test("Dashboard renders the monitored region name resolved from the global catalog", async () => {
  const appRoot = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createViteServer({
    root: appRoot,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    const [{ Dashboard }, { normalizeData }] = await Promise.all([
      vite.ssrLoadModule("/src/pages/DashboardPage.tsx"),
      vite.ssrLoadModule("/src/utils/normalize.ts"),
    ]);
    const data = normalizeData({
      claim: { entityId: "55", name: "Timbersteel", regionId: 19 },
      region: { regions: [{ regionId: 19, regionName: "Zephra" }] },
    });
    const markup = renderToStaticMarkup(React.createElement(Dashboard, {
      data,
      activity: [],
      marketHistory: null,
      dashboardSummary: null,
      lastUpdated: null,
      onNavigate() {},
    }));

    assert.match(markup, /R19 \u00b7 Zephra/);
  } finally {
    await vite.close();
  }
});

test("DataTable row resolution preserves Members defaults until an explicit sort overrides them", () => {
  assert.equal(typeof tableSort.resolveDataTableRows, "function");
  const defaultRows = orderMembersByDefault([
    { playerEntityId: "1", username: "Zed", player: { signedIn: true, sessionSeconds: 540 } },
    { playerEntityId: "2", username: "Ada", player: { signedIn: false } },
  ]).map((row, index) => ({ row, index }));

  assert.deepEqual(
    tableSort.resolveDataTableRows(defaultRows, null).map(({ row }) => row.username),
    ["Zed", "Ada"],
  );
  assert.deepEqual(
    tableSort.resolveDataTableRows(defaultRows, {
      direction: "asc",
      sortValue: (row) => row.username,
    }).map(({ row }) => row.username),
    ["Ada", "Zed"],
  );
});
