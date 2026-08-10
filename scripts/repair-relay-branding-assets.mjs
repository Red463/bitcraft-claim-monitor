#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  createCanonicalCutoverDurability,
} from "../apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs";

const MANIFEST_VERSION = 1;
const MAX_ASSET_BYTES = 1024 * 1024;
const ASSET_TYPES = Object.freeze(["favicon", "logo"]);
const IMAGE_TYPES = Object.freeze({
  ".jpg": {
    contentType: "image/jpeg",
    magic: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  ".png": {
    contentType: "image/png",
    magic: (bytes) => bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  ".webp": {
    contentType: "image/webp",
    magic: (bytes) => bytes.length >= 12
      && bytes.subarray(0, 4).toString() === "RIFF"
      && bytes.subarray(8, 12).toString() === "WEBP",
  },
});
const ALLOWED_BRANDING_FILE = /^(?:logo|favicon)\.(?:jpg|png|webp)$/;

const durability = createCanonicalCutoverDurability();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  const descriptor = openSync(filePath, "r");
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    while ((bytesRead = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest("hex");
  } finally {
    closeSync(descriptor);
  }
}

function comparePaths(left, right) {
  const normalize = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  return normalize(path.resolve(left)) === normalize(path.resolve(right));
}

function pathContains(root, candidate) {
  const normalize = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  const relative = path.relative(normalize(path.resolve(root)), normalize(path.resolve(candidate)));
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function guardedExistingPath(inputPath, kind, label, { uniqueFile = false } = {}) {
  const resolved = path.resolve(String(inputPath ?? ""));
  if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`);
  if (lstatSync(resolved).isSymbolicLink() || !comparePaths(realpathSync.native(resolved), resolved)) {
    throw new Error(`${label} must not be or traverse a symlink`);
  }
  const stats = statSync(resolved, { bigint: true });
  if (kind === "file" && !stats.isFile()) throw new Error(`${label} must be a regular file`);
  if (kind === "directory" && !stats.isDirectory()) throw new Error(`${label} must be a directory`);
  if (uniqueFile && stats.nlink !== 1n) {
    throw new Error(`${label} hard-link count must be exactly 1; found ${stats.nlink}`);
  }
  return resolved;
}

function guardedPlannedFilePath(inputPath, label) {
  const resolved = path.resolve(String(inputPath ?? ""));
  const parent = guardedExistingPath(path.dirname(resolved), "directory", `${label} parent directory`);
  const canonical = path.join(parent, path.basename(resolved));
  if (!comparePaths(canonical, resolved)) throw new Error(`${label} must not traverse a symlink`);
  if (existsSync(canonical)) throw new Error(`${label} must be a new file`);
  return canonical;
}

function guardedExistingOrPlannedDirectory(inputPath, label) {
  const resolved = path.resolve(String(inputPath ?? ""));
  if (existsSync(resolved)) return guardedExistingPath(resolved, "directory", label);
  const parent = guardedExistingPath(path.dirname(resolved), "directory", `${label} parent directory`);
  const canonical = path.join(parent, path.basename(resolved));
  if (!comparePaths(canonical, resolved)) throw new Error(`${label} must not traverse a symlink`);
  return canonical;
}

function assertDatabaseHasNoSidecars(databasePath) {
  for (const suffix of ["-journal", "-shm", "-wal"]) {
    if (existsSync(`${databasePath}${suffix}`)) {
      throw new Error(`Database must be offline and checkpointed; found ${path.basename(databasePath)}${suffix}`);
    }
  }
}

function assertPathsAreDisjoint({ archiveRoot, brandingRoot, databasePath, manifestPath }) {
  if (pathContains(archiveRoot, brandingRoot) || pathContains(brandingRoot, archiveRoot)) {
    throw new Error("Archive and live branding roots must be disjoint");
  }
  for (const [label, filePath] of [["Database", databasePath], ["Manifest", manifestPath]]) {
    if (pathContains(archiveRoot, filePath) || pathContains(brandingRoot, filePath)) {
      throw new Error(`${label} path must remain outside the archive and live branding roots`);
    }
  }
}

function assertCleanIntegrity(db) {
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length) throw new Error(`SQLite foreign_key_check failed with ${foreignKeys.length} row(s)`);
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    throw new Error(`SQLite integrity_check failed with ${integrity.length} result row(s)`);
  }
}

function parseJsonObject(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must contain an object`);
  }
  return parsed;
}

function readBrandingRow(db) {
  const rows = db.prepare("SELECT value, updated_at FROM app_settings WHERE key = 'branding_json'").all();
  if (rows.length > 1) throw new Error("branding_json must have at most one app_settings row");
  if (!rows.length) return { branding: {}, raw: null, rowCount: 0, updatedAt: null };
  return {
    branding: parseJsonObject(rows[0].value, "branding_json"),
    raw: String(rows[0].value),
    rowCount: 1,
    updatedAt: String(rows[0].updated_at),
  };
}

function inspectArchiveAsset(type, configured, archiveRoot) {
  if (configured == null) {
    return {
      action: "clear",
      archiveRelativePath: null,
      configuredFilename: null,
      mediaType: null,
      sha256: null,
      size: 0,
      type,
      updatedAt: null,
      url: null,
    };
  }
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) {
    throw new Error(`${type} branding metadata is invalid`);
  }
  const keys = Object.keys(configured).sort();
  if (canonicalJson(keys) !== canonicalJson(["contentType", "fileName", "updatedAt", "url"])) {
    throw new Error(`${type} branding metadata is noncanonical`);
  }
  const canonicalUrl = `/api/local/branding/${type}`;
  if (configured.url !== canonicalUrl) {
    throw new Error(`${type} branding URL must be same-origin and canonical`);
  }
  const configuredFilename = String(configured.fileName ?? "");
  if (!configuredFilename
    || path.basename(configuredFilename) !== configuredFilename
    || configuredFilename.includes("/")
    || configuredFilename.includes("\\")) {
    throw new Error(`${type} branding filename must be a relative filename without path escape`);
  }
  const extension = path.extname(configuredFilename).toLowerCase();
  const format = IMAGE_TYPES[extension];
  const updatedAt = String(configured.updatedAt ?? "");
  const timestampValid = Number.isFinite(Date.parse(updatedAt)) && new Date(updatedAt).toISOString() === updatedAt;
  const metadataValid = configuredFilename === `${type}${extension}`
    && format != null
    && String(configured.contentType ?? "") === format.contentType
    && timestampValid;
  const base = {
    action: "clear",
    archiveRelativePath: configuredFilename,
    configuredFilename,
    mediaType: format?.contentType ?? (String(configured.contentType ?? "") || null),
    sha256: null,
    size: 0,
    type,
    updatedAt: timestampValid ? updatedAt : null,
    url: canonicalUrl,
  };
  if (!metadataValid) return base;
  const candidate = path.resolve(archiveRoot, configuredFilename);
  if (!comparePaths(path.dirname(candidate), archiveRoot)) {
    throw new Error(`${type} branding archive path escapes the approved archive root`);
  }
  if (!existsSync(candidate)) return base;
  const archivePath = guardedExistingPath(candidate, "file", `Archived ${type} asset`, { uniqueFile: true });
  const archiveSize = statSync(archivePath).size;
  const archiveHash = sha256File(archivePath);
  if (!archiveSize || archiveSize > MAX_ASSET_BYTES) {
    return { ...base, sha256: archiveHash, size: archiveSize };
  }
  const bytes = readFileSync(archivePath);
  if (!format.magic(bytes)) return { ...base, sha256: archiveHash, size: archiveSize };
  return {
    ...base,
    action: "restore",
    sha256: archiveHash,
    size: archiveSize,
  };
}

