import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("accepted live terrain fixture proves layout without private player data", async () => {
  const fixture = JSON.parse(await readFile(new URL("fixtures/terrain-live-layout.json", import.meta.url), "utf8"));
  assert.equal(fixture.verified, true);
  assert.equal(fixture.dimension, "1");
  assert.equal(fixture.regionId, "19");
  assert.ok(Number.isInteger(fixture.side) && fixture.side > 0);
  assert.ok(Number.isFinite(fixture.cellSize) && fixture.cellSize > 0);
  assert.ok(["z-major", "x-major"].includes(fixture.indexOrder));
  assert.ok([1, -1].includes(fixture.zDirection));
  assert.deepEqual(fixture.points.map((point) => point.category).sort(), ["coastline", "inland", "open-water"]);
  assert.ok(fixture.points.every((point) => Number.isInteger(point.x) && Number.isInteger(point.z)));
  assert.ok(!JSON.stringify(fixture).match(/playerId|username|mobile/i));
  assert.match(fixture.evidenceHash, /^[a-f0-9]{64}$/);
});
