#!/usr/bin/env node

import {
  chownSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_CUTOVER_IMAGE_TYPES,
  assertCanonicalCutoverSqliteIntegrity,
  canonicalJson,
  canonicalCutoverDatabaseLogicalFingerprint,
  canonicalCutoverComparePaths,
  canonicalCutoverGuardedExistingOrPlannedDirectory,
  canonicalCutoverGuardedExistingPath,
  canonicalCutoverGuardedPlannedFilePath,
  canonicalCutoverPathContains,
  canonicalCutoverSha256,
  canonicalCutoverSha256File,
  createCanonicalCutoverDurability,
} from "../apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs";

const MANIFEST_VERSION = 4;
const MAX_ASSET_BYTES = 1024 * 1024;
const ASSET_TYPES = Object.freeze(["favicon", "logo"]);
const IMAGE_TYPES = CANONICAL_CUTOVER_IMAGE_TYPES;
const ALLOWED_BRANDING_FILE = /^(?:logo|favicon)\.(?:jpg|png|webp)$/;

const durability = createCanonicalCutoverDurability();

const sha256 = canonicalCutoverSha256;
const sha256File = canonicalCutoverSha256File;
const comparePaths = canonicalCutoverComparePaths;
const pathContains = canonicalCutoverPathContains;

const POSIX_OWNERSHIP = process.platform !== "win32";

function normalizedNativeMode(stats, kind) {
  const mode = Number(stats.mode & 0o7777n);
  if (POSIX_OWNERSHIP) return mode;
  if (kind === "directory") return (mode & 0o200) !== 0 ? 0o755 : 0o555;
  return (mode & 0o200) !== 0 ? 0o644 : 0o444;
}

const nativeFilesystemMetadata = Object.freeze({
  apply(entryPath, expected, kind) {
    const current = this.read(entryPath, kind);
    if (POSIX_OWNERSHIP && (current.uid !== expected.uid || current.gid !== expected.gid)) {
      chownSync(entryPath, expected.uid, expected.gid);
    }
    if (current.mode !== expected.mode) chmodSync(entryPath, expected.mode);
  },
  read(entryPath, kind) {
    const stats = statSync(entryPath, { bigint: true });
    return {
      gid: Number(stats.gid),
      mode: normalizedNativeMode(stats, kind),
      uid: Number(stats.uid),
    };
  },
});

function assertSafeFilesystemMetadata(metadata, kind, label) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)
    || canonicalJson(Object.keys(metadata).sort()) !== canonicalJson(["gid", "mode", "uid"])) {
    throw new Error(`${label} filesystem metadata is invalid`);
  }
  for (const key of ["uid", "gid"]) {
    if (!Number.isSafeInteger(metadata[key]) || metadata[key] < 0 || metadata[key] > 0xffff_ffff) {
      throw new Error(`${label} filesystem ${key} is unsafe`);
    }
  }
  if (!Number.isSafeInteger(metadata.mode) || metadata.mode < 0 || metadata.mode > 0o7777) {
    throw new Error(`${label} filesystem mode is invalid`);
  }
  const hasSpecialBits = (metadata.mode & 0o7000) !== 0;
  const worldWritable = (metadata.mode & 0o002) !== 0;
  const unsafePermissions = kind === "directory"
    ? (metadata.mode & 0o700) !== 0o700
    : (metadata.mode & 0o600) !== 0o600 || (metadata.mode & 0o111) !== 0;
  if (hasSpecialBits || worldWritable || unsafePermissions) {
    throw new Error(`${label} has unsafe mode ${metadata.mode.toString(8).padStart(4, "0")}`);
  }
  return metadata;
}

function readSafeFilesystemMetadata(entryPath, kind, label, activeFilesystemMetadata) {
  return assertSafeFilesystemMetadata(
    activeFilesystemMetadata.read(entryPath, kind, label),
    kind,
    label,
  );
}

function applyExactFilesystemMetadata(entryPath, expected, kind, label, activeFilesystemMetadata) {
  assertSafeFilesystemMetadata(expected, kind, label);
  activeFilesystemMetadata.apply(entryPath, expected, kind, label);
  const current = readSafeFilesystemMetadata(entryPath, kind, label, activeFilesystemMetadata);
  if (canonicalJson(current) !== canonicalJson(expected)) {
    throw new Error(`${label} filesystem metadata does not match the exact branding repair manifest`);
  }
}

function guardedExistingPath(inputPath, kind, label, { uniqueFile = false } = {}) {
  const resolved = canonicalCutoverGuardedExistingPath(inputPath, kind, label);
  const stats = statSync(resolved, { bigint: true });
  if (uniqueFile && stats.nlink !== 1n) {
    throw new Error(`${label} hard-link count must be exactly 1; found ${stats.nlink}`);
  }
  return resolved;
}

function guardedPlannedFilePath(inputPath, label) {
  return canonicalCutoverGuardedPlannedFilePath(inputPath, label);
}

