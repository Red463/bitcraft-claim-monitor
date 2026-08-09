import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as filesystem from "node:fs";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import * as cutoverPrivacy from "../src/server/canonicalCutoverPrivacy.mjs";
import * as privacyLedger from "../src/server/privacyDeletionLedger.mjs";

const OLD_KEY = Buffer.alloc(32, 31).toString("base64url");
const CURRENT_KEY = Buffer.alloc(32, 47).toString("base64url");
const PREVIOUS_TARGET_KEY = Buffer.alloc(32, 59).toString("base64url");
const CREATED_AT = "2026-08-09T12:00:00.000Z";

function signedRecord(key, overrides = {}) {
  return privacyLedger.signDeletionLedgerRecord({
    version: 1,
    operationId: "operation-old",
    state: "committed",
    subject: privacyLedger.deletionLedgerSubject("111111111111111111", key),
    occurredAt: "2026-08-08T12:00:00.000Z",
    expiresAt: "2026-11-06T12:00:00.000Z",
    ...overrides,
  }, key);
}

test("two-key merge retains unexpired records in canonical order with a deterministic hash", () => {
  const oldRecord = signedRecord(OLD_KEY);
  const currentRecord = signedRecord(CURRENT_KEY, {
    operationId: "operation-current",
    occurredAt: "2026-08-07T12:00:00.000Z",
    expiresAt: "2026-11-05T12:00:00.000Z",
  });

  const result = privacyLedger.mergeDeletionLedgerRecords?.({
    sourceRecords: [oldRecord],
    targetRecords: [currentRecord],
    sourceKey: OLD_KEY,
    targetKey: CURRENT_KEY,
    manifestCreatedAt: CREATED_AT,
  });

  assert.deepEqual(result?.records.map((record) => record.operationId), ["operation-current", "operation-old"]);
  assert.equal(result?.counts.source, 1);
  assert.equal(result?.counts.target, 1);
  assert.equal(result?.counts.retained, 2);
  assert.equal(result?.counts.expired, 0);
  assert.equal(result?.counts.duplicates, 0);
  assert.equal(result?.previousKeyRetireAfter, "2026-11-06T12:00:00.000Z");
  assert.equal(result?.fileSha256, createHash("sha256").update(result.content).digest("hex"));
  assert.equal(result?.content, `${JSON.stringify(currentRecord)}\n${JSON.stringify(oldRecord)}\n`);
});

test("ledger verification rejects invalid signatures, keys, versions, timestamps, and retention", () => {
  const valid = signedRecord(OLD_KEY);
  const invalidRecords = [
    { ...valid, signature: `${valid.signature.slice(0, -1)}x` },
    { ...valid, keyId: "0000000000000000" },
    privacyLedger.signDeletionLedgerRecord({ ...valid, version: 2, signature: undefined }, OLD_KEY),
    privacyLedger.signDeletionLedgerRecord({ ...valid, occurredAt: "not-a-time", signature: undefined }, OLD_KEY),
    privacyLedger.signDeletionLedgerRecord({
      ...valid,
      occurredAt: "2026-08-08T12:00:00.000Z",
      expiresAt: "2026-11-07T12:00:00.001Z",
      signature: undefined,
    }, OLD_KEY),
  ];

  for (const record of invalidRecords) {
    assert.throws(() => privacyLedger.mergeDeletionLedgerRecords({
      sourceRecords: [record],
      targetRecords: [],
      sourceKey: OLD_KEY,
      targetKey: CURRENT_KEY,
      manifestCreatedAt: CREATED_AT,
    }), /verification failed|invalid|retention/i);
  }
});

test("one invalid JSON line rejects the complete ledger", () => {
  const valid = signedRecord(OLD_KEY);
  const parse = privacyLedger.parseDeletionLedgerContent ?? (() => []);

  assert.throws(
    () => parse(`${JSON.stringify(valid)}\n{not-json}\n`, [OLD_KEY], "Source"),
    /source.*invalid json/i,
  );
  assert.throws(
    () => parse(`${JSON.stringify(valid)}\n\n${JSON.stringify(valid)}\n`, [OLD_KEY], "Source"),
    /source.*invalid json/i,
  );
});

