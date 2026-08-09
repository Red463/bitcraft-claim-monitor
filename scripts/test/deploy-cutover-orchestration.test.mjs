import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CANONICAL_CONFIRMATION,
  CUTOVER_LOCK_ORDER,
  buildCutoverLockCommand,
  createCutoverOrchestrator,
  editEnvironmentDocument,
  parseCutoverArguments,
} from "../../deploy/cutover-relay-production.mjs";

const REVISION = "a".repeat(40);
const MANIFEST_HASH = "b".repeat(64);
const SECRET = "never-print-this-token";

function fixture({ repairCount = 1, failAt = null } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "relay-cutover-orchestration-"));
  const events = [];
  const failures = new Set(Array.isArray(failAt) ? failAt : failAt ? [failAt] : []);
  const record = (name, result) => {
    events.push(name);
    if (failures.has(name)) throw new Error(`injected ${name} failure`);
    return result;
  };
  const operations = {
    validatePrepare: () => record("validate-prepare", {
      revision: REVISION,
      version: "0.52.0-beta.1",
      claimId: "1369094286777412590",
      caddy: { originalSha256: "c".repeat(64), savedPath: "/protected/original-caddy" },
      services: { oldWeb: { active: true, enabled: true }, relayWeb: { active: true, enabled: true } },
      discoveredPaths: { sourceLedgerPath: "/old/ledger", sourceKeyPath: "/old/key" },
      secretDiagnostic: SECRET,
    }),
    installMaintenance: () => record("install-maintenance", { sha256: "d".repeat(64) }),
    stopAndCaptureWriters: () => record("stop-writers", { stopped: true }),
    assertWritersStopped: () => record("verify-writers-stopped"),
    createAndVerifyEncryptedBackups: () => record("backup-and-verify", [
      { identifier: "migration-old-db", encryptedSha256: "e".repeat(64) },
      { identifier: "migration-relay-db", encryptedSha256: "f".repeat(64) },
    ]),
    createRepairManifest: () => record("repair-dry-run", {
      selectionHash: "1".repeat(64),
      selectedCount: repairCount,
      selectedIds: repairCount ? ["relay-contribution"] : [],
    }),
    createMigrationManifest: () => record("migration-dry-run", {
      selectionHash: MANIFEST_HASH,
      counts: { selected: 17, excluded: 23 },
      privacy: {
        installedOldKeyPath: "/etc/relay/privacy-old.key",
        previousKeyEnvironmentValue: "/etc/relay/privacy-old.key",
        readinessArtifactPath: "/var/backups/relay/privacy-ready.json",
      },
      secret: SECRET,
    }),
    armWatchdog: () => record("arm-watchdog", {
      deadline: "2026-08-09T12:15:00.000Z",
      unit: `bitcraft-claim-monitor-relay-cutover-abort-${REVISION.slice(0, 12)}-${MANIFEST_HASH.slice(0, 12)}`,
    }),
    verifyPrepared: () => record("verify-prepared"),
    applyContributionRepair: () => record("apply-repair"),
    verifyContributionRepair: () => record("verify-repair"),
    installPreviousPrivacyKey: () => record("install-privacy-key", { path: "/etc/relay/privacy-old.key", dev: "1", ino: "2", sha256: "2".repeat(64) }),
    editCanonicalEnvironment: () => record("edit-environment", { path: "/etc/relay.env", originalBase64: Buffer.from(`TOKEN=${SECRET}\n`).toString("base64"), dev: "1", ino: "3" }),
    writePrivacyReadiness: () => record("write-readiness", { path: "/var/backups/relay/privacy-ready.json", dev: "1", ino: "4", sha256: "3".repeat(64) }),
    verifyPrivacyReadiness: () => record("verify-readiness"),
    applyMigration: () => record("apply-migration"),
    verifyMigratedData: () => record("verify-migrated-data"),
    seedReleaseAnnouncementMarker: () => record("seed-release-marker"),
    captureOutboxState: () => record("capture-outbox", { pending: 2, sent: 8 }),
    startRelayServices: () => record("start-relay"),
    verifyLocalCanonical: () => record("verify-local"),
    verifyMaintenanceCanary: () => record("verify-canary"),
    validateFinalCaddyForAdmission: () => record("validate-final-caddy", { candidateSha256: "4".repeat(64) }),
    installFinalCaddy: () => record("install-final-caddy"),
    verifyPublicCanonical: () => record("verify-public"),
    maskOldUnits: () => record("mask-old"),
    cancelWatchdog: () => record("cancel-watchdog"),
    recordForensicRetention: () => record("record-retention", { deadline: "2026-08-23T12:00:00.000Z" }),
    quiesceServicesForRestore: () => record("quiesce-services"),
    restoreEnvironment: () => record("restore-environment"),
    removeCreatedReadiness: () => record("remove-readiness"),
    removeCreatedPreviousKey: () => record("remove-privacy-key"),
    restoreCaddy: () => record("restore-caddy"),
    restoreServiceStates: () => record("restore-services"),
    validateAndReloadRestoredCaddy: () => record("validate-restored-caddy"),
    verifyOldPublicHealth: () => record("verify-old-public"),
    cleanupPlaintext: () => record("cleanup-plaintext"),
  };
  const orchestrator = createCutoverOrchestrator({
    operations,
    stateDirectory: directory,
    now: () => new Date("2026-08-09T12:00:00.000Z"),
  });
  return { directory, events, failures, operations, orchestrator };
}