function describeBrandingRoot(brandingRoot) {
  if (!existsSync(brandingRoot)) return [];
  guardedExistingPath(brandingRoot, "directory", "Live branding directory");
  return readdirSync(brandingRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      if (entry.isSymbolicLink()) throw new Error("Live branding directory must not contain symlinks");
      if (!entry.isFile() || !ALLOWED_BRANDING_FILE.test(entry.name)) {
        throw new Error(`Live branding directory contains unsupported entry: ${entry.name}`);
      }
      const filePath = guardedExistingPath(
        path.join(brandingRoot, entry.name),
        "file",
        `Live branding asset ${entry.name}`,
        { uniqueFile: true },
      );
      const stats = statSync(filePath);
      return { relativePath: entry.name, sha256: sha256File(filePath), size: stats.size };
    });
}

function manifestSelection(unsigned) {
  return sha256(canonicalJson(unsigned));
}

function inspectRepair({ archivePath, databasePath, manifestPath }) {
  const resolvedDatabasePath = guardedExistingPath(databasePath, "file", "Database", { uniqueFile: true });
  assertDatabaseHasNoSidecars(resolvedDatabasePath);
  const resolvedArchiveRoot = guardedExistingPath(archivePath, "directory", "Approved archive root");
  const resolvedManifestPath = path.resolve(manifestPath);
  const brandingRoot = guardedExistingOrPlannedDirectory(
    path.join(path.dirname(resolvedDatabasePath), "branding"),
    "Live branding directory",
  );
  assertPathsAreDisjoint({
    archiveRoot: resolvedArchiveRoot,
    brandingRoot,
    databasePath: resolvedDatabasePath,
    manifestPath: resolvedManifestPath,
  });

  const beforeHash = sha256File(resolvedDatabasePath);
  const db = new DatabaseSync(resolvedDatabasePath, { readOnly: true });
  let brandingRow;
  try {
    assertCleanIntegrity(db);
    brandingRow = readBrandingRow(db);
  } finally {
    db.close();
  }
  const databaseHash = sha256File(resolvedDatabasePath);
  if (databaseHash !== beforeHash) throw new Error("Database changed during dry-run inspection");
  const unsupportedTypes = Object.keys(brandingRow.branding)
    .filter((type) => !ASSET_TYPES.includes(type));
  if (unsupportedTypes.length) throw new Error("branding_json contains unsupported asset types");
  const assets = ASSET_TYPES.map((type) => inspectArchiveAsset(type, brandingRow.branding[type], resolvedArchiveRoot));
  const rowCounts = {
    brandingSettingRows: brandingRow.rowCount,
    configuredAssets: assets.filter((entry) => entry.configuredFilename != null).length,
    clearActions: assets.filter((entry) => entry.action === "clear").length,
    restoreActions: assets.filter((entry) => entry.action === "restore").length,
  };
  const stats = statSync(resolvedDatabasePath);
  const unsigned = {
    archiveRoot: resolvedArchiveRoot,
    assets,
    brandingRoot,
    database: {
      brandingUpdatedAt: brandingRow.updatedAt,
      brandingValueSha256: brandingRow.raw == null ? null : sha256(brandingRow.raw),
      path: resolvedDatabasePath,
      sha256: databaseHash,
      size: stats.size,
    },
    formatVersion: MANIFEST_VERSION,
    rowCounts,
    targetFilesBefore: describeBrandingRoot(brandingRoot),
  };
  return { ...unsigned, selectionHash: manifestSelection(unsigned) };
}

