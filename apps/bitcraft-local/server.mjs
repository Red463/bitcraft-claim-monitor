import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.BITCRAFT_LOCAL_DATA_DIR ?? path.join(root, "data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"));
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
  CREATE INDEX IF NOT EXISTS idx_market_events_claim_time ON market_events (claim_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_claim_time ON activity_events (claim_id, occurred_at DESC);
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

const defaultClaimId = "1369094286777412590";
const defaultSyncUrl = "https://bitcraftsync.app/s/MUFJw3#claims=1369094286777412590&players=1369094286756659093%2C576460752388321942%2C864691128512324120&shopping=i.2036617800%3A20&p.exc=1369094286756659093%3A1369094286764705296%2C1369094286756792917%3B864691128512324120%3A1369094286778153104%2C1369094286772328807%2C1369094286761962469%3B576460752388321942%3A1369094286783870822&crafts=1&crafts.pf=includedPlayers";
const bitcraftSyncVersion = "250";
let referenceMaterialsCache = null;
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

const statements = {
  latestSnapshot: db.prepare("SELECT * FROM snapshots WHERE claim_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1"),
  insertSnapshot: db.prepare(`
    INSERT INTO snapshots (claim_id, captured_at, supplies, treasury, members_count, buildings_count, market_count, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listingByKey: db.prepare("SELECT * FROM market_listings WHERE listing_key = ?"),
  activeListings: db.prepare("SELECT listing_key, item_name, quantity, price, total_value, owner, owner_entity_id, item_id, item_type, tier, rarity, side, raw_json FROM market_listings WHERE claim_id = ? AND status = 'active'"),
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
  insertActivity: db.prepare(`
    INSERT INTO activity_events (claim_id, event_type, summary, occurred_at, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `),
  getSetting: db.prepare("SELECT value FROM app_settings WHERE key = ?"),
  upsertSetting: db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `),
  adminCount: db.prepare("SELECT COUNT(*) AS count FROM admin_users"),
  adminByUsername: db.prepare("SELECT * FROM admin_users WHERE username = ?"),
  adminBySession: db.prepare(`
    SELECT admin_users.id, admin_users.username
    FROM admin_sessions
    JOIN admin_users ON admin_users.id = admin_sessions.user_id
    WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > ?
  `),
  insertAdmin: db.prepare("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)"),
  insertSession: db.prepare("INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"),
  deleteSession: db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?"),
  deleteExpiredSessions: db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?"),
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
    tradeId: row.tradeId ?? row.id ?? null,
    raw: row,
  };
}

function getSettings() {
  const theme = JSON.parse(statements.getSetting.get("theme_json")?.value ?? JSON.stringify(defaultTheme));
  return {
    claimId: statements.getSetting.get("claim_id")?.value ?? defaultClaimId,
    syncUrl: statements.getSetting.get("bitcraft_sync_url")?.value ?? defaultSyncUrl,
    theme,
  };
}

function validSyncUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "bitcraftsync.app";
  } catch {
    return false;
  }
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored).split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}

function tokenHash(token) {
  return scryptSync(token, "bitcraft-local-session", 64).toString("hex");
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

function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  statements.insertSession.run(tokenHash(token), userId, expiresAt.toISOString(), createdAt.toISOString());
  return {
    token,
    cookie: `bitcraft_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`,
  };
}

function clearSession(req) {
  const token = parseCookies(req).bitcraft_admin_session;
  if (token) statements.deleteSession.run(tokenHash(token));
  return "bitcraft_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function adminStatus(req) {
  const setupRequired = toNumber(statements.adminCount.get()?.count) === 0;
  const user = getSessionUser(req);
  return { setupRequired, authenticated: Boolean(user), user: user ? { id: user.id, username: user.username } : null };
}

function tableNames() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
}

function tableInfo() {
  return tableNames().map((name) => ({ name, rows: db.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get().count }));
}

function readTable(name, limit) {
  const allowed = new Set(tableNames());
  if (!allowed.has(name)) throw new Error("Unknown table");
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" LIMIT ?`).all(safeLimit);
}

