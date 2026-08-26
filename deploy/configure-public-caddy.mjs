import { spawnSync } from "node:child_process";
import {
  constants,
  chmodSync,
  chownSync,
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_APEX = "claim-monitor.com";
const PUBLIC_WWW = "www.claim-monitor.com";
const TIMBERSTEEL_APEX = "app.timbersteeltrade.com";

function topLevelBlocks(source) {
  const blocks = [];
  let depth = 0;
  let blockStart = -1;
  let lineStart = 0;
  let quote = "";
  let escaped = false;
  let comment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (comment) {
      if (character === "\n") {
        comment = false;
        lineStart = index + 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\" && quote !== "`") escaped = true;
      else if (character === quote) quote = "";
      if (character === "\n") lineStart = index + 1;
      continue;
    }
    if (character === "#") {
      comment = true;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") {
      if (depth === 0) blockStart = lineStart;
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth < 0) throw new Error("Caddy configuration has an unmatched closing brace.");
      if (depth === 0 && blockStart >= 0) {
        let end = index + 1;
        if (source[end] === "\r") end += 1;
        if (source[end] === "\n") end += 1;
        const headerEnd = source.indexOf("{", blockStart);
        const header = source.slice(blockStart, headerEnd).trim();
        const labels = header.split(/[\s,]+/).filter(Boolean);
        blocks.push({ labels, start: blockStart, end, text: source.slice(blockStart, end) });
        blockStart = -1;
      }
      continue;
    }
    if (character === "\n") lineStart = index + 1;
  }
  if (depth !== 0 || quote) throw new Error("Caddy configuration is incomplete.");
  return blocks;
}

function siteBlock(source, hostname, { required = true } = {}) {
  const matches = topLevelBlocks(source).filter((block) => block.labels.includes(hostname));
  if (matches.length > 1) throw new Error(`Caddy host ${hostname} is configured more than once.`);
  if (required && matches.length !== 1) throw new Error(`Caddy host ${hostname} is not configured.`);
  return matches[0] ?? null;
}

function assertTimbersteelForwarding(block) {
  for (const line of [
    "header_up Host {host}",
    "header_up X-Forwarded-For {remote_host}",
    "header_up X-Forwarded-Host {host}",
    "header_up X-Forwarded-Proto {scheme}",
  ]) {
    if (!block.text.includes(line)) throw new Error("The Timbersteel proxy is missing required trusted forwarding headers.");
  }
  if (!block.text.includes("reverse_proxy 127.0.0.1:19430")) {
    throw new Error("The Timbersteel proxy does not target the canonical loopback service.");
  }
}

function assertPublicRouting(apex, www) {
  assertTimbersteelForwarding(apex);
  if (!www.text.includes("redir https://claim-monitor.com{uri} permanent")) {
    throw new Error("The public www host does not redirect to the public apex.");
  }
}

export function buildPublicCaddyCandidate(liveSource, referenceSource) {
  const liveTimbersteel = siteBlock(liveSource, TIMBERSTEEL_APEX);
  assertTimbersteelForwarding(liveTimbersteel);
  const referenceApex = siteBlock(referenceSource, PUBLIC_APEX);
  const referenceWww = siteBlock(referenceSource, PUBLIC_WWW);
  assertPublicRouting(referenceApex, referenceWww);

  const liveApex = siteBlock(liveSource, PUBLIC_APEX, { required: false });
  const liveWww = siteBlock(liveSource, PUBLIC_WWW, { required: false });
  if (Boolean(liveApex) !== Boolean(liveWww)) {
    throw new Error("Public Claim Monitor Caddy routing is partially configured; refusing automatic changes.");
  }
  if (liveApex && liveWww) {
    assertPublicRouting(liveApex, liveWww);
    return { content: liveSource, changed: false };
  }

  const prefix = liveSource.endsWith("\n") ? liveSource : `${liveSource}\n`;
  const publicBlocks = `${referenceApex.text.trimEnd()}\n\n${referenceWww.text.trimEnd()}\n`;
  return { content: `${prefix}\n${publicBlocks}`, changed: true };
}

function defaultRunCaddy(args) {
  const result = spawnSync("caddy", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Caddy command failed: ${args[0]}.`);
}

function profileRequest(host, pathname) {
  return new Promise((resolve) => {
    const client = request({
      hostname: "127.0.0.1",
      port: 19430,
      path: pathname,
      method: "GET",
      headers: { Host: host },
      timeout: 3_000,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: response.statusCode, body: null });
        }
      });
    });
    client.on("timeout", () => client.destroy());
    client.on("error", () => resolve({ status: 0, body: null }));
    client.end();
  });
}

