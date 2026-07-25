import assert from "node:assert/strict";
import test from "node:test";

import {
  currentLegalSnapshot,
  isCurrentLegalAcceptance,
  publicLegalStatus,
  routeAllowedWithoutCurrentAcceptance,
} from "../src/server/legalAcceptance.mjs";

const expected = {
  version: "2026-07-25",
  termsDigest: "terms",
  privacyDigest: "privacy",
};

test("acceptance is current only when version, both digests, and age confirmation match", () => {
  const current = {
    legal_version: "2026-07-25",
    terms_digest: "terms",
    privacy_digest: "privacy",
    age_confirmed: 1,
    accepted_at: "2026-07-25T12:00:00.000Z",
  };
  assert.equal(isCurrentLegalAcceptance(current, expected), true);
  assert.equal(isCurrentLegalAcceptance({ ...current, legal_version: "2026-07-24" }, expected), false);
  assert.equal(isCurrentLegalAcceptance({ ...current, terms_digest: "old" }, expected), false);
  assert.equal(isCurrentLegalAcceptance({ ...current, privacy_digest: "old" }, expected), false);
  assert.equal(isCurrentLegalAcceptance({ ...current, age_confirmed: 0 }, expected), false);
});

test("public status reveals the current requirement without exposing stored digests from stale rows", () => {
  const status = publicLegalStatus({
    legal_version: "2026-07-24",
    terms_digest: "old",
    privacy_digest: "old",
    age_confirmed: 1,
    accepted_at: "2026-07-24T12:00:00.000Z",
  }, expected);
  assert.deepEqual(status, {
    ...expected,
    acceptedAt: null,
    requiresAcceptance: true,
  });
});

test("legal snapshot consumes the server-computed digest pair", () => {
  assert.deepEqual(currentLegalSnapshot({ version: "2026-07-25" }, {
    termsDigest: "terms",
    privacyDigest: "privacy",
  }), expected);
});

test("stale-session allowance is an exact method and route allowlist", () => {
  for (const [method, route] of [
    ["POST", "/api/local/auth/legal/accept"],
    ["GET", "/api/local/auth/privacy/export"],
    ["POST", "/api/local/auth/privacy/reauth/start"],
    ["DELETE", "/api/local/auth/privacy/account"],
    ["POST", "/api/local/auth/logout"],
  ]) {
    assert.equal(routeAllowedWithoutCurrentAcceptance(method, route), true, `${method} ${route}`);
  }
  assert.equal(routeAllowedWithoutCurrentAcceptance("PUT", "/api/local/auth/settings"), false);
  assert.equal(routeAllowedWithoutCurrentAcceptance("POST", "/api/local/auth/legal/accept/forged"), false);
  assert.equal(routeAllowedWithoutCurrentAcceptance("DELETE", "/api/local/auth/privacy/export"), false);
});
