import assert from "node:assert/strict";
import test from "node:test";

import {
  MapResourceAdmissionError,
  MapResourceBinaryCache,
} from "../src/server/mapResourceBinaryCache.mjs";

function partition({ key, generation, bytes = 8, receivedAt = "2026-08-14T00:00:00.000Z" }) {
  const [regionId, resourceId] = key.split(":");
  return {
    key,
    regionId,
    resourceId,
    generation,
    coordinates: Uint32Array.of(Number(generation)),
    encoded: new Uint8Array(bytes),
    encodedBytes: bytes,
    pointCount: 1,
    receivedAt,
    freshness: "live",
    warning: null,
  };
}

test("keeps latest and one lossless previous generation within the grace window", () => {
  let now = 1_000;
  const cache = new MapResourceBinaryCache({ maxBytes: 64, previousGenerationGraceMs: 500, now: () => now });
  cache.put(partition({ key: "19:28", generation: "18446744073709551614" }));
  cache.put(partition({ key: "19:28", generation: "18446744073709551615" }));

  assert.equal(cache.latest("19:28").generation, "18446744073709551615");
  assert.equal(cache.get("19:28", "18446744073709551614").generation, "18446744073709551614");
  assert.equal(cache.health().bytes, 16);
  now = 1_501;
  assert.equal(cache.get("19:28", "18446744073709551614"), null);
  assert.equal(cache.health().bytes, 8);
});

test("evicts the least recently used idle key and keeps recently read data", () => {
  const cache = new MapResourceBinaryCache({ maxBytes: 16, previousGenerationGraceMs: 500, now: () => 1_000 });
  cache.put(partition({ key: "19:2", generation: "1" }));
  cache.put(partition({ key: "19:28", generation: "1" }));
  cache.latest("19:2");
  cache.put(partition({ key: "19:125", generation: "1" }));

  assert.equal(cache.latest("19:28"), null);
  assert.equal(cache.latest("19:2").generation, "1");
  assert.equal(cache.latest("19:125").generation, "1");
  assert.equal(cache.health().evictions, 1);
});

test("retained keys are protected and oversized admission is transactional", () => {
  const cache = new MapResourceBinaryCache({ maxBytes: 16, previousGenerationGraceMs: 500, now: () => 1_000 });
  cache.put(partition({ key: "19:2", generation: "1" }));
  cache.put(partition({ key: "19:28", generation: "1" }));
  const release2 = cache.retain("19:2");
  const release28 = cache.retain("19:28");

  assert.throws(
    () => cache.put(partition({ key: "19:125", generation: "1" })),
    (error) => error instanceof MapResourceAdmissionError && error.statusCode === 429,
  );
  assert.equal(cache.latest("19:2").generation, "1");
  assert.equal(cache.latest("19:28").generation, "1");
  assert.equal(cache.latest("19:125"), null);
  assert.deepEqual(cache.health(), {
    bytes: 16,
    entries: 2,
    activeEntries: 2,
    evictions: 0,
    rejections: 1,
  });

  release2();
  release2();
  release28();
  assert.equal(cache.health().activeEntries, 0);
});

test("rejects a single payload larger than capacity before mutation", () => {
  const cache = new MapResourceBinaryCache({ maxBytes: 8, previousGenerationGraceMs: 500, now: () => 1_000 });
  assert.throws(() => cache.put(partition({ key: "19:2", generation: "1", bytes: 9 })), MapResourceAdmissionError);
  assert.deepEqual(cache.health(), {
    bytes: 0,
    entries: 0,
    activeEntries: 0,
    evictions: 0,
    rejections: 1,
  });
});

test("removes keys explicitly and exposes aggregate-only health", () => {
  const cache = new MapResourceBinaryCache({ maxBytes: 32, previousGenerationGraceMs: 500, now: () => 1_000 });
  cache.put(partition({ key: "19:125", generation: "7" }));
  cache.remove("19:125");
  const serialized = JSON.stringify(cache.health());
  assert.equal(cache.latest("19:125"), null);
  assert.equal(serialized.includes("19"), false);
  assert.equal(serialized.includes("125"), false);
  assert.equal(serialized.includes("generation"), false);
});
