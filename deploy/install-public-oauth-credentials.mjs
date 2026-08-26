import { spawnSync } from "node:child_process";
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
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_ORIGIN = "https://claim-monitor.com";
const PUBLIC_HOST = "claim-monitor.com";
const TIMBERSTEEL_HOST = "app.timbersteeltrade.com";
const WEB_SERVICE = "bitcraft-claim-monitor-relay.service";
const WORKER_SERVICE = "bitcraft-claim-monitor-relay-worker.service";

function credentialPayloadError() {
  return new Error("Public OAuth credential payload is invalid.");
}

export function parseCredentialPayload(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > 1_024) throw credentialPayloadError();
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw credentialPayloadError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.keys(parsed).sort().join(",") !== "clientId,clientSecret"
    || typeof parsed.clientId !== "string"
    || typeof parsed.clientSecret !== "string"
    || !/^[0-9]{17,20}$/.test(parsed.clientId)
    || BigInt(parsed.clientId) > 18_446_744_073_709_551_615n
    || !/^[A-Za-z0-9._~-]{24,128}$/.test(parsed.clientSecret)) {
    throw credentialPayloadError();
  }
  return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
}

function exactEnvironmentValue(source, key) {
  const matches = [...source.matchAll(new RegExp(`^${key}=(.*)$`, "gm"))];
  if (matches.length !== 1) throw new Error(`${key} must be configured exactly once.`);
  return matches[0][1];
}

export function editPublicOAuthEnvironment(source, credentials) {
  if (typeof source !== "string" || source.includes("\0")) throw new Error("Protected environment file is invalid.");
  if (exactEnvironmentValue(source, "PUBLIC_PROFILE_ENABLED") !== "false"
    || exactEnvironmentValue(source, "PUBLIC_COLLABORATION_ENABLED") !== "false"
    || exactEnvironmentValue(source, "PUBLIC_LEGAL_CONFIGURATION_CONFIRMED") !== "false"
    || exactEnvironmentValue(source, "PUBLIC_ORIGIN") !== PUBLIC_ORIGIN) {
    throw new Error("Public feature gates must remain disabled during credential installation.");
  }
  exactEnvironmentValue(source, "PUBLIC_DISCORD_OAUTH_CLIENT_ID");
  exactEnvironmentValue(source, "PUBLIC_DISCORD_OAUTH_CLIENT_SECRET");
  return source
    .replace(/^PUBLIC_DISCORD_OAUTH_CLIENT_ID=.*$/m, () => `PUBLIC_DISCORD_OAUTH_CLIENT_ID=${credentials.clientId}`)
    .replace(/^PUBLIC_DISCORD_OAUTH_CLIENT_SECRET=.*$/m, () => `PUBLIC_DISCORD_OAUTH_CLIENT_SECRET=${credentials.clientSecret}`);
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
  const temporaryPath = path.join(directory, `.${path.basename(environmentPath)}.public-oauth.${process.pid}.${Date.now()}`);
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
  throw new Error("Timbersteel health verification failed after credential installation.");
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
  restartService(service) {
    runSystemctl(["restart", service]);
  },
  waitForWebHealth: waitForTimbersteelHealth,
  readProcessEnvironment: defaultReadProcessEnvironment,
  async readPublicProfile() {
    const response = await localJsonRequest(PUBLIC_HOST, "/api/profile");
    if (response.status !== 200) throw new Error("Public profile verification failed.");
    return response.body;
  },
};

function publicFlagsDisabled(profile) {
  return profile?.profile?.id === "public"
    && profile?.features?.publicProfileEnabled === false
    && profile?.features?.publicCollaborationEnabled === false
    && profile?.features?.publicLegalConfigurationConfirmed === false;
}

function credentialsLoaded(processEnvironment, credentials) {
  return processEnvironment.get("PUBLIC_DISCORD_OAUTH_CLIENT_ID") === credentials.clientId
    && processEnvironment.get("PUBLIC_DISCORD_OAUTH_CLIENT_SECRET") === credentials.clientSecret;
}

export async function installPublicOAuthCredentials({
  environmentPath = "/etc/bitcraft-claim-monitor-relay.env",
  credentials,
  operations = defaultOperations,
  atomicWrite = writeEnvironmentAtomic,
  enforceRootOwnership = true,
} = {}) {
  if (!publicFlagsDisabled(await operations.readPublicProfile())) {
    throw new Error("Public feature gates must remain disabled during credential installation.");
  }
  const metadata = protectedEnvironmentMetadata(environmentPath, enforceRootOwnership);
  const original = readFileSync(environmentPath);
  const updated = Buffer.from(editPublicOAuthEnvironment(original.toString("utf8"), credentials));
  const workerPid = operations.getServicePid(WORKER_SERVICE);
  let installed = false;

  try {
    atomicWrite(environmentPath, updated, metadata, {
      onCommit() { installed = true; },
    });
    operations.restartService(WEB_SERVICE);
    await operations.waitForWebHealth();
    const workerAfter = operations.getServicePid(WORKER_SERVICE);
    if (workerAfter !== workerPid) throw new Error("Timbersteel worker changed during public OAuth credential installation.");
    const webPid = operations.getServicePid(WEB_SERVICE);
    if (!credentialsLoaded(operations.readProcessEnvironment(webPid), credentials)) {
      throw new Error("Running web process did not load the public OAuth credentials.");
    }
    if (!publicFlagsDisabled(await operations.readPublicProfile())) {
      throw new Error("Public feature gates changed during credential installation.");
    }
    return {
      changed: !original.equals(updated),
      webRestarted: true,
      workerUnchanged: true,
      credentialsLoaded: true,
      publicFlags: "disabled",
    };
  } catch (error) {
    if (installed) {
      try {
        atomicWrite(environmentPath, original, metadata);
        operations.restartService(WEB_SERVICE);
        await operations.waitForWebHealth();
      } catch {
        throw new Error("Public OAuth credential installation failed and rollback could not restore web health.");
      }
    }
    throw error;
  }
}

async function readStdinBounded() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > 1_024) throw credentialPayloadError();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function main() {
  if (process.env.BITCRAFT_PUBLIC_OAUTH_UPDATER !== "1") {
    throw new Error("Invoke public OAuth credential installation only through update-bitcraft-claim-monitor-relay.");
  }
  if (process.argv.length !== 6 || process.argv[2] !== "--revision"
    || !/^[0-9a-f]{40}$/.test(process.argv[3])
    || process.argv[4] !== "--confirmation" || process.argv[5] !== PUBLIC_HOST) {
    throw new Error("Exact revision and claim-monitor.com confirmation are required.");
  }
  const activeRelease = realpathSync("/opt/bitcraft-claim-monitor-relay/current");
  if (path.basename(activeRelease) !== process.argv[3]) {
    throw new Error("Public OAuth credential installation requires the active deployed revision.");
  }
  const credentials = parseCredentialPayload(await readStdinBounded());
  const result = await installPublicOAuthCredentials({ credentials });
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Public OAuth credential installation failed."}\n`);
    process.exitCode = 1;
  });
}
