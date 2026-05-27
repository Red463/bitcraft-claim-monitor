import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const claimId = "1369094286777412590";

function json(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

async function availablePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(origin, child) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/local/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for server health");
}

async function stop(child) {
  if (child.exitCode != null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}

test("server collection paginates listings and protects production mutations", async (t) => {
  const requestedPages = [];
  const listings = [
    { entityId: "listing-1", itemName: "Bronze Ingot", ownerUsername: "Tester", ownerEntityId: "player-1", itemId: 10, itemType: "item", quantity: 12, price: 4, side: "sell" },
    { entityId: "listing-2", itemName: "Oak Plank", ownerUsername: "Tester", ownerEntityId: "player-1", itemId: 20, itemType: "item", quantity: 8, price: 6, side: "sell" },
  ];
  let currentListings = listings;
  const historicalTrade = { id: "historic-1", orderEntityId: "historic-order", itemId: 30, itemType: "0", itemName: "Leather", sellerEntityId: "player-1", sellerUsername: "Tester", purchaserUsername: "Buyer", quantity: 5, unitPrice: 10, totalPrice: 50, createdAt: "2026-05-20T12:00:00.000Z" };
  const foreignTrade = { ...historicalTrade, id: "foreign-1", orderEntityId: "foreign-order", totalPrice: 999, unitPrice: 999 };
  let trades = [historicalTrade];
  const upstream = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === `/api/claims/${claimId}`) return json(res, { claim: { entityId: claimId, supplies: 500, treasury: 300 } });
    if (url.pathname === `/api/claims/${claimId}/members`) return json(res, { members: [{ playerEntityId: "player-1", userName: "Tester" }] });
    if (url.pathname === `/api/claims/${claimId}/buildings`) return json(res, { buildings: [] });
    if (url.pathname === `/api/claims/${claimId}/inventories`) return json(res, { buildings: [{ entityId: "storage-1", buildingName: "Basic Storage Chest", buildingNickname: "Ingots" }] });
    if (url.pathname === "/api/logs/storage") return json(res, {
      items: [{ id: "item-1", name: "Bronze Ingot" }],
      logs: [{ id: "log-1", timestamp: "2026-05-20T12:05:00.000Z", subjectName: "Tester", data: { type: "deposit", item_id: "item-1", quantity: 12 } }],
    });
    if (url.pathname === `/api/claims/${claimId}/market/listings`) {
      const page = Number(url.searchParams.get("page"));
      requestedPages.push(page);
      return json(res, { listings: [currentListings[page - 1]], totalPages: 2, page });
    }
    if (url.pathname === "/api/market/player/player-1/history") return json(res, {
      sellOrderHistory: [
        { entityId: "historic-order", claimEntityId: claimId, status: "COMPLETED" },
        { entityId: "foreign-order", claimEntityId: "other-claim", status: "COMPLETED" },
      ],
      totalSellOrders: 2,
    });
    if (url.pathname === "/api/market/player/player-1/trades") {
      const orderId = url.searchParams.get("orderEntityId");
      if (orderId === "historic-order") return json(res, { trades: [historicalTrade] });
      if (orderId === "foreign-order") return json(res, { trades: [foreignTrade] });
      return json(res, { trades });
    }
    return json(res, { error: "not found" }, 404);
  });
  const upstreamPort = await listen(upstream);
  t.after(() => new Promise((resolve) => upstream.close(resolve)));

  const appPort = await availablePort();
  const dataDir = path.join(appDir, `.test-data-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dataDir, { recursive: true });
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ENABLE_SERVER_POLLING: "false",
      ADMIN_SETUP_KEY: "test-setup-key",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      BITJITA_API_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: "ignore",
  });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);

  const setup = await fetch(`${origin}/api/local/admin/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "admin", password: "correct horse battery", setupKey: "test-setup-key" }),
  });
  assert.equal(setup.status, 200);
  const auth = await setup.json();
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  assert.ok(auth.csrfToken);
  const initialConfig = await fetch(`${origin}/api/local/config`).then((response) => response.json());
  assert.equal(initialConfig.analytics, undefined);
  const refusedAnalytics = await fetch(`${origin}/api/local/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ sessionId: "session-identifier-0001", eventName: "page_view", page: "production" }),
  });
  assert.equal(refusedAnalytics.status, 403);
  const analyticsCookie = "claim_monitor_analytics_consent=accepted; claim_monitor_analytics_visitor=visitor-identifier-0001";
  const analyticsView = await fetch(`${origin}/api/local/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: analyticsCookie },
    body: JSON.stringify({ sessionId: "session-identifier-0001", eventName: "page_view", page: "production" }),
  });
  assert.equal(analyticsView.status, 201);
  const analyticsUse = await fetch(`${origin}/api/local/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: analyticsCookie },
    body: JSON.stringify({ sessionId: "session-identifier-0001", eventName: "production_eligibility_filter_used", page: "production", properties: { scope: "member" } }),
  });
  assert.equal(analyticsUse.status, 201);
  const analyticsDuration = await fetch(`${origin}/api/local/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: analyticsCookie },
    body: JSON.stringify({ sessionId: "session-identifier-0001", eventName: "page_duration", page: "production", durationSeconds: 90 }),
  });
  assert.equal(analyticsDuration.status, 201);
  const analyticsDashboard = await fetch(`${origin}/api/local/admin/analytics?days=30`, {
    method: "GET",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.equal(analyticsDashboard.totals.visitors, 1);
  assert.equal(analyticsDashboard.totals.pageViews, 1);
  assert.equal(analyticsDashboard.totals.interactions, 1);
  assert.equal(analyticsDashboard.totals.durationSeconds, 90);

  const poll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(poll.status, 200);
  const baselineHistory = await fetch(`${origin}/api/local/market/history?claimId=${claimId}&owner=Tester`).then((response) => response.json());
  assert.equal(baselineHistory.totals.confirmedSales, 1);
  assert.equal(baselineHistory.totals.confirmedUnits, 5);
  assert.equal(baselineHistory.totals.trackedValue, 50);
  const baselineActivity = await fetch(`${origin}/api/local/activity?claimId=${claimId}&limit=20`).then((response) => response.json());
  const storageEvent = baselineActivity.events.find((event) => event.event_type === "storage");
  assert.equal(storageEvent.summary, "Tester deposited 12 Bronze Ingot");
  assert.equal(JSON.parse(storageEvent.metadata_json).containerName, "Ingots");
  assert.equal(baselineActivity.total >= baselineActivity.events.length, true);

  currentListings = [{ ...listings[0], quantity: 9 }, listings[1]];
  trades = [
    historicalTrade,
    { id: "fill-1", orderEntityId: "listing-1", itemId: 10, itemType: "item", sellerEntityId: "player-1", quantity: 1, price: 4, totalPrice: 4 },
    { id: "fill-2", orderEntityId: "listing-1", itemId: 10, itemType: "item", sellerEntityId: "player-1", quantity: 2, price: 4, totalPrice: 8 },
  ];
  const secondPoll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(secondPoll.status, 200);

  const history = await fetch(`${origin}/api/local/market/history?claimId=${claimId}&owner=Tester`).then((response) => response.json());
  assert.deepEqual(requestedPages.sort(), [1, 1, 2, 2]);
  assert.equal(history.liveListings.length, 2);
  assert.equal(history.totals.newListings, 2);
  assert.equal(history.totals.confirmedSales, 3);
  assert.equal(history.totals.confirmedUnits, 8);
  assert.equal(history.totals.trackedValue, 62);
  assert.equal(history.sales.length, 3);
  assert.equal(history.topItems.some((item) => item.itemName === "Leather" && item.unitsSold === 5), true);
  assert.equal(history.events.some((event) => event.event_type === "partial_sale"), true);
  const secondActivity = await fetch(`${origin}/api/local/activity?claimId=${claimId}&limit=20`).then((response) => response.json());
  assert.equal(secondActivity.events.filter((event) => event.event_type === "storage").length, 1);

  currentListings = [{ ...listings[0], quantity: 8 }, listings[1]];
  const thirdPoll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(thirdPoll.status, 200);
  const afterOldFills = await fetch(`${origin}/api/local/market/history?claimId=${claimId}&owner=Tester`).then((response) => response.json());
  assert.equal(afterOldFills.totals.confirmedSales, 3);
  assert.equal(afterOldFills.totals.confirmedUnits, 8);
  assert.equal(afterOldFills.events.some((event) => event.event_type === "partial_quantity_drop"), true);

  const browserSnapshot = await fetch(`${origin}/api/local/snapshot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claimId, claim: {}, market: { listings: [] } }),
  });
  assert.equal(browserSnapshot.status, 403);

  const forgedSettings = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie, origin: "https://attacker.example", "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({}),
  });
  assert.equal(forgedSettings.status, 403);
});
