import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  CANONICAL_CUTOVER_IMAGE_TYPES,
  assertCanonicalCutoverSqliteIntegrity,
  canonicalCutoverGuardedExistingPath,
  canonicalCutoverSha256,
  createCanonicalCutoverDurability,
} from "../src/server/canonicalCutoverMigration.mjs";
import * as brandingRepair from "../../../scripts/repair-relay-branding-assets.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/repair-relay-branding-assets.mjs", import.meta.url));
const PNG_BYTES = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from("verified-png"),
]);
const OLD_PNG_BYTES = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from("old-png"),
]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBPverified-webp"),
]);

function asset(type, extension, contentType, overrides = {}) {
  return {
    fileName: `${type}.${extension}`,
    contentType,
    updatedAt: "2026-08-10T12:00:00.000Z",
    url: `/api/local/branding/${type}`,
    ...overrides,
  };
}

function createFixture(branding) {
  const root = mkdtempSync(path.join(tmpdir(), "relay-branding-repair-"));
  const dataRoot = path.join(root, "data");
  const databasePath = path.join(dataRoot, "bitcraft-local.sqlite");
  const archiveRoot = path.join(root, "archive");
  const brandingRoot = path.join(dataRoot, "branding");
  const manifestPath = path.join(root, "branding-repair.json");
  mkdirSync(dataRoot);
  mkdirSync(archiveRoot);
  mkdirSync(brandingRoot);
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE repair_sequence_probe (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL
    );
    INSERT INTO repair_sequence_probe (value) VALUES ('seed');
  `);
  if (branding !== undefined) {
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('branding_json', ?, ?)")
      .run(JSON.stringify(branding), "2026-08-10T12:00:00.000Z");
  }
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('sentinel', 'original', ?)")
    .run("2026-08-10T12:00:00.000Z");
  db.close();
  return {
    archiveRoot,
    brandingRoot,
    dataRoot,
    databasePath,
    manifestPath,
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function runScript(args) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: "utf8",
    timeout: 15_000,
  });
}

function dryRun(fixture) {
  return runScript([
    "--dry-run",
    "--database", fixture.databasePath,
    "--archive", fixture.archiveRoot,
    "--manifest", fixture.manifestPath,
  ]);
}

function apply(fixture) {
  return runScript([
    "--apply",
    "--database", fixture.databasePath,
    "--archive", fixture.archiveRoot,
    "--manifest", fixture.manifestPath,
  ]);
}

function directApply(fixture, options = {}) {
  return brandingRepair.applyBrandingRepairManifest({
    archivePath: fixture.archiveRoot,
    databasePath: fixture.databasePath,
    manifestPath: fixture.manifestPath,
  }, options);
}

function directDryRun(fixture, options = {}) {
  return brandingRepair.runBrandingRepairCli([
    "--dry-run",
    "--database", fixture.databasePath,
    "--archive", fixture.archiveRoot,
    "--manifest", fixture.manifestPath,
  ], options);
}

function nativeMode(entryPath) {
  return Number(statSync(entryPath, { bigint: true }).mode & 0o7777n);
}

function createMetadataOverlay() {
  const values = new Map();
  const key = (entryPath) => path.resolve(entryPath);
  const clone = (value) => ({ gid: value.gid, mode: value.mode, uid: value.uid });
  const read = (entryPath) => {
    const stored = values.get(key(entryPath));
    return stored ? clone(stored) : { gid: 0, mode: nativeMode(entryPath), uid: 0 };
  };
  return {
    operations: {
      apply(entryPath, metadata) {
        chmodSync(entryPath, metadata.mode);
        values.set(key(entryPath), clone(metadata));
      },
      read,
    },
    get: read,
    remove(entryPath) {
      const resolved = key(entryPath);
      for (const candidate of [...values.keys()]) {
        if (candidate === resolved || candidate.startsWith(`${resolved}${path.sep}`)) values.delete(candidate);
      }
    },
    rename(sourcePath, targetPath) {
      const source = key(sourcePath);
      const target = key(targetPath);
      const moved = [...values.entries()]
        .filter(([candidate]) => candidate === source || candidate.startsWith(`${source}${path.sep}`));
      this.remove(target);
      for (const [candidate, metadata] of moved) {
        values.delete(candidate);
        values.set(`${target}${candidate.slice(source.length)}`, metadata);
      }
    },
    set(entryPath, metadata) {
      values.set(key(entryPath), clone(metadata));
    },
  };
}

function metadataTrackingDurability(metadataOverlay, base = createCanonicalCutoverDurability()) {
  return {
    ...base,
    removePath(entryPath, options) {
      const result = base.removePath(entryPath, options);
      metadataOverlay.remove(entryPath);
      return result;
    },
    renamePath(sourcePath, targetPath) {
      const result = base.renamePath(sourcePath, targetPath);
      metadataOverlay.rename(sourcePath, targetPath);
      return result;
    },
  };
}

function serviceMetadataFixture(fixture) {
  const metadata = createMetadataOverlay();
  const serviceDirectory = { gid: 2002, mode: 0o750, uid: 2001 };
  const serviceFile = { gid: 2002, mode: 0o640, uid: 2001 };
  metadata.set(fixture.dataRoot, serviceDirectory);
  metadata.set(fixture.brandingRoot, serviceDirectory);
  metadata.set(path.join(fixture.brandingRoot, "logo.png"), serviceFile);
  metadata.set(path.join(fixture.archiveRoot, "logo.png"), { gid: 0, mode: 0o600, uid: 0 });
  return { metadata, serviceDirectory, serviceFile };
}

function writableBy(metadata, uid, gid) {
  if (metadata.uid === uid) return (metadata.mode & 0o200) !== 0;
  if (metadata.gid === gid) return (metadata.mode & 0o020) !== 0;
  return (metadata.mode & 0o002) !== 0;
}

function assertFullyRepaired(fixture) {
  assert.deepEqual(readFileSync(path.join(fixture.brandingRoot, "logo.png")), PNG_BYTES);
  assert.deepEqual(readBranding(fixture.databasePath), { logo: asset("logo", "png", "image/png") });
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), false);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), true);
}

function crashAfterRename(renameBoundary) {
  const real = createCanonicalCutoverDurability();
  let renameCount = 0;
  let crashed = false;
  const unavailable = () => {
    throw new Error("injected recovery filesystem unavailable");
  };
  return {
    ...real,
    removePath(...args) {
      if (crashed) return unavailable();
      return real.removePath(...args);
    },
    renamePath(...args) {
      if (crashed) return unavailable();
      const result = real.renamePath(...args);
      renameCount += 1;
      if (renameCount === renameBoundary) {
        crashed = true;
        throw new Error(`injected crash after rename ${renameBoundary}`);
      }
      return result;
    },
    writeMarker(...args) {
      if (crashed) return unavailable();
      return real.writeMarker(...args);
    },
  };
}

function crashAfterTrackedRename(renameBoundary, metadataOverlay) {
  const tracked = metadataTrackingDurability(metadataOverlay);
  let renameCount = 0;
  let crashed = false;
  const unavailable = () => {
    throw new Error("injected recovery filesystem unavailable");
  };
  return {
    ...tracked,
    removePath(...args) {
      if (crashed) return unavailable();
      return tracked.removePath(...args);
    },
    renamePath(...args) {
      if (crashed) return unavailable();
      const result = tracked.renamePath(...args);
      renameCount += 1;
      if (renameCount === renameBoundary) {
        crashed = true;
        throw new Error(`injected crash after rename ${renameBoundary}`);
      }
      return result;
    },
    writeMarker(...args) {
      if (crashed) return unavailable();
      return tracked.writeMarker(...args);
    },
  };
}

function crashAfterDatabaseCommit() {
  const real = createCanonicalCutoverDurability();
  let crashed = false;
  const unavailable = () => {
    throw new Error("injected post-commit filesystem unavailable");
  };
  return {
    ...real,
    removePath(...args) {
      if (crashed) return unavailable();
      return real.removePath(...args);
    },
    renamePath(...args) {
      if (crashed) return unavailable();
      return real.renamePath(...args);
    },
    writeMarker(markerPath, payload) {
      if (crashed) return unavailable();
      if (payload.phase === "database-committed") {
        crashed = true;
        throw new Error("injected crash after database commit");
      }
      return real.writeMarker(markerPath, payload);
    },
  };
}

function databaseWithRollbackFailure() {
  let rollbackFailureInjected = false;
  return (databasePath, options = {}) => {
    const db = new DatabaseSync(databasePath, options);
    return {
      close: db.close.bind(db),
      exec(sql) {
        if (String(sql).trim().toUpperCase() === "ROLLBACK" && !rollbackFailureInjected) {
          rollbackFailureInjected = true;
          db.exec(sql);
          throw new Error("injected rollback reporting failure");
        }
        return db.exec(sql);
      },
      prepare: db.prepare.bind(db),
    };
  };
}

function readBranding(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'branding_json'").get()?.value;
    return raw == null ? null : JSON.parse(raw);
  } finally {
    db.close();
  }
}

function readSentinel(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return db.prepare("SELECT value FROM app_settings WHERE key = 'sentinel'").get().value;
  } finally {
    db.close();
  }
}

function createForeignSentinelWriteProbe(databasePath) {
  const db = new DatabaseSync(databasePath, { timeout: 0 });
  let attempted = false;
  let blocked = false;
  return {
    attempt(value) {
      attempted = true;
      try {
        db.prepare("UPDATE app_settings SET value = ? WHERE key = 'sentinel'").run(value);
      } catch (error) {
        if (!/busy|locked/i.test(String(error?.message))) throw error;
        blocked = true;
      }
    },
    close: db.close.bind(db),
    get attempted() {
      return attempted;
    },
    get blocked() {
      return blocked;
    },
  };
}

test("branding repair safety uses the canonical cutover path, media, hash, and integrity seam", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  const archiveAsset = path.join(fixture.archiveRoot, "logo.png");
  writeFileSync(archiveAsset, PNG_BYTES);

  assert.equal(canonicalCutoverGuardedExistingPath(archiveAsset, "file", "Archive asset"), archiveAsset);
  assert.equal(CANONICAL_CUTOVER_IMAGE_TYPES[".png"].contentType, "image/png");
  assert.equal(CANONICAL_CUTOVER_IMAGE_TYPES[".png"].magic(PNG_BYTES), true);
  assert.equal(canonicalCutoverSha256(PNG_BYTES), "29056ec9a570b7f0f008097a5128be2d7f15a6c9d5ea3ecde16cf791db7ec5d4");
  const db = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.doesNotThrow(() => assertCanonicalCutoverSqliteIntegrity(db));
  db.close();
});

test("repair restores only verified PNG and WebP assets from the approved archive", (context) => {
  const fixture = createFixture({
    logo: asset("logo", "png", "image/png"),
    favicon: asset("favicon", "webp", "image/webp"),
  });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.archiveRoot, "favicon.webp"), WEBP_BYTES);

  const inspected = dryRun(fixture);
  assert.equal(inspected.status, 0, inspected.stderr);
  const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
  assert.deepEqual(
    manifest.assets.map(({ type, configuredFilename, archiveRelativePath, mediaType, action }) => ({
      type,
      configuredFilename,
      archiveRelativePath,
      mediaType,
      action,
    })),
    [
      {
        type: "favicon",
        configuredFilename: "favicon.webp",
        archiveRelativePath: "favicon.webp",
        mediaType: "image/webp",
        action: "restore",
      },
      {
        type: "logo",
        configuredFilename: "logo.png",
        archiveRelativePath: "logo.png",
        mediaType: "image/png",
        action: "restore",
      },
    ],
  );
  assert.deepEqual(manifest.rowCounts, {
    brandingSettingRows: 1,
    configuredAssets: 2,
    clearActions: 0,
    restoreActions: 2,
  });
  assert.match(manifest.selectionHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(manifest), /data:image|base64|secret/i);

  const repaired = apply(fixture);
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.deepEqual(readFileSync(path.join(fixture.brandingRoot, "logo.png")), PNG_BYTES);
  assert.deepEqual(readFileSync(path.join(fixture.brandingRoot, "favicon.webp")), WEBP_BYTES);
  assert.deepEqual(readBranding(fixture.databasePath), {
    favicon: asset("favicon", "webp", "image/webp"),
    logo: asset("logo", "png", "image/png"),
  });
});

test("root-like archive and staging ownership are rebound to the service-owned branding contract", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  const { metadata, serviceDirectory, serviceFile } = serviceMetadataFixture(fixture);

  directDryRun(fixture, { filesystemMetadata: metadata.operations });
  const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
  assert.equal(manifest.formatVersion, 4);
  assert.deepEqual(manifest.assets.find((entry) => entry.type === "logo").filesystemMetadata, {
    gid: 0,
    mode: 0o600,
    uid: 0,
  });
  assert.deepEqual(manifest.targetDirectory.after.filesystemMetadata, serviceDirectory);
  assert.deepEqual(manifest.targetFilesAfter.find((entry) => entry.relativePath === "logo.png").filesystemMetadata, serviceFile);

  const applied = directApply(fixture, {
    activeDurability: metadataTrackingDurability(metadata),
    filesystemMetadata: metadata.operations,
  });
  assert.equal(applied.applied, true);
  assert.deepEqual(metadata.get(fixture.brandingRoot), serviceDirectory);
  assert.deepEqual(metadata.get(path.join(fixture.brandingRoot, "logo.png")), serviceFile);
  assert.equal(writableBy(metadata.get(path.join(fixture.brandingRoot, "logo.png")), 2001, 2002), true);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), PNG_BYTES);

  metadata.set(path.join(fixture.brandingRoot, "logo.png"), { ...serviceFile, uid: 9999 });
  assert.throws(() => directApply(fixture, {
    activeDurability: metadataTrackingDurability(metadata),
    filesystemMetadata: metadata.operations,
  }), /applied branding repair assets do not match.*manifest|filesystem metadata/i);
});

test("dry-run and apply reject unsafe or drifted branding ownership and modes", async (context) => {
  await context.test("unsafe live directory mode", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
    subContext.after(() => fixture.cleanup());
    writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
    writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
    const { metadata } = serviceMetadataFixture(fixture);
    metadata.set(fixture.brandingRoot, { gid: 2002, mode: 0o777, uid: 2001 });

    assert.throws(
      () => directDryRun(fixture, { filesystemMetadata: metadata.operations }),
      /live branding directory.*unsafe mode/i,
    );
  });

  for (const [name, drift, expected] of [
    ["archive source mode", (fixture, metadata) => metadata.set(
      path.join(fixture.archiveRoot, "logo.png"),
      { gid: 0, mode: 0o640, uid: 0 },
    ), /archive.*changed since dry-run|inputs changed since dry-run/i],
    ["live directory ownership", (fixture, metadata) => metadata.set(
      fixture.brandingRoot,
      { gid: 2002, mode: 0o750, uid: 9999 },
    ), /branding repair inputs changed since dry-run|live branding directory changed since dry-run|ownership does not match/i],
    ["live asset mode", (fixture, metadata) => metadata.set(
      path.join(fixture.brandingRoot, "logo.png"),
      { gid: 2002, mode: 0o600, uid: 2001 },
    ), /branding repair inputs changed since dry-run|live branding directory changed since dry-run/i],
  ]) {
    await context.test(name, (subContext) => {
      const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
      subContext.after(() => fixture.cleanup());
      writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
      writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
      const { metadata } = serviceMetadataFixture(fixture);
      directDryRun(fixture, { filesystemMetadata: metadata.operations });
      drift(fixture, metadata);

      assert.throws(() => directApply(fixture, {
        activeDurability: metadataTrackingDurability(metadata),
        filesystemMetadata: metadata.operations,
      }), expected);
    });
  }
});

test("exact-manifest recovery republishes service-owned writable branding after a staged rename crash", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  const { metadata, serviceDirectory, serviceFile } = serviceMetadataFixture(fixture);
  directDryRun(fixture, { filesystemMetadata: metadata.operations });

  assert.throws(() => directApply(fixture, {
    activeDurability: crashAfterTrackedRename(2, metadata),
    filesystemMetadata: metadata.operations,
  }), /injected crash.*recovery failed.*filesystem unavailable/i);
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);

  const recovered = directApply(fixture, {
    activeDurability: metadataTrackingDurability(metadata),
    filesystemMetadata: metadata.operations,
  });
  assert.equal(recovered.applied, true);
  assert.deepEqual(metadata.get(fixture.brandingRoot), serviceDirectory);
  assert.deepEqual(metadata.get(path.join(fixture.brandingRoot, "logo.png")), serviceFile);
  assert.equal(writableBy(metadata.get(path.join(fixture.brandingRoot, "logo.png")), 2001, 2002), true);
});

test("POSIX publication preserves writable target ownership and mode instead of archive metadata", {
  skip: process.platform === "win32" ? "Windows does not expose POSIX chown semantics" : false,
}, (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  const archiveAsset = path.join(fixture.archiveRoot, "logo.png");
  const liveAsset = path.join(fixture.brandingRoot, "logo.png");
  writeFileSync(archiveAsset, PNG_BYTES);
  writeFileSync(liveAsset, OLD_PNG_BYTES);
  chmodSync(fixture.brandingRoot, 0o750);
  chmodSync(liveAsset, 0o640);
  chmodSync(archiveAsset, 0o600);
  const expectedDirectory = statSync(fixture.brandingRoot);
  const expectedFile = statSync(liveAsset);

  assert.equal(dryRun(fixture).status, 0);
  const repaired = apply(fixture);
  assert.equal(repaired.status, 0, repaired.stderr);
  const finalDirectory = statSync(fixture.brandingRoot);
  const finalFile = statSync(liveAsset);
  assert.equal(finalDirectory.uid, expectedDirectory.uid);
  assert.equal(finalDirectory.gid, expectedDirectory.gid);
  assert.equal(finalDirectory.mode & 0o7777, 0o750);
  assert.equal(finalFile.uid, expectedFile.uid);
  assert.equal(finalFile.gid, expectedFile.gid);
  assert.equal(finalFile.mode & 0o7777, 0o640);
  assert.doesNotThrow(() => writeFileSync(liveAsset, PNG_BYTES));
});

test("repair clears configured metadata when the archived file is missing", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);

  const inspected = dryRun(fixture);
  assert.equal(inspected.status, 0, inspected.stderr);
  const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
  assert.equal(manifest.assets.find((entry) => entry.type === "logo").action, "clear");
  assert.equal(manifest.assets.find((entry) => entry.type === "logo").sha256, null);

  const repaired = apply(fixture);
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.deepEqual(readBranding(fixture.databasePath), {});
  assert.throws(() => readFileSync(path.join(fixture.brandingRoot, "logo.png")), /ENOENT/);
});

test("a media-invalid archived file is cleared but remains hash-bound to the manifest", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), Buffer.from("not-an-image"));

  const inspected = dryRun(fixture);
  assert.equal(inspected.status, 0, inspected.stderr);
  const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
  const logo = manifest.assets.find((entry) => entry.type === "logo");
  assert.equal(logo.action, "clear");
  assert.equal(logo.sha256, "f2e2c6db1745cc40df646dc40c385487c36e4ceb3f1d5c8d6ad1f7620af1ebae");
  assert.equal(logo.size, 12);

  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), Buffer.from("still-not-an-image"));
  const result = apply(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /archive logo asset changed since dry-run|inputs changed since dry-run/i);
});

test("metadata-invalid clear candidates remain path, identity, and hash guarded", async (context) => {
  await context.test("regular candidate is bound", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/webp") });
    subContext.after(() => fixture.cleanup());
    writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);

    const inspected = dryRun(fixture);
    assert.equal(inspected.status, 0, inspected.stderr);
    const logo = JSON.parse(readFileSync(fixture.manifestPath, "utf8")).assets
      .find((entry) => entry.type === "logo");
    assert.equal(logo.action, "clear");
    assert.equal(logo.sha256, "29056ec9a570b7f0f008097a5128be2d7f15a6c9d5ea3ecde16cf791db7ec5d4");
    assert.equal(logo.filesystemIdentity.linkCount, "1");
    assert.match(logo.filesystemIdentity.device, /^\d+$/);
    assert.match(logo.filesystemIdentity.inode, /^[1-9]\d*$/);
  });

  await context.test("candidate symlink is rejected", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/webp") });
    subContext.after(() => fixture.cleanup());
    const directoryTarget = path.join(fixture.root, "symlink-target");
    mkdirSync(directoryTarget);
    symlinkSync(directoryTarget, path.join(fixture.archiveRoot, "logo.png"), process.platform === "win32" ? "junction" : "dir");

    const result = dryRun(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink/i);
  });

  await context.test("candidate hard link is rejected", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/webp") });
    subContext.after(() => fixture.cleanup());
    const source = path.join(fixture.archiveRoot, "source.png");
    writeFileSync(source, PNG_BYTES);
    linkSync(source, path.join(fixture.archiveRoot, "logo.png"));

    const result = dryRun(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /hard-link count/i);
  });

  await context.test("same-byte candidate replacement is refused", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/webp") });
    subContext.after(() => fixture.cleanup());
    const candidate = path.join(fixture.archiveRoot, "logo.png");
    writeFileSync(candidate, PNG_BYTES);
    assert.equal(dryRun(fixture).status, 0);
    rmSync(candidate);
    writeFileSync(candidate, PNG_BYTES);

    const result = apply(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /archive.*identity changed|inputs changed since dry-run/i);
  });
});

test("apply refuses a modified manifest or changed archived bytes", async (context) => {
  await context.test("manifest selection drift", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
    subContext.after(() => fixture.cleanup());
    writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
    assert.equal(dryRun(fixture).status, 0);
    const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
    manifest.assets.find((entry) => entry.type === "logo").action = "clear";
    writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = apply(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest selection hash is invalid/i);
  });

  await context.test("archive hash drift", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
    subContext.after(() => fixture.cleanup());
    writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
    assert.equal(dryRun(fixture).status, 0);
    writeFileSync(path.join(fixture.archiveRoot, "logo.png"), Buffer.concat([PNG_BYTES, Buffer.from("changed")]));

    const result = apply(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /archive.*changed since dry-run/i);
  });
});

test("apply refuses when any database content changed after dry-run", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  const db = new DatabaseSync(fixture.databasePath);
  db.prepare("UPDATE app_settings SET value = 'changed' WHERE key = 'sentinel'").run();
  db.close();

  const result = apply(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /database changed since dry-run/i);
  assert.deepEqual(readBranding(fixture.databasePath), { logo: asset("logo", "png", "image/png") });
});

test("dry-run rejects path escapes, symlinks, hard links, and a hard-linked database", async (context) => {
  await context.test("configured filename escape", (subContext) => {
    const fixture = createFixture({
      logo: asset("logo", "png", "image/png", { fileName: "../logo.png" }),
    });
    subContext.after(() => fixture.cleanup());
    const result = dryRun(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /filename.*escape|relative filename|unsupported filename/i);
  });

  await context.test("archive-root symlink", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
    subContext.after(() => fixture.cleanup());
    const realArchive = path.join(fixture.root, "real-archive");
    rmSync(fixture.archiveRoot, { recursive: true });
    mkdirSync(realArchive);
    writeFileSync(path.join(realArchive, "logo.png"), PNG_BYTES);
    try {
      symlinkSync(realArchive, fixture.archiveRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error?.code === "EPERM") {
        subContext.skip("This account cannot create directory symlinks");
        return;
      }
      throw error;
    }
    const result = dryRun(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink/i);
  });

  await context.test("archived hard link", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
    subContext.after(() => fixture.cleanup());
    const linkedAsset = path.join(fixture.archiveRoot, "source.png");
    writeFileSync(linkedAsset, PNG_BYTES);
    linkSync(linkedAsset, path.join(fixture.archiveRoot, "logo.png"));
    const result = dryRun(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /hard-link count/i);
  });

  await context.test("database hard link", (subContext) => {
    const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
    subContext.after(() => fixture.cleanup());
    const linkedDatabase = path.join(fixture.root, "linked.sqlite");
    linkSync(fixture.databasePath, linkedDatabase);
    const result = runScript([
      "--dry-run",
      "--database", linkedDatabase,
      "--archive", fixture.archiveRoot,
      "--manifest", fixture.manifestPath,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /database hard-link count/i);
  });
});

test("dry-run refuses arbitrary remote branding URLs", (context) => {
  const fixture = createFixture({
    logo: asset("logo", "png", "image/png", { url: "https://attacker.invalid/tracker.png" }),
  });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);

  const result = dryRun(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /same-origin|canonical branding URL/i);
});

test("an apply-time integrity failure rolls back branding metadata and published assets", (context) => {
  const originalBranding = { logo: asset("logo", "png", "image/png") };
  const fixture = createFixture(originalBranding);
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  const db = new DatabaseSync(fixture.databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE repair_parent (id INTEGER PRIMARY KEY);
    CREATE TABLE repair_child (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES repair_parent(id) DEFERRABLE INITIALLY DEFERRED
    );
    CREATE TRIGGER break_branding_repair
    AFTER UPDATE OF value ON app_settings
    WHEN NEW.key = 'branding_json'
    BEGIN
      INSERT INTO repair_child (parent_id) VALUES (999);
    END;
  `);
  db.close();
  assert.equal(dryRun(fixture).status, 0);

  const result = apply(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /foreign_key_check failed/i);
  assert.deepEqual(readBranding(fixture.databasePath), originalBranding);
  assert.deepEqual(readFileSync(path.join(fixture.brandingRoot, "logo.png")), OLD_PNG_BYTES);
  const verified = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal(verified.prepare("SELECT COUNT(*) AS count FROM repair_child").get().count, 0);
  verified.close();
});

