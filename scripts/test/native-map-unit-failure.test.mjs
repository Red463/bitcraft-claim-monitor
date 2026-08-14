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