test("cutover arguments accept only the three exact full-SHA modes", () => {
  assert.deepEqual(parseCutoverArguments([
    "--revision", REVISION, "--prepare-cutover", "--confirmation", CANONICAL_CONFIRMATION,
  ]), { mode: "prepare", revision: REVISION, confirmation: CANONICAL_CONFIRMATION, manifestHash: null });
  assert.deepEqual(parseCutoverArguments([
    "--revision", REVISION, "--apply-cutover", "--manifest-hash", MANIFEST_HASH,
  ]), { mode: "apply", revision: REVISION, confirmation: null, manifestHash: MANIFEST_HASH });
  assert.deepEqual(parseCutoverArguments([
    "--revision", REVISION, "--abort-cutover", "--manifest-hash", MANIFEST_HASH,
  ]), { mode: "abort", revision: REVISION, confirmation: null, manifestHash: MANIFEST_HASH });

  for (const invalid of [
    ["--revision", "abc", "--prepare-cutover", "--confirmation", CANONICAL_CONFIRMATION],
    ["--revision", REVISION, "--prepare-cutover", "--apply-cutover", "--confirmation", CANONICAL_CONFIRMATION],
    ["--revision", REVISION, "--prepare-cutover", "--confirmation", "relay.timbersteeltrade.com"],
    ["--revision", REVISION, "--apply-cutover", "--manifest-hash", "abc"],
    ["--revision", REVISION, "--abort-cutover", "--manifest-hash", MANIFEST_HASH, "--verbose"],
  ]) assert.throws(() => parseCutoverArguments(invalid), /cutover|revision|confirmation|unknown/i);
});

test("lock acquisition order is cutover, deploy, then backup", () => {
  assert.deepEqual(CUTOVER_LOCK_ORDER, [
    "/run/lock/bitcraft-claim-monitor-relay-cutover.lock",
    "/run/lock/bitcraft-claim-monitor-relay-deploy.lock",
    "/run/lock/bitcraft-claim-monitor-relay-backup.lock",
  ]);
  const ordinary = buildCutoverLockCommand(["--revision", REVISION], { waitForLocks: false });
  const watchdog = buildCutoverLockCommand(["--revision", REVISION], { waitForLocks: true });
  assert.equal(ordinary.filter((argument) => argument === "--nonblock").length, 3);
  assert.equal(watchdog.includes("--nonblock"), false);
  assert.deepEqual(
    watchdog.filter((argument) => CUTOVER_LOCK_ORDER.includes(argument)),
    [...CUTOVER_LOCK_ORDER],
  );
});

test("safe environment editing changes only canonical keys without evaluating values", () => {
  const original = Buffer.from([
    "# protected",
    `DISCORD_BOT_TOKEN=${SECRET}`,
    "BITCRAFT_DEPLOYMENT_MODE=preview",
    "DISCORD_DELIVERY_MODE=record",
    "ENABLE_DISCORD_STARTUP=false",
    "UNRELATED=$(touch /tmp/must-not-run)",
    "",
  ].join("\n"));
  const edited = editEnvironmentDocument(original, {
    BITCRAFT_DEPLOYMENT_MODE: "canonical",
    DISCORD_DELIVERY_MODE: "live",
    ENABLE_DISCORD_STARTUP: "true",
    DISCORD_OAUTH_REDIRECT_URI: "https://app.timbersteeltrade.com/api/local/auth/discord/callback",
    PRIVACY_LEDGER_PREVIOUS_KEY_FILES: "/etc/relay/privacy-old.key",
  }).toString("utf8");

  assert.match(edited, new RegExp(`DISCORD_BOT_TOKEN=${SECRET}`));
  assert.match(edited, /UNRELATED=\$\(touch \/tmp\/must-not-run\)/);
  assert.match(edited, /^BITCRAFT_DEPLOYMENT_MODE=canonical$/m);
  assert.match(edited, /^DISCORD_DELIVERY_MODE=live$/m);
  assert.match(edited, /^ENABLE_DISCORD_STARTUP=true$/m);
  assert.equal((edited.match(/^BITCRAFT_DEPLOYMENT_MODE=/gm) ?? []).length, 1);
  assert.throws(
    () => editEnvironmentDocument(Buffer.from("BITCRAFT_DEPLOYMENT_MODE=preview\nBITCRAFT_DEPLOYMENT_MODE=preview\n"), { BITCRAFT_DEPLOYMENT_MODE: "canonical" }),
    /duplicate/i,
  );
});

