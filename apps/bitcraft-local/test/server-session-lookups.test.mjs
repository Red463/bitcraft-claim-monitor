import assert from "node:assert/strict";
import test from "node:test";

import { lookupHttpSessionUser } from "../src/server/sessionLookups.mjs";

test("lookupHttpSessionUser returns null when the request has no session cookie", () => {
  const calls = [];

  const user = lookupHttpSessionUser({
    req: { headers: { cookie: "other=value" } },
    cookieName: "bitcraft_test_session",
    deleteExpiredSessions: { run: () => calls.push("delete") },
    userBySession: { get: () => calls.push("lookup") },
    now: () => new Date("2026-06-29T10:00:00.000Z"),
  });

  assert.equal(user, null);
  assert.deepEqual(calls, []);
});

test("lookupHttpSessionUser deletes expired sessions then looks up the hashed token with one timestamp", () => {
  const calls = [];
  const expectedUser = { id: 1, username: "owner" };

  const user = lookupHttpSessionUser({
    req: { headers: { cookie: "bitcraft_test_session=session-token" } },
    cookieName: "bitcraft_test_session",
    deleteExpiredSessions: {
      run: (timestamp) => calls.push(["delete", timestamp]),
    },
    userBySession: {
      get: (tokenHash, timestamp) => {
        calls.push(["lookup", tokenHash, timestamp]);
        return expectedUser;
      },
    },
    now: () => new Date("2026-06-29T10:00:00.000Z"),
  });

  assert.equal(user, expectedUser);
  assert.deepEqual(calls, [
    ["delete", "2026-06-29T10:00:00.000Z"],
    ["lookup", "c101e911469c969171040b50d70543313cf968fdef5bacc780776f8fb399ab36", "2026-06-29T10:00:00.000Z"],
  ]);
});

test("lookupHttpSessionUser normalizes missing lookup rows to null", () => {
  const user = lookupHttpSessionUser({
    req: { headers: { cookie: "bitcraft_test_session=session-token" } },
    cookieName: "bitcraft_test_session",
    deleteExpiredSessions: { run: () => {} },
    userBySession: { get: () => undefined },
    now: () => new Date("2026-06-29T10:00:00.000Z"),
  });

  assert.equal(user, null);
});
