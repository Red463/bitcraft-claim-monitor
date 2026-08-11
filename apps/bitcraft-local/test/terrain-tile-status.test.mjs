import assert from "node:assert/strict";
import test from "node:test";

let statusModule = null;
try {
  statusModule = await import("../src/pages/map/terrainTileStatus.mjs");
} catch {
  // RED: terrain status client does not exist yet.
}

test("terrain tile client uses same-origin status and generation-busted tile URLs", async () => {
  assert.ok(statusModule, "terrain tile status module must exist");
  const originalFetch = globalThis.fetch;
  let requested = null;
  globalThis.fetch = async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ provider: "relay", available: true, generation: "42", freshness: "live", warnings: [] }) };
  };
  try {
    const controller = new AbortController();
    const status = await statusModule.loadTerrainTileStatus(controller.signal);
    assert.equal(status.generation, "42");
    assert.equal(requested.url, "/api/local/map/tiles/status");
    assert.equal(requested.options.credentials, "same-origin");
    assert.equal(requested.options.signal, controller.signal);
    assert.equal(statusModule.terrainTileUrl("42"), "/api/local/map/tiles/terrain/{z}/{x}/{y}.webp?generation=42");
    assert.doesNotMatch(statusModule.terrainTileUrl("42"), /https?:|prism|bitcraftmap/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("terrain tile client rejects malformed status", async () => {
  assert.ok(statusModule, "terrain tile status module must exist");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ provider: "external", available: true, generation: 42 }) });
  try {
    await assert.rejects(statusModule.loadTerrainTileStatus(), /invalid/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
