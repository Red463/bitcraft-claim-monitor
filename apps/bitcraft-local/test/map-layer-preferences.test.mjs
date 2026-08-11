import assert from "node:assert/strict";
import test from "node:test";

let preferences = null;
try {
  preferences = await import("../src/pages/map/mapLayerPreferences.mjs");
} catch {
  // RED: the layer-preference seam does not exist yet.
}

test("native map layer preferences are complete, versioned, and defensive", () => {
  assert.ok(preferences, "map layer preferences module must exist");
  assert.deepEqual(preferences.MAP_LAYER_DEFINITIONS.map(({ key }) => key), [
    "claims", "claim-areas", "roads", "watchtowers", "players",
    "resources", "enemies",
  ]);
  assert.equal(preferences.MAP_LAYER_PREFERENCE_KEY, "bitcraft-map-layers:v2");
  assert.equal(Object.hasOwn(preferences.defaultMapLayerVisibility(), "terrain"), false);
  assert.equal(preferences.defaultMapLayerVisibility().roads, false);
  assert.equal(preferences.MAP_LAYER_DEFINITIONS.find(({ key }) => key === "roads").available, true);
  assert.equal(preferences.MAP_LAYER_DEFINITIONS.find(({ key }) => key === "roads").dataLayer, null);
  assert.equal(preferences.MAP_LAYER_DEFINITIONS.find(({ key }) => key === "resources").selectionRequired, true);
  assert.deepEqual(preferences.parseMapLayerVisibility("not json"), preferences.defaultMapLayerVisibility());
  const parsed = preferences.parseMapLayerVisibility('{"claims":false,"roads":true,"unknown":true}');
  assert.equal(parsed.claims, false);
  assert.equal(parsed.roads, true);
  assert.equal(Object.hasOwn(parsed, "unknown"), false);
});

test("native map layer storage failures fall back without throwing", () => {
  assert.ok(preferences, "map layer preferences module must exist");
  const denied = () => { throw new DOMException("denied", "SecurityError"); };
  assert.deepEqual(preferences.loadMapLayerVisibility(denied), preferences.defaultMapLayerVisibility());
  assert.equal(preferences.saveMapLayerVisibility(denied, preferences.defaultMapLayerVisibility()), false);
});

test("native map layer persistence emits only allowlisted boolean choices", () => {
  assert.ok(preferences, "map layer preferences module must exist");
  const serialized = preferences.serializeMapLayerVisibility({
    ...preferences.defaultMapLayerVisibility(),
    claims: false,
    unknown: true,
  });
  const value = JSON.parse(serialized);
  assert.equal(Object.hasOwn(value, "terrain"), false);
  assert.equal(value.claims, false);
  assert.equal(Object.hasOwn(value, "unknown"), false);
  assert.deepEqual(Object.keys(value), preferences.MAP_LAYER_DEFINITIONS.map(({ key }) => key));
});