test("interruption after each branding directory rename is recovered by exact-manifest retry", async (context) => {
  for (const [label, renameBoundary] of [["backup rename", 1], ["install rename", 2]]) {
    await context.test(label, (subContext) => {
      const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
      subContext.after(() => fixture.cleanup());
      writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
      writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
      assert.equal(dryRun(fixture).status, 0);

      assert.throws(
        () => directApply(fixture, { durability: crashAfterRename(renameBoundary) }),
        /injected crash.*recovery failed.*filesystem unavailable/i,
      );
      assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
      assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);

      const retried = apply(fixture);
      assert.equal(retried.status, 0, retried.stderr);
      assertFullyRepaired(fixture);
    });
  }
});

test("retry finalizes a committed database after interruption before its phase marker", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  assert.throws(
    () => directApply(fixture, { durability: crashAfterDatabaseCommit() }),
    /injected crash after database commit/i,
  );
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  const retried = apply(fixture);
  assert.equal(retried.status, 0, retried.stderr);
  assertFullyRepaired(fixture);
});

test("unrelated offline database mutation is rejected in every pending recovery phase", async (context) => {
  const phases = [
    ["backup renamed", () => crashAfterRename(1)],
    ["assets installed", () => crashAfterRename(2)],
    ["database committed", () => crashAfterDatabaseCommit()],
  ];
  for (const [label, interruptedDurability] of phases) {
    await context.test(label, (subContext) => {
      const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
      subContext.after(() => fixture.cleanup());
      writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
      writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
      assert.equal(dryRun(fixture).status, 0);
      assert.throws(() => directApply(fixture, { durability: interruptedDurability() }));
      assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);

      const changed = new DatabaseSync(fixture.databasePath);
      changed.prepare("UPDATE app_settings SET value = 'offline-drift' WHERE key = 'sentinel'").run();
      changed.close();

      const retried = apply(fixture);
      assert.notEqual(retried.status, 0);
      assert.match(retried.stderr, /database.*(?:pre-state|post-state|fingerprint)|neither.*state/i);
      assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
      assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);
    });
  }
});

