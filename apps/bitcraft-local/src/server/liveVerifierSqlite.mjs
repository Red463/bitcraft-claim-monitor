export function queryRowsWhenReady({
  databaseExists,
  openDatabase,
  sql,
  parameters = [],
}) {
  if (!databaseExists()) return [];
  const db = openDatabase();
  try {
    return db.prepare(sql).all(...parameters);
  } catch (error) {
    if (
      error?.code === "ERR_SQLITE_ERROR"
      && /no such table:/i.test(String(error?.message ?? ""))
    ) {
      return [];
    }
    throw error;
  } finally {
    db.close();
  }
}