export async function verifyLocalProfiles() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const [timbersteel, publicProfile] = await Promise.all([
      profileRequest(TIMBERSTEEL_APEX, "/api/local/health"),
      profileRequest(PUBLIC_APEX, "/api/profile"),
    ]);
    if (
      timbersteel.status === 200
      && timbersteel.body?.ok === true
      && publicProfile.status === 200
      && publicProfile.body?.profile?.id === "public"
    ) return true;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

function preserveOwnership(targetPath, sourceStat) {
  chmodSync(targetPath, sourceStat.mode & 0o777);
  if (process.platform !== "win32") chownSync(targetPath, sourceStat.uid, sourceStat.gid);
}

function installFile(targetPath, content, sourceStat, suffix) {
  const temporaryPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${suffix}.${process.pid}`);
  writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx", mode: sourceStat.mode & 0o777 });
  preserveOwnership(temporaryPath, sourceStat);
  return temporaryPath;
}

export async function installPublicCaddyConfiguration({
  livePath = "/etc/caddy/Caddyfile",
  referencePath = "/opt/bitcraft-claim-monitor-relay/current/deploy/Caddyfile.example",
  backupDirectory = "/root",
  runCaddy = defaultRunCaddy,
  verifyLocalProfiles: verifyProfiles = verifyLocalProfiles,
  backupStamp = new Date().toISOString().replaceAll(/[:.]/g, "-"),
} = {}) {
  const liveSource = readFileSync(livePath, "utf8");
  const referenceSource = readFileSync(referencePath, "utf8");
  const candidate = buildPublicCaddyCandidate(liveSource, referenceSource);
  const sourceStat = statSync(livePath);

  if (!candidate.changed) {
    runCaddy(["validate", "--config", livePath]);
    runCaddy(["reload", "--config", livePath]);
    if (!await verifyProfiles()) throw new Error("Local profile verification failed after Caddy reload.");
    return { changed: false, backupPath: null };
  }

  const backupPath = path.join(backupDirectory, `Caddyfile.before-claim-monitor-${backupStamp}`);
  const candidatePath = installFile(livePath, candidate.content, sourceStat, "candidate");
  let installed = false;
  try {
    runCaddy(["validate", "--config", candidatePath]);
    copyFileSync(livePath, backupPath, constants.COPYFILE_EXCL);
    chmodSync(backupPath, 0o600);
    renameSync(candidatePath, livePath);
    installed = true;
    runCaddy(["reload", "--config", livePath]);
    if (!await verifyProfiles()) throw new Error("Local profile verification failed after Caddy reload.");
    return { changed: true, backupPath };
  } catch (error) {
    if (installed) {
      const rollbackPath = installFile(livePath, readFileSync(backupPath, "utf8"), sourceStat, "rollback");
      try {
        runCaddy(["validate", "--config", rollbackPath]);
        renameSync(rollbackPath, livePath);
        runCaddy(["reload", "--config", livePath]);
      } finally {
        if (existsSync(rollbackPath)) rmSync(rollbackPath, { force: true });
      }
    }
    throw error;
  } finally {
    if (existsSync(candidatePath)) rmSync(candidatePath, { force: true });
  }
}

async function main() {
  if (process.env.BITCRAFT_PUBLIC_CADDY_UPDATER !== "1") {
    throw new Error("Invoke public Caddy configuration only through update-bitcraft-claim-monitor-relay.");
  }
  if (process.argv.length !== 4 || process.argv[2] !== "--confirmation" || process.argv[3] !== PUBLIC_APEX) {
    throw new Error("Exact claim-monitor.com confirmation is required.");
  }
  const result = await installPublicCaddyConfiguration();
  process.stdout.write(`${JSON.stringify({ ok: true, changed: result.changed, backupCreated: Boolean(result.backupPath) })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Public Caddy configuration failed."}\n`);
    process.exitCode = 1;
  });
}
