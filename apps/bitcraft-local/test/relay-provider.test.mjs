import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

const { RelayBitCraftProvider } = await import(
  new URL("../src/server/game-data/relayProvider.ts", import.meta.url).href,
);

function relayResponses() {
  return new Map([
    ["/health", {
      sources: {
        global: {
          database: "generated-global",
          port: 3000,
          schema_cached: true,
          metrics: {
            initial_subscribe_complete: true,
            upstream: { state: "up" },
            publisher: { fingerprint: "global-schema" },
          },
        },
        "bc-primary": {
          database: "generated-region-19",
          port: 3019,
          schema_cached: true,
          metrics: {
            upstream_database: "bitcraft-live-19",
            initial_subscribe_complete: true,
            upstream: { state: "up" },
            publisher: { fingerprint: "region-schema" },
          },
        },
      },
    }],
    ["/cache-health", { ready: true, regions: [{ region: 19, ready: true }] }],
    ["/claim/1369094286777412590", {
      entity_id: "1369094286777412590",
      name: "Timbersteel Trade",
      region: 19,
      owner_player_entity_id: "1369094286756659093",
      supplies: 55837,
      treasury: 2703,
      tier: 5,
      num_tiles: 1806,
      tile_cost: 0.0125,
      upkeep_cost: 22.575,
      supplies_run_out: 1794254519732,
    }],
    ["/claim/1369094286777412590/members", {
      count: 1,
      members: [{
        entity_id: "1369094286777413408",
        claim_entity_id: "1369094286777412590",
        player_entity_id: "1369094286756659093",
        user_name: "Modular",
        hexcoins: 100638,
        build_permission: true,
        inventory_permission: true,
        officer_permission: true,
        co_owner_permission: true,
        last_active_timestamp: 1785350252,
        skills: { 2: 67, 15: 39 },
      }],
      skill_names: { 2: "Forestry", 15: "Construction" },
    }],
  ]);
}

test("Relay provider discovers topology then atomically commits normalized claim and members", async () => {
  const responses = relayResponses();
  const requested = [];
  const fetcher = async (input) => {
    const url = new URL(String(input));
    requested.push(url.pathname);
    const body = responses.get(url.pathname);
    return body
      ? new Response(JSON.stringify(body), { status: 200 })
      : new Response("missing", { status: 404 });
  };
  const batches = [];
  const sink = {
    commitGeneration: async (batch) => batches.push(batch),
    appendEvents: async () => {},
    markError: async () => {},
    nextGeneration: () => 12,
  };
  const provider = new RelayBitCraftProvider({
    fetcher,
    now: () => new Date("2026-07-29T19:00:00.000Z"),
    scheduleTopologyRefresh: () => () => {},
  });

  await provider.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, sink);

  assert.deepEqual(requested, [
    "/health",
    "/cache-health",
    "/claim/1369094286777412590",
    "/claim/1369094286777412590/members",
  ]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].generation, 12);
  assert.equal(batches[0].domains.claim.data.regionId, "19");
  assert.equal(batches[0].domains.members.data[0].userName, "Modular");
  assert.equal(batches[0].domains.citizens.data[0].totalLevel, 106);
  assert.equal(batches[0].domains.claim.provenance.database, null);
  assert.equal(batches[0].domains.claim.provenance.sourceKey, "relay-cache");
  assert.equal(provider.health().sources["region:19"].database, "generated-region-19");
  assert.equal(provider.health().generation, 12);

  await provider.stop();
  assert.equal(provider.health().running, false);
});

test("Relay provider fingerprints current live topology before persisting source health", async () => {
  const responses = relayResponses();
  const globalSchema = JSON.stringify({ tables: [{ name: "item_desc" }] });
  const regionalSchema = JSON.stringify({ tables: [{ name: "claim_state" }] });
  responses.set("/health", {
    sources: {
      global: {
        connectivity: "live",
        connected_since: "2026-08-01T07:00:00.000Z",
        database: "bitcraft-live-global",
        port: 3000,
        schema_cached: true,
        tables_live: 281,
        tables_total: 281,
      },
      "unexpected-region-key": {
        connectivity: "live",
        connected_since: "2026-08-01T07:00:00.000Z",
        database: "bitcraft-live-19",
        port: 3019,
        schema_cached: true,
        tables_live: 274,
        tables_total: 274,
      },
    },
  });
  const healthWrites = [];
  const provider = new RelayBitCraftProvider({
    fetcher: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/schema")) {
        const body = url.port === "3000" ? globalSchema : regionalSchema;
        return new Response(body, { status: 200 });
      }
      const body = responses.get(url.pathname);
      return body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("missing", { status: 404 });
    },
    now: () => new Date("2026-08-01T07:00:01.000Z"),
    scheduleTopologyRefresh: () => () => {},
  });

  await provider.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, {
    commitGeneration: async () => {},
    appendEvents: async () => {},
    recordHealth: async (health) => healthWrites.push(structuredClone(health)),
  });

  const health = healthWrites.at(-1);
  assert.equal(
    health.sources.global.schemaFingerprint,
    createHash("sha256").update(globalSchema).digest("hex"),
  );
  assert.equal(
    health.sources["region:19"].schemaFingerprint,
    createHash("sha256").update(regionalSchema).digest("hex"),
  );
});