function guardedExistingOrPlannedDirectory(inputPath, label) {
  return canonicalCutoverGuardedExistingOrPlannedDirectory(inputPath, label);
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
  return assertCanonicalCutoverSqliteIntegrity(db);
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

function inspectArchiveAsset(type, configured, archiveRoot, activeFilesystemMetadata) {
  if (configured == null) {
    return {
      action: "clear",
      archiveRelativePath: null,
      configuredFilename: null,
      filesystemIdentity: null,
      filesystemMetadata: null,
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
    filesystemIdentity: null,
    filesystemMetadata: null,
    mediaType: format?.contentType ?? (String(configured.contentType ?? "") || null),
    sha256: null,
    size: 0,
    type,
    updatedAt: timestampValid ? updatedAt : null,
    url: canonicalUrl,
  };
  const candidate = path.resolve(archiveRoot, configuredFilename);
  if (!comparePaths(path.dirname(candidate), archiveRoot)) {
    throw new Error(`${type} branding archive path escapes the approved archive root`);
  }
  if (!existsSync(candidate)) return base;
  const archivePath = guardedExistingPath(candidate, "file", `Archived ${type} asset`, { uniqueFile: true });
  const archiveStats = statSync(archivePath, { bigint: true });
  const filesystemMetadata = readSafeFilesystemMetadata(
    archivePath,
    "file",
    `Archived ${type} asset`,
    activeFilesystemMetadata,
  );
  const filesystemIdentity = {
    device: archiveStats.dev.toString(),
    inode: archiveStats.ino.toString(),
    linkCount: archiveStats.nlink.toString(),
  };
  const archiveSize = Number(archiveStats.size);
  const archiveHash = sha256File(archivePath);
  const guardedBase = {
    ...base,
    filesystemIdentity,
    filesystemMetadata,
    sha256: archiveHash,
    size: archiveSize,
  };
  if (!metadataValid) return guardedBase;
  if (!archiveSize || archiveSize > MAX_ASSET_BYTES) {
    return guardedBase;
  }
  const bytes = readFileSync(archivePath);
  if (!format.magic(bytes)) return guardedBase;
  return {
    ...guardedBase,
    action: "restore",
  };
}

function describeBrandingDirectory(brandingRoot, activeFilesystemMetadata, { includeFilesystemIdentity = false } = {}) {
  if (!existsSync(brandingRoot)) return null;
  guardedExistingPath(brandingRoot, "directory", "Live branding directory");
  const stats = statSync(brandingRoot, { bigint: true });
  return {
    ...(includeFilesystemIdentity ? {
      filesystemIdentity: {
        device: stats.dev.toString(),
        inode: stats.ino.toString(),
        linkCount: stats.nlink.toString(),
      },
    } : {}),
    filesystemMetadata: readSafeFilesystemMetadata(
      brandingRoot,
      "directory",
      "Live branding directory",
      activeFilesystemMetadata,
    ),
  };
}

function describeBrandingRoot(
  brandingRoot,
  activeFilesystemMetadata,
  { includeFilesystemIdentity = false } = {},
) {
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
      const stats = statSync(filePath, { bigint: true });
      return {
        ...(includeFilesystemIdentity ? {
          filesystemIdentity: {
            device: stats.dev.toString(),
            inode: stats.ino.toString(),
            linkCount: stats.nlink.toString(),
          },
        } : {}),
        filesystemMetadata: readSafeFilesystemMetadata(
          filePath,
          "file",
          `Live branding asset ${entry.name}`,
          activeFilesystemMetadata,
        ),
        relativePath: entry.name,
        sha256: sha256File(filePath),
        size: Number(stats.size),
      };
    });
}

