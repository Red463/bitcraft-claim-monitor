import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import {
  deletionLedgerKeyId,
  mergeDeletionLedgerRecords,
  parseDeletionLedgerContent,
  replaceDeletionLedgerAtomically,
  replayPrivacyDeletions,
} from "./privacyDeletionLedger.mjs";
import { deleteUserAccount } from "./accountDeletion.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizePath(left) === normalizePath(right);
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(normalizePath(root), normalizePath(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function approvedRoot(rootPath, label) {
  const resolved = path.resolve(String(rootPath ?? ""));
  if (!existsSync(resolved)) throw new Error(`${label} does not exist`);
  if (lstatSync(resolved).isSymbolicLink() || !samePath(realpathSync.native(resolved), resolved)) {
    throw new Error(`${label} must not be or traverse a symlink`);
  }
  if (!statSync(resolved).isDirectory()) throw new Error(`${label} must be a directory`);
  return resolved;
}

function approvedFile(filePath, rootPath, label, { allowMissing = false } = {}) {
  const root = approvedRoot(rootPath, `${label} approved root`);
  const resolved = path.resolve(String(filePath ?? ""));
  if (!pathIsWithin(root, resolved)) throw new Error(`${label} is outside its caller-approved root`);
  if (!existsSync(resolved)) {
    if (!allowMissing) throw new Error(`${label} does not exist`);
    const parent = approvedRoot(path.dirname(resolved), `${label} parent directory`);
    if (!pathIsWithin(root, parent) || !samePath(path.join(parent, path.basename(resolved)), resolved)) {
      throw new Error(`${label} must not traverse a symlink`);
    }
    return { exists: false, path: resolved };
  }
  if (lstatSync(resolved).isSymbolicLink() || !samePath(realpathSync.native(resolved), resolved)) {
    throw new Error(`${label} must not be or traverse a symlink`);
  }
  if (!statSync(resolved).isFile()) throw new Error(`${label} must be a regular file`);
  return { exists: true, path: resolved };
}

function inspectKey(filePath, rootPath, label) {
  const file = approvedFile(filePath, rootPath, label);
  const bytes = readFileSync(file.path);
  const key = bytes.toString("utf8").trim();
  if (!key) throw new Error(`${label} is empty`);
  return {
    key,
    description: {
      path: file.path,
      fileSha256: sha256(bytes),
      keyId: deletionLedgerKeyId(key),
    },
  };
}

function inspectLedger(filePath, rootPath, keys, label) {
  const file = approvedFile(filePath, rootPath, label, { allowMissing: true });
  if (!file.exists) return { records: [], description: { path: file.path, exists: false, fileSha256: null, recordCount: 0 } };
  const bytes = readFileSync(file.path);
  const records = parseDeletionLedgerContent(bytes.toString("utf8"), keys, label);
  return {
    records,
    description: {
      path: file.path,
      exists: true,
      fileSha256: sha256(bytes),
      recordCount: records.length,
    },
  };
}

function materializeCanonicalCutoverPrivacy(input) {
  const sourceKey = inspectKey(input.sourceKeyFilePath, input.sourceConfigRoot, "Source key");
  const targetKey = inspectKey(input.targetKeyFilePath, input.targetConfigRoot, "Target key");
  if (samePath(sourceKey.description.path, targetKey.description.path)
    || sourceKey.description.keyId === targetKey.description.keyId) {
    throw new Error("Source and target privacy ledger keys must be distinct");
  }
  const targetPreviousKeys = (input.targetPreviousKeyFilePaths ?? []).map((keyPath, index) => (
    inspectKey(keyPath, input.targetConfigRoot, `Target previous key ${index + 1}`)
  ));
  const sourceLedger = inspectLedger(input.sourceLedgerPath, input.sourceBackupRoot, [sourceKey.key], "Source ledger");
  const targetLedger = inspectLedger(
    input.targetLedgerPath,
    input.targetBackupRoot,
    [targetKey.key, ...targetPreviousKeys.map((entry) => entry.key)],
    "Target ledger",
  );
  if (samePath(sourceLedger.description.path, targetLedger.description.path)) {
    throw new Error("Source and target privacy ledger paths must be distinct");
  }
  const merged = mergeDeletionLedgerRecords({
    sourceRecords: sourceLedger.records,
    targetRecords: targetLedger.records,
    sourceKey: sourceKey.key,
    targetKey: targetKey.key,
    targetPreviousKeys: targetPreviousKeys.map((entry) => entry.key),
    manifestCreatedAt: input.manifestCreatedAt,
  });
  const previousKeyFilePaths = targetPreviousKeys.map((entry) => entry.description.path);
  if (merged.previousKeyRetireAfter
    && !targetPreviousKeys.some((entry) => entry.description.keyId === sourceKey.description.keyId)) {
    previousKeyFilePaths.push(sourceKey.description.path);
  }
  const plan = {
    manifestCreatedAt: input.manifestCreatedAt,
    source: {
      approvedConfigRoot: path.resolve(input.sourceConfigRoot),
      approvedBackupRoot: path.resolve(input.sourceBackupRoot),
      key: sourceKey.description,
      ledger: sourceLedger.description,
    },
    target: {
      approvedConfigRoot: path.resolve(input.targetConfigRoot),
      approvedBackupRoot: path.resolve(input.targetBackupRoot),
      key: targetKey.description,
      previousKeys: targetPreviousKeys.map((entry) => entry.description),
      ledger: targetLedger.description,
    },
    merged: {
      fileSha256: merged.fileSha256,
      recordCount: merged.records.length,
      counts: merged.counts,
      previousKeyRetireAfter: merged.previousKeyRetireAfter,
    },
    previousKeyConfiguration: {
      environmentVariable: "PRIVACY_LEDGER_PREVIOUS_KEY_FILES",
      filePaths: previousKeyFilePaths,
      value: previousKeyFilePaths.join(","),
      retireAfter: merged.previousKeyRetireAfter,
    },
  };
  return { merged, plan, sourceKey, targetKey, targetPreviousKeys };
}

export function createCanonicalCutoverPrivacyPlan(input) {
  return materializeCanonicalCutoverPrivacy(input).plan;
}

export function canonicalCutoverPrivacyInputFromPlan(plan) {
  return {
    manifestCreatedAt: plan.manifestCreatedAt,
    sourceConfigRoot: plan.source.approvedConfigRoot,
    sourceBackupRoot: plan.source.approvedBackupRoot,
    sourceKeyFilePath: plan.source.key.path,
    sourceLedgerPath: plan.source.ledger.path,
    targetConfigRoot: plan.target.approvedConfigRoot,
    targetBackupRoot: plan.target.approvedBackupRoot,
    targetKeyFilePath: plan.target.key.path,
    targetPreviousKeyFilePaths: plan.target.previousKeys.map((entry) => entry.path),
    targetLedgerPath: plan.target.ledger.path,
  };
}

export function verifyCanonicalCutoverPrivacyPlan(plan) {
  try {
    const current = createCanonicalCutoverPrivacyPlan(canonicalCutoverPrivacyInputFromPlan(plan));
    if (JSON.stringify(current) !== JSON.stringify(plan)) throw new Error("manifest mismatch");
    return current;
  } catch (error) {
    throw new Error(`Privacy cutover inputs changed since manifest creation: ${error.message}`);
  }
}

function materializeInstalledCanonicalCutoverPrivacy(plan) {
  const input = canonicalCutoverPrivacyInputFromPlan(plan);
  const sourceKey = inspectKey(input.sourceKeyFilePath, input.sourceConfigRoot, "Source key");
  const targetKey = inspectKey(input.targetKeyFilePath, input.targetConfigRoot, "Target key");
  const targetPreviousKeys = input.targetPreviousKeyFilePaths.map((keyPath, index) => (
    inspectKey(keyPath, input.targetConfigRoot, `Target previous key ${index + 1}`)
  ));
  if (JSON.stringify(sourceKey.description) !== JSON.stringify(plan.source.key)
    || JSON.stringify(targetKey.description) !== JSON.stringify(plan.target.key)
    || JSON.stringify(targetPreviousKeys.map((entry) => entry.description)) !== JSON.stringify(plan.target.previousKeys)) {
    throw new Error("key metadata drifted");
  }
  const sourceLedger = inspectLedger(input.sourceLedgerPath, input.sourceBackupRoot, [sourceKey.key], "Source ledger");
  if (JSON.stringify(sourceLedger.description) !== JSON.stringify(plan.source.ledger)) throw new Error("source ledger drifted");
  const verificationKeys = [targetKey.key, ...targetPreviousKeys.map((entry) => entry.key), sourceKey.key];
  const targetLedger = inspectLedger(input.targetLedgerPath, input.targetBackupRoot, verificationKeys, "Target ledger");
  if (targetLedger.description.fileSha256 !== plan.merged.fileSha256
    || targetLedger.description.recordCount !== plan.merged.recordCount) {
    throw new Error("installed target ledger does not match the manifest merge");
  }
  return {
    alreadyInstalled: true,
    merged: {
      content: readFileSync(targetLedger.description.path, "utf8"),
      fileSha256: targetLedger.description.fileSha256,
      records: targetLedger.records,
    },
    plan,
    sourceKey,
    targetKey,
    targetPreviousKeys,
  };
}

export function prepareCanonicalCutoverPrivacyApply(plan, options = {}) {
  const { now = () => new Date(), ...atomicOptions } = options;
  let materialized;
  try {
    try {
      materialized = materializeCanonicalCutoverPrivacy(canonicalCutoverPrivacyInputFromPlan(plan));
      if (JSON.stringify(materialized.plan) !== JSON.stringify(plan)) throw new Error("manifest mismatch");
    } catch {
      materialized = materializeInstalledCanonicalCutoverPrivacy(plan);
    }
  } catch (error) {
    throw new Error(`Privacy cutover inputs changed since manifest creation: ${error.message}`);
  }
  const verificationKeys = [
    materialized.targetKey.key,
    ...materialized.targetPreviousKeys.map((entry) => entry.key),
    materialized.sourceKey.key,
  ];
  let installed = materialized.alreadyInstalled === true;
  return Object.freeze({
    plan,
    assertLedgerInstalled() {
      try {
        materializeInstalledCanonicalCutoverPrivacy(plan);
      } catch (error) {
        throw new Error(`Installed privacy cutover ledger changed: ${error.message}`);
      }
    },
    installLedger() {
      if (installed) return { fileSha256: materialized.merged.fileSha256 };
      verifyCanonicalCutoverPrivacyPlan(plan);
      const result = replaceDeletionLedgerAtomically({
        ledgerPath: plan.target.ledger.path,
        content: materialized.merged.content,
        verificationKeys,
      }, atomicOptions);
      installed = true;
      return result;
    },
    replay(db) {
      const accounts = db.prepare("SELECT id, discord_id AS discordId FROM user_accounts ORDER BY id").all();
      return replayPrivacyDeletions({
        records: materialized.merged.records,
        accounts,
        key: materialized.targetKey.key,
        keys: verificationKeys,
        now: now(),
        deleteAccount: (account) => deleteUserAccount(db, {
          userId: account.id,
          discordId: account.discordId,
          deletionKey: materialized.targetKey.key,
          manageTransaction: false,
        }),
      });
    },
  });
}
