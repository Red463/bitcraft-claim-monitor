#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

import { OLD_PRODUCTION_UNITS } from "./canonical-unit-inventory.mjs";

const CANONICAL_ORIGIN = "https://app.timbersteeltrade.com";
const RELAY_ORIGIN = "https://relay.timbersteeltrade.com";
const CANONICAL_VERSION = "0.53.0-beta.1";
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const REQUIRED_PUBLIC_ROUTES = ["/", "/terms", "/privacy", "/sounds/notifications/ui-pop.mp3"];
const RELAY_UNITS = {
  web: "bitcraft-claim-monitor-relay.service",
  worker: "bitcraft-claim-monitor-relay-worker.service",
  collector: "bitcraft-claim-monitor-relay-collector.service",
};

export const CANONICAL_SOAK_PROFILES = Object.freeze({
  intensive: Object.freeze({ durationMs: 30 * 60 * 1000, intervalMs: 60 * 1000 }),
  "follow-up": Object.freeze({ durationMs: 24 * 60 * 60 * 1000, intervalMs: 15 * 60 * 1000 }),
});

function canonical(value) {
  return JSON.stringify(value);
}

function ensureResponse(response, label) {
  if (!response || response.ok !== true) throw new Error(`${label} returned a non-success status`);
}

async function samplePublicRoutes(fetchImpl, { revision, version }) {
  let healthResponse;
  try {
    healthResponse = await fetchImpl(`${CANONICAL_ORIGIN}/api/local/health`, { method: "GET", redirect: "error" });
  } catch {
    throw new Error("Canonical health request failed");
  }
  ensureResponse(healthResponse, "Canonical health");
  let health;
  try {
    health = await healthResponse.json();
  } catch {
    throw new Error("Canonical health returned invalid JSON");
  }
  if (health?.ok !== true) throw new Error("Canonical health is not ready");
  if (health.deploymentMode !== "canonical") throw new Error("Canonical health deployment mode is not canonical");
  if (health.canonicalOrigin !== CANONICAL_ORIGIN) throw new Error("Canonical health origin is not exact");
  if (health.discordReady !== true) throw new Error("Canonical health Discord readiness is false");
  if (health.version !== version) throw new Error("Canonical health version does not match the approved release");
  if (health.buildSha !== revision.slice(0, 12)) throw new Error("Canonical health build does not match the admitted revision");

  for (const route of REQUIRED_PUBLIC_ROUTES) {
    let response;
    try {
      response = await fetchImpl(`${CANONICAL_ORIGIN}${route}`, { method: "GET", redirect: "error" });
    } catch {
      throw new Error("A required canonical public route request failed");
    }
    ensureResponse(response, "Required canonical public route");
  }

  let redirect;
  try {
    redirect = await fetchImpl(`${RELAY_ORIGIN}/cutover-soak?probe=1`, { method: "GET", redirect: "manual" });
  } catch {
    throw new Error("Relay redirect request failed");
  }
  const location = String(redirect?.headers?.get?.("location") ?? "");
  if (redirect?.status !== 301 || location !== `${CANONICAL_ORIGIN}/cutover-soak?probe=1`) {
    throw new Error("Relay redirect did not preserve the canonical path and query");
  }
}

function subscriptionMap(subscriptions) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    throw new Error("No required Relay subscriptions were recorded");
  }
  const result = new Map();
  for (const subscription of subscriptions) {
    const key = String(subscription?.key ?? "");
    const generation = Number(subscription?.generation);
    if (!key || result.has(key)) throw new Error("Required Relay subscription identity is invalid");
    if (subscription.connected !== true || subscription.applied !== true || !Number.isFinite(generation) || generation <= 0) {
      throw new Error("A required Relay subscription is not connected and applied");
    }
    if (subscription.lastError != null) throw new Error("A required Relay subscription has a source error");
    result.set(key, generation);
  }
  return result;
}

function normalizeExpectedSubscriptionKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 1_000) {
    throw new Error("Canonical soak requires the complete expected subscription set");
  }
  const normalized = keys.map((key) => String(key));
  if (normalized.some((key) => !key || key.length > 256) || new Set(normalized).size !== normalized.length) {
    throw new Error("Canonical soak expected subscription set is invalid");
  }
  return [...normalized].sort();
}

function subscriptionSetHash(keys) {
  return createHash("sha256").update(keys.join("\n"), "utf8").digest("hex");
}

function validatedOutboxSnapshot(outbox) {
  if (!outbox || !Number.isSafeInteger(Number(outbox.latestId)) || Number(outbox.latestId) < 0
    || !outbox.counts || typeof outbox.counts !== "object" || Array.isArray(outbox.counts)) {
    throw new Error("Discord outbox delivery snapshot is invalid");
  }
  const counts = Object.fromEntries(Object.entries(outbox.counts).map(([status, count]) => {
    const numeric = Number(count);
    if (!["pending", "sending", "sent", "failed", "skipped"].includes(status)
      || !Number.isSafeInteger(numeric) || numeric < 0) throw new Error("Discord outbox delivery snapshot is invalid");
    return [status, numeric];
  }));
  return { counts, latestId: Number(outbox.latestId), total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}

function validateOperationalSample(sample, baseline, { profile, expectedSubscriptionKeys }) {
  if (!sample || typeof sample !== "object") throw new Error("Operational soak snapshot is unavailable");
  if (sample.gatewayCount !== 1) throw new Error("Canonical soak requires exactly one live Discord gateway");
  if (sample.oldProcessCount !== 0) throw new Error("Canonical soak detected old process health");
  if (sample.sourceErrorCount !== 0) throw new Error("Canonical soak detected a provider source error");
  if (sample.outboxErrorCount !== 0) throw new Error("Canonical soak detected an outbox delivery error");
  if (!Number.isSafeInteger(Number(sample.canonicalAnnouncementCount)) || Number(sample.canonicalAnnouncementCount) < 0) {
    throw new Error("Canonical soak announcement state is ambiguous");
  }
  if (profile === "intensive" && sample.canonicalAnnouncementCount !== 0) {
    throw new Error("Canonical soak detected a canonical announcement duplicate before the exact announcement gate");
  }
  if (profile === "follow-up" && sample.canonicalAnnouncementCount > 1) {
    throw new Error("Canonical soak detected a canonical announcement duplicate");
  }
  const outbox = validatedOutboxSnapshot(sample.outbox);
  const subscriptions = subscriptionMap(sample.subscriptions);
  if (subscriptions.size !== expectedSubscriptionKeys.length
    || expectedSubscriptionKeys.some((key) => !subscriptions.has(key))) {
    throw new Error("Required Relay subscription set does not match the cutover preflight");
  }
  if (baseline) {
    if (canonical(sample.restartCounts) !== canonical(baseline.restartCounts)) {
      throw new Error("Canonical service restart counts changed during the soak");
    }
    const previous = validatedOutboxSnapshot(baseline.previousOutbox);
    if (outbox.latestId < previous.latestId || outbox.total < previous.total) {
      throw new Error("Discord outbox delivery state moved backwards during the follow-up soak");
    }
  }
  return subscriptions;
}

export async function runCanonicalSoak({
  profile,
  revision,
  version = CANONICAL_VERSION,
  fetchImpl = globalThis.fetch,
  sampleOperations,
  expectedSubscriptionKeys,
  now = () => new Date(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (!Object.hasOwn(CANONICAL_SOAK_PROFILES, profile)) throw new Error("Canonical soak profile must be intensive or follow-up");
  if (!REVISION_PATTERN.test(String(revision ?? ""))) throw new Error("Canonical soak revision must be a full lowercase SHA");
  if (version !== CANONICAL_VERSION) throw new Error("Canonical soak version must be 0.53.0-beta.1");
  if (typeof fetchImpl !== "function" || typeof sampleOperations !== "function") throw new Error("Canonical soak samplers are unavailable");
  const expectedKeys = normalizeExpectedSubscriptionKeys(expectedSubscriptionKeys);
  const durationMs = Number(CANONICAL_SOAK_PROFILES[profile].durationMs);
  const intervalMs = Number(CANONICAL_SOAK_PROFILES[profile].intervalMs);
  if (!Number.isSafeInteger(durationMs) || !Number.isSafeInteger(intervalMs) || durationMs < intervalMs || intervalMs <= 0) {
    throw new Error("Canonical soak cadence is invalid");
  }

  const startedAt = now();
  let sampleCount = 0;
  let baseline = null;
  let finalSubscriptions = null;
  let finalSample = null;
  while (true) {
    await samplePublicRoutes(fetchImpl, { revision, version });
    const operational = await sampleOperations();
    const subscriptions = validateOperationalSample(operational, baseline, { profile, expectedSubscriptionKeys: expectedKeys });
    if (!baseline) {
      baseline = {
        subscriptions,
        restartCounts: operational.restartCounts,
        initialOutbox: operational.outbox,
        previousOutbox: operational.outbox,
      };
    } else {
      baseline.previousOutbox = operational.outbox;
    }
    finalSubscriptions = subscriptions;
    finalSample = operational;
    sampleCount += 1;
    const elapsedMs = now().getTime() - startedAt.getTime();
    if (elapsedMs >= durationMs) break;
    await sleep(Math.min(intervalMs, durationMs - elapsedMs));
  }

  const generationAdvanced = [...baseline.subscriptions].some(([key, generation]) => Number(finalSubscriptions.get(key)) > generation);
  if (!generationAdvanced) throw new Error("Relay provider generation did not advance during the soak");
  return {
    ok: true,
    profile,
    revision,
    version,
    deploymentMode: "canonical",
    durationMs,
    sampleCount,
    failedSamples: 0,
    generationAdvanced,
    subscriptionCount: finalSubscriptions.size,
    subscriptionSetHash: subscriptionSetHash(expectedKeys),
    gatewayCount: finalSample.gatewayCount,
    oldProcessCount: finalSample.oldProcessCount,
    outboxHealthy: true,
    outboxValidated: true,
    outboxChanged: canonical(finalSample.outbox) !== canonical(baseline.initialOutbox),
    outboxBaseline: baseline.initialOutbox,
    outboxFinal: finalSample.outbox,
    startedAt: startedAt.toISOString(),
    completedAt: now().toISOString(),
  };
}

function defaultRun(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", windowsHide: true });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
}

function commandValue(run, command, arguments_, label, { allowStatusOne = false } = {}) {
  const result = run(command, arguments_);
  if (result?.error || (result?.status !== 0 && !(allowStatusOne && result?.status === 1))) {
    throw new Error(`${label} is unavailable`);
  }
  return String(result.stdout ?? "").trim();
}

function systemctlValue(run, unit, property) {
  return commandValue(run, "systemctl", ["show", unit, `--property=${property}`, "--value"], "systemd soak state");
}

function readOutboxSnapshot(db) {
  const counts = Object.fromEntries(db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM discord_notification_outbox
    GROUP BY status
    ORDER BY status
  `).all().map((row) => [String(row.status), Number(row.count)]));
  const latestId = Number(db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM discord_notification_outbox").get().id);
  return { counts, latestId };
}

export function createSystemOperationalSampler({
  databasePath = "/var/lib/bitcraft-claim-monitor-relay/bitcraft-local.sqlite",
  run = defaultRun,
} = {}) {
  return async function sampleOperations() {
    const db = new DatabaseSync(databasePath, { readOnly: true });
    let subscriptions;
    let outbox;
    let sourceErrorCount;
    let outboxErrorCount;
    let canonicalAnnouncementCount;
    try {
      const rows = db.prepare(`
        SELECT provider, source_key, domain, generation, connected, last_error
        FROM provider_subscription_health
        ORDER BY provider, source_key, domain
      `).all();
      subscriptions = rows.map((row) => ({
        key: `${row.provider}:${row.source_key}:${row.domain}`,
        generation: Number(row.generation),
        connected: Number(row.connected) === 1,
        applied: Number(row.generation) > 0,
        lastError: row.last_error == null ? null : "present",
      }));
      sourceErrorCount = rows.filter((row) => row.last_error != null).length;
      outbox = readOutboxSnapshot(db);
      outboxErrorCount = Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM discord_notification_outbox
        WHERE status IN ('failed', 'sending')
           OR (status = 'pending' AND (attempts > 0 OR last_error IS NOT NULL))
      `).get().count);
      canonicalAnnouncementCount = Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM discord_notification_outbox
        WHERE event_type = 'canonical_cutover'
      `).get().count);
    } finally {
      db.close();
    }

    const restartCounts = Object.fromEntries(Object.entries(RELAY_UNITS).map(([key, unit]) => [
      key,
      Number(systemctlValue(run, unit, "NRestarts")),
    ]));
    const relayWorkerPid = systemctlValue(run, RELAY_UNITS.worker, "MainPID");
    const gatewayOutput = commandValue(
      run,
      "pgrep",
      ["-a", "-f", "/apps/bitcraft-local/worker\\.mjs"],
      "Discord gateway process state",
      { allowStatusOne: true },
    );
    const gatewayPids = gatewayOutput.split(/\r?\n/).filter(Boolean).map((line) => line.trim().split(/\s+/, 1)[0]);
    const gatewayMatchesWorker = gatewayPids.length === 1 && gatewayPids[0] === relayWorkerPid;
    const gatewayCount = gatewayMatchesWorker ? 1 : gatewayPids.length === 0 ? 0 : gatewayPids.length + 1;
    const oldProcessCount = OLD_PRODUCTION_UNITS.filter((unit) => {
      const active = systemctlValue(run, unit, "ActiveState");
      const pid = systemctlValue(run, unit, "MainPID");
      return active === "active" || (/^\d+$/.test(pid) && pid !== "0");
    }).length;
    return { subscriptions, gatewayCount, oldProcessCount, restartCounts, sourceErrorCount, outboxErrorCount, canonicalAnnouncementCount, outbox };
  };
}

function parseArguments(arguments_) {
  const parsed = {
    profile: "",
    revision: "",
    databasePath: "/var/lib/bitcraft-claim-monitor-relay/bitcraft-local.sqlite",
    statePath: "/var/lib/bitcraft-claim-monitor-relay/cutover/state.json",
  };
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!value) throw new Error("Canonical soak arguments are incomplete");
    if (name === "--profile") parsed.profile = value;
    else if (name === "--revision") parsed.revision = value;
    else if (name === "--database") parsed.databasePath = value;
    else if (name === "--state") parsed.statePath = value;
    else throw new Error("Canonical soak argument is unknown");
  }
  return parsed;
}

export function expectedSubscriptionKeysFromCutoverState({ statePath, revision }) {
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    throw new Error("Canonical cutover state is unavailable for subscription binding");
  }
  if (state?.revision !== revision || state?.admission?.revision !== revision) {
    throw new Error("Canonical cutover state does not match the admitted revision");
  }
  return normalizeExpectedSubscriptionKeys(Object.keys(state?.preflight?.subscriptions?.subscriptions ?? {}));
}

function boundedFailure() {
  return "Canonical soak verification failed; inspect protected VPS diagnostics";
}

async function main() {
  let profile = "unknown";
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (!Object.hasOwn(CANONICAL_SOAK_PROFILES, parsed.profile)) {
      throw new Error("Canonical soak profile must be intensive or follow-up");
    }
    profile = parsed.profile;
    const summary = await runCanonicalSoak({
      profile: parsed.profile,
      revision: parsed.revision,
      expectedSubscriptionKeys: expectedSubscriptionKeysFromCutoverState({
        statePath: parsed.statePath,
        revision: parsed.revision,
      }),
      sampleOperations: createSystemOperationalSampler({ databasePath: parsed.databasePath }),
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, profile, reason: boundedFailure(error) })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
