#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  applyCanonicalCutoverManifest,
  createCanonicalCutoverManifest,
  DEFAULT_CANONICAL_CUTOVER_PATHS,
  readCanonicalCutoverManifest,
} from "../apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs";

function parseArguments(argv) {
  const options = { ...DEFAULT_CANONICAL_CUTOVER_PATHS, mode: null, claimId: null, manifestPath: null };
  const values = new Map([
    ["--source-db", "sourceDatabasePath"],
    ["--target-db", "targetDatabasePath"],
    ["--source-branding", "sourceBrandingDirectory"],
    ["--target-branding", "targetBrandingDirectory"],
    ["--claim-id", "claimId"],
    ["--manifest", "manifestPath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--apply") {
      if (options.mode) throw new TypeError("Choose exactly one of --dry-run or --apply");
      options.mode = argument.slice(2);
      continue;
    }
    const key = values.get(argument);
    if (!key) throw new TypeError(`Unknown argument: ${argument}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new TypeError(`${argument} requires a value`);
    options[key] = value;
  }
  if (!options.mode) throw new TypeError("Choose exactly one of --dry-run or --apply");
  if (!options.manifestPath) throw new TypeError("--manifest <path> is required");
  if (options.mode === "dry-run" && !options.claimId) throw new TypeError("--dry-run requires --claim-id <decimal>");
  if (options.mode === "apply") {
    const forbidden = ["claimId", "sourceDatabasePath", "targetDatabasePath", "sourceBrandingDirectory", "targetBrandingDirectory"];
    const explicitlySet = new Set(argv.filter((argument) => values.has(argument)).map((argument) => values.get(argument)));
    if (forbidden.some((key) => explicitlySet.has(key))) throw new TypeError("--apply accepts only --manifest <path>");
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === "dry-run") {
    const manifest = createCanonicalCutoverManifest(options);
    writeFileSync(path.resolve(options.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ claimId: manifest.claimId, selectionHash: manifest.selectionHash })}\n`);
  } else {
    const loaded = readCanonicalCutoverManifest(options.manifestPath);
    const result = applyCanonicalCutoverManifest(loaded);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
