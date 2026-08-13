import assert from "node:assert/strict";
import test from "node:test";

import { groupRoadPointsForZoom, renderRoadTile } from "../src/server/roadTileRenderer.mjs";

test("road points use the native X/Z projection including negative tile Y", async () => {
  const groups = groupRoadPointsForZoom([{ x: 256, z: 256 }], { zoom: 0, tileSize: 256 });
  assert.equal(groups.size, 1);
  const [[key, points]] = groups;
  assert.match(key, /^1:-1$/);
  const bytes = await renderRoadTile({ points, tileSize: 256, zoom: 0 });
  assert.ok(bytes.byteLength > 0);
});
