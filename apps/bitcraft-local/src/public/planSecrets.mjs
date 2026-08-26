const SECRET_PATH = /^\/(?:shared-plans|invites)\/[A-Za-z0-9_-]+$/;
const SECRET_VALUE = /^[A-Za-z0-9_-]{16,256}$/;

function secretKey(pathname) {
  const path = String(pathname ?? "");
  return SECRET_PATH.test(path) ? `claim-monitor.public.plan-secret:${path}` : null;
}

function fragmentToken(hash) {
  const fragment = String(hash ?? "").replace(/^#/, "");
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const candidate = params.get("share") ?? params.get("token") ?? params.get("secret") ?? (fragment.includes("=") ? "" : fragment);
  return SECRET_VALUE.test(String(candidate ?? "")) ? String(candidate) : null;
}

export function capturePublicPlanFragmentSecret({ location, history, sessionStorage } = {}) {
  const key = secretKey(location?.pathname);
  const token = fragmentToken(location?.hash);
  if (!key || !token) return false;
  try {
    history?.replaceState?.(null, "", `${location.pathname}${location.search ?? ""}`);
  } catch {
    return false;
  }
  try {
    sessionStorage?.setItem?.(key, token);
  } catch {
    return false;
  }
  return true;
}

export function publicPlanAuthorization(pathname, sessionStorage) {
  const key = secretKey(pathname);
  if (!key) return {};
  try {
    const token = sessionStorage?.getItem?.(key);
    return SECRET_VALUE.test(String(token ?? "")) ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function clearPublicPlanSecret(pathname, sessionStorage) {
  const key = secretKey(pathname);
  if (!key) return;
  try {
    sessionStorage?.removeItem?.(key);
  } catch {
    // Per-tab storage is optional; an expired bearer remains unusable server-side.
  }
}
