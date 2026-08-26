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
import { request as secureRequest } from "node:https";
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

function assertCanonicalLoopbackProxy(block) {
  const directives = block.text
    .split(/\r?\n/)
    .map((line) => caddyTokens(line));
  if (directives.some((tokens) => tokens[0] === "import" || tokens[0] === "invoke")) {
    throw new Error("The Timbersteel proxy contains indirect proxy configuration.");
  }
  const proxyDirectives = directives.filter((tokens) => tokens[0] === "reverse_proxy");
  const [proxy] = proxyDirectives;
  const canonical = proxyDirectives.length === 1
    && proxy[1] === "127.0.0.1:19430"
    && (proxy.length === 2 || (proxy.length === 3 && proxy[2] === "{"));
  if (!canonical) {
    throw new Error("The Timbersteel proxy does not target the canonical loopback service.");
  }
}

function assertReviewedForwarding(block) {
  assertCanonicalLoopbackProxy(block);
  const expectedHeaders = new Set([
    JSON.stringify(["header_up", "Host", "{", "host", "}"]),
    JSON.stringify(["header_up", "X-Forwarded-For", "{", "remote_host", "}"]),
    JSON.stringify(["header_up", "X-Forwarded-Host", "{", "host", "}"]),
    JSON.stringify(["header_up", "X-Forwarded-Proto", "{", "scheme", "}"]),
  ]);
  const headers = block.text
    .split(/\r?\n/)
    .map((line) => caddyTokens(line))
    .filter((tokens) => tokens[0] === "header_up")
    .map((tokens) => JSON.stringify(tokens));
  if (headers.length !== expectedHeaders.size
    || new Set(headers).size !== expectedHeaders.size
    || headers.some((header) => !expectedHeaders.has(header))) {
    throw new Error("The Timbersteel proxy is missing required trusted forwarding headers.");
  }
}

function assertPublicRouting(apex, www) {
  if (apex.labels.length !== 1 || apex.labels[0] !== PUBLIC_APEX
    || www.labels.length !== 1 || www.labels[0] !== PUBLIC_WWW) {
    throw new Error("The public hosts must use the reviewed standalone site labels.");
  }
  assertReviewedForwarding(apex);
  if (!www.text.includes("redir https://claim-monitor.com{uri} permanent")) {
    throw new Error("The public www host does not redirect to the public apex.");
  }
}

function caddyTokens(source) {
  const tokens = [];
  let token = "";
  let quote = "";
  let escaped = false;
  let comment = false;
  const flush = () => {
    if (token) tokens.push(token);
    token = "";
  };
  for (const character of source) {
    if (comment) {
      if (character === "\n") comment = false;
      continue;
    }
    if (quote) {
      token += character;
      if (escaped) escaped = false;
      else if (character === "\\" && quote !== "`") escaped = true;
      else if (character === quote) {
        quote = "";
        flush();
      }
      continue;
    }
    if (character === "#") {
      flush();
      comment = true;
    } else if (character === '"' || character === "'" || character === "`") {
      flush();
      quote = character;
      token = character;
    } else if (/\s/.test(character)) {
      flush();
    } else if (character === "{" || character === "}") {
      flush();
      tokens.push(character);
    } else {
      token += character;
    }
  }
  flush();
  if (quote) throw new Error("Caddy configuration is incomplete.");
  return tokens;
}

function matchesReviewedBlock(liveBlock, referenceBlock) {
  return JSON.stringify(caddyTokens(liveBlock.text)) === JSON.stringify(caddyTokens(referenceBlock.text));
}

