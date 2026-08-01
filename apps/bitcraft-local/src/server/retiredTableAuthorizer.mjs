import { constants } from "node:sqlite";

import { retiredTableNames } from "./schemaMigrations.mjs";

const retiredTableNameSet = new Set(retiredTableNames);

export function installRetiredTableAuthorizer(db, { enabled = process.env.RETIRED_TABLE_GUARD_TEST === "true" } = {}) {
  if (!enabled) return false;
  db.setAuthorizer((actionCode, argument1, argument2) => {
    const table = [argument1, argument2]
      .filter((argument) => typeof argument === "string")
      .map((argument) => argument.toLowerCase())
      .find((argument) => retiredTableNameSet.has(argument));
    if (table) throw new Error(`Retired SQLite table access: ${table}`);
    return constants.SQLITE_OK;
  });
  return true;
}
