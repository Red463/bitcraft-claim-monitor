import assert from "node:assert/strict";
import test from "node:test";

import { createPageNavigationCache } from "../src/api/pageNavigationCache.ts";

function entry(claimId, panel, payloadBytes = 16, extras = {}) {
  return {
    claimId,
    panel,
    data: {
      claimId,
      panel,
      inventories: [{ itemType: 0, itemId: "7" }, { itemType: 1, itemId: "7" }],
      domainStatus: { inventories: { generation: "42", coherence: "complete" } },
      responseMeta: { coherence: "complete", generatedAt: "2026-08-22T00:00:00.000Z" },
      ...extras,
    },
    payloadBytes,
    generation: "42",
    coherence: "complete",
  };
}

test("evicts the least recently used entry when the ninth distinct scope is stored", () => {
  const cache = createPageNavigationCache({ maxEntries: 8, maxBytes: 100_000, now: () => 0 });
  for (let index = 0; index < 8; index += 1) cache.set(`claim-a:panel-${index}`, entry("claim-a", `panel-${index}`));
  assert.ok(cache.get("claim-a:panel-0"));
  cache.set("claim-a:panel-8", entry("claim-a", "panel-8"));

  assert.equal(cache.get("claim-a:panel-1"), undefined);
  assert.ok(cache.get("claim-a:panel-0"));
  assert.ok(cache.get("claim-a:panel-8"));
  assert.equal(cache.stats().entries, 8);
  assert.equal(cache.stats().evictions, 1);
});

test("evicts entries until conservative resident bytes fit the configured bound", () => {
  const cache = createPageNavigationCache({ maxEntries: 8, maxBytes: 2_300, now: () => 0 });
  cache.set("claim-a:dashboard", entry("claim-a", "dashboard", 600));
  cache.set("claim-a:members", entry("claim-a", "members", 600));
  cache.set("claim-a:inventory", entry("claim-a", "inventory", 600));

  assert.equal(cache.get("claim-a:dashboard"), undefined);
  assert.ok(cache.get("claim-a:members"));
  assert.ok(cache.get("claim-a:inventory"));
  assert.ok(cache.stats().approximateBytes <= 2_300);
});

test("returns an oversized active value without retaining it", () => {
  const cache = createPageNavigationCache({ maxBytes: 1024, now: () => 0 });
  const oversized = entry("claim-a", "dashboard", 4_194_305);

  assert.equal(cache.set("claim-a:dashboard", oversized), oversized);
  assert.equal(cache.get("claim-a:dashboard"), undefined);
  assert.equal(cache.stats().entries, 0);
});

test("uses an absolute TTL while reads refresh only LRU order", () => {
  let now = 0;
  const cache = createPageNavigationCache({ ttlMs: 300_000, maxBytes: 100_000, now: () => now });
  cache.set("claim-a:dashboard", entry("claim-a", "dashboard"));
  now = 299_999;
  assert.ok(cache.get("claim-a:dashboard"));
  now = 300_001;
  assert.equal(cache.get("claim-a:dashboard"), undefined);
});

test("clearClaim matches the exact claim and preserves item/cargo identities and metadata", () => {
  const cache = createPageNavigationCache({ maxBytes: 100_000, now: () => 0 });
  const preserved = entry("claim-a", "inventory");
  cache.set("claim-a:inventory", preserved);
  cache.set("claim-ab:inventory", entry("claim-ab", "inventory"));

  assert.equal(cache.get("claim-a:inventory"), preserved);
  assert.deepEqual(cache.get("claim-a:inventory")?.data.inventories, [{ itemType: 0, itemId: "7" }, { itemType: 1, itemId: "7" }]);
  assert.deepEqual(cache.get("claim-a:inventory")?.data.domainStatus, preserved.data.domainStatus);
  assert.deepEqual(cache.get("claim-a:inventory")?.data.responseMeta, preserved.data.responseMeta);
  cache.clearClaim("claim-a");
  assert.equal(cache.get("claim-a:inventory"), undefined);
  assert.ok(cache.get("claim-ab:inventory"));
  cache.clear();
  assert.equal(cache.stats().entries, 0);
});

test("reports aggregate hit, miss, eviction, entry, and byte statistics", () => {
  const cache = createPageNavigationCache({ maxEntries: 1, maxBytes: 100_000, now: () => 0 });
  cache.set("claim-a:dashboard", entry("claim-a", "dashboard"));
  assert.ok(cache.get("claim-a:dashboard"));
  assert.equal(cache.get("missing:dashboard"), undefined);
  cache.set("claim-a:members", entry("claim-a", "members"));

  assert.deepEqual(cache.stats(), {
    hits: 1,
    misses: 1,
    evictions: 1,
    entries: 1,
    approximateBytes: cache.stats().approximateBytes,
  });
  assert.ok(cache.stats().approximateBytes > 0);
});

test("does not retain an entry when its payload byte estimate is missing or invalid", () => {
  const cache = createPageNavigationCache({ maxBytes: 100_000, now: () => 0 });
  cache.set("claim-a:dashboard", { ...entry("claim-a", "dashboard"), payloadBytes: undefined });
  cache.set("claim-a:members", { ...entry("claim-a", "members"), payloadBytes: Number.NaN });

  assert.equal(cache.get("claim-a:dashboard"), undefined);
  assert.equal(cache.get("claim-a:members"), undefined);
  assert.equal(cache.stats().entries, 0);
});
