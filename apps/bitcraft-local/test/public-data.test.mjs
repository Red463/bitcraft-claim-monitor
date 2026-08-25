import assert from "node:assert/strict";
import test from "node:test";

let publicData = null;
try {
  publicData = await import("../src/server/public/publicData.mjs");
} catch {
  // RED: Task 3 owns this isolated public-data boundary.
}

const normalizers = await import("../src/server/game-data/normalizers.ts");
const { relayTopologyFromPayloads } = await import("../src/server/game-data/topology.ts");

test("public settlement search validates NFKC visible text and canonical unsigned-64 identifiers", () => {
  assert.ok(publicData, "public data module must exist");
  assert.deepEqual(publicData.normalizePublicSearchQuery("  Ｏａｋ  "), { kind: "name", value: "Oak" });
  assert.deepEqual(publicData.normalizePublicSearchQuery("18446744073709551615"), { kind: "id", value: "18446744073709551615" });
  for (const invalid of ["ab", "a\nb", "01", "18446744073709551616", "x".repeat(65)]) {
    assert.throws(() => publicData.normalizePublicSearchQuery(invalid), { name: "PublicDataError", status: 400 });
  }
});

test("public settlement hints rank exact, prefix, then substring matches and expose only safe fields", () => {
  const rows = [
    { entity_id: "4", name: "West Oak", region: 19, owner_player_username: "D", secret: "no" },
    { entity_id: "2", name: "Oakland", region: 7, owner_player_username: "B", tier: 4 },
    { entity_id: "3", name: "Oak", region: 8, owner_player_username: "C", tier: 5 },
    { entity_id: "1", name: "oak", region: 9, owner_player_username: "A", tier: 6 },
    { entity_id: "5", name: "Birch", region: 10 },
  ];

  assert.deepEqual(publicData.publicSettlementHints(rows, "OAK"), [
    { claimId: "1", name: "oak", regionId: "9", tier: 6, ownerName: "A" },
    { claimId: "3", name: "Oak", regionId: "8", tier: 5, ownerName: "C" },
    { claimId: "2", name: "Oakland", regionId: "7", tier: 4, ownerName: "B" },
    { claimId: "4", name: "West Oak", regionId: "19", ownerName: "D" },
  ]);
});

test("public response cache singleflights identical work and serves fresh values", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = publicData.createBoundedStaleCache({
    freshMs: 60_000,
    staleMs: 300_000,
    maxEntries: 256,
    maxBytes: 2 * 1024 * 1024,
    now: () => now,
  });
  const load = async () => {
    loads += 1;
    await Promise.resolve();
    return { hints: [{ claimId: "42" }] };
  };

  const [first, joined] = await Promise.all([cache.load("oak", load), cache.load("oak", load)]);
  now += 59_999;
  const fresh = await cache.load("oak", load);

  assert.equal(loads, 1);
  assert.deepEqual(joined, first);
  assert.deepEqual(fresh, { value: { hints: [{ claimId: "42" }] }, stale: false, ageMs: 59_999 });
});

test("public response cache serves stale data only inside stale-if-error window", async () => {
  let now = 0;
  const cache = publicData.createBoundedStaleCache({
    freshMs: 20_000,
    staleMs: 120_000,
    maxEntries: 128,
    maxBytes: 32 * 1024 * 1024,
    maxEntryBytes: 4 * 1024 * 1024,
    now: () => now,
  });
  await cache.load("42:claim", async () => ({ claimId: "42" }));
  now = 20_001;
  const stale = await cache.load("42:claim", async () => { throw new Error("Relay offline"); });
  assert.deepEqual(stale, { value: { claimId: "42" }, stale: true, ageMs: 20_001, error: "Relay offline" });

  now = 120_001;
  await assert.rejects(
    cache.load("42:claim", async () => { throw new Error("Relay offline"); }),
    /Relay offline/,
  );
});

test("public response cache enforces total and per-entry byte caps with LRU eviction", async () => {
  const cache = publicData.createBoundedStaleCache({
    freshMs: 20_000,
    staleMs: 120_000,
    maxEntries: 3,
    maxBytes: 55,
    maxEntryBytes: 40,
  });
  await cache.load("a", async () => ({ value: "a".repeat(10) }));
  await cache.load("b", async () => ({ value: "b".repeat(10) }));
  await cache.load("c", async () => ({ value: "c".repeat(10) }));
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 44, inflight: 0 });
  await assert.rejects(
    cache.load("oversized", async () => ({ value: "x".repeat(50) })),
    { name: "PublicDataError", status: 503 },
  );
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 44, inflight: 0 });
});

