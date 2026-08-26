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
const sandboxChannelId = "666666666666666666";
const { fetch, registerOrigin } = createTimbersteelFetch();

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

async function availablePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(origin, child) {
  registerOrigin(origin);
  const deadline = Date.now() + 10000;
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

async function waitForCondition(description, check) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function stop(child) {
  if (child.exitCode != null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}

function createTestAdminSession(dbPath, { username, role }) {
  const token = createHash("sha256").update(`${username}:${role}:${Date.now()}:${Math.random()}`).digest("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const csrfToken = createHash("sha256").update(`csrf:${token}`).digest("base64url");
  const db = new DatabaseSync(dbPath, { timeout: 5_000 });
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO admin_users (username, password_hash, role, active, created_at)
    VALUES (?, 'discord-oauth-admin', ?, 1, ?)
  `).run(username, role, now);
  db.prepare(`
    INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, result.lastInsertRowid, new Date(Date.now() + 60 * 60 * 1000).toISOString(), now);
  db.close();
  return { cookie: `bitcraft_admin_session=${token}`, csrfToken };
}

test("record-mode Admin manual tests post only to the local fake sandbox channel", async (t) => {
  const discordRequests = [];
  let discordFailureStatus = 0;
  const fakeDiscord = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    discordRequests.push({ method: req.method, path: req.url, payload });
    if (discordFailureStatus) {
      res.writeHead(discordFailureStatus, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "simulated sandbox failure" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: `sandbox-${discordRequests.length}`, channel_id: sandboxChannelId }));
  });
  const discordPort = await listen(fakeDiscord);
  t.after(() => new Promise((resolve) => fakeDiscord.close(resolve)));

  const appPort = await availablePort();
  const dataDir = path.join(appDir, `.test-discord-sandbox-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dataDir, { recursive: true });
  const childEnv = {
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
    DISCORD_NOTIFICATION_OUTBOX_INTERVAL_MS: "1000",
    DISCORD_REQUEST_TIMEOUT_MS: "10000",
    DISCORD_OUTBOX_COMPLETION_MARGIN_MS: "5000",
    DISCORD_NOTIFICATION_LEASE_MS: "1000",
    ADMIN_SETUP_KEY: "sandbox-setup-key",
    APP_HOST: "127.0.0.1",
    BITCRAFT_LOCAL_DATA_DIR: dataDir,
    DISCORD_API_ORIGIN: `http://127.0.0.1:${discordPort}`,
    DISCORD_BOT_TOKEN: "sandbox-test-token",
    DISCORD_DELIVERY_MODE: "record",
    DISCORD_SANDBOX_CHANNEL_ID: sandboxChannelId,
  };
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: appDir,
    env: { ...childEnv, APP_PORT: String(appPort) },
    stdio: "ignore",
  });
  const children = [child];
  t.after(async () => {
    for (const runningChild of children) await stop(runningChild);
    await rm(dataDir, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${appPort}`;
  await waitForHealth(origin, child);
  const auth = createTestAdminSession(path.join(dataDir, "bitcraft-local.sqlite"), { username: "admin", role: "owner" });
  const cookie = auth.cookie;
  const adminHeaders = {
    cookie,
    origin,
    "content-type": "application/json",
    "x-csrf-token": auth.csrfToken,
  };

  const dbPath = path.join(dataDir, "bitcraft-local.sqlite");
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('discord_json', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify({
    enabled: true,
    applicationId: "1511277824525471826",
    publicKey: "a".repeat(64),
    channelId: "555555555555555555",
  }), new Date().toISOString());
  db.close();

  const secondAppPort = await availablePort();
  const secondChild = spawn(process.execPath, ["server.mjs"], {
    cwd: appDir,
    env: { ...childEnv, APP_PORT: String(secondAppPort) },
    stdio: "ignore",
  });
  children.push(secondChild);
  await waitForHealth(`http://127.0.0.1:${secondAppPort}`, secondChild);

  const anonymous = await fetch(`${origin}/api/local/admin/discord/test`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ kind: "basic" }),
  });
  assert.equal(anonymous.status, 401);
  assert.equal(discordRequests.length, 0);

  const mismatch = await fetch(`${origin}/api/local/admin/discord/test`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ kind: "basic", channelId: "555555555555555555" }),
  });
  assert.equal(mismatch.status, 400);
  assert.equal(discordRequests.length, 0);

  for (const body of [{ kind: "basic" }, { kind: "sale" }]) {
    const response = await fetch(`${origin}/api/local/admin/discord/test`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
  }
  const craftPlan = await fetch(`${origin}/api/local/admin/discord/craft-plan-report/test`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ reportType: "overview" }),
  });
  assert.equal(craftPlan.status, 200);

  assert.equal(discordRequests.length, 3);
  for (const request of discordRequests) {
    assert.equal(request.method, "POST");
    assert.equal(request.path, `/channels/${sandboxChannelId}/messages`);
    assert.deepEqual(request.payload.allowed_mentions, { parse: [] });
  }

  discordFailureStatus = 503;
  const failedCraftPlan = await fetch(`${origin}/api/local/admin/discord/craft-plan-report/test`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ reportType: "overview" }),
  });
  assert.notEqual(failedCraftPlan.status, 200);
  discordFailureStatus = 0;

  const beforeAutomaticPath = discordRequests.length;
  const announcement = await fetch(`${origin}/api/local/admin/discord/announcement`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ channelId: sandboxChannelId, message: "must stay recorded" }),
  });
  assert.equal(announcement.status, 200);
  assert.equal((await announcement.json()).response.recorded, true);
  assert.equal(discordRequests.length, beforeAutomaticPath);

  const automaticOutboxRequests = discordRequests.length;
  const outboxDb = new DatabaseSync(dbPath, { timeout: 5000 });
  const queuedAt = new Date().toISOString();
  outboxDb.prepare(`
    INSERT INTO discord_notification_outbox (
      source_key, event_type, summary, occurred_at, metadata_json, status,
      attempts, next_attempt_at, created_at, updated_at
    ) VALUES (?, 'app_update', 'Automatic preview outbox test', ?, '{}', 'pending', 0, ?, ?, ?)
  `).run("task5:automatic-preview-outbox", queuedAt, queuedAt, queuedAt, queuedAt);
  outboxDb.close();
  const processedOutbox = await waitForCondition("recorded automatic Discord outbox delivery", () => {
    const checkDb = new DatabaseSync(dbPath, { readOnly: true });
    const row = checkDb.prepare(`
      SELECT status, attempts, response_json, locked_at, locked_by,
             lease_token, lease_expires_at
      FROM discord_notification_outbox
      WHERE source_key = 'task5:automatic-preview-outbox'
    `).get();
    checkDb.close();
    return row?.status === "sent" ? row : null;
  });
  assert.equal(JSON.parse(processedOutbox.response_json).response.recorded, true);
  assert.equal(processedOutbox.attempts, 1);
  assert.equal(processedOutbox.locked_at, null);
  assert.equal(processedOutbox.locked_by, null);
  assert.equal(processedOutbox.lease_token, null);
  assert.equal(processedOutbox.lease_expires_at, null);
  assert.equal(discordRequests.length, automaticOutboxRequests);

  const healthResponse = await fetch(`${origin}/api/local/admin/server-health`, {
    headers: { cookie },
  });
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.database.discord.deliveryGuarantee.semantics, "at-least-once");
  assert.equal(health.database.discord.deliveryGuarantee.requestTimeoutMs, 10_000);
  assert.equal(health.database.discord.deliveryGuarantee.completionWriteMarginMs, 5_000);
  assert.ok(health.database.discord.deliveryGuarantee.leaseMs > 15_000);
  assert.equal(health.database.discord.deliveryGuarantee.potentialDuplicateRows, 0);

  const auditDb = new DatabaseSync(dbPath, { readOnly: true });
  const rows = auditDb.prepare(`
    SELECT status, channel_id, channel_key, metadata_json
    FROM discord_delivery_log
    WHERE channel_key = 'manualSandbox' AND status = 'sent'
    ORDER BY id
  `).all();
  assert.equal(rows.length, 3);
  assert.equal(rows.every((row) => row.status === "sent"), true);
  assert.equal(rows.every((row) => row.channel_id === sandboxChannelId), true);
  assert.equal(rows.every((row) => JSON.parse(row.metadata_json).manualSandboxTest === true), true);
  assert.equal(rows.every((row) => JSON.parse(row.metadata_json).deliveryMode === "record"), true);
  const failedCraftPlanAudit = auditDb.prepare(`
    SELECT channel_id, metadata_json
    FROM discord_delivery_log
    WHERE event_type = 'craft_plan_report' AND status = 'failed'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  assert.equal(failedCraftPlanAudit.channel_id, sandboxChannelId);
  assert.equal(JSON.parse(failedCraftPlanAudit.metadata_json).manualSandboxTest, true);
  const recordedAnnouncement = auditDb.prepare(`
    SELECT status, channel_id, response_json
    FROM discord_delivery_log
    WHERE event_type = 'announcement'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  auditDb.close();
  assert.equal(recordedAnnouncement.status, "sent");
  assert.equal(recordedAnnouncement.channel_id, sandboxChannelId);
  assert.equal(JSON.parse(recordedAnnouncement.response_json).recorded, true);
});

