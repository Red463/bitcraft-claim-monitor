import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}: ${child.serverError ?? ""}`);
    try {
      if ((await fetch(`${origin}/api/local/health`)).ok) return;
    } catch {
      // The server is still starting.
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

function sessionFor(userId) {
  const token = randomBytes(32).toString("base64url");
  return {
    cookie: `bitcraft_admin_session=${token}`,
    csrfToken: createHash("sha256").update(`csrf:${token}`).digest("base64url"),
    tokenHash: createHash("sha256").update(token).digest("hex"),
    userId,
  };
}

function seedAdminSession(dbPath, { id, username, role }) {
  const session = sessionFor(id);
  const db = new DatabaseSync(dbPath, { timeout: 5_000 });
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO admin_users (id, username, password_hash, role, active, created_at)
    VALUES (?, ?, 'discord-oauth-admin', ?, 1, ?)
  `).run(id, username, role, now);
  db.prepare(`
    INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(session.tokenHash, id, new Date(Date.now() + 60 * 60 * 1000).toISOString(), now);
  db.close();
  return session;
}

async function startTestServer(t, environment = {}) {
  const appPort = await availablePort();
  const dataDir = path.join(appDir, `.test-security-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dataDir, { recursive: true });
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      BITCRAFT_TEST: "true",
      LEGAL_CONFIGURATION_CONFIRMED: "true",
      ENABLE_SERVER_POLLING: "false",
      ENABLE_SCHEDULED_JOBS: "false",
      ENABLE_RELAY_PROVIDER: "false",
      ENABLE_RELAY_GLOBAL_CATALOG: "false",
      BITCRAFT_PROCESS_ROLE: "all",
      APP_HOST: "127.0.0.1",
      APP_PORT: String(appPort),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      ...environment,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.serverError = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { child.serverError += chunk; });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);
  return { origin, dbPath: path.join(dataDir, "bitcraft-local.sqlite") };
}

function adminHeaders(session, origin) {
  return {
    cookie: session.cookie,
    origin,
    "content-type": "application/json",
    "x-csrf-token": session.csrfToken,
  };
}

test("non-owners cannot grant or revoke owner access, and the final active owner remains enabled", async (t) => {
  const { origin, dbPath } = await startTestServer(t);
  const finalOwner = seedAdminSession(dbPath, { id: 1, username: "owner", role: "owner" });
  const administrator = seedAdminSession(dbPath, { id: 2, username: "administrator", role: "admin" });
  const candidate = seedAdminSession(dbPath, { id: 3, username: "candidate", role: "viewer" });

  const promotion = await fetch(`${origin}/api/local/admin/user/role`, {
    method: "PUT",
    headers: adminHeaders(administrator, origin),
    body: JSON.stringify({ userId: candidate.userId, role: "owner" }),
  });
  assert.equal(promotion.status, 403);

  const nonOwnerDemotion = await fetch(`${origin}/api/local/admin/user/role`, {
    method: "PUT",
    headers: adminHeaders(administrator, origin),
    body: JSON.stringify({ userId: finalOwner.userId, role: "viewer" }),
  });
  assert.equal(nonOwnerDemotion.status, 403);

  const demotion = await fetch(`${origin}/api/local/admin/user/role`, {
    method: "PUT",
    headers: adminHeaders(finalOwner, origin),
    body: JSON.stringify({ userId: finalOwner.userId, role: "admin" }),
  });
  assert.equal(demotion.status, 409);

  const disable = await fetch(`${origin}/api/local/admin/user/status`, {
    method: "PUT",
    headers: adminHeaders(finalOwner, origin),
    body: JSON.stringify({ userId: finalOwner.userId, active: false }),
  });
  assert.equal(disable.status, 409);
});

test("owner role changes revoke affected sessions and leave an audit record", async (t) => {
  const { origin, dbPath } = await startTestServer(t);
  const owner = seedAdminSession(dbPath, { id: 1, username: "owner", role: "owner" });
  const coOwner = seedAdminSession(dbPath, { id: 2, username: "co-owner", role: "owner" });

  const response = await fetch(`${origin}/api/local/admin/user/role`, {
    method: "PUT",
    headers: adminHeaders(owner, origin),
    body: JSON.stringify({ userId: coOwner.userId, role: "admin" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await fetch(`${origin}/api/local/admin/status`, { headers: { cookie: coOwner.cookie, origin } })).status, 401);

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const audit = db.prepare("SELECT action, details_json FROM admin_audit_log ORDER BY id DESC LIMIT 1").get();
  db.close();
  assert.equal(audit.action, "user.role");
  assert.deepEqual(JSON.parse(audit.details_json), {
    id: 2,
    username: "co-owner",
    previousRole: "owner",
    role: "admin",
  });
});

test("Discord commands from another guild are rejected before dispatch", async (t) => {
  const { origin, dbPath } = await startTestServer(t);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  const db = new DatabaseSync(dbPath, { timeout: 5_000 });
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('discord_json', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify({ enabled: true, publicKey: publicKeyHex, guildId: "timbersteel-guild" }), new Date().toISOString());
  db.close();

  const interaction = { type: 2, guild_id: "other-guild", data: { name: "help" } };
  const body = JSON.stringify(interaction);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]), privateKey).toString("hex");
  const response = await fetch(`${origin}/api/discord/interactions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    body,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    type: 4,
    data: {
      flags: 64,
      allowed_mentions: { parse: [] },
      content: "This interaction is only available in the configured Timbersteel Discord server.",
    },
  });
});

test("password setup cannot create an Admin session outside Timbersteel OAuth", async (t) => {
  const { origin } = await startTestServer(t, {
    ENABLE_LEGACY_ADMIN_PASSWORD_AUTH: "true",
    ADMIN_SETUP_KEY: "test-setup-key",
  });
  const response = await fetch(`${origin}/api/local/admin/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      username: "admin",
      password: "correct horse battery",
      setupKey: "test-setup-key",
    }),
  });

  assert.equal(response.status, 410);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(await response.json(), {
    error: "Administrator sign-in now uses Discord. Sign in with an approved Discord admin account.",
  });
});