function repairedTargetFiles(assets, targetFilesBefore, targetDirectoryMetadata) {
  const previousByPath = new Map(targetFilesBefore.map((entry) => [entry.relativePath, entry]));
  return assets.filter((entry) => entry.action === "restore")
    .map((entry) => ({
      filesystemMetadata: previousByPath.get(entry.configuredFilename)?.filesystemMetadata ?? {
        gid: targetDirectoryMetadata.gid,
        mode: 0o644,
        uid: targetDirectoryMetadata.uid,
      },
      relativePath: entry.configuredFilename,
      sha256: entry.sha256,
      size: entry.size,
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function databaseInternalState(db) {
  const sequenceTable = db.prepare(
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'sqlite_sequence'",
  ).get();
  return {
    journalMode: String(db.prepare("PRAGMA journal_mode").get().journal_mode).toLowerCase(),
    sqliteSequence: sequenceTable
      ? db.prepare("SELECT name, seq FROM sqlite_sequence ORDER BY name").all()
        .map((row) => ({ name: String(row.name), sequence: String(row.seq) }))
      : null,
  };
}

function repairDatabaseFingerprint(db, projectedTables = {}) {
  return sha256(canonicalJson({
    internal: databaseInternalState(db),
    logical: canonicalCutoverDatabaseLogicalFingerprint(db, projectedTables),
  }));
}

function projectedPostDatabaseFingerprint(db, brandingRow, assets) {
  if (brandingRow.rowCount !== 1) return repairDatabaseFingerprint(db);
  const repairedValue = canonicalJson(repairedBranding({ assets }));
  const projectedSettings = db.prepare("SELECT * FROM app_settings ORDER BY rowid").all()
    .map((row) => String(row.key) === "branding_json" ? { ...row, value: repairedValue } : row);
  return repairDatabaseFingerprint(db, { app_settings: projectedSettings });
}

function manifestSelection(unsigned) {
  return sha256(canonicalJson(unsigned));
}

function inspectRepair(
  { archivePath, databasePath, manifestPath },
  activeFilesystemMetadata = nativeFilesystemMetadata,
) {
  const resolvedDatabasePath = guardedExistingPath(databasePath, "file", "Database", { uniqueFile: true });
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
  const targetParentMetadata = readSafeFilesystemMetadata(
    path.dirname(brandingRoot),
    "directory",
    "Branding parent directory",
    activeFilesystemMetadata,
  );
  const targetDirectoryBefore = describeBrandingDirectory(
    brandingRoot,
    activeFilesystemMetadata,
    { includeFilesystemIdentity: true },
  );
  const targetFilesBefore = describeBrandingRoot(
    brandingRoot,
    activeFilesystemMetadata,
    { includeFilesystemIdentity: true },
  );
  if (targetDirectoryBefore
    && (targetDirectoryBefore.filesystemMetadata.uid !== targetParentMetadata.uid
      || targetDirectoryBefore.filesystemMetadata.gid !== targetParentMetadata.gid)) {
    throw new Error("Live branding directory ownership does not match the service-owned data directory");
  }
  for (const targetFile of targetFilesBefore) {
    if (targetDirectoryBefore
      && (targetFile.filesystemMetadata.uid !== targetDirectoryBefore.filesystemMetadata.uid
        || targetFile.filesystemMetadata.gid !== targetDirectoryBefore.filesystemMetadata.gid)) {
      throw new Error(`Live branding asset ${targetFile.relativePath} ownership does not match the service-owned branding directory`);
    }
  }
  const targetDirectoryAfterMetadata = targetDirectoryBefore?.filesystemMetadata ?? {
    gid: targetParentMetadata.gid,
    mode: 0o750,
    uid: targetParentMetadata.uid,
  };

  const db = new DatabaseSync(resolvedDatabasePath, { readOnly: true });
  let brandingRow;
  let databaseFingerprint;
  let postDatabaseFingerprint;
  let journalMode;
  let assets;
  try {
    db.exec("BEGIN");
    assertCleanIntegrity(db);
    brandingRow = readBrandingRow(db);
    databaseFingerprint = repairDatabaseFingerprint(db);
    journalMode = String(db.prepare("PRAGMA journal_mode").get().journal_mode).toLowerCase();
    const unsupportedTypes = Object.keys(brandingRow.branding)
      .filter((type) => !ASSET_TYPES.includes(type));
    if (unsupportedTypes.length) throw new Error("branding_json contains unsupported asset types");
    assets = ASSET_TYPES.map((type) => inspectArchiveAsset(
      type,
      brandingRow.branding[type],
      resolvedArchiveRoot,
      activeFilesystemMetadata,
    ));
    postDatabaseFingerprint = projectedPostDatabaseFingerprint(db, brandingRow, assets);
    db.exec("ROLLBACK");
  } finally {
    db.close();
  }
  const rowCounts = {
    brandingSettingRows: brandingRow.rowCount,
    configuredAssets: assets.filter((entry) => entry.configuredFilename != null).length,
    clearActions: assets.filter((entry) => entry.action === "clear").length,
    restoreActions: assets.filter((entry) => entry.action === "restore").length,
  };
  const postBrandingRaw = brandingRow.rowCount === 1 ? canonicalJson(repairedBranding({ assets })) : null;
  const unsigned = {
    archiveRoot: resolvedArchiveRoot,
    assets,
    brandingRoot,
    database: {
      brandingUpdatedAt: brandingRow.updatedAt,
      brandingValueSha256: brandingRow.raw == null ? null : sha256(brandingRow.raw),
      journalMode,
      path: resolvedDatabasePath,
      postBrandingValueSha256: postBrandingRaw == null ? null : sha256(postBrandingRaw),
      postStateFingerprint: postDatabaseFingerprint,
      preStateFingerprint: databaseFingerprint,
    },
    formatVersion: MANIFEST_VERSION,
    rowCounts,
    targetDirectory: {
      after: { filesystemMetadata: targetDirectoryAfterMetadata },
      before: targetDirectoryBefore,
    },
    targetFilesAfter: repairedTargetFiles(assets, targetFilesBefore, targetDirectoryAfterMetadata),
    targetFilesBefore,
  };
  return { ...unsigned, selectionHash: manifestSelection(unsigned) };
}

function assertManifestFilesystemMetadata(manifest) {
  const targetDirectory = manifest.targetDirectory;
  if (!targetDirectory || typeof targetDirectory !== "object" || Array.isArray(targetDirectory)
    || !targetDirectory.after || typeof targetDirectory.after !== "object") {
    throw new Error("Manifest target branding directory metadata is invalid");
  }
  const directoryAfter = assertSafeFilesystemMetadata(
    targetDirectory.after.filesystemMetadata,
    "directory",
    "Manifest target branding directory",
  );
  const directoryBefore = targetDirectory.before == null ? null : assertSafeFilesystemMetadata(
    targetDirectory.before.filesystemMetadata,
    "directory",
    "Manifest live branding directory",
  );
  for (const asset of manifest.assets ?? []) {
    if ((asset.filesystemIdentity == null) !== (asset.filesystemMetadata == null)) {
      throw new Error(`Manifest archived ${asset.type} asset filesystem metadata is incomplete`);
    }
    if (asset.filesystemMetadata != null) {
      assertSafeFilesystemMetadata(asset.filesystemMetadata, "file", `Manifest archived ${asset.type} asset`);
    }
  }
  for (const targetFile of manifest.targetFilesBefore ?? []) {
    const metadata = assertSafeFilesystemMetadata(
      targetFile.filesystemMetadata,
      "file",
      `Manifest live branding asset ${targetFile.relativePath}`,
    );
    if (!directoryBefore || metadata.uid !== directoryBefore.uid || metadata.gid !== directoryBefore.gid) {
      throw new Error(`Manifest live branding asset ${targetFile.relativePath} ownership is unsafe`);
    }
  }
  for (const targetFile of manifest.targetFilesAfter ?? []) {
    const metadata = assertSafeFilesystemMetadata(
      targetFile.filesystemMetadata,
      "file",
      `Manifest repaired branding asset ${targetFile.relativePath}`,
    );
    if (metadata.uid !== directoryAfter.uid || metadata.gid !== directoryAfter.gid) {
      throw new Error(`Manifest repaired branding asset ${targetFile.relativePath} ownership is unsafe`);
    }
  }
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
  assertManifestFilesystemMetadata(manifest);
}

function readManifest(manifestPath) {
  const resolved = guardedExistingPath(manifestPath, "file", "Manifest", { uniqueFile: true });
  const manifest = parseJsonObject(readFileSync(resolved, "utf8"), "Manifest");
  assertManifestIntegrity(manifest);
  return { manifest, resolved };
}

function assertSameManifest(expected, current) {
  if (expected.database.preStateFingerprint !== current.database.preStateFingerprint) {
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

function stageBranding(manifest, activeDurability, activeFilesystemMetadata) {
  const targetParent = guardedExistingPath(path.dirname(manifest.brandingRoot), "directory", "Branding parent directory");
  const stageDirectory = mkdtempSync(path.join(targetParent, ".relay-branding-repair-stage-"));
  try {
    applyExactFilesystemMetadata(
      stageDirectory,
      manifest.targetDirectory.after.filesystemMetadata,
      "directory",
      "Staged branding directory",
      activeFilesystemMetadata,
    );
    for (const asset of manifest.assets.filter((entry) => entry.action === "restore")) {
      const sourcePath = guardedExistingPath(
        path.join(manifest.archiveRoot, asset.archiveRelativePath),
        "file",
        `Manifest ${asset.type} archive asset`,
        { uniqueFile: true },
      );
      const sourceStats = statSync(sourcePath, { bigint: true });
      const sourceIdentity = {
        device: sourceStats.dev.toString(),
        inode: sourceStats.ino.toString(),
        linkCount: sourceStats.nlink.toString(),
      };
      const sourceMetadata = readSafeFilesystemMetadata(
        sourcePath,
        "file",
        `Manifest ${asset.type} archive asset`,
        activeFilesystemMetadata,
      );
      if (canonicalJson(sourceIdentity) !== canonicalJson(asset.filesystemIdentity)
        || canonicalJson(sourceMetadata) !== canonicalJson(asset.filesystemMetadata)) {
        throw new Error(`Archive ${asset.type} asset changed while staging`);
      }
      const stagePath = path.join(stageDirectory, asset.configuredFilename);
      copyFileSync(sourcePath, stagePath);
      const bytes = readFileSync(stagePath);
      const format = IMAGE_TYPES[path.extname(asset.configuredFilename).toLowerCase()];
      if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256 || !format?.magic(bytes)) {
        throw new Error(`Archive ${asset.type} asset changed while staging`);
      }
      const target = manifest.targetFilesAfter.find((entry) => entry.relativePath === asset.configuredFilename);
      if (!target) throw new Error(`Manifest ${asset.type} target metadata is missing`);
      applyExactFilesystemMetadata(
        stagePath,
        target.filesystemMetadata,
        "file",
        `Staged ${asset.type} branding asset`,
        activeFilesystemMetadata,
      );
      activeDurability.syncFile(stagePath);
    }
    activeDurability.syncDirectory(stageDirectory);
    return stageDirectory;
  } catch (error) {
    try {
      activeDurability.removePath(stageDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new Error(`${error.message}; staging cleanup failed: ${cleanupError.message}`);
    }
    throw error;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function markerWithHash(payload) {
  return { ...payload, markerHash: sha256(canonicalJson(payload)) };
}

function markerPath(manifestPath, suffix, label) {
  const candidate = `${manifestPath}${suffix}`;
  return existsSync(candidate)
    ? guardedExistingPath(candidate, "file", label, { uniqueFile: true })
    : canonicalCutoverGuardedPlannedFilePath(candidate, label, { allowExisting: true });
}

function recoveryPaths(manifestPath, manifest) {
  return {
    appliedMarkerPath: markerPath(manifestPath, ".applied", "Applied marker"),
    backupDirectory: `${manifest.brandingRoot}.relay-branding-repair-backup-${manifest.selectionHash.slice(0, 16)}`,
    pendingMarkerPath: markerPath(manifestPath, ".applying", "Pending marker"),
  };
}

function pendingMarkerPayload(manifest, manifestPath, recovery, phase) {
  return markerWithHash({
    backupDirectory: recovery.backupDirectory,
    brandingRoot: manifest.brandingRoot,
    databasePath: manifest.database.path,
    formatVersion: MANIFEST_VERSION,
    manifestPath,
    phase,
    selectionHash: manifest.selectionHash,
    stageDirectory: recovery.stageDirectory,
    targetExisted: recovery.targetExisted,
  });
}

function appliedMarkerPayload(manifest, manifestPath) {
  return markerWithHash({
    brandingRoot: manifest.brandingRoot,
    databasePath: manifest.database.path,
    databaseStateFingerprint: manifest.database.postStateFingerprint,
    formatVersion: MANIFEST_VERSION,
    manifestPath,
    selectionHash: manifest.selectionHash,
    state: "applied",
  });
}

function readRepairMarker(markerPathValue, label) {
  const marker = parseJsonObject(readFileSync(
    guardedExistingPath(markerPathValue, "file", label, { uniqueFile: true }),
    "utf8",
  ), label);
  const { markerHash, ...unsigned } = marker;
  if (!/^[a-f0-9]{64}$/.test(String(markerHash ?? "")) || sha256(canonicalJson(unsigned)) !== markerHash) {
    throw new Error(`${label} hash is invalid`);
  }
  return marker;
}

function assertMarkerBinding(marker, manifest, manifestPath, label) {
  if (marker.formatVersion !== MANIFEST_VERSION
    || marker.selectionHash !== manifest.selectionHash
    || !comparePaths(marker.databasePath, manifest.database.path)
    || !comparePaths(marker.brandingRoot, manifest.brandingRoot)
    || !comparePaths(marker.manifestPath, manifestPath)) {
    throw new Error(`${label} does not match the exact branding repair manifest`);
  }
}

function readBrandingState(db) {
  const row = readBrandingRow(db);
  return {
    row,
    valueSha256: row.raw == null ? null : sha256(row.raw),
  };
}

function targetMatches(
  brandingRoot,
  expected,
  activeFilesystemMetadata,
  { includeFilesystemIdentity = false } = {},
) {
  try {
    return canonicalJson(describeBrandingRoot(
      brandingRoot,
      activeFilesystemMetadata,
      { includeFilesystemIdentity },
    )) === canonicalJson(expected);
  } catch {
    return false;
  }
}

function directoryMatches(
  brandingRoot,
  expected,
  activeFilesystemMetadata,
  { includeFilesystemIdentity = false } = {},
) {
  try {
    return canonicalJson(describeBrandingDirectory(
      brandingRoot,
      activeFilesystemMetadata,
      { includeFilesystemIdentity },
    )) === canonicalJson(expected);
  } catch {
    return false;
  }
}

function installedBrandingMatches(manifest, activeFilesystemMetadata) {
  return directoryMatches(
    manifest.brandingRoot,
    manifest.targetDirectory.after,
    activeFilesystemMetadata,
  ) && targetMatches(
    manifest.brandingRoot,
    manifest.targetFilesAfter,
    activeFilesystemMetadata,
  );
}

function assertLiveBrandingPreState(manifest, targetExisted, activeFilesystemMetadata) {
  const targetExistsNow = existsSync(manifest.brandingRoot);
  const directoryMatchesManifest = directoryMatches(
    manifest.brandingRoot,
    manifest.targetDirectory.before,
    activeFilesystemMetadata,
    { includeFilesystemIdentity: true },
  );
  const current = describeBrandingRoot(
    manifest.brandingRoot,
    activeFilesystemMetadata,
    { includeFilesystemIdentity: true },
  );
  if (targetExisted !== targetExistsNow
    || !directoryMatchesManifest
    || canonicalJson(current) !== canonicalJson(manifest.targetFilesBefore)) {
    throw new Error("Live branding directory changed since dry-run; refusing apply");
  }
}

function assertStagePath(stageDirectory, brandingRoot) {
  const parent = path.dirname(brandingRoot);
  if (!comparePaths(path.dirname(stageDirectory), parent)
    || !path.basename(stageDirectory).startsWith(".relay-branding-repair-stage-")) {
    throw new Error("Pending marker stage path is outside the guarded branding staging namespace");
  }
}

function verifyAppliedRepair(
  manifest,
  manifestPath,
  paths,
  activeDurability,
  openDatabase,
  activeFilesystemMetadata,
) {
  const marker = readRepairMarker(paths.appliedMarkerPath, "Applied marker");
  assertMarkerBinding(marker, manifest, manifestPath, "Applied marker");
  if (marker.databaseStateFingerprint !== manifest.database.postStateFingerprint) {
    throw new Error("Applied branding repair marker database fingerprint does not match the manifest");
  }
  const db = openDatabase(manifest.database.path);
  let transactionOpen = false;
  const databaseFailures = [];
  try {
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    const state = readBrandingState(db);
    if (state.row.rowCount !== manifest.rowCounts.brandingSettingRows
      || state.valueSha256 !== manifest.database.postBrandingValueSha256) {
      throw new Error("Applied branding repair database metadata does not match the manifest");
    }
    assertCleanIntegrity(db);
    if (repairDatabaseFingerprint(db) !== manifest.database.postStateFingerprint) {
      throw new Error("Applied branding repair database changed after finalization");
    }
    if (!existsSync(manifest.brandingRoot) || !installedBrandingMatches(manifest, activeFilesystemMetadata)) {
      throw new Error("Applied branding repair assets do not match the manifest");
    }
    if (existsSync(paths.pendingMarkerPath)) {
      activeDurability.removePath(paths.pendingMarkerPath, { force: true });
    }
    db.exec("ROLLBACK");
    transactionOpen = false;
  } catch (error) {
    databaseFailures.push(errorMessage(error));
    if (transactionOpen) {
      try { db.exec("ROLLBACK"); } catch (rollbackError) {
        databaseFailures.push(`applied recovery rollback failed: ${errorMessage(rollbackError)}`);
      }
    }
  }
  try { db.close(); } catch (closeError) {
    databaseFailures.push(`applied recovery database close failed: ${errorMessage(closeError)}`);
  }
  if (databaseFailures.length) {
    throw new Error(`Applied branding recovery verification failed: ${databaseFailures.join("; ")}`);
  }
  return { applied: true, recovered: true, rowCounts: manifest.rowCounts, selectionHash: manifest.selectionHash };
}

function recoverPendingRepair(
  manifest,
  manifestPath,
  paths,
  activeDurability,
  openDatabase,
  activeFilesystemMetadata,
) {
  const marker = readRepairMarker(paths.pendingMarkerPath, "Pending marker");
  assertMarkerBinding(marker, manifest, manifestPath, "Pending marker");
  if (!["prepared", "backup-renamed", "assets-installed", "database-committed"].includes(marker.phase)) {
    throw new Error("Pending marker phase is invalid");
  }
  if (!comparePaths(marker.backupDirectory, paths.backupDirectory)) {
    throw new Error("Pending marker backup path does not match the manifest");
  }
  assertStagePath(marker.stageDirectory, manifest.brandingRoot);
  const db = openDatabase(manifest.database.path);
  let transactionOpen = false;
  let state;
  let currentFingerprint;
  const databaseFailures = [];
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    state = readBrandingState(db);
    assertCleanIntegrity(db);
    currentFingerprint = repairDatabaseFingerprint(db);
  } catch (error) {
    databaseFailures.push(errorMessage(error));
    if (transactionOpen) {
      try { db.exec("ROLLBACK"); } catch (rollbackError) {
        databaseFailures.push(`recovery rollback failed: ${errorMessage(rollbackError)}`);
      }
    }
  }
  if (databaseFailures.length) {
    try { db.close(); } catch (closeError) {
      databaseFailures.push(`recovery database close failed: ${errorMessage(closeError)}`);
    }
    throw new Error(databaseFailures.join("; "));
  }

  const preDatabase = state.row.rowCount === manifest.rowCounts.brandingSettingRows
    && state.valueSha256 === manifest.database.brandingValueSha256
    && currentFingerprint === manifest.database.preStateFingerprint;
  const postDatabase = state.row.rowCount === manifest.rowCounts.brandingSettingRows
    && state.valueSha256 === manifest.database.postBrandingValueSha256
    && currentFingerprint === manifest.database.postStateFingerprint;
  const targetIsAfter = existsSync(manifest.brandingRoot)
    && installedBrandingMatches(manifest, activeFilesystemMetadata);
  const recoverAsPost = postDatabase && (!preDatabase || targetIsAfter);
  let result;
  const recoveryFailures = [];
  try {
    if (recoverAsPost) {
      if (!targetIsAfter) throw new Error("Committed branding database has mismatched live assets");
      if (existsSync(paths.backupDirectory)) {
        activeDurability.removePath(paths.backupDirectory, { recursive: true, force: true });
      }
      if (existsSync(marker.stageDirectory)) {
        activeDurability.removePath(marker.stageDirectory, { recursive: true, force: true });
      }
      activeDurability.writeMarker(
        paths.appliedMarkerPath,
        appliedMarkerPayload(manifest, manifestPath),
      );
      activeDurability.removePath(paths.pendingMarkerPath, { force: true });
      result = { applied: true, recovered: true, rowCounts: manifest.rowCounts, selectionHash: manifest.selectionHash };
    } else {
      if (!preDatabase) throw new Error("Database is neither the manifest pre-state nor repaired post-state");
      if (marker.targetExisted) {
        if (existsSync(paths.backupDirectory)) {
          if (!directoryMatches(
            paths.backupDirectory,
            manifest.targetDirectory.before,
            activeFilesystemMetadata,
            { includeFilesystemIdentity: true },
          ) || !targetMatches(
            paths.backupDirectory,
            manifest.targetFilesBefore,
            activeFilesystemMetadata,
            { includeFilesystemIdentity: true },
          )) {
            throw new Error("Branding backup no longer matches the manifest pre-state");
          }
          if (existsSync(manifest.brandingRoot)) {
            activeDurability.removePath(manifest.brandingRoot, { recursive: true, force: true });
          }
          activeDurability.renamePath(paths.backupDirectory, manifest.brandingRoot);
        } else if (!existsSync(manifest.brandingRoot)
          || !directoryMatches(
            manifest.brandingRoot,
            manifest.targetDirectory.before,
            activeFilesystemMetadata,
            { includeFilesystemIdentity: true },
          ) || !targetMatches(
            manifest.brandingRoot,
            manifest.targetFilesBefore,
            activeFilesystemMetadata,
            { includeFilesystemIdentity: true },
          )) {
          throw new Error("Original branding assets cannot be recovered from the pending state");
        }
      } else if (existsSync(manifest.brandingRoot)) {
        activeDurability.removePath(manifest.brandingRoot, { recursive: true, force: true });
      }
      if (existsSync(marker.stageDirectory)) {
        activeDurability.removePath(marker.stageDirectory, { recursive: true, force: true });
      }
      const restored = marker.targetExisted
        ? existsSync(manifest.brandingRoot)
          && directoryMatches(
            manifest.brandingRoot,
            manifest.targetDirectory.before,
            activeFilesystemMetadata,
            { includeFilesystemIdentity: true },
          )
          && targetMatches(
            manifest.brandingRoot,
            manifest.targetFilesBefore,
            activeFilesystemMetadata,
            { includeFilesystemIdentity: true },
          )
        : !existsSync(manifest.brandingRoot);
      if (!restored) throw new Error("Branding pre-state recovery verification failed");
      activeDurability.removePath(paths.pendingMarkerPath, { force: true });
      result = null;
    }
  } catch (error) {
    recoveryFailures.push(errorMessage(error));
  }
  if (transactionOpen) {
    try {
      db.exec("ROLLBACK");
      transactionOpen = false;
    } catch (rollbackError) {
      recoveryFailures.push(`recovery rollback failed: ${errorMessage(rollbackError)}`);
    }
  }
  try { db.close(); } catch (closeError) {
    recoveryFailures.push(`recovery database close failed: ${errorMessage(closeError)}`);
  }
  if (recoveryFailures.length) {
    const retained = existsSync(paths.pendingMarkerPath) ? "pending marker retained for exact retry: " : "";
    throw new Error(`Branding recovery failed; ${retained}${recoveryFailures.join("; ")}`);
  }
  return result;
}

function finalizeCommittedRepair(manifest, manifestPath, paths, recovery, activeDurability) {
  activeDurability.writeMarker(
    paths.pendingMarkerPath,
    pendingMarkerPayload(manifest, manifestPath, recovery, "database-committed"),
  );
  if (existsSync(paths.backupDirectory)) {
    activeDurability.removePath(paths.backupDirectory, { recursive: true, force: true });
  }
  if (existsSync(recovery.stageDirectory)) {
    activeDurability.removePath(recovery.stageDirectory, { recursive: true, force: true });
  }
  activeDurability.writeMarker(
    paths.appliedMarkerPath,
    appliedMarkerPayload(manifest, manifestPath),
  );
  activeDurability.removePath(paths.pendingMarkerPath, { force: true });
  return { applied: true, rowCounts: manifest.rowCounts, selectionHash: manifest.selectionHash };
}

export function applyBrandingRepairManifest(
  { archivePath, databasePath, manifestPath },
  {
    activeDurability: suppliedDurability,
    durability: legacyDurability,
    filesystemMetadata: suppliedFilesystemMetadata,
    openDatabase = (value, options = {}) => new DatabaseSync(value, options),
  } = {},
) {
  const activeDurability = suppliedDurability ?? legacyDurability ?? durability;
  const activeFilesystemMetadata = suppliedFilesystemMetadata ?? nativeFilesystemMetadata;
  const { manifest, resolved: resolvedManifestPath } = readManifest(manifestPath);
  const resolvedDatabasePath = guardedExistingPath(databasePath, "file", "Database", { uniqueFile: true });
  const resolvedArchiveRoot = guardedExistingPath(archivePath, "directory", "Approved archive root");
  if (!comparePaths(resolvedManifestPath, manifestPath)
    || !comparePaths(resolvedDatabasePath, manifest.database.path)
    || !comparePaths(resolvedArchiveRoot, manifest.archiveRoot)) {
    throw new Error("Apply paths do not match the manifest");
  }
  const paths = recoveryPaths(resolvedManifestPath, manifest);
  if (existsSync(paths.appliedMarkerPath)) {
    return verifyAppliedRepair(
      manifest,
      resolvedManifestPath,
      paths,
      activeDurability,
      openDatabase,
      activeFilesystemMetadata,
    );
  }
  if (existsSync(paths.pendingMarkerPath)) {
    const recovered = recoverPendingRepair(
      manifest,
      resolvedManifestPath,
      paths,
      activeDurability,
      openDatabase,
      activeFilesystemMetadata,
    );
    if (recovered) return recovered;
  }
  const current = inspectRepair({
    archivePath: resolvedArchiveRoot,
    databasePath: resolvedDatabasePath,
    manifestPath: resolvedManifestPath,
  }, activeFilesystemMetadata);
  assertSameManifest(manifest, current);

  const stageDirectory = stageBranding(manifest, activeDurability, activeFilesystemMetadata);
  if (existsSync(paths.backupDirectory)) {
    activeDurability.removePath(stageDirectory, { recursive: true, force: true });
    throw new Error("Branding repair backup directory already exists");
  }
  const targetExisted = existsSync(manifest.brandingRoot);
  const recovery = { backupDirectory: paths.backupDirectory, stageDirectory, targetExisted };
  const db = openDatabase(resolvedDatabasePath);
  let databaseCommitted = false;
  let transactionOpen = false;
  try {
    db.exec("PRAGMA foreign_keys = ON");
    if (Number(db.prepare("PRAGMA foreign_keys").get().foreign_keys) !== 1) {
      throw new Error("SQLite foreign keys could not be enabled");
    }
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    if (repairDatabaseFingerprint(db) !== manifest.database.preStateFingerprint) {
      throw new Error("Database changed since dry-run; refusing apply");
    }
    const brandingRow = readBrandingRow(db);
    if (brandingRow.rowCount !== manifest.rowCounts.brandingSettingRows
      || (brandingRow.raw == null ? null : sha256(brandingRow.raw)) !== manifest.database.brandingValueSha256) {
      throw new Error("branding_json changed since dry-run; refusing apply");
    }
    const finalAssets = ASSET_TYPES.map((type) => inspectArchiveAsset(
      type,
      brandingRow.branding[type],
      resolvedArchiveRoot,
      activeFilesystemMetadata,
    ));
    if (canonicalJson(finalAssets) !== canonicalJson(manifest.assets)) {
      throw new Error("Archive inputs changed since dry-run; refusing apply");
    }
    assertLiveBrandingPreState(manifest, targetExisted, activeFilesystemMetadata);
    activeDurability.writeMarker(
      paths.pendingMarkerPath,
      pendingMarkerPayload(manifest, resolvedManifestPath, recovery, "prepared"),
    );
    if (brandingRow.rowCount === 1) {
      db.prepare("UPDATE app_settings SET value = ? WHERE key = 'branding_json'")
        .run(canonicalJson(repairedBranding(manifest)));
    }
    assertLiveBrandingPreState(manifest, targetExisted, activeFilesystemMetadata);
    if (targetExisted) activeDurability.renamePath(manifest.brandingRoot, paths.backupDirectory);
    activeDurability.writeMarker(
      paths.pendingMarkerPath,
      pendingMarkerPayload(manifest, resolvedManifestPath, recovery, "backup-renamed"),
    );
    activeDurability.renamePath(stageDirectory, manifest.brandingRoot);
    activeDurability.writeMarker(
      paths.pendingMarkerPath,
      pendingMarkerPayload(manifest, resolvedManifestPath, recovery, "assets-installed"),
    );
    if (!installedBrandingMatches(manifest, activeFilesystemMetadata)) {
      throw new Error("Installed branding assets do not match the manifest");
    }
    assertCleanIntegrity(db);
    if (repairDatabaseFingerprint(db) !== manifest.database.postStateFingerprint) {
      throw new Error("Branding repair produced an unexpected full database state");
    }
    db.exec("COMMIT");
    transactionOpen = false;
    databaseCommitted = true;
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    if (repairDatabaseFingerprint(db) !== manifest.database.postStateFingerprint) {
      throw new Error("Database changed after commit before final marker publication");
    }
    const result = finalizeCommittedRepair(
      manifest,
      resolvedManifestPath,
      paths,
      recovery,
      activeDurability,
    );
    db.exec("ROLLBACK");
    transactionOpen = false;
    db.close();
    return result;
  } catch (error) {
    const failures = [errorMessage(error)];
    if (transactionOpen) {
      try { db.exec("ROLLBACK"); } catch (rollbackError) {
        failures.push(`rollback failed: ${errorMessage(rollbackError)}`);
      }
    }
    try { db.close(); } catch (closeError) {
      failures.push(`database close failed: ${errorMessage(closeError)}`);
    }
    if (existsSync(paths.pendingMarkerPath) && !databaseCommitted) {
      try {
        recoverPendingRepair(
          manifest,
          resolvedManifestPath,
          paths,
          activeDurability,
          openDatabase,
          activeFilesystemMetadata,
        );
      } catch (recoveryError) {
        failures.push(`recovery failed: ${errorMessage(recoveryError)}`);
      }
    } else if (!existsSync(paths.pendingMarkerPath) && existsSync(stageDirectory)) {
      try {
        activeDurability.removePath(stageDirectory, { recursive: true, force: true });
      } catch (cleanupError) {
        failures.push(`staging recovery failed: ${errorMessage(cleanupError)}`);
      }
    }
    throw new Error(`Branding repair failed: ${failures.join("; ")}`);
  }
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

export function runBrandingRepairCli(
  argv,
  { activeDurability = durability, filesystemMetadata = nativeFilesystemMetadata } = {},
) {
  const options = parseArguments(argv);
  if (options.mode === "dry-run") {
    const manifestPath = guardedPlannedFilePath(options.manifestPath, "Manifest");
    const manifest = inspectRepair({ ...options, manifestPath }, filesystemMetadata);
    activeDurability.writeMarker(manifestPath, manifest);
    return {
      mode: "dry-run",
      rowCounts: manifest.rowCounts,
      selectionHash: manifest.selectionHash,
    };
  }
  return applyBrandingRepairManifest(options, { activeDurability, filesystemMetadata });
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
