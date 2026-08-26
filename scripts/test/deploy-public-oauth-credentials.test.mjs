import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

let installer = null;
try {
  installer = await import("../../deploy/install-public-oauth-credentials.mjs");
} catch {
  // RED: the protected credential installer does not exist yet.
}

const credentials = {
  clientId: "123456789012345678",
  clientSecret: "abcdefghijklmnopqrstuvwxyzABCDEF",
};

const originalEnvironment = `PUBLIC_PROFILE_ENABLED=false
PUBLIC_COLLABORATION_ENABLED=false
PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=false
PUBLIC_ORIGIN=https://claim-monitor.com
PUBLIC_DISCORD_OAUTH_CLIENT_ID=
PUBLIC_DISCORD_OAUTH_CLIENT_SECRET=
DISCORD_BOT_TOKEN=existing-timbersteel-secret
`;

function disabledPublicProfile() {
  return {
    profile: { id: "public" },
    features: {
      publicProfileEnabled: false,
      publicCollaborationEnabled: false,
      publicLegalConfigurationConfirmed: false,
    },
  };
}

function runtime({
  failHealth = false,
  failFirstRestart = false,
  workerChanges = false,
  credentialMismatch = false,
  gatesChange = false,
} = {}) {
  let workerReads = 0;
  let profileReads = 0;
  const restarts = [];
  return {
    restarts,
    operations: {
      getServicePid(service) {
        if (service.includes("worker")) {
          workerReads += 1;
          return workerChanges && workerReads === 2 ? "4343" : "4242";
        }
        return "5151";
      },
      restartService(service) {
        restarts.push(service);
        if (failFirstRestart && restarts.length === 1) throw new Error("restart failed");
      },
      async waitForWebHealth() {
        if (failHealth && restarts.length === 1) throw new Error("health failed");
      },
      readProcessEnvironment() {
        return new Map([
          ["PUBLIC_DISCORD_OAUTH_CLIENT_ID", credentials.clientId],
          ["PUBLIC_DISCORD_OAUTH_CLIENT_SECRET", credentialMismatch ? "mismatch" : credentials.clientSecret],
        ]);
      },
      async readPublicProfile() {
        profileReads += 1;
        if (gatesChange && profileReads === 2) {
          const profile = disabledPublicProfile();
          profile.features.publicProfileEnabled = true;
          return profile;
        }
        return disabledPublicProfile();
      },
    },
  };
}

test("credential payload accepts only exact bounded Discord OAuth values", () => {
  assert.ok(installer, "public OAuth credential installer must exist");
  assert.deepEqual(
    installer.parseCredentialPayload(Buffer.from(JSON.stringify(credentials))),
    credentials,
  );
  for (const payload of [
    {},
    { ...credentials, extra: true },
    { ...credentials, clientId: "not-a-snowflake" },
    { ...credentials, clientSecret: "short" },
    { ...credentials, clientSecret: `${credentials.clientSecret}\nleak` },
  ]) {
    assert.throws(() => installer.parseCredentialPayload(Buffer.from(JSON.stringify(payload))), /credential payload/i);
  }
});

