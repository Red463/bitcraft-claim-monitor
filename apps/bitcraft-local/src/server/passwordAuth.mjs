import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const LEGACY_ADMIN_PASSWORD_MIN_LENGTH = 12;

export function validLegacyAdminPassword(password) {
  return String(password ?? "").length >= LEGACY_ADMIN_PASSWORD_MIN_LENGTH;
}

export async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = Buffer.from(await scryptAsync(password, salt, 64)).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored).split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = Buffer.from(await scryptAsync(password, salt, 64));
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}