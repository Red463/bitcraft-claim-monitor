import { sendBinary, sendJson } from "./httpResponses.mjs";

const ROUTE_PREFIX = "/api/local/game-icon/";
const DEFAULT_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

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

function approvedUrl(value, baseOrigin, approvedHosts) {
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
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? 5_000));
  const maxBytes = Math.max(1, Number(options.maxBytes ?? 512 * 1024));
  const appIdentifier = String(options.appIdentifier ?? "BitCraft Claim Monitor Relay");
  const metadataBase = approvedUrl("/", metadataOrigin, approvedHosts);

  async function request(url, accept) {
    return fetcher(url, {
      headers: { accept, "x-app-identifier": appIdentifier },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async function fetchIcon(itemType, itemId) {
    if (!validTarget(itemType, itemId) || !metadataBase) return null;
    try {
      const metadataKind = itemType === "item" ? "items" : "cargo";
      const metadataUrl = new URL(`/api/${metadataKind}/${itemId}`, metadataBase);
      const metadataResponse = await request(metadataUrl, "application/json");
      if (!metadataResponse.ok) return null;
      const metadata = await metadataResponse.json();
      const iconUrl = approvedUrl(metadataIconValue(metadata, itemType), metadataBase.origin, approvedHosts);
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

  return { fetchIcon };
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
