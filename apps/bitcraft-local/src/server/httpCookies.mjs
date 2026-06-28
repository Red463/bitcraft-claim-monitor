export function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie ?? "").split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("=") ?? "")];
  }).filter(([key]) => key));
}

export function serializeHttpOnlyCookie(name, value, { maxAge, secure = false } = {}) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}