test("sqlite_sequence and journal mode drift are rejected in every pending recovery phase", async (context) => {
  const phases = [
    ["backup renamed", () => crashAfterRename(1)],
    ["assets installed", () => crashAfterRename(2)],
    ["database committed", () => crashAfterDatabaseCommit()],
  ];
  const mutations = [
    ["sqlite_sequence", (db) => {
      db.prepare("UPDATE sqlite_sequence SET seq = seq + 100 WHERE name = 'repair_sequence_probe'").run();
    }],
    ["journal mode", (db) => {
      assert.equal(String(db.prepare("PRAGMA journal_mode = WAL").get().journal_mode).toLowerCase(), "wal");
    }],
  ];
  for (const [mutationLabel, mutate] of mutations) {
    for (const [phaseLabel, interruptedDurability] of phases) {
      await context.test(`${mutationLabel} after ${phaseLabel}`, (subContext) => {
        const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
        subContext.after(() => fixture.cleanup());
        writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
        writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
        assert.equal(dryRun(fixture).status, 0);
        assert.throws(() => directApply(fixture, { durability: interruptedDurability() }));
        assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);

        const changed = new DatabaseSync(fixture.databasePath);
        mutate(changed);
        changed.close();

        const retried = apply(fixture);
        assert.notEqual(retried.status, 0);
        assert.match(retried.stderr, /database.*(?:pre-state|post-state|fingerprint)|neither.*state/i);
        assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
        assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);
      });
    }
  }
});

