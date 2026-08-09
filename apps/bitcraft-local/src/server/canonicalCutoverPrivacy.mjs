import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

import {
  deletionLedgerKeyId,
  discardStagedDeletionLedger,
  installStagedDeletionLedger,
  mergeDeletionLedgerRecords,
  parseDeletionLedgerContent,
  replayPrivacyDeletions,
  stageDeletionLedgerReplacement,
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

function assertDisjointPrivacyPaths(entries) {
  const seen = new Map();
  for (const [label, entryPath] of entries) {
    const normalized = normalizePath(entryPath);
    const existing = seen.get(normalized);
    if (existing) throw new Error(`Privacy cutover paths must be distinct: ${existing} and ${label}`);
    seen.set(normalized, label);
  }
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
  const stats = statSync(resolved, { bigint: true });
  if (!stats.isFile()) throw new Error(`${label} must be a regular file`);
  if (stats.nlink !== 1n) throw new Error(`${label} must have exactly one filesystem link`);
  return { exists: true, path: resolved };
}

function readApprovedFile(file, label) {
  const descriptor = openSync(file.path, "r");
  try {
    const descriptorStats = fstatSync(descriptor, { bigint: true });
    const pathStats = lstatSync(file.path, { bigint: true });
    if (!descriptorStats.isFile() || !pathStats.isFile() || pathStats.isSymbolicLink()) {
      throw new Error(`${label} must remain a regular non-symlink file`);
    }
    if (descriptorStats.nlink !== 1n || pathStats.nlink !== 1n) {
      throw new Error(`${label} must have exactly one filesystem link`);
    }
    if (descriptorStats.dev !== pathStats.dev || descriptorStats.ino !== pathStats.ino) {
      throw new Error(`${label} changed filesystem identity before read`);
    }
    if (!samePath(realpathSync.native(file.path), file.path)) {
      throw new Error(`${label} must not traverse a symlink`);
    }
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function inspectKey(filePath, rootPath, label) {
  const file = approvedFile(filePath, rootPath, label);
  const bytes = readApprovedFile(file, label);
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
  if (!file.exists) return { content: "", records: [], description: { path: file.path, exists: false, fileSha256: null, recordCount: 0 } };
  const bytes = readApprovedFile(file, label);
  const content = bytes.toString("utf8");
  const records = parseDeletionLedgerContent(content, keys, label);
  return {
    content,
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
  const installedPreviousKey = approvedFile(
    input.installedPreviousKeyFilePath,
    input.targetConfigRoot,
    "Installed previous key destination",
    { allowMissing: true },
  );
  if (samePath(installedPreviousKey.path, targetKey.description.path)) {
    throw new Error("Installed previous key destination must be distinct from the current key");
  }
  const readinessArtifact = approvedFile(
    input.readinessArtifactPath,
    input.targetBackupRoot,
    "Privacy readiness artifact",
    { allowMissing: true },
  );
  const sourceLedgerFile = approvedFile(input.sourceLedgerPath, input.sourceBackupRoot, "Source ledger", { allowMissing: true });
  const targetLedgerFile = approvedFile(input.targetLedgerPath, input.targetBackupRoot, "Target ledger", { allowMissing: true });
  const stagedLedgerPath = path.join(
    path.dirname(targetLedgerFile.path),
    `.${path.basename(targetLedgerFile.path)}.canonical-cutover-stage`,
  );
  assertDisjointPrivacyPaths([
    ["source key", sourceKey.description.path],
    ["target key", targetKey.description.path],
    ...targetPreviousKeys.map((entry, index) => [`target previous key ${index + 1}`, entry.description.path]),
    ["installed previous key destination", installedPreviousKey.path],
    ["source ledger", sourceLedgerFile.path],
    ["target ledger", targetLedgerFile.path],
    ["staged target ledger", stagedLedgerPath],
    ["privacy readiness artifact", readinessArtifact.path],
  ]);
  const sourceLedger = inspectLedger(input.sourceLedgerPath, input.sourceBackupRoot, [sourceKey.key], "Source ledger");
  const targetLedger = inspectLedger(
    input.targetLedgerPath,
    input.targetBackupRoot,
    [targetKey.key, ...targetPreviousKeys.map((entry) => entry.key)],
    "Target ledger",
  );
  const merged = mergeDeletionLedgerRecords({
    sourceRecords: sourceLedger.records,
    targetRecords: targetLedger.records,
    sourceKey: sourceKey.key,
    targetKey: targetKey.key,
    targetPreviousKeys: targetPreviousKeys.map((entry) => entry.key),
    manifestCreatedAt: input.manifestCreatedAt,
  });
  const previousKeyFilePaths = targetPreviousKeys
    .filter((entry) => entry.description.keyId !== sourceKey.description.keyId)
    .map((entry) => entry.description.path);
  if (merged.previousKeyRetireAfter) previousKeyFilePaths.push(installedPreviousKey.path);
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
      stagedLedgerPath,
    },
    merged: {
      fileSha256: merged.fileSha256,
      recordCount: merged.records.length,
      counts: merged.counts,
      previousKeyRetireAfter: merged.previousKeyRetireAfter,
    },
    previousKeyConfiguration: {
      environmentVariable: "PRIVACY_LEDGER_PREVIOUS_KEY_FILES",
      installedOldKeyPath: installedPreviousKey.path,
      filePaths: previousKeyFilePaths,
      value: previousKeyFilePaths.join(","),
      retireAfter: merged.previousKeyRetireAfter,
    },
    readinessArtifact: {
      formatVersion: 1,
      path: readinessArtifact.path,
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
    installedPreviousKeyFilePath: plan.previousKeyConfiguration.installedOldKeyPath,
    readinessArtifactPath: plan.readinessArtifact.path,
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

export function createCanonicalCutoverPrivacyReadinessArtifact(plan, selectionHash) {
  if (typeof selectionHash !== "string" || !/^[a-f0-9]{64}$/.test(selectionHash)) {
    throw new Error("Canonical cutover selection hash is invalid");
  }
  return {
    formatVersion: 1,
    selectionHash,
    mergedLedgerSha256: plan.merged.fileSha256,
    installedPreviousKey: {
      path: plan.previousKeyConfiguration.installedOldKeyPath,
      fileSha256: plan.source.key.fileSha256,
      keyId: plan.source.key.keyId,
    },
    configuration: {
      environmentVariable: plan.previousKeyConfiguration.environmentVariable,
      value: plan.previousKeyConfiguration.value,
      retireAfter: plan.previousKeyConfiguration.retireAfter,
    },
  };
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
      content: targetLedger.content,
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
  const atomicOptions = options;
  const replayAt = new Date(plan.manifestCreatedAt);
  let materialized;
  try {
    try {
      materialized = materializeCanonicalCutoverPrivacy(canonicalCutoverPrivacyInputFromPlan(plan));
      if (JSON.stringify(materialized.plan) !== JSON.stringify(plan)) throw new Error("manifest mismatch");
    } catch (originalError) {
      try {
        materialized = materializeInstalledCanonicalCutoverPrivacy(plan);
      } catch (installedError) {
        throw new Error(`${originalError.message}; ${installedError.message}`);
      }
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
    assertReadiness({ readinessArtifactPath, selectionHash }) {
      if (!plan.merged.previousKeyRetireAfter) return { required: false };
      if (typeof readinessArtifactPath !== "string" || !readinessArtifactPath) {
        throw new Error("Privacy readiness artifact path is required for retained old-key records");
      }
      if (!samePath(readinessArtifactPath, plan.readinessArtifact.path)) {
        throw new Error("Privacy readiness artifact path does not match the manifest");
      }
      const installedKey = inspectKey(
        plan.previousKeyConfiguration.installedOldKeyPath,
        plan.target.approvedConfigRoot,
        "Installed previous key",
      );
      if (installedKey.description.fileSha256 !== plan.source.key.fileSha256
        || installedKey.description.keyId !== plan.source.key.keyId) {
        throw new Error("Installed previous key does not match the frozen source key");
      }
      const artifactFile = approvedFile(
        readinessArtifactPath,
        plan.target.approvedBackupRoot,
        "Privacy readiness artifact",
      );
      let artifact;
      try {
        artifact = JSON.parse(readApprovedFile(artifactFile, "Privacy readiness artifact").toString("utf8"));
      } catch (error) {
        throw new Error(`Privacy readiness artifact is invalid: ${error.message}`);
      }
      const expected = createCanonicalCutoverPrivacyReadinessArtifact(plan, selectionHash);
      if (JSON.stringify(artifact) !== JSON.stringify(expected)) {
        throw new Error("Privacy readiness artifact does not match the frozen cutover plan");
      }
      return { required: true };
    },
    assertLedgerInstalled() {
      try {
        materializeInstalledCanonicalCutoverPrivacy(plan);
      } catch (error) {
        throw new Error(`Installed privacy cutover ledger changed: ${error.message}`);
      }
    },
    stageLedger() {
      if (installed) return null;
      verifyCanonicalCutoverPrivacyPlan(plan);
      return stageDeletionLedgerReplacement({
        ledgerPath: plan.target.ledger.path,
        temporaryPath: plan.target.stagedLedgerPath,
        content: materialized.merged.content,
        verificationKeys,
      }, atomicOptions);
    },
    discardLedgerStage(staged) {
      discardStagedDeletionLedger(staged, atomicOptions);
    },
    installLedger(staged = null, readiness = {}) {
      if (installed) return { fileSha256: materialized.merged.fileSha256 };
      verifyCanonicalCutoverPrivacyPlan(plan);
      this.assertReadiness(readiness);
      const activeStage = staged ?? this.stageLedger();
      const result = installStagedDeletionLedger(activeStage, atomicOptions);
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
        now: replayAt,
        deleteAccount: (account) => deleteUserAccount(db, {
          userId: account.id,
          discordId: account.discordId,
          deletionKey: materialized.targetKey.key,
          manageTransaction: false,
          now: () => replayAt,
        }),
      });
    },
  });
}
