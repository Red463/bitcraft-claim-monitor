export function sameOriginRequest(req, { isProduction = false } = {}) {
  const origin = String(req.headers.origin ?? "").trim();
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = String(req.headers.host ?? "");
    if (originUrl.host === host) return true;
    return !isProduction && ["127.0.0.1", "localhost"].includes(originUrl.hostname) && /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host);
  } catch {
    return false;
  }
}

export function originFromRequest(req, { isProduction = false } = {}) {
  const proto = String(req.headers["x-forwarded-proto"] ?? (isProduction ? "https" : "http")).split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  return `${proto || "http"}://${host}`;
}

export function safeReturnPath(value) {
  const text = String(value ?? "/?page=dashboard").trim() || "/?page=dashboard";
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\")) return "/?page=dashboard";
  return text.slice(0, 500);
}