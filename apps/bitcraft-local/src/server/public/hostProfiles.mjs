const TIMBERSTEEL_PROFILE = Object.freeze({
  id: "timbersteel",
  origin: "https://app.timbersteeltrade.com",
  allowsAdmin: true,
  allowsDiscord: true,
});

const PUBLIC_PROFILE = Object.freeze({
  id: "public",
  origin: "https://claim-monitor.com",
  allowsAdmin: false,
  allowsDiscord: false,
});

function hostname(value) {
  const authority = String(Array.isArray(value) ? value[0] ?? "" : value ?? "").split(",")[0].trim();
  if (!authority || /[\s\\/@]/.test(authority)) return null;
  try {
    return new URL(`http://${authority}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLoopbackAddress(address) {
  const value = String(address ?? "").trim().toLowerCase();
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

export function resolveHostProfile(request, {
  isProduction = false,
  allowDevelopmentHosts = !isProduction,
  allowDirectLoopbackHealthHost = false,
} = {}) {
  const directHost = hostname(request?.host);
  const hasForwardedHost = request?.forwardedHost !== undefined;
  const forwardedHost = isLoopbackAddress(request?.remoteAddress) ? hostname(request?.forwardedHost) : null;
  const resolvedHost = forwardedHost ?? directHost;

  if (resolvedHost === "app.timbersteeltrade.com") return TIMBERSTEEL_PROFILE;
  if (resolvedHost === "claim-monitor.com") return PUBLIC_PROFILE;
  if (
    allowDirectLoopbackHealthHost
    && !hasForwardedHost
    && isLoopbackAddress(request?.remoteAddress)
    && (directHost === "localhost" || directHost === "127.0.0.1")
  ) return TIMBERSTEEL_PROFILE;
  if (!allowDevelopmentHosts) return null;
  if (resolvedHost === "localhost" || resolvedHost === "127.0.0.1") return TIMBERSTEEL_PROFILE;
  if (resolvedHost === "public.localhost") return PUBLIC_PROFILE;
  return null;
}

export function resolveRequestHostProfile(req, options) {
  return resolveHostProfile({
    host: req?.headers?.host,
    forwardedHost: req?.headers?.["x-forwarded-host"],
    remoteAddress: req?.socket?.remoteAddress,
  }, options);
}