test("recovery compounds inspection, rollback, and close failures while retaining its marker", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  assert.throws(() => directApply(fixture, { durability: crashAfterRename(1) }));
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);

  const openDatabase = (databasePath) => {
    const db = new DatabaseSync(databasePath);
    let rollbackFailed = false;
    return {
      close() {
        db.close();
        throw new Error("injected recovery close failure");
      },
      exec(sql) {
        if (String(sql).trim().toUpperCase() === "ROLLBACK" && !rollbackFailed) {
          rollbackFailed = true;
          db.exec(sql);
          throw new Error("injected recovery rollback failure");
        }
        return db.exec(sql);
      },
      prepare(sql) {
        if (/FROM\s+app_settings/i.test(String(sql)) && /branding_json/i.test(String(sql))) {
          throw new Error("injected recovery inspection failure");
        }
        return db.prepare(sql);
      },
    };
  };

  assert.throws(
    () => directApply(fixture, { openDatabase }),
    /inspection failure.*rollback failure.*close failure/i,
  );
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);
});

test("applied-marker recovery compounds verification and close failures without deleting pending state", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  const real = createCanonicalCutoverDurability();
  const interrupted = {
    ...real,
    removePath(entryPath, options) {
      if (entryPath === `${fixture.manifestPath}.applying`) {
        throw new Error("injected pending cleanup failure");
      }
      return real.removePath(entryPath, options);
    },
  };
  assert.throws(() => directApply(fixture, { durability: interrupted }), /pending cleanup failure/i);
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), true);

  const openDatabase = (databasePath) => {
    const db = new DatabaseSync(databasePath);
    return {
      close() {
        db.close();
        throw new Error("injected applied recovery close failure");
      },
      exec: db.exec.bind(db),
      prepare(sql) {
        if (/FROM\s+app_settings/i.test(String(sql)) && /branding_json/i.test(String(sql))) {
          throw new Error("injected applied recovery verification failure");
        }
        return db.prepare(sql);
      },
    };
  };

  assert.throws(
    () => directApply(fixture, { openDatabase }),
    /verification failure.*close failure/i,
  );
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), true);
});

