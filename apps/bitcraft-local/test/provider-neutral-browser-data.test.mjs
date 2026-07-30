import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { loadGameData, pageDomains } = await import(
  new URL("../src/api/gameData.ts", import.meta.url).href,
);

test("claim overview, Members, Professions, and Leaderboard request provider-neutral local domains", async () => {
  assert.deepEqual(pageDomains("dashboard"), ["claim", "members", "citizens", "players"]);
  assert.deepEqual(pageDomains("members"), ["claim", "members", "citizens", "players", "equipment", "crafts"]);
  assert.deepEqual(pageDomains("skills"), ["claim", "members", "citizens", "players", "skills"]);
  assert.deepEqual(pageDomains("leaderboard"), ["claim", "members", "citizens", "players", "skills"]);

  const requestedUrls = [];
  const result = await loadGameData(
    "1369094286777412590",
    ["claim", "members"],
    async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({
        claimId: "1369094286777412590",
        regionId: "19",
        generatedAt: "2026-07-29T12:00:00.000Z",
        domains: {
          claim: {
            data: { entityId: "1369094286777412590", name: "Timbersteel Trade", regionId: "19" },
            freshness: "fresh",
            confidence: "joined",
            ageMs: 100,
            provenance: {},
            warnings: [],
          },
          members: {
            data: [{ playerEntityId: "1", userName: "Modular" }],
            freshness: "fresh",
            confidence: "joined",
            ageMs: 100,
            provenance: {},
            warnings: [],
          },
        },
        partialErrors: [],
      }), { status: 200 });
    },
  );

  assert.deepEqual(requestedUrls, [
    "/api/local/game-data?claimId=1369094286777412590&domains=claim%2Cmembers",
  ]);
  assert.equal(result.claim.name, "Timbersteel Trade");
  assert.equal(result.members[0].userName, "Modular");
  assert.equal(result.serverFreshness.stale, false);
});

test("browser loader routes the first Milestone 3 pages through local game data", async () => {
  const source = await readFile(new URL("../src/api/bitjita.ts", import.meta.url), "utf8");
  assert.match(source, /PROVIDER_NEUTRAL_PANELS[\s\S]*"dashboard"[\s\S]*"members"[\s\S]*"skills"[\s\S]*"leaderboard"[\s\S]*"inventory"[\s\S]*"craft-monitor"/);
  assert.match(source, /PROVIDER_NEUTRAL_PANELS\.has\(activePanel\)/);
  assert.deepEqual(pageDomains("inventory"), ["claim", "members", "inventories"]);
});

test("Craft Monitor uses the provider-neutral craft snapshot and local catalog projection", async () => {
  const source = await readFile(new URL("../src/pages/ProductionPage.tsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.deepEqual(pageDomains("craft-monitor"), ["claim", "members", "citizens", "players", "crafts", "contributions"]);
  assert.doesNotMatch(source, /\/api\/bitjita/);
  assert.doesNotMatch(source, /\/api\/local\/passive-crafts/);
  assert.match(source, /data\.raw\?\.crafts\?\.passiveCraftResults/);
  assert.match(source, /\/api\/local\/player-data/);
  assert.match(source, /playerToolbeltTools/);
  assert.doesNotMatch(source, /players\/\$\{memberId\}\/inventories/);
  assert.match(server, /enrichCraftsWithCatalog/);
  assert.match(server, /providerCatalogRepository\.getDescription\("crafting_recipe", recipeId\)/);
});

test("Members uses Relay equipment, passive crafts, and bounded player inventory", async () => {
  const source = await readFile(new URL("../src/pages/MembersPage.tsx", import.meta.url), "utf8");
  assert.match(source, /data\.raw\?\.equipment\?\.members/);
  assert.match(source, /data\.raw\?\.crafts\?\.passiveCraftResults/);
  assert.match(source, /\/api\/local\/player-data/);
  assert.doesNotMatch(source, /players\/\$\{selectedId\}\/(?:buffs|equipment|equipment\/presets|inventories|passive-crafts)/);
  assert.doesNotMatch(source, /BitJita has not reported gear/);
});

test("Inventory uses only provider-neutral local routes", async () => {
  const source = await readFile(new URL("../src/pages/InventoryPage.tsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\/api\/bitjita/);
  assert.match(source, /const LOCAL_API = "\/api\/local"/);
  assert.match(source, /LOCAL_API}\/catalog\/item-detail/);
  assert.match(server, /\/api\/local\/catalog\/item-detail/);
  assert.match(server, /enrichInventoryWithCatalog\(\s*data/);
  assert.match(server, /providerCatalogRepository\.listDescriptions\("crafting_recipe"\)/);
});

test("server background ingestion keeps citizens and the primary-region player session current", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /RelayPrimaryRegionRuntime/);
  assert.match(source, /domains:\s*\[[^\]]*"claim"[^\]]*"members"[^\]]*"citizens"/);
  assert.match(source, /relayPrimaryRegionRuntime\.(?:start|reconcile)/);
  assert.match(source, /primaryRegion\s*=\s*runtimeHealthWithPersistedSnapshot\(/);
});

test("Relay HTTP current domains refresh on their own live loop instead of the legacy collector schedule", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /RELAY_HTTP_REFRESH_MS \?\? 15000/);
  assert.match(server, /setInterval\(\(\) => void refreshRelay\(\), relayHttpRefreshMs\)/);
  assert.doesNotMatch(server, /setInterval\(\(\) => void refreshRelay\(\), serverRefreshIntervalMs\(\)\)/);
});

test("bounded member inventory is exposed through a provider-neutral guarded local route", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const routeIndex = server.indexOf('url.pathname === "/api/local/player-data"');
  assert.notEqual(routeIndex, -1);
  const boundary = server.indexOf("\n    if (req.method", routeIndex + 10);
  const handler = server.slice(routeIndex, boundary === -1 ? routeIndex + 2200 : boundary);
  assert.match(handler, /manualRefreshAccess\(req, res\)/);
  assert.match(handler, /relayPlayerDataService\.inventory/);
  assert.match(handler, /domains:\s*\{\s*inventory/);
  assert.doesNotMatch(handler, /bitjita/i);
});

test("browser loader keeps usable stale envelopes and rejects an all-unavailable response", async () => {
  const stale = await loadGameData("1369094286777412590", ["claim"], async () => new Response(JSON.stringify({
    claimId: "1369094286777412590",
    regionId: "19",
    generatedAt: "2026-07-29T12:00:00.000Z",
    domains: {
      claim: {
        data: { entityId: "1369094286777412590", name: "Timbersteel Trade", regionId: "19" },
        freshness: "stale",
        confidence: "joined",
        ageMs: 120000,
        provenance: { receivedAt: "2026-07-29T11:58:00.000Z" },
        warnings: [],
      },
    },
    partialErrors: ["claim: Relay unavailable"],
  }), { status: 200 }));
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.partialErrors, ["claim: Relay unavailable"]);

  await assert.rejects(
    loadGameData("1369094286777412590", ["claim"], async () => new Response("unavailable", { status: 503 })),
    /game data.*HTTP 503/i,
  );
});
