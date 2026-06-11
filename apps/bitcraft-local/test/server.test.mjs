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
  let proxyCacheRequests = 0;
  let resourceCatalogRequests = 0;
  let creatureCatalogRequests = 0;
  let passiveCraftRequests = 0;
  let playerDetailRequests = 0;
  let craftContributionRequests = 0;
  let playerCraftRequests = 0;
  let craftEntityRevision = 0;
  let craftOwnerUsername = "Tester";
  const upstream = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/cache-test") {
      proxyCacheRequests += 1;
      return setTimeout(() => json(res, { ok: true, request: proxyCacheRequests }), 75);
    }
    if (url.pathname === "/api/resources") {
      resourceCatalogRequests += 1;
      return json(res, { resources: [{ id: 21, name: "Oak Tree", tier: 2 }] });
    }
    if (url.pathname === "/api/creatures") {
      creatureCatalogRequests += 1;
      return json(res, { creatures: [{ enemyType: 42, name: "Sagi Bird", huntable: true }] });
    }
    if (url.pathname === "/api/claims") {
      const regionId = url.searchParams.get("regionId");
      return json(res, { claims: regionId === "19" ? [{ entityId: claimId, name: "Timbersteel Trade", regionId: "19", treasury: 300 }] : [], count: regionId === "19" ? 1 : 0 });
    }
    if (url.pathname === `/api/claims/${claimId}`) return json(res, { claim: { entityId: claimId, supplies: 500, treasury: 300 } });
    if (url.pathname === `/api/claims/${claimId}/members`) return json(res, { members: [{ playerEntityId: "player-1", userName: "Tester" }] });
    if (url.pathname === `/api/claims/${claimId}/citizens`) return json(res, { citizens: [] });
    if (url.pathname === `/api/claims/${claimId}/buildings`) return json(res, { buildings: [] });
    if (url.pathname === `/api/claims/${claimId}/inventories`) return json(res, { buildings: [{ entityId: "storage-1", buildingName: "Basic Storage Chest", buildingNickname: "Ingots" }] });
    if (url.pathname === `/api/claims/${claimId}/construction`) return json(res, { projects: [] });
    if (url.pathname === `/api/claims/${claimId}/research`) return json(res, { research: [] });
    if (url.pathname === "/api/players/player-1") {
      playerDetailRequests += 1;
      return json(res, { player: { playerEntityId: "player-1", username: "Tester", signedIn: true } });
    }
    if (url.pathname === "/api/regions/status") return json(res, { regions: [{ id: "19", name: "Zephra" }] });
    if (url.pathname === "/api/stats/trade-volume") return json(res, { buckets: [], items: [], regions: [] });
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
    if (url.pathname === "/api/players/player-1/passive-crafts") {
      passiveCraftRequests += 1;
      return json(res, {
        items: [{ id: "passive-item-1", name: "Fine Timber", tier: 4 }],
        craftResults: [
          { recipeName: "Collect {0}", buildingName: "Forestry Camp", status: "complete", timestamp: "2026-05-20T12:10:00.000Z", craftedItem: [{ item_id: "passive-item-1", quantity: 3 }] },
          { recipeName: "Collect {0}", buildingName: "Forestry Camp", status: "complete", timestamp: "2026-05-20T12:20:00.000Z", craftedItem: [{ item_id: "passive-item-1", quantity: 2 }] },
        ],
      });
    }
    if (url.pathname === `/api/crafts`) return json(res, {
      craftResults: [
        { entityId: `public-craft-${craftEntityRevision}`, claimEntityId: claimId, buildingName: "Public Station", ownerUsername: craftOwnerUsername, isPublic: true, craftedItem: [{ item_id: "craft-item-1" }], totalActionsRequired: 100, progress: 20 + craftEntityRevision },
      ],
      items: [{ id: "craft-item-1", name: "Public Output", tier: 2 }],
      cargos: [],
    });
    if (url.pathname === "/api/crafts/public-craft-0/contributions" || url.pathname === "/api/crafts/public-craft-1/contributions" || url.pathname === "/api/crafts/public-craft-2/contributions") {
      craftContributionRequests += 1;
      return json(res, { contributions: [{
        contributorEntityId: "player-1",
        contributorUsername: "Tester",
        totalProgressContributed: 25 + craftEntityRevision,
        contributionCount: 2 + craftEntityRevision,
        firstContributedAt: "2026-05-20T12:00:00.000Z",
        lastContributedAt: new Date().toISOString(),
      }] });
    }
    if (url.pathname === "/api/players/player-1/crafts") {
      playerCraftRequests += 1;
      return json(res, {
        craftResults: [
          { entityId: `public-craft-${craftEntityRevision}`, claimEntityId: claimId, buildingName: "Public Station", ownerUsername: "Tester", isPublic: true, craftedItem: [{ item_id: "craft-item-1" }], totalActionsRequired: 100, progress: 20 + craftEntityRevision },
          { entityId: "private-craft", claimEntityId: claimId, buildingName: "Private Scholar Station", ownerUsername: "Tester", isPublic: false, craftedItem: [{ item_id: "craft-item-2" }], totalActionsRequired: 200, progress: 10 },
          { entityId: "foreign-private-craft", claimEntityId: "other-claim", buildingName: "Other Claim Station", ownerUsername: "Tester", isPublic: false, craftedItem: [{ item_id: "craft-item-3" }], totalActionsRequired: 300, progress: 10 },
        ],
        items: [{ id: "craft-item-2", name: "Private Output", tier: 3 }],
        cargos: [],
      });
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
      DISCORD_OAUTH_CLIENT_ID: "1511277824525471826",
      DISCORD_OAUTH_CLIENT_SECRET: "test-discord-oauth-secret",
    },
    stdio: "ignore",
  });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);
  const health = await fetch(`${origin}/api/local/health`);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(health.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(health.headers.get("content-security-policy") ?? "", /default-src 'self'/);

  const [proxyOne, proxyTwo] = await Promise.all([
    fetch(`${origin}/api/bitjita/cache-test?same=1`),
    fetch(`${origin}/api/bitjita/cache-test?same=1`),
  ]);
  assert.equal(proxyOne.status, 200);
  assert.equal(proxyTwo.status, 200);
  assert.equal(proxyCacheRequests, 1);
  assert.equal(proxyOne.headers.get("x-bitjita-cache"), "miss");
  assert.equal(proxyTwo.headers.get("x-bitjita-cache"), "deduped");
  assert.deepEqual(await proxyOne.json(), { ok: true, request: 1 });
  assert.deepEqual(await proxyTwo.json(), { ok: true, request: 1 });
  const proxiedResourcesOne = await fetch(`${origin}/api/bitjita/resources`);
  const proxiedResourcesTwo = await fetch(`${origin}/api/bitjita/resources`);
  assert.equal(proxiedResourcesOne.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(proxiedResourcesOne.headers.get("x-bitjita-cache"), "miss");
  assert.equal(proxiedResourcesTwo.headers.get("x-bitjita-cache"), "hit");
  const mapCatalogOne = await fetch(`${origin}/api/local/map/catalog`).then((response) => response.json());
  const mapCatalogTwo = await fetch(`${origin}/api/local/map/catalog`).then((response) => response.json());
  assert.deepEqual(mapCatalogOne.resources, [{ id: 21, name: "Oak Tree", tier: 2 }]);
  assert.deepEqual(mapCatalogTwo.creatures, [{ enemyType: 42, name: "Sagi Bird", huntable: true }]);
  assert.equal(resourceCatalogRequests, 2);
  assert.equal(creatureCatalogRequests, 1);
  const playerDetailPayload = { members: [{ playerEntityId: "player-1", userName: "Tester" }] };
  const playerDetailsOne = await fetch(`${origin}/api/local/player-details`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(playerDetailPayload),
  }).then((response) => response.json());
  const playerDetailsTwo = await fetch(`${origin}/api/local/player-details`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(playerDetailPayload),
  }).then((response) => response.json());
  assert.equal(playerDetailsOne.players[0].username, "Tester");
  assert.equal(playerDetailsTwo.players[0].signedIn, true);
  assert.equal(playerDetailRequests, 1);
  const dashboardDataOne = await fetch(`${origin}/api/local/dashboard-data?claimId=${claimId}`).then((response) => response.json());
  const dashboardDataTwo = await fetch(`${origin}/api/local/dashboard-data?claimId=${claimId}`).then((response) => response.json());
  assert.equal(dashboardDataOne.players[0].username, "Tester");
  assert.equal(dashboardDataOne.market.listings.length, 2);
  assert.equal(dashboardDataOne.region.claims.length >= 0, true);
  assert.equal(Array.isArray(dashboardDataOne.contributions["public-craft-0"]), true);
  assert.equal(Array.isArray(dashboardDataTwo.contributions["public-craft-0"]), true);
  assert.equal(playerDetailRequests, 1);
  assert.equal(craftContributionRequests, 1);
  const passivePayload = { members: [{ playerEntityId: "player-1", userName: "Tester" }] };
  const passiveOne = await fetch(`${origin}/api/local/passive-crafts`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(passivePayload),
  }).then((response) => response.json());
  const passiveTwo = await fetch(`${origin}/api/local/passive-crafts`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(passivePayload),
  }).then((response) => response.json());
  assert.equal(passiveOne.rows[0].recipe, "Collect Fine Timber");
  assert.equal(passiveOne.rows[0].quantity, 5);
  assert.equal(passiveOne.rows[0].memberName, "Tester");
  assert.equal(passiveTwo.rows[0].recipe, "Collect Fine Timber");
  assert.equal(passiveCraftRequests, 1);
  const productionCraftPayload = { claimId, members: [{ playerEntityId: "player-1", userName: "Tester" }] };
  const productionOne = await fetch(`${origin}/api/local/production/crafts`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(productionCraftPayload),
  }).then((response) => response.json());
  const productionTwo = await fetch(`${origin}/api/local/production/crafts`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(productionCraftPayload),
  }).then((response) => response.json());
  assert.equal(productionOne.publicCount, 1);
  assert.equal(productionOne.privateCount, 1);
  assert.deepEqual(productionOne.craftResults.map((craft) => craft.entityId).sort(), ["private-craft", "public-craft-0"]);
  assert.equal(productionOne.craftResults.find((craft) => craft.entityId === "private-craft").isPublic, false);
  assert.equal(productionTwo.privateCount, 1);
  assert.equal(playerCraftRequests, 1);

  const setup = await fetch(`${origin}/api/local/admin/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "admin", password: "correct horse battery", setupKey: "test-setup-key" }),
  });
  assert.equal(setup.status, 200);
  const auth = await setup.json();
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  assert.ok(auth.csrfToken);
  assert.equal(auth.user.role, "owner");
  const initialConfig = await fetch(`${origin}/api/local/config`).then((response) => response.json());
  assert.equal(initialConfig.analytics, undefined);
  const productionNotificationSettings = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({
      ...initialConfig,
      discord: {
        ...initialConfig.discord,
        productionMinXp: 0,
        productionMinAgeMinutes: 0,
      },
    }),
  });
  assert.equal(productionNotificationSettings.status, 200);
  const authStatus = await fetch(`${origin}/api/local/auth/me`).then((response) => response.json());
  assert.equal(authStatus.discordLoginEnabled, true);
  assert.equal(authStatus.user, null);
  const oauthStart = await fetch(`${origin}/api/local/auth/discord/start?returnTo=%2F%3Fpage%3Dmembers`, { redirect: "manual" });
  assert.equal(oauthStart.status, 302);
  const oauthLocation = oauthStart.headers.get("location");
  const oauthCookie = oauthStart.headers.get("set-cookie");
  assert.match(oauthLocation, /^https:\/\/discord\.com\/oauth2\/authorize/);
  assert.match(oauthCookie, /bitcraft_discord_oauth_state=/);
  const signedStateCookie = oauthCookie.match(/bitcraft_discord_oauth_state=([^;]+)/)?.[1] ?? "";
  assert.match(decodeURIComponent(signedStateCookie), /^[^.]+\.[^.]+$/);
  const oauthState = new URL(oauthLocation).searchParams.get("state");
  const signedStateValue = decodeURIComponent(signedStateCookie);
  const tamperedValue = `${signedStateValue.slice(0, -1)}${signedStateValue.endsWith("x") ? "y" : "x"}`;
  const tamperedCallback = await fetch(`${origin}/api/local/auth/discord/callback?code=fake-code&state=${oauthState}`, {
    headers: { cookie: `bitcraft_discord_oauth_state=${encodeURIComponent(tamperedValue)}` },
    redirect: "manual",
  });
  assert.equal(tamperedCallback.status, 302);
  assert.match(tamperedCallback.headers.get("location"), /auth=discord-error/);
  const anonymousCharacterLink = await fetch(`${origin}/api/local/auth/character`, {
    method: "PUT",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ characterPlayerId: "player-1", characterName: "Tester" }),
  });
  assert.equal(anonymousCharacterLink.status, 401);
  const linkedAccounts = await fetch(`${origin}/api/local/admin/user-accounts`, {
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.deepEqual(linkedAccounts.accounts, []);
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
  const oversizedAnalytics = await fetch(`${origin}/api/local/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: analyticsCookie },
    body: JSON.stringify({ sessionId: "session-identifier-0001", eventName: "page_view", page: "production", filler: "x".repeat(9000) }),
  });
  assert.equal(oversizedAnalytics.status, 413);
  const analyticsDashboard = await fetch(`${origin}/api/local/admin/analytics?days=30`, {
    method: "GET",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.equal(analyticsDashboard.totals.visitors, 1);
  assert.equal(analyticsDashboard.totals.pageViews, 1);
  assert.equal(analyticsDashboard.totals.interactions, 1);
  assert.equal(analyticsDashboard.totals.durationSeconds, 90);
  const createViewer = await fetch(`${origin}/api/local/admin/users`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ username: "viewer", password: "viewer password ok", role: "viewer" }),
  });
  assert.equal(createViewer.status, 201);
  const viewerLogin = await fetch(`${origin}/api/local/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "viewer", password: "viewer password ok" }),
  });
  assert.equal(viewerLogin.status, 200);
  const viewerAuth = await viewerLogin.json();
  const viewerCookie = viewerLogin.headers.get("set-cookie").split(";")[0];
  assert.equal(viewerAuth.user.role, "viewer");
  const viewerStatus = await fetch(`${origin}/api/local/admin/status`, { headers: { cookie: viewerCookie, origin } });
  assert.equal(viewerStatus.status, 200);
  const viewerSettingsMutation = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie: viewerCookie, origin, "content-type": "application/json", "x-csrf-token": viewerAuth.csrfToken },
    body: JSON.stringify({}),
  });
  assert.equal(viewerSettingsMutation.status, 403);
  const viewerUserList = await fetch(`${origin}/api/local/admin/users`, { headers: { cookie: viewerCookie, origin } });
  assert.equal(viewerUserList.status, 403);

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
  assert.equal(storageEvent.summary, "Tester deposited 12 Bronze Ingot to Ingots");
  assert.equal(JSON.parse(storageEvent.metadata_json).containerName, "Ingots");
  assert.equal(baselineActivity.total >= baselineActivity.events.length, true);
  const baselineSnapshots = await fetch(`${origin}/api/local/snapshots?claimId=${claimId}&limit=10`).then((response) => response.json());
  assert.equal(baselineSnapshots.snapshots.length, 1);
  assert.equal(baselineSnapshots.snapshots[0].treasury, 300);
  assert.equal(baselineSnapshots.snapshots[0].supplies, 500);
  const aggregateHistory = await fetch(`${origin}/api/local/history?claimId=${claimId}`).then((response) => response.json());
  assert.equal(aggregateHistory.market.totals.confirmedSales, 1);
  assert.equal(aggregateHistory.activity.total >= aggregateHistory.activity.events.length, true);
  assert.equal(aggregateHistory.snapshots.snapshots.length, 1);
  assert.equal(aggregateHistory.snapshots.snapshots[0].treasury, 300);
  const dashboardHistory = await fetch(`${origin}/api/local/history?claimId=${claimId}&include=activity,dashboard&activityLimit=1`).then((response) => response.json());
  assert.equal(dashboardHistory.activity.events.length, 1);
  assert.equal(typeof dashboardHistory.dashboard.treasuryNetToday, "number");
  assert.equal(Array.isArray(dashboardHistory.dashboard.recentActivity), true);
  assert.equal("market" in dashboardHistory, false);
  assert.equal("snapshots" in dashboardHistory, false);
  const clampedHistory = await fetch(`${origin}/api/local/history?claimId=${claimId}&include=activity&activityLimit=-50`).then((response) => response.json());
  assert.equal(clampedHistory.activity.events.length, 1);
  const activityOnlyHistory = await fetch(`${origin}/api/local/history?claimId=${claimId}&include=activity`).then((response) => response.json());
  assert.equal("activity" in activityOnlyHistory, true);
  assert.equal("market" in activityOnlyHistory, false);
  assert.equal("snapshots" in activityOnlyHistory, false);
  assert.equal(activityOnlyHistory.activity.total >= activityOnlyHistory.activity.events.length, true);
  const marketSnapshotHistory = await fetch(`${origin}/api/local/history?claimId=${claimId}&include=market,snapshots`).then((response) => response.json());
  assert.equal(marketSnapshotHistory.market.totals.confirmedSales, 1);
  assert.equal(marketSnapshotHistory.snapshots.snapshots.length, 1);
  assert.equal("activity" in marketSnapshotHistory, false);

  currentListings = [{ ...listings[0], quantity: 9 }, listings[1]];
  craftEntityRevision = 1;
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
  assert.deepEqual(requestedPages.sort(), [1, 1, 1, 1, 2, 2, 2, 2]);
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
  assert.equal(secondActivity.events.filter((event) => event.event_type === "production_started").length, 1);

  currentListings = [{ ...listings[0], quantity: 8 }, listings[1]];
  craftEntityRevision = 2;
  craftOwnerUsername = "OtherTester";
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
  const thirdActivity = await fetch(`${origin}/api/local/activity?claimId=${claimId}&limit=20`).then((response) => response.json());
  assert.equal(thirdActivity.events.filter((event) => event.event_type === "production_started").length, 1);
  assert.equal(thirdActivity.events.filter((event) => event.event_type === "production_started" && event.summary.includes("Public Output")).length, 1);
  const contributionLeaderboard = await fetch(`${origin}/api/local/leaderboard?claimId=${claimId}`).then((response) => response.json());
  assert.equal(contributionLeaderboard.summary.contributorCount, 1);
  assert.equal(contributionLeaderboard.summary.recordedCrafts, 3);
  assert.equal(contributionLeaderboard.summary.totalProgress, 78);
  assert.equal(contributionLeaderboard.contributors[0].name, "Tester");
  assert.equal(contributionLeaderboard.contributors[0].totalProgress, 78);

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

  let rateLimited = null;
  for (let index = 0; index < 35; index += 1) {
    const response = await fetch(`${origin}/api/local/auth/discord/start?returnTo=%2F`, { redirect: "manual" });
    if (response.status === 429) {
      rateLimited = response;
      break;
    }
  }
  assert.equal(rateLimited?.status, 429);
  assert.ok(Number(rateLimited.headers.get("retry-after")) > 0);
});