function assertManifestIntegrity(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Manifest must contain a JSON object");
  }
  if (manifest.formatVersion !== MANIFEST_VERSION) throw new Error("Unsupported branding repair manifest format");
  const { selectionHash, ...unsigned } = manifest;
  if (!/^[a-f0-9]{64}$/.test(String(selectionHash ?? ""))
    || manifestSelection(unsigned) !== selectionHash) {
    throw new Error("Manifest selection hash is invalid");
  }
}

function readManifest(manifestPath) {
  const resolved = guardedExistingPath(manifestPath, "file", "Manifest", { uniqueFile: true });
  const manifest = parseJsonObject(readFileSync(resolved, "utf8"), "Manifest");
  assertManifestIntegrity(manifest);
  return { manifest, resolved };
}

function assertSameManifest(expected, current) {
  if (expected.database.sha256 !== current.database.sha256) {
    throw new Error("Database changed since dry-run; refusing apply");
  }
  for (const asset of expected.assets.filter((entry) => entry.action === "restore")) {
    const currentAsset = current.assets.find((entry) => entry.type === asset.type);
    if (!currentAsset || currentAsset.sha256 !== asset.sha256 || currentAsset.size !== asset.size) {
      throw new Error(`Archive ${asset.type} asset changed since dry-run; refusing apply`);
    }
  }
  if (canonicalJson(expected) !== canonicalJson(current)) {
    throw new Error("Branding repair inputs changed since dry-run; refusing apply");
  }
}

