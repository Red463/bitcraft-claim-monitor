import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { legalPolicyForEnvironment } from "../src/legal/legalPolicy.mjs";
import { legalPolicyDigests } from "../src/server/legalPolicyDigest.mjs";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const claimId = "1369094286777412590";
const legalPolicy = legalPolicyForEnvironment({});
const legalDigests = legalPolicyDigests(legalPolicy);

function json(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function gameDataProbabilityFixture(url, res) {
  if (url.pathname === "/game-data/item-lists") {
    json(res, [{ id: 55, possibilities: [
      { probability: 0.2, items: [{ item_id: 400, item_type: "Item", quantity: 1 }] },
      { probability: 0.8, items: [] },
    ] }]);
    return true;
  }
  if (url.pathname === "/game-data/resources") {
    json(res, [{ id: 1, name: "Test Resource", max_health: 1, on_destroy_yield: [] }]);
    return true;
  }
  return false;
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

async function writeDatabaseWithRetry(dbPath, mutate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec("PRAGMA busy_timeout = 250");
      const result = mutate(db);
      db.close();
      return result;
    } catch (error) {
      db.close();
      lastError = error;
      if (!String(error?.message ?? "").includes("database is locked")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError ?? new Error(`Timed out writing ${dbPath}`);
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
  let historicalTrades = [historicalTrade];
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
  let craftBuildingName = "Public Station";
  let craftProgressOverride = null;
  let failClaimRefresh = false;
  let failResearchRefresh = false;
  let failEmpireList = false;
  let failEmpireTowers = false;
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
      if (regionId === "19") return json(res, { claims: [{ entityId: claimId, name: "Timbersteel Trade", regionId: "19", tier: 5, supplies: 500, treasury: 300, numTiles: 42, locationX: 100, locationZ: 210, updatedAt: "2026-05-22T12:00:00.000Z", empireEntityId: "empire-1" }, { entityId: "neutral-claim", name: "Neutral Claim", regionId: "19", treasury: 10 }], count: 2 });
      if (regionId === "3") return json(res, { claims: [{ entityId: seasonalClaimId, name: "Seasonal Market", regionId: "3", regionName: "Region 3", treasury: 100 }], count: 1 });
      return json(res, { claims: [], count: 0 });
    }
    if (url.pathname === `/api/claims/${claimId}`) {
      claimDetailRequests += 1;
      if (failClaimRefresh) return json(res, { error: "rate limited" }, 429);
      return json(res, { claim: { entityId: claimId, name: "Timbersteel Trade", ownerName: "Tester", ownerEntityId: "player-1", tier: 5, supplies: 500, treasury: 300, numTiles: 42, locationX: 100, locationZ: 210, regionId: "19", regionName: "Zephra", empireEntityId: "empire-1" } });
    }
    if (url.pathname === `/api/claims/${claimId}/members`) {
      memberListRequests += 1;
      return json(res, { members: [{ playerEntityId: "player-1", userName: "Tester", lastLoginTimestamp: "2026-05-21T12:00:00.000Z", signedIn: false }, { playerEntityId: "citizen-1", userName: "Citizen One", coOwnerPermission: true, lastLoginTimestamp: "2026-05-20T12:00:00.000Z", signedIn: false }] });
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
        item: { id: "2020003", name: "Simple Plank", itemType: 0, tier: 2, rarityStr: "Common", tag: "Plank" },
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
        { entityId: "player-1", playerName: "Tester", rankTitle: "Emperor", lastLoginTimestamp: "2026-04-01T12:00:00.000Z" },
        { entityId: "citizen-1", playerName: "Citizen One", rankTitle: "Citizen", lastLoginTimestamp: "2026-05-20T12:00:00.000Z", inventoryPermission: true },
        { entityId: "citizen-2", playerName: "Citizen Two", rankTitle: "Citizen", lastLoginTimestamp: "2026-05-21T12:00:00.000Z" },
      ],
      count: 3,
    });
    if (url.pathname === "/api/empires/empire-foreign") return json(res, {
      empire: { entityId: "empire-foreign", name: "Foreign Empire", capitalClaimId: "foreign-capital", capitalClaimName: "Foreign Capital", capitalRegionId: 9, locationX: 900, locationZ: 901, territoryChunks: 99, numClaims: 1 },
      members: [
        { entityId: "leader-2", playerName: "Other", rank: 0, rankTitle: "Emperor", lastLoginTimestamp: "2026-07-18T12:00:00.000Z" },
      ],
      count: 1,
    });
    if (url.pathname === "/api/empires/empire-1/towers") {
      if (failEmpireTowers) return json(res, { error: "tower detail unavailable" }, 503);
      return json(res, [{
        entityId: "tower-1",
        locationX: 111,
        locationZ: 222,
        locationDimension: 0,
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
    if (url.pathname === "/api/empires/empire-foreign/towers") return json(res, []);
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
      if (orderId === "historic-order") return json(res, { trades: historicalTrades });
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
        { entityId: `public-craft-${craftEntityRevision}`, claimEntityId: claimId, buildingName: craftBuildingName, ownerUsername: craftOwnerUsername, isPublic: true, craftedItem: [{ item_id: "craft-item-1" }], totalActionsRequired: 100, progress: craftProgressOverride ?? 20 + craftEntityRevision },
      ],
      items: [{ id: "craft-item-1", name: "Public Output", tier: 2, itemType: "0", rarityStr: "Common", iconAssetName: "public_output.png" }],
      cargos: [],
    });
    if (url.pathname === "/api/crafts/public-craft-0/contributions" || url.pathname === "/api/crafts/public-craft-1/contributions" || url.pathname === "/api/crafts/public-craft-2/contributions" || url.pathname === "/api/crafts/public-craft-3/contributions") {
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
          { entityId: `public-craft-${craftEntityRevision}`, claimEntityId: claimId, buildingName: craftBuildingName, ownerUsername: "Tester", isPublic: true, craftedItem: [{ item_id: "craft-item-1" }], totalActionsRequired: 100, progress: craftProgressOverride ?? 20 + craftEntityRevision },
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
      LEGAL_CONFIGURATION_CONFIRMED: "true",
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
  assert.deepEqual(
    [proxyOne.headers.get("x-bitjita-cache"), proxyTwo.headers.get("x-bitjita-cache")].sort(),
    ["deduped", "miss"],
  );
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
  assert.equal(regionalEmpires.empires[0].hexiteReserves.status, "pending");
  assert.equal(regionalEmpires.empires[0].hexiteReserves.estimatedEnergyEquivalent, null);
  assert.equal(regionalEmpires.empires[0].hexiteReserves.capsuleWatchtowerEnergyValue, 1_000);
  assert.equal(regionalEmpires.empires[0].hexiteReserves.coverage.foundry, "unavailable");
  await writeDatabaseWithRetry(path.join(dataDir, "bitcraft-local.sqlite"), (db) => {
    db.prepare(`
      INSERT INTO empire_hexite_sweeps (status, started_at, completed_at, last_error, updated_at)
      VALUES ('error', ?, ?, ?, ?)
    `).run("2026-07-18T09:00:00.000Z", "2026-07-18T09:01:00.000Z", "BitJita offline", "2026-07-18T09:01:00.000Z");
  });
  const bootstrapFailureEmpires = await fetch(`${origin}/api/local/empires?regionId=19`).then((response) => response.json());
  assert.equal(bootstrapFailureEmpires.empires[0].hexiteReserves.status, "error");
  assert.equal(bootstrapFailureEmpires.empires[0].hexiteReserves.estimatedEnergyEquivalent, null);
  assert.deepEqual(bootstrapFailureEmpires.empires[0].hexiteReserves.errors, ["BitJita offline"]);
  const calculatedHexitePayload = {
    estimatedEnergyEquivalent: 8100,
    capsuleEnergyCost: 100,
    capsuleWatchtowerEnergyValue: 1_000,
    energy: { treasury: 5000, playerInventories: 100, sharedClaimInventories: 0, total: 5100 },
    capsules: { playerInventories: 1, sharedClaimInventories: 2, reserveBuildings: 2, foundry: null, readyTotal: 3 },
    coverage: {
      players: { fresh: 2, reused: 1, missing: 0, total: 3 },
      claims: { fresh: 1, reused: 0, missing: 0, total: 1 },
      foundry: "unavailable",
    },
    status: "partial",
    sweepStartedAt: "2026-07-18T10:00:00.000Z",
    calculatedAt: "2026-07-18T10:05:00.000Z",
    refreshing: false,
    errors: ["player-3 reused after HTTP 503"],
  };
  const calculatedSweepId = await writeDatabaseWithRetry(path.join(dataDir, "bitcraft-local.sqlite"), (db) => {
    const inserted = db.prepare(`
      INSERT INTO empire_hexite_sweeps (status, capsule_energy_cost, started_at, completed_at, updated_at)
      VALUES ('complete', 100, ?, ?, ?)
    `).run("2026-07-18T10:00:00.000Z", "2026-07-18T10:05:00.000Z", "2026-07-18T10:05:00.000Z");
    db.prepare(`
      INSERT INTO empire_hexite_snapshots (empire_id, sweep_id, payload_json, calculated_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("empire-1", inserted.lastInsertRowid, JSON.stringify(calculatedHexitePayload), "2026-07-18T10:05:00.000Z", "2026-07-18T10:05:00.000Z");
    return Number(inserted.lastInsertRowid);
  });
  const calculatedRegionalEmpires = await fetch(`${origin}/api/local/empires?regionId=19`).then((response) => response.json());
  assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.energy.total, 5100);
  assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.capsules.readyTotal, 3);
  assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.capsuleEnergyCost, 100);
  assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.capsuleWatchtowerEnergyValue, 1_000);
  assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.estimatedEnergyEquivalent, 8100);
  assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.status, "partial");
  assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.coverage.players.reused, 1);
  assert.equal(calculatedRegionalEmpires.empires[0].hexiteReserves.refreshing, false);

  const activeSweepId = await writeDatabaseWithRetry(path.join(dataDir, "bitcraft-local.sqlite"), (db) => Number(db.prepare(`
    INSERT INTO empire_hexite_sweeps (status, capsule_energy_cost, started_at, updated_at)
    VALUES ('running', 100, ?, ?)
  `).run("2026-07-18T16:00:00.000Z", "2026-07-18T16:00:00.000Z").lastInsertRowid));
  const refreshingRegionalEmpires = await fetch(`${origin}/api/local/empires?regionId=19`).then((response) => response.json());
  assert.equal(refreshingRegionalEmpires.empires[0].hexiteReserves.estimatedEnergyEquivalent, 8100);
  assert.equal(refreshingRegionalEmpires.empires[0].hexiteReserves.refreshing, true);

  const unavailableHexitePayload = {
    ...calculatedHexitePayload,
    estimatedEnergyEquivalent: null,
    status: "error",
    calculatedAt: null,
    errors: ["HTTP 503"],
  };
  await writeDatabaseWithRetry(path.join(dataDir, "bitcraft-local.sqlite"), (db) => {
    db.prepare("UPDATE empire_hexite_sweeps SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?")
      .run("2026-07-18T16:01:00.000Z", "2026-07-18T16:01:00.000Z", activeSweepId);
    db.prepare(`
      UPDATE empire_hexite_snapshots
      SET sweep_id = ?, payload_json = ?, calculated_at = ?, updated_at = ?
      WHERE empire_id = ?
    `).run(activeSweepId, JSON.stringify(unavailableHexitePayload), "2026-07-18T16:01:00.000Z", "2026-07-18T16:01:00.000Z", "empire-1");
  });
  const unavailableRegionalEmpires = await fetch(`${origin}/api/local/empires?regionId=19`).then((response) => response.json());
  assert.equal(unavailableRegionalEmpires.empires[0].hexiteReserves.status, "error");
  assert.equal(unavailableRegionalEmpires.empires[0].hexiteReserves.estimatedEnergyEquivalent, null);
  assert.equal(unavailableRegionalEmpires.empires[0].hexiteReserves.refreshing, false);
  assert.deepEqual(unavailableRegionalEmpires.empires[0].hexiteReserves.errors, ["HTTP 503"]);
  assert.equal(calculatedSweepId > 0, true);
  failEmpireList = true;
  const cachedRegionalEmpires = await fetch(`${origin}/api/local/empires?regionId=99`).then((response) => response.json());
  assert.equal(cachedRegionalEmpires.summary.empires, 0);
  assert.deepEqual(cachedRegionalEmpires.empires, []);
  failEmpireList = false;
  const missingEmpireDetails = await fetch(`${origin}/api/local/empires/details?regionId=19`);
  assert.equal(missingEmpireDetails.status, 400);
  failEmpireTowers = true;
  const partialEmpireDetails = await fetch(`${origin}/api/local/empires/details?empireId=empire-1&regionId=19&inactiveDays=15`).then((response) => response.json());
  assert.equal(partialEmpireDetails.partial, true);
  assert.deepEqual(partialEmpireDetails.towers, []);
  assert.match(partialEmpireDetails.errors[0], /Watchtowers unavailable/);
  failEmpireTowers = false;
  const empireDetailsResponse = await fetch(`${origin}/api/local/empires/details?empireId=empire-1&regionId=19&inactiveDays=14`);
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
  const crossRegionEmpireDetailsResponse = await fetch(`${origin}/api/local/empires/details?empireId=empire-foreign&regionId=19`);
  assert.equal(crossRegionEmpireDetailsResponse.status, 200);
  const crossRegionEmpireDetails = await crossRegionEmpireDetailsResponse.json();
  assert.equal(crossRegionEmpireDetails.empire.name, "Foreign Empire");
  assert.equal(crossRegionEmpireDetails.empire.leader, "Other");
  assert.equal(crossRegionEmpireDetails.empire.memberCount, 1);
  assert.equal(crossRegionEmpireDetails.members[0].username, "Other");
  assert.equal(crossRegionEmpireDetails.claims[0].name, "Foreign Capital");
  assert.equal(crossRegionEmpireDetails.claims[0].regionId, "9");
  const unknownEmpireDetails = await fetch(`${origin}/api/local/empires/details?empireId=missing&regionId=19`);
  assert.equal(unknownEmpireDetails.status, 404);
  const regionalWatchtowers = await fetch(`${origin}/api/local/empires/watchtowers?regionId=19&inactiveDays=14`).then((response) => response.json());
  assert.equal(regionalWatchtowers.summary.towerCount, 1);
  assert.equal(regionalWatchtowers.towers[0].nickname, "North Tower");
  assert.equal(regionalWatchtowers.towers[0].inactiveRisk, true);
  assert.equal(regionalWatchtowers.towers[0].locationX, 111);
  assert.equal(regionalWatchtowers.towers[0].underSiege, true);
  assert.equal(regionalWatchtowers.towers[0].siegeCount, 2);
  assert.deepEqual(
    regionalWatchtowers.towers[0].activeSiegeParticipants.map((entry) => entry.empireName),
    ["Test Empire", "Verdant"],
  );
  assert.equal(regionalWatchtowers.summary.underSiege, 1);
  assert.equal(regionalWatchtowers.towers[0].accessMembers, undefined);
  assert.equal(regionalWatchtowers.empires[0].accessMembers.length, 2);
  assert.equal(regionalWatchtowers.empires[0].members.length, 4);
  assert.equal(regionalWatchtowers.empires[0].members[0].username, "Citizen Two");
  assert.equal(regionalWatchtowers.empires[0].members[0].lastLoginTimestamp, "2026-05-21T12:00:00.000Z");
  assert.equal(regionalWatchtowers.empires[0].members.some((member) => member.username === "Citizen Two" && !member.hasStorage && !member.canAddHexite), true);
  assert.equal(regionalWatchtowers.empires[0].accessMembers.some((member) => member.hasStorage), true);
  assert.equal(regionalWatchtowers.empires[0].accessMembers.some((member) => member.canAddHexite), true);
  assert.equal(regionalWatchtowers.empires[0].claims.length, 1);
  assert.equal(regionalWatchtowers.empires[0].claims[0].claimId, claimId);
  assert.equal(regionalWatchtowers.empires[0].claims[0].name, "Timbersteel Trade");
  assert.equal(regionalWatchtowers.empires[0].claims[0].ownerName, "Tester");
  assert.equal(regionalWatchtowers.empires[0].claims.some((claim) => claim.name === "Neutral Claim"), false);
  assert.equal(regionalWatchtowers.unclaimedAvailable, false);
  const missingClaimMembers = await fetch(`${origin}/api/local/empires/claim-members`).then((response) => ({ status: response.status }));
  assert.equal(missingClaimMembers.status, 400);
  const claimMembers = await fetch(`${origin}/api/local/empires/claim-members?claimId=${claimId}`).then((response) => response.json());
  assert.equal(claimMembers.claim.name, "Timbersteel Trade");
  assert.equal(claimMembers.members[0].username, "Tester");
  assert.equal(claimMembers.members[0].rankTitle, null);
  assert.equal(claimMembers.members[0].empireRankTitle, "Emperor");
  assert.equal(claimMembers.members[0].claimRole, "Owner");
  assert.equal(claimMembers.members[0].isClaimOwner, true);
  assert.equal(claimMembers.members.some((member) => member.username === "Citizen One" && member.claimRole === "Co-owner"), true);
  assert.equal(claimMembers.members[0].lastLoginTimestamp, "2026-05-21T12:00:00.000Z");
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
  assert.equal(playerDetailsOne.serverFreshness.cacheState, "miss");
  assert.equal(playerDetailsTwo.serverFreshness.cacheState, "hit");
  assert.match(playerDetailsOne.serverFreshness.cachedAt, /^\d{4}-\d{2}-\d{2}T/);
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
  assert.equal(dashboardDataOne.serverFreshness.cacheState, "miss");
  assert.equal(dashboardDataTwo.serverFreshness.cacheState, "hit");
  assert.match(dashboardDataOne.serverFreshness.cachedAt, /^\d{4}-\d{2}-\d{2}T/);
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
  assert.equal(passiveOne.serverFreshness.cacheState, "miss");
  assert.equal(passiveTwo.serverFreshness.cacheState, "hit");
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
  assert.equal(productionOne.serverFreshness.cacheState, "miss");
  assert.equal(productionTwo.serverFreshness.cacheState, "hit");
  assert.match(productionOne.serverFreshness.cachedAt, /^\d{4}-\d{2}-\d{2}T/);
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
  const trackedMembership = await waitForCondition("empire membership baseline", () =>
    writeDatabaseWithRetry(path.join(dataDir, "bitcraft-local.sqlite"), (database) => {
      const tracking = database
        .prepare(
          "SELECT empire_id, empire_name, initial_roster_complete FROM empire_membership_tracking WHERE tracking_ended_at IS NULL",
        )
        .get();
      const periods = database
        .prepare(
          "SELECT COUNT(*) AS count FROM empire_membership_periods WHERE period_ended_at IS NULL",
        )
        .get();
      return tracking && Number(periods?.count) === 4
        ? {
            tracking: {
              empire_id: tracking.empire_id,
              empire_name: tracking.empire_name,
              initial_roster_complete: Number(tracking.initial_roster_complete),
            },
            count: Number(periods.count),
          }
        : null;
    }),
  );
  assert.deepEqual(trackedMembership, {
    tracking: {
      empire_id: "empire-1",
      empire_name: "Test Empire",
      initial_roster_complete: 1,
    },
    count: 4,
  });
  const anonymousMembership = await fetch(`${origin}/api/local/admin/empire-membership`, {
    headers: { origin },
  });
  assert.equal(anonymousMembership.status, 401);
  const ownerMembership = await fetch(`${origin}/api/local/admin/empire-membership`, {
    headers: {
      cookie,
      origin,
      "content-type": "application/json",
      "x-csrf-token": auth.csrfToken,
    },
  });
  assert.equal(ownerMembership.status, 200);
  const ownerMembershipBody = await ownerMembership.json();
  assert.equal(ownerMembershipBody.tracking.empireName, "Test Empire");
  assert.equal(ownerMembershipBody.summary.currentMembers, 4);
  assert.equal(
    ownerMembershipBody.currentMembers.every((member) => member.membershipStatus === "initial"),
    true,
  );
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
  dealDb.prepare(`
    INSERT INTO user_legal_acceptances (
      user_id, legal_version, terms_digest, privacy_digest,
      age_confirmed, accepted_at, source
    ) VALUES (?, ?, ?, ?, 1, ?, 'oauth')
  `).run(dealUserId, legalPolicy.version, legalDigests.termsDigest, legalDigests.privacyDigest, new Date().toISOString());
  dealDb.close();
  const dealCookie = `bitcraft_user_session=${encodeURIComponent(dealSessionToken)}`;
  const dealCsrfToken = createHash("sha256").update(`csrf:${dealSessionToken}`).digest("base64url");
  const createdDealWatch = await fetch(`${origin}/api/local/market/deal-watches`, {
    method: "POST",
    headers: { cookie: dealCookie, origin, "content-type": "application/json", "x-csrf-token": dealCsrfToken },
    body: JSON.stringify({ regionId: "19", itemId: 30, itemType: 0, itemName: "Leather", tier: 2, rarity: "Common", iconAssetName: "leather.png" }),
  });
  assert.equal(createdDealWatch.status, 201);
  const duplicateDealWatch = await fetch(`${origin}/api/local/market/deal-watches`, {
    method: "POST",
    headers: { cookie: dealCookie, origin, "content-type": "application/json", "x-csrf-token": dealCsrfToken },
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
  const initialPublicPopups = await fetch(`${origin}/api/local/popups`).then((response) => response.json());
  assert.deepEqual(initialPublicPopups, { popups: [] });
  const anonymousAdminPopups = await fetch(`${origin}/api/local/admin/popups`);
  assert.equal(anonymousAdminPopups.status, 401);
  const savedPopupsResponse = await fetch(`${origin}/api/local/admin/popups`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({
      popups: [
        { id: "release-warning", title: "Release warning", message: "Read this once.", type: "warning", mode: "oneTime", enabled: true, updatedAt: "popup-version-1" },
        { id: "disabled-tip", title: "Disabled tip", message: "Hidden from users.", type: "info", mode: "repeatUntilDismissed", enabled: false, updatedAt: "popup-version-1" },
        { id: "", title: "Invalid", message: "Ignored", enabled: true },
      ],
    }),
  });
  assert.equal(savedPopupsResponse.status, 200);
  const savedPopups = await savedPopupsResponse.json();
  assert.deepEqual(savedPopups.popups.map((popup) => popup.id), ["release-warning", "disabled-tip"]);
  assert.equal(savedPopups.popups[0].type, "warning");
  assert.equal(savedPopups.popups[0].mode, "oneTime");
  const publicPopups = await fetch(`${origin}/api/local/popups`).then((response) => response.json());
  assert.deepEqual(publicPopups.popups.map((popup) => popup.id), ["release-warning"]);
  assert.equal(publicPopups.popups[0].message, "Read this once.");
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
  const secretDiscordSettings = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({
      ...updatedConfig,
      discord: {
        ...updatedConfig.discord,
        botToken: "test-discord-bot-token",
      },
    }),
  });
  assert.equal(secretDiscordSettings.status, 200);
  const redactedDiscordSettings = await secretDiscordSettings.json();
  assert.equal(redactedDiscordSettings.discord.botToken, undefined);
  assert.equal(redactedDiscordSettings.discord.botTokenConfigured, true);
  assert.equal(JSON.stringify(redactedDiscordSettings).includes("test-discord-bot-token"), false);
  const persistedDiscordSettings = await fetch(`${origin}/api/local/admin/settings`, {
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.equal(persistedDiscordSettings.discord.botToken, undefined);
  assert.equal(persistedDiscordSettings.discord.botTokenConfigured, true);
  assert.equal(JSON.stringify(persistedDiscordSettings).includes("test-discord-bot-token"), false);
  const authStatus = await fetch(`${origin}/api/local/auth/me`).then((response) => response.json());
  assert.equal(authStatus.discordLoginEnabled, true);
  assert.equal(authStatus.user, null);
  assert.equal(authStatus.csrfToken, null);
  assert.equal(authStatus.legal.requiresAcceptance, false);
  const publicLegal = await fetch(`${origin}/api/local/legal`).then((response) => response.json());
  assert.equal(publicLegal.version, legalPolicy.version);
  assert.equal(publicLegal.termsDigest, legalDigests.termsDigest);
  assert.equal(publicLegal.privacyDigest, legalDigests.privacyDigest);
  const legacyOauthStart = await fetch(`${origin}/api/local/auth/discord/start?returnTo=%2F%3Fpage%3Dmembers`, { redirect: "manual" });
  assert.equal(legacyOauthStart.status, 302);
  assert.match(legacyOauthStart.headers.get("location"), /^\/\?legal=required/);
  const rejectedOauthStart = await fetch(`${origin}/api/local/auth/discord/start`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ returnTo: "/?page=members", acceptedTerms: true, ageConfirmed: false }),
  });
  assert.equal(rejectedOauthStart.status, 400);
  const oauthStart = await fetch(`${origin}/api/local/auth/discord/start`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ returnTo: "/?page=members", acceptedTerms: true, ageConfirmed: true }),
  });
  assert.equal(oauthStart.status, 200);
  const oauthStartBody = await oauthStart.json();
  const oauthLocation = oauthStartBody.authorizeUrl;
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
  const staleSessionToken = "stale-legal-test-session";
  const staleDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  staleDb.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, character_status, settings_json, created_at, last_login_at)
    VALUES ('stale-legal-user', 'StaleLegal', 'unlinked', '{}', ?, ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  const staleUserId = Number(staleDb.prepare("SELECT id FROM user_accounts WHERE discord_id = 'stale-legal-user'").get().id);
  staleDb.prepare("INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(createHash("sha256").update(staleSessionToken).digest("hex"), staleUserId, new Date(Date.now() + 86400000).toISOString(), new Date().toISOString());
  staleDb.close();
  const staleCookie = `bitcraft_user_session=${encodeURIComponent(staleSessionToken)}`;
  const staleAuth = await fetch(`${origin}/api/local/auth/me`, { headers: { cookie: staleCookie, origin } }).then((response) => response.json());
  assert.equal(staleAuth.legal.requiresAcceptance, true);
  assert.ok(staleAuth.csrfToken);
  const staleSettings = await fetch(`${origin}/api/local/auth/settings`, {
    method: "PUT",
    headers: { cookie: staleCookie, origin, "content-type": "application/json", "x-csrf-token": staleAuth.csrfToken },
    body: JSON.stringify({ settings: { density: "compact" } }),
  });
  assert.equal(staleSettings.status, 428);
  assert.equal((await staleSettings.json()).code, "legal_acceptance_required");
  const rejectedLegalAcceptance = await fetch(`${origin}/api/local/auth/legal/accept`, {
    method: "POST",
    headers: { cookie: staleCookie, origin, "content-type": "application/json", "x-csrf-token": staleAuth.csrfToken },
    body: JSON.stringify({ acceptedTerms: true, ageConfirmed: false }),
  });
  assert.equal(rejectedLegalAcceptance.status, 400);
  const acceptedLegal = await fetch(`${origin}/api/local/auth/legal/accept`, {
    method: "POST",
    headers: { cookie: staleCookie, origin, "content-type": "application/json", "x-csrf-token": staleAuth.csrfToken },
    body: JSON.stringify({ acceptedTerms: true, ageConfirmed: true }),
  });
  assert.equal(acceptedLegal.status, 200);
  assert.equal((await acceptedLegal.json()).legal.requiresAcceptance, false);
  const savedAccountSettings = await fetch(`${origin}/api/local/auth/settings`, {
    method: "PUT",
    headers: { cookie: dealCookie, origin, "content-type": "application/json", "x-csrf-token": dealCsrfToken },
    body: JSON.stringify({ settings: { density: "compact", selectedMemberId: "player-42", toastSettings: { marketListings: false, marketSales: true, production: false } } }),
  });
  assert.equal(savedAccountSettings.status, 200);
  assert.equal((await savedAccountSettings.json()).user.settings.density, "compact");
  const reloadedAccountSettings = await fetch(`${origin}/api/local/auth/me`, { headers: { cookie: dealCookie, origin } }).then((response) => response.json());
  assert.equal(reloadedAccountSettings.user.discordId, "deal-discord-user");
  assert.equal(reloadedAccountSettings.user.settings.selectedMemberId, "player-42");
  assert.equal(reloadedAccountSettings.user.settings.toastSettings.marketListings, false);
  const approvedLinkDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  approvedLinkDb.prepare("UPDATE user_accounts SET character_player_id = ?, character_name = ?, character_status = 'approved' WHERE discord_id = ?")
    .run("12345678", "Approved Character", "deal-discord-user");
  approvedLinkDb.close();
  const blockedRelink = await fetch(`${origin}/api/local/auth/character`, {
    method: "PUT",
    headers: { cookie: dealCookie, origin, "content-type": "application/json", "x-csrf-token": dealCsrfToken },
    body: JSON.stringify({ characterPlayerId: "87654321", characterName: "Different Character" }),
  });
  assert.equal(blockedRelink.status, 409);
  assert.match((await blockedRelink.json()).error, /unlink/i);
  const unlinkApprovedCharacter = await fetch(`${origin}/api/local/auth/character`, {
    method: "PUT",
    headers: { cookie: dealCookie, origin, "content-type": "application/json", "x-csrf-token": dealCsrfToken },
    body: JSON.stringify({ characterPlayerId: "", characterName: "" }),
  });
  assert.equal(unlinkApprovedCharacter.status, 200);
  const relinkAfterUnlink = await fetch(`${origin}/api/local/auth/character`, {
    method: "PUT",
    headers: { cookie: dealCookie, origin, "content-type": "application/json", "x-csrf-token": dealCsrfToken },
    body: JSON.stringify({ characterPlayerId: "87654321", characterName: "Different Character" }),
  });
  assert.equal(relinkAfterUnlink.status, 200);
  assert.equal((await relinkAfterUnlink.json()).user.characterStatus, "pending");
  const linkedAccounts = await fetch(`${origin}/api/local/admin/user-accounts`, {
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.equal(linkedAccounts.accounts.some((account) => account.discordId === "deal-discord-user"), true);
  const characterAssignmentDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  characterAssignmentDb.prepare(`
    INSERT INTO user_accounts (
      discord_id, discord_username, discord_global_name, discord_avatar,
      character_player_id, character_name, character_status, settings_json,
      created_at, last_login_at
    ) VALUES (?, ?, ?, NULL, NULL, NULL, 'unlinked', '{}', ?, ?)
  `).run("second-discord-user", "SecondUser", "Second User", new Date().toISOString(), new Date().toISOString());
  const secondUserId = Number(characterAssignmentDb.prepare("SELECT id FROM user_accounts WHERE discord_id = ?").get("second-discord-user").id);
  characterAssignmentDb.close();

  const assignCharacter = await fetch(`${origin}/api/local/admin/user-accounts/character`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: dealUserId, characterPlayerId: "87654321", characterName: "Assigned Character" }),
  });
  assert.equal(assignCharacter.status, 200);
  const assignedAccounts = (await assignCharacter.json()).accounts;
  assert.deepEqual(
    assignedAccounts.find((account) => account.id === dealUserId),
    {
      ...assignedAccounts.find((account) => account.id === dealUserId),
      characterPlayerId: "87654321",
      characterName: "Assigned Character",
      characterStatus: "approved",
    },
  );

  const duplicateAssignment = await fetch(`${origin}/api/local/admin/user-accounts/character`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: secondUserId, characterPlayerId: "87654321", characterName: "Assigned Character" }),
  });
  assert.equal(duplicateAssignment.status, 409);
  assert.match((await duplicateAssignment.json()).error, /unassign/i);

  const pendingDuplicateDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  pendingDuplicateDb.prepare("UPDATE user_accounts SET character_player_id = ?, character_name = ?, character_status = 'pending' WHERE id = ?")
    .run("87654321", "Assigned Character", secondUserId);
  pendingDuplicateDb.close();
  const duplicateApproval = await fetch(`${origin}/api/local/admin/user-accounts/approval`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: secondUserId, status: "approved" }),
  });
  assert.equal(duplicateApproval.status, 409);

  const unassignCharacter = await fetch(`${origin}/api/local/admin/user-accounts/character`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: dealUserId, characterPlayerId: "", characterName: "" }),
  });
  assert.equal(unassignCharacter.status, 200);
  const unassignedAccount = (await unassignCharacter.json()).accounts.find((account) => account.id === dealUserId);
  assert.equal(unassignedAccount.characterPlayerId, "");
  assert.equal(unassignedAccount.characterName, "");
  assert.equal(unassignedAccount.characterStatus, "unlinked");

  const reassignCharacter = await fetch(`${origin}/api/local/admin/user-accounts/character`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ userId: secondUserId, characterPlayerId: "87654321", characterName: "Assigned Character" }),
  });
  assert.equal(reassignCharacter.status, 200);
  assert.equal((await reassignCharacter.json()).accounts.find((account) => account.id === secondUserId).characterStatus, "approved");

  const assignmentEvidenceDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
  const assignmentAuditActions = assignmentEvidenceDb.prepare(`
    SELECT action FROM admin_audit_log
    WHERE action IN ('linked_account.character_assigned', 'linked_account.character_unassigned')
    ORDER BY id
  `).all().map((row) => row.action);
  const assignmentDeliveryEvents = assignmentEvidenceDb.prepare(`
    SELECT event_type FROM discord_delivery_log
    WHERE event_type IN ('character_link_assigned', 'character_link_unassigned')
    ORDER BY id
  `).all().map((row) => row.event_type);
  assignmentEvidenceDb.close();
  assert.deepEqual(assignmentAuditActions.slice(-3), [
    "linked_account.character_assigned",
    "linked_account.character_unassigned",
    "linked_account.character_assigned",
  ]);
  assert.deepEqual(assignmentDeliveryEvents.slice(-3), [
    "character_link_assigned",
    "character_link_unassigned",
    "character_link_assigned",
  ]);
  const saveAccessControl = await fetch(`${origin}/api/local/admin/access-control`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ rules: {
      "page:market": { mode: "specificUsers", allowedDiscordIds: ["222222222222222222", "invalid"] },
      "page:map": { mode: "verified" },
      "tab:market:live": { mode: "discord" },
    } }),
  });
  assert.equal(saveAccessControl.status, 200);
  const savedAccessControl = await saveAccessControl.json();
  assert.deepEqual(savedAccessControl.config.rules["page:market"].allowedDiscordIds, ["222222222222222222"]);
  const anonymousEffectiveAccess = await fetch(`${origin}/api/local/access-control/effective`, { headers: { origin } }).then((response) => response.json());
  assert.equal(anonymousEffectiveAccess.targets["page:market"].allowed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(anonymousEffectiveAccess.targets["page:market"], "allowedDiscordIds"), false);
  const signedEffectiveAccess = await fetch(`${origin}/api/local/access-control/effective`, { headers: { cookie: dealCookie, origin } }).then((response) => response.json());
  assert.equal(signedEffectiveAccess.targets["page:map"].allowed, false);
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
  const viewerMembership = await fetch(`${origin}/api/local/admin/empire-membership`, {
    headers: { cookie: viewerCookie, origin },
  });
  assert.equal(viewerMembership.status, 200);
  const viewerMembershipBody = await viewerMembership.json();
  assert.equal(viewerMembershipBody.tracking.empireId, "empire-1");
  assert.equal(Object.hasOwn(viewerMembershipBody, "adminUsers"), false);
  assert.equal(Object.hasOwn(viewerMembershipBody, "settings"), false);
  const viewerSettingsMutation = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie: viewerCookie, origin, "content-type": "application/json", "x-csrf-token": viewerAuth.csrfToken },
    body: JSON.stringify({}),
  });
  assert.equal(viewerSettingsMutation.status, 403);
  const viewerAccessControlMutation = await fetch(`${origin}/api/local/admin/access-control`, {
    method: "PUT",
    headers: { cookie: viewerCookie, origin, "content-type": "application/json", "x-csrf-token": viewerAuth.csrfToken },
    body: JSON.stringify({ rules: {} }),
  });
  assert.equal(viewerAccessControlMutation.status, 403);  const viewerUserList = await fetch(`${origin}/api/local/admin/users`, { headers: { cookie: viewerCookie, origin } });
  assert.equal(viewerUserList.status, 403);
  const createAdmin = await fetch(`${origin}/api/local/admin/users`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({ username: "manager", password: "manager password ok", role: "admin" }),
  });
  assert.equal(createAdmin.status, 201);
  const adminLogin = await fetch(`${origin}/api/local/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "manager", password: "manager password ok" }),
  });
  assert.equal(adminLogin.status, 200);
  const adminAuth = await adminLogin.json();
  const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];
  assert.equal(adminAuth.user.role, "admin");
  const adminUserList = await fetch(`${origin}/api/local/admin/users`, { headers: { cookie: adminCookie, origin } });
  assert.equal(adminUserList.status, 200);

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
  const notificationSecretDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  notificationSecretDb.prepare(`
    INSERT INTO activity_events (claim_id, event_type, summary, occurred_at, metadata_json, source_key)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    claimId,
    "market_new_listing",
    "New market listing: Secret sentinel",
    "2099-01-01T00:00:00.000Z",
    JSON.stringify({
      itemName: "Secret Sentinel",
      itemId: 9001,
      tier: 1,
      discordBotToken: "test-discord-bot-token",
      adminSetupKey: "test-setup-key",
      nested: { client_secret: "test-discord-oauth-secret" },
    }),
    "release-secret-sentinel",
  );
  notificationSecretDb.close();
  const notificationActivity = await fetch(`${origin}/api/local/notification-activity?claimId=${claimId}&limit=20`).then((response) => response.json());
  assert.equal(notificationActivity.events.length >= 2, true);
  assert.equal(notificationActivity.events.every((event) => ["market_new_listing", "market_sale", "market_sale_confirmed", "production_started", "production_completed"].includes(event.event_type)), true);
  assert.equal(notificationActivity.events.some((event) => event.event_type === "production_started"), true);
  assert.equal(notificationActivity.events.filter((event) => event.event_type === "market_new_listing").length >= 2, true);
  assert.equal(notificationActivity.events.some((event) => event.event_type === "storage"), false);
  const secretNotification = notificationActivity.events.find((event) => event.source_key === "release-secret-sentinel");
  assert.ok(secretNotification);
  assert.deepEqual(JSON.parse(secretNotification.metadata_json), {
    itemName: "Secret Sentinel",
    itemId: 9001,
    tier: 1,
    nested: {},
  });
  assert.equal(JSON.stringify(notificationActivity).includes("test-discord-bot-token"), false);
  assert.equal(JSON.stringify(notificationActivity).includes("test-setup-key"), false);
  assert.equal(JSON.stringify(notificationActivity).includes("test-discord-oauth-secret"), false);
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
  const aggregateHistory = await fetch(`${origin}/api/local/history?claimId=${claimId}`).then((response) => response.json());
  assert.equal(aggregateHistory.market.totals.confirmedSales, 1);
  assert.equal(aggregateHistory.activity.total >= aggregateHistory.activity.events.length, true);
  assert.equal("snapshots" in aggregateHistory, false);
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
  const marketHistory = await fetch(`${origin}/api/local/history?claimId=${claimId}&include=market,snapshots`).then((response) => response.json());
  assert.equal(marketHistory.market.totals.confirmedSales, 1);
  assert.equal("snapshots" in marketHistory, false);
  assert.equal("activity" in marketHistory, false);

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
  const discordProductionAgeGateSettings = await fetch(`${origin}/api/local/admin/settings`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: JSON.stringify({
      ...updatedConfig,
      discord: {
        ...updatedConfig.discord,
        productionMinXp: 0,
        productionMinAgeMinutes: 60,
      },
    }),
  });
  assert.equal(discordProductionAgeGateSettings.status, 200);
  currentListings = [{ ...listings[0], quantity: 8 }, listings[1]];
  craftEntityRevision = 3;
  craftOwnerUsername = "Tester";
  craftBuildingName = "Age Gate Station";
  const ageGatedPoll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(ageGatedPoll.status, 200);
  const ageGatedActivity = await fetch(`${origin}/api/local/notification-activity?claimId=${claimId}&limit=20`).then((response) => response.json());
  assert.equal(ageGatedActivity.events.filter((event) => event.event_type === "production_started").length, 3);
  assert.equal(ageGatedActivity.events.some((event) => event.event_type === "production_started" && JSON.parse(event.metadata_json).raw?.entityId === "public-craft-3"), true);
  const ageGatedProductionStart = ageGatedActivity.events.find((event) => event.event_type === "production_started" && JSON.parse(event.metadata_json).raw?.entityId === "public-craft-3");
  assert.ok(ageGatedProductionStart);
  assert.match(ageGatedProductionStart.source_key, /^production_started:/);
  const ageGateDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  const ageGatedJobRow = ageGateDb.prepare("SELECT start_notified FROM production_jobs WHERE raw_json LIKE ?").get('%"entityId":"public-craft-3"%');
  ageGateDb.close();
  assert.equal(ageGatedJobRow?.start_notified, 0);

  craftEntityRevision = 4;
  craftOwnerUsername = "Tester";
  craftBuildingName = "Collected Station";
  craftProgressOverride = 100;
  const completedOnArrivalPoll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(completedOnArrivalPoll.status, 200);
  const completedOnArrivalActivity = await fetch(`${origin}/api/local/notification-activity?claimId=${claimId}&limit=30`).then((response) => response.json());
  assert.equal(completedOnArrivalActivity.events.filter((event) => event.event_type === "production_started").length, 3);
  assert.equal(completedOnArrivalActivity.events.some((event) => event.event_type === "production_started" && event.summary.includes("Collected Station")), false);
  craftProgressOverride = null;
  historicalTrades = [
    ...historicalTrades,
    { id: "history-new-1", orderEntityId: "historic-order", itemId: 40, itemType: "0", itemName: "Sturdy Leather Belt", sellerEntityId: "player-1", sellerUsername: "Tester", purchaserUsername: "Buyer", quantity: 1, unitPrice: 1, totalPrice: 1, createdAt: new Date(Date.now() - 60 * 1000).toISOString() },
  ];
  const missingBackfillKeyDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  missingBackfillKeyDb.prepare("DELETE FROM app_settings WHERE key = ?").run(`market_trade_backfill:${claimId}:player-1`);
  missingBackfillKeyDb.close();
  const historyOnlyPoll = await fetch(`${origin}/api/local/admin/poll`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(historyOnlyPoll.status, 200);
  const historyOnlyNotificationActivity = await fetch(`${origin}/api/local/notification-activity?claimId=${claimId}&limit=20`).then((response) => response.json());
  const historyOnlySale = historyOnlyNotificationActivity.events.find((event) => event.source_key === "market_sale_confirmed:trade:history-new-1");
  assert.ok(historyOnlySale);
  assert.equal(historyOnlySale.event_type, "market_sale_confirmed");
  assert.equal(historyOnlySale.summary, "Confirmed sale: Sturdy Leather Belt x1 at 1g");
  const historyOnlySaleMetadata = JSON.parse(historyOnlySale.metadata_json);
  assert.equal(historyOnlySaleMetadata.sellerEntityId, "player-1");
  assert.equal(historyOnlySaleMetadata.totalValue, 1);

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
      LEGAL_CONFIGURATION_CONFIRMED: "true",
      BITCRAFT_TEST: "true",
      ENABLE_LEGACY_ADMIN_PASSWORD_AUTH: "true",
      ENABLE_SERVER_POLLING: "true",
      BITCRAFT_PROCESS_ROLE: "all",
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
  const fallbackDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5000 });
  const fallbackCollectedAt = "2026-06-30T09:00:00.000Z";
  const fallbackPayload = fallbackDb.prepare(`
    INSERT INTO domain_payload_current (claim_id, domain, data_json, collected_at, last_attempt_at, last_success_at, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  fallbackPayload.run(claimId, "claim", JSON.stringify({ claim: { entityId: claimId, supplies: 111, treasury: 222, regionName: "Cached Region" } }), fallbackCollectedAt, fallbackCollectedAt, fallbackCollectedAt, null, fallbackCollectedAt);
  fallbackPayload.run(claimId, "members", JSON.stringify({ members: [{ playerEntityId: "player-1", userName: "Cached Tester" }] }), fallbackCollectedAt, fallbackCollectedAt, fallbackCollectedAt, null, fallbackCollectedAt);
  fallbackDb.close();
  const fallbackDashboardResponse = await fetch(`${origin}/api/local/dashboard-data?claimId=${claimId}`);
  assert.equal(fallbackDashboardResponse.status, 200);
  const fallbackDashboard = await fallbackDashboardResponse.json();
  assert.equal(fallbackDashboard.stale, true);
  assert.equal(fallbackDashboard.serverFreshness.cacheState, "stored-stale-if-error");
  assert.equal(fallbackDashboard.claim.claim.entityId, claimId);
  assert.match(fallbackDashboard.partialErrors.join("\n"), /Dashboard refresh failed/);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(child.exitCode, null);
  const health = await fetch(`${origin}/api/local/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.match(String(health.polling.lastError ?? ""), /HTTP 500|upstream unavailable/);
});


test("craft plan catalog refresh admin endpoint keeps the legacy recipe cache warm, persists resumable 429 state, and writes normalized catalog rows", async (t) => {
  let itemsPageRequests = 0;
  let cargoPageRequests = 0;
  const detailRequests = [];
  let firstDetailRelease = null;
  const firstDetailGate = new Promise((resolve) => { firstDetailRelease = resolve; });
  let item200Attempts = 0;
  const upstream = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (gameDataProbabilityFixture(url, res)) return;
    if (url.pathname === "/api/items") {
      itemsPageRequests += 1;
      const page = Number(url.searchParams.get("page") || 1);
      if (page === 1) {
        return json(res, {
          data: {
            items: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1, rarityStr: "Common", iconAssetName: "resin.png", itemListId: "55" }],
            metrics: { total: 2, totalPages: 2, page },
          },
        });
      }
      if (page === 2) {
        return json(res, {
          items: [{ id: "200", itemType: 0, name: "Sawed Timber", tag: "Plank", tier: 2, rarityStr: "Common", iconAssetName: "timber.png", itemListId: "0" }],
          pagination: { page, totalPages: 2, total: 2 },
        });
      }
      return json(res, { items: [], pagination: { page, totalPages: 2, total: 2 } });
    }
    if (url.pathname === "/api/cargo") {
      cargoPageRequests += 1;
      return json(res, {
        results: [{ id: "300", itemType: 1, name: "Resin Bundle", tag: "Crate", tier: 1, rarityStr: "Common", iconAssetName: "bundle.png" }],
        count: 1,
      });
    }
    if (url.pathname === "/api/resources") {
      return json(res, { resources: [] });
    }
    if (url.pathname === "/api/items/100") {
      detailRequests.push("items:100");
      await firstDetailGate;
      return json(res, {
        detail: {
          item: { id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1, rarityStr: "Common", iconAssetName: "resin.png" },
          craftingRecipes: [{
            id: "resin-pack",
            name: "Pack Resin",
            stationName: "Packing Station",
            craftedItemStacks: [{ item_id: "300", item_type: "cargo", quantity: 1 }],
            craftedItems: [{ id: "300", itemType: 1, name: "Resin Bundle", tag: "Crate", tier: 1 }],
            consumedItemStacks: [{ item_id: "100", item_type: "item", quantity: 5 }],
            consumedItems: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1 }],
          }],
          itemListPossibilities: [{
            targetId: "400",
            targetItem: { id: "400", itemType: 0, name: "Sticky Residue", tag: "Residue", tier: 1 },
            quantity: 1,
            chance: 0.2,
            isCargo: false,
          }],
        },
      });
    }
    if (url.pathname === "/api/items/200") {
      detailRequests.push("items:200");
      item200Attempts += 1;
      if (item200Attempts === 1) {
        res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
        return res.end(JSON.stringify({ error: "rate limited" }));
      }
      return json(res, {
        item: { id: "200", itemType: 0, name: "Sawed Timber", tag: "Plank", tier: 2, rarityStr: "Common", iconAssetName: "timber.png" },
        craftingRecipes: [{
          id: "timber-finish",
          name: "Finish Timber",
          stationName: "Workbench",
          craftedItemStacks: [{ item_id: "200", item_type: "item", quantity: 2 }],
          craftedItems: [{ id: "200", itemType: 0, name: "Sawed Timber", tag: "Plank", tier: 2 }],
          consumedItemStacks: [{ item_id: "100", item_type: "item", quantity: 1 }],
          consumedItems: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1 }],
        }],
      });
    }
    if (url.pathname === "/api/items/999") {
      detailRequests.push("items:999");
      return json(res, {
        item: { id: "999", itemType: 0, name: "Legacy Resin", tag: "Material", tier: 1, rarityStr: "Common", iconAssetName: "legacy.png" },
        craftingRecipes: [],
        extractionRecipes: [],
        itemListPossibilities: [],
      });
    }
    if (url.pathname === "/api/cargo/300") {
      detailRequests.push("cargo:300");
      return json(res, {
        cargo: { id: "300", itemType: 1, name: "Resin Bundle", tag: "Crate", tier: 1, rarityStr: "Common", iconAssetName: "bundle.png" },
        recipesUsingItem: [{
          id: "bundle-unpack",
          name: "Unpack Resin",
          stationName: "Unpacking Station",
          craftedItemStacks: [{ item_id: "100", item_type: "item", quantity: 5 }],
          craftedItems: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1 }],
          consumedItemStacks: [{ item_id: "300", item_type: "cargo", quantity: 1 }],
          consumedItems: [{ id: "300", itemType: 1, name: "Resin Bundle", tag: "Crate", tier: 1 }],
        }],
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
      LEGAL_CONFIGURATION_CONFIRMED: "true",
      BITCRAFT_TEST: "true",
      ENABLE_LEGACY_ADMIN_PASSWORD_AUTH: "true",
      ENABLE_SERVER_POLLING: "false",
      ENABLE_SCHEDULED_JOBS: "false",
      BITCRAFT_PROCESS_ROLE: "all",
      ADMIN_SETUP_KEY: "test-setup-key",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      BITJITA_API_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
      GAME_DATA_ITEM_LISTS_URL: `http://127.0.0.1:${upstreamPort}/game-data/item-lists`,
      GAME_DATA_RESOURCES_URL: `http://127.0.0.1:${upstreamPort}/game-data/resources`,
      GAME_DATA_SOURCE_URL: `http://127.0.0.1:${upstreamPort}/game-data`,
      GAME_CATALOG_REFRESH_DETAIL_DELAY_MS: "0",
      GAME_CATALOG_REFRESH_RETRY_DELAYS_MS: "1000,1000,1000",
    },
    stdio: "ignore",
  });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);

  await writeDatabaseWithRetry(path.join(dataDir, "bitcraft-local.sqlite"), (seededDb) => {
    seededDb.prepare(`
      INSERT INTO recipe_catalog_entries (
        catalog_key, kind, target_id, item_type, name, tier, rarity, tag, icon_asset_name,
        detail_json, source, last_synced_at, last_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "items:999",
      "items",
      "999",
      0,
      "Legacy Resin",
      1,
      "Common",
      "Material",
      "legacy.png",
      JSON.stringify({ item: { id: "999", itemType: 0, name: "Legacy Resin", tag: "Material", tier: 1, rarityStr: "Common", iconAssetName: "legacy.png" }, craftingRecipes: [], extractionRecipes: [] }),
      "seeded",
      "2026-06-01T00:00:00.000Z",
      "stale legacy row",
      "2026-06-01T00:00:00.000Z",
    );
  });

  const setup = await fetch(`${origin}/api/local/admin/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "admin", password: "correct horse battery", setupKey: "test-setup-key" }),
  });
  assert.equal(setup.status, 200);
  const auth = await setup.json();
  const cookie = setup.headers.get("set-cookie").split(";")[0];

  const initialStatus = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, {
    headers: { cookie, origin, "x-csrf-token": auth.csrfToken },
  }).then((response) => response.json());
  assert.equal(initialStatus.scheduledJob.key, "recipe_catalog_refresh");
  assert.equal(initialStatus.scheduledJob.schedule, "weekly@1@00:00");
  const unavailableWorkbook = await fetch(`${origin}/api/local/catalog/probabilities.xlsx`);
  assert.equal(unavailableWorkbook.status, 503);
  assert.match((await unavailableWorkbook.json()).error, /Probability catalogue is not ready/);

  const firstRun = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(firstRun.status, 202);

  const duplicateRun = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(duplicateRun.status, 409);
  firstDetailRelease();

  const retryStatus = await waitForCondition("paused rate-limited craft plan catalog refresh", async () => {
    const payload = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, {
      headers: { cookie, origin, "x-csrf-token": auth.csrfToken },
    }).then((response) => response.json());
    return payload.latestRun?.status === "paused" && payload.latestRun?.phase === "waiting_retry" ? payload : null;
  });
  assert.equal(retryStatus.latestRun.cursorKind, "items");
  assert.equal(retryStatus.latestRun.cursorId, "100");
  assert.equal(retryStatus.latestRun.itemCount, 2);
  assert.equal(retryStatus.latestRun.cargoCount, 1);
  assert.equal(retryStatus.latestRun.failureCount, 1);
  assert.match(retryStatus.latestRun.lastError ?? "", /HTTP 429/);
  assert.equal(retryStatus.scheduledJob.metadata.complete, false);
  assert.equal(retryStatus.scheduledJob.metadata.retryReason, "rate_limit");
  assert.deepEqual(detailRequests, ["items:100", "items:200"]);
  assert.equal(item200Attempts, 1);

  const failedDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
  assert.equal(failedDb.prepare("SELECT COUNT(*) AS count FROM game_catalog_entities").get().count, 3);
  assert.equal(failedDb.prepare("SELECT COUNT(*) AS count FROM game_catalog_recipes").get().count, 1);
  assert.equal(failedDb.prepare("SELECT COUNT(*) AS count FROM recipe_catalog_entries").get().count, 2);
  failedDb.close();

  const completedStatus = await waitForCondition("completed craft plan catalog refresh", async () => {
    const payload = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, {
      headers: { cookie, origin, "x-csrf-token": auth.csrfToken },
    }).then((response) => response.json());
    return payload.latestRun?.status === "completed" ? payload : null;
  }, 10000);
  assert.equal(completedStatus.latestRun.processedCount, 3);
  assert.equal(completedStatus.latestRun.failureCount, 1);
  assert.equal(completedStatus.latestRun.recipeCount, 3);
  assert.equal(completedStatus.latestRun.byproductCount, 1);
  assert.equal(completedStatus.scheduledJob.running, false);
  assert.ok(completedStatus.scheduledJob.lastSuccessAt);

  const workbookResponse = await fetch(`${origin}/api/local/catalog/probabilities.xlsx`);
  assert.equal(workbookResponse.status, 200);
  assert.equal(workbookResponse.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(workbookResponse.headers.get("content-disposition"), 'attachment; filename="bitcraft-item-probabilities.xlsx"');
  assert.ok((await workbookResponse.arrayBuffer()).byteLength > 1000);

  const completedDb = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { readOnly: true });
  assert.equal(completedDb.prepare("SELECT COUNT(*) AS count FROM game_catalog_entities").get().count, 3);
  assert.equal(completedDb.prepare("SELECT COUNT(*) AS count FROM game_catalog_recipes").get().count, 3);
  assert.equal(completedDb.prepare("SELECT COUNT(*) AS count FROM game_catalog_item_list_outputs").get().count, 1);
  assert.equal(completedDb.prepare("SELECT COUNT(*) AS count FROM game_catalog_probability_snapshot").get().count, 1);
  assert.equal(completedDb.prepare("SELECT COUNT(*) AS count FROM recipe_catalog_entries").get().count, 4);
  const legacyRow = completedDb.prepare("SELECT source, last_error FROM recipe_catalog_entries WHERE catalog_key = ?").get("items:999");
  const latestRunRow = completedDb.prepare("SELECT status, cursor_kind, cursor_id, processed_count, total_count, item_count, cargo_count, recipe_count, byproduct_count, failure_count FROM game_catalog_refresh_runs ORDER BY id DESC LIMIT 1").get();
  completedDb.close();
  assert.deepEqual({ ...legacyRow }, {
    source: "scheduled_job",
    last_error: null,
  });
  assert.deepEqual({ ...latestRunRow }, {
    status: "completed",
    cursor_kind: "cargo",
    cursor_id: "300",
    processed_count: 3,
    total_count: 3,
    item_count: 2,
    cargo_count: 1,
    recipe_count: 3,
    byproduct_count: 1,
    failure_count: 1,
  });

  assert.deepEqual(detailRequests, ["items:100", "items:200", "items:200", "cargo:300", "items:999"]);
  assert.equal(item200Attempts, 2);
  assert.equal(itemsPageRequests, 2);
  assert.equal(cargoPageRequests, 1);
});

