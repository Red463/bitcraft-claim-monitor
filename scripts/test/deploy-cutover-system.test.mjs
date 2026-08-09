import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  createSystemCutoverOperations,
  validateCaddyTopology,
} from "../../deploy/cutover-relay-production.mjs";
import {
  createCanonicalCutoverPrivacyPlan,
} from "../../apps/bitcraft-local/src/server/canonicalCutoverPrivacy.mjs";
import {
  deletionLedgerSubject,
  signDeletionLedgerRecord,
} from "../../apps/bitcraft-local/src/server/privacyDeletionLedger.mjs";

const REVISION = "a".repeat(40);
const MANIFEST_HASH = "b".repeat(64);

function hostRoute(host, handles, match = {}) {
  return { match: [{ host: [host], ...match }], handle: [{ handler: "subroute", routes: handles.map((handle) => ({ handle: [handle] })) }] };
}

function proxy(dial) {
  return { handler: "reverse_proxy", upstreams: [{ dial }] };
}

function response(statusCode, location = null) {
  return {
    handler: "static_response",
    status_code: statusCode,
    ...(location ? { headers: { Location: [location] } } : {}),
  };
}

function caddy(routes) {
  return { apps: { http: { servers: { srv0: { routes } } } } };
}

test("semantic Caddy validation accepts only the supported preflight, maintenance, and final topologies", () => {
  const claims = [
    hostRoute("claim.timbersteeltrade.com", [response(308, "https://app.timbersteeltrade.com{http.request.uri}")]),
    hostRoute("claim.hostred.co.uk", [response(308, "https://app.timbersteeltrade.com{http.request.uri}")]),
  ];
  const preflight = caddy([
    hostRoute("app.timbersteeltrade.com", [proxy("127.0.0.1:18430")]),
    hostRoute("relay.timbersteeltrade.com", [proxy("127.0.0.1:19430")]),
    ...claims,
  ]);
  const maintenance = caddy([
    hostRoute("app.timbersteeltrade.com", [
      { handler: "subroute", routes: [{ match: [{ remote_ip: { ranges: ["127.0.0.1", "::1"] } }], handle: [proxy("127.0.0.1:19430")] }] },
      response(503),
    ]),
    hostRoute("relay.timbersteeltrade.com", [response(503)]),
    ...claims,
  ]);
  const final = caddy([
    hostRoute("app.timbersteeltrade.com", [proxy("127.0.0.1:19430")]),
    hostRoute("relay.timbersteeltrade.com", [response(308, "https://app.timbersteeltrade.com{http.request.uri}")]),
    ...claims,
  ]);

  assert.doesNotThrow(() => validateCaddyTopology(preflight, "preflight"));
  assert.doesNotThrow(() => validateCaddyTopology(maintenance, "maintenance"));
  assert.doesNotThrow(() => validateCaddyTopology(final, "final"));
  assert.throws(
    () => validateCaddyTopology(caddy([...preflight.apps.http.servers.srv0.routes, hostRoute("unknown.example", [response(200)])]), "preflight"),
    /unknown.*site|host set/i,
  );
  assert.throws(
    () => validateCaddyTopology(caddy([hostRoute("app.timbersteeltrade.com", [proxy("127.0.0.1:19430")]), hostRoute("relay.timbersteeltrade.com", [proxy("127.0.0.1:19430")]), ...claims]), "preflight"),
    /18430|pre-cutover/i,
  );
  assert.throws(
    () => validateCaddyTopology(caddy([hostRoute("app.timbersteeltrade.com", [proxy("127.0.0.1:19430")]), hostRoute("relay.timbersteeltrade.com", [response(503)]), ...claims]), "final"),
    /redirect|final/i,
  );
  const unknownHandler = structuredClone(preflight);
  unknownHandler.apps.http.servers.srv0.routes[0].handle[0].routes.push({ handle: [{ handler: "file_server" }] });
  assert.throws(() => validateCaddyTopology(unknownHandler, "preflight"), /unsupported Caddy handler/i);
  const unknownMatcher = structuredClone(preflight);
  unknownMatcher.apps.http.servers.srv0.routes[0].handle[0].routes.push({
    match: [{ path: ["/operator-only"] }],
    handle: [{ handler: "headers", response: { set: { "X-Operator": ["present"] } } }],
  });
  assert.throws(() => validateCaddyTopology(unknownMatcher, "preflight"), /unsupported Caddy route matcher/i);
  const extraSupportedResponse = structuredClone(preflight);
  extraSupportedResponse.apps.http.servers.srv0.routes[0].handle[0].routes.push({
    handle: [response(200)],
  });
  assert.throws(
    () => validateCaddyTopology(extraSupportedResponse, "preflight"),
    /extra|response|topology/i,
  );
  const publicCanaryAlternative = structuredClone(maintenance);
  publicCanaryAlternative.apps.http.servers.srv0.routes[0].handle[0].routes[0]
    .handle[0].routes[0].match.push({});
  assert.throws(
    () => validateCaddyTopology(publicCanaryAlternative, "maintenance"),
    /empty|matcher/i,
  );
  const hostlessAlternative = structuredClone(preflight);
  hostlessAlternative.apps.http.servers.srv0.routes[0].match.push({});
  assert.throws(
    () => validateCaddyTopology(hostlessAlternative, "preflight"),
    /empty|matcher/i,
  );
});

function privacyFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "relay-cutover-privacy-system-"));
  const sourceConfigRoot = path.join(root, "old-config");
  const targetConfigRoot = path.join(root, "relay-config");
  const sourceBackupRoot = path.join(root, "old-backups");
  const targetBackupRoot = path.join(root, "relay-backups");
  for (const directory of [sourceConfigRoot, targetConfigRoot, sourceBackupRoot, targetBackupRoot]) mkdirSync(directory);
  const sourceKeyFilePath = path.join(sourceConfigRoot, "privacy.key");
  const targetKeyFilePath = path.join(targetConfigRoot, "privacy.key");
  const installedPreviousKeyFilePath = path.join(targetConfigRoot, "privacy.previous.key");
  const sourceLedgerPath = path.join(sourceBackupRoot, "privacy.jsonl");
  const targetLedgerPath = path.join(targetBackupRoot, "privacy.jsonl");
  const readinessArtifactPath = path.join(targetBackupRoot, "cutover-ready.json");
  writeFileSync(sourceKeyFilePath, `${Buffer.alloc(32, 3).toString("base64url")}\n`, { mode: 0o640 });
  writeFileSync(targetKeyFilePath, `${Buffer.alloc(32, 7).toString("base64url")}\n`, { mode: 0o640 });
  const sourceKey = Buffer.alloc(32, 3).toString("base64url");
  const sourceRecord = signDeletionLedgerRecord({
    version: 1,
    operationId: "cutover-source-operation",
    state: "committed",
    subject: deletionLedgerSubject("111111111111111111", sourceKey),
    occurredAt: "2026-08-08T12:00:00.000Z",
    expiresAt: "2026-11-06T12:00:00.000Z",
  }, sourceKey);
  writeFileSync(sourceLedgerPath, `${JSON.stringify(sourceRecord)}\n`, { mode: 0o600 });
  writeFileSync(targetLedgerPath, "", { mode: 0o600 });
  const plan = createCanonicalCutoverPrivacyPlan({
    sourceLedgerPath,
    targetLedgerPath,
    sourceKeyFilePath,
    targetKeyFilePath,
    targetPreviousKeyFilePaths: [],
    installedPreviousKeyFilePath,
    readinessArtifactPath,
    sourceConfigRoot,
    targetConfigRoot,
    sourceBackupRoot,
    targetBackupRoot,
    manifestCreatedAt: "2026-08-09T12:00:00.000Z",
  });
  const relayEnvironmentFile = path.join(root, "relay.env");
  writeFileSync(relayEnvironmentFile, [
    "NODE_ENV=production",
    "BITCRAFT_DEPLOYMENT_MODE=preview",
    "DISCORD_DELIVERY_MODE=record",
    "ENABLE_DISCORD_STARTUP=false",
    "DISCORD_BOT_TOKEN=secret-value",
    "",
  ].join("\n"), { mode: 0o600 });
  return {
    root,
    paths: { relayEnvironmentFile, relayConfigRoot: targetConfigRoot },
    plan,
  };
}

