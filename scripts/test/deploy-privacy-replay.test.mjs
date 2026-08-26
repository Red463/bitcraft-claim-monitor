import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  coordinatePrivacyDeletion,
  coordinatePublicPrivacyDeletion,
  deletionLedgerSubject,
  publicDeletionLedgerSubject,
} from "../../apps/bitcraft-local/src/server/privacyDeletionLedger.mjs";
import { applySchemaBootstrap } from "../../apps/bitcraft-local/src/server/schemaBootstrap.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const replayScript = path.join(repositoryRoot, "deploy", "replay-privacy-deletions.mjs");

function createFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "deploy-privacy-replay-"));
  const dataDir = path.join(root, "data");
  const backupDir = path.join(root, "backups");
  const configDir = path.join(root, "config");
  for (const directory of [dataDir, backupDir, configDir]) mkdirSync(directory);
  const databasePath = path.join(dataDir, "restore.sqlite");
  const ledgerPath = path.join(backupDir, "privacy-deletion-ledger.jsonl");
  const currentKeyPath = path.join(configDir, "privacy-ledger.key");
  const currentKey = Buffer.alloc(32, 41).toString("base64url");
  writeFileSync(currentKeyPath, `${currentKey}\n`);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, dataDir, backupDir, configDir, databasePath, ledgerPath, currentKeyPath, currentKey };
}

function openSchema(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  applySchemaBootstrap(db);
  return db;
}

function runReplay(fixture, environment = {}) {
  return spawnSync(process.execPath, [
    replayScript,
    fixture.databasePath,
    fixture.ledgerPath,
    fixture.currentKeyPath,
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATA_DIR: fixture.dataDir,
      BACKUP_DIR: fixture.backupDir,
      CONFIG_DIR: fixture.configDir,
      ...environment,
    },
  });
}

test("restore replay removes a resurrected public account and its plans without crossing into Timbersteel", (t) => {
  const fixture = createFixture(t);
  const discordId = "111111111111111111";
  const db = openSchema(fixture.databasePath);
  db.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, character_status, settings_json, created_at)
    VALUES (?, 'timbersteel-user', 'unlinked', '{}', '2026-01-01T00:00:00.000Z')
  `).run(discordId);
  const publicUserId = Number(db.prepare(`
    INSERT INTO public_user_accounts (discord_id, discord_username, settings_json, created_at)
    VALUES (?, 'public-user', '{}', '2026-01-01T00:00:00.000Z')
  `).run(discordId).lastInsertRowid);
  db.prepare(`
    INSERT INTO public_craft_plans (
      id, owner_user_id, claim_id, title, document_json, status,
      document_revision, access_revision, created_at, updated_at
    ) VALUES ('restored-plan', ?, '42', 'Restored plan', '{}', 'active', 1, 1,
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run(publicUserId);
  db.close();
  const occurredAt = new Date(Date.now() - 60_000);
  coordinatePublicPrivacyDeletion({
    ledgerPath: fixture.ledgerPath,
    key: fixture.currentKey,
    discordId,
    deleteAccount: () => ({ ok: true }),
    now: () => occurredAt,
    randomUUID: () => "public-restore-operation",
  });

  const replay = runReplay(fixture);

  assert.equal(replay.status, 0, replay.stderr);
  const summary = JSON.parse(replay.stdout);
  assert.deepEqual(summary.profiles, {
    timbersteel: { status: "ok", scanned: 1, deleted: 0 },
    public: { status: "ok", scanned: 1, deleted: 1 },
  });
  assert.doesNotMatch(replay.stdout + replay.stderr, new RegExp(discordId));
  assert.doesNotMatch(replay.stdout + replay.stderr, new RegExp(deletionLedgerSubject(discordId, fixture.currentKey)));
  assert.doesNotMatch(replay.stdout + replay.stderr, new RegExp(publicDeletionLedgerSubject(discordId, fixture.currentKey)));
  const restored = new DatabaseSync(fixture.databasePath);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM user_accounts").get().count, 1);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM public_user_accounts").get().count, 0);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM public_craft_plans").get().count, 0);
  restored.close();

  const repeated = runReplay(fixture);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual(JSON.parse(repeated.stdout).profiles, {
    timbersteel: { status: "ok", scanned: 1, deleted: 0 },
    public: { status: "ok", scanned: 0, deleted: 0 },
  });
});