test("exact duplicate identities deduplicate while conflicting signed content fails closed", () => {
  const record = signedRecord(OLD_KEY);
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  const deduplicated = privacyLedger.mergeDeletionLedgerRecords({
    sourceRecords: [record, reordered],
    targetRecords: [],
    sourceKey: OLD_KEY,
    targetKey: CURRENT_KEY,
    manifestCreatedAt: CREATED_AT,
  });

  assert.equal(deduplicated.records.length, 1);
  assert.equal(deduplicated.counts.duplicates, 1);

  const conflict = signedRecord(OLD_KEY, {
    subject: privacyLedger.deletionLedgerSubject("999999999999999999", OLD_KEY),
  });
  assert.throws(() => privacyLedger.mergeDeletionLedgerRecords({
    sourceRecords: [record, conflict],
    targetRecords: [],
    sourceKey: OLD_KEY,
    targetKey: CURRENT_KEY,
    manifestCreatedAt: CREATED_AT,
  }), /conflicting duplicate/i);
});

test("expiry is evaluated at manifest creation without extending old-key retirement", () => {
  const expired = signedRecord(OLD_KEY, {
    operationId: "expired-at-boundary",
    occurredAt: "2026-05-11T12:00:00.000Z",
    expiresAt: CREATED_AT,
  });
  const earlier = signedRecord(OLD_KEY, {
    operationId: "earlier-retirement",
    occurredAt: "2026-08-01T12:00:00.000Z",
    expiresAt: "2026-10-30T12:00:00.000Z",
  });
  const latest = signedRecord(OLD_KEY, {
    operationId: "latest-retirement",
    occurredAt: "2026-08-02T12:00:00.000Z",
    expiresAt: "2026-10-31T12:00:00.000Z",
  });

  const result = privacyLedger.mergeDeletionLedgerRecords({
    sourceRecords: [expired, latest, earlier],
    targetRecords: [],
    sourceKey: OLD_KEY,
    targetKey: CURRENT_KEY,
    manifestCreatedAt: CREATED_AT,
  });

  assert.deepEqual(result.records.map((record) => record.operationId), ["earlier-retirement", "latest-retirement"]);
  assert.equal(result.counts.expired, 1);
  assert.equal(result.previousKeyRetireAfter, "2026-10-31T12:00:00.000Z");

  const future = signedRecord(OLD_KEY, {
    operationId: "future-record",
    occurredAt: "2026-08-10T12:00:00.000Z",
    expiresAt: "2026-11-08T12:00:00.000Z",
  });
  assert.throws(() => privacyLedger.mergeDeletionLedgerRecords({
    sourceRecords: [future],
    targetRecords: [],
    sourceKey: OLD_KEY,
    targetKey: CURRENT_KEY,
    manifestCreatedAt: CREATED_AT,
  }), /after manifest creation/i);
});

test("replay keeps same operation IDs isolated by signing key", () => {
  const oldCommitted = signedRecord(OLD_KEY, { operationId: "shared-operation" });
  const currentAborted = signedRecord(CURRENT_KEY, {
    operationId: "shared-operation",
    state: "aborted",
    occurredAt: "2026-08-08T13:00:00.000Z",
  });
  const merged = privacyLedger.mergeDeletionLedgerRecords({
    sourceRecords: [oldCommitted],
    targetRecords: [currentAborted],
    sourceKey: OLD_KEY,
    targetKey: CURRENT_KEY,
    manifestCreatedAt: CREATED_AT,
  });
  const deleted = [];

  const result = privacyLedger.replayPrivacyDeletions({
    records: merged.records,
    accounts: [{ id: 1, discordId: "111111111111111111" }],
    key: CURRENT_KEY,
    keys: [CURRENT_KEY, OLD_KEY],
    deleteAccount: (account) => deleted.push(account.id),
    now: new Date(CREATED_AT),
  });

  assert.deepEqual(result, { deleted: 1 });
  assert.deepEqual(deleted, [1]);
});

function privacyPaths() {
  const directory = mkdtempSync(path.join(tmpdir(), "canonical-privacy-"));
  const sourceConfigRoot = path.join(directory, "old-config");
  const targetConfigRoot = path.join(directory, "current-config");
  const sourceBackupRoot = path.join(directory, "old-backups");
  const targetBackupRoot = path.join(directory, "current-backups");
  for (const root of [sourceConfigRoot, targetConfigRoot, sourceBackupRoot, targetBackupRoot]) mkdirSync(root);
  const sourceKeyFilePath = path.join(sourceConfigRoot, "privacy.key");
  const targetKeyFilePath = path.join(targetConfigRoot, "privacy.key");
  const sourceLedgerPath = path.join(sourceBackupRoot, "privacy.jsonl");
  const targetLedgerPath = path.join(targetBackupRoot, "privacy.jsonl");
  writeFileSync(sourceKeyFilePath, `${OLD_KEY}\n`, { mode: 0o600 });
  writeFileSync(targetKeyFilePath, `${CURRENT_KEY}\n`, { mode: 0o600 });
  writeFileSync(targetLedgerPath, "", { mode: 0o600 });
  return {
    directory,
    sourceConfigRoot,
    targetConfigRoot,
    sourceBackupRoot,
    targetBackupRoot,
    sourceKeyFilePath,
    targetKeyFilePath,
    sourceLedgerPath,
    targetLedgerPath,
    manifestCreatedAt: CREATED_AT,
  };
}

