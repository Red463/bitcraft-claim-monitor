#!/usr/bin/env node

/**
 * Local-only BitCraft live SpacetimeDB dump tool.
 *
 * This intentionally stays out of the app and stores sensitive output under
 * ignored `.dev-data/`. Regional SpacetimeDB connections with a normal player
 * token can sign that player out of the live game, so run scans with a dedicated
 * collector account when possible.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import {
  DEFAULT_BITCRAFT_AUTH_ORIGIN,
  DEFAULT_GLOBAL_DATABASE,
  DEFAULT_SCHEMA_VERSION,
  DEFAULT_SPACETIME_HOST,
  SPACETIME_JSON_PROTOCOL,
  buildOneOffQueryMessage,
  decodeOneOffRows,
  extractTokenFromAuthenticateResponse,
  httpToWsHost,
  normalizeHost,
  pickTables,
  redactToken,
  safeSqlIdentifier,
  schemaTableNames,
  splitCsv,
  timestampSlug,
} from "./bitcraft-live-db-tools.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(repoRoot, ".dev-data", "bitcraft-live-db");
const tokenFile = path.join(stateDir, "token.json");
const outputRoot = path.join(stateDir, "dumps");
const powershellOneOffScript = path.join(repoRoot, "scripts", "bitcraft-live-db-oneoff.ps1");
const execFileAsync = promisify(execFile);

function usage() {
  return `Usage:
  node scripts/bitcraft-live-db.mjs request-code --email you@example.com
  node scripts/bitcraft-live-db.mjs exchange-code --email you@example.com --code 123456
  node scripts/bitcraft-live-db.mjs schema --database bitcraft-live-global
  node scripts/bitcraft-live-db.mjs query --database bitcraft-live-19 --sql "SELECT * FROM claim_state"
  node scripts/bitcraft-live-db.mjs scan --database bitcraft-live-19 --include claim,tech
  node scripts/bitcraft-live-db.mjs scan --database bitcraft-live-19 --all-tables --confirm-session-risk

Defaults:
  Host: ${DEFAULT_SPACETIME_HOST}
  Token file: .dev-data/bitcraft-live-db/token.json
  Transport: powershell on Windows, node elsewhere. Override with --transport node|powershell.

Important:
  Regional scans with a normal player JWT can sign that player out of the game.
  The token and dumps are local ignored files, but dump contents may include live player/settlement data.
`;
}

function parseArgs(argv) {
  const firstArg = argv[2];
  const args = { command: firstArg && !firstArg.startsWith("--") ? firstArg : "help" };
  const optionStart = args.command === "help" ? 2 : 3;
  for (let index = optionStart; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 500)}`);
  return text;
}

async function fetchJsonOrText(url, options = {}) {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getStoredToken() {
  const tokenFromEnv = String(process.env.BITCRAFT_PLAYER_TOKEN ?? process.env.BITCRAFT_JWT ?? "").trim();
  if (tokenFromEnv) return { token: tokenFromEnv, source: "environment" };
  const stored = await readJsonIfExists(tokenFile);
  const token = String(stored?.token ?? "").trim();
  if (token) return { token, source: tokenFile };
  return { token: "", source: "" };
}

async function saveToken(token, metadata) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(`${tokenFile}.tmp`, `${JSON.stringify({ token, ...metadata }, null, 2)}\n`, "utf8");
  await writeFile(tokenFile, `${JSON.stringify({ token, ...metadata }, null, 2)}\n`, "utf8");
}

async function getSchema({ host, database, schemaVersion }) {
  return fetchJsonOrText(`${host}/v1/database/${encodeURIComponent(database)}/schema?version=${encodeURIComponent(schemaVersion)}`);
}

function waitForOpen(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for SpacetimeDB WebSocket open")), timeoutMs);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("SpacetimeDB WebSocket connection error"));
    }, { once: true });
  });
}

async function runOneOffQuery({ host, database, token, sql, timeoutMs = 60000 }) {
  const wsHost = httpToWsHost(host);
  const url = `${wsHost}/v1/database/${encodeURIComponent(database)}/subscribe`;
  const socket = new WebSocket(url, [SPACETIME_JSON_PROTOCOL], {
    headers: { Authorization: `Bearer ${token}` },
    perMessageDeflate: false,
  });
  let identitySeen = false;

  try {
    await waitForOpen(socket, timeoutMs);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { socket.close(); } catch {}
        reject(new Error(`Timed out waiting for query result from ${database}`));
      }, timeoutMs);

      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch (error) {
          clearTimeout(timer);
          reject(error);
          return;
        }
        if (message.IdentityToken) {
          identitySeen = true;
          socket.send(JSON.stringify(buildOneOffQueryMessage(sql)));
          return;
        }
        if (message.SubscriptionError) {
          clearTimeout(timer);
          reject(new Error(message.SubscriptionError.error ?? "SpacetimeDB subscription error"));
          return;
        }
        if (message.OneOffQueryResponse) {
          clearTimeout(timer);
          try { socket.close(); } catch {}
          resolve(decodeOneOffRows(message));
        }
      });

      socket.addEventListener("close", () => {
        if (!identitySeen) {
          clearTimeout(timer);
          reject(new Error(`SpacetimeDB closed the connection before authenticating ${database}`));
        }
      }, { once: true });
    });
  } finally {
    try { socket.close(); } catch {}
  }
}

async function tokenFileForPowerShell(tokenInfo) {
  if (path.resolve(tokenInfo.source || "") === path.resolve(tokenFile)) return tokenFile;
  const runtimeTokenFile = path.join(stateDir, "runtime-token.json");
  await mkdir(stateDir, { recursive: true });
  await writeFile(runtimeTokenFile, `${JSON.stringify({ token: tokenInfo.token, savedAt: new Date().toISOString(), source: tokenInfo.source }, null, 2)}\n`, "utf8");
  return runtimeTokenFile;
}

async function runOneOffQueryWithPowerShell({ host, database, tokenInfo, sql, timeoutMs = 60000 }) {
  const queryOutputFile = path.join(stateDir, "tmp", `${timestampSlug()}-${randomUUID()}.json`);
  const helperTokenFile = await tokenFileForPowerShell(tokenInfo);
  await mkdir(path.dirname(queryOutputFile), { recursive: true });
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      powershellOneOffScript,
      "-TokenFile",
      helperTokenFile,
      "-HostUrl",
      host,
      "-Database",
      database,
      "-Sql",
      sql,
      "-OutputFile",
      queryOutputFile,
      "-TimeoutMs",
      String(timeoutMs),
    ],
    {
      timeout: timeoutMs + 10000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  const responseText = (await readFile(queryOutputFile, "utf8")).replace(/^\uFEFF/, "");
  return decodeOneOffRows(JSON.parse(responseText));
}

async function runSelectedOneOffQuery({ transport, host, database, tokenInfo, sql, timeoutMs = 60000 }) {
  const selectedTransport = String(transport || (process.platform === "win32" ? "powershell" : "node")).toLowerCase();
  if (selectedTransport === "powershell") {
    return runOneOffQueryWithPowerShell({ host, database, tokenInfo, sql, timeoutMs });
  }
  if (selectedTransport === "node") {
    return runOneOffQuery({ host, database, token: tokenInfo.token, sql, timeoutMs });
  }
  throw new Error(`Unknown transport: ${transport}`);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.command === "help") {
    process.stdout.write(usage());
    return;
  }

  const authOrigin = normalizeHost(args["auth-origin"] ?? process.env.BITCRAFT_AUTH_ORIGIN ?? DEFAULT_BITCRAFT_AUTH_ORIGIN);
  const host = normalizeHost(args.host ?? process.env.BITCRAFT_SPACETIME_HOST ?? DEFAULT_SPACETIME_HOST);
  const database = String(args.database ?? process.env.BITCRAFT_SPACETIME_DATABASE ?? DEFAULT_GLOBAL_DATABASE).trim();
  const schemaVersion = String(args["schema-version"] ?? process.env.BITCRAFT_SPACETIME_SCHEMA_VERSION ?? DEFAULT_SCHEMA_VERSION);
  const transport = String(args.transport ?? process.env.BITCRAFT_SPACETIME_TRANSPORT ?? (process.platform === "win32" ? "powershell" : "node")).trim();

  if (args.command === "request-code") {
    const email = String(args.email ?? "").trim();
    if (!email) throw new Error("request-code requires --email");
    await fetchText(`${authOrigin}/authentication/request-access-code?email=${encodeURIComponent(email)}`, { method: "POST" });
    process.stdout.write(`Access code requested for ${email}. Check your email.\n`);
    return;
  }

  if (args.command === "exchange-code") {
    const email = String(args.email ?? "").trim();
    const code = String(args.code ?? "").trim();
    if (!email || !code) throw new Error("exchange-code requires --email and --code");
    const body = await fetchJsonOrText(`${authOrigin}/authentication/authenticate?email=${encodeURIComponent(email)}&accessCode=${encodeURIComponent(code)}`, { method: "POST" });
    const token = extractTokenFromAuthenticateResponse(body);
    if (!token) throw new Error("Authentication succeeded but no JWT token was found in the response.");
    await saveToken(token, { email, savedAt: new Date().toISOString(), authOrigin });
    process.stdout.write(`Saved local JWT to ${path.relative(repoRoot, tokenFile)} (${redactToken(token)}).\n`);
    return;
  }

  const tokenInfo = await getStoredToken();
  if (!tokenInfo.token) {
    throw new Error("No token found. Run exchange-code first, or set BITCRAFT_PLAYER_TOKEN for this terminal.");
  }

  if (args.command === "schema") {
    const outDir = path.join(outputRoot, timestampSlug(), database);
    const schema = await getSchema({ host, database, schemaVersion });
    await writeJson(path.join(outDir, "schema.json"), schema);
    await writeJson(path.join(outDir, "tables.json"), schemaTableNames(schema));
    process.stdout.write(`Saved schema for ${database} to ${outDir}\n`);
    return;
  }

  if (args.command === "query") {
    const sql = String(args.sql ?? "").trim();
    if (!sql) throw new Error("query requires --sql");
    if (database !== DEFAULT_GLOBAL_DATABASE && !args["confirm-session-risk"]) {
      throw new Error("Regional queries can sign this account out of the live game. Re-run with --confirm-session-risk if you understand that risk.");
    }
    const outDir = path.join(outputRoot, timestampSlug(), database);
    const result = await runSelectedOneOffQuery({ transport, host, database, tokenInfo, sql });
    await writeJson(path.join(outDir, "query.json"), { database, sql });
    await writeJson(path.join(outDir, "result.json"), result);
    process.stdout.write(`Saved query result for ${database} to ${outDir}\n`);
    return;
  }

  if (args.command === "scan") {
    if (database !== DEFAULT_GLOBAL_DATABASE && !args["confirm-session-risk"]) {
      throw new Error("Regional scans can sign this account out of the live game. Re-run with --confirm-session-risk if you understand that risk.");
    }
    const schema = await getSchema({ host, database, schemaVersion });
    const include = splitCsv(args.include);
    const exclude = splitCsv(args.exclude);
    const allTables = Boolean(args["all-tables"]);
    const tableNames = allTables ? pickTables(schemaTableNames(schema), { exclude }) : pickTables(schemaTableNames(schema), { include: include.length ? include : ["claim", "craft", "recipe", "tech", "market", "auction", "inventory", "building", "player", "region"], exclude });
    const outDir = path.join(outputRoot, timestampSlug(), database);
    await writeJson(path.join(outDir, "schema.json"), schema);
    await writeJson(path.join(outDir, "tables-selected.json"), tableNames);
    const summary = [];
    for (const tableName of tableNames) {
      const startedAt = Date.now();
      process.stdout.write(`Querying ${tableName}...\n`);
      try {
        const result = await runSelectedOneOffQuery({
          transport,
          host,
          database,
          tokenInfo,
          sql: `SELECT * FROM ${safeSqlIdentifier(tableName)}`,
          timeoutMs: Number.parseInt(String(args.timeout ?? "120000"), 10) || 120000,
        });
        const rows = result[tableName] ?? [];
        await writeJson(path.join(outDir, "tables", `${tableName}.json`), rows);
        summary.push({ tableName, status: "ok", rows: rows.length, durationMs: Date.now() - startedAt });
      } catch (error) {
        summary.push({ tableName, status: "failed", error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt });
      }
      await writeJson(path.join(outDir, "summary.json"), {
        createdAt: new Date().toISOString(),
        host,
        database,
        transport,
        tokenSource: tokenInfo.source,
        token: redactToken(tokenInfo.token),
        tables: summary,
      });
    }
    process.stdout.write(`Scan complete for ${database}. Output: ${outDir}\n`);
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