test("craft plan catalog refresh pauses cleanly and schedules an automatic continuation when a batch remains", async (t) => {
  let itemListRequests = 0;
  let cargoListRequests = 0;
  const upstream = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (gameDataProbabilityFixture(url, res)) return;
    if (url.pathname === "/api/items") {
      itemListRequests += 1;
      return json(res, { items: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1 }, { id: "200", itemType: 0, name: "Timber", tag: "Plank", tier: 1 }], pagination: { page: 1, totalPages: 1, total: 2 } });
    }
    if (url.pathname === "/api/cargo") {
      cargoListRequests += 1;
      return json(res, { cargos: [], metrics: { total: 0, totalPages: 1, page: 1 } });
    }
    if (url.pathname === "/api/resources") return json(res, { resources: [] });
    if (url.pathname === "/api/items/100" || url.pathname === "/api/items/200") return json(res, { item: { id: url.pathname.endsWith("100") ? "100" : "200", itemType: 0, name: "Catalog item", tag: "Material", tier: 1 }, craftingRecipes: [] });
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
      LEGAL_CONFIGURATION_CONFIRMED: "true",
      BITCRAFT_TEST: "true",
      ENABLE_LEGACY_ADMIN_PASSWORD_AUTH: "true",
      ENABLE_SERVER_POLLING: "false",
      ENABLE_SCHEDULED_JOBS: "false",
      BITCRAFT_PROCESS_ROLE: "all",
      ADMIN_SETUP_KEY: "test-setup-key",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      BITJITA_API_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
      GAME_DATA_ITEM_LISTS_URL: `http://127.0.0.1:${upstreamPort}/game-data/item-lists`,
      GAME_DATA_RESOURCES_URL: `http://127.0.0.1:${upstreamPort}/game-data/resources`,
      GAME_DATA_SOURCE_URL: `http://127.0.0.1:${upstreamPort}/game-data`,
      GAME_CATALOG_REFRESH_BATCH_SIZE: "1",
      GAME_CATALOG_REFRESH_DETAIL_DELAY_MS: "0",
      GAME_CATALOG_REFRESH_CONTINUE_DELAY_MS: "1000",
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
  const auth = await setup.json();
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  })).status, 202);

  const paused = await waitForCondition("paused catalog continuation", async () => {
    const payload = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, { headers: { cookie, origin, "x-csrf-token": auth.csrfToken } }).then((response) => response.json());
    return payload.latestRun?.status === "paused" ? payload : null;
  });
  assert.equal(paused.latestRun.processedCount, 1);
  assert.equal(paused.latestRun.lastError, null);
  assert.equal(paused.scheduledJob.lastError, null);
  assert.equal(paused.scheduledJob.metadata.complete, false);
  assert.equal(paused.scheduledJob.metadata.continueAfterMs, 1000);
  assert.ok(new Date(paused.scheduledJob.nextRunAt).getTime() < Date.now() + 5000);

  const completed = await waitForCondition("self-continued catalog refresh", async () => {
    const payload = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, { headers: { cookie, origin, "x-csrf-token": auth.csrfToken } }).then((response) => response.json());
    return payload.latestRun?.status === "completed" ? payload : null;
  }, 10000);
  assert.equal(completed.latestRun.processedCount, 2);
  assert.equal(itemListRequests, 1);
  assert.equal(cargoListRequests, 1);
});
test("craft plan catalog refresh resets stale resume cursor counters when the saved target disappears", async (t) => {
  const detailRequests = [];
  const upstream = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (gameDataProbabilityFixture(url, res)) return;
    if (url.pathname === "/api/items") {
      const page = Number(url.searchParams.get("page") || 1);
      if (page === 1) {
        return json(res, {
          items: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1, rarityStr: "Common", iconAssetName: "resin.png" }],
          pagination: { page, totalPages: 2, total: 2 },
        });
      }
      if (page === 2) {
        return json(res, {
          items: [{ id: "200", itemType: 0, name: "Sawed Timber", tag: "Plank", tier: 2, rarityStr: "Common", iconAssetName: "timber.png" }],
          pagination: { page, totalPages: 2, total: 2 },
        });
      }
      return json(res, { items: [], pagination: { page, totalPages: 2, total: 2 } });
    }
    if (url.pathname === "/api/cargo") {
      return json(res, {
        cargos: [{ id: "300", itemType: 1, name: "Resin Bundle", tag: "Crate", tier: 1, rarityStr: "Common", iconAssetName: "bundle.png" }],
        metrics: { total: 1, totalPages: 1, page: 1 },
      });
    }
    if (url.pathname === "/api/resources") return json(res, { resources: [] });
    if (url.pathname === "/api/items/100") {
      detailRequests.push("items:100");
      return json(res, {
        item: { id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1, rarityStr: "Common", iconAssetName: "resin.png" },
        craftingRecipes: [{
          id: "resin-pack",
          name: "Pack Resin",
          stationName: "Packing Station",
          craftedItemStacks: [{ item_id: "300", item_type: "cargo", quantity: 1 }],
          craftedItems: [{ id: "300", itemType: 1, name: "Resin Bundle", tag: "Crate", tier: 1 }],
          consumedItemStacks: [{ item_id: "100", item_type: "item", quantity: 5 }],
          consumedItems: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1 }],
        }],
        itemListPossibilities: [{
          targetId: "400",
          targetItem: { id: "400", itemType: 0, name: "Sticky Residue", tag: "Residue", tier: 1 },
          quantity: 1,
          chance: 0.2,
          isCargo: false,
        }],
      });
    }
    if (url.pathname === "/api/items/200") {
      detailRequests.push("items:200");
      return json(res, {
        item: { id: "200", itemType: 0, name: "Sawed Timber", tag: "Plank", tier: 2, rarityStr: "Common", iconAssetName: "timber.png" },
        craftingRecipes: [{
          id: "timber-finish",
          name: "Finish Timber",
          stationName: "Workbench",
          craftedItemStacks: [{ item_id: "200", item_type: "item", quantity: 2 }],
          craftedItems: [{ id: "200", itemType: 0, name: "Sawed Timber", tag: "Plank", tier: 2 }],
          consumedItemStacks: [{ item_id: "100", item_type: "item", quantity: 1 }],
          consumedItems: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1 }],
        }],
      });
    }
    if (url.pathname === "/api/cargo/300") {
      detailRequests.push("cargo:300");
      return json(res, {
        cargo: { id: "300", itemType: 1, name: "Resin Bundle", tag: "Crate", tier: 1, rarityStr: "Common", iconAssetName: "bundle.png" },
        recipesUsingItem: [{
          id: "bundle-unpack",
          name: "Unpack Resin",
          stationName: "Unpacking Station",
          craftedItemStacks: [{ item_id: "100", item_type: "item", quantity: 5 }],
          craftedItems: [{ id: "100", itemType: 0, name: "Resin", tag: "Material", tier: 1 }],
          consumedItemStacks: [{ item_id: "300", item_type: "cargo", quantity: 1 }],
          consumedItems: [{ id: "300", itemType: 1, name: "Resin Bundle", tag: "Crate", tier: 1 }],
        }],
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
      LEGAL_CONFIGURATION_CONFIRMED: "true",
      BITCRAFT_TEST: "true",
      ENABLE_LEGACY_ADMIN_PASSWORD_AUTH: "true",
      ENABLE_SERVER_POLLING: "false",
      ENABLE_SCHEDULED_JOBS: "false",
      BITCRAFT_PROCESS_ROLE: "all",
      ADMIN_SETUP_KEY: "test-setup-key",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      BITJITA_API_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
      GAME_DATA_ITEM_LISTS_URL: `http://127.0.0.1:${upstreamPort}/game-data/item-lists`,
      GAME_DATA_RESOURCES_URL: `http://127.0.0.1:${upstreamPort}/game-data/resources`,
      GAME_DATA_SOURCE_URL: `http://127.0.0.1:${upstreamPort}/game-data`,
      GAME_CATALOG_REFRESH_DETAIL_DELAY_MS: "0",
    },
    stdio: "ignore",
  });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);

  await writeDatabaseWithRetry(path.join(dataDir, "bitcraft-local.sqlite"), (seedDb) => {
    seedDb.prepare(`
      INSERT INTO game_catalog_refresh_runs (
        status, phase, cursor_kind, cursor_id, processed_count, total_count, item_count, cargo_count,
        recipe_count, byproduct_count, failure_count, started_at, completed_at, last_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "failed",
      "item_detail",
      "items",
      "999",
      7,
      9,
      5,
      4,
      11,
      13,
      17,
      "2026-06-01T00:00:00.000Z",
      null,
      "stale resume cursor",
      "2026-06-01T00:00:00.000Z",
    );
  });

  const setup = await fetch(`${origin}/api/local/admin/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "admin", password: "correct horse battery", setupKey: "test-setup-key" }),
  });
  assert.equal(setup.status, 200);
  const auth = await setup.json();
  const cookie = setup.headers.get("set-cookie").split(";")[0];

  const run = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrfToken },
    body: "{}",
  });
  assert.equal(run.status, 202);

  const completedStatus = await waitForCondition("completed craft plan catalog refresh after stale cursor reset", async () => {
    const payload = await fetch(`${origin}/api/local/admin/craft-plan/catalog-refresh`, {
      headers: { cookie, origin, "x-csrf-token": auth.csrfToken },
    }).then((response) => response.json());
    return payload.latestRun?.status === "completed" ? payload : null;
  });

  assert.deepEqual(detailRequests, ["items:100", "items:200", "cargo:300"]);
  assert.equal(completedStatus.latestRun.cursorKind, "cargo");
  assert.equal(completedStatus.latestRun.cursorId, "300");
  assert.equal(completedStatus.latestRun.processedCount, 3);
  assert.equal(completedStatus.latestRun.totalCount, 3);
  assert.equal(completedStatus.latestRun.itemCount, 2);
  assert.equal(completedStatus.latestRun.cargoCount, 1);
  assert.equal(completedStatus.latestRun.recipeCount, 3);
  assert.equal(completedStatus.latestRun.byproductCount, 1);
  assert.equal(completedStatus.latestRun.failureCount, 0);
});
