import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_SOAK_PROFILES,
  createSystemOperationalSampler,
  expectedSubscriptionKeysFromCutoverState,
  runCanonicalSoak,
} from "../../deploy/verify-canonical-soak.mjs";
import { applySchemaBootstrap } from "../../apps/bitcraft-local/src/server/schemaBootstrap.mjs";

const REVISION = "a".repeat(40);
const VERSION = "0.53.0-beta.1";
const CANONICAL = "https://app.timbersteeltrade.com";
const RELAY = "https://relay.timbersteeltrade.com";
const EXPECTED_SUBSCRIPTIONS = ["relay:global:catalogs"];

function response({ status = 200, json, location = "" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "location" ? location : null },
    json: async () => json,
  };
}

function health() {
  return {
    ok: true,
    deploymentMode: "canonical",
    canonicalOrigin: CANONICAL,
    discordReady: true,
    version: VERSION,
    buildSha: REVISION.slice(0, 12),
  };
}

function operational(generation = 7, overrides = {}) {
  return {
    subscriptions: [{ key: "relay:global:catalogs", generation, connected: true, applied: true, lastError: null }],
    gatewayCount: 1,
    oldProcessCount: 0,
    restartCounts: { web: 0, worker: 0, collector: 0 },
    sourceErrorCount: 0,
    outboxErrorCount: 0,
    canonicalAnnouncementCount: 0,
    outbox: { counts: { sent: 8 }, latestId: 8 },
    ...overrides,
  };
}

function successfulFixture({ operationalForSample } = {}) {
  let currentMs = Date.parse("2026-08-09T12:00:00.000Z");
  let sample = 0;
  const requests = [];
  return {
    requests,
    expectedSubscriptionKeys: EXPECTED_SUBSCRIPTIONS,
    now: () => new Date(currentMs),
    sleep: async (milliseconds) => { currentMs += milliseconds; },
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), method: init.method ?? "GET", redirect: init.redirect });
      if (String(url) === `${CANONICAL}/api/local/health`) return response({ json: health() });
      if (String(url) === `${RELAY}/cutover-soak?probe=1`) {
        return response({ status: 301, location: `${CANONICAL}/cutover-soak?probe=1` });
      }
      return response();
    },
    sampleOperations: async () => {
      const current = sample++;
      return operationalForSample ? operationalForSample(current) : operational(current === 0 ? 7 : 8);
    },
  };
}

test("soak profiles are exactly 30 minutes intensive and 24 hours follow-up", () => {
  assert.deepEqual(CANONICAL_SOAK_PROFILES, {
    intensive: { durationMs: 30 * 60 * 1000, intervalMs: 60 * 1000 },
    "follow-up": { durationMs: 24 * 60 * 60 * 1000, intervalMs: 15 * 60 * 1000 },
  });
});

test("intensive verifier uses only GETs and returns a bounded release/gateway/outbox summary after generation advances", async () => {
  const fixture = successfulFixture();
  const result = await runCanonicalSoak({
    profile: "intensive",
    revision: REVISION,
    version: VERSION,
    ...fixture,
  });

  assert.deepEqual(result, {
    ok: true,
    profile: "intensive",
    revision: REVISION,
    version: VERSION,
    deploymentMode: "canonical",
    durationMs: 30 * 60 * 1000,
    sampleCount: 31,
    failedSamples: 0,
    generationAdvanced: true,
    subscriptionCount: 1,
    subscriptionSetHash: "fce01caf4eef1b43a0db5a1a780a8383eb6b03bc87c4ae1a8ad96dd3cc0708c4",
    gatewayCount: 1,
    oldProcessCount: 0,
    outboxHealthy: true,
    outboxValidated: true,
    outboxChanged: false,
    outboxBaseline: { counts: { sent: 8 }, latestId: 8 },
    outboxFinal: { counts: { sent: 8 }, latestId: 8 },
    startedAt: "2026-08-09T12:00:00.000Z",
    completedAt: "2026-08-09T12:30:00.000Z",
  });
  assert.equal(fixture.requests.length, 31 * 6);
  assert.equal(fixture.requests.every((entry) => entry.method === "GET"), true);
  assert.equal(fixture.requests.filter((entry) => entry.redirect === "manual").length, 31);
  assert.ok(JSON.stringify(result).length < 1_000);
});

