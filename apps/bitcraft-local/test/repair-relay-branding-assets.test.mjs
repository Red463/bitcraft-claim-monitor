import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
  const real = createCanonicalCutoverDurability();
  const interrupted = {
    ...real,
    writeMarker(markerPath, payload) {
      if (payload.phase === "database-committed") {
        throw new Error("injected crash after database commit");
      }
      return real.writeMarker(markerPath, payload);
    },
  };

  assert.throws(() => directApply(fixture, { durability: interrupted }), /injected crash after database commit/i);
  assert.equal(existsSync(`${fixture.manifestPath}.applying`), true);
  const retried = apply(fixture);
  assert.equal(retried.status, 0, retried.stderr);
  assertFullyRepaired(fixture);
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

test("apply fails closed on SQLite journal, WAL, and SHM files observed under lock", async (context) => {
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    await context.test(suffix, (subContext) => {
      const fixture = createFixture({ logo: asset("logo", "png", "image/png") });
      subContext.after(() => fixture.cleanup());
      writeFileSync(path.join(fixture.archiveRoot, "logo.png"), PNG_BYTES);
      assert.equal(dryRun(fixture).status, 0);
      const openDatabase = (databasePath) => {
        const db = new DatabaseSync(databasePath);
        return {
          close: db.close.bind(db),
          exec(sql) {
            const result = db.exec(sql);
            if (String(sql).trim().toUpperCase() === "BEGIN IMMEDIATE") {
              writeFileSync(`${databasePath}${suffix}`, "injected sidecar");
            }
            return result;
          },
          prepare: db.prepare.bind(db),
        };
      };

      assert.throws(() => directApply(fixture, { openDatabase }), /offline and checkpointed/i);
      rmSync(`${fixture.databasePath}${suffix}`, { force: true });
      assert.deepEqual(readBranding(fixture.databasePath), { logo: asset("logo", "png", "image/png") });
      assert.equal(existsSync(`${fixture.manifestPath}.applying`), false);
    });
  }
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
