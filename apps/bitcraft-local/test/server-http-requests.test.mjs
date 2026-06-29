import assert from "node:assert/strict";
import test from "node:test";

import { originFromRequest, safeReturnPath, sameOriginRequest } from "../src/server/httpRequests.mjs";

test("originFromRequest uses forwarded proto and host before local defaults", () => {
  assert.equal(originFromRequest({ headers: { host: "127.0.0.1:18430" } }, { isProduction: false }), "http://127.0.0.1:18430");
  assert.equal(originFromRequest({ headers: { host: "app.example", "x-forwarded-proto": "https,http", "x-forwarded-host": "claim.example,proxy" } }, { isProduction: true }), "https://claim.example");
  assert.equal(originFromRequest({ headers: { host: "claim.example" } }, { isProduction: true }), "https://claim.example");
});

test("sameOriginRequest allows same host and local dev loopback origins only", () => {
  assert.equal(sameOriginRequest({ headers: {} }, { isProduction: true }), true);
  assert.equal(sameOriginRequest({ headers: { origin: "https://claim.example", host: "claim.example" } }, { isProduction: true }), true);
  assert.equal(sameOriginRequest({ headers: { origin: "http://localhost:18428", host: "127.0.0.1:18430" } }, { isProduction: false }), true);
  assert.equal(sameOriginRequest({ headers: { origin: "http://localhost:18428", host: "127.0.0.1:18430" } }, { isProduction: true }), false);
  assert.equal(sameOriginRequest({ headers: { origin: "not-a-url", host: "claim.example" } }, { isProduction: false }), false);
});

test("safeReturnPath keeps local paths and rejects external or malformed redirects", () => {
  assert.equal(safeReturnPath(null), "/?page=dashboard");
  assert.equal(safeReturnPath("  /?page=members  "), "/?page=members");
  assert.equal(safeReturnPath("https://evil.example"), "/?page=dashboard");
  assert.equal(safeReturnPath("//evil.example"), "/?page=dashboard");
  assert.equal(safeReturnPath("/bad\\path"), "/?page=dashboard");
  assert.equal(safeReturnPath(`/${"a".repeat(600)}`).length, 500);
});