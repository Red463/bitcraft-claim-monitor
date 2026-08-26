import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  fchmodSync,
  fchownSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_ORIGIN = "https://claim-monitor.com";
const PUBLIC_HOST = "claim-monitor.com";
const TIMBERSTEEL_HOST = "app.timbersteeltrade.com";
const WEB_SERVICE = "bitcraft-claim-monitor-relay.service";
const WORKER_SERVICE = "bitcraft-claim-monitor-relay-worker.service";
const PUBLIC_SNAPSHOT_DOMAINS = ["claim", "members", "citizens", "inventories", "crafts"];
const TIMBERSTEEL_DATABASE_PATH = "/var/lib/bitcraft-claim-monitor-relay/bitcraft-local.sqlite";
const TIMBERSTEEL_FINGERPRINT_TABLES = [
  "market_events",
  "market_trades",
  "activity_events",
  "provider_transition_outbox",
  "discord_notification_outbox",
];

function fingerprintRow(row) {
  return JSON.stringify(row, (_key, value) => {
    if (typeof value === "bigint") return { bigint: value.toString() };
    if (value instanceof Uint8Array) return { blob: Buffer.from(value).toString("base64") };
    return value;
  });
}

export function captureTimbersteelFingerprints(databasePath = TIMBERSTEEL_DATABASE_PATH, bounds = null) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return Object.fromEntries(TIMBERSTEEL_FINGERPRINT_TABLES.map((table) => {
      const maxStatement = database.prepare(`SELECT COALESCE(MAX(rowid), 0) AS max_rowid FROM ${table}`);
      maxStatement.setReadBigInts(true);
      const currentMaxRowid = maxStatement.get().max_rowid;
      const bound = bounds?.[table] == null ? currentMaxRowid : BigInt(bounds[table]);
      if (currentMaxRowid < bound) throw new Error(`Timbersteel ${table} row prefix moved backwards.`);
      const rows = database.prepare(`SELECT * FROM ${table} WHERE rowid <= ? ORDER BY rowid`);
      rows.setReadBigInts(true);
      const hash = createHash("sha256");
      for (const row of rows.iterate(bound)) hash.update(`${fingerprintRow(row)}\n`);
      return [table, { maxRowid: currentMaxRowid.toString(), boundMaxRowid: bound.toString(), prefixHash: hash.digest("hex") }];
    }));
  } finally {
    database.close();
  }
}

export function verifyTimbersteelFingerprints(baseline, databasePath = TIMBERSTEEL_DATABASE_PATH) {
  const bounds = Object.fromEntries(TIMBERSTEEL_FINGERPRINT_TABLES.map((table) => [table, baseline?.[table]?.maxRowid]));
  if (Object.values(bounds).some((value) => !/^(0|[1-9][0-9]*)$/.test(String(value ?? "")))) {
    throw new Error("Timbersteel history/outbox fingerprint baseline is invalid.");
  }
  const current = captureTimbersteelFingerprints(databasePath, bounds);
  for (const table of TIMBERSTEEL_FINGERPRINT_TABLES) {
    if (current[table].prefixHash !== baseline[table].prefixHash) {
      throw new Error(`Timbersteel history/outbox prefix changed: ${table}.`);
    }
  }
  return current;
}

function environmentValue(source, key) {
  const matches = [...source.matchAll(new RegExp(`^${key}=(.*)$`, "gm"))];
  if (matches.length > 1) throw new Error(`${key} must be configured exactly once.`);
  return matches[0]?.[1] ?? null;
}

function setEnvironmentValue(source, key, value) {
  if (environmentValue(source, key) !== null) {
    return source.replace(new RegExp(`^${key}=.*$`, "m"), () => `${key}=${value}`);
  }
  return `${source}${source.endsWith("\n") || source.length === 0 ? "" : "\n"}${key}=${value}\n`;
}

