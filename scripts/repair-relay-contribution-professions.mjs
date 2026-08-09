#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  applyContributionProfessionRepair,
  createContributionProfessionManifest,
} from "../apps/bitcraft-local/src/server/contributionProfessionRepair.mjs";

function argumentsFor(argv) {
  const options = { mode: null, claimId: null, manifest: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run" || value === "--apply") options.mode = value.slice(2);
    else if (value === "--claim-id") options.claimId = argv[++index];
    else if (value === "--manifest") options.manifest = argv[++index];
    else throw new TypeError(`Unknown argument: ${value}`);
  }
  if (!options.mode || !options.manifest) throw new TypeError("Choose --dry-run or --apply and provide --manifest <path>");
  if (options.mode === "dry-run" && !options.claimId) throw new TypeError("--dry-run requires --claim-id <id>");
  if (options.mode === "apply" && options.claimId) throw new TypeError("--apply reads the claim id from its manifest");
  return options;
}

function databasePath() {
  if (process.env.BITCRAFT_LOCAL_DB_PATH) return path.resolve(process.env.BITCRAFT_LOCAL_DB_PATH);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "bitcraft-local", "data", "bitcraft-local.sqlite");
}

try {
  const options = argumentsFor(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const db = new DatabaseSync(databasePath(), { readOnly: options.mode === "dry-run" });
  try {
    if (options.mode === "dry-run") {
      const result = createContributionProfessionManifest(db, options.claimId);
      writeFileSync(manifestPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      const result = applyContributionProfessionRepair(db, JSON.parse(readFileSync(manifestPath, "utf8")));
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    db.close();
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
