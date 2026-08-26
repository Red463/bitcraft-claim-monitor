import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

let activation = null;
try {
  activation = await import("../../deploy/enable-public-readonly.mjs");
} catch {
  // RED: the protected Stage 1 activation helper does not exist yet.
}

const disabledEnvironment = `BITCRAFT_DEPLOYMENT_MODE=canonical
PUBLIC_DISCORD_OAUTH_CLIENT_ID=123456789012345678
PUBLIC_DISCORD_OAUTH_CLIENT_SECRET=abcdefghijklmnopqrstuvwxyzABCDEF
DISCORD_BOT_TOKEN=existing-timbersteel-secret
`;

function publicProfile(enabled) {
  return {
    profile: { id: "public" },
    features: {
      publicProfileEnabled: enabled,
      publicCollaborationEnabled: false,
      publicLegalConfigurationConfirmed: enabled,
    },
  };
}

function runtime({ failSearch = false, failSnapshot = false, failFingerprints = false, workerChanges = false, rollbackProfileStaysEnabled = false } = {}) {
  let workerReads = 0;
  let profileReads = 0;
  const restarts = [];
  const snapshots = [];
  const fingerprintChecks = [];
  return {
    restarts,
    snapshots,
    fingerprintChecks,
    operations: {
      getServicePid(service) {
        if (service.includes("worker")) {
          workerReads += 1;
          return workerChanges && workerReads === 2 ? "4343" : "4242";
        }
        return "5151";
      },
      restartService(service) { restarts.push(service); },
      async waitForWebHealth() {},
      stopService(service) { restarts.push(`stop:${service}`); },
      captureTimbersteelFingerprints() { return { activity_events: { maxRowid: "7", prefixHash: "baseline" } }; },
      verifyTimbersteelFingerprints(baseline) {
        fingerprintChecks.push(baseline);
        if (failFingerprints) throw new Error("Timbersteel history/outbox prefix changed.");
      },
      readProcessEnvironment() {
        return new Map([
          ["PUBLIC_ORIGIN", "https://claim-monitor.com"],
          ["PUBLIC_PROFILE_ENABLED", "true"],
          ["PUBLIC_COLLABORATION_ENABLED", "false"],
          ["PUBLIC_LEGAL_CONFIGURATION_CONFIRMED", "true"],
        ]);
      },
      async readPublicProfile() {
        profileReads += 1;
        if (restarts.length > 1 && !rollbackProfileStaysEnabled) return publicProfile(false);
        return publicProfile(profileReads > 1);
      },
      async readPublicSearch() {
        if (restarts.length > 1) return { status: 404, body: { error: "Not found" } };
        return failSearch
          ? { status: 503, body: { error: "Relay unavailable" } }
          : { status: 200, body: { hints: [{ claimId: "42", name: "Timbersteel" }] } };
      },
      async readPublicSnapshot(claimId, domains) {
        snapshots.push([claimId, domains]);
        return failSnapshot
          ? { status: 503, body: { error: "Relay unavailable" } }
          : {
              status: 200,
              body: {
                claimId,
                domains: Object.fromEntries(domains.map((domain) => [domain, { data: null, warnings: [] }])),
              },
            };
      },
    },
  };
}

test("Stage 1 adds only the approved public read-only configuration", () => {
  assert.ok(activation, "public read-only activation helper must exist");
  assert.equal(activation.editPublicReadOnlyEnvironment(disabledEnvironment), `${disabledEnvironment}PUBLIC_ORIGIN=https://claim-monitor.com
PUBLIC_PROFILE_ENABLED=true
PUBLIC_COLLABORATION_ENABLED=false
PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=true
`);
  assert.throws(
    () => activation.editPublicReadOnlyEnvironment(`${disabledEnvironment}PUBLIC_COLLABORATION_ENABLED=true\n`),
    /collaboration/i,
  );
});

