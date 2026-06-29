import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { csrfToken, csrfTokenFromSession, validCsrfHeader } from "../src/server/httpCsrf.mjs";

const session = "session-token";
const expected = createHash("sha256").update(`csrf:${session}`).digest("base64url");

test("csrfTokenFromSession derives the existing admin CSRF token format", () => {
  assert.equal(csrfTokenFromSession(session), expected);
  assert.equal(csrfTokenFromSession(""), null);
  assert.equal(csrfTokenFromSession(null), null);
});

test("csrfToken reads the admin session cookie from a request", () => {
  assert.equal(csrfToken({ headers: { cookie: `bitcraft_admin_session=${encodeURIComponent(session)}` } }), expected);
  assert.equal(csrfToken({ headers: { cookie: "other=value" } }), null);
});

test("validCsrfHeader accepts only exact same-length token matches", () => {
  assert.equal(validCsrfHeader(expected, expected), true);
  assert.equal(validCsrfHeader(expected, `${expected}x`), false);
  assert.equal(validCsrfHeader(expected, expected.slice(1)), false);
  assert.equal(validCsrfHeader(expected, ""), false);
  assert.equal(validCsrfHeader(null, expected), false);
});