test("intensive soak permits legitimate notification enqueue and delivery while preserving a monotonic attempt baseline", async () => {
  const fixture = successfulFixture({
    operationalForSample: (sample) => operational(sample === 0 ? 7 : 8, {
      outbox: sample === 0
        ? { counts: { sent: 8 }, latestId: 8 }
        : sample === 1
          ? { counts: { pending: 1, sent: 8 }, latestId: 9 }
          : { counts: { sent: 9 }, latestId: 9 },
    }),
  });
  const summary = await runCanonicalSoak({ profile: "intensive", revision: REVISION, version: VERSION, ...fixture });
  assert.equal(summary.outboxValidated, true);
  assert.equal(summary.outboxChanged, true);
  assert.deepEqual(summary.outboxBaseline, { counts: { sent: 8 }, latestId: 8 });
  assert.deepEqual(summary.outboxFinal, { counts: { sent: 9 }, latestId: 9 });
});

test("soak verifier fails closed for generation stalls", async () => {
  const fixture = successfulFixture({ operationalForSample: () => operational(7) });
  await assert.rejects(
    runCanonicalSoak({ profile: "intensive", revision: REVISION, version: VERSION, ...fixture }),
    /generation.*did not advance/i,
  );
});

test("soak verifier binds every sample to the complete expected subscription set", async () => {
  const fixture = successfulFixture();
  fixture.expectedSubscriptionKeys = [...EXPECTED_SUBSCRIPTIONS, "relay:region:market"];
  await assert.rejects(
    runCanonicalSoak({ profile: "intensive", revision: REVISION, version: VERSION, ...fixture }),
    /subscription set/i,
  );
});

test("follow-up permits healthy live outbox progress but rejects delivery errors", async () => {
  const healthy = successfulFixture({
    operationalForSample: (sample) => operational(sample === 0 ? 7 : 8, {
      outbox: sample === 0
        ? { counts: { pending: 1, sent: 8 }, latestId: 9 }
        : { counts: { sent: 10 }, latestId: 10 },
    }),
  });
  const summary = await runCanonicalSoak({ profile: "follow-up", revision: REVISION, version: VERSION, ...healthy });
  assert.equal(summary.sampleCount, 97);
  assert.equal(summary.outboxHealthy, true);
  assert.equal(summary.outboxValidated, true);
  assert.equal(summary.outboxChanged, true);
  assert.deepEqual(summary.outboxFinal, { counts: { sent: 10 }, latestId: 10 });

  const errored = successfulFixture({
    operationalForSample: (sample) => operational(sample === 0 ? 7 : 8, { outboxErrorCount: sample === 0 ? 0 : 1 }),
  });
  await assert.rejects(
    runCanonicalSoak({ profile: "follow-up", revision: REVISION, version: VERSION, ...errored }),
    /outbox delivery/i,
  );
});

test("soak verifier fails the current sample for gateway, source, and outbox changes without leaking details", async (context) => {
  const cases = [
    ["gateway", { gatewayCount: 2 }, /exactly one.*gateway/i],
    ["source", { sourceErrorCount: 1, secret: "never-print-this-token" }, /source error/i],
    ["outbox", { outbox: { counts: { sent: 7 }, latestId: 7 } }, /outbox.*backwards/i],
    ["canonical duplicate", { canonicalAnnouncementCount: 2 }, /canonical.*duplicate/i],
    ["restart", { restartCounts: { web: 0, worker: 1, collector: 0 } }, /restart/i],
  ];
  for (const [name, changed, pattern] of cases) await context.test(name, async () => {
    const fixture = successfulFixture({
      operationalForSample: (sample) => operational(sample === 0 ? 7 : 8, sample === 0 ? {} : changed),
    });
    await assert.rejects(
      runCanonicalSoak({ profile: "intensive", revision: REVISION, version: VERSION, ...fixture }),
      (error) => pattern.test(error.message) && !error.message.includes("never-print-this-token") && error.message.length < 300,
    );
  });
});