test("prepare is ordered, persists a protected state, redacts its summary, and refuses overwrite", async () => {
  const cutover = fixture();
  try {
    const summary = await cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION });
    assert.deepEqual(cutover.events, [
      "validate-prepare", "install-maintenance", "stop-writers", "verify-writers-stopped",
      "backup-and-verify", "repair-dry-run", "migration-dry-run", "arm-watchdog",
    ]);
    assert.equal(summary.manifestHash, MANIFEST_HASH);
    assert.equal(summary.repairCount, 1);
    assert.equal(summary.watchdogDeadline, "2026-08-09T12:15:00.000Z");
    assert.doesNotMatch(JSON.stringify(summary), new RegExp(SECRET));

    const statePath = path.join(cutover.directory, "state.json");
    assert.equal(existsSync(statePath), true);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(state.status, "prepared");
    assert.equal(state.manifestHash, MANIFEST_HASH);
    await assert.rejects(
      cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION }),
      /active prepare/i,
    );
    assert.equal(cutover.events.filter((event) => event === "backup-and-verify").length, 1);
  } finally {
    rmSync(cutover.directory, { recursive: true, force: true });
  }
});

test("prepare failure after maintenance restores every reversible surface without needing a manifest hash", async () => {
  const cutover = fixture({ failAt: "backup-and-verify" });
  try {
    await assert.rejects(
      cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION }),
      /backup-and-verify/,
    );
    for (const expected of [
      "cancel-watchdog", "quiesce-services", "restore-environment", "remove-readiness", "remove-privacy-key",
      "restore-caddy", "restore-services", "validate-restored-caddy", "verify-old-public", "cleanup-plaintext",
    ]) assert.equal(cutover.events.includes(expected), true, expected);
    const state = JSON.parse(readFileSync(path.join(cutover.directory, "state.json"), "utf8"));
    assert.equal(state.status, "prepare-failed");
    assert.equal(state.manifestHash, null);
    await assert.rejects(
      cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION }),
      /active prepare/i,
    );
  } finally {
    rmSync(cutover.directory, { recursive: true, force: true });
  }
});

test("apply verifies the repair and privacy handshake before migration and marks admission before Caddy opens", async () => {
  const cutover = fixture();
  try {
    await cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION });
    cutover.events.length = 0;
    const result = await cutover.orchestrator.apply({ revision: REVISION, manifestHash: MANIFEST_HASH });
    assert.equal(result.status, "complete");
    assert.deepEqual(cutover.events, [
      "verify-prepared", "apply-repair", "verify-repair", "install-privacy-key", "edit-environment",
      "write-readiness", "verify-readiness", "apply-migration", "verify-migrated-data",
      "seed-release-marker", "capture-outbox", "start-relay", "verify-local", "verify-canary",
      "validate-final-caddy", "install-final-caddy", "verify-public", "mask-old", "cancel-watchdog", "record-retention",
    ]);
    assert.equal(existsSync(path.join(cutover.directory, "admission.json")), true);
    const state = JSON.parse(readFileSync(path.join(cutover.directory, "state.json"), "utf8"));
    assert.equal(state.status, "complete");
    assert.equal(state.preApply.previousKey.path, "/etc/relay/privacy-old.key");
    assert.equal(state.preApply.readiness.path, "/var/backups/relay/privacy-ready.json");
    await assert.rejects(cutover.orchestrator.abort({ revision: REVISION, manifestHash: MANIFEST_HASH }), /admission/i);
  } finally {
    rmSync(cutover.directory, { recursive: true, force: true });
  }
});

test("zero-selection apply skips repair mutation but still verifies the frozen no-repair case", async () => {
  const cutover = fixture({ repairCount: 0 });
  try {
    await cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION });
    cutover.events.length = 0;
    await cutover.orchestrator.apply({ revision: REVISION, manifestHash: MANIFEST_HASH });
    assert.equal(cutover.events.includes("apply-repair"), false);
    assert.ok(cutover.events.indexOf("verify-repair") < cutover.events.indexOf("install-privacy-key"));
  } finally {
    rmSync(cutover.directory, { recursive: true, force: true });
  }
});

