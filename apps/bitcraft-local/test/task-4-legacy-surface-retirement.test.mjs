import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFileSync(path.join(appDir, relativePath), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "server") return [];
      return sourceFiles(absolutePath);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

test("every active browser panel uses provider-neutral game data or intentionally requests no page data", async () => {
  const { pageDomains } = await import(
    new URL("../src/api/pageDomains.ts", import.meta.url).href,
  );
  const panels = [
    "dashboard", "leaderboard", "members", "skills", "craft-monitor",
    "planning", "publiccrafts", "craftcalc", "inventory", "construction",
    "research", "market", "settlement-market", "region", "empires", "map",
    "sync", "activity", "admin",
  ];
  const intentionallyFocused = new Set(["planning", "craftcalc", "market", "sync", "admin"]);

  for (const panel of panels) {
    const domains = pageDomains(panel);
    assert.equal(
      domains.length > 0 || intentionallyFocused.has(panel),
      true,
      `${panel} must have provider-neutral domains or an intentional focused-route exemption`,
    );
  }

  const loader = source("src/api/gameDataLoader.ts");
  assert.doesNotMatch(loader, /legacyPageEndpointMap|LEGACY_API|PAGE_NAVIGATION_CACHE_TTL_MS/);
  assert.match(loader, /const domains = pageDomains\(activePanel\)/);
  assert.deepEqual(pageDomains("market"), []);
});

test("browser source contains no BitJita proxy request", () => {
  const browserFiles = sourceFiles(path.join(appDir, "src"));
  const offenders = browserFiles
    .filter((filename) => readFileSync(filename, "utf8").includes("/api/bitjita"))
    .map((filename) => path.relative(appDir, filename));
  assert.deepEqual(offenders, []);
});

test("legacy proxy and helper routes and their acquisition caches are absent", () => {
  const server = source("server.mjs");
  for (const route of [
    "/api/bitjita/",
    "/api/local/dashboard-data",
    "/api/local/player-details",
    "/api/local/passive-crafts",
    "/api/local/production/crafts",
  ]) {
    assert.doesNotMatch(server, new RegExp(route.replaceAll("/", "\\/")));
  }
  for (const symbol of [
    "proxyBitjita",
    "fetchAllClaimListings",
    "fetchCachedClaimDetail",
    "fetchCachedPlayerDetail",
    "fetchCachedPassiveCrafts",
    "passiveCraftSummaries",
    "playerDetailSummaries",
    "settlementProductionCrafts",
    "dashboardDataFresh",
    "storedDashboardDataFallback",
    "playerDetailSummariesCache",
    "passiveCraftSummariesCache",
    "productionCraftsCache",
    "dashboardDataCache",
  ]) {
    assert.doesNotMatch(server, new RegExp(`\\b${symbol}\\b`));
  }
});

test("only the two blocked evidence paths may call fetchBitjita", () => {
  const server = source("server.mjs");
  const calls = server
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("fetchBitjita(") && !line.startsWith("async function fetchBitjita("));

  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.match(
      call,
      /\/crafts\/\$\{encodeURIComponent\(key\)\}\/contributions|\/market\/player\/\$\{playerId\}\/(?:trades|history)/,
      `unexpected BitJita acquisition: ${call}`,
    );
  }
});

test("Discord operational commands use committed Relay snapshots and local craft catalogs", () => {
  const server = source("server.mjs");
  const start = server.indexOf("async function discordSuppliesCommand()");
  const end = server.indexOf("async function discordPriceCommand(", start);
  const commands = server.slice(start, end);

  assert.match(commands, /readRelayClaimForSupplyReport/);
  assert.match(commands, /readRelayOnlineMembers/);
  assert.match(commands, /readRelayCraftsForDiscord/);
  assert.match(commands, /enrichCraftsForPlanning/);
  assert.match(commands, /providerCatalogRepository\.getDescription\("crafting_recipe"/);
  assert.doesNotMatch(commands, /fetchBitjita/);
});

test("Craft Plan save reconciles committed Relay buildings without an upstream request", () => {
  const server = source("server.mjs");
  const start = server.indexOf('if (req.method === "PUT" && url.pathname === "/api/local/admin/craft-plan")');
  const end = server.indexOf('if (req.method === "PUT" && url.pathname === "/api/local/admin/access-control")', start);
  const route = server.slice(start, end);

  assert.match(route, /currentClaimBuildingsProjection\(getSettings\(\)\.claimId\)/);
  assert.doesNotMatch(route, /fetchBitjita|\/buildings/);
  assert.match(server, /readRelayClaimBuildingsForPlanning/);
});

test("current-data copy names Relay while legal disclosure retains BitJita evidence processing", () => {
  const appShell = source("src/AppShell.tsx");
  const tour = source("src/tour/firstRunTour.ts");
  const health = source("src/components/admin/ServerHealthSection.tsx");
  const legal = source("src/components/main/LegalDialogs.tsx");

  assert.match(appShell, /Data: BitCraft Relay/);
  assert.doesNotMatch(tour, /live BitJita data/);
  assert.match(health, /BitJita evidence/i);
  assert.match(legal, /BitJita API/);
});