function addActivity(claimId, eventType, summary, occurredAt, metadata = {}) {
  statements.insertActivity.run(claimId, eventType, summary, occurredAt, JSON.stringify(metadata));
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

async function findConfirmedTrade(listing, minQuantity = 1) {
  if (!listing.ownerEntityId) return null;
  const url = new URL(`${process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com"}/api/market/player/${listing.ownerEntityId}/trades`);
  url.searchParams.set("type", "sell");
  url.searchParams.set("limit", "50");
  url.searchParams.set("orderEntityId", listing.key);
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const trades = unwrap(payload, "trades", []);
    return trades.find((trade) => tradeMatchesListing(trade, listing) && toNumber(trade.quantity) >= minQuantity) ?? null;
  } catch {
    return null;
  }
}

async function reconcilePendingMarketEvents(claimId, now) {
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
    const nextType = event.event_type === "partial_quantity_drop" ? "partial_sale" : "sale";
    statements.confirmMarketEvent.run(nextType, trade.id ?? null, JSON.stringify(trade), event.id);
    addActivity(claimId, "market_sale_confirmed", `Confirmed sale: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`, now, { ...listing, tradeId: trade.id ?? null });
  }
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
  const claimId = String(payload.claimId ?? payload.claim?.entityId ?? "");
  if (!claimId) throw new Error("Missing claim id");

  const claim = payload.claim ?? {};
  const market = unwrap(payload.market, "listings", []);
  const membersCount = toNumber(payload.membersCount);
  const buildingsCount = toNumber(payload.buildingsCount);
  const marketCount = market.length;
  const supplies = toNumber(claim.supplies);
  const treasury = toNumber(claim.treasury);
  const previous = statements.latestSnapshot.get(claimId);

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
        if (before !== after) addActivity(claimId, type, summary, now, { before, after });
      }
    } else {
      addActivity(claimId, "baseline", "Baseline snapshot saved", now, { membersCount, buildingsCount, marketCount });
    }

    const seen = new Set();
    for (const listing of market.map(normalizeListing)) {
      seen.add(listing.key);
      const existing = statements.listingByKey.get(listing.key);
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
        existing?.first_seen ?? now,
        now,
        JSON.stringify(listing.raw),
      );
      if (!existing) {
        addMarketEvent(claimId, "new_listing", listing, now);
        addActivity(claimId, "market_new_listing", `New market listing: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`, now, listing);
      } else if (listing.quantity < toNumber(existing.quantity)) {
        const soldQuantity = toNumber(existing.quantity) - listing.quantity;
        const trade = await findConfirmedTrade(listing, soldQuantity);
        const partial = { ...listing, quantity: soldQuantity, totalValue: soldQuantity * listing.price, tradeId: trade?.id ?? null, raw: trade ?? listing.raw };
        addMarketEvent(claimId, trade ? "partial_sale" : "partial_quantity_drop", partial, now);
        addActivity(claimId, trade ? "market_sale" : "market_quantity_drop", `${trade ? "Partial sale" : "Quantity dropped"}: ${listing.itemName} x${soldQuantity.toLocaleString()} at ${listing.price.toLocaleString()}g`, now, partial);
      }
    }

    for (const active of statements.activeListings.all(claimId)) {
      if (seen.has(active.listing_key)) continue;
      const raw = JSON.parse(active.raw_json ?? "{}");
      const listing = {
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
      };
      const trade = await findConfirmedTrade(listing, listing.quantity);
      const eventType = trade ? "sale" : "removed_or_cancelled";
      const closedListing = { ...listing, tradeId: trade?.id ?? null, raw: trade ?? raw };
      statements.markListingClosed.run(eventType, now, now, active.listing_key);
      addMarketEvent(claimId, eventType, closedListing, now);
      addActivity(claimId, trade ? "market_sale" : "market_removed_or_cancelled", `${trade ? "Sold" : "Removed/cancelled"}: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`, now, closedListing);
    }

    await reconcilePendingMarketEvents(claimId, now);

    db.exec("COMMIT");
    return { ok: true, capturedAt: now };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function marketHistory(claimId, limit) {
  const events = db.prepare("SELECT * FROM market_events WHERE claim_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?").all(claimId, limit)
    .map((event) => event.event_type === "sold_or_removed" ? { ...event, event_type: "removed_or_cancelled" } : event);
  const topItems = db.prepare(`
    SELECT item_name AS itemName, COUNT(*) AS soldCount, SUM(total_value) AS totalValue, AVG(price) AS avgPrice, MAX(occurred_at) AS lastSoldAt
    FROM market_events
    WHERE claim_id = ? AND event_type IN ('sale', 'partial_sale')
    GROUP BY item_name
    ORDER BY soldCount DESC, totalValue DESC
    LIMIT 20
  `).all(claimId);
  const daily = db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS soldCount, SUM(total_value) AS totalValue
    FROM market_events
    WHERE claim_id = ? AND event_type IN ('sale', 'partial_sale')
    GROUP BY day
    ORDER BY day DESC
    LIMIT 30
  `).all(claimId).reverse();
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'new_listing' THEN 1 ELSE 0 END) AS newListings,
      SUM(CASE WHEN event_type IN ('sale', 'partial_sale') THEN 1 ELSE 0 END) AS confirmedSales,
      SUM(CASE WHEN event_type IN ('removed_or_cancelled', 'sold_or_removed') THEN 1 ELSE 0 END) AS removedOrCancelled,
      SUM(CASE WHEN event_type IN ('partial_quantity_drop') THEN 1 ELSE 0 END) AS unconfirmedQuantityDrops,
      SUM(CASE WHEN event_type IN ('sale', 'partial_sale') THEN total_value ELSE 0 END) AS trackedValue
    FROM market_events
    WHERE claim_id = ?
  `).get(claimId);
  const pending = db.prepare(`
    SELECT * FROM market_events
    WHERE claim_id = ? AND event_type = 'partial_quantity_drop' AND trade_id IS NULL
    ORDER BY occurred_at DESC
    LIMIT 30
  `).all(claimId);
  return { events, topItems, daily, totals, pending };
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

