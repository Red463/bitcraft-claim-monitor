#!/usr/bin/env node
import { lstatSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { deleteUserAccount } from "../apps/bitcraft-local/src/server/accountDeletion.mjs";
import { readDeletionLedger, replayPrivacyDeletions } from "../apps/bitcraft-local/src/server/privacyDeletionLedger.mjs";

function regularPath(candidate, expectedRoot) {
  const resolved = path.resolve(candidate);
  const root = path.resolve(expectedRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Path is outside ${root}`);
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Path is not a regular file: ${resolved}`);
  return resolved;
}

const [databaseArg, ledgerArg, keyArg] = process.argv.slice(2);
if (!databaseArg || !ledgerArg || !keyArg) {
  console.error("Usage: replay-privacy-deletions.mjs <database> <ledger> <key-file>");
  process.exit(2);
}

try {
  const database = regularPath(databaseArg, process.env.DATA_DIR ?? "/var/lib/bitcraft-claim-monitor");
  const ledger = regularPath(ledgerArg, process.env.BACKUP_DIR ?? "/var/backups/bitcraft-claim-monitor");
  const keyFile = regularPath(keyArg, process.env.CONFIG_DIR ?? "/etc/bitcraft-claim-monitor");
  const key = readFileSync(keyFile, "utf8").trim();
  if (!key) throw new Error("Privacy ledger key file is empty");
  const records = readDeletionLedger(ledger, [key]);
  const db = new DatabaseSync(database);
  db.exec("PRAGMA foreign_keys = ON");
  const accounts = db.prepare("SELECT id, discord_id AS discordId FROM user_accounts").all();
  const result = replayPrivacyDeletions({
    records,
    accounts,
    key,
    deleteAccount: (account) => deleteUserAccount(db, {
      userId: account.id,
      discordId: account.discordId,
      deletionKey: key,
    }),
  });
  db.close();
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
