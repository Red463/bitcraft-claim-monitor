import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { adminMutationRejection } from "../src/server/adminRequestGuards.mjs";

function csrfFor(session) {
  return createHash("sha256").update(`csrf:${session}`).digest("base64url");
}

test("adminMutationRejection allows read-only requests without CSRF checks", () => {
  assert.equal(adminMutationRejection({ method: "GET", headers: {} }, { isProduction: true }), null);
  assert.equal(adminMutationRejection({ method: "HEAD", headers: {} }, { isProduction: true }), null);
});

test("adminMutationRejection blocks cross-origin admin mutations", () => {
  assert.equal(adminMutationRejection({
    method: "POST",
    headers: { host: "claim.example", origin: "https://evil.example" },
  }, { isProduction: true }), "Cross-origin administrator mutation rejected");
});

test("adminMutationRejection requires the exact administrator CSRF token", () => {
  const session = "admin-session-token";
  const req = {
    method: "DELETE",
    headers: { host: "claim.example", origin: "https://claim.example", cookie: `bitcraft_admin_session=${session}` },
  };

  assert.equal(adminMutationRejection(req, { isProduction: true }), "Invalid administrator request token");
  assert.equal(adminMutationRejection({
    ...req,
    headers: { ...req.headers, "x-csrf-token": `${csrfFor(session)}x` },
  }, { isProduction: true }), "Invalid administrator request token");
  assert.equal(adminMutationRejection({
    ...req,
    headers: { ...req.headers, "x-csrf-token": csrfFor(session) },
  }, { isProduction: true }), null);
});

test("adminMutationRejection preserves local dev loopback same-origin allowance", () => {
  const session = "local-admin-session";
  assert.equal(adminMutationRejection({
    method: "PUT",
    headers: {
      host: "127.0.0.1:18430",
      origin: "http://localhost:18428",
      cookie: `bitcraft_admin_session=${session}`,
      "x-csrf-token": csrfFor(session),
    },
  }, { isProduction: false }), null);
});