test("retry completes final marker cleanup without replaying a committed repair", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  const real = createCanonicalCutoverDurability();
  let failed = false;
  const interrupted = {
    ...real,
    removePath(entryPath, options) {
      if (!failed && entryPath === `${fixture.manifestPath}.applying`) {
        failed = true;
        throw new Error("injected final marker cleanup failure");
      }
      return real.removePath(entryPath, options);
    },
  };

  assert.throws(() => directApply(fixture, { durability: interrupted }), /final marker cleanup failure/i);
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), true);
  const retried = apply(fixture);
  assert.equal(retried.status, 0, retried.stderr);
  assertFullyRepaired(fixture);
});

test("rollback and filesystem recovery failures are compounded and retained for retry", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);

  assert.throws(
    () => directApply(fixture, {
      durability: crashAfterRename(1),
      openDatabase: databaseWithRollbackFailure(),
    }),
    /injected crash.*rollback.*injected rollback reporting failure.*recovery.*filesystem unavailable/i,
  );
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);

  const retried = apply(fixture);
  assert.equal(retried.status, 0, retried.stderr);
  assertFullyRepaired(fixture);
});

test("a failed recovery rename retains its marker for another exact retry", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  assert.throws(() => directApply(fixture, { durability: crashAfterRename(1) }));
  const real = createCanonicalCutoverDurability();
  const unavailable = {
    ...real,
    renamePath() {
      throw new Error("injected recovery rename failure");
    },
  };

  assert.throws(() => directApply(fixture, { durability: unavailable }), /recovery rename failure/i);
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  const retried = apply(fixture);
  assert.equal(retried.status, 0, retried.stderr);
  assertFullyRepaired(fixture);
});

