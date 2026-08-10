import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer as createViteServer } from "vite";

import { pageDomains } from "../src/api/pageDomains.ts";
import { orderMembersByDefault } from "../src/pages/membersView.ts";

function findElements(node, predicate, matches = []) {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, matches);
    return matches;
  }
  if (!React.isValidElement(node)) return matches;
  if (predicate(node)) matches.push(node);
  findElements(node.props.children, predicate, matches);
  return matches;
}

function elementText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(elementText).join("");
  return React.isValidElement(node) ? elementText(node.props.children) : "";
}

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

test("Dashboard renders member locations from exact presence regions", async () => {
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
    const cases = [
      {
        name: "catalog name",
        player: { entityId: "1", username: "Catalog Member", signedIn: true, presenceRegionId: "19" },
        regionStatus: [{ regionId: 19, regionName: "Zephra" }],
        expected: "Zephra",
      },
      {
        name: "region fallback",
        player: { entityId: "2", username: "Fallback Member", signedIn: true, presenceRegionId: "19" },
        regionStatus: [],
        expected: "R19",
      },
      {
        name: "unavailable location",
        player: { entityId: "3", username: "Unavailable Member", signedIn: true, presenceRegionId: null },
        regionStatus: [{ regionId: 19, regionName: "Zephra" }],
        expected: "Location unavailable",
      },
    ];

    for (const testCase of cases) {
      const data = normalizeData({
        claim: { entityId: "55", name: "Timbersteel", regionId: 19 },
        members: { members: [{ playerEntityId: testCase.player.entityId, userName: testCase.player.username }] },
        players: { players: [testCase.player] },
        region: { regions: testCase.regionStatus },
      });
      const markup = renderToStaticMarkup(React.createElement(Dashboard, {
        data,
        activity: [],
        marketHistory: null,
        dashboardSummary: null,
        lastUpdated: null,
        onNavigate() {},
      }));
      assert.match(markup, new RegExp(`<small>${testCase.expected}<\\/small>`), testCase.name);
    }
  } finally {
    await vite.close();
  }
});

test("clicking a DataTable header overrides the Members default row order", async () => {
  const appRoot = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createViteServer({
    root: appRoot,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const originalUseMemo = React.useMemo;
  const originalUseState = React.useState;
  let sortState;
  let initialized = false;
  React.useMemo = (calculate) => calculate();
  React.useState = (initial) => {
    if (!initialized) {
      sortState = typeof initial === "function" ? initial() : initial;
      initialized = true;
    }
    return [sortState, (update) => {
      sortState = typeof update === "function" ? update(sortState) : update;
    }];
  };
  try {
    const { DataTable } = await vite.ssrLoadModule("/src/components/main/DataTable.tsx");
    const rows = orderMembersByDefault([
      { playerEntityId: "1", username: "Zed", player: { signedIn: true, sessionSeconds: 540 } },
      { playerEntityId: "2", username: "Ada", player: { signedIn: false } },
    ]);
    const props = {
      rows,
      columns: [["Username", (row) => row.username, (row) => row.username]],
      emptyState: "No members",
      scrollLabel: "Settlement roster table",
    };
    const renderedUsernames = (tree) => findElements(tree, (element) => element.type === "tbody")
      .flatMap((tbody) => findElements(tbody.props.children, (element) => element.type === "tr"))
      .map((row) => elementText(row));

    let tree = DataTable(props);
    assert.deepEqual(renderedUsernames(tree), ["Zed", "Ada"]);

    const usernameSort = findElements(
      tree,
      (element) => element.type === "button" && element.props["aria-label"] === "Sort by Username",
    )[0];
    assert.ok(usernameSort, "sortable Username header should render");
    usernameSort.props.onClick();

    tree = DataTable(props);
    assert.deepEqual(renderedUsernames(tree), ["Ada", "Zed"]);
  } finally {
    React.useMemo = originalUseMemo;
    React.useState = originalUseState;
    await vite.close();
  }
});
