import assert from "node:assert/strict";
import test from "node:test";

import { boundedNativeMapRegions, nativeMapRequest } from "../src/pages/map/nativeMapRequest.mjs";

test("native map requests are same-origin, canonical, and omit empty bounded layers", () => {
  const request = nativeMapRequest({
    regionIds: ["24", "19", "19"],
    playerIds: ["216172782115643288"],
    resourceIds: [],
    enemyTypes: ["8", "1"],
  });
  assert.equal(request.snapshotUrl, "/api/local/map/snapshot?regions=19%2C24&layers=claim-areas%2Cclaims%2Cenemies%2Cplayers%2Cwatchtowers&playerIds=216172782115643288&enemyTypes=1%2C8");
  assert.equal(request.eventsUrl, request.snapshotUrl.replace("/snapshot?", "/events?"));
  assert.equal(request.layers.includes("resources"), false);
  assert.equal(request.layers.includes("banks"), false);
  assert.equal(request.layers.includes("markets"), false);
  assert.equal(request.layers.includes("waystones"), false);
  assert.equal(request.layers.includes("empire-settlements"), false);
  assert.equal(request.layers.includes("roads"), false);
});

test("native map request keeps resource and enemy namespaces separate", () => {
  const request = nativeMapRequest({ regionIds: ["24", "19"], playerIds: [], resourceIds: ["456", "123"], enemyTypes: ["123"] });
  assert.equal(new URL(request.snapshotUrl, "http://local").searchParams.has("resourceIds"), false);
  assert.equal(new URL(request.snapshotUrl, "http://local").searchParams.get("layers").includes("resources"), false);
  assert.equal(new URL(request.resourceUrl, "http://local").searchParams.get("regions"), "19,24");
  assert.equal(new URL(request.resourceUrl, "http://local").searchParams.get("resourceIds"), "123,456");
  assert.equal(new URL(request.resourceUrl, "http://local").searchParams.get("layers"), "resources");
  assert.equal(new URL(request.eventsUrl, "http://local").searchParams.get("resourceIds"), "123,456");
  assert.equal(new URL(request.snapshotUrl, "http://local").searchParams.get("enemyTypes"), "123");
});

test("native map regions discard stale persisted ids and respect the API region budget", () => {
  assert.deepEqual(boundedNativeMapRegions(["99", "19"], ["19", "24"]), ["19"]);
  assert.deepEqual(boundedNativeMapRegions([], ["1", "2", "3", "4", "5"]), ["1", "2", "3", "4"]);
});