test("public Relay gate runs four requests, queues twelve, and rejects excess work", async () => {
  const gate = publicData.createPublicRelayGate({ maxActive: 4, maxQueued: 12 });
  const releases = [];
  let active = 0;
  let peak = 0;
  const work = Array.from({ length: 16 }, (_, index) => gate.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => releases.push(resolve));
    active -= 1;
    return index;
  }));
  await Promise.resolve();
  assert.equal(peak, 4);
  assert.deepEqual(gate.stats(), { active: 4, queued: 12 });
  await assert.rejects(gate.run(async () => 17), { name: "PublicDataError", status: 503, retryAfter: 1 });

  while (releases.length || gate.stats().active || gate.stats().queued) {
    releases.splice(0).forEach((release) => release());
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.deepEqual(await Promise.all(work), Array.from({ length: 16 }, (_, index) => index));
  assert.equal(peak, 4);
});

test("public per-IP limiter enforces burst and sustained settlement budgets lazily", () => {
  let now = 0;
  const limiter = publicData.createPublicIpRateLimiter({ now: () => now });
  for (let window = 0; window < 5; window += 1) {
    for (let index = 0; index < 6; index += 1) assert.equal(limiter.take("203.0.113.1", "search").allowed, true);
    assert.equal(limiter.take("203.0.113.1", "search").allowed, false);
    now += 30_001;
  }
  assert.deepEqual(limiter.take("203.0.113.1", "search"), { allowed: false, retryAfter: 450 });
  assert.equal(limiter.take("203.0.113.2", "search").allowed, true);

  now = 600_001;
  assert.equal(limiter.take("203.0.113.1", "search").allowed, true);

  for (let window = 0; window < 5; window += 1) {
    for (let index = 0; index < 4; index += 1) assert.equal(limiter.take("203.0.113.3", "snapshot").allowed, true);
    now += 30_001;
  }
  assert.equal(limiter.take("203.0.113.3", "snapshot").allowed, false);
});

test("public settlement service searches names and revalidates exact IDs without repository access", async () => {
  const calls = [];
  const service = publicData.createPublicDataService({
    http: {
      searchClaims: async (query) => {
        calls.push(["search", query]);
        return [
          { entity_id: "42", name: "Oakland", region: 19, owner_player_username: "Owner" },
          { entity_id: "41", name: "Oak", region: 7, owner_player_username: "Exact" },
        ];
      },
      claim: async (id) => {
        calls.push(["claim", id]);
        return { entity_id: id, name: "Exact ID", region: 19 };
      },
    },
    normalizers,
  });

  const byName = await service.searchSettlements(" oak ");
  const byId = await service.searchSettlements("42");

  assert.deepEqual(byName.hints.map(({ claimId }) => claimId), ["41", "42"]);
  assert.deepEqual(byId.hints, [{ claimId: "42", name: "Exact ID", regionId: "19" }]);
  assert.deepEqual(calls, [["search", "oak"], ["claim", "42"]]);
  assert.equal("configuredClaimId" in byId, false);
});