test("Stage 1 emergency disable fails closed without changing Timbersteel secrets", () => {
  const enabled = activation.editPublicReadOnlyEnvironment(disabledEnvironment);
  assert.equal(activation.editPublicDisabledEnvironment(enabled), `${disabledEnvironment}PUBLIC_ORIGIN=https://claim-monitor.com
PUBLIC_PROFILE_ENABLED=false
PUBLIC_COLLABORATION_ENABLED=false
PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=false
`);
});

test("bounded Timbersteel fingerprints allow appended rows and reject prefix mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-readonly-fingerprint-"));
  const databasePath = join(root, "bitcraft-local.sqlite");
  const database = new DatabaseSync(databasePath);
  const tables = ["market_events", "market_trades", "activity_events", "provider_transition_outbox", "discord_notification_outbox"];
  try {
    for (const table of tables) {
      database.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`);
      database.prepare(`INSERT INTO ${table} (value) VALUES (?)`).run("before");
    }
    const baseline = activation.captureTimbersteelFingerprints(databasePath);
    for (const table of tables) database.prepare(`INSERT INTO ${table} (value) VALUES (?)`).run("appended");
    assert.doesNotThrow(() => activation.verifyTimbersteelFingerprints(baseline, databasePath));
    database.prepare("UPDATE activity_events SET value = ? WHERE id = 1").run("mutated");
    assert.throws(
      () => activation.verifyTimbersteelFingerprints(baseline, databasePath),
      /history\/outbox prefix changed: activity_events/i,
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Stage 1 restarts only web and verifies public search without exposing collaboration", async () => {
  assert.ok(activation, "public read-only activation helper must exist");
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-readonly-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, disabledEnvironment);
  chmodSync(environmentPath, 0o600);
  const fake = runtime();
  try {
    const result = await activation.enablePublicReadOnly({
      environmentPath,
      operations: fake.operations,
      enforceRootOwnership: false,
    });
    assert.deepEqual(result, {
      changed: true,
      webRestarted: true,
      workerUnchanged: true,
      publicProfile: "read-only",
      publicSearch: "available",
      publicSnapshot: "available",
      timbersteelFingerprints: "unchanged",
    });
    assert.deepEqual(fake.restarts, ["bitcraft-claim-monitor-relay.service"]);
    assert.match(readFileSync(environmentPath, "utf8"), /^PUBLIC_PROFILE_ENABLED=true$/m);
    assert.match(readFileSync(environmentPath, "utf8"), /^PUBLIC_COLLABORATION_ENABLED=false$/m);
    assert.match(readFileSync(environmentPath, "utf8"), /^PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=true$/m);
    assert.deepEqual(fake.snapshots, [["42", ["claim", "members", "citizens", "inventories", "crafts"]]]);
    assert.equal(fake.fingerprintChecks.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [name, options, message] of [
  ["public search verification failure", { failSearch: true }, /search verification/i],
  ["public snapshot verification failure", { failSnapshot: true }, /snapshot verification/i],
  ["Timbersteel fingerprint verification failure", { failFingerprints: true }, /history\/outbox prefix/i],
  ["worker PID change", { workerChanges: true }, /worker changed/i],
]) {
  test(`Stage 1 restores the disabled environment after ${name}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-readonly-rollback-"));
    const environmentPath = join(root, "relay.env");
    writeFileSync(environmentPath, disabledEnvironment);
    chmodSync(environmentPath, 0o600);
    const fake = runtime(options);
    try {
      await assert.rejects(activation.enablePublicReadOnly({
        environmentPath,
        operations: fake.operations,
        enforceRootOwnership: false,
      }), message);
      assert.equal(readFileSync(environmentPath, "utf8"), disabledEnvironment);
      assert.deepEqual(fake.restarts, [
        "bitcraft-claim-monitor-relay.service",
        "bitcraft-claim-monitor-relay.service",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("Stage 1 reports rollback failure unless disabled public gates are proven restored", async () => {
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-readonly-rollback-proof-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, disabledEnvironment);
  chmodSync(environmentPath, 0o600);
  const fake = runtime({ failSearch: true, rollbackProfileStaysEnabled: true });
  try {
    await assert.rejects(activation.enablePublicReadOnly({
      environmentPath,
      operations: fake.operations,
      enforceRootOwnership: false,
    }), /rollback could not restore the disabled public profile/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Stage 1 emergency disable restarts only web and proves public routes are closed", async () => {
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-readonly-disable-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, activation.editPublicReadOnlyEnvironment(disabledEnvironment));
  chmodSync(environmentPath, 0o600);
  const restarts = [];
  const operations = {
    getServicePid(service) { return service.includes("worker") ? "4242" : "5151"; },
    restartService(service) { restarts.push(service); },
    async waitForWebHealth() {},
    readProcessEnvironment() {
      return new Map([
        ["PUBLIC_ORIGIN", "https://claim-monitor.com"],
        ["PUBLIC_PROFILE_ENABLED", "false"],
        ["PUBLIC_COLLABORATION_ENABLED", "false"],
        ["PUBLIC_LEGAL_CONFIGURATION_CONFIRMED", "false"],
      ]);
    },
    async readPublicProfile() { return publicProfile(false); },
    async readPublicSearch() { return { status: 404, body: { error: "Not found" } }; },
    stopService(service) { restarts.push(`stop:${service}`); },
  };
  try {
    const result = await activation.disablePublicReadOnly({ environmentPath, operations, enforceRootOwnership: false });
    assert.deepEqual(result, { changed: true, webRestarted: true, workerUnchanged: true, publicProfile: "disabled" });
    assert.deepEqual(restarts, ["bitcraft-claim-monitor-relay.service"]);
    assert.match(readFileSync(environmentPath, "utf8"), /^PUBLIC_PROFILE_ENABLED=false$/m);
    assert.match(readFileSync(environmentPath, "utf8"), /^PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=false$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Stage 1 emergency disable stops web when disabled runtime cannot be proven", async () => {
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-readonly-disable-failure-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, activation.editPublicReadOnlyEnvironment(disabledEnvironment));
  chmodSync(environmentPath, 0o600);
  const actions = [];
  const operations = {
    getServicePid(service) { return service.includes("worker") ? "4242" : "5151"; },
    restartService(service) { actions.push(`restart:${service}`); },
    stopService(service) { actions.push(`stop:${service}`); },
    async waitForWebHealth() { throw new Error("health failed"); },
    async readPublicProfile() { return publicProfile(true); },
    async readPublicSearch() { return { status: 200, body: { hints: [] } }; },
    readProcessEnvironment() { return new Map(); },
  };
  try {
    await assert.rejects(
      activation.disablePublicReadOnly({ environmentPath, operations, enforceRootOwnership: false }),
      /web service was stopped/i,
    );
    assert.deepEqual(actions, [
      "restart:bitcraft-claim-monitor-relay.service",
      "stop:bitcraft-claim-monitor-relay.service",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Stage 1 emergency disable stops a stale enabled process when flags were already disabled", async () => {
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-public-readonly-disable-retry-"));
  const environmentPath = join(root, "relay.env");
  writeFileSync(environmentPath, activation.editPublicDisabledEnvironment(disabledEnvironment));
  chmodSync(environmentPath, 0o600);
  const actions = [];
  const operations = {
    getServicePid(service) { return service.includes("worker") ? "4242" : "5151"; },
    restartService(service) { actions.push(`restart:${service}`); },
    stopService(service) { actions.push(`stop:${service}`); },
    async waitForWebHealth() {},
    async readPublicProfile() { return publicProfile(true); },
    async readPublicSearch() { return { status: 200, body: { hints: [] } }; },
    readProcessEnvironment() {
      return new Map([
        ["PUBLIC_ORIGIN", "https://claim-monitor.com"],
        ["PUBLIC_PROFILE_ENABLED", "true"],
        ["PUBLIC_COLLABORATION_ENABLED", "false"],
        ["PUBLIC_LEGAL_CONFIGURATION_CONFIRMED", "true"],
      ]);
    },
  };
  try {
    await assert.rejects(
      activation.disablePublicReadOnly({ environmentPath, operations, enforceRootOwnership: false }),
      /web service was stopped/i,
    );
    assert.deepEqual(actions, ["stop:bitcraft-claim-monitor-relay.service"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