test("a post-commit backup removal failure retains recovery state for retry", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  const real = createCanonicalCutoverDurability();
  let failed = false;
  const interrupted = {
    ...real,
    removePath(entryPath, options) {
      if (!failed && path.basename(entryPath).includes(".relay-branding-repair-backup-")) {
        failed = true;
        throw new Error("injected backup removal failure");
      }
      return real.removePath(entryPath, options);
    },
  };

  assert.throws(() => directApply(fixture, { durability: interrupted }), /backup removal failure/i);
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);
  const retried = apply(fixture);
  assert.equal(retried.status, 0, retried.stderr);
  assertFullyRepaired(fixture);
});

test("a healthy closed WAL-mode production database can be repaired", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  const setup = new DatabaseSync(fixture.databasePath);
  assert.equal(String(setup.prepare("PRAGMA journal_mode = WAL").get().journal_mode).toLowerCase(), "wal");
  setup.close();

  assert.equal(dryRun(fixture).status, 0);
  const result = apply(fixture);
  assert.equal(result.status, 0, result.stderr);
  assertFullyRepaired(fixture);
  const verified = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal(String(verified.prepare("PRAGMA journal_mode").get().journal_mode).toLowerCase(), "wal");
  verified.close();
});

test("an active foreign WAL writer is refused before publication", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  const setup = new DatabaseSync(fixture.databasePath);
  setup.exec("PRAGMA journal_mode = WAL");
  setup.close();
  assert.equal(dryRun(fixture).status, 0);
  const foreign = new DatabaseSync(fixture.databasePath, { timeout: 0 });
  foreign.exec("BEGIN IMMEDIATE");
  foreign.prepare("UPDATE app_settings SET value = 'foreign' WHERE key = 'sentinel'").run();
  try {
    assert.throws(() => directApply(fixture), /busy|locked/i);
  } finally {
    foreign.exec("ROLLBACK");
    foreign.close();
  }
  assert.deepEqual(readBranding(fixture.databasePath), { logo: asset("logo", "png", "image/png") });
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), false);
});

