import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMapRendererMode } from "../src/server/appSettingsPolicy.mjs";
import { defaultAppSettingRows } from "../src/server/defaultAppSettings.mjs";

test("map renderer mode accepts staged rollout values and defaults safely", () => {
  assert.equal(normalizeMapRendererMode("external"), "external");
  assert.equal(normalizeMapRendererMode("native-beta"), "native-beta");
  assert.equal(normalizeMapRendererMode("native"), "native");
  assert.equal(normalizeMapRendererMode("unknown"), "external");
  assert.equal(normalizeMapRendererMode(null), "external");
});

test("fresh installations retain the external renderer until beta is enabled", () => {
  const rows = defaultAppSettingRows({ serverRefreshSeconds: 30, updatedAt: "2026-08-11T12:00:00.000Z" });
  assert.equal(rows.find((row) => row.key === "map_renderer_mode")?.value, "external");
});
