import assert from "node:assert/strict";
import test from "node:test";

import {
  MapResourcePageError,
  buildMapResourcePartitionPayload,
  createMapResourceCursorCodec,
  parseMapResourcePartitionScope,
  parseMapResourceSelectionScope,
} from "../src/server/mapResourcePages.mjs";

const cursorCodec = createMapResourceCursorCodec(Buffer.from("test-map-resource-cursor-secret"));

function point(entityId, regionId = "19", resourceId = "28", name = "") {
  return {
    entityId,
    regionId,
    resourceId,
    locationX: Number(entityId),
    locationZ: Number(entityId) + 10,
    dimension: "1",
    observedAt: "2026-08-12T20:00:00.000Z",
    name,
  };
}

function collection(resources) {
  return {
    data: { resources },
    generation: 9,
    freshness: "live",
    provenance: { receivedAt: "2026-08-12T20:00:00.000Z" },
    warnings: [],
    requestedKeys: ["19|resource:28"],
    readyKeys: ["19|resource:28"],
    loadingKeys: [],
    unavailableKeys: [],
  };
}

test("resource partition scope accepts exactly one authorized canonical region and resource", () => {
  const params = new URLSearchParams({ region: "019", resourceId: "00028" });
  assert.deepEqual(parseMapResourcePartitionScope(params, { allowedRegionIds: ["19", "24"] }), {
    regionId: "19",
    resourceId: "28",
    cursor: null,
  });
  assert.throws(
    () => parseMapResourcePartitionScope(new URLSearchParams({ region: "99", resourceId: "28" }), { allowedRegionIds: ["19"] }),
    (error) => error instanceof MapResourcePageError && error.statusCode === 422,
  );
});

test("resource selection scope accepts every ready region without the operational four-region cap", () => {
  const params = new URLSearchParams({ regions: "5,1,4,2,3", resourceIds: "1000028,28" });
  assert.deepEqual(parseMapResourceSelectionScope(params, { allowedRegionIds: ["1", "2", "3", "4", "5"] }), {
    regionIds: ["1", "2", "3", "4", "5"],
    resourceIds: ["28", "1000028"],
  });
  assert.throws(
    () => parseMapResourceSelectionScope(new URLSearchParams({ regions: "1", resourceIds: "" }), { allowedRegionIds: ["1"] }),
    (error) => error instanceof MapResourcePageError && error.statusCode === 422,
  );
});

test("resource pages cover one partition without loss or duplication", () => {
  const resourceCollection = collection([point("3"), point("1"), point("2")]);
  const first = buildMapResourcePartitionPayload({
    scope: { regionId: "19", resourceId: "28", cursor: null },
    resourceCollection,
    cursorCodec,
    pageFeatureLimit: 2,
    pageByteLimit: 4096,
  });
  const second = buildMapResourcePartitionPayload({
    scope: { regionId: "19", resourceId: "28", cursor: first.nextCursor },
    resourceCollection,
    cursorCodec,
    pageFeatureLimit: 2,
    pageByteLimit: 4096,
  });

  assert.deepEqual([...first.resources, ...second.resources].map((row) => row[0]), ["1", "2", "3"]);
  assert.equal(first.complete, false);
  assert.ok(first.nextCursor);
  assert.equal(second.complete, true);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(second.partition, { regionId: "19", resourceId: "28" });
  assert.equal(second.generation, "9");
});

test("resource cursors cannot cross partition or generation boundaries", () => {
  const token = cursorCodec.encode({ regionId: "19", resourceId: "28", generation: "9", offset: 2 });
  assert.deepEqual(cursorCodec.decode(token, { regionId: "19", resourceId: "28", generation: "9" }), { offset: 2 });
  assert.throws(() => cursorCodec.decode(token, { regionId: "24", resourceId: "28", generation: "9" }), /cursor/i);
  assert.throws(() => cursorCodec.decode(token, { regionId: "19", resourceId: "28", generation: "10" }), /cursor/i);
  assert.throws(() => cursorCodec.decode(`${token}x`, { regionId: "19", resourceId: "28", generation: "9" }), /cursor/i);
});

test("resource page compact rows stay within the serialized byte budget", () => {
  const resourceCollection = collection([
    point("1", "19", "28", "x".repeat(500)),
    point("2", "19", "28", "x".repeat(500)),
    point("3", "19", "28", "x".repeat(500)),
  ]);
  const payload = buildMapResourcePartitionPayload({
    scope: { regionId: "19", resourceId: "28", cursor: null },
    resourceCollection,
    cursorCodec,
    pageFeatureLimit: 20_000,
    pageByteLimit: 45,
  });

  assert.ok(Buffer.byteLength(JSON.stringify(payload.resources)) <= 45);
  assert.ok(payload.nextCursor);
});

test("resource paging rejects one compact row that cannot fit", () => {
  assert.throws(() => buildMapResourcePartitionPayload({
    scope: { regionId: "19", resourceId: "28", cursor: null },
    resourceCollection: collection([{
      entityId: "12345678901234567890", regionId: "19", resourceId: "28",
      locationX: 1, locationZ: 2, dimension: "1",
    }]),
    cursorCodec,
    pageFeatureLimit: 20_000,
    pageByteLimit: 10,
  }), (error) => error instanceof MapResourcePageError && error.statusCode === 413);
});