test("a Timbersteel receipt for the same Discord ID cannot delete the public profile", (t) => {
  const fixture = createFixture(t);
  const discordId = "777777777777777777";
  const db = openSchema(fixture.databasePath);
  db.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, character_status, settings_json, created_at)
    VALUES (?, 'restored-timbersteel', 'unlinked', '{}', '2026-01-01T00:00:00.000Z')
  `).run(discordId);
  db.prepare(`
    INSERT INTO public_user_accounts (discord_id, discord_username, settings_json, created_at)
    VALUES (?, 'public-must-remain', '{}', '2026-01-01T00:00:00.000Z')
  `).run(discordId);
  db.close();
  const occurredAt = new Date(Date.now() - 60_000);
  coordinatePrivacyDeletion({
    ledgerPath: fixture.ledgerPath,
    key: fixture.currentKey,
    discordId,
    deleteAccount: () => ({ ok: true }),
    now: () => occurredAt,
    randomUUID: () => "timbersteel-only-operation",
  });

  const replay = runReplay(fixture);

  assert.equal(replay.status, 0, replay.stderr);
  assert.deepEqual(JSON.parse(replay.stdout).profiles, {
    timbersteel: { status: "ok", scanned: 1, deleted: 1 },
    public: { status: "ok", scanned: 1, deleted: 0 },
  });
  const restored = new DatabaseSync(fixture.databasePath);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM user_accounts").get().count, 0);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM public_user_accounts").get().count, 1);
  restored.close();
});

test("restore replay verifies current and configured previous keys for both profiles", (t) => {
  const fixture = createFixture(t);
  const previousKey = Buffer.alloc(32, 57).toString("base64url");
  const previousKeyPath = path.join(fixture.configDir, "privacy-ledger.previous.key");
  writeFileSync(previousKeyPath, `${previousKey}\n`);
  const timbersteelDiscordId = "222222222222222222";
  const publicDiscordId = "333333333333333333";
  const db = openSchema(fixture.databasePath);
  db.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, character_status, settings_json, created_at)
    VALUES (?, 'restored-timbersteel', 'unlinked', '{}', '2026-01-01T00:00:00.000Z')
  `).run(timbersteelDiscordId);
  db.prepare(`
    INSERT INTO public_user_accounts (discord_id, discord_username, settings_json, created_at)
    VALUES (?, 'restored-public', '{}', '2026-01-01T00:00:00.000Z')
  `).run(publicDiscordId);
  db.close();
  const occurredAt = new Date(Date.now() - 60_000);
  coordinatePrivacyDeletion({
    ledgerPath: fixture.ledgerPath,
    key: fixture.currentKey,
    discordId: timbersteelDiscordId,
    deleteAccount: () => ({ ok: true }),
    now: () => occurredAt,
    randomUUID: () => "current-key-operation",
  });
  coordinatePublicPrivacyDeletion({
    ledgerPath: fixture.ledgerPath,
    key: previousKey,
    discordId: publicDiscordId,
    deleteAccount: () => ({ ok: true }),
    now: () => occurredAt,
    randomUUID: () => "previous-key-operation",
  });

  const replay = runReplay(fixture, {
    PRIVACY_LEDGER_PREVIOUS_KEY_FILES: previousKeyPath,
  });

  assert.equal(replay.status, 0, replay.stderr);
  const summary = JSON.parse(replay.stdout);
  assert.equal(summary.recordsVerified, 4);
  assert.equal(summary.verificationKeys, 2);
  assert.equal(summary.profiles.timbersteel.deleted, 1);
  assert.equal(summary.profiles.public.deleted, 1);
  for (const secretOrIdentifier of [
    fixture.currentKey,
    previousKey,
    timbersteelDiscordId,
    publicDiscordId,
    deletionLedgerSubject(timbersteelDiscordId, fixture.currentKey),
    publicDeletionLedgerSubject(publicDiscordId, previousKey),
  ]) assert.doesNotMatch(replay.stdout + replay.stderr, new RegExp(secretOrIdentifier));
  const restored = new DatabaseSync(fixture.databasePath);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM user_accounts").get().count, 0);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM public_user_accounts").get().count, 0);
  restored.close();
});