function repairedBranding(manifest) {
  return Object.fromEntries(manifest.assets
    .filter((entry) => entry.action === "restore")
    .map((entry) => [entry.type, {
      contentType: entry.mediaType,
      fileName: entry.configuredFilename,
      updatedAt: entry.updatedAt,
      url: entry.url,
    }]));
}

function stageBranding(manifest) {
  const targetParent = guardedExistingPath(path.dirname(manifest.brandingRoot), "directory", "Branding parent directory");
  const stageDirectory = mkdtempSync(path.join(targetParent, ".relay-branding-repair-stage-"));
  if (existsSync(manifest.brandingRoot)) chmodSync(stageDirectory, statSync(manifest.brandingRoot).mode);
  try {
    for (const asset of manifest.assets.filter((entry) => entry.action === "restore")) {
      const sourcePath = guardedExistingPath(
        path.join(manifest.archiveRoot, asset.archiveRelativePath),
        "file",
        `Manifest ${asset.type} archive asset`,
        { uniqueFile: true },
      );
      const stagePath = path.join(stageDirectory, asset.configuredFilename);
      copyFileSync(sourcePath, stagePath);
      const bytes = readFileSync(stagePath);
      const format = IMAGE_TYPES[path.extname(asset.configuredFilename).toLowerCase()];
      if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256 || !format?.magic(bytes)) {
        throw new Error(`Archive ${asset.type} asset changed while staging`);
      }
      durability.syncFile(stagePath);
    }
    durability.syncDirectory(stageDirectory);
    return stageDirectory;
  } catch (error) {
    rmSync(stageDirectory, { recursive: true, force: true });
    throw error;
  }
}

