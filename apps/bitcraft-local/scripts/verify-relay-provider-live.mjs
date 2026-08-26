import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { queryRowsWhenReady } from "../src/server/liveVerifierSqlite.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(path.join(tmpdir(), "bitcraft-relay-live-"));
const databasePath = path.join(dataDir, "bitcraft-local.sqlite");
const privacyLedgerKeyPath = path.join(dataDir, "privacy-ledger.key");
const deadline = Date.now() + 30_000;
const expectedDomains = [
  "claim",
  "members",
  "citizens",
  "players",
  "equipment",
  "skills",
  "inventories",
  "crafts",
  "deposits",
];
let child;

await writeFile(privacyLedgerKeyPath, "isolated-live-verification-key\n", { mode: 0o600 });

function currentRows() {
  return queryRowsWhenReady({
    databaseExists: () => existsSync(databasePath),
    openDatabase: () => new DatabaseSync(databasePath, { readOnly: true, timeout: 1_000 }),
    sql: `
      SELECT domain, provider, source_key, region_id, freshness, confidence,
             generation, received_at, last_error
      FROM domain_payload_current
      WHERE claim_id = ?
      ORDER BY domain
    `,
    parameters: ["1369094286777412590"],
  });
}

function currentHealthRows() {
  return queryRowsWhenReady({
    databaseExists: () => existsSync(databasePath),
    openDatabase: () => new DatabaseSync(databasePath, { readOnly: true, timeout: 1_000 }),
    sql: `
      SELECT source_key, ready, database_name, schema_fingerprint,
             last_observed_at, last_error, updated_at
      FROM provider_source_health
      WHERE provider = 'relay'
      ORDER BY source_key
    `,
  });
}

try {
  child = spawn(process.execPath, ["worker.mjs"], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      LEGAL_CONFIGURATION_CONFIRMED: "true",
      BITCRAFT_PROCESS_ROLE: "worker",
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      BITCRAFT_RELAY_ORIGIN: process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
      PRIVACY_LEDGER_KEY_FILE: privacyLedgerKeyPath,
      PRIVACY_LEDGER_PATH: path.join(dataDir, "privacy-deletion-ledger.jsonl"),
      ENABLE_RELAY_PROVIDER: "true",
      ENABLE_SERVER_POLLING: "false",
      ENABLE_SCHEDULED_JOBS: "false",
      ENABLE_DISCORD_STARTUP: "false",
      DISCORD_DELIVERY_MODE: "record",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  let rows = [];
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    rows = currentRows();
    if (expectedDomains.every((domain) => rows.some((row) => row.domain === domain))) break;
    if (child.exitCode != null) throw new Error(`Relay worker exited with code ${child.exitCode}`);
  }
  if (!expectedDomains.every((domain) => rows.some((row) => row.domain === domain))) {
    throw new Error(
      `Relay domain generation did not load within 30 seconds: ${JSON.stringify({
        observedDomains: rows.map((row) => row.domain),
        health: currentHealthRows(),
      })}`,
    );
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    rows,
    health: currentHealthRows(),
  }, null, 2)}\n`);
} finally {
  if (child?.exitCode == null) {
    child.kill();
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 5_000);
    });
  }
  await rm(dataDir, { recursive: true, force: true });
}
