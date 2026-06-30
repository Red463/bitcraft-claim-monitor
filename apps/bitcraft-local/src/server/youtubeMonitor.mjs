const CHANNEL_ID_RE = /UC[A-Za-z0-9_-]{10,}/;
const XML_ENTITY_MAP = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(value = "") {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : `&${entity};`;
    }
    return XML_ENTITY_MAP[entity] ?? `&${entity};`;
  }).trim();
}

function textBetween(source, tag) {
  const match = String(source ?? "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function attrValue(source, attr) {
  const match = String(source ?? "").match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function isoDate(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

export function extractYouTubeChannelId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const decoded = raw.includes("%") ? safeDecode(raw) : raw;
  const feedMatch = decoded.match(/[?&]channel_id=(UC[A-Za-z0-9_-]{10,})/i);
  if (feedMatch) return feedMatch[1];
  const channelUrlMatch = decoded.match(/\/channel\/(UC[A-Za-z0-9_-]{10,})/i);
  if (channelUrlMatch) return channelUrlMatch[1];
  const canonicalMatch = decoded.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{10,})/i);
  if (canonicalMatch) return canonicalMatch[1];
  return decoded.match(CHANNEL_ID_RE)?.[0] ?? "";
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeYouTubeChannelInput(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("@")) return `https://www.youtube.com/${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  const channelId = extractYouTubeChannelId(raw);
  if (channelId) return channelId;
  return raw;
}

export async function resolveYouTubeChannelInput(input, fetchImpl = fetch) {
  const normalized = normalizeYouTubeChannelInput(input);
  const directChannelId = extractYouTubeChannelId(normalized);
  if (directChannelId) return { channelId: directChannelId, sourceUrl: normalized };
  if (!/^https?:\/\/([^/]+\.)?youtube\.com\/@[^/]+/i.test(normalized)) throw new Error("Enter a YouTube channel ID, /channel/ URL, feed URL, or @handle URL");
  const response = await fetchImpl(normalized, { headers: { "user-agent": "BitCraft Claim Monitor YouTube monitor" } });
  if (!response?.ok) throw new Error(`YouTube channel lookup failed: HTTP ${response?.status ?? "unknown"}`);
  const html = await response.text();
  const channelId = extractYouTubeChannelId(html);
  if (!channelId) throw new Error("Could not find a YouTube channel ID on that page");
  return { channelId, sourceUrl: normalized };
}

export function youtubeFeedUrl(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

export function parseYouTubeFeed(xml) {
  const source = String(xml ?? "");
  const channelTitle = textBetween(source, "title");
  const videos = [];
  for (const match of source.matchAll(/<entry[\s\S]*?<\/entry>/gi)) {
    const entry = match[0];
    const videoId = textBetween(entry, "yt:videoId") || textBetween(entry, "videoId");
    if (!videoId) continue;
    const linkTag = entry.match(/<link\b[^>]*>/i)?.[0] ?? "";
    const thumbnailTag = entry.match(/<media:thumbnail\b[^>]*>/i)?.[0] ?? "";
    videos.push({
      videoId,
      title: textBetween(entry, "title") || videoId,
      url: attrValue(linkTag, "href") || `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      publishedAt: isoDate(textBetween(entry, "published")),
      thumbnailUrl: attrValue(thumbnailTag, "url"),
    });
  }
  videos.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
  return { channelTitle, videos };
}

export function youtubeVideosToNotify({ videos = [], seenVideoIds = new Set(), seedOnly = false, limit = 3 } = {}) {
  if (seedOnly) return [];
  return videos
    .filter((video) => video?.videoId && !seenVideoIds.has(video.videoId))
    .sort((a, b) => new Date(a.publishedAt || 0).getTime() - new Date(b.publishedAt || 0).getTime())
    .slice(0, Math.max(0, limit));
}
