import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  decodeResourcePartition,
  encodeResourcePartition,
  mergePackedCoordinateDelta,
  normalizePackedCoordinates,
  packResourceCoordinate,
  unpackResourceCoordinate,
} from "../src/map/resourcePartitionCodec.mjs";

test("compiled server modules resolve the shared codec through a package alias", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const liveIndex = readFileSync(new URL("../src/server/game-data/mapResourceLiveIndex.ts", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../src/server/game-data/mapResourceRuntime.ts", import.meta.url), "utf8");
  assert.equal(packageJson.imports?.["#map/*"], "./src/map/*");
  assert.match(liveIndex, /from "#map\/resourcePartitionCodec\.mjs"/);
  assert.match(runtime, /from "#map\/resourcePartitionCodec\.mjs"/);
});

test("packs and unpacks unsigned world coordinates at both bounds", () => {
  assert.equal(packResourceCoordinate(0, 0), 0);
  assert.equal(packResourceCoordinate(38_400, 38_400), 2_516_620_800);
  assert.deepEqual(unpackResourceCoordinate(2_516_620_800), { x: 38_400, z: 38_400 });
  assert.throws(() => packResourceCoordinate(-1, 0), /coordinate/i);
  assert.throws(() => packResourceCoordinate(0, 38_401), /coordinate/i);
});

test("normalizes packed coordinates into sorted unique unsigned values", () => {
  const high = packResourceCoordinate(38_400, 38_400);
  const low = packResourceCoordinate(1, 2);
  assert.deepEqual(normalizePackedCoordinates([high, low, high]), Uint32Array.of(low, high));
  assert.throws(() => normalizePackedCoordinates([0xffff_ffff]), /coordinate/i);
});

test("merges additions and removals without duplicating coordinates", () => {
  const a = packResourceCoordinate(1, 1);
  const b = packResourceCoordinate(2, 2);
  const c = packResourceCoordinate(3, 3);
  const d = packResourceCoordinate(4, 4);
  assert.deepEqual(
    mergePackedCoordinateDelta(Uint32Array.of(a, b, d), Uint32Array.of(c, d), Uint32Array.of(a)),
    Uint32Array.of(b, c, d),
  );
});

test("encodes the exact V1 header and preserves lossless identities", () => {
  const coordinates = Uint32Array.of(packResourceCoordinate(12, 34));
  const encoded = encodeResourcePartition({
    regionId: "18446744073709551615",
    resourceId: "125",
    dimension: "1",
    generation: "18446744073709551614",
    coordinates,
  });
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);

  assert.deepEqual([...encoded.subarray(0, 4)], [0x42, 0x43, 0x52, 0x50]);
  assert.equal(view.getUint16(4, true), 1);
  assert.equal(view.getUint16(6, true), 0);
  assert.equal(view.getBigUint64(8, true), 18_446_744_073_709_551_615n);
  assert.equal(view.getBigUint64(16, true), 18_446_744_073_709_551_614n);
  assert.equal(view.getUint32(24, true), 125);
  assert.equal(view.getUint32(28, true), 1);
  assert.equal(view.getUint32(32, true), 1);
  assert.equal(view.getUint32(36, true), 0);
  assert.equal(view.getUint32(40, true), 0);
  assert.equal(encoded.byteLength, 48);

  const decoded = decodeResourcePartition(encoded, {
    regionId: "18446744073709551615",
    resourceId: "125",
    generation: "18446744073709551614",
  });
  assert.equal(decoded.regionId, "18446744073709551615");
  assert.equal(decoded.resourceId, "125");
  assert.equal(decoded.dimension, "1");
  assert.equal(decoded.generation, "18446744073709551614");
  assert.equal(decoded.pointCount, 1);
  assert.deepEqual(decoded.coordinates, coordinates);
});

test("round trips 400,000 coordinates without embedding entity identities", () => {
  const coordinates = Uint32Array.from(
    { length: 400_000 },
    (_, index) => packResourceCoordinate(index % 38_401, Math.floor(index / 38_401)),
  );
  const encoded = encodeResourcePartition({
    regionId: "18446744073709551615",
    resourceId: "125",
    dimension: "1",
    generation: "18446744073709551614",
    coordinates,
  });
  const decoded = decodeResourcePartition(encoded, {
    regionId: "18446744073709551615",
    resourceId: "125",
    generation: "18446744073709551614",
  });

  assert.equal(decoded.pointCount, 400_000);
  assert.equal(encoded.byteLength, 44 + (400_000 * 4));
  assert.deepEqual(decoded.coordinates, normalizePackedCoordinates(coordinates));
  assert.equal(new TextDecoder().decode(encoded).includes("184467"), false);
});

test("rejects malformed, ambiguous, and mismatched partitions", () => {
  const coordinate = packResourceCoordinate(4, 5);
  const valid = encodeResourcePartition({
    regionId: "19",
    resourceId: "28",
    dimension: "1",
    generation: "7",
    coordinates: Uint32Array.of(coordinate),
  });

  const badMagic = valid.slice();
  badMagic[0] = 0;
  assert.throws(() => decodeResourcePartition(badMagic), /magic/i);

  const badFlags = valid.slice();
  new DataView(badFlags.buffer).setUint16(6, 1, true);
  assert.throws(() => decodeResourcePartition(badFlags), /flags/i);

  const badReserved = valid.slice();
  new DataView(badReserved.buffer).setUint32(36, 1, true);
  assert.throws(() => decodeResourcePartition(badReserved), /reserved/i);

  assert.throws(() => decodeResourcePartition(valid.subarray(0, valid.length - 1)), /length/i);
  assert.throws(() => decodeResourcePartition(valid, { regionId: "20" }), /region/i);
  assert.throws(() => encodeResourcePartition({
    regionId: "19",
    resourceId: "28",
    dimension: "2",
    generation: "7",
    coordinates: Uint32Array.of(coordinate),
  }), /dimension/i);
  assert.throws(() => encodeResourcePartition({
    regionId: "19",
    resourceId: "28",
    dimension: "1",
    generation: "7",
    coordinates: Uint32Array.of(coordinate, coordinate),
  }), /sorted unique/i);
  assert.throws(() => encodeResourcePartition({
    regionId: "19",
    resourceId: "28",
    dimension: "1",
    generation: "7",
    coordinates: Uint32Array.of(packResourceCoordinate(2, 2), packResourceCoordinate(1, 1)),
  }), /sorted unique/i);
});
