import assert from "node:assert/strict";
import test from "node:test";

const { discoverRelayTopology } = await import(
  new URL("../src/server/game-data/topology.ts", import.meta.url).href,
);
const { RelayHttpClient } = await import(
  new URL("../src/server/game-data/http.ts", import.meta.url).href,
);

test("topology discovery derives global and regional databases without fixed ports or names", async () => {
  const responses = new Map([
    ["https://relay.example/health", {
      schema_count: 2,
      sources: {
        global: {
          database: "dynamic-global-db",
          port: 4000,
          schema_cached: true,
          metrics: {
            initial_subscribe_complete: true,
            publisher: { fingerprint: "global-fingerprint" },
            upstream: { state: "up" },
          },
        },
        "unexpected-source-key": {
          database: "dynamic-region-db",
          port: 4919,
          schema_cached: true,
          metrics: {
            mirror_database: "dynamic-region-db",
            upstream_database: "bitcraft-live-19",
            initial_subscribe_complete: true,
            publisher: { fingerprint: "region-fingerprint" },
            upstream: { state: "up" },
          },
        },
      },
    }],
    ["https://relay.example/cache-health", {
      ready: true,
      regions: [{ region: 19, ready: true }],
    }],
  ]);
  const fetcher = async (input) => {
    const body = responses.get(String(input));
    return body
      ? new Response(JSON.stringify(body), { status: 200 })
      : new Response("missing", { status: 404 });
  };

  const topology = await discoverRelayTopology("https://relay.example", fetcher);

  assert.equal(topology.cacheReady, true);
  assert.deepEqual(topology.global, {
    sourceKey: "global",
    database: "dynamic-global-db",
    port: 4000,
    schemaFingerprint: "global-fingerprint",
    ready: true,
  });
  assert.deepEqual(topology.regions.get("19"), {
    sourceKey: "region:19",
    database: "dynamic-region-db",
    port: 4919,
    schemaFingerprint: "region-fingerprint",
    ready: true,
  });
});

test("Relay HTTP retries one transient response but never retries a permanent 4xx", async () => {
  const calls = [];
  const transientClient = new RelayHttpClient({
    baseUrl: "https://relay.example",
    fetcher: async (input) => {
      calls.push(String(input));
      return calls.length === 1
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ entity_id: "1369094286777412590" }), { status: 200 });
    },
    retryDelayMs: 0,
  });

  assert.deepEqual(await transientClient.claim("1369094286777412590"), {
    entity_id: "1369094286777412590",
  });
  assert.equal(calls.length, 2);

  let permanentCalls = 0;
  const permanentClient = new RelayHttpClient({
    baseUrl: "https://relay.example",
    fetcher: async () => {
      permanentCalls += 1;
      return new Response("not found", { status: 404 });
    },
    retryDelayMs: 0,
  });
  await assert.rejects(permanentClient.members("1369094286777412590"), /HTTP 404/);
  assert.equal(permanentCalls, 1);
});

test("Relay HTTP requests one bounded player inventory by encoded player ID", async () => {
  const requested = [];
  const client = new RelayHttpClient({
    baseUrl: "https://relay.example",
    fetcher: async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ player: {}, inventories: [] }), { status: 200 });
    },
    retryDelayMs: 0,
  });

  await client.playerInventory("101/with separator");
  assert.deepEqual(requested, ["https://relay.example/player/101%2Fwith%20separator/inventory"]);
});

test("Relay HTTP opens its circuit after five failures in one minute", async () => {
  let calls = 0;
  const client = new RelayHttpClient({
    baseUrl: "https://relay.example",
    fetcher: async () => {
      calls += 1;
      throw new TypeError("network unavailable");
    },
    retryDelayMs: 0,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(client.claim("1369094286777412590"), /network unavailable/);
  }
  await assert.rejects(client.claim("1369094286777412590"), /circuit is open/i);
  assert.equal(calls, 10);
});