test("Relay provider rejects a claim whose derived region is not available and preserves last-good data", async () => {
  const responses = relayResponses();
  responses.set("/claim/1369094286777412590", {
    ...responses.get("/claim/1369094286777412590"),
    region: 20,
  });
  const errors = [];
  const provider = new RelayBitCraftProvider({
    fetcher: async (input) => {
      const body = responses.get(new URL(String(input)).pathname);
      return body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("missing", { status: 404 });
    },
    now: () => new Date("2026-07-29T19:00:00.000Z"),
    scheduleTopologyRefresh: () => () => {},
  });

  await assert.rejects(provider.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, {
    commitGeneration: async () => assert.fail("invalid generation must not commit"),
    appendEvents: async () => {},
    markError: async (_claimId, domain, error) => errors.push([domain, error]),
  }), /region 20 is not available/i);

  assert.deepEqual(errors.map(([domain]) => domain), ["claim", "members", "citizens"]);
  assert.equal(provider.health().generation, 0);
});

test("Relay provider rejects cross-claim claim and member payloads without committing", async (t) => {
  for (const scenario of ["claim", "member"]) {
    await t.test(scenario, async () => {
      const responses = relayResponses();
      if (scenario === "claim") {
        responses.set("/claim/1369094286777412590", {
          ...responses.get("/claim/1369094286777412590"),
          entity_id: "999",
        });
      } else {
        const payload = structuredClone(responses.get("/claim/1369094286777412590/members"));
        payload.members[0].claim_entity_id = "999";
        responses.set("/claim/1369094286777412590/members", payload);
      }
      const provider = new RelayBitCraftProvider({
        fetcher: async (input) => {
          const body = responses.get(new URL(String(input)).pathname);
          return body
            ? new Response(JSON.stringify(body), { status: 200 })
            : new Response("missing", { status: 404 });
        },
        scheduleTopologyRefresh: () => () => {},
      });
      await assert.rejects(provider.start({
        relayBaseUrl: "https://relay.example",
        claimId: "1369094286777412590",
        activeRegionIds: ["19"],
      }, {
        commitGeneration: async () => assert.fail("cross-claim data must not commit"),
        appendEvents: async () => {},
        markError: async () => {},
      }), /does not match the configured claim/i);
    });
  }
});

test("Relay provider commits a successful claim when members are temporarily unavailable", async () => {
  const responses = relayResponses();
  responses.delete("/claim/1369094286777412590/members");
  const batches = [];
  const errors = [];
  const provider = new RelayBitCraftProvider({
    fetcher: async (input) => {
      const body = responses.get(new URL(String(input)).pathname);
      return body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("temporary failure", { status: 503 });
    },
    now: () => new Date("2026-07-29T19:00:00.000Z"),
    scheduleTopologyRefresh: () => () => {},
  });

  await provider.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, {
    commitGeneration: async (batch) => batches.push(batch),
    appendEvents: async () => {},
    markError: async (_claimId, domain, error) => errors.push([domain, error]),
  });

  assert.equal(batches.length, 1);
  assert.deepEqual(Object.keys(batches[0].domains), ["claim"]);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(([domain]) => domain), ["members", "citizens"]);
  assert.match(provider.health().lastError, /members/i);
});

test("Relay provider loads bounded inventory, craft, and deposit HTTP domains", async () => {
  const responses = relayResponses();
  const craftCompletedFilters = [];
  responses.set("/claim/1369094286777412590/inventory", {
    claim: { entity_id: "1369094286777412590", name: "Timbersteel Trade", region: 19 },
    dimensions: [{
      dimension_id: 1,
      kind: "Claim",
      buildings: [{
        entity_id: "1369094286778488967",
        name: "Simple Chest",
        items: [{ item_id: 42, item_type: "Cargo", quantity: 5 }],
      }],
    }],
  });
  responses.set("/claim/1369094286777412590/crafts", {
    crafts: [{
      entity_id: "1369094286813753789",
      building_entity_id: "1369094286799387835",
      claim_entity_id: "1369094286777412590",
      owner_entity_id: "864691128504576674",
      recipe_id: 209007,
      crafted_item: [],
    }],
  });
  responses.set("/deposits", {
    deposits: [{ entity_id: "1", region: 19, status: "unknown" }],
  });
  const batches = [];
  const provider = new RelayBitCraftProvider({
    fetcher: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/crafts")) {
        craftCompletedFilters.push(url.searchParams.get("completed"));
      }
      const body = responses.get(url.pathname);
      return body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("missing", { status: 404 });
    },
    now: () => new Date("2026-07-29T19:00:00.000Z"),
    scheduleTopologyRefresh: () => () => {},
  });
  await provider.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, {
    commitGeneration: async (batch) => batches.push(batch),
    appendEvents: async () => {},
  });

  const result = await provider.refresh({
    claimId: "1369094286777412590",
    domains: ["inventories", "crafts", "deposits"],
    reason: "scheduled",
  });

  assert.deepEqual(result.refreshed, ["inventories", "crafts", "deposits"]);
  assert.equal(batches.at(-1).domains.inventories.data.buildings[0].inventory[0].contents.itemType, "cargo");
  assert.equal(batches.at(-1).domains.crafts.data.craftResults[0].entityId, "1369094286813753789");
  assert.equal(batches.at(-1).domains.deposits.data[0].status, "unknown");
  assert.deepEqual(craftCompletedFilters, ["false", "true"]);
});

