import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { loadGameData, pageDomains } = await import(
  new URL("../src/api/gameData.ts", import.meta.url).href,
);

test("claim overview, Members, Professions, and Leaderboard request provider-neutral local domains", async () => {
  assert.deepEqual(pageDomains("dashboard"), ["claim", "members", "citizens", "players"]);
  assert.deepEqual(pageDomains("members"), ["claim", "members", "citizens", "players"]);
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
  assert.match(source, /PROVIDER_NEUTRAL_PANELS[\s\S]*"dashboard"[\s\S]*"members"[\s\S]*"skills"[\s\S]*"leaderboard"/);
  assert.match(source, /PROVIDER_NEUTRAL_PANELS\.has\(activePanel\)/);
});

test("server background ingestion keeps citizens and the primary-region player session current", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /RelayPrimaryRegionRuntime/);
  assert.match(source, /domains:\s*\[[^\]]*"claim"[^\]]*"members"[^\]]*"citizens"/);
  assert.match(source, /relayPrimaryRegionRuntime\.(?:start|reconcile)/);
  assert.match(source, /primaryRegion\s*=\s*runtimeHealthWithPersistedSnapshot\(/);
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
