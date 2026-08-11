import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

let tileModule = null;
try {
  tileModule = await import("../src/server/mapTiles.mjs");
} catch {
  // The RED run proves the focused same-origin tile boundary does not exist yet.
}

function responseRecorder() {
  return {
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = null) { this.body = body; },
  };
}

test("map tile route serves locally provisioned negative-Y terrain tiles", async () => {
  assert.ok(tileModule, "map tile module must exist");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bitcraft-map-tiles-"));
  const tileDir = path.join(dataDir, "map-tiles", "terrain", "-5", "0");
  await mkdir(tileDir, { recursive: true });
  const expected = Buffer.from([0x52, 0x49, 0x46, 0x46]);
  await writeFile(path.join(tileDir, "-2.webp"), expected);

  const res = responseRecorder();
  assert.equal(await tileModule.serveLocalMapTile("/api/local/map/tiles/terrain/-5/0/-2.webp", res, dataDir), true);
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "image/webp");
  assert.match(res.headers["cache-control"], /^public, max-age=/);
  assert.deepEqual(res.body, expected);
});

test("map tile route rejects unsupported styles and coordinates without filesystem traversal", async () => {
  assert.ok(tileModule, "map tile module must exist");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bitcraft-map-tiles-"));
  for (const pathname of [
    "/api/local/map/tiles/external/-5/0/-2.webp",
    "/api/local/map/tiles/terrain/-6/0/-2.webp",
    "/api/local/map/tiles/terrain/-5/0/../../secret.webp",
  ]) {
    const res = responseRecorder();
    assert.equal(await tileModule.serveLocalMapTile(pathname, res, dataDir), true);
    assert.equal(res.status, 400);
  }
});

test("map tile route returns a cacheable 404 when a local tile is not installed", async () => {
  assert.ok(tileModule, "map tile module must exist");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bitcraft-map-tiles-"));
  const res = responseRecorder();
  assert.equal(await tileModule.serveLocalMapTile("/api/local/map/tiles/game/0/4/-3.webp", res, dataDir), true);
  assert.equal(res.status, 404);
  assert.equal(res.body, null);
});

test("production server handles same-origin map tiles before map snapshot acquisition", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /import \{ serveLocalMapTile \} from "\.\/src\/server\/mapTiles\.mjs"/);
  assert.match(server, /await serveLocalMapTile\(url\.pathname, res, dataDir\)/);
  assert.ok(server.indexOf("await serveLocalMapTile(url.pathname, res, dataDir)") < server.indexOf('url.pathname === "/api/local/map/snapshot"'));
});