test("installer atomically changes only public OAuth credentials and restarts only web", async () => {
  assert.ok(installer, "public OAuth credential installer must exist");
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-oauth-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, originalEnvironment);
  chmodSync(environmentPath, 0o600);
  const fake = runtime();

  try {
    const result = await installer.installPublicOAuthCredentials({
      environmentPath,
      credentials,
      operations: fake.operations,
      enforceRootOwnership: false,
    });

    assert.deepEqual(result, {
      changed: true,
      webRestarted: true,
      workerUnchanged: true,
      credentialsLoaded: true,
      publicFlags: "disabled",
    });
    assert.equal(readFileSync(environmentPath, "utf8"), originalEnvironment
      .replace("PUBLIC_DISCORD_OAUTH_CLIENT_ID=", `PUBLIC_DISCORD_OAUTH_CLIENT_ID=${credentials.clientId}`)
      .replace("PUBLIC_DISCORD_OAUTH_CLIENT_SECRET=", `PUBLIC_DISCORD_OAUTH_CLIENT_SECRET=${credentials.clientSecret}`));
    assert.deepEqual(fake.restarts, ["bitcraft-claim-monitor-relay.service"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer restores the protected environment when post-restart verification fails", async () => {
  assert.ok(installer, "public OAuth credential installer must exist");
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-oauth-rollback-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, originalEnvironment);
  chmodSync(environmentPath, 0o600);
  const fake = runtime({ failHealth: true });

  try {
    await assert.rejects(
      installer.installPublicOAuthCredentials({
        environmentPath,
        credentials,
        operations: fake.operations,
        enforceRootOwnership: false,
      }),
      /health failed/i,
    );
    assert.equal(readFileSync(environmentPath, "utf8"), originalEnvironment);
    assert.deepEqual(fake.restarts, [
      "bitcraft-claim-monitor-relay.service",
      "bitcraft-claim-monitor-relay.service",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomic writer removes credential staging when rename fails", () => {
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-oauth-pre-rename-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, originalEnvironment);
  chmodSync(environmentPath, 0o600);

  try {
    assert.throws(
      () => installer.writeEnvironmentAtomic(
        environmentPath,
        Buffer.from("credential-bearing-stage"),
        lstatSync(environmentPath, { bigint: true }),
        { renameOperation() { throw new Error("rename failed"); } },
      ),
      /rename failed/i,
    );
    assert.deepEqual(readdirSync(root), ["relay.env"]);
    assert.equal(readFileSync(environmentPath, "utf8"), originalEnvironment);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer rolls back when directory sync fails after credential rename", async () => {
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-oauth-post-rename-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, originalEnvironment);
  chmodSync(environmentPath, 0o600);
  const fake = runtime();
  let writes = 0;

  try {
    await assert.rejects(
      installer.installPublicOAuthCredentials({
        environmentPath,
        credentials,
        operations: fake.operations,
        enforceRootOwnership: false,
        atomicWrite(pathname, bytes, metadata, options) {
          writes += 1;
          return installer.writeEnvironmentAtomic(pathname, bytes, metadata, {
            ...options,
            syncDirectoryOperation: writes === 1
              ? () => { throw new Error("directory sync failed"); }
              : undefined,
          });
        },
      }),
      /directory sync failed/i,
    );
    assert.equal(readFileSync(environmentPath, "utf8"), originalEnvironment);
    assert.deepEqual(fake.restarts, ["bitcraft-claim-monitor-relay.service"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [name, runtimeOptions, message] of [
  ["worker PID change", { workerChanges: true }, /worker changed/i],
  ["runtime credential mismatch", { credentialMismatch: true }, /did not load/i],
  ["public gate drift", { gatesChange: true }, /feature gates changed/i],
  ["web restart failure", { failFirstRestart: true }, /restart failed/i],
]) {
  test(`installer restores the original environment after ${name}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-oauth-proof-"));
    const environmentPath = join(root, "relay.env");
    writeFileSync(environmentPath, originalEnvironment);
    chmodSync(environmentPath, 0o600);
    const fake = runtime(runtimeOptions);

    try {
      await assert.rejects(
        installer.installPublicOAuthCredentials({
          environmentPath,
          credentials,
          operations: fake.operations,
          enforceRootOwnership: false,
        }),
        message,
      );
      assert.equal(readFileSync(environmentPath, "utf8"), originalEnvironment);
      assert.deepEqual(fake.restarts, [
        "bitcraft-claim-monitor-relay.service",
        "bitcraft-claim-monitor-relay.service",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("installer rejects duplicate credential keys before changing the environment", async () => {
  assert.ok(installer, "public OAuth credential installer must exist");
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-oauth-duplicate-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, `${originalEnvironment}PUBLIC_DISCORD_OAUTH_CLIENT_ID=duplicate\n`);
  chmodSync(environmentPath, 0o600);
  const fake = runtime();

  try {
    await assert.rejects(
      installer.installPublicOAuthCredentials({
        environmentPath,
        credentials,
        operations: fake.operations,
        enforceRootOwnership: false,
      }),
      /exactly once/i,
    );
    assert.deepEqual(fake.restarts, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
