import assert from "node:assert/strict";
import test from "node:test";

import { encodeResourcePartition, packResourceCoordinate } from "../src/map/resourcePartitionCodec.mjs";
import { createMapResourceBinaryLoader } from "../src/pages/map/mapResourceBinaryLoader.mjs";

const bush = { key: "19|resource:2", regionId: "19", resourceId: "2" };
const ferns = { key: "19|resource:125", regionId: "19", resourceId: "125" };

function bytes(partition, generation, coordinate) {
  return encodeResourcePartition({
    regionId: partition.regionId,
    resourceId: partition.resourceId,
    dimension: "1",
    generation,
    coordinates: Uint32Array.of(coordinate),
  }).buffer;
}

function connections() {
  const opened = [];
  return {
    opened,
    connectEvents(url, onEvent, onError) {
      const connection = { url, onEvent, onError, closeCount: 0, close() { this.closeCount += 1; } };
      opened.push(connection);
      return connection;
    },
  };
}

async function drain() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

test("fetches independent ready partitions concurrently and coalesces duplicate generations", async () => {
  const events = connections();
  const requests = [];
  const changes = [];
  const loader = createMapResourceBinaryLoader({
    fetchBinary: async (url, signal) => {
      requests.push({ url, signal });
      const parsed = new URL(url, "http://localhost");
      const partition = parsed.searchParams.get("resourceId") === "2" ? bush : ferns;
      return bytes(partition, parsed.searchParams.get("generation"), packResourceCoordinate(Number(partition.resourceId), 1));
    },
    connectEvents: events.connectEvents,
    onChange: (state) => changes.push(state),
    onError() {},
  });
  loader.setScope([bush, ferns], "/api/local/map/resource-events?regions=19&resourceIds=2%2C125");
  const stream = events.opened[0];
  stream.onEvent({ type: "partition-ready", key: bush.key, generation: "7", pointCount: 1, encodedBytes: 48, freshness: "live", url: "/api/local/map/resource-partition?regionId=19&resourceId=2&generation=7" });
  stream.onEvent({ type: "partition-ready", key: ferns.key, generation: "8", pointCount: 1, encodedBytes: 48, freshness: "live", url: "/api/local/map/resource-partition?regionId=19&resourceId=125&generation=8" });
  stream.onEvent({ type: "partition-ready", key: bush.key, generation: "7", pointCount: 1, encodedBytes: 48, freshness: "live", url: "/duplicate" });
  await drain();

  assert.equal(requests.length, 2);
  const state = changes.at(-1);
  assert.equal(state.get(bush.key).generation, "7");
  assert.equal(state.get(ferns.key).generation, "8");
  assert.deepEqual([...state.get(bush.key).committed], [packResourceCoordinate(2, 1)]);
  loader.stop();
});

test("rejects a response identity mismatch without clearing another committed partition", async () => {
  const events = connections();
  const errors = [];
  const changes = [];
  const loader = createMapResourceBinaryLoader({
    fetchBinary: async (url) => url.includes("resourceId=2")
      ? bytes(bush, "7", packResourceCoordinate(1, 1))
      : bytes(bush, "8", packResourceCoordinate(2, 2)),
    connectEvents: events.connectEvents,
    onChange: (state) => changes.push(state),
    onError: (message) => errors.push(message),
  });
  loader.setScope([bush, ferns], "/events");
  events.opened[0].onEvent({ type: "partition-ready", key: bush.key, generation: "7", freshness: "live", url: "/partition?resourceId=2" });
  await drain();
  events.opened[0].onEvent({ type: "partition-ready", key: ferns.key, generation: "8", freshness: "live", url: "/partition?resourceId=125" });
  await drain();

  const state = changes.at(-1);
  assert.equal(state.get(bush.key).generation, "7");
  assert.equal(state.get(ferns.key).status, "unavailable");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].includes("19"), false);
  loader.stop();
});

test("recovers one expired generation through the canonical latest URL", async () => {
  const events = connections();
  const requests = [];
  const changes = [];
  const loader = createMapResourceBinaryLoader({
    fetchBinary: async (url) => {
      requests.push(url);
      if (requests.length === 1) return { status: 409, json: { currentGeneration: "8", url: "/latest" } };
      return bytes(bush, "8", packResourceCoordinate(8, 8));
    },
    connectEvents: events.connectEvents,
    onChange: (state) => changes.push(state),
    onError() {},
  });
  loader.setScope([bush], "/events");
  events.opened[0].onEvent({ type: "partition-ready", key: bush.key, generation: "7", freshness: "live", url: "/expired" });
  await drain();

  assert.deepEqual(requests, ["/expired", "/latest"]);
  assert.equal(changes.at(-1).get(bush.key).generation, "8");
  loader.stop();
});

test("pause, resume, scope removal, and stop clean up each owned resource once", async () => {
  const events = connections();
  const signals = [];
  const changes = [];
  const loader = createMapResourceBinaryLoader({
    fetchBinary: (_url, signal) => {
      signals.push(signal);
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    },
    connectEvents: events.connectEvents,
    onChange: (state) => changes.push(state),
    onError() {},
  });
  loader.setScope([bush, ferns], "/events");
  events.opened[0].onEvent({ type: "partition-ready", key: bush.key, generation: "7", freshness: "live", url: "/bush" });
  events.opened[0].onEvent({ type: "partition-ready", key: ferns.key, generation: "8", freshness: "live", url: "/ferns" });
  await drain();
  loader.pause();
  assert.equal(events.opened[0].closeCount, 1);
  assert.equal(signals.every((signal) => signal.aborted), true);

  loader.resume();
  assert.match(events.opened[1].url, /generations=/);
  loader.setScope([ferns], "/events");
  assert.deepEqual([...changes.at(-1).keys()], [ferns.key]);
  loader.stop();
  loader.stop();
  assert.equal(events.opened.at(-1).closeCount, 1);
});
