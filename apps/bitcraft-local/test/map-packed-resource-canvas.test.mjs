import assert from "node:assert/strict";
import test from "node:test";

import { packResourceCoordinate } from "../src/map/resourcePartitionCodec.mjs";
import {
  packedResourceBounds,
  packedResourcePointCount,
  packedResourceSamples,
  packedResourceSome,
  planPackedResourceDraw,
} from "../src/pages/map/packedResourceCanvasPlan.mjs";

function partition(regionId, resourceId, committed, provisional = []) {
  return {
    key: `${regionId}|resource:${resourceId}`,
    regionId,
    resourceId,
    generation: committed.length ? "7" : null,
    committed: Uint32Array.from(committed),
    provisional: Uint32Array.from(provisional),
  };
}

test("plans packed resources without materialising feature rows", () => {
  const partitions = new Map([
    ["19|resource:2", partition("19", "2", [packResourceCoordinate(10, 20), packResourceCoordinate(30, 40)])],
    ["24|resource:3", partition("24", "3", [], [packResourceCoordinate(50, 60)])],
  ]);

  assert.equal(packedResourcePointCount(partitions, ["19"]), 2);
  assert.equal(packedResourcePointCount(partitions, []), 3);
  assert.deepEqual(packedResourceBounds(partitions, ["19"]), { minX: 10, minZ: 20, maxX: 30, maxZ: 40 });
  assert.deepEqual(packedResourceSamples(partitions, [], 2), [
    { key: "19|resource:2", regionId: "19", resourceId: "2", x: 10, z: 20 },
    { key: "19|resource:2", regionId: "19", resourceId: "2", x: 30, z: 40 },
  ]);
  assert.equal(packedResourceSome(partitions, ["19"], ({ x, z }) => x === 30 && z === 40), true);
  assert.equal(packedResourceSome(partitions, ["19"], ({ x }) => x === 50), false);
});

test("uses a stable global stride for dense packed partitions", () => {
  const coordinates = Uint32Array.from({ length: 10 }, (_, index) => packResourceCoordinate(index, index));
  const selected = partition("19", "2", coordinates);
  const partitions = new Map([["19|resource:2", selected]]);
  const plan = planPackedResourceDraw(partitions, ["19"], 4);
  assert.equal(plan.pointCount, 10);
  assert.equal(plan.stride, 3);
  assert.equal(plan.partitions[0].coordinates, selected.committed);
});
