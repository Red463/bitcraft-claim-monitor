function normalizeBusyTimeoutMs(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 5000;
}

function normalizeRetryCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 3;
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

function isBusyDatabaseError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /\bdatabase is locked\b|\bSQLITE_BUSY\b/i.test(message);
}

export function databaseConnectionPragmaStatements({ busyTimeoutMs = 5000 } = {}) {
  return [
    `PRAGMA busy_timeout = ${normalizeBusyTimeoutMs(busyTimeoutMs)};`,
    "PRAGMA journal_mode = WAL;",
  ];
}

export function applyDatabaseConnectionPragmas(db, options = {}) {
  const retryCount = normalizeRetryCount(options.retryCount);
  const retryDelayMs = normalizeBusyTimeoutMs(options.retryDelayMs ?? 1000);
  for (const statement of databaseConnectionPragmaStatements(options)) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        db.exec(statement);
        break;
      } catch (error) {
        if (!isBusyDatabaseError(error) || attempt >= retryCount) throw error;
        sleepSync(retryDelayMs);
      }
    }
  }
}
