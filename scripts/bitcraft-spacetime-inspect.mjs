#!/usr/bin/env node

/**
 * Local-only BitCraft SpacetimeDB inspection helper.
 *
 * This script intentionally stays outside the app runtime. It reads a player
 * token from the local shell environment, calls SpacetimeDB HTTP schema/SQL
 * endpoints, and writes raw inspection output to ignored `.dev-data/` files.
 * It is designed for one-off investigation of live public game tables without
 * storing credentials in the repo, browser storage, SQLite, or admin settings.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputRoot = path.join(repoRoot, ".dev-data", "spacetime-inspect");

const TARGET_TABLE_HINTS = [
  "claim_state",
  "claim_local_state",
  "claim_member_state",
  "claim_tech_state",
  "claim_tech_desc",
  "crafting_recipe_desc",
  "construction_recipe_desc",
  "inventory_state",
  "auction_listing_state",
  "closed_listing_state",
];

function usage() {
  return `Usage:
  node scripts/bitcraft-spacetime-inspect.mjs schema [options]
  node scripts/bitcraft-spacetime-inspect.mjs tables [options]
  node scripts/bitcraft-spacetime-inspect.mjs sample --match claim --limit 5 [options]
  node scripts/bitcraft-spacetime-inspect.mjs query --sql "SELECT * FROM claim_local_state LIMIT 5" [options]
  node scripts/bitcraft-spacetime-inspect.mjs treasury [options]

Required connection values:
  --host <url>          SpacetimeDB host, or BITCRAFT_SPACETIME_HOST
  --database <name>     Database name/identity, or BITCRAFT_SPACETIME_DATABASE
  token                 BITCRAFT_PLAYER_TOKEN or SPACETIMEDB_TOKEN environment variable

Optional:
  --env-file <path>     Load KEY=VALUE lines from a local env file
  --out <dir>           Output directory root. Default: .dev-data/spacetime-inspect
  --schema-version <n>  RawModuleDef schema version. Default: 9
  --match <text>        Table name substring for sample mode
  --limit <n>           Row limit for sample mode. Default: 5
  --sql <query>         SQL text for query mode

Security:
  The token is never printed and is not written to output files.
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

async function loadEnvFile(filePath) {
  if (!filePath) return;
  const absolutePath = path.resolve(repoRoot, filePath);
  const content = await readFile(absolutePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function normalizeHost(host) {
  const value = String(host ?? "").trim();
  if (!value) return "";
  const httpValue = value.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
  return httpValue.replace(/\/+$/, "");
}

function sqlIdentifier(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function getTableName(table) {
  if (typeof table?.name === "string") return table.name;
  if (typeof table?.name?.name === "string") return table.name.name;
  if (typeof table?.name?.some === "string") return table.name.some;
  return "";
}

function findTables(schema, matcher) {
  const needle = String(matcher ?? "").trim().toLowerCase();
  return (schema.tables ?? [])
    .map(getTableName)
    .filter(Boolean)
    .filter((name) => !needle || name.toLowerCase().includes(needle));
}

function redactedConnectionInfo({ host, database, token }) {
  return {
    host,
    database,
    tokenPresent: Boolean(token),
    tokenLength: token ? String(token).length : 0,
  };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

class SpacetimeHttpClient {
  constructor({ host, database, token, schemaVersion }) {
    this.host = host;
    this.database = database;
    this.token = token;
    this.schemaVersion = schemaVersion;
  }

  async request(pathname, options = {}) {
    const response = await fetch(`${this.host}${pathname}`, {
      ...options,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(options.body ? { "content-type": "text/plain;charset=utf-8" } : {}),
        ...(options.headers ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`SpacetimeDB HTTP ${response.status} for ${pathname}: ${text.slice(0, 500)}`);
    }
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  getSchema() {
    return this.request(`/v1/database/${encodeURIComponent(this.database)}/schema?version=${encodeURIComponent(this.schemaVersion)}`);
  }

  runSql(sql) {
    return this.request(`/v1/database/${encodeURIComponent(this.database)}/sql`, {
      method: "POST",
      body: sql,
    });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.command === "help" || args.help) {
    process.stdout.write(usage());
    return;
  }

  await loadEnvFile(args["env-file"]);

  const host = normalizeHost(args.host ?? process.env.BITCRAFT_SPACETIME_HOST);
  const database = String(args.database ?? process.env.BITCRAFT_SPACETIME_DATABASE ?? "").trim();
  const token = String(process.env.BITCRAFT_PLAYER_TOKEN ?? process.env.SPACETIMEDB_TOKEN ?? "").trim();
  const schemaVersion = String(args["schema-version"] ?? process.env.BITCRAFT_SPACETIME_SCHEMA_VERSION ?? "9").trim();
  const outputRoot = path.resolve(repoRoot, String(args.out ?? defaultOutputRoot));
  const outputDir = path.join(outputRoot, timestampSlug());

  if (!host || !database || !token) {
    process.stderr.write(`${usage()}\nMissing required host, database, or token.\n`);
    process.exitCode = 2;
    return;
  }

  const client = new SpacetimeHttpClient({ host, database, token, schemaVersion });
  await mkdir(outputDir, { recursive: true });

  const summary = {
    createdAt: new Date().toISOString(),
    command: args.command,
    connection: redactedConnectionInfo({ host, database, token }),
    files: [],
  };

  const save = async (name, value) => {
    const filePath = path.join(outputDir, name);
    await writeJson(filePath, value);
    summary.files.push(name);
  };

  if (args.command === "schema" || args.command === "tables") {
    const schema = await client.getSchema();
    await save("schema.json", schema);
    const tables = findTables(schema).sort((a, b) => a.localeCompare(b));
    await save("tables.json", tables);
    process.stdout.write(`Found ${tables.length} tables. Output: ${outputDir}\n`);
  } else if (args.command === "sample") {
    const schema = await client.getSchema();
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(args.limit ?? "5"), 10) || 5));
    const tables = findTables(schema, args.match).sort((a, b) => a.localeCompare(b));
    await save("tables-matched.json", tables);
    const samples = {};
    for (const table of tables) {
      samples[table] = await client.runSql(`SELECT * FROM ${sqlIdentifier(table)} LIMIT ${limit}`);
    }
    await save("samples.json", samples);
    process.stdout.write(`Sampled ${tables.length} tables. Output: ${outputDir}\n`);
  } else if (args.command === "query") {
    const sql = String(args.sql ?? "").trim();
    if (!sql) throw new Error("query mode requires --sql");
    await save("query.json", { sql });
    await save("result.json", await client.runSql(sql));
    process.stdout.write(`Query complete. Output: ${outputDir}\n`);
  } else if (args.command === "treasury") {
    const schema = await client.getSchema();
    const tableNames = findTables(schema);
    const wantedTables = tableNames.filter((name) => {
      const lower = name.toLowerCase();
      return TARGET_TABLE_HINTS.some((hint) => lower === hint || lower.includes(hint));
    }).sort((a, b) => a.localeCompare(b));
    await save("treasury-related-tables.json", wantedTables);
    const samples = {};
    for (const table of wantedTables) {
      samples[table] = await client.runSql(`SELECT * FROM ${sqlIdentifier(table)} LIMIT 10`);
    }
    await save("treasury-related-samples.json", samples);
    process.stdout.write(`Collected ${wantedTables.length} treasury/static-data related samples. Output: ${outputDir}\n`);
  } else {
    process.stderr.write(`${usage()}\nUnknown command: ${args.command}\n`);
    process.exitCode = 2;
    return;
  }

  await writeFile(
    path.join(outputDir, "summary.md"),
    [
      "# BitCraft SpacetimeDB Inspection Summary",
      "",
      `Created: ${summary.createdAt}`,
      `Command: ${summary.command}`,
      `Host: ${summary.connection.host}`,
      `Database: ${summary.connection.database}`,
      `Token present: ${summary.connection.tokenPresent ? "yes" : "no"} (${summary.connection.tokenLength} chars, not stored)`,
      "",
      "Files:",
      ...summary.files.map((file) => `- ${file}`),
      "",
    ].join("\n"),
    "utf8",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
