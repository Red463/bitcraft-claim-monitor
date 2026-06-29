import { createHash } from "node:crypto";

export function normalizeIpAddress(value) {
  let ip = String(value ?? "").trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

export function anonymizeIpAddress(value) {
  const ip = normalizeIpAddress(value);
  const parts = ip.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":") + "::";
  }
  return "unknown";
}

export function createIpHasher(appIdentifier) {
  return function ipHash(value) {
    return createHash("sha256").update(`${appIdentifier}|${normalizeIpAddress(value)}`).digest("hex");
  };
}