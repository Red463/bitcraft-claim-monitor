import assert from "node:assert/strict";
import test from "node:test";

test("classifies road generator failures without returning raw journal text", async () => {
  let classifyNativeMapUnitFailure;
  try {
    ({ classifyNativeMapUnitFailure } = await import("../../deploy/native-map-unit-failure.mjs"));
  } catch {
    assert.fail("native map unit failure classifier is unavailable");
  }

  const cases = [
    ["Road world generation failed for region 7: Relay road region 7 returned no verified paving points", "empty-region"],
    ["Road paving entity 123456789 is missing location data", "join-mismatch"],
    ["Timed out waiting for roads from bitcraft-live-7", "timeout"],
    ["regional schema fingerprint mismatch", "schema"],
    ["Road paving entity 123 has impossible coordinates", "invalid-coordinate"],
    ["FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory", "out-of-memory"],
    ["subscription query rejected while joining paved_tile_state", "subscription"],
    ["WebSocket connection failed before onConnect", "connection"],
    ["ERR_MODULE_NOT_FOUND while importing regional bindings", "module"],
    ["EACCES: permission denied opening the tile directory", "filesystem"],
    ["ENOSPC: no space left on device", "disk"],
    ["PNG canvas render failed", "render"],
    ["flock failed: Resource temporarily unavailable", "busy"],
    ["TypeError: cannot read properties of undefined", "implementation"],
    ["ROAD_STAGE=relay-connect", "connection"],
    ["ROAD_STAGE=relay-subscription", "subscription"],
    ["ROAD_STAGE=coordinate-projection", "invalid-coordinate"],
    ["ROAD_STAGE=tile-render", "render"],
    ["some unrecognized internal failure carrying entity 998877", "other"],
    ["", "unavailable"],
  ];

  for (const [journal, expected] of cases) {
    const result = classifyNativeMapUnitFailure(journal);
    assert.deepEqual(result, { category: expected });
    assert.equal(JSON.stringify(result).includes("998877"), false);
    assert.equal(JSON.stringify(result).includes("bitcraft-live-7"), false);
  }
});

test("reports the exact allow-listed filesystem stage without journal details", async () => {
  const { classifyNativeMapUnitFailure } = await import("../../deploy/native-map-unit-failure.mjs");
  const cases = [
    ["ROAD_STAGE=batch-install\nprivate provider detail 111", "batch-install"],
    ["ROAD_STAGE=pack-compose\nprivate provider detail 222", "pack-compose"],
    ["ROAD_STAGE=pack-install\nprivate provider detail 333", "pack-install"],
    ["ROAD_STAGE=pack-prune\nprivate provider detail 444", "pack-prune"],
  ];

  for (const [journal, stage] of cases) {
    const result = classifyNativeMapUnitFailure(journal);
    assert.deepEqual(result, { category: "filesystem", stage });
    assert.equal(JSON.stringify(result).includes("private provider detail"), false);
  }
});
