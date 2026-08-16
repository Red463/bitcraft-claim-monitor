import assert from "node:assert/strict";
import test from "node:test";

import {
  MAP_WORLD_BOUNDS,
  MAP_OVERWORLD_DIMENSION,
  displayHexPoint,
  gridTileOrigin,
  leafletPoint,
  mapPointFromMobile,
  normalizeStaticMapPoint,
} from "../src/pages/map/mapCoordinates.mjs";

test("map coordinate transforms keep x/z semantics explicit", () => {
  assert.equal(MAP_OVERWORLD_DIMENSION, "1");
  assert.deepEqual(normalizeStaticMapPoint({ x: 123, z: -456, dimension: 1 }), {
    x: 123,
    z: -456,
    dimension: "1",
    coordinateSpace: "map-xz",
  });
  assert.deepEqual(leafletPoint({ x: 123, z: -456 }), [-456, 123]);
  assert.deepEqual(displayHexPoint({ x: 123, z: -456 }), { north: -152, east: 41 });
});

test("coordinate grid labels use map coordinates instead of Leaflet tile indexes", () => {
  const origin = gridTileOrigin({ x: 96, y: -134, z: 1 }, 256);
  assert.deepEqual(origin, { north: 19805, east: 12288 });
});

test("mobile positions convert from fixed thousandths before rendering", () => {
  assert.deepEqual(mapPointFromMobile({ x: 12_345, z: -67_890, dimension: 1 }), {
    x: 12.345,
    z: -67.89,
    dimension: "1",
    coordinateSpace: "map-xz",
    sourceCoordinateSpace: "mobile-fixed-1000",
  });
});

test("coordinate validation rejects non-finite values and preserves world bounds", () => {
  assert.throws(() => normalizeStaticMapPoint({ x: Number.NaN, z: 1, dimension: 0 }), /finite/);
  assert.deepEqual(MAP_WORLD_BOUNDS, { minX: 0, minZ: 0, maxX: 38_400, maxZ: 38_400 });
});
