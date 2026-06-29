export const ADMIN_LOGIN_ATTEMPT_LIMIT = 5;
export const ADMIN_LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export function loginAttemptKey(address, username) {
  return `${address}|${String(username).toLowerCase()}`;
}

export function createAdminLoginAttemptStore({ now = Date.now } = {}) {
  const attempts = new Map();

  function expired(record) {
    return now() - record.firstAt > ADMIN_LOGIN_ATTEMPT_WINDOW_MS;
  }

  return {
    blocked(key) {
      const record = attempts.get(key);
      if (!record || expired(record)) {
        attempts.delete(key);
        return false;
      }
      return record.count >= ADMIN_LOGIN_ATTEMPT_LIMIT;
    },
    recordFailure(key) {
      const existing = attempts.get(key);
      if (!existing || expired(existing)) {
        attempts.set(key, { count: 1, firstAt: now() });
        return;
      }
      existing.count += 1;
    },
    clear(key) {
      attempts.delete(key);
    },
  };
}