test("system privacy handshake copies with current-key metadata, edits atomically, verifies, and restores by identity", async () => {
  const fixture = privacyFixture();
  try {
    const operations = createSystemCutoverOperations({
      paths: fixture.paths,
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });
    const state = {
      revision: REVISION,
      manifestHash: MANIFEST_HASH,
      migration: { privacy: { plan: fixture.plan } },
      preApply: {},
    };
    const originalEnvironment = readFileSync(fixture.paths.relayEnvironmentFile);
    await operations.installPreviousPrivacyKey(state);
    assert.equal(state.preApply.previousKey.path, fixture.plan.previousKeyConfiguration.installedOldKeyPath);
    await operations.editCanonicalEnvironment(state);
    assert.equal(state.preApply.environment.path, fixture.paths.relayEnvironmentFile);
    await operations.writePrivacyReadiness(state);
    assert.equal(state.preApply.readiness.path, fixture.plan.readinessArtifact.path);
    await operations.verifyPrivacyReadiness(state);

    assert.deepEqual(readFileSync(fixture.plan.previousKeyConfiguration.installedOldKeyPath), readFileSync(fixture.plan.source.key.path));
    const edited = readFileSync(fixture.paths.relayEnvironmentFile, "utf8");
    assert.match(edited, /^BITCRAFT_DEPLOYMENT_MODE=canonical$/m);
    assert.match(edited, /^DISCORD_DELIVERY_MODE=live$/m);
    assert.match(edited, /^ENABLE_DISCORD_STARTUP=true$/m);
    assert.match(edited, /^PRIVACY_LEDGER_PREVIOUS_KEY_FILES=.*privacy\.previous\.key$/m);
    assert.match(edited, /DISCORD_BOT_TOKEN=secret-value/);

    await operations.restoreEnvironment(state);
    await operations.removeCreatedReadiness(state);
    await operations.removeCreatedPreviousKey(state);
    assert.deepEqual(readFileSync(fixture.paths.relayEnvironmentFile), originalEnvironment);
    assert.equal(existsSync(fixture.plan.readinessArtifact.path), false);
    assert.equal(existsSync(fixture.plan.previousKeyConfiguration.installedOldKeyPath), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system privacy handshake refuses pre-existing destinations", async () => {
  const fixture = privacyFixture();
  try {
    writeFileSync(fixture.plan.previousKeyConfiguration.installedOldKeyPath, "operator-owned", { mode: 0o600 });
    const operations = createSystemCutoverOperations({ paths: fixture.paths });
    await assert.rejects(
      operations.installPreviousPrivacyKey({ migration: { privacy: { plan: fixture.plan } }, preApply: {} }),
      /already exists|refus/i,
    );
    assert.equal(readFileSync(fixture.plan.previousKeyConfiguration.installedOldKeyPath, "utf8"), "operator-owned");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system privacy readiness is not written until the installed key and exact environment are reread", async () => {
  const fixture = privacyFixture();
  try {
    const operations = createSystemCutoverOperations({ paths: fixture.paths });
    const state = {
      revision: REVISION,
      manifestHash: MANIFEST_HASH,
      migration: { privacy: { plan: fixture.plan } },
      preApply: {},
    };
    await operations.installPreviousPrivacyKey(state);
    await operations.editCanonicalEnvironment(state);
    writeFileSync(fixture.paths.relayEnvironmentFile, "BITCRAFT_DEPLOYMENT_MODE=preview\n", { mode: 0o600 });
    await assert.rejects(operations.writePrivacyReadiness(state), /environment.*identity|readiness mismatch/i);
    assert.equal(existsSync(fixture.plan.readinessArtifact.path), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("privacy mutations persist recovery intent before their post-write checkpoint", async () => {
  const fixture = privacyFixture();
  try {
    const operations = createSystemCutoverOperations({ paths: fixture.paths });
    const initialState = () => ({
      revision: REVISION,
      manifestHash: MANIFEST_HASH,
      migration: { privacy: { plan: fixture.plan } },
      preApply: {},
    });
    const failSecondCheckpoint = () => {
      let calls = 0;
      let persisted;
      return {
        checkpoint(state) {
          calls += 1;
          if (calls === 2) throw new Error("injected post-write checkpoint failure");
          persisted = structuredClone(state);
        },
        persisted: () => persisted,
      };
    };

    const keyState = initialState();
    const keyCheckpoint = failSecondCheckpoint();
    await assert.rejects(
      operations.installPreviousPrivacyKey(keyState, keyCheckpoint.checkpoint),
      /post-write checkpoint/i,
    );
    assert.ok(keyCheckpoint.persisted().preApply.previousKeyIntent);
    await operations.removeCreatedPreviousKey(keyCheckpoint.persisted());
    assert.equal(existsSync(fixture.plan.previousKeyConfiguration.installedOldKeyPath), false);

    const environmentState = initialState();
    const originalEnvironment = readFileSync(fixture.paths.relayEnvironmentFile);
    const environmentCheckpoint = failSecondCheckpoint();
    await assert.rejects(
      operations.editCanonicalEnvironment(environmentState, environmentCheckpoint.checkpoint),
      /post-write checkpoint/i,
    );
    assert.ok(environmentCheckpoint.persisted().preApply.environmentIntent);
    await operations.restoreEnvironment(environmentCheckpoint.persisted());
    assert.deepEqual(readFileSync(fixture.paths.relayEnvironmentFile), originalEnvironment);

    const readinessState = initialState();
    await operations.installPreviousPrivacyKey(readinessState);
    await operations.editCanonicalEnvironment(readinessState);
    const readinessCheckpoint = failSecondCheckpoint();
    await assert.rejects(
      operations.writePrivacyReadiness(readinessState, readinessCheckpoint.checkpoint),
      /post-write checkpoint/i,
    );
    assert.ok(readinessCheckpoint.persisted().preApply.readinessIntent);
    await operations.removeCreatedReadiness(readinessCheckpoint.persisted());
    assert.equal(existsSync(fixture.plan.readinessArtifact.path), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("privacy recovery intents remove abandoned pre-publication staging files", async () => {
  const fixture = privacyFixture();
  try {
    const operations = createSystemCutoverOperations({ paths: fixture.paths });
    const initialState = () => ({
      revision: REVISION,
      manifestHash: MANIFEST_HASH,
      migration: { privacy: { plan: fixture.plan } },
      preApply: {},
    });
    const captureIntent = () => {
      let persisted;
      return {
        checkpoint(state) {
          persisted = structuredClone(state);
          throw new Error("simulated crash after intent checkpoint");
        },
        persisted: () => persisted,
      };
    };

    const keyCapture = captureIntent();
    await assert.rejects(
      operations.installPreviousPrivacyKey(initialState(), keyCapture.checkpoint),
      /simulated crash/i,
    );
    const keyState = keyCapture.persisted();
    assert.equal(typeof keyState.preApply.previousKeyIntent.temporaryPath, "string", "key intent must record its staging path");
    writeFileSync(keyState.preApply.previousKeyIntent.temporaryPath, "partial-key", { mode: 0o600 });
    await operations.removeCreatedPreviousKey(keyState);
    assert.equal(existsSync(keyState.preApply.previousKeyIntent.temporaryPath), false);
    assert.equal(existsSync(fixture.plan.previousKeyConfiguration.installedOldKeyPath), false);

    const originalEnvironment = readFileSync(fixture.paths.relayEnvironmentFile);
    const environmentCapture = captureIntent();
    await assert.rejects(
      operations.editCanonicalEnvironment(initialState(), environmentCapture.checkpoint),
      /simulated crash/i,
    );
    const environmentState = environmentCapture.persisted();
    assert.equal(typeof environmentState.preApply.environmentIntent.temporaryPath, "string", "environment intent must record its staging path");
    writeFileSync(environmentState.preApply.environmentIntent.temporaryPath, "partial-environment", { mode: 0o600 });
    await operations.restoreEnvironment(environmentState);
    assert.equal(existsSync(environmentState.preApply.environmentIntent.temporaryPath), false);
    assert.deepEqual(readFileSync(fixture.paths.relayEnvironmentFile), originalEnvironment);

    const readinessState = initialState();
    await operations.installPreviousPrivacyKey(readinessState);
    await operations.editCanonicalEnvironment(readinessState);
    const readinessCapture = captureIntent();
    await assert.rejects(
      operations.writePrivacyReadiness(readinessState, readinessCapture.checkpoint),
      /simulated crash/i,
    );
    const persistedReadiness = readinessCapture.persisted();
    assert.equal(typeof persistedReadiness.preApply.readinessIntent.temporaryPath, "string", "readiness intent must record its staging path");
    writeFileSync(persistedReadiness.preApply.readinessIntent.temporaryPath, "partial-readiness", { mode: 0o600 });
    await operations.removeCreatedReadiness(persistedReadiness);
    assert.equal(existsSync(persistedReadiness.preApply.readinessIntent.temporaryPath), false);
    assert.equal(existsSync(fixture.plan.readinessArtifact.path), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function preflightCaddy(mode) {
  const claims = [
    hostRoute("claim.timbersteeltrade.com", [response(308, "https://app.timbersteeltrade.com{http.request.uri}")]),
    hostRoute("claim.hostred.co.uk", [response(308, "https://app.timbersteeltrade.com{http.request.uri}")]),
  ];
  if (mode === "preflight") return caddy([
    hostRoute("app.timbersteeltrade.com", [proxy("127.0.0.1:18430")]),
    hostRoute("relay.timbersteeltrade.com", [proxy("127.0.0.1:19430")]),
    ...claims,
  ]);
  if (mode === "maintenance") return caddy([
    hostRoute("app.timbersteeltrade.com", [
      { handler: "subroute", routes: [{ match: [{ remote_ip: { ranges: ["127.0.0.1", "::1"] } }], handle: [proxy("127.0.0.1:19430")] }] },
      response(503),
    ]),
    hostRoute("relay.timbersteeltrade.com", [response(503)]),
    ...claims,
  ]);
  return caddy([
    hostRoute("app.timbersteeltrade.com", [proxy("127.0.0.1:19430")]),
    hostRoute("relay.timbersteeltrade.com", [response(308, "https://app.timbersteeltrade.com{http.request.uri}")]),
    ...claims,
  ]);
}

function createOperationalDatabase(databasePath, { source = false } = {}) {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE app_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE production_contributions (
        contribution_key TEXT PRIMARY KEY, contributed_progress TEXT, contributed_xp TEXT, contribution_count TEXT
      );
      CREATE TABLE production_contribution_events (
        source_key TEXT PRIMARY KEY, contributed_progress TEXT, contributed_xp TEXT
      );
      CREATE TABLE market_events (id INTEGER PRIMARY KEY, quantity TEXT, price TEXT, total_value TEXT);
      CREATE TABLE market_trades (trade_id TEXT PRIMARY KEY, quantity TEXT, unit_price TEXT, total_price TEXT);
      CREATE TABLE provider_subscription_health (
        provider TEXT, source_key TEXT, domain TEXT, generation INTEGER, connected INTEGER, last_error TEXT,
        PRIMARY KEY (provider, source_key, domain)
      );
      CREATE TABLE discord_notification_outbox (id INTEGER PRIMARY KEY, status TEXT);
      CREATE TABLE user_accounts (id INTEGER PRIMARY KEY, discord_id TEXT);
    `);
    const set = db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, '2026-08-09T12:00:00.000Z')");
    set.run("claim_id", "1369094286777412590");
    set.run("branding_json", "{}");
    if (source) set.run("discord_json", JSON.stringify({
      enabled: true,
      applicationId: "123456789",
      guildId: "987654321",
      channelId: "555555555",
      channels: { announcements: "555555555", notifications: "555555555" },
      presence: { enabled: true },
    }));
    else db.prepare(`
      INSERT INTO provider_subscription_health
        (provider, source_key, domain, generation, connected, last_error)
      VALUES ('relay', 'global', 'catalogs', 8, 1, NULL)
    `).run();
  } finally {
    db.close();
  }
}

function systemFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "relay-cutover-system-preflight-"));
  const releasesDirectory = path.join(root, "releases");
  const release = path.join(releasesDirectory, REVISION);
  const currentRelease = path.join(root, "current");
  const sourceCheckout = path.join(root, "source-checkout");
  const stateDirectory = path.join(root, "cutover-state");
  const relayBackupRoot = path.join(root, "relay-backups");
  const sourceBackupRoot = path.join(root, "old-backups");
  const relayConfigRoot = path.join(root, "relay-config");
  const sourceConfigRoot = path.join(root, "old-config");
  const sourceBrandingDirectory = path.join(root, "old-branding");
  const targetBrandingDirectory = path.join(root, "relay-branding");
  for (const directory of [
    releasesDirectory, release, sourceCheckout, stateDirectory, relayBackupRoot, sourceBackupRoot,
    relayConfigRoot, sourceConfigRoot, sourceBrandingDirectory, targetBrandingDirectory,
    path.join(release, "apps", "bitcraft-local"), path.join(release, "scripts"), path.join(release, "deploy"),
  ]) mkdirSync(directory, { recursive: true });
  symlinkSync(release, currentRelease, process.platform === "win32" ? "junction" : "dir");
  writeFileSync(path.join(release, "apps", "bitcraft-local", "package.json"), JSON.stringify({ version: "0.52.0-beta.1" }));
  writeFileSync(path.join(release, "scripts", "repair-relay-canonical-cutover.mjs"), "// fixture\n");
  const sourceDatabasePath = path.join(root, "old.sqlite");
  const targetDatabasePath = path.join(root, "relay.sqlite");
  createOperationalDatabase(sourceDatabasePath, { source: true });
  createOperationalDatabase(targetDatabasePath);
  const sourceEnvironmentFile = path.join(root, "old.env");
  const relayEnvironmentFile = path.join(root, "relay.env");
  writeFileSync(sourceEnvironmentFile, "NODE_ENV=production\n", { mode: 0o600 });
  writeFileSync(relayEnvironmentFile, [
    "NODE_ENV=production",
    "ENABLE_RELAY_PROVIDER=true",
    "BITCRAFT_DEPLOYMENT_MODE=preview",
    "DISCORD_DELIVERY_MODE=record",
    "ENABLE_DISCORD_STARTUP=false",
    "LEGAL_CONFIGURATION_CONFIRMED=true",
    "DISCORD_BOT_TOKEN=fixture-secret-never-returned",
    "DISCORD_APPLICATION_ID=123456789",
    "DISCORD_GUILD_ID=987654321",
    "DISCORD_CHANNEL_ID=555555555",
    "",
  ].join("\n"), { mode: 0o600 });
  const sourcePrivacyKey = path.join(sourceConfigRoot, "privacy.key");
  const relayPrivacyKey = path.join(relayConfigRoot, "privacy.key");
  writeFileSync(sourcePrivacyKey, `${Buffer.alloc(32, 2).toString("base64url")}\n`, { mode: 0o600 });
  writeFileSync(relayPrivacyKey, `${Buffer.alloc(32, 4).toString("base64url")}\n`, { mode: 0o600 });
  const backupEncryptionKeyFile = path.join(relayConfigRoot, "backup.key");
  const backupHelper = path.join(root, "backup-helper");
  const backupCryptoHelper = path.join(root, "backup-crypto.mjs");
  writeFileSync(backupEncryptionKeyFile, `${Buffer.alloc(32, 6).toString("base64url")}\n`, { mode: 0o600 });
  writeFileSync(backupHelper, "#!/bin/sh\n", { mode: 0o700 });
  writeFileSync(backupCryptoHelper, "// fixture\n", { mode: 0o600 });
  const liveCaddyFile = path.join(root, "Caddyfile");
  const maintenanceCaddyCandidate = path.join(release, "deploy", "Caddyfile.cutover-maintenance");
  const finalCaddyCandidate = path.join(release, "deploy", "Caddyfile.example");
  writeFileSync(liveCaddyFile, "preflight\n");
  writeFileSync(maintenanceCaddyCandidate, "maintenance\n");
  writeFileSync(finalCaddyCandidate, "final\n");
  const paths = {
    releasesDirectory,
    currentRelease,
    sourceCheckout,
    stateDirectory,
    relayBackupRoot,
    sourceBackupRoot,
    relayConfigRoot,
    sourceConfigRoot,
    sourceBrandingDirectory,
    targetBrandingDirectory,
    sourceDatabasePath,
    targetDatabasePath,
    sourceEnvironmentFile,
    relayEnvironmentFile,
    sourcePrivacyLedger: path.join(sourceBackupRoot, "privacy.jsonl"),
    relayPrivacyLedger: path.join(relayBackupRoot, "privacy.jsonl"),
    sourcePrivacyKey,
    relayPrivacyKey,
    installedPreviousPrivacyKey: path.join(relayConfigRoot, "previous.key"),
    privacyReadinessArtifact: path.join(relayBackupRoot, "ready.json"),
    backupEncryptionKeyFile,
    backupHelper,
    backupCryptoHelper,
    liveCaddyFile,
    maintenanceCaddyCandidate,
    finalCaddyCandidate,
    updater: path.join(root, "updater"),
  };
  const unitState = new Map();
  const allUnits = [
    "bitcraft-claim-monitor.service", "bitcraft-claim-monitor-worker.service",
    "bitcraft-monitor-collector.service", "bitcraft-monitor-collector.timer",
    "bitcraft-claim-monitor-backup.service", "bitcraft-claim-monitor-backup.timer",
    "bitcraft-claim-monitor-relay.service", "bitcraft-claim-monitor-relay-worker.service",
    "bitcraft-claim-monitor-relay-collector.service", "bitcraft-claim-monitor-relay-collector.timer",
    "bitcraft-claim-monitor-relay-backup.service", "bitcraft-claim-monitor-relay-backup.timer",
  ];
  for (const unit of allUnits) unitState.set(unit, {
    active: unit.includes("collector.service") || unit.includes("backup.service") ? "inactive" : "active",
    enabled: unit.endsWith(".timer") || /(?:^|-)worker\.service$/.test(unit) || /monitor(?:-relay)?\.service$/.test(unit) ? "enabled" : "static",
    pid: unit === "bitcraft-claim-monitor-worker.service" ? "101" : unit === "bitcraft-claim-monitor-relay-worker.service" ? "202" : "0",
  });
  const calls = [];
  const runtime = { mode: "preview" };
  const modeForConfig = (configPath) => readFileSync(configPath, "utf8").trim();
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === "sudo") return {
      status: 0,
      stdout: args.includes("rev-parse") ? `${REVISION}\n` : "",
      stderr: "",
    };
    if (command === "caddy" && args[0] === "validate") return { status: 0, stdout: "", stderr: "" };
    if (command === "caddy" && args[0] === "reload") return { status: 0, stdout: "", stderr: "" };
    if (command === "caddy" && args[0] === "adapt") {
      const configPath = args[args.indexOf("--config") + 1];
      return { status: 0, stdout: JSON.stringify(preflightCaddy(modeForConfig(configPath))), stderr: "" };
    }
    if (command === "systemctl" && args[0] === "show") {
      const unit = args[1];
      const property = args.find((argument) => argument.startsWith("--property="))?.slice("--property=".length);
      const state = unitState.get(unit) ?? { active: "active", enabled: "enabled", pid: "0" };
      const values = {
        LoadState: "loaded", FragmentPath: `/etc/systemd/system/${unit}`,
        ActiveState: state.active, UnitFileState: state.enabled, MainPID: state.pid,
        EnvironmentFiles: unit === "bitcraft-claim-monitor.service" ? sourceEnvironmentFile
          : unit === "bitcraft-claim-monitor-relay.service" ? relayEnvironmentFile : "",
        Environment: unit === "bitcraft-claim-monitor.service"
          ? `PRIVACY_LEDGER_PATH=${paths.sourcePrivacyLedger} PRIVACY_LEDGER_KEY_FILE=${sourcePrivacyKey}`
          : unit === "bitcraft-claim-monitor-relay.service"
            ? `PRIVACY_LEDGER_PATH=${paths.relayPrivacyLedger} PRIVACY_LEDGER_KEY_FILE=${relayPrivacyKey}` : "",
      };
      return { status: 0, stdout: `${values[property] ?? ""}\n`, stderr: "" };
    }
    if (command === "systemctl" && ["stop", "start", "enable", "disable", "mask"].includes(args[0])) {
      for (const unit of args.filter((argument) => unitState.has(argument))) {
        const state = unitState.get(unit);
        if (args[0] === "stop" || (args[0] === "disable" && args.includes("--now"))) { state.active = "inactive"; state.pid = "0"; }
        if (args[0] === "start" || (args[0] === "enable" && args.includes("--now"))) {
          state.active = "active";
          if (unit === "bitcraft-claim-monitor-relay-worker.service") state.pid = "202";
          if (unit === "bitcraft-claim-monitor-worker.service") state.pid = "101";
        }
        if (args[0] === "enable") state.enabled = "enabled";
        if (args[0] === "disable") state.enabled = "disabled";
        if (args[0] === "mask") state.enabled = "masked";
      }
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "systemctl" && args[0] === "is-active") return { status: 0, stdout: "active\n", stderr: "" };
    if (command === "systemd-run") return { status: 0, stdout: "", stderr: "" };
    if (command === "ss") return { status: 0, stdout: "", stderr: "" };
    if (command === "pgrep") {
      const active = [
        ["bitcraft-claim-monitor-worker.service", "101 /old/apps/bitcraft-local/worker.mjs"],
        ["bitcraft-claim-monitor-relay-worker.service", "202 /relay/apps/bitcraft-local/worker.mjs"],
      ].filter(([unit]) => unitState.get(unit).active === "active").map(([, line]) => line);
      return { status: active.length ? 0 : 1, stdout: active.join("\n"), stderr: "" };
    }
    if (command === "curl") {
      if (args.includes("--write-out")) return { status: 0, stdout: "308\nhttps://app.timbersteeltrade.com/cutover-path?probe=1", stderr: "" };
      if (args.includes("--head")) return { status: 0, stdout: [
        "HTTP/2 200", "x-content-type-options: nosniff", "referrer-policy: strict-origin-when-cross-origin",
        "permissions-policy: camera=()", "x-frame-options: SAMEORIGIN", "",
      ].join("\n"), stderr: "" };
      if (args.at(-1).includes("/api/local/health")) return { status: 0, stdout: JSON.stringify({
        ok: true,
        deploymentMode: runtime.mode,
        canonicalOrigin: "https://app.timbersteeltrade.com",
        discordReady: runtime.mode === "canonical",
        version: "0.52.0-beta.1",
        buildSha: REVISION,
      }), stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const request = async (url) => {
    const payload = url.endsWith("/users/@me") ? { id: "123456789" }
      : url.endsWith("/oauth2/applications/@me") ? { id: "123456789", redirect_uris: ["https://app.timbersteeltrade.com/api/local/auth/discord/callback"] }
        : url.endsWith("/guilds/987654321") ? { id: "987654321" }
          : { id: "555555555", guild_id: "987654321", type: 0 };
    return { ok: true, status: 200, json: async () => payload };
  };
  return { root, paths, calls, run, request, runtime, unitState };
}

test("system preflight enforces exact main/current/version and discovers validated runtime inputs without returning secrets", async () => {
  const fixture = systemFixture();
  try {
    const target = new DatabaseSync(fixture.paths.targetDatabasePath);
    try {
      target.prepare(`
        INSERT INTO production_contributions
          (contribution_key, contributed_progress, contributed_xp, contribution_count)
        VALUES (?, ?, ?, ?)
      `).run("large-a", "9007199254740992", "0.1", "1");
      target.prepare(`
        INSERT INTO production_contributions
          (contribution_key, contributed_progress, contributed_xp, contribution_count)
        VALUES (?, ?, ?, ?)
      `).run("large-b", "1", "0.2", "2");
    } finally {
      target.close();
    }
    const operations = createSystemCutoverOperations({
      paths: fixture.paths,
      run: fixture.run,
      request: fixture.request,
      statFilesystem: () => ({ bavail: 4n * 1024n * 1024n, bsize: 1024n }),
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });
    const preflight = await operations.validatePrepare({ revision: REVISION });
    assert.equal(preflight.version, "0.52.0-beta.1");
    assert.equal(preflight.claimId, "1369094286777412590");
    assert.equal(preflight.discoveredPaths.sourceKeyPath, fixture.paths.sourcePrivacyKey);
    assert.equal(preflight.subscriptions.count, 1);
    assert.equal(preflight.operationalTotals.contributions.aggregates.contributed_progress, "9007199254740993");
    assert.equal(preflight.operationalTotals.contributions.aggregates.contributed_xp, "0.3");
    assert.doesNotMatch(JSON.stringify(preflight), /fixture-secret-never-returned/);
    assert.ok(fixture.calls.some((call) => call[0] === "sudo" && call.includes("fetch") && call.at(-1) === "main"));
    assert.ok(fixture.calls.some((call) => call[0] === "sudo" && call.includes("rev-parse") && call.at(-1) === "origin/main"));

    await assert.rejects(
      operations.verifyPrepared({ revision: "c".repeat(40) }),
      /current Relay symlink.*prepared revision/i,
    );

    const rejecting = createSystemCutoverOperations({
      paths: fixture.paths,
      run: (command, args) => command === "sudo" && args.includes("rev-parse")
        ? { status: 0, stdout: `${"c".repeat(40)}\n`, stderr: "" }
        : fixture.run(command, args),
      request: fixture.request,
      statFilesystem: () => ({ bavail: 4n * 1024n * 1024n, bsize: 1024n }),
    });
    await assert.rejects(rejecting.validatePrepare({ revision: REVISION }), /exact current origin\/main/i);

    fixture.unitState.get("bitcraft-claim-monitor-relay-worker.service").active = "inactive";
    await assert.rejects(operations.validatePrepare({ revision: REVISION }), /expected installed state|relay-worker/i);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system preflight requires the installed backup helper", async () => {
  const fixture = systemFixture();
  try {
    rmSync(fixture.paths.backupHelper);
    const operations = createSystemCutoverOperations({
      paths: fixture.paths,
      run: fixture.run,
      request: fixture.request,
      statFilesystem: () => ({ bavail: 4n * 1024n * 1024n, bsize: 1024n }),
    });
    await assert.rejects(operations.validatePrepare({ revision: REVISION }), /backup helper.*missing/i);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system preflight resolves the migrated source token and configured announcements channel", async () => {
  const fixture = systemFixture();
  try {
    const source = new DatabaseSync(fixture.paths.sourceDatabasePath);
    try {
      const discord = JSON.parse(source.prepare("SELECT value FROM app_settings WHERE key = 'discord_json'").get().value);
      discord.channels.announcements = "666666666";
      source.prepare("UPDATE app_settings SET value = ? WHERE key = 'discord_json'").run(JSON.stringify(discord));
      source.prepare("INSERT INTO app_secrets (key, value, updated_at) VALUES ('discord_bot_token', ?, '2026-08-09T12:00:00.000Z')")
        .run("source-migrated-secret");
    } finally {
      source.close();
    }
    writeFileSync(
      fixture.paths.relayEnvironmentFile,
      readFileSync(fixture.paths.relayEnvironmentFile, "utf8").replace(/^DISCORD_BOT_TOKEN=.*\n/m, ""),
      { mode: 0o600 },
    );
    const requests = [];
    const request = async (url, options) => {
      requests.push({ url, authorization: options?.headers?.Authorization });
      const payload = url.endsWith("/users/@me") ? { id: "123456789" }
        : url.endsWith("/oauth2/applications/@me") ? { id: "123456789", redirect_uris: ["https://app.timbersteeltrade.com/api/local/auth/discord/callback"] }
          : url.endsWith("/guilds/987654321") ? { id: "987654321" }
            : { id: "666666666", guild_id: "987654321", type: 0 };
      return { ok: true, status: 200, json: async () => payload };
    };
    const operations = createSystemCutoverOperations({
      paths: fixture.paths,
      run: fixture.run,
      request,
      statFilesystem: () => ({ bavail: 4n * 1024n * 1024n, bsize: 1024n }),
    });
    const preflight = await operations.validatePrepare({ revision: REVISION });
    assert.equal(preflight.discord.announcementsChannelId, "666666666");
    assert.ok(requests.some((entry) => entry.url.endsWith("/channels/666666666")));
    assert.equal(requests.every((entry) => entry.authorization === "Bot source-migrated-secret"), true);
    assert.doesNotMatch(JSON.stringify(preflight), /source-migrated-secret/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system maintenance transition captures and stops writers, arms the exact watchdog, and restores idempotently", async () => {
  const fixture = systemFixture();
  try {
    const operations = createSystemCutoverOperations({
      paths: fixture.paths,
      run: fixture.run,
      request: fixture.request,
      statFilesystem: () => ({ bavail: 4n * 1024n * 1024n, bsize: 1024n }),
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });
    const state = {
      revision: REVISION,
      manifestHash: MANIFEST_HASH,
      preparedAt: "2026-08-09T12:00:00.000Z",
      preflight: await operations.validatePrepare({ revision: REVISION }),
      preApply: {},
    };
    state.maintenance = await operations.installMaintenance(state);
    assert.equal(readFileSync(fixture.paths.liveCaddyFile, "utf8"), "maintenance\n");
    state.serviceCapture = await operations.stopAndCaptureWriters(state);
    await operations.assertWritersStopped(state);
    state.watchdog = await operations.armWatchdog(state);
    assert.equal(state.watchdog.deadline, "2026-08-09T12:15:00.000Z");
    const watchdog = fixture.calls.find((call) => call[0] === "systemd-run");
    assert.ok(watchdog.includes("--setenv=BITCRAFT_CUTOVER_WATCHDOG=1"));
    assert.deepEqual(watchdog.slice(-5), ["--revision", REVISION, "--abort-cutover", "--manifest-hash", MANIFEST_HASH]);

    await operations.startRelayServices(state);
    fixture.calls.length = 0;
    await operations.quiesceServicesForRestore(state);
    await operations.restoreCaddy(state);
    await operations.restoreCaddy(state);
    await operations.restoreServiceStates(state);
    await operations.validateAndReloadRestoredCaddy(state);
    await operations.verifyOldPublicHealth(state);
    assert.equal(readFileSync(fixture.paths.liveCaddyFile, "utf8"), "preflight\n");
    assert.equal(fixture.unitState.get("bitcraft-claim-monitor.service").active, "active");
    const relayWorkerStop = fixture.calls.findIndex((call) => call[0] === "systemctl" && call[1] === "stop" && call[2] === "bitcraft-claim-monitor-relay-worker.service");
    const relayWorkerStart = fixture.calls.findIndex((call) => call[0] === "systemctl" && call[1] === "start" && call[2] === "bitcraft-claim-monitor-relay-worker.service");
    assert.ok(relayWorkerStop >= 0 && relayWorkerStart > relayWorkerStop);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system transition operations persist rollback identities before a later command can fail", async () => {
  const fixture = systemFixture();
  try {
    let failReload = true;
    const run = (command, args) => {
      if (failReload && command === "caddy" && args[0] === "reload") {
        failReload = false;
        return { status: 1, stdout: "", stderr: "fixture failure" };
      }
      return fixture.run(command, args);
    };
    const operations = createSystemCutoverOperations({
      paths: fixture.paths,
      run,
      request: fixture.request,
      statFilesystem: () => ({ bavail: 4n * 1024n * 1024n, bsize: 1024n }),
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });
    const state = {
      revision: REVISION,
      manifestHash: MANIFEST_HASH,
      preparedAt: "2026-08-09T12:00:00.000Z",
      preflight: await operations.validatePrepare({ revision: REVISION }),
      preApply: {},
    };

    await assert.rejects(operations.installMaintenance(state), /reload maintenance/i);
    assert.match(state.maintenance.savedPath, /caddy-before-/);
    assert.equal(state.maintenance.installed.sha256.length, 64);
    await operations.restoreCaddy(state);
    assert.equal(readFileSync(fixture.paths.liveCaddyFile, "utf8"), "preflight\n");

    const stopFailure = createSystemCutoverOperations({
      paths: fixture.paths,
      run: (command, args) => command === "systemctl" && args[0] === "stop" && args[1] === "bitcraft-claim-monitor-relay-backup.timer"
        ? { status: 1, stdout: "", stderr: "fixture failure" }
        : fixture.run(command, args),
    });
    await assert.rejects(stopFailure.stopAndCaptureWriters(state), /stop .*relay-backup/i);
    assert.equal(state.serviceCapture.units["bitcraft-claim-monitor.service"].activeState, "active");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system admission starts only Relay, verifies generation/gateway/outbox/canary, installs final Caddy, and masks old units", async () => {
  const fixture = systemFixture();
  try {
    const operations = createSystemCutoverOperations({
      paths: fixture.paths,
      run: fixture.run,
      request: fixture.request,
      statFilesystem: () => ({ bavail: 4n * 1024n * 1024n, bsize: 1024n }),
      wait: async () => {},
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });
    const state = {
      revision: REVISION,
      manifestHash: MANIFEST_HASH,
      preparedAt: "2026-08-09T12:00:00.000Z",
      preflight: await operations.validatePrepare({ revision: REVISION }),
      preApply: {},
    };
    state.maintenance = await operations.installMaintenance(state);
    state.serviceCapture = await operations.stopAndCaptureWriters(state);
    state.outboxBeforeStart = await operations.captureOutboxState(state);
    const db = new DatabaseSync(fixture.paths.targetDatabasePath);
    try {
      db.exec("UPDATE provider_subscription_health SET generation = generation + 1");
    } finally {
      db.close();
    }
    fixture.runtime.mode = "canonical";

    await operations.startRelayServices(state);
    const local = await operations.verifyLocalCanonical(state);
    assert.equal(local.gatewayPid, "202");
    await operations.verifyMaintenanceCanary(state);
    state.finalCaddyValidation = await operations.validateFinalCaddyForAdmission(state);
    const reloadsBeforeFinal = fixture.calls.filter((call) => call[0] === "caddy" && call[1] === "reload").length;
    await operations.installFinalCaddy(state);
    await operations.installFinalCaddy(state);
    assert.equal(
      fixture.calls.filter((call) => call[0] === "caddy" && call[1] === "reload").length,
      reloadsBeforeFinal + 2,
      "a fix-forward retry must reload an already-installed final candidate",
    );
    assert.equal(readFileSync(fixture.paths.liveCaddyFile, "utf8"), "final\n");
    const publicResult = await operations.verifyPublicCanonical(state);
    assert.equal(publicResult.redirect, true);
    await operations.maskOldUnits(state);
    for (const [unit, unitState] of fixture.unitState) {
      if (!unit.startsWith("bitcraft-claim-monitor-relay")) {
        assert.equal(unitState.active, "inactive", unit);
        assert.equal(unitState.enabled, "masked", unit);
      }
    }
    for (const unit of fixture.unitState.keys()) {
      if (!unit.startsWith("bitcraft-claim-monitor-relay")) {
        assert.ok(fixture.calls.some((call) => call[0] === "systemctl" && call[1] === "mask" && call[2] === "--runtime" && call[3] === unit));
      }
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function backupFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "relay-cutover-backup-system-"));
  const paths = {
    stateDirectory: path.join(root, "state"),
    relayBackupRoot: path.join(root, "relay-backups"),
    sourceDatabasePath: path.join(root, "old.sqlite"),
    targetDatabasePath: path.join(root, "relay.sqlite"),
    sourceEnvironmentFile: path.join(root, "old.env"),
    relayEnvironmentFile: path.join(root, "relay.env"),
    liveCaddyFile: path.join(root, "Caddyfile"),
    sourceBrandingDirectory: path.join(root, "old-branding"),
    targetBrandingDirectory: path.join(root, "relay-branding"),
    backupEncryptionKeyFile: path.join(root, "backup.key"),
    backupCryptoHelper: path.resolve("deploy/backup-crypto.mjs"),
  };
  for (const directory of [paths.stateDirectory, paths.relayBackupRoot, paths.sourceBrandingDirectory, paths.targetBrandingDirectory]) mkdirSync(directory);
  for (const databasePath of [paths.sourceDatabasePath, paths.targetDatabasePath]) {
    const db = new DatabaseSync(databasePath);
    db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_settings VALUES ('claim_id', '1369094286777412590');");
    db.close();
  }
  writeFileSync(paths.sourceEnvironmentFile, "OLD_SECRET=alpha\n", { mode: 0o600 });
  writeFileSync(paths.relayEnvironmentFile, "RELAY_SECRET=beta\n", { mode: 0o600 });
  writeFileSync(paths.liveCaddyFile, "old-caddy\n", { mode: 0o600 });
  writeFileSync(path.join(paths.sourceBrandingDirectory, "logo.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  writeFileSync(path.join(paths.targetBrandingDirectory, "favicon.webp"), Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]));
  writeFileSync(paths.backupEncryptionKeyFile, Buffer.alloc(32, 9).toString("base64url"), { mode: 0o600 });
  const extra = {
    sourceLedgerPath: path.join(root, "old-ledger.jsonl"),
    targetLedgerPath: path.join(root, "relay-ledger.jsonl"),
    sourceKeyPath: path.join(root, "old-privacy.key"),
    targetKeyPath: path.join(root, "relay-privacy.key"),
    targetPreviousKeyPaths: [path.join(root, "relay-privacy.previous.key")],
  };
  for (const file of [
    extra.sourceLedgerPath,
    extra.targetLedgerPath,
    extra.sourceKeyPath,
    extra.targetKeyPath,
    ...extra.targetPreviousKeyPaths,
  ]) writeFileSync(file, file.endsWith(".key") ? `${Buffer.alloc(32, file.includes("old") ? 2 : 4).toString("base64url")}\n` : "", { mode: 0o600 });
  return { root, paths, extra };
}

test("system backup integration checkpoints, encrypts, decrypt-verifies, and removes every plaintext stage", async () => {
  const fixture = backupFixture();
  const commands = [];
  const run = (command, args) => {
    commands.push([command, ...args]);
    if (command === "sqlite3") {
      const sql = args[1];
      if (sql.startsWith(".backup ")) {
        const destination = sql.slice(".backup ".length).replace(/^'|'$/g, "").replaceAll("''", "'");
        copyFileSync(args[0], destination);
      }
      return { status: 0, stdout: sql === "PRAGMA integrity_check;" ? "ok\n" : "0|0|0\n", stderr: "" };
    }
    const result = spawnSync(command, args, { encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  try {
    const operations = createSystemCutoverOperations({ paths: fixture.paths, run, now: () => new Date("2026-08-09T12:00:00.000Z") });
    const backups = await operations.createAndVerifyEncryptedBackups({
      revision: REVISION,
      preflight: { discoveredPaths: fixture.extra },
    });
    assert.ok(backups.length >= 9);
    assert.ok(backups.some((entry) => entry.sourceLabel === "relay-previous-privacy-key-1"));
    assert.equal(backups.every((entry) => /^[a-f0-9]{64}$/.test(entry.originalSha256) && /^[a-f0-9]{64}$/.test(entry.encryptedSha256)), true);
    assert.equal(backups.every((entry) => existsSync(entry.path) && entry.path.endsWith(".enc")), true);
    assert.equal(readdirSync(path.join(fixture.paths.stateDirectory, "backup-stage")).length, 0);
    assert.equal(commands.filter(([command, , sql]) => command === "sqlite3" && sql?.startsWith("PRAGMA wal_checkpoint")).length, 2);
    assert.equal(commands.filter(([command]) => command === process.execPath).length >= backups.length * 2, true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system backup integration records already-verified encrypted artifacts across a later backup failure", async () => {
  const fixture = backupFixture();
  let encryptions = 0;
  const run = (command, args) => {
    if (command === "sqlite3") {
      const sql = args[1];
      if (sql.startsWith(".backup ")) {
        const destination = sql.slice(".backup ".length).replace(/^'|'$/g, "").replaceAll("''", "'");
        copyFileSync(args[0], destination);
      }
      return { status: 0, stdout: sql === "PRAGMA integrity_check;" ? "ok\n" : "0|0|0\n", stderr: "" };
    }
    if (command === process.execPath && args[1] === "encrypt" && ++encryptions === 2) {
      return { status: 1, stdout: "", stderr: "fixture failure" };
    }
    const result = spawnSync(command, args, { encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  try {
    const state = { revision: REVISION, preflight: { discoveredPaths: fixture.extra } };
    const operations = createSystemCutoverOperations({ paths: fixture.paths, run, now: () => new Date("2026-08-09T12:00:00.000Z") });
    await assert.rejects(operations.createAndVerifyEncryptedBackups(state), /encrypt/i);
    assert.equal(state.backups.length, 1);
    assert.equal(existsSync(state.backups[0].path), true);
    assert.equal(readdirSync(path.join(fixture.paths.stateDirectory, "backup-stage")).length, 0);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("system retention treats encrypted cutover artifacts as three migration recovery sets with a 90-day ceiling", async () => {
  const fixture = backupFixture();
  try {
    const completeLabels = [
      "old-db", "relay-db", "old-environment", "relay-environment", "caddy",
      "old-privacy-key", "relay-privacy-key",
    ];
    const createSet = (timestamp, labels, modifiedAt) => labels.map((label, index) => {
      const identifier = `cutover-migration-${REVISION.slice(0, 12)}-${timestamp}-${String(index + 1).padStart(2, "0")}-${label}`;
      const filePath = path.join(fixture.paths.relayBackupRoot, `${identifier}.enc`);
      writeFileSync(filePath, `encrypted-${identifier}`);
      utimesSync(filePath, modifiedAt, modifiedAt);
      return { identifier, path: filePath };
    });
    const old = createSet("20260401T120000Z", completeLabels, new Date("2026-04-01T12:00:00.000Z"));
    const fourth = createSet("20260520T120000Z", completeLabels, new Date("2026-05-20T12:00:00.000Z"));
    const third = createSet("20260620T120000Z", completeLabels, new Date("2026-06-20T12:00:00.000Z"));
    const second = createSet("20260720T120000Z", completeLabels, new Date("2026-07-20T12:00:00.000Z"));
    const partial = createSet("20260808T120000Z", ["old-db"], new Date("2026-08-08T12:00:00.000Z"));
    const current = createSet("20260809T120000Z", completeLabels, new Date("2026-08-09T12:00:00.000Z"));
    const operations = createSystemCutoverOperations({
      paths: fixture.paths,
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });
    const retention = await operations.recordForensicRetention({ revision: REVISION, backups: [] });
    assert.deepEqual(retention.policy, { class: "migration", maximumAgeDays: 90, recoveryPoints: 3 });
    assert.equal(old.every((backup) => !existsSync(backup.path)), true);
    assert.equal(fourth.every((backup) => !existsSync(backup.path)), true);
    assert.equal(third.every((backup) => existsSync(backup.path)), true);
    assert.equal(second.every((backup) => existsSync(backup.path)), true);
    assert.equal(partial.every((backup) => existsSync(backup.path)), true);
    assert.equal(current.every((backup) => existsSync(backup.path)), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
