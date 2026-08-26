#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  applyCanonicalCutoverManifest,
  createCanonicalCutoverManifest,
  DEFAULT_CANONICAL_CUTOVER_PATHS,
  readCanonicalCutoverManifest,
} from "../apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs";
import { prepareCanonicalCutoverPrivacyApply } from "../apps/bitcraft-local/src/server/canonicalCutoverPrivacy.mjs";

function parseArguments(argv) {
  const options = {
    ...DEFAULT_CANONICAL_CUTOVER_PATHS,
    mode: null,
    claimId: null,
    manifestPath: null,
    targetPreviousKeyFilePaths: [],
  };
  const values = new Map([
    ["--source-db", "sourceDatabasePath"],
    ["--target-db", "targetDatabasePath"],
    ["--source-branding", "sourceBrandingDirectory"],
    ["--target-branding", "targetBrandingDirectory"],
    ["--claim-id", "claimId"],
    ["--manifest", "manifestPath"],
    ["--source-privacy-ledger", "sourceLedgerPath"],
    ["--target-privacy-ledger", "targetLedgerPath"],
    ["--source-privacy-key", "sourceKeyFilePath"],
    ["--target-privacy-key", "targetKeyFilePath"],
    ["--installed-previous-privacy-key", "installedPreviousKeyFilePath"],
    ["--privacy-key-ready-artifact", "readinessArtifactPath"],
    ["--source-config-root", "sourceConfigRoot"],
    ["--target-config-root", "targetConfigRoot"],
    ["--source-backup-root", "sourceBackupRoot"],
    ["--target-backup-root", "targetBackupRoot"],
    ["--contribution-repair-manifest", "contributionRepairManifestPath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--apply") {
      if (options.mode) throw new TypeError("Choose exactly one of --dry-run or --apply");
      options.mode = argument.slice(2);
      continue;
    }
    if (argument === "--target-previous-privacy-key") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new TypeError(`${argument} requires a value`);
      options.targetPreviousKeyFilePaths.push(value);
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
  const privacyKeys = [
    "sourceLedgerPath",
    "targetLedgerPath",
    "sourceKeyFilePath",
    "targetKeyFilePath",
    "installedPreviousKeyFilePath",
    "readinessArtifactPath",
    "sourceConfigRoot",
    "targetConfigRoot",
    "sourceBackupRoot",
    "targetBackupRoot",
  ];
  if (options.mode === "dry-run") {
    const missing = privacyKeys.find((key) => options[key] == null);
    if (missing) {
      throw new TypeError("Privacy cutover requires explicit ledger paths, key paths, approved roots, installed previous-key destination, and readiness artifact path");
    }
    options.privacy = Object.fromEntries(privacyKeys.map((key) => [key, options[key]]));
    options.privacy.targetPreviousKeyFilePaths = options.targetPreviousKeyFilePaths;
  }
  if (options.mode === "apply") {
    const forbidden = [
      "claimId",
      "sourceDatabasePath",
      "targetDatabasePath",
      "sourceBrandingDirectory",
      "targetBrandingDirectory",
      ...privacyKeys.filter((key) => key !== "readinessArtifactPath"),
      "targetPreviousKeyFilePaths",
      "contributionRepairManifestPath",
    ];
    const explicitlySet = new Set(argv.filter((argument) => values.has(argument)).map((argument) => values.get(argument)));
    if (argv.includes("--target-previous-privacy-key")) explicitlySet.add("targetPreviousKeyFilePaths");
    if (forbidden.some((key) => explicitlySet.has(key))) {
      throw new TypeError("--apply accepts only --manifest <path> and --privacy-key-ready-artifact <path>");
    }
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === "dry-run") {
    if (options.contributionRepairManifestPath) {
      options.contributionRepairManifest = JSON.parse(readFileSync(path.resolve(options.contributionRepairManifestPath), "utf8"));
    }
    const manifest = createCanonicalCutoverManifest(options);
    writeFileSync(path.resolve(options.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ claimId: manifest.claimId, selectionHash: manifest.selectionHash })}\n`);
  } else {
    const loaded = readCanonicalCutoverManifest(options.manifestPath);
    const privacyApplyContext = loaded.manifest.privacyDeletionLedger
      ? prepareCanonicalCutoverPrivacyApply(loaded.manifest.privacyDeletionLedger)
      : null;
    const result = applyCanonicalCutoverManifest(loaded, {
      privacyApplyContext,
      privacyReadinessArtifactPath: options.readinessArtifactPath ?? null,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