test("maintenance hold blocks Discord network and leaves pre-start outbox rows untouched", async (t) => {
  const discordRequests = [];
  const fakeDiscord = createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    discordRequests.push({ method: req.method, path: req.url });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "must-not-send", channel_id: sandboxChannelId }));
  });
  const discordPort = await listen(fakeDiscord);
  t.after(() => new Promise((resolve) => fakeDiscord.close(resolve)));

  const dataDir = path.join(appDir, `.test-discord-outbox-hold-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dataDir, { recursive: true });
  const children = [];
  t.after(async () => {
    for (const child of children) await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  async function startServer(role) {
    const appPort = await availablePort();
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
        ENABLE_DISCORD_OUTBOX_PROCESSING: "false",
        ENABLE_DISCORD_NETWORK: "false",
        BITCRAFT_DEPLOYMENT_MODE: "preview",
        BITCRAFT_PROCESS_ROLE: role,
        DISCORD_NOTIFICATION_OUTBOX_INTERVAL_MS: "1000",
        ADMIN_SETUP_KEY: "maintenance-setup-key",
        APP_HOST: "127.0.0.1",
        APP_PORT: String(appPort),
        BITCRAFT_LOCAL_DATA_DIR: dataDir,
        DISCORD_API_ORIGIN: `http://127.0.0.1:${discordPort}`,
        DISCORD_BOT_TOKEN: "must-not-send-token",
        DISCORD_DELIVERY_MODE: "record",
        DISCORD_SANDBOX_CHANNEL_ID: sandboxChannelId,
        ENABLE_DISCORD_STARTUP: "false",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    children.push(child);
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const origin = `http://127.0.0.1:${appPort}`;
    try {
      await waitForHealth(origin, child);
    } catch (error) {
      throw new Error(`${error.message}: ${stderr}`);
    }
    return { child, origin };
  }

  const bootstrap = await startServer("web");
  await stop(bootstrap.child);
  const dbPath = path.join(dataDir, "bitcraft-local.sqlite");
  const queuedAt = new Date().toISOString();
  const seedDb = new DatabaseSync(dbPath, { timeout: 5000 });
  seedDb.prepare(`
    INSERT INTO discord_notification_outbox (
      source_key, event_type, summary, occurred_at, metadata_json, status,
      attempts, next_attempt_at, created_at, updated_at
    ) VALUES (?, 'app_update', 'Held repair outbox test', ?, '{}', 'pending', 0, ?, ?, ?)
  `).run("repair:held-outbox", queuedAt, queuedAt, queuedAt, queuedAt);
  seedDb.prepare(`
    INSERT INTO discord_notification_outbox (
      source_key, event_type, summary, occurred_at, metadata_json, status,
      attempts, next_attempt_at, locked_at, created_at, updated_at
    ) VALUES (?, 'canonical_cutover', 'Interrupted canonical delivery', ?, '{}', 'sending', 1, ?, ?, ?, ?)
  `).run("repair:held-canonical", queuedAt, queuedAt, queuedAt, queuedAt, queuedAt);
  seedDb.close();

  const maintenance = await startServer("all");
  const auth = createTestAdminSession(dbPath, { username: "admin", role: "owner" });
  const cookie = auth.cookie;
  const settingsDb = new DatabaseSync(dbPath, { timeout: 5000 });
  settingsDb.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('discord_json', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify({
    enabled: true,
    applicationId: "1511277824525471826",
    publicKey: "a".repeat(64),
    channelId: sandboxChannelId,
  }), new Date().toISOString());
  settingsDb.close();
  const manual = await fetch(`${maintenance.origin}/api/local/admin/discord/test`, {
    method: "POST",
    headers: {
      cookie,
      origin: maintenance.origin,
      "content-type": "application/json",
      "x-csrf-token": auth.csrfToken,
    },
    body: JSON.stringify({ kind: "basic" }),
  });
  assert.notEqual(manual.status, 200);
  assert.equal(discordRequests.length, 0);
  const interaction = await fetch(`${maintenance.origin}/api/discord/interactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(interaction.status, 503);
  assert.match((await interaction.json()).error, /disabled during maintenance/i);

  await new Promise((resolve) => setTimeout(resolve, 1600));
  const checkDb = new DatabaseSync(dbPath, { readOnly: true });
  const held = checkDb.prepare(`
    SELECT source_key, status, attempts, response_json, last_error
    FROM discord_notification_outbox
    WHERE source_key IN ('repair:held-outbox', 'repair:held-canonical')
    ORDER BY source_key
  `).all().map((row) => ({ ...row }));
  checkDb.close();
  assert.deepEqual(held, [
    {
      source_key: "repair:held-canonical",
      status: "sending",
      attempts: 1,
      response_json: null,
      last_error: null,
    },
    {
      source_key: "repair:held-outbox",
      status: "pending",
      attempts: 0,
      response_json: null,
      last_error: null,
    },
  ]);
});
