export function publicFeatureFlags(environment = process.env) {
  return {
    publicProfileEnabled: String(environment.PUBLIC_PROFILE_ENABLED ?? "").toLowerCase() === "true",
    publicCollaborationEnabled: String(environment.PUBLIC_COLLABORATION_ENABLED ?? "").toLowerCase() === "true",
    publicLegalConfigurationConfirmed: String(environment.PUBLIC_LEGAL_CONFIGURATION_CONFIRMED ?? "").toLowerCase() === "true",
  };
}

export function profileResponse(profile, features) {
  return {
    profile: {
      id: profile.id,
      origin: profile.origin,
      allowsAdmin: profile.allowsAdmin,
      allowsDiscord: profile.allowsDiscord,
    },
    features,
  };
}

function isNamedPath(pathname, name) {
  return pathname === name || pathname.startsWith(`${name}/`);
}

function deny(res, send) {
  send(res, 404, { error: "Not found" });
  return true;
}

export function routeHostProfileRequest({ profile, method, url, res, send, features = publicFeatureFlags() }) {
  const { pathname, searchParams } = url;

  if (pathname === "/api/profile") {
    if (method !== "GET") return deny(res, send);
    send(res, 200, profileResponse(profile, features));
    return true;
  }

  if (profile.id === "timbersteel") {
    if (isNamedPath(pathname, "/api/public")) return deny(res, send);
    return false;
  }

  if (
    isNamedPath(pathname, "/api/local")
    || isNamedPath(pathname, "/api/discord")
    || isNamedPath(pathname, "/bot")
    || isNamedPath(pathname, "/admin")
    || (pathname === "/" && searchParams.get("page") === "admin")
  ) return deny(res, send);

  if (isNamedPath(pathname, "/api/public")) {
    // Task 3 owns concrete public API handlers. This skeleton intentionally
    // contains no configured-settlement fallback while the feature is off.
    return deny(res, send);
  }

  if (pathname.startsWith("/api/")) return deny(res, send);

  return false;
}
