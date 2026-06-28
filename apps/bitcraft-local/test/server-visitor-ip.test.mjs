import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { anonymizeIpAddress, createIpHasher, normalizeIpAddress } from "../src/server/visitorIp.mjs";

test("normalizeIpAddress trims common loopback and IPv4-mapped forms", () => {
  assert.equal(normalizeIpAddress(" 203.0.113.9 "), "203.0.113.9");
  assert.equal(normalizeIpAddress("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeIpAddress("::1"), "127.0.0.1");
  assert.equal(normalizeIpAddress(null), "");
});

test("anonymizeIpAddress keeps release analytics coarse for IPv4 and IPv6 addresses", () => {
  assert.equal(anonymizeIpAddress("203.0.113.42"), "203.0.113.0");
  assert.equal(anonymizeIpAddress("::ffff:127.0.0.1"), "127.0.0.0");
  assert.equal(anonymizeIpAddress("2001:db8:abcd:1234:5678:90ab:cdef:0001"), "2001:db8:abcd:1234::");
  assert.equal(anonymizeIpAddress("not-an-ip"), "unknown");
});

test("createIpHasher preserves the existing app-salted visitor hash format", () => {
  const hashIp = createIpHasher("claim-monitor");

  assert.equal(
    hashIp("::ffff:203.0.113.9"),
    createHash("sha256").update("claim-monitor|203.0.113.9").digest("hex"),
  );
});