test("a foreign idle WAL connection writing after COMMIT is detected before marker publication", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  const setup = new DatabaseSync(fixture.databasePath);
  setup.exec("PRAGMA journal_mode = WAL");
  setup.close();
  assert.equal(dryRun(fixture).status, 0);
  const foreign = new DatabaseSync(fixture.databasePath, { timeout: 0 });
  let driftInjected = false;
  const openDatabase = (databasePath) => {
    const db = new DatabaseSync(databasePath, { timeout: 0 });
    return {
      close: db.close.bind(db),
      exec(sql) {
        const result = db.exec(sql);
        if (String(sql).trim().toUpperCase() === "COMMIT" && !driftInjected) {
          foreign.prepare("UPDATE app_settings SET value = 'post-commit-drift' WHERE key = 'sentinel'").run();
          driftInjected = true;
        }
        return result;
      },
      prepare: db.prepare.bind(db),
    };
  };
  try {
    assert.throws(() => directApply(fixture, { openDatabase }), /post-state|fingerprint|database changed/i);
  } finally {
    foreign.close();
  }
  assert.equal(driftInjected, true);
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);
});

test("pending post-commit recovery holds its WAL write lock through marker publication and cleanup", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  const setup = new DatabaseSync(fixture.databasePath);
  assert.equal(String(setup.prepare("PRAGMA journal_mode = WAL").get().journal_mode).toLowerCase(), "wal");
  setup.close();
  assert.equal(dryRun(fixture).status, 0);
  assert.throws(
    () => directApply(fixture, { durability: crashAfterDatabaseCommit() }),
    /injected crash after database commit/i,
  );
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);

  const foreign = createForeignSentinelWriteProbe(fixture.databasePath);
  const real = createCanonicalCutoverDurability();
  const durability = {
    ...real,
    removePath(entryPath, options) {
      if (!foreign.attempted && path.basename(entryPath).includes(".relay-branding-repair-backup-")) {
        foreign.attempt("pending-recovery-drift");
      }
      return real.removePath(entryPath, options);
    },
  };

  try {
    const recovered = directApply(fixture, { durability });
    assert.equal(recovered.recovered, true);
  } finally {
    foreign.close();
  }
  assert.equal(foreign.attempted, true);
  assert.equal(foreign.blocked, true);
  assert.equal(readSentinel(fixture.databasePath), "original");
  assertFullyRepaired(fixture);
});

