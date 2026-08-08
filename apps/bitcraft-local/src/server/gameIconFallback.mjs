import { sendBinary, sendJson } from "./httpResponses.mjs";

const ROUTE_PREFIX = "/api/local/game-icon/";
const DEFAULT_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const MAX_BYTES = 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;
const MAX_CACHE_ENTRIES = 2_000;

function validTarget(itemType, itemId) {
  return (itemType === "item" || itemType === "cargo") && /^\d+$/.test(itemId);
}

function metadataIconValue(payload, itemType) {
  const row = payload?.[itemType]
    ?? payload?.data?.[itemType]
    ?? payload;
  return String(
    row?.iconAssetName
      ?? row?.icon_asset_name
      ?? row?.iconAddress
      ?? row?.icon_address
      ?? row?.iconUrl
      ?? row?.icon_url
      ?? "",
  ).trim();
}

function boundedPositiveNumber(value, fallback, maximum) {
  const numeric = Number(value);
  if (numeric === Number.POSITIVE_INFINITY) return maximum;
  return Number.isFinite(numeric) && numeric > 0
    ? Math.min(Math.floor(numeric), maximum)
    : fallback;
}

function approvedUrl(value, baseOrigin, approvedHosts, { appendWebp = false } = {}) {
  if (!value || value === "\uFFEE" || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const normalized = value.replaceAll("\\", "/");
  const relativePath = normalized.startsWith("Items/")
    ? `GeneratedIcons/${normalized}`
    : normalized;
  let url;
  try {
    url = new URL(relativePath, `${baseOrigin}/`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !approvedHosts.has(url.hostname.toLowerCase())) return null;
  const filename = url.pathname.split("/").at(-1) ?? "";
  if (appendWebp && !/\.[a-z0-9]{2,5}$/i.test(filename)) url.pathname = `${url.pathname}.webp`;
  return url;
}

async function readBounded(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export function createGameIconFallbackService(options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const metadataOrigin = String(options.metadataOrigin ?? "https://bitjita.com").replace(/\/+$/, "");
  const approvedHosts = new Set((options.approvedHosts ?? ["bitjita.com", "cdn.bitjita.com"])
    .map((host) => String(host).trim().toLowerCase())
    .filter(Boolean));
  const timeoutMs = boundedPositiveNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxBytes = boundedPositiveNumber(options.maxBytes, DEFAULT_MAX_BYTES, MAX_BYTES);
  const cacheTtlMs = boundedPositiveNumber(options.cacheTtlMs, DEFAULT_CACHE_TTL_MS, MAX_CACHE_TTL_MS);
  const cacheMaxEntries = boundedPositiveNumber(options.cacheMaxEntries, DEFAULT_CACHE_MAX_ENTRIES, MAX_CACHE_ENTRIES);
  const timeoutSignal = options.timeoutSignal ?? AbortSignal.timeout;
  const now = options.now ?? Date.now;
  const cache = options.cache ?? new Map();
  const inflight = options.inflight ?? new Map();
  const appIdentifier = String(options.appIdentifier ?? "BitCraft Claim Monitor Relay");
  const metadataBase = approvedUrl("/", metadataOrigin, approvedHosts);

  function pruneCache(pruneAt = now()) {
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= pruneAt) cache.delete(key);
    }
    while (cache.size > cacheMaxEntries) cache.delete(cache.keys().next().value);
  }

  function cacheResult(key, value) {
    cache.delete(key);
    cache.set(key, {
      value,
      expiresAt: now() + (value ? cacheTtlMs : Math.min(cacheTtlMs, 5 * 60 * 1000)),
    });
    pruneCache();
  }

  async function request(url, accept) {
    return fetcher(url, {
      headers: { accept, "x-app-identifier": appIdentifier },
      redirect: "error",
      signal: timeoutSignal(timeoutMs),
    });
  }

  async function fetchIconUncached(itemType, itemId) {
    try {
      const metadataKind = itemType === "item" ? "items" : "cargo";
      const metadataUrl = new URL(`/api/${metadataKind}/${itemId}`, metadataBase);
      const metadataResponse = await request(metadataUrl, "application/json");
      if (!metadataResponse.ok) return null;
      const metadataBody = await readBounded(metadataResponse, maxBytes);
      if (!metadataBody) return null;
      const metadata = JSON.parse(metadataBody.toString("utf8"));
      const iconUrl = approvedUrl(metadataIconValue(metadata, itemType), metadataBase.origin, approvedHosts, { appendWebp: true });
      if (!iconUrl) return null;

      const imageResponse = await request(iconUrl, "image/*");
      if (!imageResponse.ok) return null;
      const contentType = String(imageResponse.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      if (!contentType.startsWith("image/")) return null;
      const body = await readBounded(imageResponse, maxBytes);
      if (!body) return null;
      return { body, contentType, cacheControl: DEFAULT_CACHE_CONTROL };
    } catch {
      return null;
    }
  }

  async function fetchIcon(itemType, itemId) {
    if (!validTarget(itemType, itemId) || !metadataBase) return null;
    const key = `${itemType}:${itemId}`;
    pruneCache();
    const cached = cache.get(key);
    if (cached) return cached.value;
    const pending = inflight.get(key);
    if (pending) return pending;
    const requestPromise = fetchIconUncached(itemType, itemId);
    inflight.set(key, requestPromise);
    try {
      const result = await requestPromise;
      cacheResult(key, result);
      return result;
    } finally {
      inflight.delete(key);
    }
  }

  return { cacheSize: () => cache.size, fetchIcon };
}

export async function serveGameIconRequest(pathname, res, service) {
  if (!String(pathname).startsWith(ROUTE_PREFIX)) return false;
  const segments = String(pathname).slice(ROUTE_PREFIX.length).split("/");
  const [itemType = "", itemId = ""] = segments;
  if (segments.length !== 2 || !validTarget(itemType, itemId)) {
    sendJson(res, 400, { error: "Game icon itemType must be item or cargo and itemId must be decimal." });
    return true;
  }
  const image = await service.fetchIcon(itemType, itemId);
  if (!image) {
    sendJson(res, 404, { error: "Game icon is unavailable." }, { "cache-control": "public, max-age=300" });
    return true;
  }
  sendBinary(res, 200, image.body, image.contentType, { "cache-control": image.cacheControl });
  return true;
}