test("pre-admission failure can abort with full restoration and retry idempotently", async () => {
  const cutover = fixture({ failAt: "verify-local" });
  try {
    await cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION });
    await assert.rejects(cutover.orchestrator.apply({ revision: REVISION, manifestHash: MANIFEST_HASH }), /verify-local/);
    assert.equal(existsSync(path.join(cutover.directory, "admission.json")), false);
    cutover.failures.delete("verify-local");
    cutover.events.length = 0;
    const aborted = await cutover.orchestrator.abort({ revision: REVISION, manifestHash: MANIFEST_HASH });
    assert.equal(aborted.status, "aborted");
    assert.deepEqual(cutover.events, [
      "cancel-watchdog", "quiesce-services", "restore-environment", "remove-readiness", "remove-privacy-key",
      "restore-caddy", "restore-services", "validate-restored-caddy", "verify-old-public", "cleanup-plaintext",
    ]);
    cutover.events.length = 0;
    assert.equal((await cutover.orchestrator.abort({ revision: REVISION, manifestHash: MANIFEST_HASH })).status, "aborted");
    assert.deepEqual(cutover.events, []);
  } finally {
    rmSync(cutover.directory, { recursive: true, force: true });
  }
});

test("abort continues every restoration after partial failures and retains retry evidence", async () => {
  const cutover = fixture({ failAt: ["restore-caddy", "restore-services"] });
  try {
    await cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION });
    cutover.events.length = 0;
    await assert.rejects(cutover.orchestrator.abort({ revision: REVISION, manifestHash: MANIFEST_HASH }), /restore-caddy.*restore-services|restore-services.*restore-caddy/i);
    for (const expected of [
      "quiesce-services", "restore-environment", "remove-readiness", "remove-privacy-key", "restore-caddy", "restore-services",
      "validate-restored-caddy", "verify-old-public", "cleanup-plaintext",
    ]) assert.equal(cutover.events.includes(expected), true, expected);
    const state = JSON.parse(readFileSync(path.join(cutover.directory, "state.json"), "utf8"));
    assert.equal(state.status, "abort-failed");
    assert.equal(existsSync(path.join(cutover.directory, "state.json")), true);
  } finally {
    rmSync(cutover.directory, { recursive: true, force: true });
  }
});

test("every post-admission failure is resumable only through fix-forward apply", async (context) => {
  const cases = [
    ["install-final-caddy", ["install-final-caddy", "verify-public", "mask-old", "cancel-watchdog", "record-retention"]],
    ["verify-public", ["verify-public", "mask-old", "cancel-watchdog", "record-retention"]],
    ["mask-old", ["mask-old", "cancel-watchdog", "record-retention"]],
    ["cancel-watchdog", ["cancel-watchdog", "record-retention"]],
    ["record-retention", ["record-retention"]],
  ];
  for (const [failure, expectedResumeEvents] of cases) await context.test(failure, async () => {
    const cutover = fixture({ failAt: failure });
    try {
      await cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION });
      await assert.rejects(cutover.orchestrator.apply({ revision: REVISION, manifestHash: MANIFEST_HASH }), new RegExp(failure));
      assert.equal(existsSync(path.join(cutover.directory, "admission.json")), true);
      await assert.rejects(cutover.orchestrator.abort({ revision: REVISION, manifestHash: MANIFEST_HASH }), /admission/i);

      cutover.failures.delete(failure);
      cutover.events.length = 0;
      assert.equal((await cutover.orchestrator.apply({ revision: REVISION, manifestHash: MANIFEST_HASH })).status, "complete");
      assert.deepEqual(cutover.events, expectedResumeEvents);
      cutover.events.length = 0;
      assert.equal((await cutover.orchestrator.apply({ revision: REVISION, manifestHash: MANIFEST_HASH })).status, "complete");
      assert.deepEqual(cutover.events, []);
    } finally {
      rmSync(cutover.directory, { recursive: true, force: true });
    }
  });
});

test("final Caddy validation failure remains before admission and abortable", async () => {
  const cutover = fixture({ failAt: "validate-final-caddy" });
  try {
    await cutover.orchestrator.prepare({ revision: REVISION, confirmation: CANONICAL_CONFIRMATION });
    await assert.rejects(cutover.orchestrator.apply({ revision: REVISION, manifestHash: MANIFEST_HASH }), /validate-final-caddy/);
    assert.equal(existsSync(path.join(cutover.directory, "admission.json")), false);
    cutover.failures.delete("validate-final-caddy");
    assert.equal((await cutover.orchestrator.abort({ revision: REVISION, manifestHash: MANIFEST_HASH })).status, "aborted");
  } finally {
    rmSync(cutover.directory, { recursive: true, force: true });
  }
});