export function buildPublicCaddyCandidate(liveSource, referenceSource) {
  const liveTimbersteel = siteBlock(liveSource, TIMBERSTEEL_APEX);
  assertCanonicalLoopbackProxy(liveTimbersteel);
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
    if (!matchesReviewedBlock(liveApex, referenceApex) || !matchesReviewedBlock(liveWww, referenceWww)) {
      throw new Error("Existing public hosts do not match the reviewed public routing.");
    }
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

function profileRequest(host, pathname, { secure = false } = {}) {
  return new Promise((resolve) => {
    const client = (secure ? secureRequest : request)({
      hostname: secure ? host : "127.0.0.1",
      port: secure ? 443 : 19430,
      path: pathname,
      method: "GET",
      headers: { Host: host },
      servername: secure ? host : undefined,
      timeout: 5_000,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, location: response.headers.location ?? null, body: JSON.parse(body) });
        } catch {
          resolve({ status: response.statusCode, location: response.headers.location ?? null, body: null });
        }
      });
    });
    client.on("timeout", () => client.destroy());
    client.on("error", () => resolve({ status: 0, location: null, body: null }));
    client.end();
  });
}

function publicFeaturesDisabled(publicProfile) {
  return publicProfile.status === 200
    && publicProfile.body?.profile?.id === "public"
    && publicProfile.body?.features?.publicProfileEnabled === false
    && publicProfile.body?.features?.publicCollaborationEnabled === false
    && publicProfile.body?.features?.publicLegalConfigurationConfirmed === false;
}

export function acceptedPublicCaddyState({ timbersteel, publicProfile, www }) {
  return timbersteel.status === 200
    && timbersteel.body?.ok === true
    && publicFeaturesDisabled(publicProfile)
    && www.status === 308
    && typeof www.location === "string"
    && www.location.startsWith(`https://${PUBLIC_APEX}/`);
}

export async function verifyPublicGatesDisabled() {
  return publicFeaturesDisabled(await profileRequest(PUBLIC_APEX, "/api/profile"));
}

export async function verifyPublicCaddyAcceptance() {
  const markerPath = "/claim-monitor-caddy-check?source=bootstrap";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [timbersteel, publicProfile, www] = await Promise.all([
      profileRequest(TIMBERSTEEL_APEX, "/api/local/health", { secure: true }),
      profileRequest(PUBLIC_APEX, "/api/profile", { secure: true }),
      profileRequest(PUBLIC_WWW, markerPath, { secure: true }),
    ]);
    if (acceptedPublicCaddyState({ timbersteel, publicProfile, www })
      && www.location === `https://${PUBLIC_APEX}${markerPath}`) return true;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
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
  referencePath = "/etc/bitcraft-claim-monitor-relay/Caddyfile.public-reference",
  backupDirectory = "/root",
  runCaddy = defaultRunCaddy,
  verifyPublicGates = verifyPublicGatesDisabled,
  verifyAcceptance = verifyPublicCaddyAcceptance,
  backupStamp = new Date().toISOString().replaceAll(/[:.]/g, "-"),
} = {}) {
  const liveSource = readFileSync(livePath, "utf8");
  const referenceSource = readFileSync(referencePath, "utf8");
  const candidate = buildPublicCaddyCandidate(liveSource, referenceSource);
  const sourceStat = statSync(livePath);
  if (!await verifyPublicGates()) throw new Error("Public feature gates must be disabled before Caddy configuration.");

  if (!candidate.changed) {
    runCaddy(["validate", "--config", livePath]);
    runCaddy(["reload", "--config", livePath]);
    if (!await verifyAcceptance()) throw new Error("External Caddy acceptance verification failed after reload.");
    return { changed: false, backupPath: null };
  }

  const backupPath = path.join(backupDirectory, `Caddyfile.before-claim-monitor-${backupStamp}`);
  const candidatePath = installFile(livePath, candidate.content, sourceStat, "candidate");
  let installed = false;
  try {
    runCaddy(["validate", "--config", candidatePath, "--adapter", "caddyfile"]);
    copyFileSync(livePath, backupPath, constants.COPYFILE_EXCL);
    chmodSync(backupPath, 0o600);
    renameSync(candidatePath, livePath);
    installed = true;
    runCaddy(["reload", "--config", livePath]);
    if (!await verifyAcceptance()) throw new Error("External Caddy acceptance verification failed after reload.");
    return { changed: true, backupPath };
  } catch (error) {
    if (installed) {
      const rollbackPath = installFile(livePath, readFileSync(backupPath, "utf8"), sourceStat, "rollback");
      try {
        runCaddy(["validate", "--config", rollbackPath, "--adapter", "caddyfile"]);
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