export function editPublicReadOnlyEnvironment(source) {
  if (typeof source !== "string" || source.includes("\0")) throw new Error("Protected environment file is invalid.");
  const profile = environmentValue(source, "PUBLIC_PROFILE_ENABLED");
  const collaboration = environmentValue(source, "PUBLIC_COLLABORATION_ENABLED");
  const legal = environmentValue(source, "PUBLIC_LEGAL_CONFIGURATION_CONFIRMED");
  const origin = environmentValue(source, "PUBLIC_ORIGIN");
  if (collaboration !== null && collaboration !== "false") {
    throw new Error("Public collaboration must remain disabled during Stage 1.");
  }
  const disabled = (profile === null || profile === "false") && (legal === null || legal === "false");
  const readOnly = profile === "true" && legal === "true";
  if (!disabled && !readOnly) throw new Error("Public profile and legal gates are not in a safe Stage 1 state.");
  if (origin !== null && origin !== PUBLIC_ORIGIN) throw new Error("Public origin is not the approved Claim Monitor origin.");
  let next = setEnvironmentValue(source, "PUBLIC_ORIGIN", PUBLIC_ORIGIN);
  next = setEnvironmentValue(next, "PUBLIC_PROFILE_ENABLED", "true");
  next = setEnvironmentValue(next, "PUBLIC_COLLABORATION_ENABLED", "false");
  return setEnvironmentValue(next, "PUBLIC_LEGAL_CONFIGURATION_CONFIRMED", "true");
}

export function editPublicDisabledEnvironment(source) {
  if (typeof source !== "string" || source.includes("\0")) throw new Error("Protected environment file is invalid.");
  const collaboration = environmentValue(source, "PUBLIC_COLLABORATION_ENABLED");
  const origin = environmentValue(source, "PUBLIC_ORIGIN");
  if (collaboration !== null && collaboration !== "false") {
    throw new Error("Public collaboration must remain disabled during Stage 1.");
  }
  if (origin !== null && origin !== PUBLIC_ORIGIN) throw new Error("Public origin is not the approved Claim Monitor origin.");
  let next = setEnvironmentValue(source, "PUBLIC_ORIGIN", PUBLIC_ORIGIN);
  next = setEnvironmentValue(next, "PUBLIC_PROFILE_ENABLED", "false");
  next = setEnvironmentValue(next, "PUBLIC_COLLABORATION_ENABLED", "false");
  return setEnvironmentValue(next, "PUBLIC_LEGAL_CONFIGURATION_CONFIRMED", "false");
}

function protectedEnvironmentMetadata(environmentPath, enforceRootOwnership) {
  const metadata = lstatSync(environmentPath, { bigint: true });
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1n
    || (process.platform !== "win32" && Number(metadata.mode & 0o777n) !== 0o600)
    || (enforceRootOwnership && (metadata.uid !== 0n || metadata.gid !== 0n))) {
    throw new Error("Protected environment file ownership or mode is invalid.");
  }
  return metadata;
}

