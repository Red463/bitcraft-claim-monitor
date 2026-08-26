import assert from "node:assert/strict";
import test from "node:test";

import { packResourceCoordinate } from "../src/map/resourcePartitionCodec.mjs";
import { MapResourceLiveIndex } from "../src/server/game-data/mapResourceLiveIndex.ts";

test("joins resource-first and location-first rows for only the affected selected type", () => {
  const index = new MapResourceLiveIndex("19");
  index.select("2");
  index.select("125");

  index.upsertResource({ entityId: 10n, resourceId: 2 });
  index.upsertLocation({ entityId: 10n, x: 100, z: 200, dimension: 1 });
  index.upsertLocation({ entity_id: "11", x: 300, z: 400, dimension: 1 });
  index.upsertResource({ entity_id: "11", resource_id: 125 });

  assert.deepEqual([...index.drain("2").additions], [packResourceCoordinate(100, 200)]);
  assert.deepEqual([...index.drain("125").additions], [packResourceCoordinate(300, 400)]);
  assert.deepEqual([...index.drain("2").removals], []);
});

test("filters non-overworld locations and updates a moving entity precisely", () => {
  const index = new MapResourceLiveIndex("19");
  index.select("2");
  index.upsertResource({ entityId: "10", resourceId: "2" });
  index.upsertLocation({ entityId: "10", x: 1, z: 2, dimension: 0 });
  assert.deepEqual([...index.drain("2").additions], []);

  index.upsertLocation({ entityId: "10", x: 3, z: 4, dimension: 1 });
  assert.deepEqual(index.drain("2"), {
    resourceId: "2",
    additions: Uint32Array.of(packResourceCoordinate(3, 4)),
    removals: new Uint32Array(),
  });

  index.upsertLocation({ entityId: "10", x: 5, z: 6, dimension: 1 });
  assert.deepEqual(index.drain("2"), {
    resourceId: "2",
    additions: Uint32Array.of(packResourceCoordinate(5, 6)),
    removals: Uint32Array.of(packResourceCoordinate(3, 4)),
  });
});

test("moves contributions between resource types without dirtying an unrelated type", () => {
  const index = new MapResourceLiveIndex("19");
  index.select("2");
  index.select("125");
  index.select("130");
  index.upsertLocation({ entityId: 10n, x: 7, z: 8, dimension: 1 });
  index.upsertResource({ entityId: 10n, resourceId: 2 });
  index.drain("2");

  index.upsertResource({ entityId: 10n, resourceId: 125 });
  assert.deepEqual([...index.drain("2").removals], [packResourceCoordinate(7, 8)]);
  assert.deepEqual([...index.drain("125").additions], [packResourceCoordinate(7, 8)]);
  assert.deepEqual(index.drain("130"), {
    resourceId: "130",
    additions: new Uint32Array(),
    removals: new Uint32Array(),
  });
});

test("keeps duplicate coordinates visible until their final entity is deleted", () => {
  const index = new MapResourceLiveIndex("19");
  index.select("2");
  for (const entityId of ["10", "11"]) {
    index.upsertResource({ entityId, resourceId: "2" });
    index.upsertLocation({ entityId, x: 9, z: 10, dimension: 1 });
  }
  assert.deepEqual([...index.drain("2").additions], [packResourceCoordinate(9, 10)]);

  index.deleteLocation({ entityId: "10" });
  assert.deepEqual([...index.drain("2").removals], []);
  index.deleteResource({ entityId: "11" });
  assert.deepEqual([...index.drain("2").removals], [packResourceCoordinate(9, 10)]);
});

test("selection removal clears visual state and stable reselection rebuilds from retained rows", () => {
  const index = new MapResourceLiveIndex("19");
  index.upsertResource({ entityId: "10", resourceId: "2" });
  index.upsertLocation({ entityId: "10", x: 11, z: 12, dimension: 1 });
  index.select("2");
  assert.deepEqual([...index.coordinates("2")], [packResourceCoordinate(11, 12)]);
  index.drain("2");

  index.unselect("2");
  assert.deepEqual([...index.coordinates("2")], []);
  index.select("2");
  assert.deepEqual([...index.drain("2").additions], [packResourceCoordinate(11, 12)]);
});

test("seed reports incomplete joins and returns sorted unique complete coordinates", () => {
  const index = new MapResourceLiveIndex("19");
  const seeded = index.seed(
    ["2", "125"],
    [
      { entityId: "10", resourceId: "2" },
      { entityId: "11", resourceId: "2" },
      { entityId: "12", resourceId: "125" },
    ],
    [
      { entityId: "10", x: 20, z: 30, dimension: 1 },
      { entityId: "11", x: 20, z: 30, dimension: 1 },
    ],
  );

  assert.deepEqual(seeded.get("2"), {
    complete: true,
    coordinates: Uint32Array.of(packResourceCoordinate(20, 30)),
    warnings: [],
  });
  assert.equal(seeded.get("125").complete, false);
  assert.match(seeded.get("125").warnings.join(" "), /12.*location_state/i);
});
