import { readFile } from "node:fs/promises";
import path from "node:path";

import { securityHeaders } from "./httpRoutes.mjs";

const TILE_PREFIX = "/api/local/map/tiles/";
const TILE_PATH = /^\/api\/local\/map\/tiles\/(terrain|game|roads)\/(-?\d+)\/(-?\d+)\/(-?\d+)\.webp$/;
const MIN_ZOOM = -5;
const MAX_ZOOM = 0;
const MAX_TILE_INDEX = 1_000_000;

function finish(res, status, body = null, headers = {}) {
  res.writeHead(status, securityHeaders(headers));
  res.end(body);
}

export async function serveLocalMapTile(pathname, res, dataDir) {
  if (!pathname.startsWith(TILE_PREFIX)) return false;
  const match = TILE_PATH.exec(pathname);
  if (!match) {
    finish(res, 400, null, { "cache-control": "no-store" });
    return true;
  }
  const [, style, rawZoom, rawX, rawY] = match;
  const zoom = Number(rawZoom);
  const x = Number(rawX);
  const y = Number(rawY);
  if (zoom < MIN_ZOOM || zoom > MAX_ZOOM || Math.abs(x) > MAX_TILE_INDEX || Math.abs(y) > MAX_TILE_INDEX) {
    finish(res, 400, null, { "cache-control": "no-store" });
    return true;
  }
  const tilePath = path.join(dataDir, "map-tiles", style, rawZoom, rawX, `${rawY}.webp`);
  try {
    const bytes = await readFile(tilePath);
    finish(res, 200, bytes, {
      "content-type": "image/webp",
      "cache-control": "public, max-age=86400, immutable",
    });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    finish(res, 404, null, { "cache-control": "public, max-age=60" });
  }
  return true;
}