test("privacy cutover accepts a missing ledger only with valid explicit roots and keys", () => {
  const paths = privacyPaths();
  const createPlan = cutoverPrivacy.createCanonicalCutoverPrivacyPlan ?? (() => undefined);
  const plan = createPlan(paths);

  assert.equal(plan?.source.ledger.exists, false);
  assert.equal(plan?.source.ledger.recordCount, 0);
  assert.equal(plan?.target.ledger.exists, true);
  assert.equal(plan?.merged.recordCount, 0);
  assert.equal(plan?.source.key.keyId, privacyLedger.deletionLedgerKeyId(OLD_KEY));
  assert.equal(plan?.target.key.keyId, privacyLedger.deletionLedgerKeyId(CURRENT_KEY));

  const missingKey = privacyPaths();
  assert.throws(() => createPlan({ ...missingKey, sourceKeyFilePath: path.join(missingKey.sourceConfigRoot, "missing.key") }), /source key.*does not exist/i);

  const outside = privacyPaths();
  assert.throws(() => createPlan({ ...outside, sourceLedgerPath: path.join(outside.directory, "outside.jsonl") }), /source ledger.*outside/i);
});

test("privacy cutover plan exposes only redacted deterministic merge metadata", () => {
  const paths = privacyPaths();
  const previousKeyFilePath = path.join(paths.targetConfigRoot, "previous.key");
  const oldRecord = signedRecord(OLD_KEY);
  const currentRecord = signedRecord(CURRENT_KEY, { operationId: "operation-current" });
  const previousRecord = signedRecord(PREVIOUS_TARGET_KEY, { operationId: "operation-previous" });
  writeFileSync(previousKeyFilePath, `${PREVIOUS_TARGET_KEY}\n`, { mode: 0o600 });
  writeFileSync(paths.sourceLedgerPath, `${JSON.stringify(oldRecord)}\n`, { mode: 0o600 });
  writeFileSync(paths.targetLedgerPath, `${JSON.stringify(currentRecord)}\n${JSON.stringify(previousRecord)}\n`, { mode: 0o600 });

  const plan = cutoverPrivacy.createCanonicalCutoverPrivacyPlan({
    ...paths,
    targetPreviousKeyFilePaths: [previousKeyFilePath],
  });

  assert.equal(plan.source.key.keyId, privacyLedger.deletionLedgerKeyId(OLD_KEY));
  assert.equal(plan.target.key.keyId, privacyLedger.deletionLedgerKeyId(CURRENT_KEY));
  assert.deepEqual(plan.merged.counts, {
    source: 1,
    target: 2,
    retained: 3,
    retainedSource: 1,
    retainedTarget: 2,
    expired: 0,
    expiredSource: 0,
    expiredTarget: 0,
    duplicates: 0,
  });
  assert.deepEqual(plan.previousKeyConfiguration, {
    environmentVariable: "PRIVACY_LEDGER_PREVIOUS_KEY_FILES",
    filePaths: [previousKeyFilePath, paths.sourceKeyFilePath],
    value: `${previousKeyFilePath},${paths.sourceKeyFilePath}`,
    retireAfter: oldRecord.expiresAt,
  });
  const publicJson = JSON.stringify(plan);
  for (const forbidden of [OLD_KEY, CURRENT_KEY, PREVIOUS_TARGET_KEY, oldRecord.subject, currentRecord.subject, previousRecord.subject, "111111111111111111"]) {
    assert.doesNotMatch(publicJson, new RegExp(forbidden));
  }
});

test("privacy cutover verification refuses ledger and key drift after manifest creation", () => {
  const ledgerDrift = privacyPaths();
  writeFileSync(ledgerDrift.sourceLedgerPath, `${JSON.stringify(signedRecord(OLD_KEY))}\n`, { mode: 0o600 });
  const ledgerPlan = cutoverPrivacy.createCanonicalCutoverPrivacyPlan(ledgerDrift);
  writeFileSync(ledgerDrift.sourceLedgerPath, "\n", { flag: "a" });
  assert.throws(
    () => cutoverPrivacy.verifyCanonicalCutoverPrivacyPlan?.(ledgerPlan),
    /privacy cutover inputs changed/i,
  );

  const keyDrift = privacyPaths();
  const keyPlan = cutoverPrivacy.createCanonicalCutoverPrivacyPlan(keyDrift);
  writeFileSync(keyDrift.sourceKeyFilePath, `${Buffer.alloc(32, 71).toString("base64url")}\n`, { mode: 0o600 });
  assert.throws(
    () => cutoverPrivacy.verifyCanonicalCutoverPrivacyPlan?.(keyPlan),
    /privacy cutover inputs changed/i,
  );
});

