import assert from "node:assert/strict";
import test from "node:test";

import {
  bitcraftMapUrl,
  mapResourceCategory,
  mapResourceToken,
  normalizeMapResourceToken,
  parseBitcraftMapUrl,
} from "../src/pages/map/mapUtils.ts";

test("bitcraftMapUrl sorts query ids and preserves waypoint data", () => {
  const url = bitcraftMapUrl(
    ["player-b", "", "player-a"],
    { name: "Timbersteel", locationX: 123, locationZ: -456 },
    true,
    ["30", "2"],
    ["19", "3"],
    ["8", "1"],
  );
  const parsed = parseBitcraftMapUrl(url);

  assert.equal(url.startsWith("https://bitcraftmap.com/?"), true);
  assert.equal(parsed.playerId, "player-a,player-b");
  assert.equal(parsed.resourceId, "2,30");
  assert.equal(parsed.regionId, "3,19");
  assert.equal(parsed.enemyId, "1,8");
  assert.equal(parsed.hasWaypoint, true);
});

test("map resource helpers handle resource and enemy catalog rows", () => {
  assert.equal(mapResourceToken({ id: 30, mapId: "30", mapKind: "resource" }), "resource:30");
  assert.equal(mapResourceToken({ id: "enemy:8", enemyType: 8, mapKind: "enemy" }), "enemy:8");
  assert.equal(normalizeMapResourceToken("30"), "resource:30");
  assert.equal(normalizeMapResourceToken("enemy:8"), "enemy:8");
  assert.equal(normalizeMapResourceToken(""), "");
  assert.equal(mapResourceCategory({ tag: "Ore", category: "Stone" }), "Ore");
  assert.equal(mapResourceCategory({ resourceType: "Tree" }), "Tree");
});
