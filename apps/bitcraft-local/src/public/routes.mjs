const NOT_FOUND = Object.freeze({ id: "not-found", params: {} });

function route(id, params = {}) {
  return { id, params };
}

function pathSegments(pathname) {
  try {
    return new URL(String(pathname ?? "/"), "https://claim-monitor.com").pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

function isCanonicalClaimId(value) {
  return /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n;
}

export function publicSettlementPath(hint) {
  const claimId = String(hint?.claimId ?? "");
  return isCanonicalClaimId(claimId) ? `/settlements/${claimId}` : null;
}

export function resolvePublicRoute(pathname) {
  const segments = pathSegments(pathname);
  if (!segments) return NOT_FOUND;
  if (segments.length === 0) return route("overview");
  if (segments.some((segment) => segment.includes("/"))) return NOT_FOUND;
  if (segments.length >= 2 && segments[0] === "settlements" && isCanonicalClaimId(segments[1])) {
    if (segments.length === 2) return route("settlement", { claimId: segments[1] });
    if (segments.length === 3 && ["members", "inventory", "crafts"].includes(segments[2])) {
      return route(segments[2], { claimId: segments[1] });
    }
    return NOT_FOUND;
  }
  if (segments.length === 1 && segments[0] === "calculator") return route("calculator");
  if (segments.length === 1 && ["account", "settings", "help", "terms", "privacy"].includes(segments[0])) return route(segments[0]);
  if (segments.length === 1 && segments[0] === "plans") return route("plans");
  if (segments.length === 2 && segments[0] === "plans" && segments[1] === "new") return route("plan-new");
  if (segments.length === 2 && segments[0] === "plans" && segments[1]) return route("plan", { id: segments[1] });
  if (segments.length === 2 && segments[0] === "shared-plans" && segments[1]) return route("shared-plan", { id: segments[1] });
  if (segments.length === 2 && segments[0] === "invites" && segments[1]) return route("invite", { id: segments[1] });
  return NOT_FOUND;
}

export function publicStorageKey(suffix) {
  const value = String(suffix ?? "").trim();
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(value) || value.startsWith("timbersteel.")) {
    throw new Error("Public preference suffix must be a public key segment");
  }
  return `claim-monitor.public.${value}`;
}
