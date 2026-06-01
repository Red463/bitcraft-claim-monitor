import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, createPublicKey, randomBytes, scrypt, timingSafeEqual, verify } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "dist");
const isProduction = process.env.NODE_ENV === "production";
const serveFrontend = isProduction || process.env.SERVE_STATIC === "true";
const adminSetupKey = process.env.ADMIN_SETUP_KEY ?? "";
const serverPollingEnabled = process.env.ENABLE_SERVER_POLLING !== "false";
const snapshotIntervalMs = Math.max(Number(process.env.SNAPSHOT_INTERVAL_MS ?? 30000), 10000);
const dataDir = process.env.BITCRAFT_LOCAL_DATA_DIR ?? path.join(root, "data");
const appVersion = "0.8.9-beta.1";
const appIdentifier = process.env.BITJITA_APP_IDENTIFIER ?? "BitCraft Claim Monitor (github.com/Red463/bitcraft-claim-monitor)";
const changelogUrl = "https://github.com/Red463/bitcraft-claim-monitor/blob/main/CHANGELOG.md";
const brandingDir = path.join(dataDir, "branding");
const backupDir = path.join(dataDir, "backups");
mkdirSync(dataDir, { recursive: true });
mkdirSync(brandingDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });

const databasePath = path.join(dataDir, "bitcraft-local.sqlite");
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    supplies REAL,
    treasury REAL,
    members_count INTEGER,
    buildings_count INTEGER,
    market_count INTEGER,
    raw_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS market_listings (
    listing_key TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    side TEXT,
    owner TEXT,
    quantity REAL,
    price REAL,
    total_value REAL,
    tier TEXT,
    rarity TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    status TEXT NOT NULL,
    sold_at TEXT,
    raw_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS market_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    listing_key TEXT NOT NULL,
    item_name TEXT NOT NULL,
    side TEXT,
    owner TEXT,
    quantity REAL,
    price REAL,
    total_value REAL,
    tier TEXT,
    rarity TEXT,
    occurred_at TEXT NOT NULL,
    raw_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS market_trades (
    trade_id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    order_entity_id TEXT,
    seller_entity_id TEXT,
    seller_username TEXT,
    purchaser_entity_id TEXT,
    purchaser_username TEXT,
    item_id TEXT,
    item_type TEXT,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    tier TEXT,
    rarity TEXT,
    occurred_at TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    raw_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES admin_users(id)
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS production_jobs (
    job_key TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    label TEXT NOT NULL,
    building_name TEXT,
    crafter_name TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    status TEXT NOT NULL,
    raw_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    successful INTEGER NOT NULL,
    occurred_at TEXT NOT NULL,
    remote_address TEXT
  );
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_key TEXT NOT NULL,
    session_key TEXT NOT NULL,
    event_name TEXT NOT NULL,
    page TEXT NOT NULL,
    properties_json TEXT NOT NULL,
    duration_seconds INTEGER,
    occurred_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS discord_delivery_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    channel_id TEXT,
    channel_key TEXT,
    reason TEXT,
    error TEXT,
    metadata_json TEXT NOT NULL,
    response_json TEXT,
    occurred_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_market_events_claim_time ON market_events (claim_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_market_trades_claim_time ON market_trades (claim_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_claim_time ON activity_events (claim_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_time ON analytics_events (occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_page_time ON analytics_events (page, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_production_claim_status ON production_jobs (claim_id, status, last_seen DESC);
  CREATE INDEX IF NOT EXISTS idx_discord_delivery_time ON discord_delivery_log (occurred_at DESC);
`);

function ensureColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("market_listings", "owner_entity_id", "TEXT");
ensureColumn("market_listings", "item_id", "TEXT");
ensureColumn("market_listings", "item_type", "TEXT");
ensureColumn("market_events", "owner_entity_id", "TEXT");
ensureColumn("market_events", "item_id", "TEXT");
ensureColumn("market_events", "item_type", "TEXT");
ensureColumn("market_events", "trade_id", "TEXT");
ensureColumn("activity_events", "source_key", "TEXT");
ensureColumn("admin_users", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("admin_users", "last_login_at", "TEXT");
ensureColumn("production_jobs", "start_notified", "INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_source ON activity_events (claim_id, event_type, source_key) WHERE source_key IS NOT NULL;");

const defaultClaimId = "1369094286777412590";
const defaultSyncUrl = "https://bitcraftsync.app/s/MUFJw3#claims=1369094286777412590&players=1369094286756659093%2C576460752388321942%2C864691128512324120&shopping=i.2036617800%3A20&p.exc=1369094286756659093%3A1369094286764705296%2C1369094286756792917%3B864691128512324120%3A1369094286778153104%2C1369094286772328807%2C1369094286761962469%3B576460752388321942%3A1369094286783870822&crafts=1&crafts.pf=includedPlayers";
const defaultTheme = {
  bg: "#0c0d10",
  sidebar: "#06070a",
  panel: "#181b21",
  panel2: "#11141a",
  border: "#353b46",
  muted: "#a8adba",
  text: "#f6f3ea",
  gold: "#f0c64f",
  good: "#4ee28a",
  danger: "#ef6461",
};
const now = new Date().toISOString();
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("claim_id", defaultClaimId, now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("bitcraft_sync_url", defaultSyncUrl, now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("theme_json", JSON.stringify(defaultTheme), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("refresh_seconds", "30", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("default_page", "overview", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("default_region", "", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("toast_json", JSON.stringify({ marketListings: true, marketSales: true, production: true }), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("branding_json", JSON.stringify({}), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("snapshot_retention_days", "365", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("discord_json", JSON.stringify({ enabled: false, applicationId: "", publicKey: "", guildId: "", channelId: "", minSaleValue: 0, supplyRunwayDaysThreshold: 7, productionMinXp: 40000, productionMinProgressPct: 1, productionUsers: "", craftChannels: { forestry: "1509932116077711411", carpentry: "1509932154442875201", masonry: "1509932188446101585", mining: "1509932207060291797", smithing: "1509932228090658936", scholar: "1509932259262595245", hunting: "1510275986766434325", leatherworking: "1509932280829710547", tailoring: "1509932306486398976", farming: "1509932539626786926", fishing: "1509932564641747074", cooking: "1509932588180181033", foraging: "1509932609378058412" }, notify: { marketListings: true, marketSales: true, production: true, productionStarted: true, productionCompleted: true, lowSupplies: false, appUpdates: true } }), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("discord_last_announced_version", "", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("discord_last_supply_report_at", "", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("discord_last_delivery_json", JSON.stringify({ status: "none" }), now);
db.prepare("DELETE FROM app_settings WHERE key = ?").run("analytics_json");

const statements = {
  latestSnapshot: db.prepare("SELECT * FROM snapshots WHERE claim_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1"),
  insertSnapshot: db.prepare(`
    INSERT INTO snapshots (claim_id, captured_at, supplies, treasury, members_count, buildings_count, market_count, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listingByKey: db.prepare("SELECT * FROM market_listings WHERE listing_key = ?"),
  activeListings: db.prepare("SELECT listing_key, item_name, quantity, price, total_value, owner, owner_entity_id, item_id, item_type, tier, rarity, side, first_seen, last_seen, raw_json FROM market_listings WHERE claim_id = ? AND status = 'active'"),
  upsertListing: db.prepare(`
    INSERT INTO market_listings (listing_key, claim_id, item_name, side, owner, owner_entity_id, item_id, item_type, quantity, price, total_value, tier, rarity, first_seen, last_seen, status, sold_at, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?)
    ON CONFLICT(listing_key) DO UPDATE SET
      item_name = excluded.item_name,
      side = excluded.side,
      owner = excluded.owner,
      owner_entity_id = excluded.owner_entity_id,
      item_id = excluded.item_id,
      item_type = excluded.item_type,
      quantity = excluded.quantity,
      price = excluded.price,
      total_value = excluded.total_value,
      tier = excluded.tier,
      rarity = excluded.rarity,
      last_seen = excluded.last_seen,
      status = 'active',
      sold_at = NULL,
      raw_json = excluded.raw_json
  `),
  markListingClosed: db.prepare("UPDATE market_listings SET status = ?, sold_at = ?, last_seen = ? WHERE listing_key = ? AND status = 'active'"),
  insertMarketEvent: db.prepare(`
    INSERT INTO market_events (claim_id, event_type, listing_key, item_name, side, owner, owner_entity_id, item_id, item_type, quantity, price, total_value, tier, rarity, occurred_at, trade_id, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  pendingMarketEvents: db.prepare(`
    SELECT * FROM market_events
    WHERE claim_id = ?
      AND event_type = 'partial_quantity_drop'
      AND trade_id IS NULL
    ORDER BY occurred_at DESC
    LIMIT 50
  `),
  confirmMarketEvent: db.prepare("UPDATE market_events SET event_type = ?, trade_id = ?, raw_json = ? WHERE id = ?"),
  resolveMarketEvent: db.prepare("UPDATE market_events SET event_type = ?, raw_json = ? WHERE id = ? AND claim_id = ?"),
  insertMarketTrade: db.prepare(`
    INSERT OR IGNORE INTO market_trades (
      trade_id, claim_id, order_entity_id, seller_entity_id, seller_username, purchaser_entity_id, purchaser_username,
      item_id, item_type, item_name, quantity, unit_price, total_price, tier, rarity, occurred_at, imported_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertActivity: db.prepare(`
    INSERT INTO activity_events (claim_id, event_type, summary, occurred_at, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `),
  insertSourcedActivity: db.prepare(`
    INSERT OR IGNORE INTO activity_events (claim_id, event_type, summary, occurred_at, metadata_json, source_key)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  activeProductionJobs: db.prepare("SELECT * FROM production_jobs WHERE claim_id = ? AND status = 'active'"),
  productionJobCount: db.prepare("SELECT COUNT(*) AS count FROM production_jobs WHERE claim_id = ?"),
  markProductionStartNotified: db.prepare("UPDATE production_jobs SET start_notified = 1 WHERE job_key = ?"),
  upsertProductionJob: db.prepare(`
    INSERT INTO production_jobs (job_key, claim_id, label, building_name, crafter_name, first_seen, last_seen, status, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    ON CONFLICT(job_key) DO UPDATE SET
      label = excluded.label,
      building_name = excluded.building_name,
      crafter_name = excluded.crafter_name,
      last_seen = excluded.last_seen,
      status = 'active',
      raw_json = excluded.raw_json
  `),
  completeProductionJob: db.prepare("UPDATE production_jobs SET status = 'completed', last_seen = ? WHERE job_key = ? AND status = 'active'"),
  getSetting: db.prepare("SELECT value FROM app_settings WHERE key = ?"),
  upsertSetting: db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `),
  getSecret: db.prepare("SELECT value FROM app_secrets WHERE key = ?"),
  upsertSecret: db.prepare(`
    INSERT INTO app_secrets (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `),
  deleteSecret: db.prepare("DELETE FROM app_secrets WHERE key = ?"),
  adminCount: db.prepare("SELECT COUNT(*) AS count FROM admin_users"),
  adminByUsername: db.prepare("SELECT * FROM admin_users WHERE username = ? AND active = 1"),
  adminBySession: db.prepare(`
    SELECT admin_users.id, admin_users.username
    FROM admin_sessions
    JOIN admin_users ON admin_users.id = admin_sessions.user_id
    WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > ? AND admin_users.active = 1
  `),
  insertAdmin: db.prepare("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)"),
  updatePassword: db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?"),
  updateAdminActive: db.prepare("UPDATE admin_users SET active = ? WHERE id = ?"),
  updateLastLogin: db.prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?"),
  insertSession: db.prepare("INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"),
  deleteSession: db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?"),
  deleteUserSessions: db.prepare("DELETE FROM admin_sessions WHERE user_id = ?"),
  deleteOtherSessions: db.prepare("DELETE FROM admin_sessions WHERE user_id = ? AND token_hash <> ?"),
  deleteExpiredSessions: db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?"),
  insertAudit: db.prepare("INSERT INTO admin_audit_log (user_id, username, action, details_json, occurred_at) VALUES (?, ?, ?, ?, ?)"),
  insertLoginEvent: db.prepare("INSERT INTO admin_login_events (username, successful, occurred_at, remote_address) VALUES (?, ?, ?, ?)"),
  insertAnalyticsEvent: db.prepare(`
    INSERT INTO analytics_events (visitor_key, session_key, event_name, page, properties_json, duration_seconds, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertDiscordDelivery: db.prepare(`
    INSERT INTO discord_delivery_log (event_type, status, summary, channel_id, channel_key, reason, error, metadata_json, response_json, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  recentDiscordDeliveries: db.prepare("SELECT * FROM discord_delivery_log ORDER BY occurred_at DESC, id DESC LIMIT ?"),
  pruneDiscordDeliveries: db.prepare("DELETE FROM discord_delivery_log WHERE id NOT IN (SELECT id FROM discord_delivery_log ORDER BY occurred_at DESC, id DESC LIMIT 250)"),
};

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function unwrap(payload, key, fallback) {
  if (Array.isArray(payload)) return payload;
  return payload?.[key] ?? fallback;
}

function listingKey(row) {
  const id = row.entityId ?? row.id ?? row.marketListingId ?? row.listingId;
  if (id) return String(id);
  return [
    row.itemName ?? "unknown",
    row.ownerUsername ?? row.owner ?? "",
    row.side ?? row.orderType ?? "sell",
    row.quantity ?? "",
    row.price ?? "",
  ].join("|");
}

function bitjitaTimestampIso(value) {
  if (!value) return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const numeric = Number(text);
  const millis = text.length >= 16 ? numeric / 1000 : text.length <= 10 ? numeric * 1000 : numeric;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeListing(row) {
  const quantity = toNumber(row.quantity);
  const price = toNumber(row.price);
  return {
    key: listingKey(row),
    itemName: String(row.itemName ?? row.name ?? "Unknown item"),
    side: String(row.side ?? row.orderType ?? "sell"),
    owner: row.ownerUsername ?? row.ownerName ?? row.owner ?? null,
    ownerEntityId: row.ownerEntityId ?? row.owner_entity_id ?? null,
    itemId: row.itemId ?? row.item_id ?? null,
    itemType: row.itemType ?? row.item_type ?? null,
    quantity,
    price,
    totalValue: quantity * price,
    tier: row.itemTier ?? row.tier ?? null,
    rarity: row.itemRarityStr ?? row.rarity ?? null,
    listedAt: bitjitaTimestampIso(row.timestamp ?? row.createdAt),
    tradeId: row.tradeId ?? row.id ?? null,
    raw: row,
  };
}

function craftJobKey(job) {
  return String(job.entityId ?? job.id ?? job.craftEntityId ?? `${job.claimEntityId ?? "claim"}:${job.buildingEntityId ?? job.buildingName ?? "building"}:${job.recipeId ?? job.recipe_entity_id ?? job.craftedItem?.[0]?.item_id ?? "recipe"}`);
}

function craftDisplayName(job, craftsPayload = {}) {
  const itemId = String(job.craftedItem?.[0]?.item_id ?? job.outputItemId ?? job.itemId ?? "");
  const item = [...(craftsPayload.items ?? []), ...(craftsPayload.cargos ?? [])].find((candidate) => String(candidate.id) === itemId);
  return String(item?.name ?? job.recipeName ?? job.name ?? `${job.buildingName ?? "Settlement"} craft`);
}

function normalizeProductionJob(job, craftsPayload = {}) {
  const metrics = productionMetrics(job);
  return {
    key: craftJobKey(job),
    label: craftDisplayName(job, craftsPayload),
    buildingName: job.buildingName ?? job.structureName ?? job.buildingNickname ?? null,
    crafterName: job.crafterUsername ?? job.ownerUsername ?? job.playerUsername ?? job.userName ?? null,
    ...metrics,
    raw: job,
  };
}

const skillNames = {
  2: "Forestry",
  3: "Carpentry",
  4: "Masonry",
  5: "Mining",
  6: "Smithing",
  7: "Scholar",
  8: "Leatherworking",
  9: "Hunting",
  10: "Tailoring",
  11: "Farming",
  12: "Fishing",
  13: "Cooking",
  14: "Foraging",
};

function productionMetrics(job) {
  const skillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
  const skillName = job.levelRequirements?.[0]?.skillName ?? skillNames[skillId] ?? "";
  const xpPerEffort = toNumber(job.experiencePerProgress?.find((xp) => toNumber(xp.skill_id) === skillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
  const totalEffort = toNumber(job.totalCraftWork ?? job.requiredCraftWork ?? job.craftWorkRequired ?? job.effortRequired ?? job.totalEffort);
  const remainingEffort = toNumber(job.remainingCraftWork ?? job.actionsRemaining ?? job.effortRemaining ?? (totalEffort ? totalEffort - toNumber(job.completedCraftWork ?? job.progress) : 0));
  const progressPct = totalEffort > 0 ? Math.max(0, Math.min(100, ((totalEffort - remainingEffort) / totalEffort) * 100)) : Math.max(0, Math.min(100, toNumber(job.progressPct ?? job.progressPercent ?? job.progress)));
  return {
    skillId,
    skillName,
    professionKey: String(skillName || "").toLowerCase().replace(/[^a-z]/g, ""),
    totalEffort,
    remainingEffort,
    progressPct,
    totalXp: totalEffort * xpPerEffort,
  };
}

function recordProductionJobs(claimId, craftsPayload, occurredAt) {
  const jobs = unwrap(craftsPayload, "craftResults", []).map((job) => normalizeProductionJob(job, craftsPayload));
  const seen = new Set(jobs.map((job) => job.key));
  const existing = new Map(statements.activeProductionJobs.all(claimId).map((row) => [row.job_key, row]));
  const hasProductionBaseline = toNumber(statements.productionJobCount.get(claimId)?.count) > 0;
  const pendingNotifications = [];

  for (const job of jobs) {
    const current = existing.get(job.key);
    statements.upsertProductionJob.run(job.key, claimId, job.label, job.buildingName, job.crafterName, current?.first_seen ?? occurredAt, occurredAt, JSON.stringify(job.raw));
    const startAlreadyNotified = current ? Boolean(current.start_notified) : false;
    if (!startAlreadyNotified && hasProductionBaseline) {
      const summary = `Craft started: ${job.label}`;
      const skipReason = productionNotificationSkipReason("production_started", job);
      if (skipReason) {
        recordDiscordDelivery({ status: "skipped", eventType: "production_started", summary, reason: skipReason, metadata: discordDiagnosticContext("production_started", job) });
        continue;
      }
      statements.insertActivity.run(claimId, "production_started", summary, occurredAt, JSON.stringify(job));
      pendingNotifications.push({ jobKey: job.key, eventType: "production_started", summary, occurredAt, metadata: job });
    }
  }

  for (const [key, current] of existing) {
    if (seen.has(key)) continue;
    statements.completeProductionJob.run(occurredAt, key);
    const job = { ...normalizeProductionJob(safeJson(current.raw_json)), key, label: current.label, buildingName: current.building_name, crafterName: current.crafter_name };
    const metadata = {
      key,
      label: current.label,
      buildingName: current.building_name,
      crafterName: current.crafter_name,
      ...job,
    };
    const summary = `Craft completed: ${current.label}`;
    const skipReason = productionNotificationSkipReason("production_completed", metadata);
    if (skipReason) {
      recordDiscordDelivery({ status: "skipped", eventType: "production_completed", summary, reason: skipReason, metadata: discordDiagnosticContext("production_completed", metadata) });
      continue;
    }
    statements.insertActivity.run(claimId, "production_completed", summary, occurredAt, JSON.stringify(metadata));
    pendingNotifications.push({ jobKey: key, eventType: "production_completed", summary, occurredAt, metadata });
  }
  return pendingNotifications;
}

async function deliverProductionNotifications(pendingNotifications = []) {
  for (const notification of pendingNotifications) {
    try {
      const result = await sendDiscordActivity(notification.eventType, notification.summary, notification.occurredAt, notification.metadata);
      if (notification.eventType === "production_started" && result.ok && !result.skipped) statements.markProductionStartNotified.run(notification.jobKey);
    } catch (error) {
      console.warn(`Discord production notification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const defaultCraftChannels = {
  forestry: "1509932116077711411",
  carpentry: "1509932154442875201",
  masonry: "1509932188446101585",
  mining: "1509932207060291797",
  smithing: "1509932228090658936",
  scholar: "1509932259262595245",
  hunting: "1510275986766434325",
  leatherworking: "1509932280829710547",
  tailoring: "1509932306486398976",
  farming: "1509932539626786926",
  fishing: "1509932564641747074",
  cooking: "1509932588180181033",
  foraging: "1509932609378058412",
};

const defaultDiscordChannels = {
  notifications: "",
  modNotes: "1509972023927902218",
  ...defaultCraftChannels,
};

const defaultNotificationChannels = {
  marketListings: "notifications",
  marketSales: "notifications",
  lowSupplies: "notifications",
  appUpdates: "notifications",
  supplyReport: "modNotes",
  productionStarted: "profession",
  productionCompleted: "profession",
};

const defaultDiscordSettings = {
  enabled: false,
  applicationId: "",
  publicKey: "",
  guildId: "",
  channelId: "",
  minSaleValue: 0,
  supplyRunwayDaysThreshold: 7,
  productionMinXp: 40000,
  productionMinProgressPct: 1,
  productionUsers: "",
  supplyReportIntervalDays: 3,
  channels: defaultDiscordChannels,
  notificationChannels: defaultNotificationChannels,
  craftChannels: defaultCraftChannels,
  notify: {
    marketListings: true,
    marketSales: true,
    production: true,
    productionStarted: true,
    productionCompleted: true,
    lowSupplies: false,
    appUpdates: true,
    supplyReports: true,
  },
};

function normalizeDiscordSettings(value = {}) {
  const notify = { ...defaultDiscordSettings.notify, ...(value.notify ?? {}) };
  return {
    ...defaultDiscordSettings,
    ...value,
    enabled: value.enabled === true,
    applicationId: String(value.applicationId ?? "").trim(),
    publicKey: String(value.publicKey ?? "").trim(),
    guildId: String(value.guildId ?? "").trim(),
    channelId: String(value.channelId ?? "").trim(),
    minSaleValue: Math.max(toNumber(value.minSaleValue), 0),
    supplyRunwayDaysThreshold: Math.max(toNumber(value.supplyRunwayDaysThreshold) || 7, 0.25),
    productionMinXp: Math.max(toNumber(value.productionMinXp) || 40000, 0),
    productionMinProgressPct: Math.max(Math.min(toNumber(value.productionMinProgressPct) || 1, 100), 0),
    productionUsers: String(value.productionUsers ?? "").trim(),
    supplyReportIntervalDays: Math.max(toNumber(value.supplyReportIntervalDays) || 3, 1),
    channels: { ...defaultDiscordChannels, ...(value.channels ?? {}), notifications: String(value.channelId ?? value.channels?.notifications ?? "").trim() },
    notificationChannels: { ...defaultNotificationChannels, ...(value.notificationChannels ?? {}) },
    craftChannels: { ...defaultCraftChannels, ...(value.channels ?? {}), ...(value.craftChannels ?? {}) },
    notify: {
      marketListings: notify.marketListings !== false,
      marketSales: notify.marketSales !== false,
      production: notify.production !== false,
      productionStarted: notify.productionStarted ?? notify.production ?? true,
      productionCompleted: notify.productionCompleted ?? notify.production ?? true,
      lowSupplies: notify.lowSupplies === true,
      appUpdates: notify.appUpdates !== false,
      supplyReports: notify.supplyReports !== false,
    },
  };
}

function getDiscordSettingsRaw() {
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const envToken = String(process.env.DISCORD_BOT_TOKEN ?? "").trim();
  const envChannelId = String(process.env.DISCORD_CHANNEL_ID ?? "").trim();
  const channelId = envChannelId || stored.channelId;
  return {
    ...stored,
    applicationId: String(process.env.DISCORD_APPLICATION_ID ?? stored.applicationId).trim(),
    publicKey: String(process.env.DISCORD_PUBLIC_KEY ?? stored.publicKey).trim(),
    guildId: String(process.env.DISCORD_GUILD_ID ?? stored.guildId).trim(),
    channelId,
    channels: { ...stored.channels, notifications: channelId },
    botToken: envToken || String(statements.getSecret.get("discord_bot_token")?.value ?? "").trim(),
    botTokenSource: envToken ? "environment" : statements.getSecret.get("discord_bot_token") ? "database" : "",
  };
}

function publicDiscordSettings() {
  const settings = getDiscordSettingsRaw();
  const { botToken, ...publicSettings } = settings;
  return {
    ...publicSettings,
    botTokenConfigured: Boolean(botToken),
    botTokenSource: settings.botTokenSource || null,
    interactionUrl: "/api/discord/interactions",
  };
}

function getSettings() {
  const theme = safeJson(statements.getSetting.get("theme_json")?.value, defaultTheme);
  const toastSettings = safeJson(statements.getSetting.get("toast_json")?.value, { marketListings: true, marketSales: true, production: true });
  const branding = safeJson(statements.getSetting.get("branding_json")?.value, {});
  return {
    claimId: statements.getSetting.get("claim_id")?.value ?? defaultClaimId,
    syncUrl: statements.getSetting.get("bitcraft_sync_url")?.value ?? defaultSyncUrl,
    theme: { ...defaultTheme, ...theme },
    refreshSeconds: Math.min(Math.max(toNumber(statements.getSetting.get("refresh_seconds")?.value) || 30, 15), 300),
    defaultPage: statements.getSetting.get("default_page")?.value ?? "overview",
    defaultRegion: statements.getSetting.get("default_region")?.value ?? "",
    toastSettings: { marketListings: true, marketSales: true, production: true, ...toastSettings },
    branding,
    snapshotRetentionDays: Math.min(Math.max(toNumber(statements.getSetting.get("snapshot_retention_days")?.value) || 365, 30), 3650),
    browserSnapshotsEnabled: false,
    discord: publicDiscordSettings(),
  };
}

const pollStatus = {
  enabled: serverPollingEnabled,
  intervalMs: snapshotIntervalMs,
  running: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  storageLastAttemptAt: null,
  storageLastSuccessAt: null,
  storageLastError: null,
  storageRequests: 0,
  storageInserted: 0,
};

function validSyncUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "bitcraftsync.app";
  } catch {
    return false;
  }
}

function validPage(value) {
  return ["overview", "members", "skills", "production", "publiccrafts", "inventory", "construction", "buildings", "research", "market", "empire", "map", "sync", "activity"].includes(value);
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = Buffer.from(await scryptAsync(password, salt, 64)).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored).split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = Buffer.from(await scryptAsync(password, salt, 64));
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}

function tokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie ?? "").split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("=") ?? "")];
  }).filter(([key]) => key));
}

function getSessionUser(req) {
  const token = parseCookies(req).bitcraft_admin_session;
  if (!token) return null;
  statements.deleteExpiredSessions.run(new Date().toISOString());
  return statements.adminBySession.get(tokenHash(token), new Date().toISOString()) ?? null;
}

function requireAdmin(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    send(res, 401, { error: "Authentication required" });
    return null;
  }
  return user;
}

function audit(user, action, details = {}) {
  statements.insertAudit.run(user?.id ?? null, user?.username ?? "system", action, JSON.stringify(details), new Date().toISOString());
}

const loginAttempts = new Map();
const upstreamCache = new Map();
const regionCache = new Map();
const claimDetailCache = new Map();

function requestAddress(req) {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
}

function loginAttemptKey(req, username) {
  return `${requestAddress(req)}|${String(username).toLowerCase()}`;
}

function loginBlocked(key) {
  const record = loginAttempts.get(key);
  if (!record || Date.now() - record.firstAt > 15 * 60 * 1000) {
    loginAttempts.delete(key);
    return false;
  }
  return record.count >= 5;
}

function failedLogin(key) {
  const existing = loginAttempts.get(key);
  if (!existing || Date.now() - existing.firstAt > 15 * 60 * 1000) {
    loginAttempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    existing.count += 1;
  }
}

function validAdminUsername(username) {
  return /^[A-Za-z0-9_-]{3,32}$/.test(username);
}

function sameOriginRequest(req) {
  const origin = String(req.headers.origin ?? "").trim();
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = String(req.headers.host ?? "");
    if (originUrl.host === host) return true;
    return !isProduction && ["127.0.0.1", "localhost"].includes(originUrl.hostname) && /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host);
  } catch {
    return false;
  }
}

function csrfToken(req) {
  const token = parseCookies(req).bitcraft_admin_session;
  return token ? createHash("sha256").update(`csrf:${token}`).digest("base64url") : null;
}

function requireAdminMutation(req, res, user) {
  if (!["POST", "PUT", "DELETE"].includes(req.method ?? "")) return true;
  if (!sameOriginRequest(req)) {
    send(res, 403, { error: "Cross-origin administrator mutation rejected" });
    return false;
  }
  const expected = csrfToken(req);
  const actual = String(req.headers["x-csrf-token"] ?? "");
  if (!expected || actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    send(res, 403, { error: "Invalid administrator request token" });
    return false;
  }
  return Boolean(user);
}

function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  statements.insertSession.run(tokenHash(token), userId, expiresAt.toISOString(), createdAt.toISOString());
  return {
    token,
    cookie: `bitcraft_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}${isProduction ? "; Secure" : ""}`,
  };
}

function clearSession(req) {
  const token = parseCookies(req).bitcraft_admin_session;
  if (token) statements.deleteSession.run(tokenHash(token));
  return `bitcraft_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? "; Secure" : ""}`;
}

function adminStatus(req) {
  const setupRequired = toNumber(statements.adminCount.get()?.count) === 0;
  const user = getSessionUser(req);
  return {
    setupRequired,
    setupKeyRequired: isProduction && setupRequired,
    authenticated: Boolean(user),
    user: user ? { id: user.id, username: user.username } : null,
    csrfToken: user ? csrfToken(req) : null,
  };
}

function tableNames() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map((row) => row.name)
    .filter((name) => name !== "app_secrets");
}

function tableColumns(name) {
  if (!new Set(tableNames()).has(name)) throw new Error("Unknown table");
  return db.prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`).all().map((row) => String(row.name));
}

function tableInfo() {
  return tableNames().map((name) => {
    const safeName = name.replaceAll('"', '""');
    const columns = tableColumns(name);
    const timeColumn = ["occurred_at", "captured_at", "updated_at", "created_at"].find((column) => columns.includes(column));
    const latest = timeColumn ? db.prepare(`SELECT MAX("${timeColumn}") AS latest FROM "${safeName}"`).get()?.latest ?? null : null;
    return { name, rows: db.prepare(`SELECT COUNT(*) AS count FROM "${safeName}"`).get().count, latest };
  });
}

function tableQuery(name, params, exporting = false) {
  const allowed = new Set(tableNames());
  if (!allowed.has(name)) throw new Error("Unknown table");
  const columns = tableColumns(name);
  const safeName = name.replaceAll('"', '""');
  const search = String(params.search ?? "").trim();
  const dateFrom = String(params.dateFrom ?? "").trim();
  const dateTo = String(params.dateTo ?? "").trim();
  const orderBy = columns.includes(String(params.sort ?? "")) ? String(params.sort) : columns.includes("id") ? "id" : columns[0];
  const direction = String(params.direction ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const timeColumn = ["occurred_at", "captured_at", "updated_at", "created_at"].find((column) => columns.includes(column));
  const clauses = [];
  const values = [];
  if (search) {
    clauses.push(`(${columns.map((column) => `CAST("${column.replaceAll('"', '""')}" AS TEXT) LIKE ?`).join(" OR ")})`);
    values.push(...columns.map(() => `%${search}%`));
  }
  if (dateFrom && timeColumn) {
    clauses.push(`"${timeColumn}" >= ?`);
    values.push(dateFrom);
  }
  if (dateTo && timeColumn) {
    clauses.push(`"${timeColumn}" <= ?`);
    values.push(`${dateTo}T23:59:59.999Z`);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS count FROM "${safeName}"${where}`).get(...values).count;
  const limit = exporting ? Math.min(Math.max(Number(params.limit) || 10000, 1), 50000) : Math.min(Math.max(Number(params.limit) || 50, 1), 200);
  const offset = exporting ? 0 : Math.max(Number(params.offset) || 0, 0);
  const rows = db.prepare(`SELECT * FROM "${safeName}"${where} ORDER BY "${orderBy.replaceAll('"', '""')}" ${direction} LIMIT ? OFFSET ?`).all(...values, limit, offset);
  return { table: name, columns, rows, total, limit, offset, timeColumn };
}

const analyticsEvents = new Set([
  "page_view",
  "page_duration",
  "member_details_opened",
  "market_tab_viewed",
  "market_member_filter_used",
  "price_finder_search",
  "price_finder_region_changed",
  "public_craft_map_opened",
  "public_craft_skill_filter_used",
  "public_craft_region_filter_used",
  "production_eligibility_filter_used",
  "activity_member_filter_used",
  "activity_category_filter_used",
]);
const analyticsPages = new Set(["overview", "members", "skills", "production", "publiccrafts", "inventory", "construction", "buildings", "research", "market", "empire", "map", "sync", "activity"]);
const analyticsRetentionDays = 90;
let lastAnalyticsPruneAt = 0;

function recordAnalyticsEvent(body, req) {
  const eventName = String(body.eventName ?? "");
  const page = String(body.page ?? "");
  const cookies = parseCookies(req);
  if (cookies.claim_monitor_analytics_consent !== "accepted") throw new Error("Analytics consent is required");
  const visitorId = String(cookies.claim_monitor_analytics_visitor ?? "");
  const sessionId = String(body.sessionId ?? "");
  if (!analyticsEvents.has(eventName) || !analyticsPages.has(page)) throw new Error("Unknown analytics event");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(visitorId) || !/^[a-zA-Z0-9-]{16,80}$/.test(sessionId)) throw new Error("Invalid analytics identifier");
  const rawProperties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
  const properties = Object.fromEntries(Object.entries(rawProperties)
    .filter(([key, value]) => /^[a-zA-Z_]{1,32}$/.test(key) && ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 6)
    .map(([key, value]) => [key, String(value).slice(0, 50)]));
  const durationSeconds = eventName === "page_duration" ? Math.min(Math.max(Math.round(toNumber(body.durationSeconds)), 1), 86400) : null;
  const visitorKey = createHash("sha256").update(visitorId).digest("hex");
  const sessionKey = createHash("sha256").update(sessionId).digest("hex");
  if (Date.now() - lastAnalyticsPruneAt > 24 * 60 * 60 * 1000) {
    const before = new Date(Date.now() - analyticsRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM analytics_events WHERE occurred_at < ?").run(before);
    lastAnalyticsPruneAt = Date.now();
  }
  statements.insertAnalyticsEvent.run(visitorKey, sessionKey, eventName, page, JSON.stringify(properties), durationSeconds, new Date().toISOString());
  return { ok: true };
}

function analyticsDashboard(days = 30) {
  const selectedDays = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(Date.now() - selectedDays * 24 * 60 * 60 * 1000).toISOString();
  const totals = db.prepare(`
    SELECT
      COUNT(CASE WHEN event_name = 'page_view' THEN 1 END) AS pageViews,
      COUNT(CASE WHEN event_name NOT IN ('page_view', 'page_duration') THEN 1 END) AS interactions,
      COUNT(DISTINCT visitor_key) AS visitors,
      COUNT(DISTINCT session_key) AS sessions,
      COALESCE(SUM(CASE WHEN event_name = 'page_duration' THEN duration_seconds ELSE 0 END), 0) AS durationSeconds
    FROM analytics_events WHERE occurred_at >= ?
  `).get(since);
  const pages = db.prepare(`
    SELECT page,
      COUNT(CASE WHEN event_name = 'page_view' THEN 1 END) AS pageViews,
      COUNT(DISTINCT visitor_key) AS visitors,
      COALESCE(SUM(CASE WHEN event_name = 'page_duration' THEN duration_seconds ELSE 0 END), 0) AS durationSeconds
    FROM analytics_events WHERE occurred_at >= ?
    GROUP BY page ORDER BY pageViews DESC, durationSeconds DESC LIMIT 20
  `).all(since);
  const features = db.prepare(`
    SELECT event_name AS eventName, COUNT(*) AS uses, COUNT(DISTINCT visitor_key) AS visitors
    FROM analytics_events
    WHERE occurred_at >= ? AND event_name NOT IN ('page_view', 'page_duration')
    GROUP BY event_name ORDER BY uses DESC, event_name ASC LIMIT 30
  `).all(since);
  const daily = db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS day,
      COUNT(CASE WHEN event_name = 'page_view' THEN 1 END) AS pageViews,
      COUNT(DISTINCT visitor_key) AS visitors
    FROM analytics_events WHERE occurred_at >= ?
    GROUP BY substr(occurred_at, 1, 10) ORDER BY day ASC
  `).all(since);
  return { days: selectedDays, retentionDays: analyticsRetentionDays, totals, pages, features, daily };
}

function addActivity(claimId, eventType, summary, occurredAt, metadata = {}) {
  statements.insertActivity.run(claimId, eventType, summary, occurredAt, JSON.stringify(metadata));
  queueDiscordActivity(claimId, eventType, summary, occurredAt, metadata);
}

function formatGold(value) {
  return `${Math.round(toNumber(value)).toLocaleString()}g`;
}

function formatDaysAndHours(days) {
  const value = toNumber(days);
  if (value <= 0) return "0 hours";
  const wholeDays = Math.floor(value);
  const hours = Math.round((value - wholeDays) * 24);
  if (wholeDays <= 0) return `${hours} hours`;
  if (hours <= 0) return `${wholeDays} days`;
  return `${wholeDays} days ${hours} hours`;
}

function supplyRunwayMetadata(claim, supplies = toNumber(claim?.supplies)) {
  const hourlyUpkeep = toNumber(claim?.upkeepCost) || toNumber(claim?.tileCost) * toNumber(claim?.numTiles);
  const dailyUpkeep = hourlyUpkeep * 24;
  const runOutDate = bitjitaTimestampIso(claim?.suppliesRunOut);
  const runwayDays = runOutDate && new Date(runOutDate).getTime() > Date.now()
    ? (new Date(runOutDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    : dailyUpkeep > 0 ? supplies / dailyUpkeep : 0;
  return {
    dailyUpkeep,
    runwayDays,
    runway: formatDaysAndHours(runwayDays),
    upkeep: dailyUpkeep ? `${dailyUpkeep.toLocaleString(undefined, { maximumFractionDigits: 2 })} supplies per day` : "Unknown",
    runsOutAt: runOutDate,
  };
}

function discordEnabledFor(eventType, settings, metadata) {
  if (!settings.enabled || !settings.botToken) return false;
  if (eventType === "market_new_listing") return settings.notify.marketListings;
  if (eventType === "market_sale" || eventType === "market_sale_confirmed") {
    return settings.notify.marketSales && toNumber(metadata?.totalValue ?? metadata?.totalPrice ?? toNumber(metadata?.quantity) * toNumber(metadata?.price)) >= settings.minSaleValue;
  }
  if (eventType === "production_started") return settings.notify.production && settings.notify.productionStarted && productionNotificationAllowed(eventType, metadata, settings);
  if (eventType === "production_completed") return settings.notify.production && settings.notify.productionCompleted && productionNotificationAllowed(eventType, metadata, settings);
  if (eventType === "supplies") return settings.notify.lowSupplies && toNumber(metadata?.runwayDays) > 0 && toNumber(metadata.runwayDays) < settings.supplyRunwayDaysThreshold;
  if (eventType === "app_update") return settings.notify.appUpdates;
  return false;
}

function productionNotificationSkipReason(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  if (!settings.notify.production) return "Craft notifications are disabled";
  if (eventType === "production_started" && !settings.notify.productionStarted) return "Craft started notifications are disabled";
  if (eventType === "production_completed" && !settings.notify.productionCompleted) return "Craft completed notifications are disabled";
  if (eventType === "production_started" && toNumber(metadata.progressPct) < settings.productionMinProgressPct) return `Progress ${toNumber(metadata.progressPct).toFixed(1)}% is below ${settings.productionMinProgressPct}%`;
  if (toNumber(metadata.totalXp) < settings.productionMinXp) return `Total XP ${toNumber(metadata.totalXp).toLocaleString()} is below ${settings.productionMinXp.toLocaleString()}`;
  const allowedUsers = String(settings.productionUsers ?? "").split(/[\n,]/).map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (allowedUsers.length) {
    const crafter = String(metadata.crafterName ?? "").trim().toLowerCase();
    if (!crafter) return `Allowed crafters are set, but BitJita did not provide a crafter name for this craft`;
    if (!allowedUsers.includes(crafter)) return `Crafter "${metadata.crafterName}" is not in allowed crafters: ${settings.productionUsers}`;
  }
  return "";
}

function productionNotificationAllowed(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  return !productionNotificationSkipReason(eventType, metadata, settings);
}

function discordChannelForEvent(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  if (eventType === "production_started" || eventType === "production_completed") {
    const selection = settings.notificationChannels?.[eventType === "production_started" ? "productionStarted" : "productionCompleted"] ?? "profession";
    if (selection && selection !== "profession") return settings.channels?.[selection] || settings.channelId;
    const professionKey = String(metadata.professionKey ?? "").toLowerCase();
    return settings.craftChannels?.[professionKey] || settings.channelId;
  }
  const selection = eventType === "market_new_listing" ? "marketListings"
    : eventType === "market_sale" || eventType === "market_sale_confirmed" ? "marketSales"
    : eventType === "supplies" ? "lowSupplies"
    : eventType === "app_update" ? "appUpdates"
    : "";
  if (selection) return settings.channels?.[settings.notificationChannels?.[selection]] || settings.channelId;
  return settings.channelId;
}

function discordChannelKeyForEvent(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  if (eventType === "production_started" || eventType === "production_completed") {
    const selectionKey = eventType === "production_started" ? "productionStarted" : "productionCompleted";
    const selection = settings.notificationChannels?.[selectionKey] ?? "profession";
    if (selection === "profession") return normalizeProfessionKey(metadata.professionKey ?? metadata.skillName) || "profession";
    return selection;
  }
  if (eventType === "market_new_listing") return settings.notificationChannels?.marketListings ?? "notifications";
  if (eventType === "market_sale" || eventType === "market_sale_confirmed") return settings.notificationChannels?.marketSales ?? "notifications";
  if (eventType === "supplies") return settings.notificationChannels?.lowSupplies ?? "notifications";
  if (eventType === "supply_report") return settings.notificationChannels?.supplyReport ?? "modNotes";
  if (eventType === "app_update") return settings.notificationChannels?.appUpdates ?? "notifications";
  return "notifications";
}

function discordDiagnosticContext(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  return {
    eventType,
    enabled: Boolean(settings.enabled),
    hasBotToken: Boolean(settings.botToken),
    channelId: discordChannelForEvent(eventType, metadata, settings) || "",
    channelKey: discordChannelKeyForEvent(eventType, metadata, settings),
    notify: settings.notify,
    minSaleValue: settings.minSaleValue,
    supplyRunwayDaysThreshold: settings.supplyRunwayDaysThreshold,
    productionMinXp: settings.productionMinXp,
    productionMinProgressPct: settings.productionMinProgressPct,
    productionUsers: settings.productionUsers,
    metadata,
  };
}

function recordDiscordDelivery(status) {
  const occurredAt = new Date().toISOString();
  const record = { ...status, at: occurredAt };
  statements.upsertSetting.run("discord_last_delivery_json", JSON.stringify(record), occurredAt);
  statements.insertDiscordDelivery.run(
    String(status.eventType ?? "unknown"),
    String(status.status ?? "unknown"),
    status.summary ? String(status.summary) : null,
    status.channelId ? String(status.channelId) : null,
    status.channelKey ? String(status.channelKey) : null,
    status.reason ? String(status.reason) : null,
    status.error ? String(status.error) : null,
    JSON.stringify(status.metadata ?? status.details ?? {}),
    status.response ? JSON.stringify(status.response) : null,
    occurredAt,
  );
  statements.pruneDiscordDeliveries.run();
}

async function sendDiscordActivity(eventType, summary, occurredAt, metadata = {}, settings = getDiscordSettingsRaw()) {
  const channelId = discordChannelForEvent(eventType, metadata, settings);
  const channelKey = discordChannelKeyForEvent(eventType, metadata, settings);
  const diagnostics = discordDiagnosticContext(eventType, metadata, settings);
  if (!discordEnabledFor(eventType, settings, metadata)) {
    const reason = eventType === "production_started" || eventType === "production_completed"
      ? productionNotificationSkipReason(eventType, metadata, settings) || "Craft notification disabled by settings"
      : eventType === "app_update" ? "App update notifications are disabled" : "Notification disabled or below configured threshold";
    recordDiscordDelivery({ status: "skipped", eventType, channelId, channelKey, summary, reason, metadata: diagnostics });
    return { ok: true, skipped: true };
  }
  try {
    const response = await sendDiscordMessage({
      embeds: [discordEmbedForActivity(eventType, summary, occurredAt, metadata)],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDelivery({ status: "sent", eventType, channelId, channelKey, summary, metadata: diagnostics, response: { id: response?.id, channel_id: response?.channel_id } });
    return { ok: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDelivery({ status: "failed", eventType, channelId, channelKey, summary, error: message, metadata: diagnostics });
    throw error;
  }
}

function discordEmbedForActivity(eventType, summary, occurredAt, metadata = {}) {
  const color = eventType.includes("sale") ? 0x4ee28a : eventType.includes("listing") ? 0xf0c64f : eventType.includes("production") ? 0x65b7fa : eventType === "app_update" ? 0xa349af : 0xef6461;
  const fields = [];
  if (metadata.itemName) fields.push({ name: "Item", value: String(metadata.itemName), inline: true });
  if (metadata.owner) fields.push({ name: "Member", value: String(metadata.owner), inline: true });
  if (toNumber(metadata.quantity)) fields.push({ name: "Quantity", value: toNumber(metadata.quantity).toLocaleString(), inline: true });
  if (toNumber(metadata.price)) fields.push({ name: "Unit price", value: formatGold(metadata.price), inline: true });
  if (toNumber(metadata.totalValue ?? metadata.totalPrice)) fields.push({ name: "Total", value: formatGold(metadata.totalValue ?? metadata.totalPrice), inline: true });
  if (metadata.buildingName) fields.push({ name: "Structure", value: String(metadata.buildingName), inline: true });
  if (metadata.crafterName) fields.push({ name: "Crafter", value: String(metadata.crafterName), inline: true });
  if (metadata.skillName) fields.push({ name: "Profession", value: String(metadata.skillName), inline: true });
  if (toNumber(metadata.totalXp)) fields.push({ name: "Total XP", value: toNumber(metadata.totalXp).toLocaleString(), inline: true });
  if (toNumber(metadata.progressPct)) fields.push({ name: "Progress", value: `${toNumber(metadata.progressPct).toFixed(1)}%`, inline: true });
  if (metadata.runway) fields.push({ name: "Runway", value: String(metadata.runway), inline: true });
  if (metadata.upkeep) fields.push({ name: "Upkeep", value: String(metadata.upkeep), inline: true });
  if (metadata.runsOutAt) fields.push({ name: "Runs out", value: new Date(metadata.runsOutAt).toLocaleString("en-GB", { timeZone: "Europe/London" }), inline: false });
  if (metadata.version) fields.push({ name: "Version", value: String(metadata.version), inline: true });
  if (metadata.changelogUrl) fields.push({ name: "Changelog", value: `[View changes](${metadata.changelogUrl})`, inline: false });
  const title = eventType === "market_new_listing" ? "Market Listing"
    : eventType.includes("sale") ? "Market Sale"
    : eventType === "production_started" ? "Craft Started"
    : eventType === "production_completed" ? "Craft Completed"
    : eventType === "supplies" ? "Supply Watch"
    : eventType === "app_update" ? "App Update"
    : "Settlement Update";
  return {
    author: { name: "Timbersteel Trade" },
    title,
    url: metadata.url ?? metadata.changelogUrl,
    description: `**${summary}**`,
    color,
    fields: fields.slice(0, 8),
    timestamp: occurredAt,
    footer: { text: "BitCraft settlement monitor" },
  };
}

function queueDiscordActivity(claimId, eventType, summary, occurredAt, metadata = {}) {
  void sendDiscordActivity(eventType, summary, occurredAt, metadata).catch((error) => console.warn(`Discord notification failed: ${error instanceof Error ? error.message : String(error)}`));
}

async function sendDiscordMessage(payload, settings = getDiscordSettingsRaw(), channelId = settings.channelId) {
  if (!settings.enabled || !settings.botToken || !channelId) throw new Error("Discord integration is not fully configured");
  const response = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${settings.botToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

const discordTestEvents = {
  listing: {
    eventType: "market_new_listing",
    summary: "New listing: Rough Plank x240 at 6g",
    metadata: { itemName: "Rough Plank", owner: "Modular", quantity: 240, price: 6, totalValue: 1440 },
  },
  sale: {
    eventType: "market_sale_confirmed",
    summary: "Confirmed sale: Bronze Ingot x75 at 18g",
    metadata: { itemName: "Bronze Ingot", owner: "Mosswick", quantity: 75, price: 18, totalValue: 1350 },
  },
  craftStarted: {
    eventType: "production_started",
    summary: "Craft started: Tier 4 Scholar Workstation",
    metadata: { label: "Tier 4 Scholar Workstation", buildingName: "Scholar Hall", crafterName: "Modular", skillName: "Scholar", professionKey: "scholar", totalXp: 82000, progressPct: 7.5 },
  },
  craftCompleted: {
    eventType: "production_completed",
    summary: "Craft completed: Refined Rough Plank",
    metadata: { label: "Refined Rough Plank", buildingName: "Carpentry Workshop", crafterName: "Modular", skillName: "Carpentry", professionKey: "carpentry", totalXp: 64000, progressPct: 100 },
  },
  supplies: {
    eventType: "supplies",
    summary: "Supply stock changed: 11,946 remaining",
    metadata: { runwayDays: 6.8, runway: "6 days 19 hours", upkeep: "448.5 supplies per day", runsOutAt: new Date(Date.now() + 6.8 * 24 * 60 * 60 * 1000).toISOString() },
  },
  appUpdate: {
    eventType: "app_update",
    summary: `Version ${appVersion} is live with Discord diagnostics`,
    metadata: { version: appVersion, changelogUrl },
  },
};

async function sendDiscordTestNotification(kind = "basic") {
  const settings = getDiscordSettingsRaw();
  if (kind === "basic") {
    const summary = "Discord integration test from Timbersteel Trade.";
    try {
      const response = await sendDiscordMessage({
        content: summary,
        allowed_mentions: { parse: [] },
      }, settings, settings.channelId);
      recordDiscordDelivery({ status: "sent", eventType: "test_basic", channelId: settings.channelId, channelKey: "notifications", summary, metadata: discordDiagnosticContext("test_basic", {}, settings), response: { id: response?.id, channel_id: response?.channel_id } });
      return response;
    } catch (error) {
      recordDiscordDelivery({ status: "failed", eventType: "test_basic", channelId: settings.channelId, channelKey: "notifications", summary, error: error instanceof Error ? error.message : String(error), metadata: discordDiagnosticContext("test_basic", {}, settings) });
      throw error;
    }
  }
  const sample = discordTestEvents[kind];
  if (!sample) throw new Error("Unknown Discord test notification");
  const channelId = discordChannelForEvent(sample.eventType, sample.metadata, settings);
  const channelKey = discordChannelKeyForEvent(sample.eventType, sample.metadata, settings);
  try {
    const response = await sendDiscordMessage({
      embeds: [discordEmbedForActivity(sample.eventType, sample.summary, new Date().toISOString(), sample.metadata)],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDelivery({ status: "sent", eventType: `test_${sample.eventType}`, channelId, channelKey, summary: sample.summary, metadata: discordDiagnosticContext(sample.eventType, sample.metadata, settings), response: { id: response?.id, channel_id: response?.channel_id } });
    return response;
  } catch (error) {
    recordDiscordDelivery({ status: "failed", eventType: `test_${sample.eventType}`, channelId, channelKey, summary: sample.summary, error: error instanceof Error ? error.message : String(error), metadata: discordDiagnosticContext(sample.eventType, sample.metadata, settings) });
    throw error;
  }
}

async function announceDiscordAppUpdateIfNeeded() {
  const settings = getDiscordSettingsRaw();
  if (!settings.enabled || !settings.botToken || !settings.notify.appUpdates) {
    recordDiscordDelivery({ status: "skipped", eventType: "app_update", summary: `Version ${appVersion} is now live.`, reason: "Discord disabled, bot token missing, or app update notifications disabled", metadata: discordDiagnosticContext("app_update", { version: appVersion, changelogUrl }, settings) });
    return;
  }
  const lastAnnounced = statements.getSetting.get("discord_last_announced_version")?.value ?? "";
  if (lastAnnounced === appVersion) {
    recordDiscordDelivery({ status: "skipped", eventType: "app_update", summary: `Version ${appVersion} is already announced.`, reason: `Version ${appVersion} already announced`, metadata: discordDiagnosticContext("app_update", { version: appVersion, changelogUrl, lastAnnounced }, settings) });
    return;
  }
  await sendDiscordActivity(
    "app_update",
    `Version ${appVersion} is now live.`,
    new Date().toISOString(),
    { version: appVersion, changelogUrl },
    settings,
  );
  statements.upsertSetting.run("discord_last_announced_version", appVersion, new Date().toISOString());
}

function discordSupplyEmbed(claim) {
  const supplies = toNumber(claim.supplies);
  const supplyMeta = supplyRunwayMetadata(claim, supplies);
  return discordCommandEmbed("Settlement Supplies", `**${claim.name ?? "Monitored settlement"}** supply status`, [
    { name: "Current stock", value: supplies.toLocaleString(), inline: true },
    { name: "Upkeep", value: supplyMeta.upkeep, inline: true },
    { name: "Runway", value: supplyMeta.runway, inline: true },
    ...(supplyMeta.runsOutAt ? [{ name: "Runs out", value: new Date(supplyMeta.runsOutAt).toLocaleString("en-GB", { timeZone: "Europe/London" }), inline: false }] : []),
  ], supplyMeta.runwayDays < 3 ? 0xef6461 : supplyMeta.runwayDays < 7 ? 0xf0c64f : 0x4ee28a);
}

async function sendScheduledSupplyReportIfDue(claim) {
  const settings = getDiscordSettingsRaw();
  if (!settings.enabled || !settings.botToken || !settings.notify.supplyReports) {
    recordDiscordDelivery({ status: "skipped", eventType: "supply_report", summary: "Scheduled supply report", reason: "Discord disabled, bot token missing, or scheduled reports disabled", metadata: discordDiagnosticContext("supply_report", {}, settings) });
    return;
  }
  const lastSent = statements.getSetting.get("discord_last_supply_report_at")?.value ?? "";
  const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;
  const intervalMs = settings.supplyReportIntervalDays * 24 * 60 * 60 * 1000;
  if (lastSentMs && Date.now() - lastSentMs < intervalMs) {
    recordDiscordDelivery({ status: "skipped", eventType: "supply_report", summary: "Scheduled supply report", reason: `Next report not due until ${new Date(lastSentMs + intervalMs).toISOString()}`, metadata: discordDiagnosticContext("supply_report", { lastSent, intervalDays: settings.supplyReportIntervalDays }, settings) });
    return;
  }
  const channelKey = settings.notificationChannels?.supplyReport ?? "modNotes";
  const channelId = settings.channels?.[channelKey] || settings.channelId;
  try {
    const response = await sendDiscordMessage({
      embeds: [discordSupplyEmbed(claim)],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDelivery({ status: "sent", eventType: "supply_report", channelId, channelKey, summary: "Scheduled supply report", metadata: discordDiagnosticContext("supply_report", { claimId: claim.entityId ?? claim.id, supplies: claim.supplies }, settings), response: { id: response?.id, channel_id: response?.channel_id } });
  } catch (error) {
    recordDiscordDelivery({ status: "failed", eventType: "supply_report", channelId, channelKey, summary: "Scheduled supply report", error: error instanceof Error ? error.message : String(error), metadata: discordDiagnosticContext("supply_report", { claimId: claim.entityId ?? claim.id, supplies: claim.supplies }, settings) });
    throw error;
  }
  statements.upsertSetting.run("discord_last_supply_report_at", new Date().toISOString(), new Date().toISOString());
}

const deployableStorageName = /\b(?:cart|handcart|wagon|boat|ship|goat|sled|mount)\b/i;

function storageContainerName(building) {
  return String(building?.buildingNickname ?? "").trim() || building?.buildingName || building?.name || "Storage";
}

function isDeployableStorage(building) {
  return deployableStorageName.test(String(building?.buildingName ?? building?.name ?? ""));
}

function signedChange(after, before, suffix = "") {
  const delta = toNumber(after) - toNumber(before);
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toLocaleString()}${suffix}`;
}

function tradeMatchesListing(trade, listing) {
  const orderId = String(trade.orderEntityId ?? trade.order_entity_id ?? "");
  if (orderId && orderId === String(listing.key)) return true;
  const sameItem = String(trade.itemId ?? "") === String(listing.itemId ?? "") && String(trade.itemType ?? "") === String(listing.itemType ?? "");
  const sameSeller = !listing.ownerEntityId || String(trade.sellerEntityId ?? "") === String(listing.ownerEntityId);
  return sameItem && sameSeller;
}

function usedTradeIdsForListing(listingKey) {
  const rows = db.prepare("SELECT trade_id FROM market_events WHERE listing_key = ? AND trade_id IS NOT NULL").all(listingKey);
  return new Set(rows.flatMap((row) => String(row.trade_id).split(",")).filter(Boolean));
}

async function findConfirmedTrade(listing, minQuantity = 1) {
  if (!listing.ownerEntityId) return null;
  try {
    const usedTradeIds = usedTradeIdsForListing(listing.key);
    const matches = [];
    let offset = 0;
    while (offset < 1000) {
      const url = new URL(`${process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com"}/api/market/player/${listing.ownerEntityId}/trades`);
      url.searchParams.set("type", "sell");
      url.searchParams.set("limit", "200");
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("orderEntityId", listing.key);
      const response = await fetch(url, { headers: { accept: "application/json", "x-app-identifier": appIdentifier } });
      if (!response.ok) return null;
      const trades = unwrap(await response.json(), "trades", []);
      matches.push(...trades.filter((trade) => tradeMatchesListing(trade, listing) && (!trade.id || !usedTradeIds.has(String(trade.id)))));
      const matchedQuantity = matches.reduce((total, trade) => total + toNumber(trade.quantity), 0);
      if (matchedQuantity >= minQuantity) {
        const totalPrice = matches.reduce((total, trade) => total + toNumber(trade.totalPrice ?? trade.total_price ?? toNumber(trade.quantity) * toNumber(trade.price ?? trade.unitPrice)), 0);
        return {
          ...matches[0],
          id: matches.map((trade) => trade.id).filter(Boolean).join(","),
          quantity: matchedQuantity,
          totalPrice,
          matchedTrades: matches,
        };
      }
      if (trades.length < 200) break;
      offset += trades.length;
    }
    return null;
  } catch {
    return null;
  }
}

async function findPendingMarketConfirmations(claimId) {
  const confirmations = [];
  for (const event of statements.pendingMarketEvents.all(claimId)) {
    let raw = {};
    try {
      raw = JSON.parse(event.raw_json ?? "{}");
    } catch {
      raw = {};
    }
    const listing = {
      key: event.listing_key,
      itemName: event.item_name,
      side: event.side ?? "sell",
      owner: event.owner,
      ownerEntityId: event.owner_entity_id ?? raw.ownerEntityId,
      itemId: event.item_id ?? raw.itemId,
      itemType: event.item_type ?? raw.itemType,
      quantity: toNumber(event.quantity),
      price: toNumber(event.price),
      totalValue: toNumber(event.total_value),
      tier: event.tier,
      rarity: event.rarity,
      raw,
    };
    const trade = await findConfirmedTrade(listing, listing.quantity);
    if (!trade) continue;
    confirmations.push({ event, listing, trade });
  }
  return confirmations;
}

function applyPendingMarketConfirmations(claimId, now, confirmations) {
  for (const { event, listing, trade } of confirmations) {
    const nextType = event.event_type === "partial_quantity_drop" ? "partial_sale" : "sale";
    for (const fill of trade.matchedTrades ?? [trade]) insertConfirmedMarketTrade(claimId, fill, listing, now);
    statements.confirmMarketEvent.run(nextType, trade.id ?? null, JSON.stringify(trade), event.id);
    addActivity(claimId, "market_sale_confirmed", `Confirmed sale: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`, now, { ...listing, tradeId: trade.id ?? null });
  }
}

function insertConfirmedMarketTrade(claimId, trade, listing = {}, importedAt = new Date().toISOString()) {
  const tradeId = String(trade.id ?? "").trim();
  if (!tradeId) return 0;
  const quantity = toNumber(trade.quantity);
  const unitPrice = toNumber(trade.unitPrice ?? trade.price ?? listing.price);
  const totalPrice = toNumber(trade.totalPrice ?? trade.total_price) || quantity * unitPrice;
  return Number(statements.insertMarketTrade.run(
    tradeId,
    claimId,
    trade.orderEntityId == null ? String(listing.key ?? "") || null : String(trade.orderEntityId),
    trade.sellerEntityId == null ? String(listing.ownerEntityId ?? "") || null : String(trade.sellerEntityId),
    trade.sellerUsername ?? listing.owner ?? null,
    trade.purchaserEntityId == null ? null : String(trade.purchaserEntityId),
    trade.purchaserUsername ?? null,
    trade.itemId == null ? (listing.itemId == null ? null : String(listing.itemId)) : String(trade.itemId),
    trade.itemType == null ? (listing.itemType == null ? null : String(listing.itemType)) : String(trade.itemType),
    String(trade.itemName ?? listing.itemName ?? "Unknown item"),
    quantity,
    unitPrice,
    totalPrice,
    trade.itemTier == null ? (listing.tier == null ? null : String(listing.tier)) : String(trade.itemTier),
    trade.itemRarityStr ?? listing.rarity ?? null,
    tradeOccurredAt(trade, importedAt),
    importedAt,
    JSON.stringify(trade),
  ).changes);
}

function addMarketEvent(claimId, eventType, listing, occurredAt) {
  statements.insertMarketEvent.run(
    claimId,
    eventType,
    listing.key,
    listing.itemName,
    listing.side,
    listing.owner,
    listing.ownerEntityId,
    listing.itemId == null ? null : String(listing.itemId),
    listing.itemType == null ? null : String(listing.itemType),
    listing.quantity,
    listing.price,
    listing.totalValue,
    listing.tier == null ? null : String(listing.tier),
    listing.rarity,
    occurredAt,
    listing.tradeId,
    JSON.stringify(listing.raw),
  );
}

async function recordSnapshot(payload) {
  const now = new Date().toISOString();
  let pendingProductionNotifications = [];
  const claimId = String(payload.claimId ?? payload.claim?.entityId ?? "");
  if (!claimId) throw new Error("Missing claim id");

  const claim = payload.claim ?? {};
  const market = unwrap(payload.market, "listings", []);
  const membersCount = toNumber(payload.membersCount);
  const buildingsCount = toNumber(payload.buildingsCount);
  const marketCount = market.length;
  const supplies = toNumber(claim.supplies);
  const treasury = toNumber(claim.treasury);
  const supplyMeta = supplyRunwayMetadata(claim, supplies);
  const previous = statements.latestSnapshot.get(claimId);
  const normalizedListings = market.map(normalizeListing);
  const seen = new Set(normalizedListings.map((listing) => listing.key));
  const existingListings = new Map(normalizedListings.map((listing) => [listing.key, statements.listingByKey.get(listing.key)]));
  const partialCandidates = normalizedListings
    .map((listing) => ({ listing, existing: existingListings.get(listing.key) }))
    .filter(({ listing, existing }) => existing && listing.quantity < toNumber(existing.quantity))
    .map(({ listing, existing }) => ({ listing, soldQuantity: toNumber(existing.quantity) - listing.quantity }));
  const closedCandidates = statements.activeListings.all(claimId).filter((active) => !seen.has(active.listing_key)).map((active) => {
    const raw = safeJson(active.raw_json);
    return {
      active,
      listing: {
        key: active.listing_key,
        itemName: active.item_name,
        side: active.side ?? "sell",
        owner: active.owner,
        ownerEntityId: active.owner_entity_id ?? raw.ownerEntityId,
        itemId: active.item_id ?? raw.itemId,
        itemType: active.item_type ?? raw.itemType,
        quantity: toNumber(active.quantity),
        price: toNumber(active.price),
        totalValue: toNumber(active.total_value),
        tier: active.tier,
        rarity: active.rarity,
        raw,
      },
    };
  });
  const [partialChecks, closedChecks, pendingConfirmations] = await Promise.all([
    Promise.all(partialCandidates.map(async ({ listing, soldQuantity }) => ({ listing, soldQuantity, trade: await findConfirmedTrade(listing, soldQuantity) }))),
    Promise.all(closedCandidates.map(async ({ active, listing }) => ({ active, listing, trade: await findConfirmedTrade(listing, listing.quantity) }))),
    findPendingMarketConfirmations(claimId),
  ]);
  const partialResults = new Map(partialChecks.map((result) => [result.listing.key, result]));
  const closedResults = new Map(closedChecks.map((result) => [result.listing.key, result]));

  db.exec("BEGIN");
  try {
    statements.insertSnapshot.run(claimId, now, supplies, treasury, membersCount, buildingsCount, marketCount, JSON.stringify(payload));

    if (previous) {
      const checks = [
        ["supplies", toNumber(previous.supplies), supplies, `${signedChange(supplies, previous.supplies)} supplies`],
        ["treasury", toNumber(previous.treasury), treasury, `${signedChange(treasury, previous.treasury, "g")} to treasury`],
        ["members", toNumber(previous.members_count), membersCount, `${signedChange(membersCount, previous.members_count)} members`],
        ["buildings", toNumber(previous.buildings_count), buildingsCount, `${signedChange(buildingsCount, previous.buildings_count)} buildings`],
        ["market", toNumber(previous.market_count), marketCount, `${signedChange(marketCount, previous.market_count)} market listings`],
      ];
      for (const [type, before, after, summary] of checks) {
        if (before !== after) addActivity(claimId, type, summary, now, type === "supplies" ? { before, after, ...supplyMeta } : { before, after });
      }
    } else {
      addActivity(claimId, "baseline", "Baseline snapshot saved", now, { membersCount, buildingsCount, marketCount });
    }

    for (const listing of normalizedListings) {
      const existing = existingListings.get(listing.key);
      statements.upsertListing.run(
        listing.key,
        claimId,
        listing.itemName,
        listing.side,
        listing.owner,
        listing.ownerEntityId,
        listing.itemId == null ? null : String(listing.itemId),
        listing.itemType == null ? null : String(listing.itemType),
        listing.quantity,
        listing.price,
        listing.totalValue,
        listing.tier == null ? null : String(listing.tier),
        listing.rarity,
        existing?.first_seen ?? listing.listedAt ?? now,
        now,
        JSON.stringify(listing.raw),
      );
      if (!existing) {
        addMarketEvent(claimId, "new_listing", listing, now);
        addActivity(claimId, "market_new_listing", `New market listing: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`, now, listing);
      } else if (listing.quantity < toNumber(existing.quantity)) {
        const { soldQuantity, trade } = partialResults.get(listing.key);
        const partial = { ...listing, quantity: soldQuantity, totalValue: soldQuantity * listing.price, tradeId: trade?.id ?? null, raw: trade ?? listing.raw };
        if (trade) for (const fill of trade.matchedTrades ?? [trade]) insertConfirmedMarketTrade(claimId, fill, listing, now);
        addMarketEvent(claimId, trade ? "partial_sale" : "partial_quantity_drop", partial, now);
        addActivity(claimId, trade ? "market_sale" : "market_quantity_drop", `${trade ? "Partial sale" : "Quantity dropped"}: ${listing.itemName} x${soldQuantity.toLocaleString()} at ${listing.price.toLocaleString()}g`, now, partial);
      }
    }

    for (const { active, listing } of closedCandidates) {
      const trade = closedResults.get(listing.key)?.trade;
      const eventType = trade ? "sale" : "removed_or_cancelled";
      const closedListing = { ...listing, tradeId: trade?.id ?? null, raw: trade ?? listing.raw };
      if (trade) for (const fill of trade.matchedTrades ?? [trade]) insertConfirmedMarketTrade(claimId, fill, listing, now);
      statements.markListingClosed.run(eventType, now, now, active.listing_key);
      addMarketEvent(claimId, eventType, closedListing, now);
      addActivity(claimId, trade ? "market_sale" : "market_removed_or_cancelled", `${trade ? "Sold" : "Removed/cancelled"}: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`, now, closedListing);
    }

    applyPendingMarketConfirmations(claimId, now, pendingConfirmations);
    if (payload.crafts) pendingProductionNotifications = recordProductionJobs(claimId, payload.crafts, now);

    db.exec("COMMIT");
    await deliverProductionNotifications(pendingProductionNotifications);
    return { ok: true, capturedAt: now };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function fetchBitjita(pathname) {
  const url = new URL(`${process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com"}/api${pathname}`);
  const response = await fetch(url, { headers: { accept: "application/json", "x-app-identifier": appIdentifier } });
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
  return response.json();
}

async function fetchAllClaimListings(claimId) {
  const base = `/claims/${claimId}/market/listings?limit=200`;
  const first = await fetchBitjita(`${base}&page=1`);
  const totalPages = Math.max(toNumber(first.totalPages) || 1, 1);
  const pages = totalPages > 1
    ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => fetchBitjita(`${base}&page=${index + 2}`)))
    : [];
  return { ...first, listings: [first, ...pages].flatMap((page) => unwrap(page, "listings", [])), page: 1, totalPages };
}

function marketTradeBackfillKey(claimId, playerId) {
  return `market_trade_backfill:${claimId}:${playerId}`;
}

async function fetchOrderTrades(playerId, orderEntityId) {
  const trades = [];
  let offset = 0;
  while (true) {
    const payload = await fetchBitjita(`/market/player/${playerId}/trades?type=sell&limit=200&offset=${offset}&orderEntityId=${encodeURIComponent(String(orderEntityId))}`);
    const page = unwrap(payload, "trades", []);
    trades.push(...page);
    if (page.length < 200) break;
    offset += page.length;
  }
  return trades;
}

async function fetchMemberSettlementSellTrades(claimId, member) {
  const playerId = String(member.playerEntityId ?? member.entityId ?? "").trim();
  if (!playerId) return null;
  const key = marketTradeBackfillKey(claimId, playerId);
  const isBackfilled = statements.getSetting.get(key)?.value === "complete";
  const claimOrders = [];
  let offset = 0;
  while (true) {
    const payload = await fetchBitjita(`/market/player/${playerId}/history?type=sell&status=COMPLETED&limit=200&offset=${offset}`);
    const page = unwrap(payload, "sellOrderHistory", []);
    claimOrders.push(...page.filter((order) => String(order.claimEntityId ?? "") === String(claimId)));
    if (isBackfilled || page.length < 200 || offset + page.length >= toNumber(payload.totalSellOrders)) break;
    offset += page.length;
  }
  const tradePages = await mapWithConcurrency(claimOrders, 3, (order) => fetchOrderTrades(playerId, order.entityId));
  return { key, member, trades: tradePages.flat() };
}

function tradeOccurredAt(trade, importedAt) {
  const parsed = new Date(String(trade.createdAt ?? ""));
  return Number.isNaN(parsed.getTime()) ? importedAt : parsed.toISOString();
}

async function importMemberSellTrades(claimId, members) {
  const uniqueMembers = [...new Map(members
    .filter((member) => member.playerEntityId ?? member.entityId)
    .map((member) => [String(member.playerEntityId ?? member.entityId), member])).values()];
  const imports = await mapWithConcurrency(uniqueMembers, 3, async (member) => {
    try {
      return await fetchMemberSettlementSellTrades(claimId, member);
    } catch (error) {
      console.warn(`BitCraft market trade import failed for ${member.userName ?? member.playerEntityId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });
  const importedAt = new Date().toISOString();
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const result of imports.filter(Boolean)) {
      for (const trade of result.trades) {
        inserted += insertConfirmedMarketTrade(claimId, trade, { owner: result.member.userName ?? result.member.username }, importedAt);
      }
      statements.upsertSetting.run(result.key, "complete", importedAt);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return inserted;
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function collectStorageActivity(claimId, inventories) {
  const buildings = unwrap(inventories, "buildings", []).filter((building) => building.entityId && !isDeployableStorage(building));
  const failures = [];
  const responses = await mapWithConcurrency(buildings, 4, async (building) => {
    try {
      return { building, payload: await fetchBitjita(`/logs/storage?buildingEntityId=${building.entityId}&limit=40`) };
    } catch (error) {
      failures.push(`${storageContainerName(building)}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const result of responses.filter(Boolean)) {
      const items = [...(result.payload.items ?? []), ...(result.payload.cargos ?? [])];
      const catalog = new Map(items.map((item) => [String(item.id), item]));
      const containerName = storageContainerName(result.building);
      for (const log of result.payload.logs ?? []) {
        const event = log.data ?? {};
        const eventAction = String(event.type ?? "storage").replaceAll("_", " ").toLowerCase();
        const action = eventAction.includes("withdraw") ? "withdrew" : eventAction.includes("deposit") ? "deposited" : eventAction;
        const item = catalog.get(String(event.item_id));
        const actorName = String(log.subjectName ?? "Member");
        const summary = `${actorName} ${action} ${toNumber(event.quantity).toLocaleString()} ${item?.name ?? `item #${event.item_id ?? "?"}`} ${action === "withdrew" ? "from" : "to"} ${containerName}`;
        const metadata = {
          actorName,
          containerName,
          buildingId: String(result.building.entityId),
          itemName: item?.name ?? null,
          quantity: toNumber(event.quantity),
        };
        inserted += Number(statements.insertSourcedActivity.run(
          claimId,
          "storage",
          summary,
          log.timestamp ?? new Date().toISOString(),
          JSON.stringify(metadata),
          `storage:${result.building.entityId}:${log.id ?? `${log.timestamp}:${event.type}:${event.item_id}:${event.quantity}:${actorName}`}`,
        ).changes);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { requested: buildings.length, inserted, failures };
}

async function fetchCachedClaimDetail(claimId) {
  const cached = claimDetailCache.get(String(claimId));
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchBitjita(`/claims/${claimId}`);
  claimDetailCache.set(String(claimId), { value, expiresAt: Date.now() + 10 * 60 * 1000 });
  return value;
}

async function fetchAllRegionClaims(regionId) {
  const base = `/claims?regionId=${encodeURIComponent(regionId)}&limit=100&sort=supplies&order=desc`;
  const first = await fetchBitjita(`${base}&page=1`);
  const totalPages = Math.max(Math.ceil(toNumber(first.count) / 100), 1);
  const pages = totalPages > 1
    ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => fetchBitjita(`${base}&page=${index + 2}`)))
    : [];
  const claims = [first, ...pages].flatMap((page) => unwrap(page, "claims", []));
  const details = await mapWithConcurrency(claims, 8, async (claim) => {
    try {
      return await fetchCachedClaimDetail(claim.entityId);
    } catch {
      return null;
    }
  });
  return {
    ...first,
    claims: claims.map((claim, index) => {
      const detail = details[index];
      return detail ? { ...claim, ...(detail.claim ?? detail) } : claim;
    }),
  };
}

let snapshotQueue = Promise.resolve();

function enqueueSnapshot(payload) {
  const queued = snapshotQueue.then(() => recordSnapshot(payload));
  snapshotQueue = queued.catch(() => undefined);
  return queued;
}

async function collectServerSnapshot(force = false) {
  if ((!serverPollingEnabled && !force) || pollStatus.running) return;
  pollStatus.running = true;
  pollStatus.lastAttemptAt = new Date().toISOString();
  try {
    const { claimId } = getSettings();
    const [claimPayload, membersPayload, buildingsPayload, inventoriesPayload, market, craftsPayload] = await Promise.all([
      fetchBitjita(`/claims/${claimId}`),
      fetchBitjita(`/claims/${claimId}/members`),
      fetchBitjita(`/claims/${claimId}/buildings`),
      fetchBitjita(`/claims/${claimId}/inventories`),
      fetchAllClaimListings(claimId),
      fetchBitjita(`/crafts?claimEntityId=${claimId}&completed=false`).catch(() => ({ craftResults: [] })),
    ]);
    const claim = claimPayload.claim ?? claimPayload;
    const members = unwrap(membersPayload, "members", []);
    const buildings = unwrap(buildingsPayload, "buildings", []);
    await sendScheduledSupplyReportIfDue(claim).catch((error) => console.warn(`Discord supply report failed: ${error instanceof Error ? error.message : String(error)}`));
    await enqueueSnapshot({
      claimId,
      claim,
      membersCount: members.length,
      buildingsCount: buildings.length,
      market,
      crafts: craftsPayload,
      source: "server_poll",
    });
    pollStatus.storageLastAttemptAt = new Date().toISOString();
    const storageResult = await collectStorageActivity(claimId, inventoriesPayload);
    pollStatus.storageRequests = storageResult.requested;
    pollStatus.storageInserted = storageResult.inserted;
    pollStatus.storageLastError = storageResult.failures.length ? storageResult.failures.join("; ") : null;
    pollStatus.storageLastSuccessAt = new Date().toISOString();
    await importMemberSellTrades(claimId, members);
    pollStatus.lastSuccessAt = new Date().toISOString();
    pollStatus.lastError = null;
  } catch (error) {
    pollStatus.lastError = error instanceof Error ? error.message : String(error);
    console.error(`BitCraft snapshot poll failed: ${pollStatus.lastError}`);
  } finally {
    pollStatus.running = false;
  }
}

function marketHistory(claimId, limit, owner = "") {
  const selectedOwner = String(owner ?? "").trim();
  const ownerClause = selectedOwner ? " AND lower(COALESCE(owner, '')) = lower(?)" : "";
  const args = selectedOwner ? [claimId, selectedOwner] : [claimId];
  const tradeOwnerClause = selectedOwner ? " AND lower(COALESCE(seller_username, '')) = lower(?)" : "";
  const tradeArgs = selectedOwner ? [claimId, selectedOwner] : [claimId];
  const eventLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const liveListings = db.prepare(`SELECT listing_key, item_name, quantity, price, total_value, owner, owner_entity_id, item_id, item_type, tier, rarity, side, first_seen, last_seen, raw_json FROM market_listings WHERE claim_id = ? AND status = 'active'${ownerClause}`).all(...args);
  const events = db.prepare(`SELECT * FROM market_events WHERE claim_id = ?${ownerClause} ORDER BY occurred_at DESC, id DESC LIMIT ?`).all(...args, eventLimit)
    .map((event) => event.event_type === "sold_or_removed" ? { ...event, event_type: "removed_or_cancelled" } : event);
  const sales = db.prepare(`
    SELECT trade_id AS id, 'sale' AS event_type, order_entity_id AS listing_key, item_name, seller_username AS owner,
      quantity, unit_price AS price, total_price AS total_value, tier, rarity, occurred_at, raw_json
    FROM market_trades
    WHERE claim_id = ?${tradeOwnerClause}
    ORDER BY occurred_at DESC, trade_id DESC
    LIMIT ?
  `).all(...tradeArgs, eventLimit);
  const topItems = db.prepare(`
    SELECT item_name AS itemName, COUNT(*) AS salesCount, SUM(quantity) AS unitsSold, SUM(total_price) AS totalValue,
      SUM(total_price) / NULLIF(SUM(quantity), 0) AS avgUnitPrice, MAX(occurred_at) AS lastSoldAt
    FROM market_trades
    WHERE claim_id = ?${tradeOwnerClause}
    GROUP BY item_name
    ORDER BY unitsSold DESC, totalValue DESC
    LIMIT 20
  `).all(...tradeArgs);
  const daily = db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS salesCount, SUM(quantity) AS unitsSold, SUM(total_price) AS totalValue
    FROM market_trades
    WHERE claim_id = ?${tradeOwnerClause}
    GROUP BY day
    ORDER BY day DESC
    LIMIT 30
  `).all(...tradeArgs).reverse();
  const lifecycleTotals = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'new_listing' THEN 1 ELSE 0 END) AS newListings,
      SUM(CASE WHEN event_type IN ('removed_or_cancelled', 'sold_or_removed') THEN 1 ELSE 0 END) AS removedOrCancelled,
      SUM(CASE WHEN event_type IN ('partial_quantity_drop') THEN 1 ELSE 0 END) AS unconfirmedQuantityDrops
    FROM market_events
    WHERE claim_id = ?${ownerClause}
  `).get(...args);
  const tradeTotals = db.prepare(`
    SELECT COUNT(*) AS confirmedSales, SUM(quantity) AS confirmedUnits, SUM(total_price) AS trackedValue
    FROM market_trades
    WHERE claim_id = ?${tradeOwnerClause}
  `).get(...tradeArgs);
  const totals = { ...lifecycleTotals, ...tradeTotals };
  const pending = db.prepare(`
    SELECT * FROM market_events
    WHERE claim_id = ? AND event_type = 'partial_quantity_drop' AND trade_id IS NULL${ownerClause}
    ORDER BY occurred_at DESC
    LIMIT 30
  `).all(...args);
  return { liveListings, events, sales, topItems, daily, totals, pending };
}

function resolveMarketEvent(body) {
  const id = Number(body.id);
  const claimId = String(body.claimId ?? "");
  if (!id || !claimId) throw new Error("Missing market event id or claim id");
  const event = db.prepare("SELECT * FROM market_events WHERE id = ? AND claim_id = ?").get(id, claimId);
  if (!event) throw new Error("Market event not found");
  if (event.event_type !== "partial_quantity_drop") throw new Error("Only partial quantity drops can be manually resolved");
  const raw = JSON.stringify({ resolvedAs: "quantity_cancelled", resolvedAt: new Date().toISOString(), previous: safeJson(event.raw_json) });
  statements.resolveMarketEvent.run("quantity_cancelled", raw, id, claimId);
  addActivity(claimId, "market_quantity_cancelled", `Marked cancelled: ${event.item_name} x${toNumber(event.quantity).toLocaleString()} at ${toNumber(event.price).toLocaleString()}g`, new Date().toISOString(), { id, itemName: event.item_name, quantity: event.quantity, price: event.price, owner: event.owner });
  return { ok: true };
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function databaseStatus() {
  const counts = Object.fromEntries(["snapshots", "market_listings", "market_events", "market_trades", "activity_events", "analytics_events"].map((table) => [
    table,
    toNumber(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()?.count),
  ]));
  const discordLastDelivery = safeJson(statements.getSetting.get("discord_last_delivery_json")?.value, { status: "none" });
  const discordDeliveryLog = statements.recentDiscordDeliveries.all(80).map((row) => ({
    ...row,
    metadata: safeJson(row.metadata_json, {}),
    response: row.response_json ? safeJson(row.response_json, {}) : null,
  }));
  return {
    version: appVersion,
    environment: isProduction ? "production" : "development",
    storageLabel: isProduction ? "Production persistent storage" : "Local development storage",
    databaseSize: existsSync(databasePath) ? statSync(databasePath).size : 0,
    counts,
    polling: pollStatus,
    discord: { lastDelivery: discordLastDelivery, deliveryLog: discordDeliveryLog },
    settings: getSettings(),
  };
}

async function apiDiagnostics() {
  const { claimId } = getSettings();
  const checks = [
    ["Settlement", `/claims/${claimId}`],
    ["Members", `/claims/${claimId}/members`],
    ["Structures", `/claims/${claimId}/buildings`],
    ["Inventory", `/claims/${claimId}/inventories`],
    ["Market", `/claims/${claimId}/market/listings?limit=5`],
    ["Production", `/crafts?claimEntityId=${claimId}&completed=false`],
  ];
  const timedCheck = async (label, endpoint) => {
    const started = Date.now();
    try {
      const value = await fetchBitjita(endpoint);
      return { result: { label, endpoint, ok: true, durationMs: Date.now() - started, checkedAt: new Date().toISOString() }, value };
    } catch (error) {
      return { result: { label, endpoint, ok: false, durationMs: Date.now() - started, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }, value: null };
    }
  };
  const core = await Promise.all(checks.map(([label, endpoint]) => timedCheck(label, endpoint)));
  const inventories = core.find((check) => check.result.label === "Inventory")?.value;
  const storageBuildings = unwrap(inventories, "buildings", []).filter((building) => building.entityId && !isDeployableStorage(building));
  const storage = await mapWithConcurrency(storageBuildings, 4, (building) => timedCheck(`Storage: ${storageContainerName(building)}`, `/logs/storage?buildingEntityId=${building.entityId}&limit=40`));
  return [...core, ...storage].map((check) => check.result);
}

function csvValue(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function sendText(res, status, text, contentType, headers = {}) {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store", ...headers });
  res.end(text);
}

function sendBinary(res, status, content, contentType, headers = {}) {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-cache", ...headers });
  res.end(content);
}

const brandingFormats = {
  "image/png": { extension: ".png", contentType: "image/png" },
  "image/jpeg": { extension: ".jpg", contentType: "image/jpeg" },
  "image/webp": { extension: ".webp", contentType: "image/webp" },
};

function validImageBytes(contentType, bytes) {
  if (contentType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  return false;
}

async function saveBrandingAsset(type, dataUrl) {
  if (!["logo", "favicon"].includes(type)) throw new Error("Unknown branding asset type");
  const match = String(dataUrl ?? "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !brandingFormats[match[1]]) throw new Error("Use a PNG, JPG or WebP image");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error("Image must be smaller than 1 MB");
  if (!validImageBytes(match[1], bytes)) throw new Error("Image content does not match its declared file type");
  const format = brandingFormats[match[1]];
  const fileName = `${type}${format.extension}`;
  for (const possible of Object.values(brandingFormats).map((candidate) => path.join(brandingDir, `${type}${candidate.extension}`))) {
    if (possible !== path.join(brandingDir, fileName) && existsSync(possible)) unlinkSync(possible);
  }
  await writeFile(path.join(brandingDir, fileName), bytes);
  const current = getSettings().branding;
  const branding = {
    ...current,
    [type]: { fileName, contentType: format.contentType, updatedAt: new Date().toISOString(), url: `/api/local/branding/${type}` },
  };
  statements.upsertSetting.run("branding_json", JSON.stringify(branding), new Date().toISOString());
  return branding;
}

function brandingAsset(type) {
  const asset = getSettings().branding?.[type];
  if (!asset?.fileName) return null;
  const filePath = path.join(brandingDir, path.basename(asset.fileName));
  if (!existsSync(filePath)) return null;
  return { ...asset, filePath };
}

function backupNames() {
  return existsSync(backupDir) ? readdirSync(backupDir)
    .filter((name) => /^bitcraft-local-\d{4}-\d{2}-\d{2}T[\d-]+Z\.sqlite$/.test(name))
    .map((name) => {
      const info = statSync(path.join(backupDir, name));
      return { name, size: info.size, createdAt: info.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
}

function createBackup() {
  const name = `bitcraft-local-${new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z")}.sqlite`;
  const filePath = path.join(backupDir, name);
  db.exec(`VACUUM INTO '${filePath.replaceAll("'", "''")}'`);
  const info = statSync(filePath);
  return { name, size: info.size, createdAt: info.mtime.toISOString() };
}

async function readRawBody(req, limit = 1500000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  return JSON.parse((await readRawBody(req)).toString("utf8") || "{}");
}

const discordCommands = [
  { name: "supplies", description: "Show settlement supplies, upkeep and runway." },
  { name: "online", description: "Show which settlement members are online." },
  {
    name: "crafts",
    description: "List current settlement crafts.",
    options: [{ type: 3, name: "skill", description: "Optional profession/skill filter", required: false }],
  },
  {
    name: "price",
    description: "Look up recent BitJita sale pricing for an item.",
    options: [
      { type: 3, name: "item", description: "Item name", required: true, autocomplete: true },
      { type: 4, name: "region", description: "Region number, defaults to settlement region", required: false },
    ],
  },
];

function discordOption(interaction, name) {
  return interaction?.data?.options?.find((option) => option.name === name)?.value;
}

function verifyDiscordInteraction(req, rawBody, publicKeyHex) {
  const signature = String(req.headers["x-signature-ed25519"] ?? "");
  const timestamp = String(req.headers["x-signature-timestamp"] ?? "");
  if (!signature || !timestamp || !/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false;
  try {
    const spkiPrefix = "302a300506032b6570032100";
    const key = createPublicKey({ key: Buffer.from(`${spkiPrefix}${publicKeyHex}`, "hex"), format: "der", type: "spki" });
    return verify(null, Buffer.concat([Buffer.from(timestamp), rawBody]), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

function discordResponse(content, options = {}) {
  const data = {
    flags: options.ephemeral ? 64 : undefined,
    allowed_mentions: { parse: [] },
  };
  if (options.embeds) data.embeds = options.embeds;
  else data.content = String(content).slice(0, 1900);
  return {
    type: 4,
    data,
  };
}

function discordCommandEmbed(title, description, fields = [], color = 0xf0c64f) {
  return {
    author: { name: "Timbersteel Trade" },
    title,
    description,
    color,
    fields: fields.slice(0, 10),
    timestamp: new Date().toISOString(),
    footer: { text: "BitCraft settlement monitor" },
  };
}

function discordEmbedResponse(embed, options = {}) {
  return discordResponse("", { ...options, embeds: [embed] });
}

async function handleDiscordInteraction(req) {
  const rawBody = await readRawBody(req, 1000000);
  const settings = getDiscordSettingsRaw();
  if (!settings.publicKey || !verifyDiscordInteraction(req, rawBody, settings.publicKey)) {
    return { status: 401, body: { error: "Invalid Discord request signature" } };
  }
  const interaction = JSON.parse(rawBody.toString("utf8") || "{}");
  if (interaction.type === 1) return { status: 200, body: { type: 1 } };
  if (interaction.type === 4) return { status: 200, body: await discordAutocomplete(interaction) };
  if (interaction.type !== 2) return { status: 200, body: discordResponse("Unsupported Discord interaction.", { ephemeral: true }) };
  return { status: 200, body: await runDiscordCommand(interaction) };
}

async function discordAutocomplete(interaction) {
  const focused = interaction?.data?.options?.find((option) => option.focused);
  if (interaction?.data?.name !== "price" || focused?.name !== "item") return { type: 8, data: { choices: [] } };
  const query = String(focused.value ?? "").trim();
  if (query.length < 2) return { type: 8, data: { choices: [] } };
  try {
    const payload = await fetchBitjita(`/market?search=${encodeURIComponent(query)}`);
    const entries = unwrap(payload, "items", []).slice(0, 20);
    return { type: 8, data: { choices: entries.map((item) => ({ name: String(item.name ?? item.itemName ?? "Item").slice(0, 100), value: String(item.name ?? item.itemName ?? query).slice(0, 100) })) } };
  } catch {
    return { type: 8, data: { choices: [] } };
  }
}

async function runDiscordCommand(interaction) {
  try {
    const command = String(interaction.data?.name ?? "");
    if (command === "supplies") return discordEmbedResponse(await discordSuppliesCommand());
    if (command === "online") return discordEmbedResponse(await discordOnlineCommand());
    if (command === "crafts") return discordEmbedResponse(await discordCraftsCommand(String(discordOption(interaction, "skill") ?? "")));
    if (command === "price") return discordEmbedResponse(await discordPriceCommand(String(discordOption(interaction, "item") ?? ""), discordOption(interaction, "region")));
    return discordResponse("Unknown command.", { ephemeral: true });
  } catch (error) {
    return discordResponse(`Command failed: ${error instanceof Error ? error.message : String(error)}`, { ephemeral: true });
  }
}

async function discordSuppliesCommand() {
  const { claimId } = getSettings();
  const payload = await fetchBitjita(`/claims/${claimId}`);
  const claim = payload.claim ?? payload;
  return discordSupplyEmbed(claim);
}

async function discordOnlineCommand() {
  const { claimId } = getSettings();
  const membersPayload = await fetchBitjita(`/claims/${claimId}/members`);
  const members = unwrap(membersPayload, "members", []);
  const details = await mapWithConcurrency(members.slice(0, 80), 8, async (member) => {
    const playerId = String(member.playerEntityId ?? member.entityId ?? "");
    if (!playerId) return null;
    try {
      const payload = await fetchBitjita(`/players/${playerId}`);
      const player = payload.player ?? payload;
      return { name: player.username ?? member.userName ?? member.username ?? playerId, online: Boolean(player.signedIn ?? player.online) };
    } catch {
      return { name: member.userName ?? member.username ?? playerId, online: false };
    }
  });
  const online = details.filter((entry) => entry?.online);
  return discordCommandEmbed("Members Online", online.length ? `**${online.length}/${members.length}** settlement members are online.` : `No settlement members appear online right now.`, [
    { name: "Online", value: online.length ? online.map((entry) => entry.name).join(", ").slice(0, 1024) : "None", inline: false },
    { name: "Tracked members", value: String(members.length), inline: true },
  ], online.length ? 0x4ee28a : 0x838e9e);
}

async function discordCraftsCommand(skillFilter = "") {
  const { claimId } = getSettings();
  const payload = await fetchBitjita(`/crafts?claimEntityId=${claimId}&completed=false`);
  const filter = skillFilter.trim().toLowerCase();
  const jobs = unwrap(payload, "craftResults", [])
    .filter((job) => !filter || JSON.stringify(job.levelRequirements ?? job.experiencePerProgress ?? "").toLowerCase().includes(filter) || String(job.recipeName ?? "").toLowerCase().includes(filter))
    .slice(0, 8);
  if (!jobs.length) return discordCommandEmbed("Active Crafts", filter ? `No active settlement crafts matched **${skillFilter}**.` : "No active settlement crafts found.", [], 0x838e9e);
  return discordCommandEmbed("Active Crafts", `${jobs.length} craft${jobs.length === 1 ? "" : "s"}${filter ? ` matching **${skillFilter}**` : ""}`, jobs.map((job) => {
    const remaining = toNumber(job.remainingCraftWork ?? job.actionsRemaining ?? job.effortRemaining ?? job.remainingEffort);
    return {
      name: craftDisplayName(job, payload).slice(0, 256),
      value: `${job.buildingName ? `Structure: ${job.buildingName}\n` : ""}${remaining ? `Effort left: ${remaining.toLocaleString()}` : "Effort left: unknown"}`.slice(0, 1024),
      inline: false,
    };
  }), 0x65b7fa);
}

async function discordPriceCommand(itemName, regionOption) {
  const query = itemName.trim();
  if (query.length < 2) throw new Error("Enter an item name.");
  const { claimId } = getSettings();
  const claimPayload = await fetchBitjita(`/claims/${claimId}`).catch(() => ({}));
  const regionId = String(regionOption ?? (claimPayload.claim ?? claimPayload)?.regionId ?? "").trim();
  const searchPayload = await fetchBitjita(`/market?search=${encodeURIComponent(query)}`);
  const item = unwrap(searchPayload, "items", []).find((candidate) => String(candidate.name ?? candidate.itemName ?? "").toLowerCase() === query.toLowerCase()) ?? unwrap(searchPayload, "items", [])[0];
  if (!item) return discordCommandEmbed("Price Finder", `No market item found for **${query}**.`, [], 0x838e9e);
  const itemId = item.id ?? item.itemId;
  const itemType = item.itemType ?? item.type ?? 0;
  const historyPath = `/market/items/${encodeURIComponent(String(itemId))}/price-history?bucket=1%20day&limit=30${regionId ? `&regionId=${encodeURIComponent(regionId)}` : ""}`;
  const history = await fetchBitjita(historyPath);
  const buckets = unwrap(history, "buckets", []);
  const avg = (days) => {
    const selected = buckets.slice(-days).filter((bucket) => toNumber(bucket.quantity ?? bucket.unitsSold ?? bucket.volume));
    const totalValue = selected.reduce((sum, bucket) => sum + toNumber(bucket.totalPrice ?? bucket.totalValue ?? bucket.value), 0);
    const quantity = selected.reduce((sum, bucket) => sum + toNumber(bucket.quantity ?? bucket.unitsSold ?? bucket.volume), 0);
    return quantity ? Math.round(totalValue / quantity) : 0;
  };
  const a1 = avg(1);
  const a7 = avg(7);
  const a30 = avg(30);
  const suggested = a7 || a30 || a1;
  return discordCommandEmbed("Price Finder", `**${item.name ?? item.itemName}**${regionId ? ` pricing in **R${regionId}**` : ""}`, [
    { name: "24h average", value: a1 ? formatGold(a1) : "No sales", inline: true },
    { name: "7d average", value: a7 ? formatGold(a7) : "No sales", inline: true },
    { name: "30d average", value: a30 ? formatGold(a30) : "No sales", inline: true },
    { name: "Suggested list price", value: suggested ? formatGold(suggested) : "Not enough sales data", inline: false },
    { name: "Item type", value: String(itemType), inline: true },
  ], suggested ? 0xf0c64f : 0x838e9e);
}

async function registerDiscordCommands() {
  const settings = getDiscordSettingsRaw();
  if (!settings.botToken || !settings.applicationId) throw new Error("Discord bot token and application ID are required");
  const route = settings.guildId
    ? `/applications/${settings.applicationId}/guilds/${settings.guildId}/commands`
    : `/applications/${settings.applicationId}/commands`;
  const response = await fetch(`https://discord.com/api/v10${route}`, {
    method: "PUT",
    headers: { authorization: `Bot ${settings.botToken}`, "content-type": "application/json" },
    body: JSON.stringify(discordCommands),
  });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  });
  res.end(json);
}

function mimeType(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function serveBuiltFrontend(url, method, res) {
  if (!serveFrontend || !["GET", "HEAD"].includes(method ?? "")) return false;
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const assetPath = path.resolve(distDir, requestedPath);
  const isDistPath = assetPath === distDir || assetPath.startsWith(`${distDir}${path.sep}`);
  const candidate = isDistPath && existsSync(assetPath) && statSync(assetPath).isFile() ? assetPath : path.join(distDir, "index.html");
  if (!existsSync(candidate)) {
    send(res, 503, { error: "Frontend build is missing. Run the production build before starting the server." });
    return true;
  }
  const content = await readFile(candidate);
  res.writeHead(200, {
    "content-type": mimeType(candidate),
    "cache-control": candidate.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (method === "HEAD") return res.end();
  res.end(content);
  return true;
}

async function proxyBitjita(url, res) {
  const upstream = new URL(process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com");
  upstream.pathname = `/api/${url.pathname.slice("/api/bitjita/".length)}`;
  upstream.search = url.search;
  const key = upstream.toString();
  const cached = upstreamCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.writeHead(cached.status, cached.headers);
    return res.end(cached.body);
  }
  const response = await fetch(upstream, {
    headers: { accept: "application/json", "x-app-identifier": appIdentifier },
  });
  const body = Buffer.from(await response.arrayBuffer());
  const headers = {
    "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
    "cache-control": response.headers.get("cache-control") ?? "no-cache",
  };
  if (response.ok) upstreamCache.set(key, { status: response.status, headers, body, expiresAt: Date.now() + 10000 });
  res.writeHead(response.status, headers);
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method === "GET" && url.pathname === "/api/local/health") return send(res, 200, { ok: true, polling: pollStatus });
    if (req.method === "GET" && url.pathname.startsWith("/api/bitjita/")) return proxyBitjita(url, res);
    if (req.method === "GET" && url.pathname === "/api/local/config") return send(res, 200, getSettings());
    if (req.method === "POST" && url.pathname === "/api/discord/interactions") {
      const result = await handleDiscordInteraction(req);
      return send(res, result.status, result.body);
    }
    if (req.method === "POST" && url.pathname === "/api/local/analytics/event") {
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin analytics event rejected" });
      try {
        return send(res, 201, recordAnalyticsEvent(await readJson(req), req));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return send(res, message === "Analytics consent is required" ? 403 : 400, { error: message });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/region/claims") {
      const regionId = String(url.searchParams.get("regionId") ?? "").trim();
      if (!/^\d+$/.test(regionId)) return send(res, 400, { error: "Region id is required" });
      const cached = regionCache.get(regionId);
      if (cached && cached.expiresAt > Date.now()) return send(res, 200, cached.value);
      const value = await fetchAllRegionClaims(regionId);
      regionCache.set(regionId, { expiresAt: Date.now() + 10 * 60 * 1000, value });
      return send(res, 200, value);
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/local/branding/")) {
      const type = url.pathname.slice("/api/local/branding/".length);
      const asset = brandingAsset(type);
      if (!asset) return send(res, 404, { error: "Brand asset not configured" });
      return sendBinary(res, 200, await readFile(asset.filePath), asset.contentType);
    }
    if (req.method === "GET" && url.pathname === "/api/local/admin/me") return send(res, 200, adminStatus(req));
    if (req.method === "POST" && url.pathname === "/api/local/admin/setup") {
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin administrator setup rejected" });
      if (toNumber(statements.adminCount.get()?.count) > 0) return send(res, 409, { error: "Admin user already exists" });
      const body = await readJson(req);
      if (isProduction && !adminSetupKey) return send(res, 503, { error: "Admin setup is disabled until ADMIN_SETUP_KEY is configured on the server" });
      if (isProduction && String(body.setupKey ?? "") !== adminSetupKey) return send(res, 403, { error: "Invalid server setup key" });
      const username = String(body.username ?? "admin").trim();
      if (!validAdminUsername(username)) return send(res, 400, { error: "Username must be 3-32 letters, numbers, underscores or hyphens" });
      const password = String(body.password ?? "");
      if (password.length < 12) return send(res, 400, { error: "Password must be at least 12 characters" });
      const createdAt = new Date().toISOString();
      const result = statements.insertAdmin.run(username, await hashPassword(password), createdAt);
      statements.updateLastLogin.run(createdAt, result.lastInsertRowid);
      audit({ id: result.lastInsertRowid, username }, "admin.setup", { username });
      const session = createSession(result.lastInsertRowid);
      return send(res, 200, adminStatus({ headers: { cookie: session.cookie } }), { "set-cookie": session.cookie });
    }
    if (req.method === "POST" && url.pathname === "/api/local/admin/login") {
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin administrator sign-in rejected" });
      const body = await readJson(req);
      const username = String(body.username ?? "admin").trim();
      const attemptKey = loginAttemptKey(req, username);
      if (loginBlocked(attemptKey)) return send(res, 429, { error: "Too many failed sign-in attempts. Try again in 15 minutes." });
      const user = statements.adminByUsername.get(username);
      const successful = Boolean(user && await verifyPassword(String(body.password ?? ""), user.password_hash));
      statements.insertLoginEvent.run(username, successful ? 1 : 0, new Date().toISOString(), requestAddress(req));
      if (!successful) {
        failedLogin(attemptKey);
        return send(res, 401, { error: "Invalid username or password" });
      }
      loginAttempts.delete(attemptKey);
      statements.updateLastLogin.run(new Date().toISOString(), user.id);
      audit(user, "admin.login");
      const session = createSession(user.id);
      return send(res, 200, adminStatus({ headers: { cookie: session.cookie } }), { "set-cookie": session.cookie });
    }
    if (req.method === "POST" && url.pathname === "/api/local/admin/logout") {
      const user = requireAdmin(req, res);
      if (!user || !requireAdminMutation(req, res, user)) return;
      audit(user, "admin.logout");
      return send(res, 200, { ok: true }, { "set-cookie": clearSession(req) });
    }
    if (url.pathname.startsWith("/api/local/admin/")) {
      const user = requireAdmin(req, res);
      if (!user) return;
      if (!requireAdminMutation(req, res, user)) return;
      if (req.method === "GET" && url.pathname === "/api/local/admin/status") return send(res, 200, databaseStatus());
      if (req.method === "POST" && url.pathname === "/api/local/admin/poll") {
        await collectServerSnapshot(true);
        audit(user, "data.poll");
        return send(res, 200, databaseStatus());
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/diagnostics") {
        const checks = await apiDiagnostics();
        audit(user, "diagnostics.run", { failures: checks.filter((check) => !check.ok).length });
        return send(res, 200, { checks });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/register-commands") {
        const commands = await registerDiscordCommands();
        audit(user, "discord.register_commands", { count: Array.isArray(commands) ? commands.length : 0 });
        return send(res, 200, { commands });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/test") {
        const body = await readJson(req);
        const kind = String(body.kind ?? "basic");
        await sendDiscordTestNotification(kind);
        audit(user, "discord.test_message", { kind });
        return send(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/settings") return send(res, 200, getSettings());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/settings") {
        const body = await readJson(req);
        const nextClaimId = String(body.claimId ?? "").trim();
        const nextSyncUrl = String(body.syncUrl ?? defaultSyncUrl).trim();
        if (!/^\d{8,}$/.test(nextClaimId)) return send(res, 400, { error: "Settlement ID must be a numeric BitCraft claim id" });
        if (!validSyncUrl(nextSyncUrl)) return send(res, 400, { error: "BitCraft Sync URL must be a https://bitcraftsync.app link" });
        const refreshSeconds = Number(body.refreshSeconds ?? 30);
        if (!Number.isInteger(refreshSeconds) || refreshSeconds < 15 || refreshSeconds > 300) return send(res, 400, { error: "Refresh interval must be between 15 and 300 seconds" });
        const defaultPage = String(body.defaultPage ?? "overview");
        if (!validPage(defaultPage)) return send(res, 400, { error: "Unknown default page" });
        const defaultRegion = String(body.defaultRegion ?? "").trim();
        if (defaultRegion && !/^\d+$/.test(defaultRegion)) return send(res, 400, { error: "Default region must be numeric or blank" });
        const snapshotRetentionDays = Number(body.snapshotRetentionDays ?? 365);
        if (!Number.isInteger(snapshotRetentionDays) || snapshotRetentionDays < 30 || snapshotRetentionDays > 3650) return send(res, 400, { error: "Retention must be between 30 and 3650 days" });
        const nextTheme = { ...defaultTheme, ...(body.theme ?? {}) };
        const toastSettings = {
          marketListings: body.toastSettings?.marketListings !== false,
          marketSales: body.toastSettings?.marketSales !== false,
          production: body.toastSettings?.production !== false,
        };
        const discordSettings = normalizeDiscordSettings(body.discord ?? {});
        const discordToken = String(body.discord?.botToken ?? "").trim();
        if (discordSettings.enabled) {
          if (!discordSettings.applicationId) return send(res, 400, { error: "Discord application ID is required when Discord is enabled" });
          if (!discordSettings.publicKey) return send(res, 400, { error: "Discord public key is required when Discord is enabled" });
          if (!discordSettings.channelId) return send(res, 400, { error: "Discord channel ID is required when Discord is enabled" });
        }
        const updatedAt = new Date().toISOString();
        statements.upsertSetting.run("claim_id", nextClaimId, updatedAt);
        statements.upsertSetting.run("bitcraft_sync_url", nextSyncUrl, updatedAt);
        statements.upsertSetting.run("theme_json", JSON.stringify(nextTheme), updatedAt);
        statements.upsertSetting.run("refresh_seconds", String(refreshSeconds), updatedAt);
        statements.upsertSetting.run("default_page", defaultPage, updatedAt);
        statements.upsertSetting.run("default_region", defaultRegion, updatedAt);
        statements.upsertSetting.run("snapshot_retention_days", String(snapshotRetentionDays), updatedAt);
        statements.upsertSetting.run("toast_json", JSON.stringify(toastSettings), updatedAt);
        statements.upsertSetting.run("discord_json", JSON.stringify(discordSettings), updatedAt);
        if (discordToken) statements.upsertSecret.run("discord_bot_token", discordToken, updatedAt);
        if (body.discord?.clearBotToken === true) statements.deleteSecret.run("discord_bot_token");
        audit(user, "settings.update", { claimId: nextClaimId, refreshSeconds, defaultPage, defaultRegion, snapshotRetentionDays, discordEnabled: discordSettings.enabled });
        void announceDiscordAppUpdateIfNeeded().catch((error) => console.warn(`Discord app update announcement failed: ${error instanceof Error ? error.message : String(error)}`));
        return send(res, 200, getSettings());
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/branding") {
        const body = await readJson(req);
        try {
          const branding = await saveBrandingAsset(String(body.type ?? ""), String(body.dataUrl ?? ""));
          audit(user, "branding.upload", { type: body.type });
          return send(res, 200, { branding });
        } catch (error) {
          return send(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (req.method === "DELETE" && url.pathname === "/api/local/admin/branding") {
        const type = String(url.searchParams.get("type") ?? "");
        if (!["logo", "favicon"].includes(type)) return send(res, 400, { error: "Unknown branding asset type" });
        const asset = brandingAsset(type);
        if (asset) unlinkSync(asset.filePath);
        const branding = { ...getSettings().branding };
        delete branding[type];
        statements.upsertSetting.run("branding_json", JSON.stringify(branding), new Date().toISOString());
        audit(user, "branding.delete", { type });
        return send(res, 200, { branding });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/users") {
        const users = db.prepare(`
          SELECT admin_users.id, admin_users.username, admin_users.active, admin_users.created_at, admin_users.last_login_at,
                 COUNT(admin_sessions.token_hash) AS sessions
          FROM admin_users LEFT JOIN admin_sessions ON admin_sessions.user_id = admin_users.id AND admin_sessions.expires_at > ?
          GROUP BY admin_users.id ORDER BY admin_users.username
        `).all(new Date().toISOString());
        return send(res, 200, { users });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/users") {
        const body = await readJson(req);
        const username = String(body.username ?? "").trim();
        const password = String(body.password ?? "");
        if (!validAdminUsername(username)) return send(res, 400, { error: "Username must be 3-32 letters, numbers, underscores or hyphens" });
        if (password.length < 12) return send(res, 400, { error: "Password must be at least 12 characters" });
        try {
          const result = statements.insertAdmin.run(username, await hashPassword(password), new Date().toISOString());
          audit(user, "user.create", { id: result.lastInsertRowid, username });
          return send(res, 201, { ok: true });
        } catch (error) {
          if (String(error).includes("UNIQUE")) return send(res, 409, { error: "That username is already in use" });
          throw error;
        }
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user/password") {
        const body = await readJson(req);
        const userId = Number(body.userId);
        const password = String(body.password ?? "");
        if (!userId || password.length < 12) return send(res, 400, { error: "Select a user and enter a password of at least 12 characters" });
        const target = db.prepare("SELECT id, username FROM admin_users WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Admin user not found" });
        statements.updatePassword.run(await hashPassword(password), userId);
        statements.deleteUserSessions.run(userId);
        audit(user, "user.password_reset", { id: target.id, username: target.username });
        return send(res, 200, { ok: true, signedOut: userId === user.id });
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user/status") {
        const body = await readJson(req);
        const userId = Number(body.userId);
        const active = Boolean(body.active);
        if (userId === user.id && !active) return send(res, 400, { error: "You cannot disable your current account" });
        const target = db.prepare("SELECT id, username FROM admin_users WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Admin user not found" });
        statements.updateAdminActive.run(active ? 1 : 0, userId);
        if (!active) statements.deleteUserSessions.run(userId);
        audit(user, "user.status", { id: target.id, username: target.username, active });
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/sessions/clear") {
        const body = await readJson(req);
        const userId = Number(body.userId ?? user.id);
        if (userId === user.id) {
          const token = parseCookies(req).bitcraft_admin_session;
          if (token) statements.deleteOtherSessions.run(user.id, tokenHash(token));
        } else {
          statements.deleteUserSessions.run(userId);
        }
        audit(user, "sessions.clear", { userId });
        return send(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/audit") {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);
        const auditLog = db.prepare("SELECT * FROM admin_audit_log ORDER BY occurred_at DESC, id DESC LIMIT ?").all(limit);
        const logins = db.prepare("SELECT * FROM admin_login_events ORDER BY occurred_at DESC, id DESC LIMIT ?").all(Math.min(limit, 100));
        return send(res, 200, { auditLog, logins });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/analytics") {
        return send(res, 200, analyticsDashboard(url.searchParams.get("days")));
      }
      if (req.method === "DELETE" && url.pathname === "/api/local/admin/analytics") {
        const removed = db.prepare("DELETE FROM analytics_events").run().changes;
        audit(user, "analytics.clear", { removed });
        return send(res, 200, { removed });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/tables") return send(res, 200, { tables: tableInfo() });
      if (req.method === "GET" && url.pathname === "/api/local/admin/table") {
        const table = url.searchParams.get("name") ?? "";
        return send(res, 200, tableQuery(table, Object.fromEntries(url.searchParams.entries())));
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/export") {
        const name = url.searchParams.get("name") ?? "";
        const format = url.searchParams.get("format") === "json" ? "json" : "csv";
        const result = tableQuery(name, Object.fromEntries(url.searchParams.entries()), true);
        if (format === "json") {
          return sendText(res, 200, JSON.stringify(result.rows, null, 2), "application/json; charset=utf-8", { "content-disposition": `attachment; filename="${name}.json"` });
        }
        const csv = [result.columns.map(csvValue).join(","), ...result.rows.map((row) => result.columns.map((column) => csvValue(row[column])).join(","))].join("\n");
        return sendText(res, 200, csv, "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="${name}.csv"` });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/backups") return send(res, 200, { backups: backupNames() });
      if (req.method === "POST" && url.pathname === "/api/local/admin/backups") {
        const backup = createBackup();
        audit(user, "backup.create", backup);
        return send(res, 201, { backup });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/backup") {
        const name = path.basename(String(url.searchParams.get("name") ?? ""));
        const backup = backupNames().find((entry) => entry.name === name);
        if (!backup) return send(res, 404, { error: "Backup not found" });
        return sendBinary(res, 200, await readFile(path.join(backupDir, name)), "application/vnd.sqlite3", { "content-disposition": `attachment; filename="${name}"` });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/maintenance/prune") {
        const retentionDays = getSettings().snapshotRetentionDays;
        const before = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
        const result = db.prepare("DELETE FROM snapshots WHERE captured_at < ?").run(before);
        audit(user, "maintenance.prune", { retentionDays, removed: result.changes });
        return send(res, 200, { removed: result.changes, before });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/local/snapshot") {
      if (isProduction) return send(res, 403, { error: "Browser snapshot collection is disabled in production" });
      return send(res, 200, await enqueueSnapshot(await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/market/history") {
      return send(res, 200, marketHistory(url.searchParams.get("claimId") ?? "", Number(url.searchParams.get("limit") ?? 100), url.searchParams.get("owner") ?? ""));
    }
    if (req.method === "POST" && url.pathname === "/api/local/market/event/resolve") {
      if (isProduction) {
        const user = requireAdmin(req, res);
        if (!user || !requireAdminMutation(req, res, user)) return;
      }
      return send(res, 200, resolveMarketEvent(await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/activity") {
      const claimId = url.searchParams.get("claimId") ?? "";
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 500), 1), 2000);
      const events = db.prepare("SELECT * FROM activity_events WHERE claim_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?").all(claimId, limit);
      const total = toNumber(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE claim_id = ?").get(claimId)?.count);
      return send(res, 200, { events, total });
    }
    if (!url.pathname.startsWith("/api/") && await serveBuiltFrontend(url, req.method, res)) return;
    send(res, 404, { error: "Not found" });
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.APP_PORT ?? process.env.LOCAL_API_PORT ?? 18430);
const host = process.env.APP_HOST ?? "127.0.0.1";
server.listen(port, host, () => {
  console.log(`BitCraft monitor server listening on http://${host}:${port}${serveFrontend ? " with production frontend" : ""}`);
  setTimeout(() => {
    void announceDiscordAppUpdateIfNeeded().catch((error) => console.warn(`Discord app update announcement failed: ${error instanceof Error ? error.message : String(error)}`));
  }, 5000);
  if (serverPollingEnabled) {
    console.log(`Server snapshot polling enabled every ${snapshotIntervalMs / 1000} seconds`);
    collectServerSnapshot();
    setInterval(collectServerSnapshot, snapshotIntervalMs);
  }
});