test("public settlement snapshot validates topology, coalesces roster reads, and preserves typed decimal identities", async () => {
  const claimId = "18446744073709551615";
  let rosterReads = 0;
  let domainActive = 0;
  let domainPeak = 0;
  const domain = async (value) => {
    domainActive += 1;
    domainPeak = Math.max(domainPeak, domainActive);
    await Promise.resolve();
    domainActive -= 1;
    return value;
  };
  const claim = { entity_id: claimId, name: "Decimal Haven", region: 19, tier: 7 };
  const service = publicData.createPublicDataService({
    http: {
      claim: async () => claim,
      health: async () => ({
        sources: { "bitcraft-live-19": { database: "bitcraft-live-19", port: 3019, schema_cached: true, connectivity: "live", tables_live: 274, tables_total: 274 } },
      }),
      cacheHealth: async () => ({ ready: true, regions: [{ region: 19, ready: true }] }),
      members: async () => {
        rosterReads += 1;
        return domain({ claim, members: [{
          entity_id: "9007199254740994",
          claim_entity_id: claimId,
          player_entity_id: "9007199254740993",
          user_name: "A",
          hexcoins: "9007199254740995",
          skills: { 2: 51 },
        }], skill_names: { 2: "Forestry" } });
      },
      inventory: async () => domain({ claim, dimensions: [{ dimension_id: "9007199254740996", kind: "overworld", buildings: [{
        entity_id: "9007199254740997", name: "Chest", items: [
          { item_id: 42, item_type: "Item", quantity: "9007199254740998" },
          { item_id: 42, item_type: "Cargo", quantity: "9007199254740999" },
        ],
      }] }] }),
      crafts: async (_id, completed) => domain({ claim, crafts: [{
        entity_id: completed ? "12" : "11",
        building_entity_id: "10",
        claim_entity_id: claimId,
        owner_entity_id: "9",
        completed,
        craft_count: "1",
        progress: "1",
        recipe_id: completed ? "8" : "7",
        total_actions_required: "2",
        crafted_item: [{ item_id: 42, item_type: completed ? "Cargo" : "Item", quantity: "3" }],
      }] }),
    },
    normalizers,
    topologyFromPayloads: relayTopologyFromPayloads,
  });

  const snapshot = await service.snapshot(claimId, "claim,members,citizens,inventories,crafts");
  assert.equal(rosterReads, 1);
  assert.equal(domainPeak, 2);
  assert.equal(snapshot.claimId, claimId);
  assert.equal(snapshot.domains.members.data[0].playerEntityId, "9007199254740993");
  assert.equal(snapshot.domains.members.data[0].hexcoins, "9007199254740995");
  assert.deepEqual(snapshot.domains.inventories.data.buildings[0].items.map(({ itemId, itemType, quantity, catalogKey }) => ({ itemId, itemType, quantity, catalogKey })), [
    { itemId: "42", itemType: "item", quantity: "9007199254740998", catalogKey: "items:42" },
    { itemId: "42", itemType: "cargo", quantity: "9007199254740999", catalogKey: "cargo:42" },
  ]);
  assert.deepEqual(snapshot.domains.crafts.data.craftResults.map(({ entityId, craftedItem }) => [entityId, craftedItem[0].catalogKey]), [["11", "items:42"], ["12", "cargo:42"]]);
});

test("public catalog wrapper exposes typed display fields and strips upstream metadata from recipe detail", () => {
  const catalog = publicData.createPublicCatalogService({
    searchEntities: () => [{
      targetId: "42", kind: "items", itemType: 0, name: "Oak Log", tag: "wood", tier: 2,
      rarity: "Common", iconAssetName: "Items/Oak", upstreamUrl: "https://secret.example",
    }],
    recipeDetail: (target) => ({
      detail: { item: { id: target.id, name: "Oak Log", iconAssetName: "Items/Oak", sourceUrl: "https://secret.example" }, craftingRecipes: [] },
      provider: "relay",
      upstreamOrigin: "https://secret.example",
    }),
  });

  assert.deepEqual(catalog.search(" oak "), {
    query: "oak",
    items: [{ id: "42", kind: "items", itemType: 0, name: "Oak Log", tag: "wood", tier: 2, rarityStr: "Common", iconAssetName: "Items/Oak", catalogKey: "items:42" }],
    cargos: [],
  });
  assert.deepEqual(catalog.recipe("item", "42"), {
    detail: { item: { id: "42", name: "Oak Log", iconAssetName: "Items/Oak" }, craftingRecipes: [] },
    provider: "relay",
  });
  assert.throws(() => catalog.recipe("items", "42"), { name: "PublicDataError", status: 400 });
});

test("public snapshot rejects mismatched embedded craft claim metadata even when craft rows are empty", async () => {
  const service = publicData.createPublicDataService({
    http: {
      claim: async () => ({ entity_id: "42", name: "Oak", region: 19 }),
      health: async () => ({ sources: {
        "bitcraft-live-19": { database: "bitcraft-live-19", port: 3019, schema_cached: true, connectivity: "live", tables_live: 274, tables_total: 274 },
      } }),
      cacheHealth: async () => ({ ready: true, regions: [{ region: 19, ready: true }] }),
      crafts: async () => ({ claim: { entity_id: "43", name: "Foreign", region: 19 }, crafts: [] }),
    },
    normalizers,
    topologyFromPayloads: relayTopologyFromPayloads,
  });

  await assert.rejects(service.snapshot("42", "crafts"), { name: "PublicDataError", status: 502 });
});