test("privacy apply rechecks drift immediately before atomic replacement", () => {
  const paths = privacyPaths();
  const sourceRecord = signedRecord(OLD_KEY);
  const targetRecord = signedRecord(CURRENT_KEY, { operationId: "target-record" });
  const originalTarget = `${JSON.stringify(targetRecord)}\n`;
  writeFileSync(paths.sourceLedgerPath, `${JSON.stringify(sourceRecord)}\n`, { mode: 0o600 });
  writeFileSync(paths.targetLedgerPath, originalTarget, { mode: 0o600 });
  const plan = cutoverPrivacy.createCanonicalCutoverPrivacyPlan(paths);
  const prepared = cutoverPrivacy.prepareCanonicalCutoverPrivacyApply(plan);
  writeFileSync(paths.sourceLedgerPath, "\n", { flag: "a" });

  assert.throws(() => prepared.installLedger(), /privacy cutover inputs changed/i);
  assert.equal(readFileSync(paths.targetLedgerPath, "utf8"), originalTarget);
});

test("privacy cutover rejects symlinked key paths", (context) => {
  const createPlan = cutoverPrivacy.createCanonicalCutoverPrivacyPlan;
  const linked = privacyPaths();
  const symlinkPath = path.join(linked.sourceConfigRoot, "linked.key");
  try {
    symlinkSync(linked.sourceKeyFilePath, symlinkPath, "file");
  } catch (error) {
    if (error?.code === "EPERM") {
      context.skip("Windows symlink creation is not permitted in this environment");
      return;
    }
    throw error;
  }
  assert.throws(() => createPlan({ ...linked, sourceKeyFilePath: symlinkPath }), /source key.*symlink/i);
});

test("atomic ledger replacement failure leaves the original ledger intact", () => {
  const paths = privacyPaths();
  const currentRecord = signedRecord(CURRENT_KEY, { operationId: "current-record" });
  const oldRecord = signedRecord(OLD_KEY, { operationId: "old-record" });
  const original = `${JSON.stringify(currentRecord)}\n`;
  writeFileSync(paths.targetLedgerPath, original, { mode: 0o600 });
  const merged = privacyLedger.mergeDeletionLedgerRecords({
    sourceRecords: [oldRecord],
    targetRecords: [currentRecord],
    sourceKey: OLD_KEY,
    targetKey: CURRENT_KEY,
    manifestCreatedAt: CREATED_AT,
  });

  const replace = privacyLedger.replaceDeletionLedgerAtomically ?? (() => undefined);
  assert.throws(() => replace({
    ledgerPath: paths.targetLedgerPath,
    content: merged.content,
    verificationKeys: [CURRENT_KEY, OLD_KEY],
  }, {
    filesystem: {
      ...filesystem,
      renameSync() {
        throw new Error("injected rename failure");
      },
    },
    processId: 73001,
  }), /injected rename failure/);

  assert.equal(readFileSync(paths.targetLedgerPath, "utf8"), original);
  assert.deepEqual(readdirSync(paths.targetBackupRoot), [path.basename(paths.targetLedgerPath)]);
});

test("atomic ledger replacement is durable and readable with current plus previous keys", () => {
  const paths = privacyPaths();
  const currentRecord = signedRecord(CURRENT_KEY, { operationId: "current-record" });
  const oldRecord = signedRecord(OLD_KEY, { operationId: "old-record" });
  const merged = privacyLedger.mergeDeletionLedgerRecords({
    sourceRecords: [oldRecord],
    targetRecords: [currentRecord],
    sourceKey: OLD_KEY,
    targetKey: CURRENT_KEY,
    manifestCreatedAt: CREATED_AT,
  });

  const result = privacyLedger.replaceDeletionLedgerAtomically({
    ledgerPath: paths.targetLedgerPath,
    content: merged.content,
    verificationKeys: [CURRENT_KEY, OLD_KEY],
  });

  assert.equal(result.fileSha256, merged.fileSha256);
  assert.deepEqual(
    privacyLedger.readDeletionLedger(paths.targetLedgerPath, [CURRENT_KEY, OLD_KEY]).map((record) => record.operationId),
    ["current-record", "old-record"],
  );
  if (process.platform !== "win32") assert.equal(filesystem.statSync(paths.targetLedgerPath).mode & 0o777, 0o600);
});