test("Relay provider rejects cross-region deposit rows and preserves the last-good domain", async () => {
  const responses = relayResponses();
  responses.set("/deposits", {
    deposits: [{ entity_id: "1", region: 20, status: "active" }],
  });
  const batches = [];
  const errors = [];
  const provider = new RelayBitCraftProvider({
    fetcher: async (input) => {
      const body = responses.get(new URL(String(input)).pathname);
      return body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("missing", { status: 404 });
    },
    scheduleTopologyRefresh: () => () => {},
  });
  await provider.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, {
    commitGeneration: async (batch) => batches.push(batch),
    appendEvents: async () => {},
    markError: async (_claimId, domain, error) => errors.push([domain, error]),
  });

  await assert.rejects(provider.refresh({
    claimId: "1369094286777412590",
    domains: ["deposits"],
    reason: "scheduled",
  }), /region 20 does not match.*region 19/i);

  assert.equal(batches.length, 1);
  assert.equal(Object.hasOwn(batches[0].domains, "deposits"), false);
  assert.deepEqual(errors.map(([domain]) => domain), ["deposits"]);
});

test("Relay provider coalesces concurrent refreshes covered by the same in-flight domains", async () => {
  const responses = relayResponses();
  responses.set("/claim/1369094286777412590/inventory", {
    claim: { entity_id: "1369094286777412590", name: "Timbersteel Trade", region: 19 },
    dimensions: [],
  });
  let releaseInventory;
  const inventoryGate = new Promise((resolve) => { releaseInventory = resolve; });
  let inventoryCalls = 0;
  const provider = new RelayBitCraftProvider({
    fetcher: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/inventory")) {
        inventoryCalls += 1;
        await inventoryGate;
      }
      const body = responses.get(url.pathname);
      return body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("missing", { status: 404 });
    },
    scheduleTopologyRefresh: () => () => {},
  });
  await provider.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, {
    commitGeneration: async () => {},
    appendEvents: async () => {},
  });

  const first = provider.refresh({
    claimId: "1369094286777412590",
    domains: ["claim", "inventories"],
    reason: "scheduled",
  });
  while (inventoryCalls === 0) await new Promise((resolve) => setImmediate(resolve));
  const second = provider.refresh({
    claimId: "1369094286777412590",
    domains: ["inventories"],
    reason: "manual",
  });
  releaseInventory();

  await Promise.all([first, second]);
  assert.equal(inventoryCalls, 1);
});

test("Relay provider restarts against a changed monitored claim without a process restart", async () => {
  const responses = relayResponses();
  responses.set("/claim/2", {
    ...responses.get("/claim/1369094286777412590"),
    entity_id: "2",
    name: "Second Claim",
  });
  responses.set("/claim/2/members", { count: 0, members: [], skill_names: {} });
  const requested = [];
  const batches = [];
  const sink = {
    commitGeneration: async (batch) => batches.push(batch),
    appendEvents: async () => {},
    nextGeneration: () => 1,
  };
  const provider = new RelayBitCraftProvider({
    fetcher: async (input) => {
      const pathname = new URL(String(input)).pathname;
      requested.push(pathname);
      const body = responses.get(pathname);
      return body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("missing", { status: 404 });
    },
    scheduleTopologyRefresh: () => () => {},
  });

  await provider.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, sink);
  assert.equal(await provider.reconcile({
    relayBaseUrl: "https://relay.example/",
    claimId: "1369094286777412590",
    activeRegionIds: ["19"],
  }, sink), false);
  assert.equal(await provider.reconcile({
    relayBaseUrl: "https://relay.example",
    claimId: "2",
    activeRegionIds: ["19"],
  }, sink), true);

  assert.equal(provider.health().running, true);
  assert.equal(batches.at(-1).claimId, "2");
  assert.equal(batches.at(-1).domains.claim.data.name, "Second Claim");
  assert.equal(requested.filter((pathname) => pathname === "/health").length, 2);
});
