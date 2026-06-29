import assert from "node:assert/strict";
import test from "node:test";

import { LEGACY_ADMIN_PASSWORD_MIN_LENGTH, validLegacyAdminPassword, hashPassword, verifyPassword } from "../src/server/passwordAuth.mjs";

test("hashPassword preserves the legacy scrypt storage format and verifies matching passwords", async () => {
  const stored = await hashPassword("correct horse battery staple", "0123456789abcdef0123456789abcdef");

  assert.match(stored, /^scrypt:0123456789abcdef0123456789abcdef:[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
  assert.equal(await verifyPassword("wrong password", stored), false);
});

test("verifyPassword rejects malformed or unsupported stored password values", async () => {
  assert.equal(await verifyPassword("password", ""), false);
  assert.equal(await verifyPassword("password", "bcrypt:salt:hash"), false);
  assert.equal(await verifyPassword("password", "scrypt::hash"), false);
  assert.equal(await verifyPassword("password", "scrypt:salt:"), false);
  assert.equal(await verifyPassword("password", "scrypt:salt:not-hex"), false);
});
test("legacy admin password policy keeps the existing minimum length", () => {
  assert.equal(LEGACY_ADMIN_PASSWORD_MIN_LENGTH, 12);
  assert.equal(validLegacyAdminPassword("12345678901"), false);
  assert.equal(validLegacyAdminPassword("123456789012"), true);
});