function applyRepair({ archivePath, databasePath, manifestPath }) {
  const { manifest, resolved: resolvedManifestPath } = readManifest(manifestPath);
  const resolvedDatabasePath = guardedExistingPath(databasePath, "file", "Database", { uniqueFile: true });
  const resolvedArchiveRoot = guardedExistingPath(archivePath, "directory", "Approved archive root");
  if (!comparePaths(resolvedManifestPath, manifestPath)
    || !comparePaths(resolvedDatabasePath, manifest.database.path)
    || !comparePaths(resolvedArchiveRoot, manifest.archiveRoot)) {
    throw new Error("Apply paths do not match the manifest");
  }
  const current = inspectRepair({
    archivePath: resolvedArchiveRoot,
    databasePath: resolvedDatabasePath,
    manifestPath: resolvedManifestPath,
  });
  assertSameManifest(manifest, current);

  const stageDirectory = stageBranding(manifest);
  const backupDirectory = `${manifest.brandingRoot}.relay-branding-repair-backup-${manifest.selectionHash.slice(0, 16)}`;
  if (existsSync(backupDirectory)) {
    rmSync(stageDirectory, { recursive: true, force: true });
    throw new Error("Branding repair backup directory already exists");
  }
  const targetExisted = existsSync(manifest.brandingRoot);
  const db = new DatabaseSync(resolvedDatabasePath);
  let transactionOpen = false;
  let installed = false;
  try {
    db.exec("PRAGMA foreign_keys = ON");
    if (Number(db.prepare("PRAGMA foreign_keys").get().foreign_keys) !== 1) {
      throw new Error("SQLite foreign keys could not be enabled");
    }
    db.exec("BEGIN EXCLUSIVE");
    transactionOpen = true;
    if (sha256File(resolvedDatabasePath) !== manifest.database.sha256) {
      throw new Error("Database changed since dry-run; refusing apply");
    }
    const brandingRow = readBrandingRow(db);
    if (brandingRow.rowCount !== manifest.rowCounts.brandingSettingRows
      || (brandingRow.raw == null ? null : sha256(brandingRow.raw)) !== manifest.database.brandingValueSha256) {
      throw new Error("branding_json changed since dry-run; refusing apply");
    }
    if (brandingRow.rowCount === 1) {
      db.prepare("UPDATE app_settings SET value = ? WHERE key = 'branding_json'")
        .run(canonicalJson(repairedBranding(manifest)));
    }
    if (targetExisted) durability.renamePath(manifest.brandingRoot, backupDirectory);
    durability.renamePath(stageDirectory, manifest.brandingRoot);
    installed = true;
    assertCleanIntegrity(db);
    db.exec("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try { db.exec("ROLLBACK"); } catch {}
    }
    if (installed && existsSync(manifest.brandingRoot)) {
      try { durability.removePath(manifest.brandingRoot, { recursive: true, force: true }); } catch {}
    } else if (existsSync(stageDirectory)) {
      try { durability.removePath(stageDirectory, { recursive: true, force: true }); } catch {}
    }
    if (targetExisted && existsSync(backupDirectory) && !existsSync(manifest.brandingRoot)) {
      try { durability.renamePath(backupDirectory, manifest.brandingRoot); } catch {}
    }
    throw error;
  } finally {
    db.close();
  }
  if (targetExisted && existsSync(backupDirectory)) {
    durability.removePath(backupDirectory, { recursive: true, force: true });
  }
  return {
    applied: true,
    rowCounts: manifest.rowCounts,
    selectionHash: manifest.selectionHash,
  };
}

function parseArguments(argv) {
  const options = { archivePath: null, databasePath: null, manifestPath: null, mode: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--apply") {
      if (options.mode) throw new TypeError("Choose exactly one of --dry-run or --apply");
      options.mode = argument.slice(2);
      continue;
    }
    const mappings = {
      "--archive": "archivePath",
      "--database": "databasePath",
      "--manifest": "manifestPath",
    };
    const key = mappings[argument];
    if (!key) throw new TypeError(`Unknown argument: ${argument}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new TypeError(`${argument} requires a path`);
    options[key] = value;
  }
  if (!options.mode || !options.databasePath || !options.archivePath || !options.manifestPath) {
    throw new TypeError("Choose --dry-run or --apply and provide --database, --archive, and --manifest paths");
  }
  return options;
}

export function runBrandingRepairCli(argv) {
  const options = parseArguments(argv);
  if (options.mode === "dry-run") {
    const manifestPath = guardedPlannedFilePath(options.manifestPath, "Manifest");
    const manifest = inspectRepair({ ...options, manifestPath });
    durability.writeMarker(manifestPath, manifest);
    return {
      mode: "dry-run",
      rowCounts: manifest.rowCounts,
      selectionHash: manifest.selectionHash,
    };
  }
  return applyRepair(options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && comparePaths(invokedPath, fileURLToPath(import.meta.url))) {
  try {
    process.stdout.write(`${JSON.stringify(runBrandingRepairCli(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
