import assert from "node:assert/strict";
import test from "node:test";

import { createBitjitaProxyCache } from "../src/server/bitjitaProxyCache.mjs";

test("BitJita proxy cache applies endpoint TTL policies and upstream headers", async () => {
  let currentTime = 1_000;
  const requests = [];
  const proxyCache = createBitjitaProxyCache({
    appIdentifier: "test-app",
    defaultTtlMs: 1_000,
    staleIfErrorMs: 5_000,
    maxEntries: 25,
    timeoutMs: 2_500,
    now: () => currentTime,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), headers: options.headers, hasSignal: Boolean(options.signal) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  });

  const upstream = new URL("https://bitjita.example/api/resources");
  const miss = await proxyCache.fetchUpstreamCached(upstream);
  const hit = await proxyCache.fetchUpstreamCached(upstream);

  assert.equal(miss.cacheState, "miss");
  assert.equal(miss.ttlMs, 60 * 60 * 1000);
  assert.equal(miss.headers["cache-control"], "public, max-age=3600");
  assert.equal(hit.cacheState, "hit");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].headers, { accept: "application/json", "x-app-identifier": "test-app" });
  assert.equal(requests[0].hasSignal, true);
  assert.equal(proxyCache.hasFreshCache(upstream), true);
});

test("BitJita proxy cache dedupes inflight requests and serves stale cached data on upstream failure", async () => {
  let currentTime = 1_000;
  let releaseFetch;
  let fetchCount = 0;
  const proxyCache = createBitjitaProxyCache({
    appIdentifier: "test-app",
    defaultTtlMs: 100,
    staleIfErrorMs: 5_000,
    maxEntries: 25,
    timeoutMs: 0,
    now: () => currentTime,
    fetchImpl: async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        await new Promise((resolve) => {
          releaseFetch = resolve;
        });
        return new Response(JSON.stringify({ request: fetchCount }), { status: 200 });
      }
      return new Response("upstream down", { status: 503 });
    },
  });
  const upstream = new URL("https://bitjita.example/api/cache-test?same=1");

  const first = proxyCache.fetchUpstreamCached(upstream);
  const second = proxyCache.fetchUpstreamCached(upstream);
  releaseFetch();
  const [miss, deduped] = await Promise.all([first, second]);

  assert.equal(fetchCount, 1);
  assert.equal(miss.cacheState, "miss");
  assert.equal(deduped.cacheState, "deduped");
  assert.deepEqual(JSON.parse(miss.body.toString("utf8")), { request: 1 });

  currentTime += 150;
  const stale = await proxyCache.fetchUpstreamCached(upstream);

  assert.equal(fetchCount, 2);
  assert.equal(stale.cacheState, "stale-if-error");
  assert.equal(stale.stale, true);
  assert.deepEqual(JSON.parse(stale.body.toString("utf8")), { request: 1 });
});

test("BitJita proxy cache prunes expired and oldest entries", async () => {
  let currentTime = 1_000;
  let fetchCount = 0;
  const proxyCache = createBitjitaProxyCache({
    appIdentifier: "test-app",
    defaultTtlMs: 100,
    staleIfErrorMs: 100,
    maxEntries: 2,
    timeoutMs: 0,
    now: () => currentTime,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ request: fetchCount }), { status: 200 });
    },
  });

  const first = new URL("https://bitjita.example/api/cache-a");
  const second = new URL("https://bitjita.example/api/cache-b");
  const third = new URL("https://bitjita.example/api/cache-c");
  await proxyCache.fetchUpstreamCached(first);
  await proxyCache.fetchUpstreamCached(second);
  await proxyCache.fetchUpstreamCached(third);

  assert.equal(proxyCache.cacheSize(), 2);
  assert.equal(proxyCache.hasFreshCache(first), false);
  assert.equal(proxyCache.hasFreshCache(second), true);
  assert.equal(proxyCache.hasFreshCache(third), true);

  currentTime += 300;
  proxyCache.prune();

  assert.equal(proxyCache.cacheSize(), 0);
});