test("applied-marker recovery holds its WAL write lock through pending-marker cleanup", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  const setup = new DatabaseSync(fixture.databasePath);
  assert.equal(String(setup.prepare("PRAGMA journal_mode = WAL").get().journal_mode).toLowerCase(), "wal");
  setup.close();
  assert.equal(dryRun(fixture).status, 0);
  const real = createCanonicalCutoverDurability();
  const interrupted = {
    ...real,
    removePath(entryPath, options) {
      if (entryPath === `${fixture.manifestPath}.applying`) {
        throw new Error("injected pending cleanup failure");
      }
      return real.removePath(entryPath, options);
    },
  };
  assert.throws(() => directApply(fixture, { durability: interrupted }), /pending cleanup failure/i);
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), true);

  const foreign = createForeignSentinelWriteProbe(fixture.databasePath);
  const durability = {
    ...real,
    removePath(entryPath, options) {
      if (!foreign.attempted && entryPath === `${fixture.manifestPath}.applying`) {
        foreign.attempt("applied-recovery-drift");
      }
      return real.removePath(entryPath, options);
    },
  };

  try {
    const recovered = directApply(fixture, { durability });
    assert.equal(recovered.recovered, true);
  } finally {
    foreign.close();
  }
  assert.equal(foreign.attempted, true);
  assert.equal(foreign.blocked, true);
  assert.equal(readSentinel(fixture.databasePath), "original");
  assertFullyRepaired(fixture);
});

test("unrelated database drift immediately before BEGIN IMMEDIATE is refused under lock", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  let driftInjected = false;
  const openDatabase = (databasePath) => {
    const db = new DatabaseSync(databasePath);
    return {
      close: db.close.bind(db),
      exec(sql) {
        if (String(sql).trim().toUpperCase() === "BEGIN IMMEDIATE" && !driftInjected) {
          const concurrent = new DatabaseSync(databasePath);
          concurrent.prepare("UPDATE app_settings SET value = 'concurrent' WHERE key = 'sentinel'").run();
          concurrent.close();
          driftInjected = true;
        }
        return db.exec(sql);
      },
      prepare: db.prepare.bind(db),
    };
  };

  assert.throws(() => directApply(fixture, { openDatabase }), /database changed since dry-run/i);
  assert.equal(driftInjected, true);
  assert.deepEqual(readBranding(fixture.databasePath), { logo: asset("logo", "png", "image/png") });
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);
});

test("BEGIN IMMEDIATE holds database state while final live-directory drift is refused", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  let lockObserved = false;
  const openDatabase = (databasePath) => {
    const db = new DatabaseSync(databasePath);
    return {
      close: db.close.bind(db),
      exec(sql) {
        const result = db.exec(sql);
        if (String(sql).trim().toUpperCase() === "BEGIN IMMEDIATE") {
          const concurrent = new DatabaseSync(databasePath, { timeout: 0 });
          assert.equal(concurrent.prepare("SELECT value FROM app_settings WHERE key = 'sentinel'").get().value, "original");
          assert.throws(
            () => concurrent.prepare("UPDATE app_settings SET value = 'concurrent' WHERE key = 'sentinel'").run(),
            /busy|locked/i,
          );
          concurrent.close();
          writeFileSync(path.join(fixture.brandingRoot, "logo.png"), Buffer.concat([OLD_PNG_BYTES, Buffer.from("drift")]));
          lockObserved = true;
        }
        return result;
      },
      prepare: db.prepare.bind(db),
    };
  };

  assert.throws(
    () => directApply(fixture, { openDatabase }),
    /live branding.*changed|repair inputs changed/i,
  );
  assert.equal(lockObserved, true);
  assert.deepEqual(readBranding(fixture.databasePath), { logo: asset("logo", "png", "image/png") });
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);
});

test("live-directory drift after the prepared marker is revalidated before replacement", (context) => {
  const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
  context.after(() => fixture.cleanup());
  writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
  writeFileSync(path.join(fixture.brandingRoot, "logo.png"), OLD_PNG_BYTES);
  assert.equal(dryRun(fixture).status, 0);
  const driftedBytes = Buffer.concat([OLD_PNG_BYTES, Buffer.from("late drift")]);
  const real = createCanonicalCutoverDurability();
  let driftInjected = false;
  const durability = {
    ...real,
    writeMarker(markerPathValue, payload) {
      const result = real.writeMarker(markerPathValue, payload);
      if (!driftInjected && markerPathValue === `${fixture.manifestPath}.applying`) {
        writeFileSync(path.join(fixture.brandingRoot, "logo.png"), driftedBytes);
        driftInjected = true;
      }
      return result;
    },
  };

  assert.throws(() => directApply(fixture, { durability }), /live branding.*changed/i);
  assert.equal(driftInjected, true);
  assert.deepEqual(readFileSync(path.join(fixture.brandingRoot, "logo.png")), driftedBytes);
  assert.deepEqual(readBranding(fixture.databasePath), { logo: asset("logo", "png", "image/png") });
  assert.equal(existsSync(`${fixture.manifestPath}.applied`), false);
});
