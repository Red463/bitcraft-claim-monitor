function normalizeBusyTimeoutMs(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 5000;
}

export function databaseConnectionPragmaStatements({ busyTimeoutMs = 5000 } = {}) {
  return [
    "PRAGMA journal_mode = WAL;",
    `PRAGMA busy_timeout = ${normalizeBusyTimeoutMs(busyTimeoutMs)};`,
  ];
}

export function applyDatabaseConnectionPragmas(db, options = {}) {
  for (const statement of databaseConnectionPragmaStatements(options)) db.exec(statement);
}
