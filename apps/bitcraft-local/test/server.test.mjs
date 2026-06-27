import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

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

async function waitForCondition(description, check, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function stop(child) {
  if (child.exitCode != null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}

function zipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuffer, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt32LE(0, 12);
    entry.writeUInt32LE(0, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuffer.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt32LE(0, 34);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

test("server collection paginates listings and protects production mutations", async (t) => {
  const requestedPages = [];
  const seasonalClaimId = "seasonal-claim";
  const listings = [
    { entityId: "listing-1", itemName: "Bronze Ingot", ownerUsername: "Tester", ownerEntityId: "player-1", itemId: 10, itemType: "item", quantity: 12, price: 4, side: "sell" },
    { entityId: "listing-2", itemName: "Oak Plank", ownerUsername: "Tester", ownerEntityId: "player-1", itemId: 20, itemType: "item", quantity: 8, price: 6, side: "sell" },
  ];
  const buyListings = [
    { entityId: "buy-listing-1", claimEntityId: claimId, claimName: "Timbersteel Trade", regionId: 19, regionName: "Zephra", ownerUsername: "Buyer", ownerEntityId: "buyer-1", itemId: 30, itemType: "0", itemName: "Leather", itemTier: 2, itemRarityStr: "Common", iconAssetName: "leather.png", quantity: 10, price: 12, storedCoins: 120, side: "buy", timestamp: "2026-05-20T12:00:00.000Z", inventoryPermission: true },
    { entityId: "buy-listing-2", claimEntityId: claimId, claimName: "Timbersteel Trade", regionId: 19, regionName: "Zephra", ownerUsername: "Buyer", ownerEntityId: "buyer-1", itemId: 31, itemType: "0", itemName: "Slow Gem", itemTier: 3, itemRarityStr: "Common", iconAssetName: "gem.png", quantity: 1, price: 100, storedCoins: 100, side: "buy", timestamp: "2026-05-20T12:00:00.000Z", inventoryPermission: true },
    { entityId: "buy-listing-3", claimEntityId: claimId, claimName: "Timbersteel Trade", regionId: 19, regionName: "Zephra", ownerUsername: "Buyer", ownerEntityId: "buyer-1", itemId: 32, itemType: "1", itemName: "Fine Timber Package", itemTier: 4, itemRarityStr: "Common", iconAssetName: "timber.png", quantity: 2, price: 50, storedCoins: 100, side: "buy", timestamp: "2026-05-20T12:00:00.000Z", inventoryPermission: true },
  ];
  const seasonalBuyListings = [
    { entityId: "buy-listing-r3", claimEntityId: seasonalClaimId, claimName: "Seasonal Market", regionId: 3, regionName: "Region 3", ownerUsername: "Regional Buyer", ownerEntityId: "buyer-r3", itemId: 30, itemType: "0", itemName: "Leather", itemTier: 2, itemRarityStr: "Common", iconAssetName: "leather.png", quantity: 5, price: 12, storedCoins: 60, side: "buy", timestamp: "2026-05-20T12:00:00.000Z", inventoryPermission: true },
  ];
  let currentListings = listings;
  const historicalTrade = { id: "historic-1", orderEntityId: "historic-order", itemId: 30, itemType: "0", itemName: "Leather", sellerEntityId: "player-1", sellerUsername: "Tester", purchaserUsername: "Buyer", quantity: 5, unitPrice: 10, totalPrice: 50, createdAt: "2026-05-20T12:00:00.000Z" };
  const foreignTrade = { ...historicalTrade, id: "foreign-1", orderEntityId: "foreign-order", totalPrice: 999, unitPrice: 999 };
  let trades = [historicalTrade];
  let proxyCacheRequests = 0;
  let failCacheTest = false;
  let resourceCatalogRequests = 0;
  let creatureCatalogRequests = 0;
  let passiveCraftRequests = 0;
  let playerDetailRequests = 0;
  let craftContributionRequests = 0;
  let playerCraftRequests = 0;
  let recipeDetailRequests = 0;
  let priceHistoryRequests = 0;
  let claimDetailRequests = 0;
  let memberListRequests = 0;
  let slowPriceHistoryResponded = false;
  let geoipDownloadRequests = 0;
  let ipapiRequests = 0;
  let craftEntityRevision = 0;
  let craftOwnerUsername = "Tester";
  let failClaimRefresh = false;
  let failResearchRefresh = false;
  let failEmpireList = false;
  const upstream = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/cache-test") {
      proxyCacheRequests += 1;
      if (failCacheTest) return json(res, { error: "upstream unavailable" }, 500);
      return setTimeout(() => json(res, { ok: true, request: proxyCacheRequests }), 75);
    }
    if (url.pathname === "/geoip/GeoLite2-City-CSV.zip") {
      geoipDownloadRequests += 1;
      const expectedAuth = `Basic ${Buffer.from("maxmind-account:maxmind-license").toString("base64")}`;
      if (req.headers.authorization !== expectedAuth) return json(res, { error: "unauthorized" }, 401);
      const zip = zipStore([
        ["GeoLite2-City-CSV_20260613/GeoLite2-City-Locations-en.csv", "geoname_id,locale_code,continent_code,continent_name,country_iso_code,country_name,subdivision_1_iso_code,subdivision_1_name,city_name\n123,en,EU,Europe,GB,United Kingdom,LND,London,London\n"],
        ["GeoLite2-City-CSV_20260613/GeoLite2-City-Blocks-IPv4.csv", "network,geoname_id,registered_country_geoname_id,represented_country_geoname_id,is_anonymous_proxy,is_satellite_provider,postal_code,latitude,longitude,accuracy_radius\n203.0.113.0/24,123,123,,0,0,,51.5,-0.1,50\n"],
      ]);
      res.writeHead(200, { "content-type": "application/zip" });
      return res.end(zip);
    }
    if (url.pathname === "/ipapi/198.51.100.9/json/") {
      ipapiRequests += 1;
      return json(res, { city: "Provider City", country_name: "Providerland" });
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
      if (regionId === "19") return json(res, { claims: [{ entityId: claimId, name: "Timbersteel Trade", regionId: "19", treasury: 300, empireEntityId: "empire-1" }], count: 1 });
      if (regionId === "3") return json(res, { claims: [{ entityId: seasonalClaimId, name: "Seasonal Market", regionId: "3", regionName: "Region 3", treasury: 100 }], count: 1 });
      return json(res, { claims: [], count: 0 });
    }
    if (url.pathname === `/api/claims/${claimId}`) {
      claimDetailRequests += 1;
      if (failClaimRefresh) return json(res, { error: "rate limited" }, 429);
      return json(res, { claim: { entityId: claimId, supplies: 500, treasury: 300, regionName: "Zephra" } });
    }
    if (url.pathname === `/api/claims/${claimId}/members`) {
      memberListRequests += 1;
      return json(res, { members: [{ playerEntityId: "player-1", userName: "Tester" }] });
    }
    if (url.pathname === `/api/claims/${claimId}/citizens`) return json(res, { citizens: [] });
    if (url.pathname === `/api/claims/${claimId}/buildings`) return json(res, { buildings: [] });
    if (url.pathname === `/api/claims/${claimId}/inventories`) return json(res, {
      buildings: [{
        entityId: "storage-1",
        buildingName: "Basic Storage Chest",
        buildingNickname: "Ingots",
        inventory: [{
          name: "Copper Ingot",
          tag: "Ingot",
          tier: 2,
          rarityStr: "Common",
          iconAssetName: "copper_ingot",
          contents: { item_type: "item", item_id: "ingot-1", quantity: 12 },
        }, {
          tag: "Berry",
          tier: 3,
          rarityStr: "Common",
          iconAssetName: "berry",
          contents: { item_type: "item", item_id: "berry-1", quantity: 24 },
        }],
      }],
    });
    if (url.pathname === `/api/claims/${claimId}/construction`) return json(res, { projects: [] });
    if (url.pathname === `/api/claims/${claimId}/research`) {
      if (failResearchRefresh) return json(res, { error: "research unavailable" }, 500);
      return json(res, { technologies: [{ entityId: "research-1", name: "Claim Upgrades", tier: 1, unlocked: true }] });
    }
    if (url.pathname === "/api/players/player-1") {
      playerDetailRequests += 1;
      return json(res, { player: { playerEntityId: "player-1", username: "Tester", signedIn: true } });
    }
    if (url.pathname === "/api/items/2020003") {
      recipeDetailRequests += 1;
      return json(res, {
        item: { id: "2020003", name: "Simple Plank", itemType: 0, tier: 2, rarityStr: "Common" },
        craftingRecipes: [],
        extractionRecipes: [],
      });
    }
    if (url.pathname === "/api/skills") return json(res, { skills: [{ id: 1, name: "Carpentry" }] });
    if (url.pathname === "/api/regions/status") return json(res, { regions: [{ regionId: 19, regionName: "Zephra", active: true, syncing: true, signedInPlayers: 42 }, { regionId: 3, regionName: "Region 3", active: true, syncing: false }] });
    if (url.pathname === "/api/regions") return json(res, [{ regionId: 23, regionName: "Region 22" }, { regionId: 19, regionName: "Zephra" }]);
    if (url.pathname === "/api/empires") {
      if (failEmpireList) return json(res, { error: "empire unavailable" }, 500);
      return json(res, [
      { entityId: "empire-1", name: "Test Empire", leader: "Leader One", leaderEntityId: "leader-1", memberCount: 3, territoryChunks: 12, numClaims: 4, empireCurrencyTreasury: 5000, locationX: 120, locationZ: 240, updatedAt: "2026-05-20T12:00:00.000Z" },
      { entityId: "empire-foreign", name: "Foreign Empire", leader: "Other", leaderEntityId: "leader-2", memberCount: 8, territoryChunks: 99, numClaims: 9, empireCurrencyTreasury: 9000, updatedAt: "2026-05-20T12:00:00.000Z" },
    ]);
    }
    if (url.pathname === "/api/empires/empire-1") return json(res, {
      empire: { entityId: "empire-1", name: "Test Empire", leaderEntityId: "leader-1" },
      members: [
        { entityId: "leader-1", playerName: "Leader One", rankTitle: "The Earth King", lastLoginTimestamp: "2026-05-01T12:00:00.000Z", buildPermission: true },
        { entityId: "citizen-1", playerName: "Citizen One", rankTitle: "Citizen", lastLoginTimestamp: "2026-05-20T12:00:00.000Z", inventoryPermission: true },
      ],
      count: 2,
    });
    if (url.pathname === "/api/empires/empire-1/towers") return json(res, [
      { entityId: "tower-1", locationX: 111, locationZ: 222, locationDimension: 0, energy: 75, upkeep: 10, active: true, nickname: "North Tower", siege: [] },
    ]);
    if (url.pathname === "/api/stats/trade-volume") return json(res, { buckets: [], items: [], regions: [] });
    if (url.pathname === "/api/logs/storage") return json(res, {
      items: [{ id: "item-1", name: "Bronze Ingot" }],
      logs: [{ id: "log-1", timestamp: "2026-05-20T12:05:00.000Z", subjectName: "Tester", data: { type: "deposit", item_id: "item-1", quantity: 12 } }],
    });
    if (url.pathname === `/api/claims/${claimId}/market/listings`) {
      if (url.searchParams.get("side") === "buy") {
        return json(res, { listings: buyListings, totalPages: 1, page: Number(url.searchParams.get("page") || 1) });
      }
      const page = Number(url.searchParams.get("page"));
      requestedPages.push(page);
      return json(res, { listings: [currentListings[page - 1]], totalPages: 2, page });
    }
    if (url.pathname === `/api/claims/${seasonalClaimId}/market/listings`) {
      if (url.searchParams.get("side") === "buy") return json(res, { listings: seasonalBuyListings, totalPages: 1, page: Number(url.searchParams.get("page") || 1) });
      return json(res, { listings: [], totalPages: 1, page: Number(url.searchParams.get("page") || 1) });
    }
    if (url.pathname === "/api/market/items/30/price-history") {
      priceHistoryRequests += 1;
      if (url.searchParams.get("regionId") !== "19") return json(res, { buckets: [] });
      return json(res, {
        buckets: [
          { bucket: "2026-05-18", quantity: 1, totalValue: 10 },
          { bucket: "2026-05-19", quantity: 1, totalValue: 10 },
          { bucket: "2026-05-20", quantity: 1, totalValue: 10 },
        ],
      });
    }
    if (url.pathname === "/api/market/items/31/price-history") {
      priceHistoryRequests += 1;
      if (url.searchParams.get("regionId") !== "19") return json(res, { buckets: [] });
      return setTimeout(() => {
        slowPriceHistoryResponded = true;
        json(res, {
          buckets: [
            { bucket: "2026-05-18", quantity: 1, totalValue: 80 },
            { bucket: "2026-05-19", quantity: 1, totalValue: 90 },
            { bucket: "2026-05-20", quantity: 1, totalValue: 95 },
          ],
        });
      }, 1000);
    }
    if (url.pathname === "/api/market/cargo/32/price-history") {
      priceHistoryRequests += 1;
      if (url.searchParams.get("regionId") !== "19") return json(res, { buckets: [] });
      return json(res, {
        priceStats: { avg7d: 40, totalTrades: 3 },
        buckets: [
          { bucket: "2026-05-18", quantity: 1, totalValue: 30 },
          { bucket: "2026-05-19", quantity: 1, totalValue: 30 },
          { bucket: "2026-05-20", quantity: 1, totalValue: 30 },
        ],
      });
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
      BITCRAFT_TEST: "true",
      ENABLE_LEGACY_ADMIN_PASSWORD_AUTH: "true",
      ENABLE_SERVER_POLLING: "false",
      ADMIN_SETUP_KEY: "test-setup-key",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      BITJITA_API_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
      BITJITA_PROXY_CACHE_MS: "100",
      BITJITA_PROXY_STALE_IF_ERROR_MS: "5000",
      EMPIRE_SCOUT_CACHE_TTL_MS: "100",
      IPAPI_BASE_URL: `http://127.0.0.1:${upstreamPort}/ipapi`,
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
  await new Promise((resolve) => setTimeout(resolve, 1100));
  failCacheTest = true;
  const staleProxy = await fetch(`${origin}/api/bitjita/cache-test?same=1`);
  assert.equal(staleProxy.status, 200);
  assert.equal(staleProxy.headers.get("x-bitjita-cache"), "stale-if-error");
  assert.equal(staleProxy.headers.get("x-bitjita-stale"), "1");
  assert.deepEqual(await staleProxy.json(), { ok: true, request: 1 });
  failCacheTest = false;
  const proxiedResourcesOne = await fetch(`${origin}/api/bitjita/resources`);
  const proxiedResourcesTwo = await fetch(`${origin}/api/bitjita/resources`);
  assert.equal(proxiedResourcesOne.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(proxiedResourcesOne.headers.get("x-bitjita-cache"), "miss");
  assert.equal(proxiedResourcesTwo.headers.get("x-bitjita-cache"), "hit");
  const mapCatalogOne = await fetch(`${origin}/api/local/map/catalog`).then((response) => response.json());
  const mapCatalogTwo = await fetch(`${origin}/api/local/map/catalog`).then((response) => response.json());
  assert.deepEqual(mapCatalogOne.resources, [{ id: 21, name: "Oak Tree", tier: 2 }]);
  assert.deepEqual(mapCatalogTwo.creatures, [{ enemyType: 42, name: "Sagi Bird", huntable: true }]);
  assert.equal(resourceCatalogRequests, 1);
  assert.equal(creatureCatalogRequests, 1);
  const activeRegions = await fetch(`${origin}/api/local/regions/active?include=24`).then((response) => response.json());
  assert.deepEqual(activeRegions.regions.map((region) => region.regionId), ["3", "19", "23", "24"]);
  assert.equal(activeRegions.regions.find((region) => region.regionId === "24").source, "admin");

  const regionalEmpires = await fetch(`${origin}/api/local/empires?regionId=19`).then((response) => response.json());
  assert.equal(regionalEmpires.summary.empires, 1);
  assert.equal(regionalEmpires.empires[0].name, "Test Empire");
  assert.equal(regionalEmpires.empires[0].regionalClaims, 1);
  failEmpireList = true;
  const cachedRegionalEmpires = await fetch(`${origin}/api/local/empires?regionId=99`).then((response) => response.json());
  assert.equal(cachedRegionalEmpires.summary.empires, 0);
  assert.deepEqual(cachedRegionalEmpires.empires, []);
  failEmpireList = false;
  const regionalWatchtowers = await fetch(`${origin}/api/local/empires/watchtowers?regionId=19&inactiveDays=14`).then((response) => response.json());
  assert.equal(regionalWatchtowers.summary.towerCount, 1);
  assert.equal(regionalWatchtowers.towers[0].nickname, "North Tower");
  assert.equal(regionalWatchtowers.towers[0].inactiveRisk, true);
  assert.equal(regionalWatchtowers.towers[0].locationX, 111);
  assert.equal(regionalWatchtowers.towers[0].accessMembers, undefined);
  assert.equal(regionalWatchtowers.empires[0].accessMembers.length, 2);
  assert.equal(regionalWatchtowers.empires[0].accessMembers.some((member) => member.hasStorage), true);
  assert.equal(regionalWatchtowers.empires[0].accessMembers.some((member) => member.canAddHexite), true);
  assert.equal(regionalWatchtowers.unclaimedAvailable, false);
  const recipeDetailOne = await fetch(`${origin}/api/local/recipe-detail?kind=items&id=2020003&name=Simple%20Plank`).then((response) => response.json());
  const recipeDetailTwo = await fetch(`${origin}/api/local/recipe-detail?kind=items&id=2020003&name=Simple%20Plank`).then((response) => response.json());
  assert.equal(recipeDetailOne.detail.item.name, "Simple Plank");
  assert.equal(recipeDetailOne.cached, false);
  assert.equal(recipeDetailTwo.detail.item.name, "Simple Plank");
  assert.equal(recipeDetailTwo.cached, true);
  assert.equal(recipeDetailRequests, 1);
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
  const missingPlayerDetails = await fetch(`${origin}/api/local/player-details`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ members: [{ playerEntityId: "player-missing", userName: "Fallback Tester" }] }),
  }).then((response) => response.json());
  assert.equal(missingPlayerDetails.players[0].entityId, "player-missing");
  assert.equal(missingPlayerDetails.players[0].username, "Fallback Tester");
  assert.equal(missingPlayerDetails.players[0].detailAvailable, false);
  assert.equal(missingPlayerDetails.failed, 1);
  assert.equal(playerDetailRequests, 1);
  const dashboardDataOne = await fetch(`${origin}/api/local/dashboard-data?claimId=${claimId}`).then((response) => response.json());
  const claimRequestsAfterDashboardOne = claimDetailRequests;
  const memberRequestsAfterDashboardOne = memberListRequests;
  const marketPageRequestsAfterDashboardOne = requestedPages.length;
  const dashboardDataTwo = await fetch(`${origin}/api/local/dashboard-data?claimId=${claimId}`).then((response) => response.json());
  assert.equal(dashboardDataOne.players[0].username, "Tester");
  assert.equal(dashboardDataOne.market.listings.length, 2);
  assert.equal(dashboardDataOne.region.claims.length >= 0, true);
  assert.equal(Array.isArray(dashboardDataOne.contributions["public-craft-0"]), true);
  assert.equal(Array.isArray(dashboardDataTwo.contributions["public-craft-0"]), true);
  assert.equal(claimDetailRequests, claimRequestsAfterDashboardOne);
  assert.equal(memberListRequests, memberRequestsAfterDashboardOne);
  assert.equal(requestedPages.length, marketPageRequestsAfterDashboardOne);
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
  const initialCollect = await fetch(`${origin}/api/local/admin/collect-now`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(initialCollect.status, 200);
  await waitForCondition("regional buy-order cache", () => {
    const checkDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
    const count = checkDb.prepare("SELECT COUNT(*) AS count FROM market_buy_orders_current WHERE claim_id = ? AND region_id = '19' AND active = 1").get(claimId).count;
    checkDb.close();
    return count === 3;
  });
  const appDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
  assert.equal(appDb.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'current_claim_state'").get().count, 0);
  assert.equal(appDb.prepare("SELECT COUNT(*) AS count FROM market_buy_orders_current WHERE claim_id = ? AND region_id = '19' AND active = 1").get(claimId).count, 3);
  appDb.close();
  const staleRegionalDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  staleRegionalDb.prepare(`
    INSERT OR REPLACE INTO market_buy_orders_current (
      claim_id, order_key, region_id, region_name, market_claim_id, market_claim_name,
      buyer_entity_id, buyer_name, item_id, item_type, item_name, quantity, unit_price,
      total_value, stored_coins, first_seen, last_seen, active, raw_json, updated_at
    )
    VALUES (?, 'stale-r9-order', '9', 'Old Region', 'old-claim', 'Old Market', 'buyer-9', 'Old Buyer', '999', '0', 'Old Regional Item', 1, 1, 1, 1, ?, ?, 1, '{}', ?)
  `).run(claimId, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
  staleRegionalDb.prepare(`
    INSERT OR REPLACE INTO market_regional_sale_averages_current (
      claim_id, region_id, item_id, item_type, item_name, average_unit_price, sales_count,
      units_sold, total_value, window_days, first_bucket_at, last_bucket_at, raw_json, updated_at
    )
    VALUES (?, '9', '999', '0', 'Old Regional Item', 1, 3, 3, 3, 7, '2026-05-18', '2026-05-20', '{}', ?)
  `).run(claimId, new Date().toISOString());
  staleRegionalDb.prepare(`
    INSERT OR REPLACE INTO market_regional_sale_averages_current (
      claim_id, region_id, item_id, item_type, item_name, average_unit_price, sales_count,
      units_sold, total_value, window_days, first_bucket_at, last_bucket_at, raw_json, updated_at
    )
    VALUES (?, '19', '998', '0', 'Empty Old Baseline', 0, 0, 0, 0, 7, NULL, NULL, '{"buckets":[]}', ?)
  `).run(claimId, new Date().toISOString());
  staleRegionalDb.close();
  const buyOrdersBeforeSales = await fetch(`${origin}/api/local/market/buy-orders?claimId=${claimId}&regionId=19&search=Leather&pageSize=25&sort=unitPrice&direction=desc`).then((response) => response.json());
  assert.equal(buyOrdersBeforeSales.total, 1);
  assert.equal(buyOrdersBeforeSales.rows[0].itemName, "Leather");
  assert.equal(buyOrdersBeforeSales.opportunities.length, 0);
  assert.equal(priceHistoryRequests, 0);
  const regionalBuyOrders = await fetch(`${origin}/api/local/market/buy-orders?claimId=${claimId}&regionId=3&search=Leather&pageSize=25&sort=unitPrice&direction=desc`).then((response) => response.json());
  assert.equal(regionalBuyOrders.total, 0);
  const baselineJob = await fetch(`${origin}/api/local/admin/jobs/run`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ key: "regional_buy_order_sale_baselines_refresh" }),
  });
  assert.equal(baselineJob.status, 202);
  await waitForCondition("incremental regional buy-order sale baseline write", () => {
    const checkDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
    const count = checkDb.prepare("SELECT COUNT(*) AS count FROM market_regional_sale_averages_current WHERE claim_id = ? AND item_id = '30'").get(claimId).count;
    checkDb.close();
    return count > 0;
  });
  const runningBaselineJobs = await fetch(`${origin}/api/local/admin/jobs`, {
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  const runningBaselineJob = runningBaselineJobs.jobs.find((job) => job.key === "regional_buy_order_sale_baselines_refresh");
  assert.equal(runningBaselineJob.metadata.total ?? runningBaselineJob.metadata.uniqueItemCount, 3);
  assert.ok(runningBaselineJob.metadata.averageCount >= 1);
  assert.equal(slowPriceHistoryResponded, false);
  await waitForCondition("regional buy-order sale baseline refresh", () => {
    const checkDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
    const count = checkDb.prepare("SELECT COUNT(*) AS count FROM market_regional_sale_averages_current WHERE claim_id = ?").get(claimId).count;
    checkDb.close();
    return count === 3;
  });
  const scopedBaselineDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
  assert.equal(scopedBaselineDb.prepare("SELECT COUNT(*) AS count FROM market_regional_sale_averages_current WHERE claim_id = ? AND region_id = '9'").get(claimId).count, 0);
  assert.equal(scopedBaselineDb.prepare("SELECT COUNT(*) AS count FROM market_regional_sale_averages_current WHERE claim_id = ? AND region_id = '19' AND item_id = '998'").get(claimId).count, 0);
  assert.equal(scopedBaselineDb.prepare("SELECT active FROM market_buy_orders_current WHERE claim_id = ? AND order_key = 'stale-r9-order'").get(claimId).active, 0);
  assert.equal(scopedBaselineDb.prepare("SELECT average_unit_price FROM market_regional_sale_averages_current WHERE claim_id = ? AND item_id = '32' AND item_type = '1'").get(claimId).average_unit_price, 40);
  assert.equal(scopedBaselineDb.prepare("SELECT raw_json FROM market_regional_sale_averages_current WHERE claim_id = ? AND item_id = '32' AND item_type = '1'").get(claimId).raw_json.includes('"buckets"'), false);
  scopedBaselineDb.close();
  assert.equal(priceHistoryRequests, 3);
  const buyOrdersAfterBaselineJob = await fetch(`${origin}/api/local/market/buy-orders?claimId=${claimId}&regionId=19&search=Leather&pageSize=25&sort=premium&direction=desc`).then((response) => response.json());
  assert.equal(buyOrdersAfterBaselineJob.opportunities.length, 1);
  assert.equal(Math.round(buyOrdersAfterBaselineJob.opportunities[0].premiumPercent), 20);  const anonymousDealWatch = await fetch(`${origin}/api/local/market/deal-watches`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ regionId: "19", itemId: 30, itemType: 0, itemName: "Leather" }),
  });
  assert.equal(anonymousDealWatch.status, 401);
  const dealSessionToken = "deal-watch-test-session";
  const dealDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  dealDb.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, discord_global_name, discord_avatar, character_player_id, character_name, character_status, settings_json, created_at, last_login_at)
    VALUES ('deal-discord-user', 'DealUser', 'Deal User', NULL, NULL, NULL, 'unlinked', '{}', ?, ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  const dealUserId = dealDb.prepare("SELECT id FROM user_accounts WHERE discord_id = 'deal-discord-user'").get().id;
  dealDb.prepare("INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(createHash("sha256").update(dealSessionToken).digest("hex"), dealUserId, new Date(Date.now() + 86400000).toISOString(), new Date().toISOString());
  dealDb.close();
  const dealCookie = `bitcraft_user_session=${encodeURIComponent(dealSessionToken)}`;
  const createdDealWatch = await fetch(`${origin}/api/local/market/deal-watches`, {
    method: "POST",
    headers: { cookie: dealCookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ regionId: "19", itemId: 30, itemType: 0, itemName: "Leather", tier: 2, rarity: "Common", iconAssetName: "leather.png" }),
  });
  assert.equal(createdDealWatch.status, 201);
  const duplicateDealWatch = await fetch(`${origin}/api/local/market/deal-watches`, {
    method: "POST",
    headers: { cookie: dealCookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ regionId: "19", itemId: 30, itemType: 0, itemName: "Leather" }),
  });
  assert.equal(duplicateDealWatch.status, 409);
  currentListings = [
    { entityId: "deal-sell-1", claimEntityId: claimId, claimName: "Timbersteel Trade", regionId: 19, regionName: "Zephra", ownerUsername: "Seller", ownerEntityId: "seller-1", itemId: 30, itemType: "0", itemName: "Leather", itemTier: 2, itemRarityStr: "Common", iconAssetName: "leather.png", quantity: 2, price: 6, side: "sell", timestamp: "2026-05-20T12:00:00.000Z", inventoryPermission: true },
    { entityId: "deal-sell-filler", claimEntityId: claimId, claimName: "Timbersteel Trade", regionId: 19, regionName: "Zephra", ownerUsername: "Seller", ownerEntityId: "seller-1", itemId: 20, itemType: "0", itemName: "Oak Plank", quantity: 1, price: 100, side: "sell", timestamp: "2026-05-20T12:00:00.000Z", inventoryPermission: true },
  ];
  const dealJob = await fetch(`${origin}/api/local/admin/jobs/run`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ key: "market_deal_watch" }),
  });
  assert.equal(dealJob.status, 202);
  await waitForCondition("market deal watch alert", async () => {
    const payload = await fetch(`${origin}/api/local/market/deal-alerts`, { headers: { cookie: dealCookie, origin } }).then((response) => response.json());
    return payload.alerts?.length === 1 ? payload : null;
  });
  const dealAlerts = await fetch(`${origin}/api/local/market/deal-alerts`, { headers: { cookie: dealCookie, origin } }).then((response) => response.json());
  assert.equal(dealAlerts.alerts[0].baselineWindowDays, 7);
  assert.equal(Math.round(dealAlerts.alerts[0].discountPercent), 40);
  const duplicateDealJob = await fetch(`${origin}/api/local/admin/jobs/run`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ key: "market_deal_watch" }),
  });
  assert.equal(duplicateDealJob.status, 202);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const dedupedDealAlerts = await fetch(`${origin}/api/local/market/deal-alerts`, { headers: { cookie: dealCookie, origin } }).then((response) => response.json());
  assert.equal(dedupedDealAlerts.alerts.length, 1);
  currentListings = listings;
  const writableAppDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  writableAppDb.prepare("UPDATE scheduled_jobs SET running = 1, last_run_at = ?, updated_at = ? WHERE job_key = ?")
    .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "geoip_database_refresh");
  writableAppDb.close();
  const recoveredJobs = await fetch(`${origin}/api/local/admin/jobs`, {
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  const recoveredGeoipJob = recoveredJobs.jobs.find((job) => job.key === "geoip_database_refresh");
  assert.equal(recoveredGeoipJob.running, false);
  assert.match(recoveredGeoipJob.lastError, /Recovered abandoned run/);
  failClaimRefresh = true;
  const failedCollect = await fetch(`${origin}/api/local/admin/collect-now`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  }).then((response) => response.json());
  assert.match(failedCollect.collectorStatus.lastError, /HTTP 429/);
  failClaimRefresh = false;
  const initialConfig = await fetch(`${origin}/api/local/config`).then((response) => response.json());
  assert.equal(initialConfig.analytics, undefined);
  assert.deepEqual(initialConfig.excludedMemberIds, []);
  assert.equal(initialConfig.serverRefreshSeconds, 30);
  assert.equal(initialConfig.collectorSettings.buyOrders.intervalSeconds, 1800);
  const geoipSettingsResponse = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({
      ...initialConfig,
      visitorSecurity: {
        ...initialConfig.visitorSecurity,
        geoipProvider: "local",
        geoipSourceUrl: `http://127.0.0.1:${upstreamPort}/geoip/GeoLite2-City-CSV.zip`,
        geoipAccountId: "maxmind-account",
        geoipLicenseKey: "maxmind-license",
      },
    }),
  });
  assert.equal(geoipSettingsResponse.status, 200);
  const geoipSettings = await geoipSettingsResponse.json();
  assert.equal(geoipSettings.visitorSecurity.geoipAccountId, "maxmind-account");
  assert.equal(geoipSettings.visitorSecurity.geoipLicenseKeyConfigured, true);
  assert.equal(geoipSettings.visitorSecurity.geoipLicenseKey, undefined);
  const adminJobs = await fetch(`${origin}/api/local/admin/jobs`, {
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.equal(adminJobs.recipeCatalogCount, 1);
  assert.equal(adminJobs.jobs.some((job) => job.key === "recipe_catalog_refresh" && job.enabled === true), true);
  const disabledJobs = await fetch(`${origin}/api/local/admin/jobs`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ key: "recipe_catalog_refresh", enabled: false }),
  }).then((response) => response.json());
  assert.equal(disabledJobs.jobs.find((job) => job.key === "recipe_catalog_refresh").enabled, false);
  const scheduledJobsUpdate = await fetch(`${origin}/api/local/admin/jobs`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ key: "recipe_catalog_refresh", enabled: true, scheduleConfig: { frequency: "weekly", dayOfWeek: 2, time: "03:30" } }),
  }).then((response) => response.json());
  const recipeJob = scheduledJobsUpdate.jobs.find((job) => job.key === "recipe_catalog_refresh");
  assert.equal(recipeJob.enabled, true);
  assert.deepEqual(recipeJob.scheduleConfig, { frequency: "weekly", dayOfWeek: 2, time: "03:30", dayOfMonth: 1 });
  assert.equal(recipeJob.scheduleLabel, "Weekly on Tuesday at 03:30");
  assert.match(recipeJob.nextRunAt, /^\d{4}-\d{2}-\d{2}T/);
  const geoipJobRun = await fetch(`${origin}/api/local/admin/jobs/run`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ key: "geoip_database_refresh" }),
  });
  assert.equal(geoipJobRun.status, 202);
  const geoipJobStart = await geoipJobRun.json();
  assert.equal(geoipJobStart.result.started, true);
  const completedGeoipJob = await waitForCondition("GeoIP scheduled job completion", async () => {
    const status = await fetch(`${origin}/api/local/admin/jobs`, {
      headers: { cookie, origin, "x-csrf-token": auth.csrfToken },
    }).then((response) => response.json());
    const job = status.jobs.find((entry) => entry.key === "geoip_database_refresh");
    return job && !job.running && job.lastSuccessAt ? job : null;
  });
  assert.equal(completedGeoipJob.metadata.entries, 1);
  assert.equal(geoipDownloadRequests, 1);
  const geoipMatchedRequest = await fetch(`${origin}/api/local/health`, { headers: { "x-forwarded-for": "203.0.113.8" } });
  assert.equal(geoipMatchedRequest.status, 200);
  const ipapiSettingsResponse = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({
      ...initialConfig,
      visitorSecurity: {
        ...initialConfig.visitorSecurity,
        geoipProvider: "ipapi",
        geoipCacheDays: 30,
      },
    }),
  });
  assert.equal(ipapiSettingsResponse.status, 200);
  const ipapiMatchedRequest = await fetch(`${origin}/api/local/health`, { headers: { "x-forwarded-for": "198.51.100.9" } });
  assert.equal(ipapiMatchedRequest.status, 200);
  const ipapiLocation = await waitForCondition("ipapi provider location cache", async () => {
    const security = await fetch(`${origin}/api/local/admin/visitor-security?days=30`, {
      method: "GET",
      headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    }).then((response) => response.json());
    return security.locations.some((location) => location.country === "Providerland" && location.city === "Provider City") ? security : null;
  });
  assert.equal(ipapiLocation.geoip.provider, "ipapi");
  assert.equal(ipapiRequests, 1);
  const ipapiCachedRequest = await fetch(`${origin}/api/local/health`, { headers: { "x-forwarded-for": "198.51.100.9" } });
  assert.equal(ipapiCachedRequest.status, 200);
  assert.equal(ipapiRequests, 1);
  const productionNotificationSettings = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({
      ...initialConfig,
      excludedMemberIds: ["1369094286756659093", "not-a-player-id"],
      discord: {
        ...initialConfig.discord,
        productionMinXp: 0,
        productionMinAgeMinutes: 0,
      },
    }),
  });
  assert.equal(productionNotificationSettings.status, 200);
  const updatedConfig = await productionNotificationSettings.json();
  assert.deepEqual(updatedConfig.excludedMemberIds, ["1369094286756659093"]);
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
  assert.equal(linkedAccounts.accounts.some((account) => account.discordId === "deal-discord-user"), true);
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
  const visitorSecurity = await fetch(`${origin}/api/local/admin/visitor-security?days=30`, {
    method: "GET",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.equal(visitorSecurity.retention.fullIpDays, 7);
  assert.equal(visitorSecurity.geoip.configured, true);
  assert.equal(visitorSecurity.geoip.entries, 1);
  assert.equal(visitorSecurity.totals.requests > 0, true);
  assert.equal(visitorSecurity.totals.uniqueVisitors > 0, true);
  assert.equal(visitorSecurity.locations.some((location) => location.country === "United Kingdom" && location.city === "London"), true);
  assert.equal(visitorSecurity.locations.some((location) => location.country === "Unknown"), true);
  assert.equal(visitorSecurity.recent.page, 1);
  assert.equal(visitorSecurity.recent.pageSize, 50);
  assert.equal(visitorSecurity.recent.total >= visitorSecurity.recent.rows.length, true);
  assert.equal(visitorSecurity.recent.rows.some((event) => String(event.ipAnonymized ?? "").startsWith("127.0.0.0")), true);
  assert.equal(visitorSecurity.recent.rows.some((event) => event.ipAddress === "127.0.0.1"), true);
  const searchedSecurityEvents = await fetch(`${origin}/api/local/admin/visitor-security?days=30&eventSearch=Provider%20City&eventPageSize=10`, {
    method: "GET",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.equal(searchedSecurityEvents.recent.page, 1);
  assert.equal(searchedSecurityEvents.recent.pageSize, 10);
  assert.equal(searchedSecurityEvents.recent.rows.length <= 10, true);
  assert.equal(searchedSecurityEvents.recent.total >= searchedSecurityEvents.recent.rows.length, true);
  assert.equal(searchedSecurityEvents.recent.rows.every((event) => event.city === "Provider City"), true);
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
  const pollJson = await poll.json();
  assert.equal(typeof pollJson.collectorStatus.collectors.production.fetchDurationMs, "number");
  assert.equal(Array.isArray(pollJson.collectorStatus.collectors.production.fetchSteps), true);
  assert.equal(typeof pollJson.collectorStatus.collectors.production.payloadWriteDurationMs, "number");
  assert.equal(typeof pollJson.collectorStatus.collectors.production.rowCount, "number");
  const baselineHistory = await fetch(`${origin}/api/local/market/history?claimId=${claimId}&owner=Tester`).then((response) => response.json());
  assert.equal(baselineHistory.totals.confirmedSales, 1);
  assert.equal(baselineHistory.totals.confirmedUnits, 5);
  assert.equal(baselineHistory.totals.trackedValue, 50);
  const baselineActivity = await fetch(`${origin}/api/local/activity?claimId=${claimId}&limit=20`).then((response) => response.json());
  const storageEvent = baselineActivity.events.find((event) => event.event_type === "storage");
  assert.equal(storageEvent.summary, "Tester deposited 12 Bronze Ingot to Ingots");
  assert.equal(JSON.parse(storageEvent.metadata_json).containerName, "Ingots");
  assert.equal(baselineActivity.total >= baselineActivity.events.length, true);
  assert.equal(baselineActivity.events.filter((event) => event.event_type === "market_new_listing").length >= 2, true);
  const notificationActivity = await fetch(`${origin}/api/local/notification-activity?claimId=${claimId}&limit=20`).then((response) => response.json());
  assert.equal(notificationActivity.events.length >= 2, true);
  assert.equal(notificationActivity.events.every((event) => ["market_new_listing", "market_sale", "market_sale_confirmed"].includes(event.event_type)), true);
  assert.equal(notificationActivity.events.filter((event) => event.event_type === "market_new_listing").length >= 2, true);
  assert.equal(notificationActivity.events.some((event) => event.event_type === "storage"), false);
  const listingMutationDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  listingMutationDb.prepare("DELETE FROM market_listings WHERE listing_key = ?").run("listing-1");
  listingMutationDb.close();
  const repeatPoll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(repeatPoll.status, 200);
  const repeatActivity = await fetch(`${origin}/api/local/activity?claimId=${claimId}&q=${encodeURIComponent("New market listing")}&limit=20`).then((response) => response.json());
  assert.equal(repeatActivity.events.filter((event) => event.event_type === "market_new_listing").length >= 2, true);
  const activitySearch = await fetch(`${origin}/api/local/activity?claimId=${claimId}&q=${encodeURIComponent("Bronze Ingot")}&limit=5`).then((response) => response.json());
  assert.equal(activitySearch.searchedAllHistory, true);
  assert.equal(activitySearch.total >= 1, true);
  assert.equal(activitySearch.events.some((event) => event.summary.includes("Bronze Ingot")), true);
  const baselineSnapshots = await fetch(`${origin}/api/local/snapshots?claimId=${claimId}&limit=10`).then((response) => response.json());
  assert.equal(baselineSnapshots.snapshots.length >= 2, true);
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
  const pageOneRequests = requestedPages.filter((page) => page === 1).length;
  const pageTwoRequests = requestedPages.filter((page) => page === 2).length;
  assert.equal(pageOneRequests, pageTwoRequests);
  assert.ok(pageOneRequests >= 4);
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
  assert.equal(secondActivity.events.filter((event) => event.event_type === "production_started").length, 2);

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
  assert.equal(thirdActivity.events.filter((event) => event.event_type === "production_started").length, 2);
  assert.equal(thirdActivity.events.filter((event) => event.event_type === "production_started" && event.summary.includes("Public Output")).length, 1);
  const contributionLeaderboard = await fetch(`${origin}/api/local/leaderboard?claimId=${claimId}`).then((response) => response.json());
  assert.equal(contributionLeaderboard.summary.contributorCount, 1);
  assert.equal(contributionLeaderboard.summary.recordedCrafts, 3);
  assert.equal(contributionLeaderboard.summary.totalProgress, 78);
  assert.equal(contributionLeaderboard.contributors[0].name, "Tester");
  assert.equal(contributionLeaderboard.contributors[0].totalProgress, 78);
  assert.equal(contributionLeaderboard.contribution.summary.contributorCount, 1);
  assert.equal(contributionLeaderboard.contribution.contributors[0].totalProgress, 78);
  assert.equal(contributionLeaderboard.market.summary.activeListings, 2);
  assert.equal(contributionLeaderboard.market.summary.confirmedSales, 3);
  assert.equal(contributionLeaderboard.market.summary.confirmedSaleValue, 62);
  assert.equal(contributionLeaderboard.market.members[0].name, "Tester");
  assert.equal(contributionLeaderboard.market.members[0].activeListings, 2);
  assert.equal(contributionLeaderboard.market.members[0].confirmedSales, 3);
  assert.equal(contributionLeaderboard.activity.members.some((member) => member.name === "Tester" && member.storageEvents === 1), true);
  assert.equal(contributionLeaderboard.activity.members.some((member) => member.name === "Tester" && member.totalEvents > 0), true);
  assert.equal(contributionLeaderboard.activity.summary.ignoredRows > 0, true);

  const opportunityDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  const opportunityNow = new Date().toISOString();
  opportunityDb.prepare(`
    INSERT OR REPLACE INTO market_regional_sale_averages_current (
      claim_id, region_id, item_id, item_type, item_name, average_unit_price, sales_count,
      units_sold, total_value, window_days, first_bucket_at, last_bucket_at, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(claimId, "19", "30", "0", "Leather", 10, 3, 3, 30, 7, "2026-05-18", "2026-05-20", "{}", opportunityNow);
  opportunityDb.close();
  const buyOrdersAfterSales = await fetch(`${origin}/api/local/market/buy-orders?claimId=${claimId}&regionId=19&search=Leather&pageSize=25&sort=premium&direction=desc`).then((response) => response.json());
  assert.equal(buyOrdersAfterSales.opportunities.length, 1);
  assert.equal(Math.round(buyOrdersAfterSales.opportunities[0].premiumPercent), 20);

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

test("background polling failures keep the server online", async (t) => {
  const upstream = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === `/api/claims/${claimId}`) return json(res, { error: "upstream unavailable" }, 500);
    return json(res, { claims: [], members: [], citizens: [], buildings: [], projects: [], research: [], listings: [] });
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
      BITCRAFT_TEST: "true",
      ENABLE_LEGACY_ADMIN_PASSWORD_AUTH: "true",
      ENABLE_SERVER_POLLING: "true",
      ENABLE_SCHEDULED_JOBS: "false",
      ADMIN_SETUP_KEY: "test-setup-key",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      BITJITA_API_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
      BITJITA_PROXY_CACHE_MS: "100",
      BITJITA_PROXY_STALE_IF_ERROR_MS: "5000",
      EMPIRE_SCOUT_CACHE_TTL_MS: "100",
    },
    stdio: "ignore",
  });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(child.exitCode, null);
  const health = await fetch(`${origin}/api/local/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.match(String(health.polling.lastError ?? ""), /HTTP 500|upstream unavailable/);
});