test("a public replay failure rolls back both profiles without exposing ledger subjects", (t) => {
  const fixture = createFixture(t);
  const discordId = "444444444444444444";
  const db = openSchema(fixture.databasePath);
  db.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, character_status, settings_json, created_at)
    VALUES (?, 'restored-timbersteel', 'unlinked', '{}', '2026-01-01T00:00:00.000Z')
  `).run(discordId);
  db.prepare(`
    INSERT INTO public_user_accounts (discord_id, discord_username, settings_json, created_at)
    VALUES (?, 'restored-public', '{}', '2026-01-01T00:00:00.000Z')
  `).run(discordId);
  db.exec(`
    CREATE TRIGGER reject_public_replay
    BEFORE DELETE ON public_user_accounts
    BEGIN
      SELECT RAISE(ABORT, 'forced public replay failure');
    END
  `);
  db.close();
  const occurredAt = new Date(Date.now() - 60_000);
  coordinatePrivacyDeletion({
    ledgerPath: fixture.ledgerPath,
    key: fixture.currentKey,
    discordId,
    deleteAccount: () => ({ ok: true }),
    now: () => occurredAt,
    randomUUID: () => "timbersteel-rollback-operation",
  });
  coordinatePublicPrivacyDeletion({
    ledgerPath: fixture.ledgerPath,
    key: fixture.currentKey,
    discordId,
    deleteAccount: () => ({ ok: true }),
    now: () => occurredAt,
    randomUUID: () => "public-rollback-operation",
  });

  const replay = runReplay(fixture);

  assert.equal(replay.status, 1);
  for (const secretOrIdentifier of [
    fixture.currentKey,
    discordId,
    deletionLedgerSubject(discordId, fixture.currentKey),
    publicDeletionLedgerSubject(discordId, fixture.currentKey),
  ]) assert.doesNotMatch(replay.stdout + replay.stderr, new RegExp(secretOrIdentifier));
  assert.doesNotMatch(replay.stderr, /forced public replay failure/);
  assert.match(replay.stderr, /replay failed|database was unchanged/i);
  const restored = new DatabaseSync(fixture.databasePath);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM user_accounts").get().count, 1);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM public_user_accounts").get().count, 1);
  restored.close();
});

test("restore replay fails closed when previous-key configuration duplicates the current key", (t) => {
  const fixture = createFixture(t);
  const duplicateKeyPath = path.join(fixture.configDir, "duplicate-current.key");
  writeFileSync(duplicateKeyPath, `${fixture.currentKey}\n`);
  writeFileSync(fixture.ledgerPath, "");
  const db = openSchema(fixture.databasePath);
  db.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, character_status, settings_json, created_at)
    VALUES ('555555555555555555', 'unchanged', 'unlinked', '{}', '2026-01-01T00:00:00.000Z')
  `).run();
  db.close();

  const replay = runReplay(fixture, {
    PRIVACY_LEDGER_PREVIOUS_KEY_FILES: duplicateKeyPath,
  });

  assert.equal(replay.status, 1);
  assert.match(replay.stderr, /key configuration|duplicate/i);
  assert.doesNotMatch(replay.stdout + replay.stderr, new RegExp(fixture.currentKey));
  const restored = new DatabaseSync(fixture.databasePath);
  assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM user_accounts").get().count, 1);
  restored.close();

  writeFileSync(duplicateKeyPath, "not-a-32-byte-key\n");
  const malformed = runReplay(fixture, {
    PRIVACY_LEDGER_PREVIOUS_KEY_FILES: duplicateKeyPath,
  });
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /key configuration|32-byte|base64url/i);
  assert.doesNotMatch(malformed.stdout + malformed.stderr, /not-a-32-byte-key/);
});

test("restore replay preserves pre-additive Timbersteel backup compatibility", (t) => {
  const fixture = createFixture(t);
  writeFileSync(fixture.ledgerPath, "");
  const db = new DatabaseSync(fixture.databasePath);
  db.exec(`
    CREATE TABLE user_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL UNIQUE
    );
    INSERT INTO user_accounts (discord_id) VALUES ('666666666666666666');
  `);
  db.close();

  const replay = runReplay(fixture);

  assert.equal(replay.status, 0, replay.stderr);
  assert.deepEqual(JSON.parse(replay.stdout).profiles, {
    timbersteel: { status: "ok", scanned: 1, deleted: 0 },
    public: { status: "not-present", scanned: 0, deleted: 0 },
  });
});
