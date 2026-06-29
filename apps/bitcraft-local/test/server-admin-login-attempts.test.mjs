import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_LOGIN_ATTEMPT_LIMIT,
  ADMIN_LOGIN_ATTEMPT_WINDOW_MS,
  createAdminLoginAttemptStore,
  loginAttemptKey,
} from "../src/server/adminLoginAttempts.mjs";

test("loginAttemptKey preserves address and lower-cased username keying", () => {
  assert.equal(loginAttemptKey("203.0.113.7", "OwnerAdmin"), "203.0.113.7|owneradmin");
});

test("admin login attempt store blocks after the existing failure limit within the window", () => {
  let now = 1_000;
  const attempts = createAdminLoginAttemptStore({ now: () => now });
  const key = loginAttemptKey("203.0.113.7", "admin");

  assert.equal(ADMIN_LOGIN_ATTEMPT_LIMIT, 5);
  assert.equal(ADMIN_LOGIN_ATTEMPT_WINDOW_MS, 15 * 60 * 1000);
  assert.equal(attempts.blocked(key), false);

  for (let index = 0; index < ADMIN_LOGIN_ATTEMPT_LIMIT - 1; index += 1) {
    attempts.recordFailure(key);
    assert.equal(attempts.blocked(key), false);
  }

  attempts.recordFailure(key);
  assert.equal(attempts.blocked(key), true);

  now += ADMIN_LOGIN_ATTEMPT_WINDOW_MS + 1;
  assert.equal(attempts.blocked(key), false);
});

test("admin login attempt store resets expired failures and clears successful logins", () => {
  let now = 10_000;
  const attempts = createAdminLoginAttemptStore({ now: () => now });
  const key = loginAttemptKey("198.51.100.2", "admin");

  attempts.recordFailure(key);
  now += ADMIN_LOGIN_ATTEMPT_WINDOW_MS + 1;
  attempts.recordFailure(key);

  for (let index = 0; index < ADMIN_LOGIN_ATTEMPT_LIMIT - 1; index += 1) {
    assert.equal(attempts.blocked(key), false);
    attempts.recordFailure(key);
  }
  assert.equal(attempts.blocked(key), true);

  attempts.clear(key);
  assert.equal(attempts.blocked(key), false);
});