function safeJson(value) {
  try {
    return JSON.parse(value ?? "{}");
  } catch {
    return {};
  }
}

async function recipeRelevantMaterials() {
  if (referenceMaterialsCache && Date.now() - referenceMaterialsCache.loadedAt < 60 * 60 * 1000) {
    return referenceMaterialsCache.payload;
  }
  const origin = process.env.BITCRAFT_SYNC_ORIGIN ?? "https://bitcraftsync.app";
  const [itemResponse, recipesResponse] = await Promise.all([
    fetch(`${origin}/item.json?v=${bitcraftSyncVersion}`),
    fetch(`${origin}/recipes.json?v=${bitcraftSyncVersion}`),
  ]);
  if (!itemResponse.ok) throw new Error(`item.json HTTP ${itemResponse.status}`);
  if (!recipesResponse.ok) throw new Error(`recipes.json HTTP ${recipesResponse.status}`);
  const [items, recipes] = await Promise.all([itemResponse.json(), recipesResponse.json()]);
  const itemMap = new Map(items.map((item) => [String(item.id), item]));
  const materialTerms = [
    "plank", "brick", "leather", "hide", "ingot", "bar", "ore", "stone", "rock", "log", "wood", "stripped",
    "cloth", "fabric", "textile", "fiber", "flax", "cotton", "thread", "coal", "charcoal", "fuel", "clay",
    "limestone", "sand", "resin", "oil", "nail", "beam", "board", "treated", "untreated",
  ];
  const usage = new Map();
  for (const recipe of recipes) {
    const outputNames = (recipe.op ?? [])
      .map((output) => itemMap.get(String(output["i.id"]))?.n)
      .filter(Boolean)
      .slice(0, 3);
    for (const input of [...(recipe.ir ?? []), ...(recipe.cr ?? [])]) {
      const itemId = input["i.id"];
      if (itemId == null) continue;
      const key = String(itemId);
      const item = itemMap.get(key);
      if (!item) continue;
      const name = String(item.n ?? "");
      const haystack = name.toLowerCase();
      if (!materialTerms.some((term) => haystack.includes(term))) continue;
      const current = usage.get(key) ?? { itemId: key, name, tier: item.ti ?? null, usedInRecipes: 0, totalInputQuantity: 0, examples: new Map() };
      current.usedInRecipes += 1;
      current.totalInputQuantity += toNumber(input.q);
      for (const outputName of outputNames) current.examples.set(outputName, (current.examples.get(outputName) ?? 0) + 1);
      usage.set(key, current);
    }
  }
  const materials = [...usage.values()]
    .map((material) => ({
      itemId: material.itemId,
      name: material.name,
      tier: material.tier,
      usedInRecipes: material.usedInRecipes,
      totalInputQuantity: material.totalInputQuantity,
      examples: [...material.examples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }))
    .sort((a, b) => b.usedInRecipes - a.usedInRecipes || b.totalInputQuantity - a.totalInputQuantity)
    .slice(0, 160);
  const payload = { source: "bitcraftsync", version: bitcraftSyncVersion, loadedAt: new Date().toISOString(), materials };
  referenceMaterialsCache = { loadedAt: Date.now(), payload };
  return payload;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    ...headers,
  });
  res.end(json);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method === "GET" && url.pathname === "/api/local/config") return send(res, 200, getSettings());
    if (req.method === "GET" && url.pathname === "/api/local/admin/me") return send(res, 200, adminStatus(req));
    if (req.method === "POST" && url.pathname === "/api/local/admin/setup") {
      if (toNumber(statements.adminCount.get()?.count) > 0) return send(res, 409, { error: "Admin user already exists" });
      const body = await readJson(req);
      const password = String(body.password ?? "");
      if (password.length < 12) return send(res, 400, { error: "Password must be at least 12 characters" });
      const createdAt = new Date().toISOString();
      const result = statements.insertAdmin.run("admin", hashPassword(password), createdAt);
      const session = createSession(result.lastInsertRowid);
      return send(res, 200, adminStatus({ headers: { cookie: session.cookie } }), { "set-cookie": session.cookie });
    }
    if (req.method === "POST" && url.pathname === "/api/local/admin/login") {
      const body = await readJson(req);
      const user = statements.adminByUsername.get("admin");
      if (!user || !verifyPassword(String(body.password ?? ""), user.password_hash)) return send(res, 401, { error: "Invalid password" });
      const session = createSession(user.id);
      return send(res, 200, { authenticated: true, user: { id: user.id, username: user.username } }, { "set-cookie": session.cookie });
    }
    if (req.method === "POST" && url.pathname === "/api/local/admin/logout") {
      return send(res, 200, { ok: true }, { "set-cookie": clearSession(req) });
    }
    if (url.pathname.startsWith("/api/local/admin/")) {
      const user = requireAdmin(req, res);
      if (!user) return;
      if (req.method === "GET" && url.pathname === "/api/local/admin/settings") return send(res, 200, getSettings());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/settings") {
        const body = await readJson(req);
        const nextClaimId = String(body.claimId ?? "").trim();
        const nextSyncUrl = String(body.syncUrl ?? defaultSyncUrl).trim();
        if (!/^\d{8,}$/.test(nextClaimId)) return send(res, 400, { error: "Settlement ID must be a numeric BitCraft claim id" });
        if (!validSyncUrl(nextSyncUrl)) return send(res, 400, { error: "BitCraft Sync URL must be a https://bitcraftsync.app link" });
        const nextTheme = { ...defaultTheme, ...(body.theme ?? {}) };
        const updatedAt = new Date().toISOString();
        statements.upsertSetting.run("claim_id", nextClaimId, updatedAt);
        statements.upsertSetting.run("bitcraft_sync_url", nextSyncUrl, updatedAt);
        statements.upsertSetting.run("theme_json", JSON.stringify(nextTheme), updatedAt);
        return send(res, 200, getSettings());
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/tables") return send(res, 200, { tables: tableInfo() });
      if (req.method === "GET" && url.pathname === "/api/local/admin/table") {
        const table = url.searchParams.get("name") ?? "";
        return send(res, 200, { table, rows: readTable(table, url.searchParams.get("limit") ?? 100) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/local/snapshot") return send(res, 200, await recordSnapshot(await readJson(req)));
    if (req.method === "GET" && url.pathname === "/api/local/market/history") {
      return send(res, 200, marketHistory(url.searchParams.get("claimId") ?? "", Number(url.searchParams.get("limit") ?? 100)));
    }
    if (req.method === "POST" && url.pathname === "/api/local/market/event/resolve") {
      return send(res, 200, resolveMarketEvent(await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/activity") {
      const claimId = url.searchParams.get("claimId") ?? "";
      const limit = Number(url.searchParams.get("limit") ?? 200);
      const events = db.prepare("SELECT * FROM activity_events WHERE claim_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?").all(claimId, limit);
      return send(res, 200, { events });
    }
    if (req.method === "GET" && url.pathname === "/api/local/reference/materials") {
      return send(res, 200, await recipeRelevantMaterials());
    }
    send(res, 404, { error: "Not found" });
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.LOCAL_API_PORT ?? 18430);
server.listen(port, "127.0.0.1", () => {
  console.log(`BitCraft local database API listening on http://127.0.0.1:${port}`);
});