test("soak verifier fails malformed canonical health and a redirect that loses path/query", async (context) => {
  await context.test("health", async () => {
    const fixture = successfulFixture();
    fixture.fetchImpl = async (url) => String(url).endsWith("/api/local/health")
      ? response({ json: { ...health(), deploymentMode: "preview" } })
      : String(url).startsWith(RELAY)
        ? response({ status: 301, location: `${CANONICAL}/cutover-soak?probe=1` })
        : response();
    await assert.rejects(
      runCanonicalSoak({ profile: "intensive", revision: REVISION, version: VERSION, ...fixture }),
      /deployment mode/i,
    );
  });
  await context.test("redirect", async () => {
    const fixture = successfulFixture();
    fixture.fetchImpl = async (url) => String(url).endsWith("/api/local/health")
      ? response({ json: health() })
      : String(url).startsWith(RELAY)
        ? response({ status: 301, location: `${CANONICAL}/wrong` })
        : response();
    await assert.rejects(
      runCanonicalSoak({ profile: "intensive", revision: REVISION, version: VERSION, ...fixture }),
      /redirect.*path and query/i,
    );
  });
});

test("system sampler rejects a lone gateway process that is not the Relay worker MainPID", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "canonical-soak-system-"));
  const databasePath = path.join(directory, "relay.sqlite");
  const db = new DatabaseSync(databasePath);
  try {
    applySchemaBootstrap(db);
    db.prepare(`
      INSERT INTO provider_subscription_health
        (provider, source_key, domain, generation, connected, last_error, updated_at)
      VALUES ('relay', 'global', 'catalogs', 7, 1, NULL, '2026-08-09T12:00:00.000Z')
    `).run();
  } finally {
    db.close();
  }
  const calls = [];
  const run = (command, arguments_) => {
    calls.push([command, ...arguments_]);
    if (command === "pgrep") return { status: 0, stdout: "303 node worker.mjs\n", stderr: "" };
    if (command === "systemctl" && arguments_.includes("--property=NRestarts")) return { status: 0, stdout: "0\n", stderr: "" };
    if (command === "systemctl" && arguments_[1] === "bitcraft-claim-monitor-relay-worker.service" && arguments_.includes("--property=MainPID")) {
      return { status: 0, stdout: "202\n", stderr: "" };
    }
    if (command === "systemctl" && arguments_.includes("--property=ActiveState")) return { status: 0, stdout: "inactive\n", stderr: "" };
    if (command === "systemctl" && arguments_.includes("--property=MainPID")) return { status: 0, stdout: "0\n", stderr: "" };
    throw new Error(`Unexpected command ${command}`);
  };
  try {
    const sample = await createSystemOperationalSampler({ databasePath, run })();
    assert.notEqual(sample.gatewayCount, 1);
    const queriedUnits = calls
      .filter(([command]) => command === "systemctl")
      .map(([, , unit]) => unit);
    assert.ok(queriedUnits.includes("bitcraft-monitor-collector.service"));
    assert.ok(queriedUnits.includes("bitcraft-monitor-collector.timer"));
    assert.equal(queriedUnits.includes("bitcraft-claim-monitor-collector.service"), false);
    assert.equal(queriedUnits.includes("bitcraft-claim-monitor-collector.timer"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI bounds an invalid profile without echoing its value", () => {
  const secretProfile = `never-print-${"x".repeat(2_000)}`;
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("../../deploy/verify-canonical-soak.mjs", import.meta.url)),
    "--profile", secretProfile,
    "--revision", REVISION,
  ], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.length < 500);
  assert.doesNotMatch(result.stderr, /never-print/);
  assert.match(result.stderr, /"profile":"unknown"/);
});

test("follow-up extracts only the revision-bound subscription set from protected cutover state", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "canonical-soak-state-"));
  const statePath = path.join(directory, "state.json");
  try {
    writeFileSync(statePath, JSON.stringify({
      revision: REVISION,
      admission: { revision: REVISION },
      preflight: { subscriptions: { subscriptions: {
        "relay:region:market": 4,
        "relay:global:catalogs": 8,
      } } },
      secret: "never-print-this-token",
    }));
    const keys = expectedSubscriptionKeysFromCutoverState({ statePath, revision: REVISION });
    assert.deepEqual(keys, ["relay:global:catalogs", "relay:region:market"]);
    assert.doesNotMatch(JSON.stringify(keys), /never-print-this-token/);
    assert.throws(
      () => expectedSubscriptionKeysFromCutoverState({ statePath, revision: "b".repeat(40) }),
      /does not match/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
