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

async function terrainStatus(tileStore, now, runtimeHealth) {
  const manifest = typeof tileStore?.readManifest === "function" ? await tileStore.readManifest() : null;
  const buildStage = String(runtimeHealth?.buildStage ?? "idle");
  const lastError = String(runtimeHealth?.lastError ?? "").trim().slice(0, 500);
  if (!manifest) return {
    provider: "relay", available: false, generation: null, generatedAt: null, observedAt: null,
    freshness: "unavailable", ageMs: null, regionIds: [], dimension: "1", bounds: null,
    zoomRange: { min: MIN_ZOOM, max: MAX_ZOOM }, paletteVersion: null, tileCount: 0, totalBytes: 0,
    buildStage,
    warnings: [buildStage === "building"
      ? "Relay terrain is building its first complete tile bundle."
      : buildStage === "error" && lastError
        ? `Relay terrain is unavailable: ${lastError}`
        : "Relay terrain has not been installed yet."],
  };
  const observedTime = Date.parse(manifest.observedAt ?? manifest.generatedAt ?? "");
  const ageMs = Number.isFinite(observedTime) ? Math.max(0, now().getTime() - observedTime) : null;
  const freshness = ageMs != null && ageMs <= 5 * 60_000 ? "live" : "stale";
  return {
    provider: "relay", available: true, generation: String(manifest.generation),
    generatedAt: manifest.generatedAt ?? null, observedAt: manifest.observedAt ?? null,
    freshness, ageMs, regionIds: Array.isArray(manifest.regionIds) ? manifest.regionIds.map(String) : [],
    dimension: "1", bounds: manifest.bounds ?? null, zoomRange: manifest.zoomRange ?? { min: MIN_ZOOM, max: MAX_ZOOM },
    paletteVersion: manifest.paletteVersion ?? null, tileCount: Number(manifest.tileCount ?? 0), totalBytes: Number(manifest.totalBytes ?? 0), buildStage,
    warnings: freshness === "stale" ? ["Relay terrain is stale; showing the last-good installed generation."] : [],
  };
}

export async function serveLocalMapTile(pathname, res, tileStore, now = () => new Date(), runtimeHealth = null) {
  if (!pathname.startsWith(TILE_PREFIX)) return false;
  if (pathname === "/api/local/map/tiles/status") {
    finish(res, 200, JSON.stringify(await terrainStatus(tileStore, now, runtimeHealth)), {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    return true;
  }
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
  const tile = typeof tileStore?.readTile === "function" ? await tileStore.readTile({ style, z: zoom, x, y }) : null;
  if (tile) {
    if (tile.bytes.byteLength > 2 * 1024 * 1024) throw new RangeError("Installed map tile exceeds response budget");
    finish(res, 200, tile.bytes, {
      "content-type": tile.contentType,
      "cache-control": "public, max-age=86400, immutable",
    });
  } else {
    finish(res, 404, null, { "cache-control": "public, max-age=60" });
  }
  return true;
}
