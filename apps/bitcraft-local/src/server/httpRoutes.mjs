export function routeGroup(pathname) {
  if (pathname.startsWith("/api/local/admin")) return "admin";
  if (pathname.startsWith("/api/local/auth") || pathname.startsWith("/api/local/user")) return "auth";
  if (pathname.startsWith("/api/discord")) return "discord";
  if (pathname.startsWith("/api/bitjita")) return "bitjita-proxy";
  if (pathname.startsWith("/api/local")) return "local-api";
  if (pathname.startsWith("/assets/") || pathname === "/favicon.svg" || pathname === "/favicon.ico") return "static";
  return "app";
}

export function shouldLogVisitor(pathname) {
  return routeGroup(pathname) !== "static";
}