function syncDirectory(directory) {
  if (process.platform === "win32") return;
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function writeEnvironmentAtomic(environmentPath, bytes, metadata, {
  onCommit = () => {},
  renameOperation = renameSync,
  syncDirectoryOperation = syncDirectory,
} = {}) {
  const directory = path.dirname(environmentPath);
  const temporaryPath = path.join(directory, `.${path.basename(environmentPath)}.public-readonly.${process.pid}.${Date.now()}`);
  try {
    const descriptor = openSync(temporaryPath, "wx", 0o600);
    try {
      writeFileSync(descriptor, bytes);
      fchmodSync(descriptor, Number(metadata.mode & 0o777n));
      if (process.platform !== "win32") fchownSync(descriptor, Number(metadata.uid), Number(metadata.gid));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameOperation(temporaryPath, environmentPath);
    onCommit();
    syncDirectoryOperation(directory);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function runSystemctl(args) {
  const result = spawnSync("systemctl", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Systemd operation failed: ${args[0]}.`);
  return result.stdout.trim();
}

function localJsonRequest(host, pathname) {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      hostname: "127.0.0.1",
      port: 19430,
      path: pathname,
      method: "GET",
      headers: { Host: host },
      timeout: 5_000,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, body: JSON.parse(body) });
        } catch {
          reject(new Error("Service verification returned malformed JSON."));
        }
      });
    });
    outgoing.on("timeout", () => outgoing.destroy(new Error("Service verification timed out.")));
    outgoing.on("error", reject);
    outgoing.end();
  });
}

async function waitForTimbersteelHealth() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await localJsonRequest(TIMBERSTEEL_HOST, "/api/local/health");
      if (response.status === 200 && response.body?.ok === true) return;
    } catch {
      // Retry while systemd completes the bounded web restart.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Timbersteel health verification failed after public read-only activation.");
}

function defaultReadProcessEnvironment(pid) {
  const values = new Map();
  for (const entry of readFileSync(`/proc/${pid}/environ`).toString("utf8").split("\0")) {
    const separator = entry.indexOf("=");
    if (separator > 0) values.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
  return values;
}

const defaultOperations = {
  getServicePid(service) {
    const value = runSystemctl(["show", service, "--property=MainPID", "--value"]);
    if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`Service PID is unavailable: ${service}.`);
    return value;
  },
  restartService(service) { runSystemctl(["restart", service]); },
  stopService(service) { runSystemctl(["stop", service]); },
  waitForWebHealth: waitForTimbersteelHealth,
  readProcessEnvironment: defaultReadProcessEnvironment,
  async readPublicProfile() {
    const response = await localJsonRequest(PUBLIC_HOST, "/api/profile");
    if (response.status !== 200) throw new Error("Public profile verification failed.");
    return response.body;
  },
  readPublicSearch() {
    return localJsonRequest(PUBLIC_HOST, "/api/public/settlements/search?q=tim");
  },
  readPublicSnapshot(claimId, domains) {
    return localJsonRequest(
      PUBLIC_HOST,
      `/api/public/settlements/${encodeURIComponent(claimId)}?domains=${encodeURIComponent(domains.join(","))}`,
    );
  },
  captureTimbersteelFingerprints() { return captureTimbersteelFingerprints(); },
  verifyTimbersteelFingerprints(baseline) { return verifyTimbersteelFingerprints(baseline); },
};

function publicFlagsDisabled(profile) {
  return profile?.profile?.id === "public"
    && profile?.features?.publicProfileEnabled === false
    && profile?.features?.publicCollaborationEnabled === false
    && profile?.features?.publicLegalConfigurationConfirmed === false;
}

function publicFlagsReadOnly(profile) {
  return profile?.profile?.id === "public"
    && profile?.features?.publicProfileEnabled === true
    && profile?.features?.publicCollaborationEnabled === false
    && profile?.features?.publicLegalConfigurationConfirmed === true;
}

function readOnlyEnvironmentLoaded(environment) {
  return environment.get("PUBLIC_ORIGIN") === PUBLIC_ORIGIN
    && environment.get("PUBLIC_PROFILE_ENABLED") === "true"
    && environment.get("PUBLIC_COLLABORATION_ENABLED") === "false"
    && environment.get("PUBLIC_LEGAL_CONFIGURATION_CONFIRMED") === "true";
}

function disabledEnvironmentLoaded(environment) {
  return environment.get("PUBLIC_ORIGIN") === PUBLIC_ORIGIN
    && environment.get("PUBLIC_PROFILE_ENABLED") === "false"
    && environment.get("PUBLIC_COLLABORATION_ENABLED") === "false"
    && environment.get("PUBLIC_LEGAL_CONFIGURATION_CONFIRMED") === "false";
}

export async function enablePublicReadOnly({
  environmentPath = "/etc/bitcraft-claim-monitor-relay.env",
  operations = defaultOperations,
  atomicWrite = writeEnvironmentAtomic,
  enforceRootOwnership = true,
} = {}) {
  const beforeProfile = await operations.readPublicProfile();
  if (!publicFlagsDisabled(beforeProfile) && !publicFlagsReadOnly(beforeProfile)) {
    throw new Error("Public feature gates are not in a safe Stage 1 state.");
  }
  const metadata = protectedEnvironmentMetadata(environmentPath, enforceRootOwnership);
  const timbersteelFingerprintBaseline = operations.captureTimbersteelFingerprints();
  const original = readFileSync(environmentPath);
  const updated = Buffer.from(editPublicReadOnlyEnvironment(original.toString("utf8")));
  const changed = !original.equals(updated);
  const workerPid = operations.getServicePid(WORKER_SERVICE);
  let installed = false;

  try {
    if (changed) {
      atomicWrite(environmentPath, updated, metadata, { onCommit() { installed = true; } });
      operations.restartService(WEB_SERVICE);
      await operations.waitForWebHealth();
    }
    const workerAfter = operations.getServicePid(WORKER_SERVICE);
    if (workerAfter !== workerPid) throw new Error("Timbersteel worker changed during public read-only activation.");
    const webPid = operations.getServicePid(WEB_SERVICE);
    if (!readOnlyEnvironmentLoaded(operations.readProcessEnvironment(webPid))) {
      throw new Error("Running web process did not load the public read-only configuration.");
    }
    if (!publicFlagsReadOnly(await operations.readPublicProfile())) {
      throw new Error("Public profile verification did not reach the read-only Stage 1 state.");
    }
    const search = await operations.readPublicSearch();
    if (search.status !== 200 || !Array.isArray(search.body?.hints)) {
      throw new Error("Public settlement search verification failed after Stage 1 activation.");
    }
    const claimId = search.body.hints.find((hint) => /^(0|[1-9][0-9]*)$/.test(String(hint?.claimId ?? "")))?.claimId;
    if (!claimId) throw new Error("Public settlement search verification returned no exact claim identifier.");
    const snapshot = await operations.readPublicSnapshot(String(claimId), PUBLIC_SNAPSHOT_DOMAINS);
    if (snapshot.status !== 200
      || snapshot.body?.claimId !== String(claimId)
      || !PUBLIC_SNAPSHOT_DOMAINS.every((domain) => Object.hasOwn(snapshot.body?.domains ?? {}, domain))) {
      throw new Error("Public settlement snapshot verification failed after Stage 1 activation.");
    }
    operations.verifyTimbersteelFingerprints(timbersteelFingerprintBaseline);
    return {
      changed,
      webRestarted: changed,
      workerUnchanged: true,
      publicProfile: "read-only",
      publicSearch: "available",
      publicSnapshot: "available",
      timbersteelFingerprints: "unchanged",
    };
  } catch (error) {
    if (installed) {
      try {
        atomicWrite(environmentPath, original, metadata);
        operations.restartService(WEB_SERVICE);
        await operations.waitForWebHealth();
        const restoredProfile = await operations.readPublicProfile();
        const restoredSearch = await operations.readPublicSearch();
        if (!publicFlagsDisabled(restoredProfile) || restoredSearch.status !== 404) {
          throw new Error("Disabled public profile was not restored.");
        }
      } catch {
        throw new Error("Public read-only activation failed and rollback could not restore the disabled public profile.");
      }
    }
    throw error;
  }
}

export async function disablePublicReadOnly({
  environmentPath = "/etc/bitcraft-claim-monitor-relay.env",
  operations = defaultOperations,
  atomicWrite = writeEnvironmentAtomic,
  enforceRootOwnership = true,
} = {}) {
  const beforeProfile = await operations.readPublicProfile();
  if (!publicFlagsDisabled(beforeProfile) && !publicFlagsReadOnly(beforeProfile)) {
    throw new Error("Public feature gates are not in a safe Stage 1 state.");
  }
  const metadata = protectedEnvironmentMetadata(environmentPath, enforceRootOwnership);
  const original = readFileSync(environmentPath);
  const updated = Buffer.from(editPublicDisabledEnvironment(original.toString("utf8")));
  const changed = !original.equals(updated);
  const workerPid = operations.getServicePid(WORKER_SERVICE);
  try {
    if (changed) {
      atomicWrite(environmentPath, updated, metadata);
      operations.restartService(WEB_SERVICE);
      await operations.waitForWebHealth();
    }
    if (operations.getServicePid(WORKER_SERVICE) !== workerPid) {
      throw new Error("Timbersteel worker changed while disabling the public profile.");
    }
    const webPid = operations.getServicePid(WEB_SERVICE);
    if (!disabledEnvironmentLoaded(operations.readProcessEnvironment(webPid))) {
      throw new Error("Running web process did not load the disabled public configuration.");
    }
    const profile = await operations.readPublicProfile();
    const search = await operations.readPublicSearch();
    if (!publicFlagsDisabled(profile) || search.status !== 404) {
      throw new Error("Disabled public profile could not be proven after emergency rollback.");
    }
    return { changed, webRestarted: changed, workerUnchanged: true, publicProfile: "disabled" };
  } catch (error) {
    try {
      operations.stopService(WEB_SERVICE);
    } catch {
      throw new Error("Public profile disable verification failed and the web service could not be stopped.");
    }
    throw new Error("Public profile disable verification failed; the web service was stopped to fail closed.");
  }
}

async function main() {
  if (process.env.BITCRAFT_PUBLIC_READONLY_UPDATER !== "1") {
    throw new Error("Invoke public read-only activation only through update-bitcraft-claim-monitor-relay.");
  }
  if (process.argv.length !== 8 || process.argv[2] !== "--revision"
    || !/^[0-9a-f]{40}$/.test(process.argv[3])
    || process.argv[4] !== "--mode" || !["enable", "disable"].includes(process.argv[5])
    || process.argv[6] !== "--confirmation" || process.argv[7] !== PUBLIC_HOST) {
    throw new Error("Exact revision and claim-monitor.com confirmation are required.");
  }
  const activeRelease = realpathSync("/opt/bitcraft-claim-monitor-relay/current");
  if (path.basename(activeRelease) !== process.argv[3]) {
    throw new Error("Public read-only activation requires the active deployed revision.");
  }
  const result = process.argv[5] === "disable"
    ? await disablePublicReadOnly()
    : await enablePublicReadOnly();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Public read-only activation failed."}\n`);
    process.exitCode = 1;
  });
}
