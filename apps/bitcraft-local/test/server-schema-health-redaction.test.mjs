import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createTimbersteelFetch } from "./support/timbersteelFetch.mjs";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { fetch, registerOrigin } = createTimbersteelFetch();

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(origin, child) {
  registerOrigin(origin);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/local/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for server health");
}

async function stop(child) {
  if (child.exitCode != null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3_000);
  });
}

function createTestAdminSession(dbPath) {
  const token = createHash("sha256").update(`owner:${Date.now()}:${Math.random()}`).digest("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const db = new DatabaseSync(dbPath, { timeout: 5_000 });
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO admin_users (username, password_hash, role, active, created_at)
    VALUES ('admin', 'discord-oauth-admin', 'owner', 1, ?)
  `).run(now);
  db.prepare(`
    INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, result.lastInsertRowid, new Date(Date.now() + 60 * 60 * 1000).toISOString(), now);
  db.close();
  return `bitcraft_admin_session=${token}`;
}

test("public and Admin health redact persisted schema errors from every diagnostic path", async (t) => {
  const appPort = await availablePort();
  const dataDir = path.join(appDir, `.test-schema-health-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dataDir, { recursive: true });
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      BITCRAFT_TEST: "true",
      LEGAL_CONFIGURATION_CONFIRMED: "true",
      ENABLE_LEGACY_ADMIN_PASSWORD_AUTH: "true",
      ENABLE_SERVER_POLLING: "false",
      ENABLE_SCHEDULED_JOBS: "false",
      ENABLE_RELAY_PROVIDER: "false",
      ENABLE_RELAY_GLOBAL_CATALOG: "false",
      BITCRAFT_PROCESS_ROLE: "all",
      ADMIN_SETUP_KEY: "schema-health-setup-key",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
    },
    stdio: "ignore",
  });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);
  const cookie = createTestAdminSession(path.join(dataDir, "bitcraft-local.sqlite"));
  const db = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"), { timeout: 5_000 });
  const recordedAt = "2026-08-22T10:10:00.000Z";
  db.prepare(`
    INSERT OR REPLACE INTO provider_source_health (
      provider, source_key, ready, database_name, schema_fingerprint,
      last_observed_at, last_error, details_json, updated_at
    ) VALUES ('relay', 'relay-cache', 1, NULL, NULL, ?, NULL, ?, ?)
  `).run(recordedAt, JSON.stringify({
    running: false,
    topologyReady: true,
    cacheReady: true,
    generation: 1,
    lastRefreshAt: recordedAt,
  }), recordedAt);
  const writeDiagnostic = (diagnostic) => db.prepare(`
    INSERT OR REPLACE INTO provider_source_health (
      provider, source_key, ready, database_name, schema_fingerprint,
      last_observed_at, last_error, details_json, updated_at
    ) VALUES ('relay', 'global', 1, 'bitcraft-live-global', ?, ?, ?, ?, ?)
  `).run(
    diagnostic.observed,
    diagnostic.attemptedAt,
    diagnostic.error,
    JSON.stringify({ schemaFingerprintDiagnostic: diagnostic }),
    diagnostic.attemptedAt,
  );

  const cases = [
    {
      diagnostic: {
        sourceKey: "global",
        schemaUrl: "https://relay-user:relay-password@relay.example:3000/v1/database/bitcraft-live-global/schema?version=9",
        expected: "expected-global",
        observed: null,
        attemptedAt: recordedAt,
        status: "download_error",
        error: "request failed with bearer secret-schema-body",
      },
      expectedError: "Relay schema https://relay.example:3000/v1/database/bitcraft-live-global/schema?version=9 request failed",
    },
    {
      diagnostic: {
        sourceKey: "global",
        schemaUrl: "https://relay-user:relay-password@relay.example:3000/v1/database/bitcraft-live-global/schema?version=9",
        expected: "expected-global",
        observed: "observed-global",
        attemptedAt: recordedAt,
        status: "mismatch",
        error: "Relay global schema fingerprint mismatch: relay-password",
      },
      expectedError: "Relay global schema fingerprint mismatch",
    },
  ];

  for (const { diagnostic, expectedError } of cases) {
    writeDiagnostic(diagnostic);
    const publicHealth = await fetch(`${origin}/api/local/health`).then((response) => response.json());
    const adminHealth = await fetch(`${origin}/api/local/admin/status`, {
      headers: { cookie, origin },
    }).then((response) => response.json());
    assert.doesNotMatch(JSON.stringify(publicHealth), /relay-user|relay-password|secret-schema-body/);
    assert.doesNotMatch(JSON.stringify(adminHealth), /relay-user|relay-password|secret-schema-body/);
    assert.equal(
      adminHealth.gameDataProvider.sources.global.schemaFingerprintDiagnostic.schemaUrl,
      "https://relay.example:3000/v1/database/bitcraft-live-global/schema?version=9",
    );
    assert.equal(adminHealth.gameDataProvider.globalCatalog.schemaHealth.error, expectedError);
  }
  db.close();
});
