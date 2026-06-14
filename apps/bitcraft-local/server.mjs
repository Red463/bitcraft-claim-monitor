import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, createHmac, createPublicKey, randomBytes, scrypt, timingSafeEqual, verify } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMemberPermissions } from "./shared/member-permissions.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "dist");
const isProduction = process.env.NODE_ENV === "production";
const isTestRuntime = process.env.BITCRAFT_TEST === "true" || process.env.NODE_ENV === "test";
const serveFrontend = isProduction || process.env.SERVE_STATIC === "true";
const adminSetupKey = process.env.ADMIN_SETUP_KEY ?? "";
const legacyAdminPasswordAuth = process.env.ENABLE_LEGACY_ADMIN_PASSWORD_AUTH === "true";
const serverPollingEnabled = process.env.ENABLE_SERVER_POLLING !== "false";
const discordStartupEnabled = process.env.ENABLE_DISCORD_STARTUP !== "false";
const scheduledJobsEnabled = process.env.ENABLE_SCHEDULED_JOBS !== "false";
const snapshotIntervalMs = Math.max(Number(process.env.SNAPSHOT_INTERVAL_MS ?? 30000), 10000);
const productionMissingGraceMs = Math.max(Number(process.env.PRODUCTION_MISSING_GRACE_MS ?? 120000), 0);
const dataDir = process.env.BITCRAFT_LOCAL_DATA_DIR ?? path.join(root, "data");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const appVersion = String(packageJson.version ?? "0.0.0-dev");
const appIdentifier = process.env.BITJITA_APP_IDENTIFIER ?? "BitCraft Claim Monitor (github.com/Red463/bitcraft-claim-monitor)";
const changelogUrl = "https://github.com/Red463/bitcraft-claim-monitor/blob/main/CHANGELOG.md";
const changelogPath = path.resolve(root, "..", "..", "CHANGELOG.md");
const repoRoot = path.resolve(root, "..", "..");
const brandingDir = path.join(dataDir, "branding");
const backupDir = path.join(dataDir, "backups");
const geoipDir = path.join(dataDir, "geoip");
const geoipDataPath = process.env.GEOIP_DATA_PATH ?? path.join(geoipDir, "geoip.json");
const maxGeoipJsonFallbackBytes = 25 * 1024 * 1024;
const ipapiBaseUrl = String(process.env.IPAPI_BASE_URL ?? "https://ipapi.co").replace(/\/+$/, "");
mkdirSync(dataDir, { recursive: true });
mkdirSync(brandingDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });
mkdirSync(geoipDir, { recursive: true });

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
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES admin_users(id)
  );
  CREATE TABLE IF NOT EXISTS user_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL UNIQUE,
    discord_username TEXT,
    discord_global_name TEXT,
    discord_avatar TEXT,
    character_player_id TEXT,
    character_name TEXT,
    character_status TEXT NOT NULL DEFAULT 'unlinked',
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user_accounts(id)
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS domain_payload_current (
    claim_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    data_json TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    last_attempt_at TEXT NOT NULL,
    last_success_at TEXT NOT NULL,
    last_error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, domain)
  );
  CREATE TABLE IF NOT EXISTS claim_current (
    claim_id TEXT PRIMARY KEY,
    name TEXT,
    region_id TEXT,
    region_name TEXT,
    owner_name TEXT,
    supplies REAL,
    treasury REAL,
    tier TEXT,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS member_current (
    claim_id TEXT NOT NULL,
    member_key TEXT NOT NULL,
    player_entity_id TEXT,
    username TEXT,
    co_owner_permission INTEGER,
    officer_permission INTEGER,
    build_permission INTEGER,
    inventory_permission INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, member_key)
  );
  CREATE TABLE IF NOT EXISTS player_current (
    claim_id TEXT NOT NULL,
    player_entity_id TEXT NOT NULL,
    username TEXT,
    signed_in INTEGER NOT NULL DEFAULT 0,
    sign_in_timestamp REAL,
    session_seconds REAL,
    time_played_seconds REAL,
    time_signed_in_seconds REAL,
    active INTEGER NOT NULL DEFAULT 1,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, player_entity_id)
  );
  CREATE TABLE IF NOT EXISTS profession_current (
    claim_id TEXT NOT NULL,
    player_entity_id TEXT NOT NULL,
    username TEXT,
    profession_id TEXT NOT NULL,
    profession_name TEXT,
    level REAL,
    xp REAL,
    tier INTEGER,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, player_entity_id, profession_id)
  );
  CREATE TABLE IF NOT EXISTS production_current (
    claim_id TEXT NOT NULL,
    craft_entity_id TEXT NOT NULL,
    label TEXT,
    building_name TEXT,
    crafter_name TEXT,
    profession TEXT,
    tier TEXT,
    total_xp REAL,
    progress REAL,
    is_public INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT,
    last_seen TEXT NOT NULL,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, craft_entity_id)
  );
  CREATE TABLE IF NOT EXISTS inventory_container_current (
    claim_id TEXT NOT NULL,
    container_key TEXT NOT NULL,
    container_name TEXT,
    building_id TEXT,
    building_name TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, container_key)
  );
  CREATE TABLE IF NOT EXISTS inventory_item_current (
    claim_id TEXT NOT NULL,
    container_key TEXT NOT NULL,
    item_key TEXT NOT NULL,
    item_id TEXT,
    item_type TEXT,
    item_name TEXT,
    quantity REAL,
    tier TEXT,
    rarity TEXT,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, container_key, item_key)
  );
  CREATE TABLE IF NOT EXISTS construction_project_current (
    claim_id TEXT NOT NULL,
    project_key TEXT NOT NULL,
    structure_name TEXT,
    progress REAL,
    active INTEGER NOT NULL DEFAULT 1,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, project_key)
  );
  CREATE TABLE IF NOT EXISTS construction_material_current (
    claim_id TEXT NOT NULL,
    project_key TEXT NOT NULL,
    material_key TEXT NOT NULL,
    item_name TEXT,
    required_quantity REAL,
    added_quantity REAL,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, project_key, material_key)
  );
  CREATE TABLE IF NOT EXISTS research_current (
    claim_id TEXT NOT NULL,
    research_key TEXT NOT NULL,
    name TEXT,
    status TEXT,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, research_key)
  );
  CREATE TABLE IF NOT EXISTS region_claim_current (
    claim_id TEXT NOT NULL,
    region_id TEXT NOT NULL,
    region_claim_id TEXT NOT NULL,
    name TEXT,
    supplies REAL,
    treasury REAL,
    owner_name TEXT,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, region_id, region_claim_id)
  );
  CREATE TABLE IF NOT EXISTS region_status_current (
    region_id TEXT PRIMARY KEY,
    region_name TEXT,
    signed_in_players REAL,
    players_in_queue REAL,
    active INTEGER NOT NULL DEFAULT 1,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS domain_change_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    event_type TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    summary TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    source_key TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS app_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scheduled_jobs (
    job_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    schedule TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    last_success_at TEXT,
    last_error TEXT,
    next_run_at TEXT,
    running INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recipe_catalog_entries (
    catalog_key TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    item_type INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    tier INTEGER,
    rarity TEXT,
    tag TEXT,
    icon_asset_name TEXT,
    detail_json TEXT NOT NULL,
    source TEXT NOT NULL,
    last_synced_at TEXT NOT NULL,
    last_error TEXT,
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
  CREATE TABLE IF NOT EXISTS production_contributions (
    contribution_key TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    craft_entity_id TEXT NOT NULL,
    contributor_entity_id TEXT NOT NULL,
    contributor_name TEXT NOT NULL,
    profession TEXT,
    craft_label TEXT,
    structure_name TEXT,
    item_tier TEXT,
    contributed_progress REAL NOT NULL DEFAULT 0,
    contributed_xp REAL NOT NULL DEFAULT 0,
    contribution_count REAL NOT NULL DEFAULT 0,
    first_contributed_at TEXT,
    last_contributed_at TEXT,
    first_seen TEXT NOT NULL,
    updated_at TEXT NOT NULL,
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
  CREATE TABLE IF NOT EXISTS visitor_security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    method TEXT NOT NULL,
    route_group TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    status_class TEXT NOT NULL,
    ip_address TEXT,
    ip_anonymized TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    visitor_key TEXT NOT NULL,
    user_agent_hash TEXT,
    country TEXT,
    city TEXT
  );
  CREATE TABLE IF NOT EXISTS geoip_ranges (
    ip_start INTEGER NOT NULL,
    ip_end INTEGER NOT NULL,
    country TEXT NOT NULL,
    city TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (ip_start, ip_end)
  );
  CREATE TABLE IF NOT EXISTS visitor_geoip_cache (
    ip_hash TEXT PRIMARY KEY,
    ip_anonymized TEXT NOT NULL,
    provider TEXT NOT NULL,
    country TEXT NOT NULL,
    city TEXT,
    looked_up_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    error TEXT
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
  CREATE TABLE IF NOT EXISTS discord_craft_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    profession_key TEXT NOT NULL,
    profession_name TEXT NOT NULL,
    mode TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (guild_id, user_id, profession_key)
  );
  CREATE TABLE IF NOT EXISTS discord_mod_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    case_type TEXT NOT NULL,
    user_id TEXT,
    moderator TEXT NOT NULL,
    reason TEXT,
    details_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS discord_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator TEXT NOT NULL,
    reason TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS discord_mod_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS discord_custom_commands (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    response TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS discord_component_votes (
    message_id TEXT NOT NULL,
    component_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, kind)
  );
  CREATE TABLE IF NOT EXISTS discord_component_messages (
    message_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (message_id, kind)
  );
  CREATE TABLE IF NOT EXISTS discord_temp_bans (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    unban_at TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_market_events_claim_time ON market_events (claim_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_market_trades_claim_time ON market_trades (claim_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_claim_time ON activity_events (claim_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_time ON analytics_events (occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_page_time ON analytics_events (page, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_visitor_security_time ON visitor_security_events (occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_visitor_security_location ON visitor_security_events (country, city, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_geoip_ranges_lookup ON geoip_ranges (ip_start, ip_end);
  CREATE INDEX IF NOT EXISTS idx_visitor_geoip_cache_expires ON visitor_geoip_cache (expires_at);
  CREATE INDEX IF NOT EXISTS idx_production_claim_status ON production_jobs (claim_id, status, last_seen DESC);
  CREATE INDEX IF NOT EXISTS idx_production_contrib_claim ON production_contributions (claim_id, last_contributed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_production_contrib_profession ON production_contributions (claim_id, profession, contributed_progress DESC);
  CREATE INDEX IF NOT EXISTS idx_discord_delivery_time ON discord_delivery_log (occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_discord_craft_watches_profession ON discord_craft_watches (guild_id, profession_key, mode);
  CREATE INDEX IF NOT EXISTS idx_discord_mod_cases_time ON discord_mod_cases (guild_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_discord_warnings_user ON discord_warnings (guild_id, user_id, active);
  CREATE INDEX IF NOT EXISTS idx_discord_mod_notes_user ON discord_mod_notes (guild_id, user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_accounts_status ON user_accounts (character_status, last_login_at DESC);
  CREATE INDEX IF NOT EXISTS idx_recipe_catalog_kind_target ON recipe_catalog_entries (kind, target_id);
  CREATE INDEX IF NOT EXISTS idx_recipe_catalog_synced ON recipe_catalog_entries (last_synced_at);
  CREATE INDEX IF NOT EXISTS idx_domain_payload_claim ON domain_payload_current (claim_id, domain);
  CREATE INDEX IF NOT EXISTS idx_domain_change_claim_time ON domain_change_events (claim_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_member_current_claim ON member_current (claim_id, active, username);
  CREATE INDEX IF NOT EXISTS idx_player_current_claim ON player_current (claim_id, active, signed_in);
  CREATE INDEX IF NOT EXISTS idx_production_current_claim ON production_current (claim_id, active, last_seen DESC);
  CREATE INDEX IF NOT EXISTS idx_inventory_item_claim ON inventory_item_current (claim_id, item_name);
`);

db.exec("DROP TABLE IF EXISTS current_claim_state;");

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
ensureColumn("admin_users", "role", "TEXT NOT NULL DEFAULT 'owner'");
ensureColumn("admin_users", "discord_id", "TEXT");
ensureColumn("admin_users", "discord_username", "TEXT");
ensureColumn("admin_users", "discord_global_name", "TEXT");
ensureColumn("admin_users", "discord_avatar", "TEXT");
ensureColumn("production_jobs", "start_notified", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("domain_payload_current", "updated_at", "TEXT");
ensureColumn("claim_current", "owner_name", "TEXT");
ensureColumn("claim_current", "tier", "TEXT");
ensureColumn("claim_current", "updated_at", "TEXT");
ensureColumn("member_current", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("member_current", "updated_at", "TEXT");
ensureColumn("player_current", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("player_current", "updated_at", "TEXT");
ensureColumn("profession_current", "xp", "REAL");
ensureColumn("profession_current", "tier", "INTEGER");
ensureColumn("profession_current", "updated_at", "TEXT");
ensureColumn("production_current", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("production_current", "first_seen", "TEXT");
ensureColumn("production_current", "last_seen", "TEXT");
ensureColumn("production_current", "data_json", "TEXT DEFAULT '{}'");
ensureColumn("production_current", "updated_at", "TEXT");
ensureColumn("inventory_container_current", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("inventory_container_current", "updated_at", "TEXT");
ensureColumn("inventory_item_current", "tier", "TEXT");
ensureColumn("inventory_item_current", "rarity", "TEXT");
ensureColumn("inventory_item_current", "updated_at", "TEXT");
ensureColumn("construction_project_current", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("construction_project_current", "updated_at", "TEXT");
ensureColumn("construction_material_current", "updated_at", "TEXT");
ensureColumn("research_current", "updated_at", "TEXT");
ensureColumn("region_claim_current", "updated_at", "TEXT");
ensureColumn("region_status_current", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("region_status_current", "updated_at", "TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_source ON activity_events (claim_id, event_type, source_key) WHERE source_key IS NOT NULL;");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_discord_id ON admin_users (discord_id) WHERE discord_id IS NOT NULL AND discord_id <> '';");

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
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("excluded_member_ids_json", JSON.stringify([]), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("theme_json", JSON.stringify(defaultTheme), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("refresh_seconds", "30", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("server_refresh_seconds", String(Math.round(snapshotIntervalMs / 1000)), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("collector_settings_json", JSON.stringify({}), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("default_page", "dashboard", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("default_region", "", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("toast_json", JSON.stringify({ marketListings: true, marketSales: true, production: true }), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("branding_json", JSON.stringify({}), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("snapshot_retention_days", "365", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("visitor_security_json", JSON.stringify({ fullIpRetentionDays: 7, statsRetentionDays: 180, geoipProvider: "ipapi", geoipCacheDays: 30, geoipSourceUrl: "", geoipAccountId: "", geoipLicenseKey: "" }), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("discord_json", JSON.stringify({ enabled: false, applicationId: "", publicKey: "", guildId: "", channelId: "", minSaleValue: 0, supplyRunwayDaysThreshold: 7, productionMinXp: 40000, productionMinAgeMinutes: 5, productionUsers: "", craftChannels: { forestry: "1509932116077711411", carpentry: "1509932154442875201", masonry: "1509932188446101585", mining: "1509932207060291797", smithing: "1509932228090658936", scholar: "1509932259262595245", hunting: "1510275986766434325", leatherworking: "1509932280829710547", tailoring: "1509932306486398976", farming: "1509932539626786926", fishing: "1509932564641747074", cooking: "1509932588180181033", foraging: "1509932609378058412" }, notify: { marketListings: true, marketSales: true, production: true, productionStarted: true, productionCompleted: true, lowSupplies: false, appUpdates: true } }), now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("discord_last_announced_version", "", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("discord_last_supply_report_at", "", now);
db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("discord_last_low_supplies_at", "", now);
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
  rekeyProductionJob: db.prepare("UPDATE OR IGNORE production_jobs SET job_key = ? WHERE job_key = ?"),
  upsertProductionJob: db.prepare(`
    INSERT INTO production_jobs (job_key, claim_id, label, building_name, crafter_name, first_seen, last_seen, status, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    ON CONFLICT(job_key) DO UPDATE SET
      label = excluded.label,
      building_name = excluded.building_name,
      crafter_name = excluded.crafter_name,
      last_seen = excluded.last_seen,
      status = 'active',
      start_notified = CASE WHEN production_jobs.status = 'active' THEN production_jobs.start_notified ELSE 0 END,
      raw_json = excluded.raw_json
  `),
  completeProductionJob: db.prepare("UPDATE production_jobs SET status = 'completed', last_seen = ? WHERE job_key = ? AND status = 'active'"),
  upsertProductionContribution: db.prepare(`
    INSERT INTO production_contributions (
      contribution_key, claim_id, craft_entity_id, contributor_entity_id, contributor_name, profession, craft_label, structure_name,
      item_tier, contributed_progress, contributed_xp, contribution_count, first_contributed_at, last_contributed_at, first_seen, updated_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contribution_key) DO UPDATE SET
      contributor_name = excluded.contributor_name,
      profession = excluded.profession,
      craft_label = excluded.craft_label,
      structure_name = excluded.structure_name,
      item_tier = excluded.item_tier,
      contributed_progress = max(production_contributions.contributed_progress, excluded.contributed_progress),
      contributed_xp = max(production_contributions.contributed_xp, excluded.contributed_xp),
      contribution_count = max(production_contributions.contribution_count, excluded.contribution_count),
      first_contributed_at = CASE
        WHEN production_contributions.first_contributed_at IS NULL THEN excluded.first_contributed_at
        WHEN excluded.first_contributed_at IS NULL THEN production_contributions.first_contributed_at
        WHEN excluded.first_contributed_at < production_contributions.first_contributed_at THEN excluded.first_contributed_at
        ELSE production_contributions.first_contributed_at
      END,
      last_contributed_at = CASE
        WHEN production_contributions.last_contributed_at IS NULL THEN excluded.last_contributed_at
        WHEN excluded.last_contributed_at IS NULL THEN production_contributions.last_contributed_at
        WHEN excluded.last_contributed_at > production_contributions.last_contributed_at THEN excluded.last_contributed_at
        ELSE production_contributions.last_contributed_at
      END,
      updated_at = excluded.updated_at,
      raw_json = excluded.raw_json
  `),
  getSetting: db.prepare("SELECT value FROM app_settings WHERE key = ?"),
  upsertSetting: db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `),
  domainPayloadsByClaim: db.prepare("SELECT * FROM domain_payload_current WHERE claim_id = ?"),
  domainPayload: db.prepare("SELECT * FROM domain_payload_current WHERE claim_id = ? AND domain = ?"),
  upsertDomainPayload: db.prepare(`
    INSERT INTO domain_payload_current (claim_id, domain, data_json, collected_at, last_attempt_at, last_success_at, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(claim_id, domain) DO UPDATE SET
      data_json = excluded.data_json,
      collected_at = excluded.collected_at,
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = excluded.last_success_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `),
  updateDomainPayloadError: db.prepare("UPDATE domain_payload_current SET last_attempt_at = ?, last_error = ?, updated_at = ? WHERE claim_id = ? AND domain = ?"),
  insertDomainChange: db.prepare(`
    INSERT OR IGNORE INTO domain_change_events (claim_id, domain, event_type, subject_key, summary, occurred_at, metadata_json, source_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getSecret: db.prepare("SELECT value FROM app_secrets WHERE key = ?"),
  upsertSecret: db.prepare(`
    INSERT INTO app_secrets (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `),
  deleteSecret: db.prepare("DELETE FROM app_secrets WHERE key = ?"),
  upsertScheduledJob: db.prepare(`
    INSERT INTO scheduled_jobs (job_key, label, description, schedule, enabled, next_run_at, running, metadata_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, '{}', ?)
    ON CONFLICT(job_key) DO UPDATE SET
      label = excluded.label,
      description = excluded.description,
      updated_at = excluded.updated_at
  `),
  listScheduledJobs: db.prepare("SELECT * FROM scheduled_jobs ORDER BY job_key"),
  getScheduledJob: db.prepare("SELECT * FROM scheduled_jobs WHERE job_key = ?"),
  dueScheduledJobs: db.prepare("SELECT * FROM scheduled_jobs WHERE enabled = 1 AND running = 0 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC"),
  setScheduledJobEnabled: db.prepare("UPDATE scheduled_jobs SET enabled = ?, updated_at = ? WHERE job_key = ?"),
  updateScheduledJobSettings: db.prepare("UPDATE scheduled_jobs SET schedule = ?, enabled = ?, next_run_at = ?, updated_at = ? WHERE job_key = ?"),
  markScheduledJobRunning: db.prepare("UPDATE scheduled_jobs SET running = 1, last_run_at = ?, last_error = NULL, updated_at = ? WHERE job_key = ?"),
  markScheduledJobSuccess: db.prepare("UPDATE scheduled_jobs SET running = 0, last_success_at = ?, last_error = NULL, next_run_at = ?, metadata_json = ?, updated_at = ? WHERE job_key = ?"),
  markScheduledJobFailure: db.prepare("UPDATE scheduled_jobs SET running = 0, last_error = ?, next_run_at = ?, metadata_json = ?, updated_at = ? WHERE job_key = ?"),
  updateScheduledJobMetadata: db.prepare("UPDATE scheduled_jobs SET metadata_json = ?, updated_at = ? WHERE job_key = ?"),
  resetStaleScheduledJobs: db.prepare("UPDATE scheduled_jobs SET running = 0, last_error = ?, next_run_at = ?, metadata_json = ?, updated_at = ? WHERE running = 1 AND (last_run_at IS NULL OR last_run_at < ?)"),
  getRecipeCatalogEntry: db.prepare("SELECT * FROM recipe_catalog_entries WHERE catalog_key = ?"),
  listRecipeCatalogEntries: db.prepare("SELECT * FROM recipe_catalog_entries ORDER BY last_synced_at ASC, catalog_key ASC LIMIT ?"),
  recipeCatalogCount: db.prepare("SELECT COUNT(*) AS count FROM recipe_catalog_entries"),
  upsertRecipeCatalogEntry: db.prepare(`
    INSERT INTO recipe_catalog_entries (
      catalog_key, kind, target_id, item_type, name, tier, rarity, tag, icon_asset_name,
      detail_json, source, last_synced_at, last_error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT(catalog_key) DO UPDATE SET
      item_type = excluded.item_type,
      name = COALESCE(excluded.name, recipe_catalog_entries.name),
      tier = COALESCE(excluded.tier, recipe_catalog_entries.tier),
      rarity = COALESCE(excluded.rarity, recipe_catalog_entries.rarity),
      tag = COALESCE(excluded.tag, recipe_catalog_entries.tag),
      icon_asset_name = COALESCE(excluded.icon_asset_name, recipe_catalog_entries.icon_asset_name),
      detail_json = excluded.detail_json,
      source = excluded.source,
      last_synced_at = excluded.last_synced_at,
      last_error = NULL,
      updated_at = excluded.updated_at
  `),
  updateRecipeCatalogError: db.prepare("UPDATE recipe_catalog_entries SET last_error = ?, updated_at = ? WHERE catalog_key = ?"),
  adminCount: db.prepare("SELECT COUNT(*) AS count FROM admin_users"),
  adminByUsername: db.prepare("SELECT * FROM admin_users WHERE username = ? AND active = 1"),
  adminByDiscordId: db.prepare("SELECT * FROM admin_users WHERE discord_id = ? AND active = 1"),
  adminBySession: db.prepare(`
    SELECT admin_users.id, admin_users.username, admin_users.role, admin_users.discord_id, admin_users.discord_username, admin_users.discord_global_name, admin_users.discord_avatar
    FROM admin_sessions
    JOIN admin_users ON admin_users.id = admin_sessions.user_id
    WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > ? AND admin_users.active = 1
  `),
  insertAdmin: db.prepare("INSERT INTO admin_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)"),
  insertDiscordAdmin: db.prepare("INSERT INTO admin_users (username, password_hash, role, created_at, discord_id, discord_username, discord_global_name, discord_avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
  updateAdminDiscordProfile: db.prepare("UPDATE admin_users SET username = ?, discord_username = ?, discord_global_name = ?, discord_avatar = ?, last_login_at = ? WHERE id = ?"),
  updatePassword: db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?"),
  updateAdminActive: db.prepare("UPDATE admin_users SET active = ? WHERE id = ?"),
  updateAdminRole: db.prepare("UPDATE admin_users SET role = ? WHERE id = ?"),
  updateLastLogin: db.prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?"),
  insertSession: db.prepare("INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"),
  deleteSession: db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?"),
  deleteUserSessions: db.prepare("DELETE FROM admin_sessions WHERE user_id = ?"),
  deleteOtherSessions: db.prepare("DELETE FROM admin_sessions WHERE user_id = ? AND token_hash <> ?"),
  deleteExpiredSessions: db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?"),
  userBySession: db.prepare(`
    SELECT user_accounts.*
    FROM user_sessions
    JOIN user_accounts ON user_accounts.id = user_sessions.user_id
    WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?
  `),
  userByDiscordId: db.prepare("SELECT * FROM user_accounts WHERE discord_id = ?"),
  upsertUserAccount: db.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, discord_global_name, discord_avatar, character_status, settings_json, created_at, last_login_at)
    VALUES (?, ?, ?, ?, 'unlinked', '{}', ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      discord_username = excluded.discord_username,
      discord_global_name = excluded.discord_global_name,
      discord_avatar = excluded.discord_avatar,
      last_login_at = excluded.last_login_at
  `),
  updateUserLastLogin: db.prepare("UPDATE user_accounts SET last_login_at = ? WHERE id = ?"),
  insertUserSession: db.prepare("INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"),
  deleteAppUserSession: db.prepare("DELETE FROM user_sessions WHERE token_hash = ?"),
  deleteExpiredUserSessions: db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?"),
  updateUserCharacter: db.prepare("UPDATE user_accounts SET character_player_id = ?, character_name = ?, character_status = ? WHERE id = ?"),
  updateUserSettings: db.prepare("UPDATE user_accounts SET settings_json = ? WHERE id = ?"),
  listUserAccounts: db.prepare("SELECT * FROM user_accounts ORDER BY last_login_at DESC, created_at DESC"),
  updateUserCharacterStatus: db.prepare("UPDATE user_accounts SET character_status = ? WHERE id = ?"),
  insertAudit: db.prepare("INSERT INTO admin_audit_log (user_id, username, action, details_json, occurred_at) VALUES (?, ?, ?, ?, ?)"),
  insertLoginEvent: db.prepare("INSERT INTO admin_login_events (username, successful, occurred_at, remote_address) VALUES (?, ?, ?, ?)"),
  insertAnalyticsEvent: db.prepare(`
    INSERT INTO analytics_events (visitor_key, session_key, event_name, page, properties_json, duration_seconds, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertVisitorSecurityEvent: db.prepare(`
    INSERT INTO visitor_security_events (
      occurred_at, method, route_group, status_code, status_class, ip_address,
      ip_anonymized, ip_hash, visitor_key, user_agent_hash, country, city
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  clearGeoipRanges: db.prepare("DELETE FROM geoip_ranges"),
  insertGeoipRange: db.prepare("INSERT INTO geoip_ranges (ip_start, ip_end, country, city, updated_at) VALUES (?, ?, ?, ?, ?)"),
  lookupGeoipRange: db.prepare("SELECT country, city FROM geoip_ranges WHERE ip_start <= ? AND ip_end >= ? ORDER BY ip_start DESC LIMIT 1"),
  geoipRangeCount: db.prepare("SELECT COUNT(*) AS count FROM geoip_ranges"),
  geoipRangeLastUpdated: db.prepare("SELECT MAX(updated_at) AS updated_at FROM geoip_ranges"),
  getVisitorGeoipCache: db.prepare("SELECT * FROM visitor_geoip_cache WHERE ip_hash = ?"),
  upsertVisitorGeoipCache: db.prepare(`
    INSERT INTO visitor_geoip_cache (ip_hash, ip_anonymized, provider, country, city, looked_up_at, expires_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ip_hash) DO UPDATE SET
      ip_anonymized = excluded.ip_anonymized,
      provider = excluded.provider,
      country = excluded.country,
      city = excluded.city,
      looked_up_at = excluded.looked_up_at,
      expires_at = excluded.expires_at,
      error = excluded.error
  `),
  pruneVisitorGeoipCache: db.prepare("DELETE FROM visitor_geoip_cache WHERE expires_at < ?"),
  visitorGeoipCacheCount: db.prepare("SELECT COUNT(*) AS count FROM visitor_geoip_cache"),
  visitorGeoipCacheLastLookup: db.prepare("SELECT MAX(looked_up_at) AS looked_up_at FROM visitor_geoip_cache"),
  updateVisitorSecurityLocationByIpHash: db.prepare(`
    UPDATE visitor_security_events
    SET country = ?, city = ?
    WHERE ip_hash = ? AND COALESCE(country, 'Unknown') = 'Unknown'
  `),
  insertDiscordDelivery: db.prepare(`
    INSERT INTO discord_delivery_log (event_type, status, summary, channel_id, channel_key, reason, error, metadata_json, response_json, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  recentDiscordDeliveries: db.prepare("SELECT * FROM discord_delivery_log ORDER BY occurred_at DESC, id DESC LIMIT ?"),
  pruneDiscordDeliveries: db.prepare("DELETE FROM discord_delivery_log WHERE id NOT IN (SELECT id FROM discord_delivery_log ORDER BY occurred_at DESC, id DESC LIMIT 250)"),
  upsertDiscordCraftWatch: db.prepare(`
    INSERT INTO discord_craft_watches (guild_id, user_id, profession_key, profession_name, mode, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, profession_key) DO UPDATE SET
      profession_name = excluded.profession_name,
      mode = excluded.mode,
      updated_at = excluded.updated_at
  `),
  getDiscordCraftWatch: db.prepare("SELECT * FROM discord_craft_watches WHERE guild_id = ? AND user_id = ? AND profession_key = ?"),
  deleteDiscordCraftWatch: db.prepare("DELETE FROM discord_craft_watches WHERE guild_id = ? AND user_id = ? AND profession_key = ?"),
  clearDiscordCraftWatches: db.prepare("DELETE FROM discord_craft_watches WHERE guild_id = ? AND user_id = ?"),
  listDiscordCraftWatches: db.prepare("SELECT * FROM discord_craft_watches WHERE guild_id = ? AND user_id = ? ORDER BY profession_name"),
  matchingDiscordCraftWatches: db.prepare("SELECT user_id, mode FROM discord_craft_watches WHERE guild_id = ? AND profession_key = ?"),
  insertDiscordModCase: db.prepare("INSERT INTO discord_mod_cases (guild_id, case_type, user_id, moderator, reason, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  recentDiscordModCases: db.prepare("SELECT * FROM discord_mod_cases WHERE guild_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?"),
  insertDiscordWarning: db.prepare("INSERT INTO discord_warnings (guild_id, user_id, moderator, reason, active, created_at) VALUES (?, ?, ?, ?, 1, ?)"),
  listDiscordWarnings: db.prepare("SELECT * FROM discord_warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50"),
  clearDiscordWarnings: db.prepare("UPDATE discord_warnings SET active = 0 WHERE guild_id = ? AND user_id = ? AND active = 1"),
  insertDiscordModNote: db.prepare("INSERT INTO discord_mod_notes (guild_id, user_id, moderator, note, created_at) VALUES (?, ?, ?, ?, ?)"),
  listDiscordModNotes: db.prepare("SELECT * FROM discord_mod_notes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50"),
  deleteDiscordModNote: db.prepare("DELETE FROM discord_mod_notes WHERE id = ? AND guild_id = ?"),
  upsertDiscordCustomCommand: db.prepare("INSERT INTO discord_custom_commands (name, description, response, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET description = excluded.description, response = excluded.response, updated_at = excluded.updated_at"),
  deleteDiscordCustomCommand: db.prepare("DELETE FROM discord_custom_commands WHERE name = ?"),
  listDiscordCustomCommands: db.prepare("SELECT * FROM discord_custom_commands ORDER BY name"),
  getDiscordCustomCommand: db.prepare("SELECT * FROM discord_custom_commands WHERE name = ?"),
  upsertDiscordComponentVote: db.prepare("INSERT INTO discord_component_votes (message_id, component_key, user_id, kind, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(message_id, user_id, kind) DO UPDATE SET component_key = excluded.component_key, updated_at = excluded.updated_at"),
  componentVoteCounts: db.prepare("SELECT component_key, COUNT(*) AS count FROM discord_component_votes WHERE message_id = ? AND kind = ? GROUP BY component_key"),
  upsertDiscordComponentMessage: db.prepare("INSERT INTO discord_component_messages (message_id, kind, metadata_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(message_id, kind) DO UPDATE SET metadata_json = excluded.metadata_json, updated_at = excluded.updated_at"),
  getDiscordComponentMessage: db.prepare("SELECT * FROM discord_component_messages WHERE message_id = ? AND kind = ?"),
  upsertDiscordTempBan: db.prepare("INSERT INTO discord_temp_bans (guild_id, user_id, unban_at, reason, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET unban_at = excluded.unban_at, reason = excluded.reason"),
  dueDiscordTempBans: db.prepare("SELECT * FROM discord_temp_bans WHERE unban_at <= ? LIMIT 25"),
  deleteDiscordTempBan: db.prepare("DELETE FROM discord_temp_bans WHERE guild_id = ? AND user_id = ?"),
};

const defaultOwnerDiscordId = String(process.env.DEFAULT_OWNER_DISCORD_ID ?? "145544610234630144").trim();

function seedDefaultDiscordOwner() {
  if (isTestRuntime || !/^\d+$/.test(defaultOwnerDiscordId)) return;
  if (db.prepare("SELECT id FROM admin_users WHERE discord_id = ?").get(defaultOwnerDiscordId)) return;
  const createdAt = new Date().toISOString();
  const existingRed = db.prepare("SELECT id FROM admin_users WHERE username = ?").get("red463");
  if (existingRed) {
    db.prepare("UPDATE admin_users SET discord_id = ?, discord_username = ?, discord_global_name = ?, role = 'owner', active = 1 WHERE id = ?")
      .run(defaultOwnerDiscordId, "red463", "red463", existingRed.id);
    return;
  }
  statements.insertDiscordAdmin.run("red463", "discord-oauth-admin", "owner", createdAt, defaultOwnerDiscordId, "red463", "red463", "");
}

seedDefaultDiscordOwner();

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDailyMidnightIso(from = new Date()) {
  const next = new Date(from);
  next.setHours(24, 0, 0, 0);
  return next.toISOString();
}

function parseScheduledJobSchedule(schedule) {
  const raw = String(schedule ?? "").trim();
  if (!raw || raw === "daily_midnight") return { frequency: "daily", time: "00:00", dayOfWeek: 1, dayOfMonth: 1 };
  const parts = raw.split("@");
  const frequency = ["daily", "weekly", "monthly"].includes(parts[0]) ? parts[0] : "daily";
  if (frequency === "weekly") {
    return { frequency, dayOfWeek: Math.min(6, Math.max(0, Math.floor(toNumber(parts[1]) || 1))), time: validScheduleTime(parts[2]) ? parts[2] : "00:00", dayOfMonth: 1 };
  }
  if (frequency === "monthly") {
    return { frequency, dayOfMonth: Math.min(28, Math.max(1, Math.floor(toNumber(parts[1]) || 1))), time: validScheduleTime(parts[2]) ? parts[2] : "00:00", dayOfWeek: 1 };
  }
  return { frequency: "daily", time: validScheduleTime(parts[1]) ? parts[1] : "00:00", dayOfWeek: 1, dayOfMonth: 1 };
}

function validScheduleTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

function serializeScheduledJobSchedule(input = {}) {
  const frequency = ["daily", "weekly", "monthly"].includes(String(input.frequency)) ? String(input.frequency) : "daily";
  const time = validScheduleTime(input.time) ? String(input.time) : "00:00";
  if (frequency === "weekly") {
    const dayOfWeek = Math.min(6, Math.max(0, Math.floor(toNumber(input.dayOfWeek) || 1)));
    return `weekly@${dayOfWeek}@${time}`;
  }
  if (frequency === "monthly") {
    const dayOfMonth = Math.min(28, Math.max(1, Math.floor(toNumber(input.dayOfMonth) || 1)));
    return `monthly@${dayOfMonth}@${time}`;
  }
  return `daily@${time}`;
}

function nextScheduledRunIso(schedule, from = new Date()) {
  const config = parseScheduledJobSchedule(schedule);
  const [hours, minutes] = config.time.split(":").map((part) => Number(part));
  const next = new Date(from);
  next.setSeconds(0, 0);
  if (config.frequency === "weekly") {
    const dayDelta = (config.dayOfWeek - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + dayDelta);
    next.setHours(hours, minutes, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 7);
    return next.toISOString();
  }
  if (config.frequency === "monthly") {
    next.setDate(config.dayOfMonth);
    next.setHours(hours, minutes, 0, 0);
    if (next <= from) {
      next.setMonth(next.getMonth() + 1, config.dayOfMonth);
      next.setHours(hours, minutes, 0, 0);
    }
    return next.toISOString();
  }
  next.setHours(hours, minutes, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function scheduledJobScheduleLabel(schedule) {
  const config = parseScheduledJobSchedule(schedule);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (config.frequency === "weekly") return `Weekly on ${weekdays[config.dayOfWeek]} at ${config.time}`;
  if (config.frequency === "monthly") return `Monthly on day ${config.dayOfMonth} at ${config.time}`;
  return `Daily at ${config.time}`;
}

function recipeCatalogKey(kind, id) {
  const normalizedKind = String(kind ?? "").toLowerCase() === "cargo" ? "cargo" : "items";
  return `${normalizedKind}:${String(id ?? "").trim()}`;
}

function recipeKindFromItemType(value) {
  return value === 1 || value === "1" || String(value ?? "").toLowerCase() === "cargo" ? "cargo" : "items";
}

function recipeTargetFromDetail(detail, fallback = {}) {
  const source = detail?.item ?? detail?.cargo ?? detail ?? {};
  const kind = detail?.cargo ? "cargo" : recipeKindFromItemType(source.itemType ?? source.item_type ?? fallback.itemType ?? fallback.kind);
  return {
    id: String(source.id ?? source.itemId ?? fallback.id ?? ""),
    kind,
    itemType: kind === "cargo" ? 1 : 0,
    name: String(source.name ?? fallback.name ?? "Unknown item"),
    tier: Number.isFinite(Number(source.tier ?? fallback.tier)) ? Number(source.tier ?? fallback.tier) : null,
    rarity: source.rarityStr ?? source.rarity ?? fallback.rarity ?? null,
    tag: source.tag ?? fallback.tag ?? null,
    iconAssetName: source.iconAssetName ?? fallback.iconAssetName ?? null,
  };
}

function recipeTargetFromRow(row) {
  return {
    id: String(row.target_id),
    kind: String(row.kind) === "cargo" ? "cargo" : "items",
    itemType: toNumber(row.item_type),
    name: row.name ?? "Unknown item",
    tier: row.tier == null ? null : toNumber(row.tier),
    rarity: row.rarity ?? null,
    tag: row.tag ?? null,
    iconAssetName: row.icon_asset_name ?? null,
  };
}

function upsertRecipeCatalogDetail(target, detail, source = "bitjita") {
  const normalized = recipeTargetFromDetail(detail, target);
  const now = new Date().toISOString();
  statements.upsertRecipeCatalogEntry.run(
    recipeCatalogKey(normalized.kind, normalized.id),
    normalized.kind,
    normalized.id,
    normalized.itemType,
    normalized.name,
    normalized.tier,
    normalized.rarity,
    normalized.tag,
    normalized.iconAssetName,
    JSON.stringify(detail),
    source,
    now,
    now,
  );
  return normalized;
}

async function fetchAndStoreRecipeDetail(target, source = "on_demand") {
  const kind = String(target.kind ?? "") === "cargo" ? "cargo" : "items";
  const id = String(target.id ?? "").trim();
  if (!id) {
    const error = new Error("Recipe target id is required");
    error.statusCode = 400;
    throw error;
  }
  const detail = await fetchBitjita(`/${kind}/${encodeURIComponent(id)}`);
  upsertRecipeCatalogDetail({ ...target, id, kind }, detail, source);
  return detail;
}

async function recipeDetailFromCatalogOrFetch(target) {
  const kind = String(target.kind ?? "") === "cargo" ? "cargo" : "items";
  const id = String(target.id ?? "").trim();
  const key = recipeCatalogKey(kind, id);
  const cached = statements.getRecipeCatalogEntry.get(key);
  if (cached?.detail_json) {
    return {
      detail: safeJson(cached.detail_json, {}),
      cached: true,
      lastSyncedAt: cached.last_synced_at,
      lastError: cached.last_error,
    };
  }
  const detail = await fetchAndStoreRecipeDetail({ ...target, id, kind }, "on_demand");
  return {
    detail,
    cached: false,
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  };
}

async function runRecipeCatalogRefreshJob() {
  const limit = Math.max(1, Math.min(Number(process.env.RECIPE_CATALOG_REFRESH_LIMIT ?? 250), 1000));
  const rows = statements.listRecipeCatalogEntries.all(limit);
  if (!rows.length) {
    return {
      refreshed: 0,
      failed: 0,
      skipped: 0,
      knownRecipes: 0,
      message: "No recipe records are cached yet. The Craft Calculator will add records as users look up items.",
    };
  }

  let refreshed = 0;
  let failed = 0;
  let stoppedEarly = false;
  for (const row of rows) {
    const target = recipeTargetFromRow(row);
    try {
      await fetchAndStoreRecipeDetail(target, "scheduled_job");
      refreshed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      statements.updateRecipeCatalogError.run(message, new Date().toISOString(), row.catalog_key);
      if (message.includes("HTTP 429")) {
        stoppedEarly = true;
        break;
      }
    }
    await delay(250);
  }

  const knownRecipes = toNumber(statements.recipeCatalogCount.get()?.count);
  return {
    refreshed,
    failed,
    skipped: Math.max(knownRecipes - refreshed - failed, 0),
    knownRecipes,
    stoppedEarly,
  };
}

function updateScheduledJobProgress(jobKey, metadata) {
  if (!jobKey) return;
  const row = statements.getScheduledJob.get(jobKey);
  const previous = safeJson(row?.metadata_json, {});
  const updatedAt = new Date().toISOString();
  statements.updateScheduledJobMetadata.run(JSON.stringify({ ...previous, ...metadata, progressUpdatedAt: updatedAt }), updatedAt, jobKey);
}

async function runGeoipRefreshJob({ jobKey } = {}) {
  const settings = visitorSecuritySettings(true);
  if (settings.geoipProvider === "ipapi") {
    updateScheduledJobProgress(jobKey, { stage: "provider_mode", provider: "ipapi", cacheEntries: toNumber(statements.visitorGeoipCacheCount.get()?.count) });
    return {
      refreshed: false,
      configured: true,
      provider: "ipapi",
      message: "ipapi provider mode uses on-demand cached lookups, so no local GeoIP database refresh is required.",
      cacheEntries: toNumber(statements.visitorGeoipCacheCount.get()?.count),
    };
  }
  if (settings.geoipProvider === "disabled") {
    return {
      refreshed: false,
      configured: false,
      provider: "disabled",
      message: "GeoIP lookup is disabled.",
    };
  }
  if (!settings.geoipSourceUrl) {
    return {
      refreshed: false,
      configured: false,
      message: "No GeoIP source URL is configured. Add a MaxMind GeoLite2 City CSV ZIP, JSON, or CSV update URL in Admin settings to enable automatic refreshes.",
    };
  }
  const headers = { "user-agent": appIdentifier };
  if (settings.geoipAccountId && settings.geoipLicenseKey) {
    headers.authorization = `Basic ${Buffer.from(`${settings.geoipAccountId}:${settings.geoipLicenseKey}`).toString("base64")}`;
  }
  let response;
  try {
    updateScheduledJobProgress(jobKey, { stage: "downloading", source: "GeoIP source URL" });
    response = await fetch(settings.geoipSourceUrl, { headers, signal: AbortSignal.timeout(120000) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`GeoIP download failed before a response was received: ${reason}`);
  }
  if (!response.ok) throw new Error(`GeoIP download failed with HTTP ${response.status}`);
  updateScheduledJobProgress(jobKey, { stage: "reading_download", statusCode: response.status });
  const body = Buffer.from(await response.arrayBuffer());
  updateScheduledJobProgress(jobKey, { stage: "parsing", downloadedBytes: body.length });
  const contentType = response.headers.get("content-type") ?? "";
  const looksZip = body.length >= 4 && body.readUInt32LE(0) === 0x04034b50;
  let entriesCount = 0;
  let storage = "sqlite";
  if (looksZip || /zip/i.test(contentType)) {
    const result = await importMaxMindCityCsvZipToSqlite(body, (metadata) => updateScheduledJobProgress(jobKey, { downloadedBytes: body.length, storage, ...metadata }));
    entriesCount = result.entries;
    try {
      if (existsSync(geoipDataPath)) unlinkSync(geoipDataPath);
    } catch {}
  } else {
    mkdirSync(geoipDir, { recursive: true });
    const tempPath = `${geoipDataPath}.tmp`;
    storage = "json";
    const entries = parseGeoipDownload(body, contentType);
    if (!entries.length) throw new Error("GeoIP source did not contain any valid ranges");
    entriesCount = entries.length;
    updateScheduledJobProgress(jobKey, { stage: "writing", entries: entriesCount });
    await writeFile(tempPath, JSON.stringify({ updatedAt: new Date().toISOString(), ranges: entries, count: entriesCount }, null, 2));
    parseGeoipData(readFileSync(tempPath, "utf8"));
    renameSync(tempPath, geoipDataPath);
  }
  if (!entriesCount) throw new Error("GeoIP source did not contain any valid ranges");
  geoipCache = { mtimeMs: 0, entries: null, error: null };
  return {
    refreshed: true,
    configured: true,
    entries: entriesCount,
    storage,
    path: storage === "sqlite" ? databasePath : geoipDataPath,
  };
}

const scheduledJobRegistry = {
  recipe_catalog_refresh: {
    label: "Recipe catalog refresh",
    description: "Refreshes known Craft Calculator recipe records from BitJita once per day at midnight.",
    schedule: "daily_midnight",
    enabled: true,
    run: runRecipeCatalogRefreshJob,
  },
  geoip_database_refresh: {
    label: "GeoIP database refresh",
    description: "Refreshes the local visitor IP-to-location lookup file when local GeoIP mode is used. Provider mode resolves locations on demand with cache.",
    schedule: "weekly@1@00:00",
    enabled: false,
    run: runGeoipRefreshJob,
  },
};

function seedScheduledJobs() {
  const seededAt = new Date().toISOString();
  for (const [key, job] of Object.entries(scheduledJobRegistry)) {
    statements.upsertScheduledJob.run(key, job.label, job.description, job.schedule, job.enabled ? 1 : 0, nextScheduledRunIso(job.schedule), seededAt);
    const row = statements.getScheduledJob.get(key);
    if (!row?.next_run_at) {
      db.prepare("UPDATE scheduled_jobs SET next_run_at = ?, updated_at = ? WHERE job_key = ?").run(nextScheduledRunIso(row?.schedule ?? job.schedule), seededAt, key);
    }
  }
}

const scheduledJobStaleAfterMs = 15 * 60 * 1000;

function recoverStaleScheduledJobs() {
  const cutoff = new Date(Date.now() - scheduledJobStaleAfterMs).toISOString();
  const updatedAt = new Date().toISOString();
  const nextRunAt = new Date().toISOString();
  const result = statements.resetStaleScheduledJobs.run(
    `Recovered abandoned run after server restart or timeout. The previous run was still marked running for more than ${Math.round(scheduledJobStaleAfterMs / 60000)} minutes.`,
    nextRunAt,
    JSON.stringify({ recoveredAt: updatedAt, staleAfterMinutes: Math.round(scheduledJobStaleAfterMs / 60000) }),
    updatedAt,
    cutoff,
  );
  return result.changes;
}

function scheduledJobRow(row) {
  return {
    key: row.job_key,
    label: row.label,
    description: row.description ?? "",
    schedule: row.schedule,
    scheduleLabel: scheduledJobScheduleLabel(row.schedule),
    scheduleConfig: parseScheduledJobSchedule(row.schedule),
    enabled: Boolean(row.enabled),
    running: Boolean(row.running),
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    nextRunAt: row.next_run_at,
    metadata: safeJson(row.metadata_json, {}),
    updatedAt: row.updated_at,
  };
}

function scheduledJobsStatus() {
  recoverStaleScheduledJobs();
  const recipeCatalogCount = toNumber(statements.recipeCatalogCount.get()?.count);
  return {
    enabled: scheduledJobsEnabled,
    serverTime: new Date().toISOString(),
    recipeCatalogCount,
    jobs: statements.listScheduledJobs.all().map(scheduledJobRow),
  };
}

async function runScheduledJob(jobKey, { manual = false } = {}) {
  recoverStaleScheduledJobs();
  const registryEntry = scheduledJobRegistry[jobKey];
  if (!registryEntry) {
    const error = new Error("Unknown scheduled job");
    error.statusCode = 404;
    throw error;
  }
  const row = statements.getScheduledJob.get(jobKey);
  if (!row) {
    const error = new Error("Scheduled job is not configured");
    error.statusCode = 404;
    throw error;
  }
  if (row.running) {
    const error = new Error("Scheduled job is already running");
    error.statusCode = 409;
    throw error;
  }
  const startedAt = new Date().toISOString();
  statements.markScheduledJobRunning.run(startedAt, startedAt, jobKey);
  try {
    const metadata = await registryEntry.run({ manual, jobKey });
    const finishedAt = new Date().toISOString();
    statements.markScheduledJobSuccess.run(finishedAt, nextScheduledRunIso(row.schedule, new Date()), JSON.stringify({ ...metadata, manual }), finishedAt, jobKey);
    return { ok: true, key: jobKey, metadata, nextRunAt: statements.getScheduledJob.get(jobKey)?.next_run_at };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    statements.markScheduledJobFailure.run(message, nextScheduledRunIso(row.schedule, new Date()), JSON.stringify({ manual }), finishedAt, jobKey);
    throw error;
  }
}

function checkScheduledJobs() {
  if (!scheduledJobsEnabled || isTestRuntime) return;
  const due = statements.dueScheduledJobs.all(new Date().toISOString());
  for (const row of due) {
    void runScheduledJob(row.job_key).catch((error) => console.warn(`Scheduled job ${row.job_key} failed: ${error instanceof Error ? error.message : String(error)}`));
  }
}

seedScheduledJobs();

function currentAppBuildId() {
  const envRevision = String(process.env.SOURCE_VERSION ?? process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? "").trim();
  if (envRevision) return envRevision.slice(0, 12);
  try {
    const gitDir = path.join(repoRoot, ".git");
    const head = readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      const refPath = head.slice(5).trim();
      const full = readFileSync(path.join(gitDir, refPath), "utf8").trim();
      return full.slice(0, 12);
    }
    if (/^[a-f0-9]{40}$/i.test(head)) return head.slice(0, 12);
  } catch {}
  return "";
}

function currentAppReleaseKey() {
  const buildId = currentAppBuildId();
  return buildId ? `${appVersion}+${buildId}` : appVersion;
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

function stableCraftPart(value, fallback = "") {
  return String(value ?? fallback).trim().toLowerCase().replace(/\s+/g, " ");
}

function craftJobKey(job) {
  const output = job.craftedItem?.[0] ?? {};
  const claim = stableCraftPart(job.claimEntityId ?? job.claimId, "claim");
  const structure = stableCraftPart(
    job.buildingEntityId ?? job.structureEntityId ?? job.stationEntityId ?? job.craftingStationEntityId ?? job.buildingId ?? job.buildingName ?? job.structureName,
  );
  const recipe = stableCraftPart(job.recipeId ?? job.recipeEntityId ?? job.recipe_entity_id ?? job.craftingRecipeId ?? job.recipeName ?? job.name);
  const outputItem = stableCraftPart(output.item_id ?? output.itemId ?? output.id ?? job.outputItemId ?? job.itemId);
  const outputType = stableCraftPart(output.item_type ?? output.itemType ?? job.outputItemType ?? job.itemType);
  const visibility = job.isPublic === false ? "private" : "public";
  // BitJita can report the same public craft with a different current/last crafter as work continues.
  // Crafter is notification metadata, not stable craft identity, otherwise starts can fire again.
  if (structure && (recipe || outputItem)) return ["craft", claim, structure, recipe || "recipe", outputItem || "output", outputType || "item", visibility].join("|");
  return String(job.entityId ?? job.id ?? job.craftEntityId ?? ["craft", claim, recipe || outputItem || "unknown", visibility].join("|"));
}

function craftOutputItem(job, craftsPayload = {}) {
  const itemId = String(job.craftedItem?.[0]?.item_id ?? job.outputItemId ?? job.itemId ?? "");
  return [...(craftsPayload.items ?? []), ...(craftsPayload.cargos ?? [])].find((candidate) => String(candidate.id) === itemId) ?? null;
}

function craftDisplayName(job, craftsPayload = {}) {
  const item = craftOutputItem(job, craftsPayload);
  return String(item?.name ?? job.recipeName ?? job.name ?? `${job.buildingName ?? "Settlement"} craft`);
}

function normalizeProductionJob(job, craftsPayload = {}) {
  const metrics = productionMetrics(job);
  const item = craftOutputItem(job, craftsPayload);
  return {
    key: craftJobKey(job),
    label: String(item?.name ?? job.recipeName ?? job.name ?? `${job.buildingName ?? "Settlement"} craft`),
    tier: toNumber(item?.tier ?? job.tier ?? job.itemTier),
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
  const totalEffort = toNumber(job.totalActionsRequired ?? job.totalCraftWork ?? job.requiredCraftWork ?? job.craftWorkRequired ?? job.effortRequired ?? job.totalEffort);
  const completedEffort = toNumber(job.progress ?? job.completedCraftWork ?? job.completedEffort ?? job.actionsCompleted);
  const remainingEffort = toNumber(job.remainingCraftWork ?? job.actionsRemaining ?? job.effortRemaining ?? (totalEffort ? totalEffort - completedEffort : 0));
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

function normalizeProfessionKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function recordProductionJobs(claimId, craftsPayload, occurredAt) {
  const jobs = unwrap(craftsPayload, "craftResults", []).map((job) => normalizeProductionJob(job, craftsPayload));
  const seen = new Set(jobs.map((job) => job.key));
  const activeRows = statements.activeProductionJobs.all(claimId);
  const existing = new Map(activeRows.map((row) => [row.job_key, row]));
  const existingByStableKey = new Map(activeRows.map((row) => [normalizeProductionJob(safeJson(row.raw_json)).key, row]));
  const hasProductionBaseline = toNumber(statements.productionJobCount.get(claimId)?.count) > 0;
  const pendingNotifications = [];
  const diagnostics = [{
    status: "debug",
    eventType: "production_poll",
    summary: `Production poll saw ${jobs.length} active craft${jobs.length === 1 ? "" : "s"}`,
    reason: hasProductionBaseline ? "Production baseline exists" : "First production baseline; start notifications are suppressed for this poll",
    metadata: discordDiagnosticContext("production_started", {
      claimId,
      activeCraftCount: jobs.length,
      activeKnownBeforePoll: existing.size,
      hasProductionBaseline,
      crafts: jobs.slice(0, 12).map((job) => ({
        key: job.key,
        label: job.label,
        crafterName: job.crafterName,
        skillName: job.skillName,
        professionKey: job.professionKey,
        tier: job.tier,
        totalXp: job.totalXp,
        progressPct: job.progressPct,
        totalEffort: job.totalEffort,
        remainingEffort: job.remainingEffort,
      })),
    }),
  }];

  for (const job of jobs) {
    let current = existing.get(job.key) ?? existingByStableKey.get(job.key);
    if (current && current.job_key !== job.key) {
      statements.rekeyProductionJob.run(job.key, current.job_key);
      current = { ...current, job_key: job.key };
      existing.set(job.key, current);
    }
    const firstSeen = current?.first_seen ?? occurredAt;
    const jobWithTiming = { ...job, firstSeen, lastSeen: occurredAt };
    statements.upsertProductionJob.run(job.key, claimId, job.label, job.buildingName, job.crafterName, firstSeen, occurredAt, JSON.stringify(job.raw));
    const startAlreadyNotified = current ? Boolean(current.start_notified) : false;
    if (startAlreadyNotified) {
      diagnostics.push({
        status: "debug",
        eventType: "production_started",
        summary: `Craft start already notified: ${job.label}`,
        reason: "Existing active craft row already has start_notified=1",
        metadata: discordDiagnosticContext("production_started", { ...jobWithTiming, existingFirstSeen: current.first_seen, existingLastSeen: current.last_seen }),
      });
    }
    if (!startAlreadyNotified && hasProductionBaseline) {
      const summary = `Craft started: ${job.label}`;
      const skipReason = productionNotificationSkipReason("production_started", jobWithTiming);
      if (skipReason) {
        diagnostics.push({ status: "skipped", eventType: "production_started", summary, reason: skipReason, metadata: discordDiagnosticContext("production_started", jobWithTiming) });
        continue;
      }
      statements.insertActivity.run(claimId, "production_started", summary, occurredAt, JSON.stringify(jobWithTiming));
      pendingNotifications.push({ jobKey: job.key, eventType: "production_started", summary, occurredAt, metadata: jobWithTiming });
      statements.markProductionStartNotified.run(job.key);
    }
  }

  for (const [key, current] of existing) {
    if (seen.has(key)) continue;
    const lastSeenMs = new Date(String(current.last_seen ?? "")).getTime();
    if (Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < productionMissingGraceMs) {
      diagnostics.push({
        status: "debug",
        eventType: "production_completed",
        summary: `Craft missing briefly: ${current.label}`,
        reason: `Craft has been absent for less than ${Math.round(productionMissingGraceMs / 1000)} seconds; completion is delayed to avoid duplicate start notifications from transient API gaps`,
        metadata: discordDiagnosticContext("production_completed", { key, label: current.label, buildingName: current.building_name, crafterName: current.crafter_name, lastSeen: current.last_seen }),
      });
      continue;
    }
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
      diagnostics.push({ status: "skipped", eventType: "production_completed", summary, reason: skipReason, metadata: discordDiagnosticContext("production_completed", metadata) });
      continue;
    }
    statements.insertActivity.run(claimId, "production_completed", summary, occurredAt, JSON.stringify(metadata));
    pendingNotifications.push({ jobKey: key, eventType: "production_completed", summary, occurredAt, metadata });
  }
  return { pendingNotifications, diagnostics };
}

async function deliverProductionNotifications(pendingNotifications = []) {
  for (const notification of pendingNotifications) {
    try {
      await sendDiscordActivity(notification.eventType, notification.summary, notification.occurredAt, notification.metadata);
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

const defaultCraftRoles = {
  forestry: "1511297282769944596",
  carpentry: "1511297283386249358",
  masonry: "1511297283931639808",
  mining: "1511297284724494399",
  smithing: "1511297285772804206",
  scholar: "1511297286469324890",
  leatherworking: "1511297288511815751",
  tailoring: "1511297287157055632",
  farming: "1511297288176144425",
  fishing: "1511297635665969222",
  cooking: "1511297639269011486",
  foraging: "1511297639868665966",
  hunting: "1511297640866906153",
};

const defaultDiscordChannels = {
  notifications: "",
  modNotes: "1509972023927902218",
  modLog: "",
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

const defaultColourRoles = [
  { key: "green1", label: "Green 1", roleName: "Green 1", roleId: "", color: 0x2be56f },
  { key: "green2", label: "Green 2", roleName: "Green 2", roleId: "", color: 0x1fb72e },
  { key: "blue1", label: "Blue 1", roleName: "Blue 1", roleId: "", color: 0x5fa8ff },
  { key: "blue2", label: "Blue 2", roleName: "Blue 2", roleId: "", color: 0x244cff },
  { key: "purple", label: "Purple", roleName: "Purple", roleId: "", color: 0x9b4acb },
  { key: "pink", label: "Pink", roleName: "Pink", roleId: "", color: 0xff4f88 },
  { key: "red", label: "Red", roleName: "Red", roleId: "", color: 0xff2028 },
  { key: "yellow", label: "Yellow", roleName: "Yellow", roleId: "", color: 0xf4c430 },
  { key: "orange", label: "Orange", roleName: "Orange", roleId: "", color: 0xff9f1c },
  { key: "black", label: "Black", roleName: "Black", roleId: "", color: 0x111111 },
  { key: "white", label: "White", roleName: "White", roleId: "", color: 0xf4f4f4 },
];

const defaultRolePanels = [
  {
    key: "access",
    label: "Access Roles",
    channelId: "",
    messageId: "",
    title: "Welcome to Timbersteel Trade!",
    description: "Choose your access role below.",
    mode: "single",
    showHelperText: true,
    options: [
      { key: "citizen", label: "Citizen", roleId: "", emoji: "1️⃣" },
      { key: "visitor", label: "Visitor", roleId: "", emoji: "2️⃣" },
    ],
  },
  {
    key: "professions",
    label: "Profession Roles",
    channelId: "",
    messageId: "",
    title: "Choose Your Professions",
    description: "Select as many profession interests as you like.",
    mode: "multi",
    showHelperText: true,
    options: Object.keys(defaultCraftRoles).map((key) => ({
      key,
      label: key === "leatherworking" ? "Leatherworking" : key[0].toUpperCase() + key.slice(1),
      roleId: defaultCraftRoles[key],
      emoji: "",
    })),
  },
  { key: "events", label: "Event Roles", channelId: "", messageId: "", title: "Event Roles", description: "Choose event pings you want.", mode: "multi", showHelperText: true, options: [] },
  { key: "timezones", label: "Timezone Roles", channelId: "", messageId: "", title: "Timezone Roles", description: "Choose your timezone group.", mode: "single", showHelperText: true, options: [] },
];

const defaultWelcomeFlow = {
  enabled: false,
  channelId: "",
  messageId: "",
  title: "Welcome to Timbersteel Trade",
  message: "Read the welcome steps, choose your roles, then click Ready.",
  readyRoleId: "",
  showNextStep: true,
};

const defaultDiscordPresence = {
  enabled: true,
  status: "online",
  activityType: "watching",
  activityText: "app.timbersteeltrade.com",
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
  productionMinAgeMinutes: 5,
  productionUsers: "",
  supplyReportIntervalDays: 3,
  channels: defaultDiscordChannels,
  notificationChannels: defaultNotificationChannels,
  craftChannels: defaultCraftChannels,
  craftRoles: defaultCraftRoles,
  colourRolesChannelId: "",
  colourRolesMessageId: "",
  colourRoles: defaultColourRoles,
  rolePanels: defaultRolePanels,
  welcomeFlow: defaultWelcomeFlow,
  presence: defaultDiscordPresence,
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

function normalizeDiscordRoleOption(value = {}, index = 0) {
  const label = String(value.label ?? `Role ${index + 1}`).trim() || `Role ${index + 1}`;
  return {
    key: String(value.key ?? (label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `role-${index + 1}`)).trim(),
    label,
    roleId: String(value.roleId ?? "").trim(),
    emoji: String(value.emoji ?? "").trim().slice(0, 16),
  };
}

function normalizeDiscordRolePanel(value = {}, fallback = {}, index = 0) {
  const label = String(value.label ?? fallback.label ?? `Panel ${index + 1}`).trim() || `Panel ${index + 1}`;
  const options = Array.isArray(value.options) ? value.options : fallback.options ?? [];
  return {
    key: String(value.key ?? fallback.key ?? (label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `panel-${index + 1}`)).trim(),
    label,
    channelId: String(value.channelId ?? fallback.channelId ?? "").trim(),
    messageId: String(value.messageId ?? fallback.messageId ?? "").trim(),
    title: String(value.title ?? fallback.title ?? label).trim() || label,
    description: String(value.description ?? fallback.description ?? "").trim(),
    mode: String(value.mode ?? fallback.mode ?? "multi") === "single" ? "single" : "multi",
    showHelperText: value.showHelperText !== undefined ? value.showHelperText !== false : fallback.showHelperText !== false,
    options: options.map((option, optionIndex) => normalizeDiscordRoleOption(option, optionIndex)).filter((option) => option.label),
  };
}

function normalizeDiscordWelcomeFlow(value = {}) {
  return {
    ...defaultWelcomeFlow,
    ...value,
    enabled: value.enabled === true,
    channelId: String(value.channelId ?? "").trim(),
    messageId: String(value.messageId ?? "").trim(),
    title: String(value.title ?? defaultWelcomeFlow.title).trim() || defaultWelcomeFlow.title,
    message: String(value.message ?? defaultWelcomeFlow.message).trim() || defaultWelcomeFlow.message,
    readyRoleId: String(value.readyRoleId ?? "").trim(),
    showNextStep: value.showNextStep !== false,
  };
}

function normalizeDiscordPresence(value = {}) {
  const status = ["online", "idle", "dnd", "invisible"].includes(String(value.status)) ? String(value.status) : defaultDiscordPresence.status;
  const activityType = ["playing", "watching", "listening", "competing"].includes(String(value.activityType)) ? String(value.activityType) : defaultDiscordPresence.activityType;
  const activityText = String(value.activityText ?? defaultDiscordPresence.activityText).trim().slice(0, 128) || defaultDiscordPresence.activityText;
  return {
    ...defaultDiscordPresence,
    ...value,
    enabled: value.enabled !== false,
    status,
    activityType,
    activityText,
  };
}

function normalizeDiscordSettings(value = {}) {
  const notify = { ...defaultDiscordSettings.notify, ...(value.notify ?? {}) };
  const savedColourRoles = Array.isArray(value.colourRoles) ? value.colourRoles : [];
  const colourRoleSource = Array.isArray(value.colourRoles) ? savedColourRoles : defaultColourRoles;
  const rolePanelSource = Array.isArray(value.rolePanels) ? value.rolePanels : defaultRolePanels;
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
    productionMinXp: Math.max(value.productionMinXp == null ? 40000 : toNumber(value.productionMinXp), 0),
    productionMinAgeMinutes: Math.max((value.productionMinAgeMinutes ?? value.productionMinAgeMins) == null ? 5 : toNumber(value.productionMinAgeMinutes ?? value.productionMinAgeMins), 0),
    productionUsers: String(value.productionUsers ?? "").trim(),
    supplyReportIntervalDays: Math.max(toNumber(value.supplyReportIntervalDays) || 3, 1),
    channels: { ...defaultDiscordChannels, ...(value.channels ?? {}), notifications: String(value.channelId ?? value.channels?.notifications ?? "").trim() },
    notificationChannels: { ...defaultNotificationChannels, ...(value.notificationChannels ?? {}) },
    craftChannels: { ...defaultCraftChannels, ...(value.channels ?? {}), ...(value.craftChannels ?? {}) },
    craftRoles: { ...defaultCraftRoles, ...(value.craftRoles ?? {}) },
    colourRolesChannelId: String(value.colourRolesChannelId ?? "").trim(),
    colourRolesMessageId: String(value.colourRolesMessageId ?? "").trim(),
    colourRoles: colourRoleSource.map((item, index) => {
      const entry = defaultColourRoles[index] ?? {};
      const saved = item ?? {};
      const savedRoleName = String(saved.roleName ?? "");
      const label = String(saved.label ?? entry.label ?? "New Colour").trim() || "New Colour";
      return {
        key: String(saved.key ?? entry.key ?? `colour-${index + 1}`).trim() || `colour-${index + 1}`,
        label,
        roleName: savedRoleName.trim() || String(entry.roleName ?? label),
        roleId: String(saved.roleId ?? "").trim(),
        color: Math.max(toNumber(saved.color ?? entry.color), 0),
      };
    }),
    rolePanels: rolePanelSource.map((panel, index) => normalizeDiscordRolePanel(panel, defaultRolePanels[index], index)),
    welcomeFlow: normalizeDiscordWelcomeFlow(value.welcomeFlow ?? {}),
    presence: normalizeDiscordPresence(value.presence ?? {}),
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

const domainCollectorDefaults = {
  claim: { label: "Claim", intervalSeconds: 30 },
  members: { label: "Members", intervalSeconds: 30 },
  players: { label: "Player details", intervalSeconds: 60 },
  professions: { label: "Professions", intervalSeconds: 30 },
  production: { label: "Production", intervalSeconds: 30 },
  inventory: { label: "Inventory and storage", intervalSeconds: 60 },
  construction: { label: "Construction", intervalSeconds: 60 },
  research: { label: "Research", intervalSeconds: 600 },
  market: { label: "Market", intervalSeconds: 60 },
  region: { label: "Region", intervalSeconds: 300 },
  mapCatalog: { label: "Map/catalog", intervalSeconds: 600 },
  snapshotHistory: { label: "Snapshot and history", intervalSeconds: 60 },
  storageActivity: { label: "Storage activity", intervalSeconds: 60 },
  marketTrades: { label: "Member market trades", intervalSeconds: 60 },
};

const domainPayloadKeys = ["claim", "members", "citizens", "buildings", "construction", "research", "market", "crafts", "players", "playerDetailDiagnostics", "contributions", "region", "regionStatus", "tradeVolume", "inventories", "recruitment", "layout", "skills"];
const collectorPrimaryPayloadDomain = {
  claim: "claim",
  members: "members",
  players: "players",
  professions: "citizens",
  production: "crafts",
  inventory: "inventories",
  construction: "construction",
  research: "research",
  market: "market",
  region: "region",
  mapCatalog: "skills",
};

function normalizeCollectorSettings(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(domainCollectorDefaults).map(([key, defaults]) => {
    const saved = source[key] && typeof source[key] === "object" ? source[key] : {};
    return [key, {
      label: defaults.label,
      enabled: saved.enabled !== false,
      intervalSeconds: Math.min(Math.max(toNumber(saved.intervalSeconds ?? saved.intervalMs / 1000) || defaults.intervalSeconds, 15), 3600),
    }];
  }));
}

function getCollectorSettings() {
  return normalizeCollectorSettings(safeJson(statements.getSetting.get("collector_settings_json")?.value, {}));
}

function getSettings() {
  const theme = safeJson(statements.getSetting.get("theme_json")?.value, defaultTheme);
  const toastSettings = safeJson(statements.getSetting.get("toast_json")?.value, { marketListings: true, marketSales: true, production: true });
  const branding = safeJson(statements.getSetting.get("branding_json")?.value, {});
  const excludedMemberIds = safeJson(statements.getSetting.get("excluded_member_ids_json")?.value, []);
  const savedDefaultPage = statements.getSetting.get("default_page")?.value ?? "dashboard";
  return {
    claimId: statements.getSetting.get("claim_id")?.value ?? defaultClaimId,
    syncUrl: statements.getSetting.get("bitcraft_sync_url")?.value ?? defaultSyncUrl,
    excludedMemberIds: Array.isArray(excludedMemberIds) ? [...new Set(excludedMemberIds.map((value) => String(value ?? "").trim()).filter(Boolean))] : [],
    theme: { ...defaultTheme, ...theme },
    refreshSeconds: Math.min(Math.max(toNumber(statements.getSetting.get("refresh_seconds")?.value) || 30, 15), 300),
    serverRefreshSeconds: Math.min(Math.max(toNumber(statements.getSetting.get("server_refresh_seconds")?.value) || Math.round(snapshotIntervalMs / 1000), 15), 300),
    collectorSettings: getCollectorSettings(),
    defaultPage: validPage(savedDefaultPage) ? savedDefaultPage : "dashboard",
    defaultRegion: statements.getSetting.get("default_region")?.value ?? "",
    additionalActiveRegions: statements.getSetting.get("active_region_overrides")?.value ?? "",
    toastSettings: { marketListings: true, marketSales: true, production: true, ...toastSettings },
    branding,
    snapshotRetentionDays: Math.min(Math.max(toNumber(statements.getSetting.get("snapshot_retention_days")?.value) || 365, 30), 3650),
    visitorSecurity: visitorSecuritySettings(),
    browserSnapshotsEnabled: false,
    discord: publicDiscordSettings(),
  };
}

const pollStatus = {
  enabled: serverPollingEnabled,
  intervalMs: Math.min(Math.max(toNumber(statements.getSetting.get("server_refresh_seconds")?.value) || Math.round(snapshotIntervalMs / 1000), 15), 300) * 1000,
  running: false,
  nextRunAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  collectors: Object.fromEntries(Object.entries(getCollectorSettings()).map(([key, value]) => [key, { ...value, intervalMs: value.intervalSeconds * 1000, lastAttemptAt: null, lastSuccessAt: null, lastError: null, durationMs: null, nextRunAt: null }])),
  storageLastAttemptAt: null,
  storageLastSuccessAt: null,
  storageLastError: null,
  storageRequests: 0,
  storageInserted: 0,
};

function serverRefreshIntervalMs() {
  const seconds = Math.min(Math.max(toNumber(statements.getSetting.get("server_refresh_seconds")?.value) || Math.round(snapshotIntervalMs / 1000), 15), 300);
  return seconds * 1000;
}

function refreshCollectorStatusSettings() {
  const settings = getCollectorSettings();
  for (const [key, value] of Object.entries(settings)) {
    setCollectorStatus(key, {
      label: value.label,
      enabled: serverPollingEnabled && value.enabled,
      intervalSeconds: value.intervalSeconds,
      intervalMs: value.intervalSeconds * 1000,
    });
  }
}

function setCollectorStatus(key, patch = {}) {
  const current = pollStatus.collectors[key] ?? { label: key, enabled: serverPollingEnabled };
  pollStatus.collectors[key] = { ...current, ...patch };
}

function collectorAttempt(key) {
  setCollectorStatus(key, { lastAttemptAt: new Date().toISOString(), lastError: null });
  return Date.now();
}

function collectorSuccess(key, startedAt) {
  setCollectorStatus(key, {
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
    durationMs: Math.max(Date.now() - startedAt, 0),
  });
}

function collectorFailure(key, startedAt, error) {
  setCollectorStatus(key, {
    lastError: error instanceof Error ? error.message : String(error),
    durationMs: Math.max(Date.now() - startedAt, 0),
  });
}

function validSyncUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "bitcraftsync.app";
  } catch {
    return false;
  }
}

function validPage(value) {
  return ["dashboard", "leaderboard", "overview", "members", "skills", "production", "publiccrafts", "craftcalc", "inventory", "construction", "research", "market", "empire", "map", "sync", "activity"].includes(value);
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
const upstreamInflight = new Map();
const regionCache = new Map();
let activeRegionsCache = null;
const claimDetailCache = new Map();
const playerDetailCache = new Map();
const craftContributionCache = new Map();
const passiveCraftsCache = new Map();
const productionCraftsCache = new Map();
let mapCatalogCache = null;
const rateLimitBuckets = new Map();
const UPSTREAM_CACHE_TTL_MS = Math.max(1000, Number(process.env.BITJITA_PROXY_CACHE_MS ?? 15000));
const UPSTREAM_CACHE_MAX_ENTRIES = Math.max(25, Number(process.env.BITJITA_PROXY_CACHE_MAX_ENTRIES ?? 300));
const BITJITA_PROXY_CACHE_POLICIES = [
  { pattern: /^\/api\/(?:resources|creatures|skills|items|cargos|recipes|crafting-recipes)(?:\/|$)/, ttlMs: 60 * 60 * 1000 },
  { pattern: /^\/api\/market$/, ttlMs: 5 * 60 * 1000 },
  { pattern: /^\/api\/players\/[^/]+$/, ttlMs: 60 * 1000 },
  { pattern: /^\/api\/claims\/[^/]+\/(?:members|citizens)$/, ttlMs: 30 * 1000 },
  { pattern: /^\/api\/claims\/[^/]+\/(?:market\/listings|buildings|inventories|construction|research|layout)$/, ttlMs: 15 * 1000 },
  { pattern: /^\/api\/crafts(?:\/|$)/, ttlMs: 15 * 1000 },
  { pattern: /^\/api\/logs\/storage$/, ttlMs: 10 * 1000 },
];

const BODY_LIMITS = {
  auth: 8 * 1024,
  analytics: 8 * 1024,
  json: 64 * 1024,
  settings: 256 * 1024,
  branding: 2 * 1024 * 1024,
  snapshot: 1024 * 1024,
  discordInteraction: 256 * 1024,
};

class RequestBodyTooLargeError extends Error {
  constructor(limit) {
    super(`Request body is too large; maximum size is ${limit} bytes`);
    this.statusCode = 413;
  }
}

const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, max: 30 },
  analytics: { windowMs: 60 * 1000, max: 120 },
  discordInteraction: { windowMs: 60 * 1000, max: 120 },
  proxy: { windowMs: 60 * 1000, max: 600 },
  expensiveLocal: { windowMs: 60 * 1000, max: 60 },
};

function requestAddress(req) {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
}

function normalizeIpAddress(value) {
  let ip = String(value ?? "").trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

function anonymizeIpAddress(value) {
  const ip = normalizeIpAddress(value);
  const parts = ip.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":") + "::";
  }
  return "unknown";
}

function ipHash(value) {
  return createHash("sha256").update(`${appIdentifier}|${normalizeIpAddress(value)}`).digest("hex");
}

function visitorSecuritySettings(includeSecrets = false) {
  const saved = safeJson(statements.getSetting.get("visitor_security_json")?.value, {});
  const licenseKey = String(saved.geoipLicenseKey ?? "").trim();
  const provider = ["ipapi", "local", "disabled"].includes(String(saved.geoipProvider ?? "ipapi")) ? String(saved.geoipProvider ?? "ipapi") : "ipapi";
  const settings = {
    fullIpRetentionDays: Math.min(Math.max(toNumber(saved.fullIpRetentionDays) || 7, 1), 30),
    statsRetentionDays: Math.min(Math.max(toNumber(saved.statsRetentionDays) || 180, 30), 730),
    geoipProvider: provider,
    geoipCacheDays: Math.min(Math.max(Math.floor(toNumber(saved.geoipCacheDays) || 30), 1), 90),
    geoipSourceUrl: String(saved.geoipSourceUrl ?? "").trim(),
    geoipAccountId: String(saved.geoipAccountId ?? "").trim(),
    geoipLicenseKeyConfigured: Boolean(licenseKey),
  };
  if (includeSecrets) settings.geoipLicenseKey = licenseKey;
  return settings;
}

function routeGroup(pathname) {
  if (pathname.startsWith("/api/local/admin")) return "admin";
  if (pathname.startsWith("/api/local/auth") || pathname.startsWith("/api/local/user")) return "auth";
  if (pathname.startsWith("/api/discord")) return "discord";
  if (pathname.startsWith("/api/bitjita")) return "bitjita-proxy";
  if (pathname.startsWith("/api/local")) return "local-api";
  if (pathname.startsWith("/assets/") || pathname === "/favicon.svg" || pathname === "/favicon.ico") return "static";
  return "app";
}

function shouldLogVisitor(pathname) {
  return routeGroup(pathname) !== "static";
}

function ipv4ToNumber(ip) {
  const parts = String(ip).split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function ipv4CidrMatch(ip, cidr) {
  const [base, bitsText = "32"] = String(cidr).split("/");
  const bits = Number(bitsText);
  const ipNum = ipv4ToNumber(ip);
  const baseNum = ipv4ToNumber(base);
  if (ipNum == null || baseNum == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function ipv4CidrRange(cidr) {
  const [base, bitsText = "32"] = String(cidr).split("/");
  const bits = Number(bitsText);
  const baseNum = ipv4ToNumber(base);
  if (baseNum == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const start = (baseNum & mask) >>> 0;
  const size = 2 ** (32 - bits);
  const end = (start + size - 1) >>> 0;
  return { start, end };
}

let geoipCache = { mtimeMs: 0, entries: null, error: null };
const pendingProviderGeoipLookups = new Set();

function isLocalOrPrivateIpAddress(ip) {
  const normalized = normalizeIpAddress(ip);
  if (!normalized) return true;
  if (normalized === "127.0.0.1" || normalized === "0.0.0.0") return true;
  const ipNum = ipv4ToNumber(normalized);
  if (ipNum != null) {
    return ipv4CidrMatch(normalized, "10.0.0.0/8")
      || ipv4CidrMatch(normalized, "172.16.0.0/12")
      || ipv4CidrMatch(normalized, "192.168.0.0/16")
      || ipv4CidrMatch(normalized, "169.254.0.0/16");
  }
  const lower = normalized.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

function cacheProviderGeoipResult(ip, provider, country, city, error = null, ttlDays = 30) {
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(ttlDays, 1) * 24 * 60 * 60 * 1000).toISOString();
  const key = ipHash(ip);
  statements.upsertVisitorGeoipCache.run(
    key,
    anonymizeIpAddress(ip),
    provider,
    country || "Unknown",
    city || "",
    nowIso,
    expiresAt,
    error,
  );
  if (!error && country && country !== "Unknown") {
    statements.updateVisitorSecurityLocationByIpHash.run(country, city || "", key);
  }
}

async function refreshProviderGeoip(ip, settings) {
  const normalized = normalizeIpAddress(ip);
  const key = ipHash(normalized);
  if (!normalized || isLocalOrPrivateIpAddress(normalized) || pendingProviderGeoipLookups.has(key)) return;
  pendingProviderGeoipLookups.add(key);
  try {
    const response = await fetch(`${ipapiBaseUrl}/${encodeURIComponent(normalized)}/json/`, {
      headers: { "user-agent": appIdentifier },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error(String(payload.reason ?? payload.error));
    const country = String(payload.country_name || payload.country || "Unknown").trim() || "Unknown";
    const city = String(payload.city || "").trim();
    cacheProviderGeoipResult(normalized, "ipapi", country, city, null, settings.geoipCacheDays);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cacheProviderGeoipResult(normalized, "ipapi", "Unknown", "", message, 1);
  } finally {
    pendingProviderGeoipLookups.delete(key);
  }
}

function parseGeoipData(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.ranges) ? parsed.ranges : [];
    return entries.map((entry) => ({
      cidr: String(entry.cidr ?? entry.range ?? "").trim(),
      country: String(entry.country ?? entry.countryName ?? "Unknown").trim() || "Unknown",
      city: String(entry.city ?? entry.cityName ?? "").trim(),
    })).filter((entry) => entry.cidr);
  } catch {
    return trimmed.split(/\r?\n/).slice(1).map((line) => {
      const [cidr, country, city] = line.split(",").map((part) => part.trim());
      return { cidr, country: country || "Unknown", city: city || "" };
    }).filter((entry) => entry.cidr);
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < String(line).length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsvRecords(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()]));
  });
}

function readZipEntries(buffer, shouldExtract = () => true) {
  const bytes = Buffer.from(buffer);
  const endSignature = 0x06054b50;
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP archive is missing an end-of-central-directory record");
  const totalEntries = bytes.readUInt16LE(endOffset + 10);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  const entries = new Map();
  let pointer = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (bytes.readUInt32LE(pointer) !== 0x02014b50) throw new Error("ZIP archive has an invalid central directory");
    const compression = bytes.readUInt16LE(pointer + 10);
    const compressedSize = bytes.readUInt32LE(pointer + 20);
    const uncompressedSize = bytes.readUInt32LE(pointer + 24);
    const nameLength = bytes.readUInt16LE(pointer + 28);
    const extraLength = bytes.readUInt16LE(pointer + 30);
    const commentLength = bytes.readUInt16LE(pointer + 32);
    const localOffset = bytes.readUInt32LE(pointer + 42);
    const name = bytes.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");
    if (!shouldExtract(name)) {
      pointer += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP archive has an invalid local header for ${name}`);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (compression === 0) data = compressed;
    else if (compression === 8) data = inflateRawSync(compressed);
    else throw new Error(`ZIP entry ${name} uses unsupported compression method ${compression}`);
    if (uncompressedSize && data.length !== uncompressedSize) throw new Error(`ZIP entry ${name} has an unexpected size`);
    entries.set(name, data.toString("utf8"));
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseMaxMindCityCsvZip(buffer) {
  const entries = readZipEntries(buffer, (name) => /GeoLite2-City-(Locations-en|Blocks-IPv4)\.csv$/i.test(name));
  const locationsEntry = [...entries.entries()].find(([name]) => /GeoLite2-City-Locations-en\.csv$/i.test(name));
  const blocksEntry = [...entries.entries()].find(([name]) => /GeoLite2-City-Blocks-IPv4\.csv$/i.test(name));
  if (!locationsEntry || !blocksEntry) throw new Error("GeoIP ZIP must contain GeoLite2-City-Locations-en.csv and GeoLite2-City-Blocks-IPv4.csv");
  const locations = new Map(parseCsvRecords(locationsEntry[1]).map((row) => [
    String(row.geoname_id ?? ""),
    {
      country: String(row.country_name || row.country_iso_code || "Unknown").trim() || "Unknown",
      city: String(row.city_name || "").trim(),
    },
  ]));
  return parseCsvRecords(blocksEntry[1]).map((row) => {
    const location = locations.get(String(row.geoname_id ?? "")) || locations.get(String(row.registered_country_geoname_id ?? "")) || {};
    return {
      cidr: String(row.network ?? "").trim(),
      country: String(location.country ?? "Unknown").trim() || "Unknown",
      city: String(location.city ?? "").trim(),
    };
  }).filter((entry) => entry.cidr);
}

function* csvLineIterator(text) {
  const source = String(text ?? "");
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    const char = source[index];
    if (index === source.length || char === "\n") {
      const line = source.slice(start, index).replace(/\r$/, "");
      start = index + 1;
      if (line.trim()) yield line;
    }
  }
}

function* csvRecordIterator(text) {
  const iterator = csvLineIterator(text);
  const first = iterator.next();
  if (first.done) return;
  const headers = parseCsvLine(first.value).map((header) => header.trim());
  for (const line of iterator) {
    const values = parseCsvLine(line);
    yield Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()]));
  }
}

async function importMaxMindCityCsvZipToSqlite(buffer, progress = () => {}) {
  const zipEntries = readZipEntries(buffer, (name) => /GeoLite2-City-(Locations-en|Blocks-IPv4)\.csv$/i.test(name));
  const locationsEntry = [...zipEntries.entries()].find(([name]) => /GeoLite2-City-Locations-en\.csv$/i.test(name));
  const blocksEntry = [...zipEntries.entries()].find(([name]) => /GeoLite2-City-Blocks-IPv4\.csv$/i.test(name));
  if (!locationsEntry || !blocksEntry) throw new Error("GeoIP ZIP must contain GeoLite2-City-Locations-en.csv and GeoLite2-City-Blocks-IPv4.csv");
  progress({ stage: "indexing_locations" });
  const locations = new Map();
  let locationRows = 0;
  for (const row of csvRecordIterator(locationsEntry[1])) {
    const key = String(row.geoname_id ?? "");
    if (key) {
      locations.set(key, {
        country: String(row.country_name || row.country_iso_code || "Unknown").trim() || "Unknown",
        city: String(row.city_name || "").trim(),
      });
    }
    locationRows += 1;
    if (locationRows % 5000 === 0) {
      progress({ stage: "indexing_locations", locationRows });
      await delay(0);
    }
  }

  progress({ stage: "writing_ranges", locationRows, rangeRows: 0 });
  const updatedAt = new Date().toISOString();
  db.exec(`
    DROP TABLE IF EXISTS geoip_ranges_import;
    CREATE TABLE geoip_ranges_import (
      ip_start INTEGER NOT NULL,
      ip_end INTEGER NOT NULL,
      country TEXT NOT NULL,
      city TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (ip_start, ip_end)
    );
  `);
  const insertImportRange = db.prepare("INSERT OR IGNORE INTO geoip_ranges_import (ip_start, ip_end, country, city, updated_at) VALUES (?, ?, ?, ?, ?)");
  try {
    let count = 0;
    db.exec("BEGIN");
    for (const row of csvRecordIterator(blocksEntry[1])) {
      const cidr = String(row.network ?? "").trim();
      if (!cidr) continue;
      const range = ipv4CidrRange(cidr);
      if (!range) continue;
      const location = locations.get(String(row.geoname_id ?? "")) || locations.get(String(row.registered_country_geoname_id ?? "")) || {};
      insertImportRange.run(range.start, range.end, String(location.country ?? "Unknown").trim() || "Unknown", String(location.city ?? "").trim(), updatedAt);
      count += 1;
      if (count % 25000 === 0) {
        db.exec("COMMIT");
        progress({ stage: "writing_ranges", locationRows, rangeRows: count });
        db.exec("BEGIN");
        await delay(0);
      }
    }
    db.exec("COMMIT");
    db.exec(`
      DELETE FROM geoip_ranges;
      INSERT INTO geoip_ranges (ip_start, ip_end, country, city, updated_at)
      SELECT ip_start, ip_end, country, city, updated_at FROM geoip_ranges_import;
      DROP TABLE geoip_ranges_import;
    `);
    return { entries: count, locationRows };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    try {
      db.exec("DROP TABLE IF EXISTS geoip_ranges_import");
    } catch {}
    throw error;
  }
}

function parseGeoipDownload(body, contentType = "") {
  const buffer = Buffer.from(body);
  const looksZip = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
  if (looksZip || /zip/i.test(contentType)) return parseMaxMindCityCsvZip(buffer);
  return parseGeoipData(buffer.toString("utf8"));
}

function geoipFileEntryCount() {
  if (!existsSync(geoipDataPath)) return 0;
  const stat = statSync(geoipDataPath);
  if (stat.size > maxGeoipJsonFallbackBytes) {
    geoipCache = {
      mtimeMs: stat.mtimeMs,
      entries: [],
      error: `GeoIP JSON fallback is too large to load safely (${Math.round(stat.size / 1024 / 1024)} MB). Run the GeoIP refresh again to import it into SQLite.`,
    };
    return 0;
  }
  const tailLength = Math.min(stat.size, 4096);
  if (!tailLength) return 0;
  const fd = openSync(geoipDataPath, "r");
  try {
    const buffer = Buffer.alloc(tailLength);
    readSync(fd, buffer, 0, tailLength, stat.size - tailLength);
    const tail = buffer.toString("utf8");
    const match = tail.match(/"count"\s*:\s*(\d+)/);
    if (match) return Number(match[1]);
  } finally {
    closeSync(fd);
  }
  return loadGeoipEntries().length;
}

function geoipStatus() {
  const settings = visitorSecuritySettings();
  if (settings.geoipProvider === "ipapi") {
    return {
      configured: true,
      provider: "ipapi",
      storage: "provider-cache",
      path: null,
      entries: toNumber(statements.visitorGeoipCacheCount.get()?.count),
      lastUpdatedAt: statements.visitorGeoipCacheLastLookup.get()?.looked_up_at ?? null,
      error: null,
    };
  }
  if (settings.geoipProvider === "disabled") {
    return { configured: false, provider: "disabled", storage: "disabled", path: null, entries: 0, lastUpdatedAt: null, error: null };
  }
  const sqliteEntries = toNumber(statements.geoipRangeCount.get()?.count);
  if (sqliteEntries > 0) {
    return {
      configured: true,
      provider: "local",
      storage: "sqlite",
      path: databasePath,
      entries: sqliteEntries,
      lastUpdatedAt: statements.geoipRangeLastUpdated.get()?.updated_at ?? null,
      error: geoipCache.error,
    };
  }
  if (!existsSync(geoipDataPath)) {
    return { configured: false, provider: "local", storage: "none", path: geoipDataPath, entries: 0, lastUpdatedAt: null, error: null };
  }
  try {
    const stat = statSync(geoipDataPath);
    if (stat.size > maxGeoipJsonFallbackBytes) {
      return {
        configured: false,
        storage: "json-skipped",
        path: geoipDataPath,
        entries: 0,
        lastUpdatedAt: new Date(stat.mtimeMs).toISOString(),
        error: `GeoIP JSON fallback is too large to load safely (${Math.round(stat.size / 1024 / 1024)} MB). Run the GeoIP refresh again to import it into SQLite.`,
      };
    }
    return { configured: true, provider: "local", storage: "json", path: geoipDataPath, entries: geoipFileEntryCount(), lastUpdatedAt: new Date(stat.mtimeMs).toISOString(), error: geoipCache.error };
  } catch (error) {
    return { configured: false, provider: "local", storage: "none", path: geoipDataPath, entries: 0, lastUpdatedAt: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function loadGeoipEntries() {
  if (!existsSync(geoipDataPath)) return [];
  const stat = statSync(geoipDataPath);
  if (stat.size > maxGeoipJsonFallbackBytes) {
    geoipCache = {
      mtimeMs: stat.mtimeMs,
      entries: [],
      error: `GeoIP JSON fallback is too large to load safely (${Math.round(stat.size / 1024 / 1024)} MB). Run the GeoIP refresh again to import it into SQLite.`,
    };
    return [];
  }
  if (geoipCache.entries && geoipCache.mtimeMs === stat.mtimeMs) return geoipCache.entries;
  try {
    const entries = parseGeoipData(readFileSync(geoipDataPath, "utf8"));
    geoipCache = { mtimeMs: stat.mtimeMs, entries, error: null };
    return entries;
  } catch (error) {
    geoipCache = { mtimeMs: stat.mtimeMs, entries: [], error: error instanceof Error ? error.message : String(error) };
    return [];
  }
}

function lookupGeoip(ipAddress) {
  const ip = normalizeIpAddress(ipAddress);
  const settings = visitorSecuritySettings();
  if (settings.geoipProvider === "disabled") return { country: "Unknown", city: "" };
  if (settings.geoipProvider === "ipapi") {
    if (isLocalOrPrivateIpAddress(ip)) return { country: "Unknown", city: "" };
    const cached = statements.getVisitorGeoipCache.get(ipHash(ip));
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return { country: cached.country || "Unknown", city: cached.city || "" };
    }
    void refreshProviderGeoip(ip, settings).catch(() => {});
    return { country: "Unknown", city: "" };
  }
  const ipNum = ipv4ToNumber(ip);
  if (ipNum != null) {
    const row = statements.lookupGeoipRange.get(ipNum, ipNum);
    if (row) return { country: row.country || "Unknown", city: row.city || "" };
  }
  for (const entry of loadGeoipEntries()) {
    if (ipv4CidrMatch(ip, entry.cidr)) return { country: entry.country || "Unknown", city: entry.city || "" };
  }
  return { country: "Unknown", city: "" };
}

let lastVisitorSecurityPruneAt = 0;

function pruneVisitorSecurityEvents() {
  const settings = visitorSecuritySettings();
  const nowMs = Date.now();
  const fullIpBefore = new Date(nowMs - settings.fullIpRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const statsBefore = new Date(nowMs - settings.statsRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("UPDATE visitor_security_events SET ip_address = NULL WHERE occurred_at < ? AND ip_address IS NOT NULL").run(fullIpBefore);
  db.prepare("DELETE FROM visitor_security_events WHERE occurred_at < ?").run(statsBefore);
  statements.pruneVisitorGeoipCache.run(new Date(nowMs).toISOString());
  lastVisitorSecurityPruneAt = nowMs;
}

function recordVisitorSecurityEvent(req, pathname, statusCode) {
  if (!shouldLogVisitor(pathname)) return;
  const nowIso = new Date().toISOString();
  if (Date.now() - lastVisitorSecurityPruneAt > 60 * 60 * 1000) pruneVisitorSecurityEvents();
  const ip = normalizeIpAddress(requestAddress(req));
  const anonymized = anonymizeIpAddress(ip);
  const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500);
  const userAgentHash = userAgent ? createHash("sha256").update(userAgent).digest("hex") : null;
  const visitorKey = createHash("sha256").update(`${anonymized}|${userAgentHash ?? ""}`).digest("hex");
  const location = lookupGeoip(ip);
  statements.insertVisitorSecurityEvent.run(
    nowIso,
    String(req.method ?? "GET"),
    routeGroup(pathname),
    toNumber(statusCode) || 0,
    `${Math.floor((toNumber(statusCode) || 0) / 100)}xx`,
    ip || null,
    anonymized,
    ipHash(ip),
    visitorKey,
    userAgentHash,
    location.country,
    location.city,
  );
}

function visitorSecurityDashboard(days = 30) {
  const selectedDays = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(Date.now() - selectedDays * 24 * 60 * 60 * 1000).toISOString();
  const totals = db.prepare(`
    SELECT COUNT(*) AS requests,
      COUNT(DISTINCT visitor_key) AS uniqueVisitors,
      COUNT(CASE WHEN status_code >= 400 THEN 1 END) AS errors
    FROM visitor_security_events WHERE occurred_at >= ?
  `).get(since);
  const locations = db.prepare(`
    SELECT COALESCE(country, 'Unknown') AS country, COALESCE(city, '') AS city,
      COUNT(*) AS requests, COUNT(DISTINCT visitor_key) AS visitors
    FROM visitor_security_events
    WHERE occurred_at >= ?
    GROUP BY COALESCE(country, 'Unknown'), COALESCE(city, '')
    ORDER BY requests DESC, visitors DESC
    LIMIT 30
  `).all(since);
  const routes = db.prepare(`
    SELECT route_group AS routeGroup, COUNT(*) AS requests, COUNT(CASE WHEN status_code >= 400 THEN 1 END) AS errors
    FROM visitor_security_events
    WHERE occurred_at >= ?
    GROUP BY route_group
    ORDER BY requests DESC
    LIMIT 20
  `).all(since);
  const recent = db.prepare(`
    SELECT id, occurred_at AS occurredAt, method, route_group AS routeGroup, status_code AS statusCode,
      ip_address AS ipAddress, ip_anonymized AS ipAnonymized, country, city
    FROM visitor_security_events
    ORDER BY occurred_at DESC, id DESC
    LIMIT 50
  `).all();
  const retentionSettings = visitorSecuritySettings();
  return {
    days: selectedDays,
    retention: { ...retentionSettings, fullIpDays: retentionSettings.fullIpRetentionDays },
    geoip: geoipStatus(),
    totals,
    locations,
    routes,
    recent,
  };
}

function rateLimit(req, res, name, policy = RATE_LIMITS.expensiveLocal) {
  const now = Date.now();
  const key = `${name}:${requestAddress(req) || "unknown"}`;
  const current = rateLimitBuckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + policy.windowMs };
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  if (bucket.count <= policy.max) return true;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  send(res, 429, {
    error: "Too many requests. Please slow down and try again shortly.",
    source: "local-rate-limit",
    retryAfter,
  }, { "retry-after": String(retryAfter), "x-rate-limit-source": "local" });
  return false;
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

function validDiscordId(value) {
  return /^\d{15,25}$/.test(String(value ?? "").trim());
}

const ADMIN_ROLE_LABELS = {
  owner: "Owner",
  admin: "Administrator",
  "discord-manager": "Discord Manager",
  moderator: "Moderator",
  viewer: "Viewer",
};

const ADMIN_ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: [
    "status.view",
    "settings.view",
    "settings.manage",
    "data.view",
    "data.export",
    "data.manage",
    "accounts.manage",
    "analytics.view",
    "analytics.manage",
    "audit.view",
    "discord.view",
    "discord.manage",
    "discord.moderate",
  ],
  "discord-manager": ["status.view", "settings.view", "discord.view", "discord.manage"],
  moderator: ["status.view", "settings.view", "discord.view", "discord.moderate", "audit.view"],
  viewer: ["status.view", "settings.view", "data.view", "analytics.view", "audit.view", "discord.view"],
};

function normalizeAdminRole(value) {
  const role = String(value ?? "viewer").trim().toLowerCase();
  return Object.hasOwn(ADMIN_ROLE_LABELS, role) ? role : "viewer";
}

function publicAdminUser(row) {
  if (!row) return null;
  const role = normalizeAdminRole(row.role);
  return {
    id: row.id,
    username: row.username,
    discordId: String(row.discord_id ?? ""),
    discordUsername: String(row.discord_username ?? ""),
    discordGlobalName: String(row.discord_global_name ?? ""),
    avatarUrl: userAvatarUrl(row),
    role,
    roleLabel: ADMIN_ROLE_LABELS[role],
    permissions: adminPermissions(role),
  };
}

function adminPermissions(role) {
  return ADMIN_ROLE_PERMISSIONS[normalizeAdminRole(role)] ?? ADMIN_ROLE_PERMISSIONS.viewer;
}

function adminHasPermission(user, permission) {
  const permissions = adminPermissions(user?.role);
  return permissions.includes("*") || permissions.includes(permission);
}

function adminPermissionFor(method, pathname) {
  if (pathname === "/api/local/admin/me") return "status.view";
  if (pathname === "/api/local/admin/status") return "status.view";
  if (pathname === "/api/local/admin/settings") return method === "GET" ? "settings.view" : "settings.manage";
  if (pathname === "/api/local/admin/poll" || pathname === "/api/local/admin/collect-now" || pathname === "/api/local/admin/diagnostics") return "data.manage";
  if (pathname.startsWith("/api/local/admin/jobs")) return method === "GET" ? "status.view" : "data.manage";
  if (pathname === "/api/local/admin/branding") return "settings.manage";
  if (pathname === "/api/local/admin/users" || pathname === "/api/local/admin/user/password" || pathname === "/api/local/admin/user/status" || pathname === "/api/local/admin/user/role") return "users.manage";
  if (pathname === "/api/local/admin/sessions/clear") return "users.manage";
  if (pathname === "/api/local/admin/user-accounts") return "accounts.manage";
  if (pathname === "/api/local/admin/user-accounts/approval") return "accounts.manage";
  if (pathname === "/api/local/admin/audit") return "audit.view";
  if (pathname === "/api/local/admin/analytics") return method === "DELETE" ? "analytics.manage" : "analytics.view";
  if (pathname === "/api/local/admin/visitor-security") return "analytics.view";
  if (pathname === "/api/local/admin/tables" || pathname === "/api/local/admin/table") return "data.view";
  if (pathname === "/api/local/admin/export") return "data.export";
  if (pathname === "/api/local/admin/backups" || pathname === "/api/local/admin/backup" || pathname === "/api/local/admin/maintenance/prune") return "data.manage";
  if (pathname.startsWith("/api/local/admin/discord/moderation/")) return "discord.moderate";
  if (pathname.startsWith("/api/local/admin/discord/") && method === "GET") return "discord.view";
  if (pathname.startsWith("/api/local/admin/discord/")) return "discord.manage";
  return "status.view";
}

function requireAdminPermission(req, res, user, permission) {
  if (adminHasPermission(user, permission)) return true;
  send(res, 403, { error: `Administrator role does not allow ${permission.replace(".", " ")}` });
  return false;
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

function originFromRequest(req) {
  const proto = String(req.headers["x-forwarded-proto"] ?? (isProduction ? "https" : "http")).split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  return `${proto || "http"}://${host}`;
}

function discordOAuthConfig(req) {
  const discordSettings = getDiscordSettingsRaw();
  const clientId = String(process.env.DISCORD_OAUTH_CLIENT_ID ?? discordSettings.applicationId ?? "").trim();
  const envSecret = String(process.env.DISCORD_OAUTH_CLIENT_SECRET ?? "").trim();
  const storedSecret = String(statements.getSecret.get("discord_oauth_client_secret")?.value ?? "").trim();
  const clientSecret = envSecret || storedSecret;
  const redirectUri = String(process.env.DISCORD_OAUTH_REDIRECT_URI ?? "").trim() || `${originFromRequest(req)}/api/local/auth/discord/callback`;
  return { clientId, clientSecret, redirectUri, enabled: Boolean(clientId && clientSecret) };
}

function safeReturnPath(value) {
  const text = String(value ?? "/?page=dashboard").trim() || "/?page=dashboard";
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\")) return "/?page=dashboard";
  return text.slice(0, 500);
}

function userAvatarUrl(row) {
  const avatar = String(row?.discord_avatar ?? "").trim();
  const discordId = String(row?.discord_id ?? "").trim();
  return avatar && discordId ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128` : null;
}

function publicAppUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    discordId: String(row.discord_id ?? ""),
    username: String(row.discord_username ?? ""),
    globalName: String(row.discord_global_name ?? ""),
    avatarUrl: userAvatarUrl(row),
    characterPlayerId: String(row.character_player_id ?? ""),
    characterName: String(row.character_name ?? ""),
    characterStatus: String(row.character_status ?? "unlinked"),
    settings: safeJson(row.settings_json, {}),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function getAppUser(req) {
  const token = parseCookies(req).bitcraft_user_session;
  if (!token) return null;
  statements.deleteExpiredUserSessions.run(new Date().toISOString());
  return statements.userBySession.get(tokenHash(token), new Date().toISOString()) ?? null;
}

function createAppUserSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  statements.insertUserSession.run(tokenHash(token), userId, expiresAt.toISOString(), createdAt.toISOString());
  return {
    token,
    cookie: `bitcraft_user_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}${isProduction ? "; Secure" : ""}`,
  };
}

function clearAppUserSession(req) {
  const token = parseCookies(req).bitcraft_user_session;
  if (token) statements.deleteAppUserSession.run(tokenHash(token));
  return `bitcraft_user_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? "; Secure" : ""}`;
}

function authStatus(req) {
  const user = getAppUser(req);
  const config = discordOAuthConfig(req);
  return { user: publicAppUser(user), discordLoginEnabled: config.enabled };
}

function discordProfileDisplayName(profile) {
  return String(profile.global_name ?? profile.username ?? profile.id ?? "Discord user").trim() || "Discord user";
}

function createAdminSessionForDiscordProfile(profile, loginAt) {
  const discordId = String(profile.id ?? "").trim();
  if (!discordId) return null;
  const admin = statements.adminByDiscordId.get(discordId);
  if (!admin) return null;
  const username = discordProfileDisplayName(profile);
  statements.updateAdminDiscordProfile.run(
    username,
    String(profile.username ?? ""),
    String(profile.global_name ?? ""),
    String(profile.avatar ?? ""),
    loginAt,
    admin.id,
  );
  statements.insertLoginEvent.run(username, 1, loginAt, "discord-oauth");
  audit({ id: admin.id, username }, "admin.discord_login", { discordId });
  return createSession(admin.id);
}

function oauthStateSecret() {
  const stored = String(statements.getSecret.get("discord_oauth_state_secret")?.value ?? "").trim();
  if (stored) return stored;
  const generated = randomBytes(32).toString("base64url");
  statements.upsertSecret.run("discord_oauth_state_secret", generated, new Date().toISOString());
  return generated;
}

function signedOAuthStateValue(payload) {
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", oauthStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySignedOAuthStateValue(value) {
  const [encoded, signature, ...extra] = String(value ?? "").split(".");
  if (!encoded || !signature || extra.length) return null;
  const expected = createHmac("sha256", oauthStateSecret()).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return encoded;
}

function authStateCookie(state, returnTo) {
  const payload = JSON.stringify({ state, returnTo: safeReturnPath(returnTo) });
  return `bitcraft_discord_oauth_state=${encodeURIComponent(signedOAuthStateValue(payload))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${isProduction ? "; Secure" : ""}`;
}

function clearAuthStateCookie() {
  return `bitcraft_discord_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? "; Secure" : ""}`;
}

function readAuthStateCookie(req) {
  try {
    const encoded = verifySignedOAuthStateValue(parseCookies(req).bitcraft_discord_oauth_state);
    if (!encoded) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function handleDiscordOAuthStart(req, res, url) {
  const config = discordOAuthConfig(req);
  if (!config.enabled) return send(res, 503, { error: "Discord login is not configured on this server" });
  const state = randomBytes(24).toString("base64url");
  const returnTo = safeReturnPath(url.searchParams.get("returnTo"));
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);
  res.writeHead(302, { location: authorize.toString(), "set-cookie": authStateCookie(state, returnTo) });
  res.end();
  return true;
}

async function handleDiscordOAuthCallback(req, res, url) {
  const config = discordOAuthConfig(req);
  const stateCookie = readAuthStateCookie(req);
  const state = String(url.searchParams.get("state") ?? "");
  const code = String(url.searchParams.get("code") ?? "");
  const error = String(url.searchParams.get("error") ?? "");
  const returnTo = safeReturnPath(stateCookie?.returnTo);
  if (error) {
    res.writeHead(302, { location: `${returnTo}${returnTo.includes("?") ? "&" : "?"}auth=discord-denied`, "set-cookie": clearAuthStateCookie() });
    res.end();
    return true;
  }
  if (!config.enabled || !code || !stateCookie?.state || stateCookie.state !== state) {
    res.writeHead(302, { location: `${returnTo}${returnTo.includes("?") ? "&" : "?"}auth=discord-error`, "set-cookie": clearAuthStateCookie() });
    res.end();
    return true;
  }
  const tokenBody = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  if (!tokenResponse.ok) throw new Error(`Discord OAuth token exchange failed: ${tokenResponse.status}`);
  const tokenJson = await tokenResponse.json();
  const profileResponse = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileResponse.ok) throw new Error(`Discord profile lookup failed: ${profileResponse.status}`);
  const profile = await profileResponse.json();
  const discordId = String(profile.id ?? "").trim();
  if (!/^\d+$/.test(discordId)) throw new Error("Discord profile did not include a usable id");
  const loginAt = new Date().toISOString();
  statements.upsertUserAccount.run(discordId, String(profile.username ?? ""), String(profile.global_name ?? ""), String(profile.avatar ?? ""), loginAt, loginAt);
  const user = statements.userByDiscordId.get(discordId);
  statements.updateUserLastLogin.run(loginAt, user.id);
  const session = createAppUserSession(user.id);
  const adminSession = createAdminSessionForDiscordProfile(profile, loginAt);
  res.writeHead(302, { location: returnTo, "set-cookie": [clearAuthStateCookie(), session.cookie, ...(adminSession ? [adminSession.cookie] : [])] });
  res.end();
  return true;
}

function requireAppUser(req, res) {
  const user = getAppUser(req);
  if (!user) {
    send(res, 401, { error: "Discord sign-in required" });
    return null;
  }
  if (!sameOriginRequest(req)) {
    send(res, 403, { error: "Cross-origin account request rejected" });
    return null;
  }
  return user;
}

function adminStatus(req) {
  const setupRequired = toNumber(statements.adminCount.get()?.count) === 0;
  const user = getSessionUser(req);
  const discordConfig = discordOAuthConfig(req);
  return {
    setupRequired,
    setupKeyRequired: isProduction && setupRequired,
    authenticated: Boolean(user),
    user: publicAdminUser(user),
    csrfToken: user ? csrfToken(req) : null,
    roles: ADMIN_ROLE_LABELS,
    discordLoginEnabled: discordConfig.enabled,
    discordLoginUrl: `${originFromRequest(req)}/api/local/auth/discord/start?returnTo=${encodeURIComponent("/?page=admin")}`,
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
  return { table: name, columns, rows: maskSensitiveTableRows(name, rows), total, limit, offset, timeColumn };
}

function maskSensitiveTableRows(name, rows) {
  if (name !== "app_settings") return rows;
  return rows.map((row) => {
    if (row?.key !== "visitor_security_json" || typeof row.value !== "string") return row;
    const value = safeJson(row.value, null);
    if (!value || typeof value !== "object") return row;
    return {
      ...row,
      value: JSON.stringify({
        ...value,
        geoipLicenseKey: value.geoipLicenseKey ? "[configured]" : "",
      }),
    };
  });
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
const analyticsPages = new Set(["dashboard", "leaderboard", "overview", "members", "skills", "production", "publiccrafts", "craftcalc", "inventory", "construction", "research", "market", "empire", "map", "sync", "activity"]);
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
  if (eventType === "supplies") return !lowSupplyNotificationSkipReason(metadata, settings);
  if (eventType === "app_update") return settings.notify.appUpdates;
  return false;
}

function lowSupplyNotificationSkipReason(metadata = {}, settings = getDiscordSettingsRaw()) {
  if (!settings.notify.lowSupplies) return "Low supply notifications are disabled";
  const runwayDays = toNumber(metadata?.runwayDays);
  if (runwayDays <= 0) return "Supply runway is unknown";
  if (runwayDays >= settings.supplyRunwayDaysThreshold) {
    return `Supply runway ${runwayDays.toFixed(1)} days is above ${settings.supplyRunwayDaysThreshold} day threshold`;
  }
  const lastSent = statements.getSetting.get("discord_last_low_supplies_at")?.value ?? "";
  const lastSentMs = new Date(lastSent).getTime();
  if (Number.isFinite(lastSentMs) && Date.now() - lastSentMs < 24 * 60 * 60 * 1000) {
    const next = new Date(lastSentMs + 24 * 60 * 60 * 1000).toISOString();
    return `Low supply alert already sent today. Next alert available after ${next}`;
  }
  return "";
}

function productionNotificationSkipReason(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  if (!settings.notify.production) return "Craft notifications are disabled";
  if (eventType === "production_started" && !settings.notify.productionStarted) return "Craft started notifications are disabled";
  if (eventType === "production_completed" && !settings.notify.productionCompleted) return "Craft completed notifications are disabled";
  if (eventType === "production_started") {
    const firstSeenMs = new Date(String(metadata.firstSeen ?? metadata.first_seen ?? metadata.firstSeenAt ?? "")).getTime();
    const ageMinutes = Number.isFinite(firstSeenMs) ? (Date.now() - firstSeenMs) / 60000 : 0;
    if (ageMinutes < settings.productionMinAgeMinutes) return `Craft has been present for ${ageMinutes.toFixed(1)} minutes, below ${settings.productionMinAgeMinutes} minutes`;
  }
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

function discordModLogTarget(settings = getDiscordSettingsRaw()) {
  const modLog = String(settings.channels?.modLog ?? "").trim();
  const modNotes = String(settings.channels?.modNotes ?? "").trim();
  if (modLog) return { channelId: modLog, channelKey: "modLog" };
  if (modNotes) return { channelId: modNotes, channelKey: "modNotes" };
  return { channelId: settings.channelId, channelKey: "notifications" };
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
    productionMinAgeMinutes: settings.productionMinAgeMinutes,
    productionUsers: settings.productionUsers,
    craftRoleId: craftWatchRole(metadata, settings)?.roleId ?? "",
    metadata,
  };
}

async function sendDiscordCharacterLinkRequest(userRow, metadata = {}, settings = getDiscordSettingsRaw()) {
  const eventType = "character_link_request";
  const { channelId, channelKey } = discordModLogTarget(settings);
  const accountName = String(userRow.discord_global_name || userRow.discord_username || "Discord user");
  const characterName = String(metadata.characterName || userRow.character_name || "Unknown character");
  const characterPlayerId = String(metadata.characterPlayerId || userRow.character_player_id || "");
  const diagnostics = {
    eventType,
    enabled: Boolean(settings.enabled),
    hasBotToken: Boolean(settings.botToken),
    channelId,
    channelKey,
    discordId: String(userRow.discord_id ?? ""),
    discordUsername: String(userRow.discord_username ?? ""),
    characterName,
    characterPlayerId,
    accountId: userRow.id,
  };
  if (!settings.enabled || !settings.botToken || !channelId) {
    recordDiscordDeliverySafe({
      status: "skipped",
      eventType,
      channelId,
      channelKey,
      summary: `Character link requested: ${characterName}`,
      reason: "Discord disabled, bot token missing, or mod-log channel not configured",
      metadata: diagnostics,
    });
    return { ok: true, skipped: true };
  }
  try {
    const response = await sendDiscordMessage({
      embeds: [discordCommandEmbed("Character Link Review", `**${accountName}** requested a BitCraft character link.`, [
        { name: "Discord", value: `<@${userRow.discord_id}>`, inline: true },
        { name: "Character", value: characterName, inline: true },
        { name: "Player ID", value: characterPlayerId || "Not provided", inline: false },
        { name: "Admin action", value: "Open Admin -> Linked Accounts to approve or reject this request.", inline: false },
      ], 0x56d5ff)],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDeliverySafe({
      status: "sent",
      eventType,
      channelId,
      channelKey,
      summary: `Character link requested: ${characterName}`,
      metadata: diagnostics,
      response: { id: response?.id, channel_id: response?.channel_id },
    });
    return { ok: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({
      status: "failed",
      eventType,
      channelId,
      channelKey,
      summary: `Character link requested: ${characterName}`,
      error: message,
      metadata: diagnostics,
    });
    return { ok: false, error: message };
  }
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

function recordDiscordDeliverySafe(status) {
  try {
    recordDiscordDelivery(status);
  } catch (error) {
    console.warn(`Discord diagnostic log failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function craftWatchProfession(metadata = {}) {
  const key = normalizeProfessionKey(metadata.professionKey ?? metadata.skillName);
  const name = String((metadata.skillName ?? metadata.professionName ?? key) || "Profession").trim();
  return { key, name };
}

function professionLabel(key) {
  const normalized = normalizeProfessionKey(key);
  if (!normalized) return "Profession";
  if (normalized === "leatherworking") return "Leatherworking";
  return `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

function craftWatchRole(metadata = {}, settings = getDiscordSettingsRaw()) {
  const { key } = craftWatchProfession(metadata);
  const roleId = key ? String(settings.craftRoles?.[key] ?? "").trim() : "";
  return roleId ? { key, roleId, mention: `<@&${roleId}>` } : null;
}

function discordCraftWatchComponents(eventType, metadata = {}) {
  if (eventType !== "production_started" && eventType !== "production_completed") return undefined;
  const { key, name } = craftWatchProfession(metadata);
  if (!key) return undefined;
  const label = name.length > 22 ? `${name.slice(0, 19)}...` : name;
  return [{
    type: 1,
    components: [
      { type: 2, style: 1, custom_id: `craftwatch:watch:${key}:${encodeURIComponent(name).slice(0, 80)}`, label: `Toggle ${label} Notifications` },
    ],
  }];
}

async function sendDiscordActivity(eventType, summary, occurredAt, metadata = {}, settings = getDiscordSettingsRaw()) {
  const channelId = discordChannelForEvent(eventType, metadata, settings);
  const channelKey = discordChannelKeyForEvent(eventType, metadata, settings);
  const diagnostics = discordDiagnosticContext(eventType, metadata, settings);
  if (!discordEnabledFor(eventType, settings, metadata)) {
    const reason = eventType === "production_started" || eventType === "production_completed"
      ? productionNotificationSkipReason(eventType, metadata, settings) || "Craft notification disabled by settings"
      : eventType === "supplies" ? lowSupplyNotificationSkipReason(metadata, settings) || "Low supply notification disabled or above threshold"
      : eventType === "app_update" ? "App update notifications are disabled" : "Notification disabled or below configured threshold";
    recordDiscordDeliverySafe({ status: "skipped", eventType, channelId, channelKey, summary, reason, metadata: diagnostics });
    return { ok: true, skipped: true };
  }
  try {
    const role = craftWatchRole(metadata, settings);
    const response = await sendDiscordMessage({
      content: role?.mention,
      embeds: [discordEmbedForActivity(eventType, summary, occurredAt, metadata)],
      components: discordCraftWatchComponents(eventType, metadata),
      allowed_mentions: { roles: role ? [role.roleId] : [], parse: [] },
    }, settings, channelId);
    recordDiscordDeliverySafe({ status: "sent", eventType, channelId, channelKey, summary, metadata: diagnostics, response: { id: response?.id, channel_id: response?.channel_id } });
    if (eventType === "supplies") statements.upsertSetting.run("discord_last_low_supplies_at", new Date().toISOString(), new Date().toISOString());
    return { ok: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType, channelId, channelKey, summary, error: message, metadata: diagnostics });
    throw error;
  }
}

function discordEmbedForActivity(eventType, summary, occurredAt, metadata = {}) {
  const tierColors = {
    1: 0x838e9e,
    2: 0xbe6327,
    3: 0x00f630,
    4: 0x2d6bff,
    5: 0xa349af,
    6: 0xd12234,
    7: 0xc09015,
    8: 0x5ae2e2,
    9: 0x1f1f1f,
    10: 0xdeffff,
  };
  const isProduction = eventType === "production_started" || eventType === "production_completed";
  const tier = isProduction ? toNumber(metadata.tier ?? metadata.itemTier) : 0;
  const color = eventType.includes("sale") ? 0x4ee28a : eventType.includes("listing") ? 0xf0c64f : isProduction && tierColors[tier] ? tierColors[tier] : isProduction ? 0x65b7fa : eventType === "app_update" ? 0xa349af : 0xef6461;
  const fields = [];
  if (metadata.itemName) fields.push({ name: "Item", value: String(metadata.itemName), inline: true });
  if (metadata.owner) fields.push({ name: "Member", value: String(metadata.owner), inline: true });
  if (toNumber(metadata.quantity)) fields.push({ name: "Quantity", value: toNumber(metadata.quantity).toLocaleString(), inline: true });
  if (toNumber(metadata.price)) fields.push({ name: "Unit price", value: formatGold(metadata.price), inline: true });
  if (toNumber(metadata.totalValue ?? metadata.totalPrice)) fields.push({ name: "Total", value: formatGold(metadata.totalValue ?? metadata.totalPrice), inline: true });
  if (metadata.buildingName) fields.push({ name: "Structure", value: String(metadata.buildingName), inline: true });
  if (metadata.crafterName) fields.push({ name: "Crafter", value: String(metadata.crafterName), inline: true });
  if (metadata.skillName) fields.push({ name: "Profession", value: String(metadata.skillName), inline: true });
  if (isProduction && tier) fields.push({ name: "Tier", value: `T${tier}`, inline: true });
  if (toNumber(metadata.totalXp)) fields.push({ name: "Total XP", value: toNumber(metadata.totalXp).toLocaleString(), inline: true });
  if (toNumber(metadata.progressPct)) fields.push({ name: "Progress", value: `${toNumber(metadata.progressPct).toFixed(1)}%`, inline: true });
  if (metadata.runway) fields.push({ name: "Runway", value: String(metadata.runway), inline: true });
  if (metadata.upkeep) fields.push({ name: "Upkeep", value: String(metadata.upkeep), inline: true });
  if (metadata.runsOutAt) fields.push({ name: "Runs out", value: new Date(metadata.runsOutAt).toLocaleString("en-GB", { timeZone: "Europe/London" }), inline: false });
  if (metadata.version) fields.push({ name: "Version", value: String(metadata.version), inline: true });
  if (metadata.changeNotes) fields.push({ name: "Changes", value: String(metadata.changeNotes).slice(0, 1024), inline: false });
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

async function sendDiscordDirectMessage(userId, payload, settings = getDiscordSettingsRaw()) {
  if (!settings.enabled || !settings.botToken || !/^\d+$/.test(String(userId))) throw new Error("Discord integration is not fully configured");
  const channel = await discordApiRequest("/users/@me/channels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient_id: String(userId) }),
  }, settings);
  if (!channel?.id) throw new Error("Discord did not return a DM channel.");
  return sendDiscordMessage(payload, settings, channel.id);
}

async function editDiscordMessage(channelId, messageId, payload, settings = getDiscordSettingsRaw()) {
  if (!settings.enabled || !settings.botToken || !channelId || !messageId) throw new Error("Discord integration is not fully configured");
  return discordApiRequest(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, settings);
}

async function sendOrUpdateDiscordMessage(channelId, messageId, payload, settings = getDiscordSettingsRaw()) {
  if (messageId) {
    try {
      const response = await editDiscordMessage(channelId, messageId, payload, settings);
      return { response, action: "updated" };
    } catch (error) {
      console.warn(`Discord message update failed, posting replacement: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const response = await sendDiscordMessage(payload, settings, channelId);
  return { response, action: "posted" };
}

async function resolvedColourRoles(settings = getDiscordSettingsRaw()) {
  const configured = Array.isArray(settings.colourRoles) ? settings.colourRoles : [];
  if (!configured.length) return [];
  return configured
    .map((entry) => {
      const roleId = String(entry.roleId || "").trim();
      return { key: String(entry.key ?? ""), label: String(entry.label ?? entry.roleName ?? ""), roleName: String(entry.roleName ?? entry.label ?? ""), roleId, color: toNumber(entry.color) };
    })
    .filter((entry) => entry.key && entry.label && entry.roleId);
}

function discordColourButtonEmoji(role) {
  const label = String(role?.label ?? "").toLowerCase();
  const color = toNumber(role?.color);
  if (label.includes("green") || color === 0x2be56f || color === 0x1fb72e) return "🟢";
  if (label.includes("blue") || color === 0x5fa8ff || color === 0x244cff) return "🔵";
  if (label.includes("purple") || color === 0x9b4acb) return "🟣";
  if (label.includes("pink") || color === 0xff4f88) return "🌸";
  if (label.includes("red") || color === 0xff2028) return "🔴";
  if (label.includes("yellow") || color === 0xf4c430) return "🟡";
  if (label.includes("orange") || color === 0xff9f1c) return "🟠";
  if (label.includes("black") || color === 0x111111) return "⚫";
  if (label.includes("white") || color === 0xf4f4f4) return "⚪";
  return "🎨";
}

async function postDiscordColourSelector(settings = getDiscordSettingsRaw()) {
  const channelId = String(settings.colourRolesChannelId || settings.channels?.notifications || settings.channelId || "").trim();
  if (!channelId) throw new Error("Choose a colour-role channel before posting the selector.");
  const roles = await resolvedColourRoles(settings);
  if (!roles.length) throw new Error("No colour roles are ready yet. Create/sync colour roles before posting the selector.");
  const components = [];
  for (let index = 0; index < roles.length; index += 5) {
    components.push({
      type: 1,
      components: roles.slice(index, index + 5).map((role) => ({
        type: 2,
        style: 2,
        custom_id: `colourrole:select:${role.key}:${role.roleId}`,
        label: `${discordColourButtonEmoji(role)} ${role.label}`.slice(0, 80),
      })),
    });
  }
  const payload = {
    embeds: [discordCommandEmbed("Choose Your Colour", "Pick one name colour below. Selecting a new colour automatically removes your previous colour role.", [
      { name: "Available colours", value: roles.map((role) => role.label).join(", "), inline: false },
    ], 0xf0c64f)],
    components,
  };
  const { response, action } = await sendOrUpdateDiscordMessage(channelId, settings.colourRolesMessageId, payload, settings);
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const next = normalizeDiscordSettings({ ...stored, colourRolesChannelId: channelId, colourRolesMessageId: String(response?.id ?? settings.colourRolesMessageId ?? "") });
  statements.upsertSetting.run("discord_json", JSON.stringify(next), new Date().toISOString());
  recordDiscordDeliverySafe({ status: "sent", eventType: "colour_role_selector", summary: `${action === "updated" ? "Updated" : "Posted"} colour role selector`, channelId, channelKey: "colourRoles", metadata: { roles, messageId: response?.id, action } });
  return response;
}

async function discordApiRequest(pathname, options = {}, settings = getDiscordSettingsRaw()) {
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  const response = await fetch(`https://discord.com/api/v10${pathname}`, {
    ...options,
    headers: {
      authorization: `Bot ${settings.botToken}`,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createDiscordRole(guildId, role, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: role.roleName, color: toNumber(role.color), hoist: false, mentionable: false }),
  }, settings);
}

async function createDiscordRoleFromAdmin(body, settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const roleName = String(body.name ?? body.roleName ?? "").trim();
  if (roleName.length < 1 || roleName.length > 100) throw new Error("Role name must be 1-100 characters");
  const colorInput = String(body.color ?? "").trim();
  const color = colorInput.startsWith("#") ? parseInt(colorInput.slice(1), 16) : toNumber(body.color);
  const response = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/roles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: roleName,
      color: Number.isFinite(color) ? Math.max(0, Math.min(0xffffff, color)) : 0,
      hoist: body.hoist === true,
      mentionable: body.mentionable === true,
    }),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "role_create", summary: `Created Discord role: ${roleName}`, metadata: { roleId: response?.id, roleName, color } });
  return response;
}

async function updateDiscordRoleDefinition(guildId, roleId, role, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: role.roleName, color: toNumber(role.color), hoist: false, mentionable: false }),
  }, settings);
}

async function deleteDiscordRoleDefinition(guildId, roleId, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" }, settings);
}

async function moveDiscordRolesBelow(guildId, roles, anchorPosition, settings = getDiscordSettingsRaw()) {
  if (!roles.length || !anchorPosition) return null;
  const positions = roles.map((role, index) => ({ id: role.roleId, position: Math.max(anchorPosition - 1 - index, 1) }));
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(positions),
  }, settings);
}

async function manageDiscordColourRoles(settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const guildId = String(settings.guildId);
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const discovery = await discordGuildDiscovery(settings);
  const rolesById = new Map((discovery.roles ?? []).map((role) => [String(role.id), role]));
  const mosswickRole = (discovery.roles ?? []).find((role) => String(role.name ?? "").toLowerCase() === "mosswick");
  const targetKeys = new Set((settings.colourRoles ?? []).map((role) => String(role.key)));
  const targetRoleIds = new Set((settings.colourRoles ?? []).map((role) => String(role.roleId ?? "")).filter(Boolean));
  for (const stale of stored.colourRoles ?? []) {
    const staleRoleId = String(stale.roleId ?? "").trim();
    if (!staleRoleId || targetKeys.has(String(stale.key)) || targetRoleIds.has(staleRoleId) || !rolesById.has(staleRoleId)) continue;
    await deleteDiscordRoleDefinition(guildId, staleRoleId, settings).catch((error) => {
      console.warn(`Discord colour role delete failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  const managed = [];
  for (const role of settings.colourRoles ?? []) {
    const configured = { ...role, roleName: String(role.roleName || role.label), label: String(role.label || role.roleName), color: toNumber(role.color) };
    const existing = rolesById.get(String(configured.roleId ?? ""));
    const result = existing
      ? await updateDiscordRoleDefinition(guildId, existing.id, configured, settings)
      : await createDiscordRole(guildId, configured, settings);
    managed.push({ ...configured, roleId: String(result?.id ?? existing?.id ?? configured.roleId), action: existing ? "updated" : "created" });
  }
  if (mosswickRole) await moveDiscordRolesBelow(guildId, managed, toNumber(mosswickRole.position), settings).catch((error) => {
    console.warn(`Discord colour role positioning failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  const next = normalizeDiscordSettings({ ...stored, ...settings, colourRoles: managed.map(({ action, ...role }) => role) });
  statements.upsertSetting.run("discord_json", JSON.stringify(next), new Date().toISOString());
  recordDiscordDeliverySafe({
    status: "sent",
    eventType: "colour_role_manage",
    summary: `Managed ${managed.length.toLocaleString()} colour roles`,
    metadata: { roles: managed, anchorRole: mosswickRole ? { id: mosswickRole.id, name: mosswickRole.name, position: mosswickRole.position } : null },
  });
  return { roles: managed, anchorRole: mosswickRole ?? null };
}

function discordButtonRows(buttons) {
  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) rows.push({ type: 1, components: buttons.slice(index, index + 5) });
  return rows;
}

function rolePanelPayload(panel) {
  const options = (panel.options ?? []).filter((option) => option.roleId);
  const fields = [];
  if (panel.showHelperText !== false) {
    fields.push({ name: panel.mode === "single" ? "Selection" : "Selections", value: panel.mode === "single" ? "Only one role from this panel can be active at once." : "Click again to remove a role.", inline: false });
  }
  const buttons = options.map((option) => ({
    type: 2,
    style: 1,
    custom_id: `rolepanel:${panel.key}:${option.key}`,
    label: `${option.emoji ? `${option.emoji} ` : ""}${option.label}`.slice(0, 80),
  }));
  return {
    embeds: [discordCommandEmbed(panel.title, panel.description || (panel.mode === "single" ? "Choose one role below." : "Choose any roles below."), fields, 0x5865f2)],
    components: discordButtonRows(buttons),
  };
}

function updateStoredDiscordPanel(panel) {
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const panels = stored.rolePanels.map((entry) => entry.key === panel.key ? normalizeDiscordRolePanel(panel, entry) : entry);
  statements.upsertSetting.run("discord_json", JSON.stringify(normalizeDiscordSettings({ ...stored, rolePanels: panels })), new Date().toISOString());
}

async function postDiscordRolePanel(panelKey, settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  const panel = settings.rolePanels.find((entry) => entry.key === panelKey);
  if (!panel) throw new Error("Role panel not found");
  const channelId = String(panel.channelId || settings.channelId || "").trim();
  if (!channelId) throw new Error(`Choose a channel for ${panel.label} before posting.`);
  const payload = rolePanelPayload(panel);
  if (!payload.components.length) throw new Error(`${panel.label} needs at least one option with a role.`);
  const { response, action } = await sendOrUpdateDiscordMessage(channelId, panel.messageId, payload, settings);
  const nextPanel = { ...panel, channelId, messageId: String(response?.id ?? panel.messageId ?? "") };
  updateStoredDiscordPanel(nextPanel);
  recordDiscordDeliverySafe({ status: "sent", eventType: "role_panel", summary: `${action === "updated" ? "Updated" : "Posted"} ${panel.label}`, channelId, channelKey: "rolePanel", metadata: { panel: nextPanel, action } });
  return { panel: nextPanel, response, action };
}

async function postDiscordWelcomeFlow(settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  const flow = settings.welcomeFlow;
  const channelId = String(flow.channelId || settings.channelId || "").trim();
  if (!channelId) throw new Error("Choose a welcome channel before posting.");
  const fields = flow.showNextStep === false ? [] : [
    { name: "Next step", value: flow.readyRoleId ? "Click Ready when you have read the welcome steps." : "Configure a Ready role if you want the button to assign access.", inline: false },
  ];
  const payload = {
    embeds: [discordCommandEmbed(flow.title, flow.message, fields, 0xf0c64f)],
    components: discordButtonRows([{ type: 2, style: 3, custom_id: "welcome:ready", label: "Ready" }]),
  };
  const { response, action } = await sendOrUpdateDiscordMessage(channelId, flow.messageId, payload, settings);
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const welcomeFlow = normalizeDiscordWelcomeFlow({ ...flow, channelId, messageId: String(response?.id ?? flow.messageId ?? "") });
  statements.upsertSetting.run("discord_json", JSON.stringify(normalizeDiscordSettings({ ...stored, welcomeFlow })), new Date().toISOString());
  recordDiscordDeliverySafe({ status: "sent", eventType: "welcome_flow", summary: `${action === "updated" ? "Updated" : "Posted"} welcome flow`, channelId, channelKey: "welcome", metadata: { welcomeFlow, action } });
  return { welcomeFlow, response, action };
}

async function addDiscordMemberRole(guildId, userId, roleId, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, { method: "PUT" }, settings);
}

async function removeDiscordMemberRole(guildId, userId, roleId, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" }, settings);
}

async function getDiscordMemberRoleSet(guildId, userId, settings = getDiscordSettingsRaw(), fallbackRoles = []) {
  try {
    const member = await discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`, {}, settings);
    return new Set(Array.isArray(member?.roles) ? member.roles.map(String) : []);
  } catch {
    return new Set(Array.isArray(fallbackRoles) ? fallbackRoles.map(String) : []);
  }
}

async function discordGuildDiscovery(settings = getDiscordSettingsRaw()) {
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const guildId = String(settings.guildId);
  const botUser = await discordApiRequest("/users/@me", {}, settings);
  const botUserId = String(botUser?.id ?? "");
  const [guild, channels, roles, botMember] = await Promise.all([
    discordApiRequest(`/guilds/${encodeURIComponent(guildId)}`, {}, settings),
    discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/channels`, {}, settings),
    discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles`, {}, settings),
    botUserId ? discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(botUserId)}`, {}, settings).catch(() => null) : null,
  ]);
  const sortedChannels = (Array.isArray(channels) ? channels : [])
    .filter((channel) => [0, 5, 10, 11, 12, 15].includes(Number(channel.type)))
    .sort((a, b) => String(a.parent_id ?? "").localeCompare(String(b.parent_id ?? "")) || toNumber(a.position) - toNumber(b.position) || String(a.name).localeCompare(String(b.name)))
    .map((channel) => ({
      id: String(channel.id),
      name: String(channel.name ?? channel.id),
      type: toNumber(channel.type),
      parentId: channel.parent_id ? String(channel.parent_id) : "",
      label: `#${String(channel.name ?? channel.id)}`,
      permissionOverwrites: Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [],
    }));
  const botRoleIds = new Set(Array.isArray(botMember?.roles) ? botMember.roles.map(String) : []);
  const botHighestRolePosition = (Array.isArray(roles) ? roles : [])
    .filter((role) => botRoleIds.has(String(role.id)))
    .reduce((highest, role) => Math.max(highest, toNumber(role.position)), 0);
  const memberRoleCounts = new Map();
  const members = [];
  let memberCountAvailable = true;
  let memberCountError = "";
  let after = "0";
  for (let page = 0; page < 10; page += 1) {
    let batch = [];
    try {
      batch = await discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members?limit=1000&after=${encodeURIComponent(after)}`, {}, settings);
    } catch (error) {
      memberCountAvailable = false;
      memberCountError = error?.message ? String(error.message) : "Discord member list could not be fetched";
      break;
    }
    if (!Array.isArray(batch) || !batch.length) break;
    for (const member of batch) {
      const userId = String(member.user?.id ?? "");
      if (!userId) continue;
      after = userId;
      const roleIds = Array.isArray(member.roles) ? member.roles.map(String) : [];
      for (const roleId of roleIds) memberRoleCounts.set(roleId, (memberRoleCounts.get(roleId) ?? 0) + 1);
      members.push({
        id: userId,
        username: String(member.user?.global_name ?? member.nick ?? member.user?.username ?? userId),
        roles: roleIds,
      });
    }
    if (batch.length < 1000) break;
  }
  const normalizedRoles = (Array.isArray(roles) ? roles : [])
    .filter((role) => String(role.id) !== guildId)
    .sort((a, b) => toNumber(b.position) - toNumber(a.position) || String(a.name).localeCompare(String(b.name)))
    .map((role) => {
      const roleId = String(role.id);
      const position = toNumber(role.position);
      const managed = Boolean(role.managed);
      const botCanManage = Boolean(botHighestRolePosition && position < botHighestRolePosition && !managed);
      return {
        id: roleId,
        name: String(role.name ?? roleId),
        color: toNumber(role.color),
        position,
        managed,
        mentionable: Boolean(role.mentionable),
        memberCount: memberCountAvailable ? memberRoleCounts.get(roleId) ?? 0 : null,
        memberCountAvailable,
        botCanManage,
        manageabilityReason: botCanManage ? "Bot can manage" : managed ? "Managed by integration" : botHighestRolePosition ? "Move bot role above this role" : "Bot role not found",
      };
    });
  return {
    guild: { id: guildId, name: String(guild?.name ?? guildId) },
    bot: { id: botUserId, username: String(botUser?.username ?? "Bot"), highestRolePosition: botHighestRolePosition },
    channels: sortedChannels,
    roles: normalizedRoles,
    members: members.slice(0, 1000),
    memberCount: memberCountAvailable ? members.length : null,
    memberCountAvailable,
    memberCountError,
    fetchedAt: new Date().toISOString(),
  };
}

async function discordAuditLogReport(settings = getDiscordSettingsRaw()) {
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const payload = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/audit-logs?limit=25`, {}, settings);
  return {
    entries: (payload.audit_log_entries ?? []).map((entry) => ({
      id: String(entry.id),
      actionType: entry.action_type,
      userId: String(entry.user_id ?? ""),
      targetId: String(entry.target_id ?? ""),
      reason: String(entry.reason ?? ""),
      changes: entry.changes ?? [],
    })),
    users: payload.users ?? [],
  };
}

async function discordRoleCleanupReport(settings = getDiscordSettingsRaw()) {
  const discovery = await discordGuildDiscovery(settings);
  const configuredRoleIds = new Set([
    ...Object.values(settings.craftRoles ?? {}),
    ...(settings.colourRoles ?? []).map((role) => role.roleId),
    ...(settings.rolePanels ?? []).flatMap((panel) => (panel.options ?? []).map((option) => option.roleId)),
    settings.welcomeFlow?.readyRoleId,
  ].map(String).filter(Boolean));
  const roles = discovery.roles ?? [];
  const colorGroups = new Map();
  for (const role of roles) {
    if (role.color) colorGroups.set(String(role.color), [...(colorGroups.get(String(role.color)) ?? []), role]);
  }
  return {
    unusedRoles: roles.filter((role) => role.memberCountAvailable !== false && !role.managed && !configuredRoleIds.has(String(role.id)) && toNumber(role.memberCount) === 0).slice(0, 80),
    duplicateColours: [...colorGroups.values()].filter((group) => group.length > 1).map((group) => ({ color: group[0].color, roles: group.map((role) => ({ id: role.id, name: role.name, memberCount: role.memberCount })) })),
    missingConfiguredRoles: [...configuredRoleIds].filter((roleId) => !roles.some((role) => String(role.id) === roleId)),
    notManageableConfiguredRoles: roles.filter((role) => configuredRoleIds.has(String(role.id)) && !role.botCanManage),
  };
}

async function discordChannelPermissionReport(settings = getDiscordSettingsRaw()) {
  const discovery = await discordGuildDiscovery(settings);
  const channels = discovery.channels ?? [];
  const configuredRoles = new Set([
    ...Object.values(settings.craftRoles ?? {}),
    ...(settings.rolePanels ?? []).flatMap((panel) => (panel.options ?? []).map((option) => option.roleId)),
    settings.welcomeFlow?.readyRoleId,
  ].map(String).filter(Boolean));
  return {
    channels: Object.entries(settings.channels ?? {}).filter(([, id]) => id).map(([key, id]) => {
      const channel = channels.find((entry) => String(entry.id) === String(id));
      const roleOverwrites = (channel?.permissionOverwrites ?? []).filter((overwrite) => configuredRoles.has(String(overwrite.id)));
      return {
        key,
        id: String(id),
        name: channel?.label ?? `Unknown channel (${id})`,
        found: Boolean(channel),
        configuredRoleOverwrites: roleOverwrites.length,
        deniedConfiguredRoles: roleOverwrites.filter((overwrite) => BigInt(overwrite.deny ?? 0) > 0n).map((overwrite) => String(overwrite.id)),
      };
    }),
  };
}

async function discordInactiveMemberReport(days = 30, settings = getDiscordSettingsRaw()) {
  const discovery = await discordGuildDiscovery(settings);
  const cutoffMs = Date.now() - Math.max(toNumber(days) || 30, 1) * 24 * 60 * 60 * 1000;
  const activeUserIds = new Set();
  let reactionChecks = 0;
  const textChannels = (discovery.channels ?? []).filter((channel) => [0, 5].includes(toNumber(channel.type))).slice(0, 30);
  for (const channel of textChannels) {
    const messages = await discordApiRequest(`/channels/${encodeURIComponent(channel.id)}/messages?limit=100`, {}, settings).catch(() => []);
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      if (Date.parse(message.timestamp ?? "") < cutoffMs) continue;
      if (message.author?.id) activeUserIds.add(String(message.author.id));
      for (const reaction of Array.isArray(message.reactions) ? message.reactions.slice(0, 5) : []) {
        if (reactionChecks >= 150) break;
        const emoji = reaction.emoji?.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji?.name;
        if (!emoji) continue;
        reactionChecks += 1;
        const users = await discordApiRequest(`/channels/${encodeURIComponent(channel.id)}/messages/${encodeURIComponent(message.id)}/reactions/${encodeURIComponent(emoji)}?limit=100`, {}, settings).catch(() => []);
        if (Array.isArray(users)) users.forEach((user) => user?.id ? activeUserIds.add(String(user.id)) : null);
      }
    }
  }
  const inactive = (discovery.members ?? []).filter((member) => !activeUserIds.has(String(member.id)));
  return { days: Math.max(toNumber(days) || 30, 1), scannedChannels: textChannels.length, reactionChecks, activeCount: activeUserIds.size, inactive: inactive.slice(0, 100), totalMembers: discovery.memberCount };
}

async function sendDiscordAnnouncement(body, settings = getDiscordSettingsRaw()) {
  const channelId = String(body.channelId ?? settings.channelId ?? "").trim();
  const title = String(body.title ?? "Announcement").trim() || "Announcement";
  const message = String(body.message ?? "").trim();
  if (!channelId || !message) throw new Error("Announcement needs a channel and message.");
  const response = await sendDiscordMessage({ embeds: [discordCommandEmbed(title, message, [], 0xf0c64f)] }, settings, channelId);
  recordDiscordDeliverySafe({ status: "sent", eventType: "announcement", channelId, channelKey: "announcement", summary: title, response: { id: response?.id, channel_id: response?.channel_id } });
  return response;
}

async function updateDiscordPinnedInfo(body, settings = getDiscordSettingsRaw()) {
  const channelId = String(body.channelId ?? "").trim();
  const title = String(body.title ?? "Information").trim() || "Information";
  const message = String(body.message ?? "").trim();
  const messageId = String(body.messageId ?? "").trim();
  if (!channelId || !message) throw new Error("Pinned info needs a channel and message.");
  const { response, action } = await sendOrUpdateDiscordMessage(channelId, messageId, { embeds: [discordCommandEmbed(title, message, [], 0x5865f2)] }, settings);
  if (response?.id) await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/pins/${encodeURIComponent(response.id)}`, { method: "PUT" }, settings).catch(() => null);
  recordDiscordDeliverySafe({ status: "sent", eventType: "pinned_info", channelId, channelKey: "pinnedInfo", summary: `${action === "updated" ? "Updated" : "Posted"} pinned info`, response: { id: response?.id, channel_id: response?.channel_id } });
  return { response, action };
}

async function createDiscordScheduledEvent(body, settings = getDiscordSettingsRaw()) {
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const startTime = new Date(String(body.startTime ?? ""));
  const endTime = new Date(String(body.endTime ?? ""));
  const location = String(body.location ?? "Discord").trim() || "Discord";
  if (!name || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) throw new Error("Event needs a name, start time and end time.");
  const response = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/scheduled-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, description, privacy_level: 2, entity_type: 3, scheduled_start_time: startTime.toISOString(), scheduled_end_time: endTime.toISOString(), entity_metadata: { location } }),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "scheduled_event", summary: name, metadata: { eventId: response?.id, startTime: startTime.toISOString(), endTime: endTime.toISOString() } });
  return response;
}

function discordAuditReason(reason, fallback) {
  const value = String(reason ?? fallback ?? "Timbersteel Trade moderation action").trim().slice(0, 512);
  return value ? { "X-Audit-Log-Reason": encodeURIComponent(value) } : {};
}

function requireDiscordModerationSettings(settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  return settings;
}

function snowflakeTimestampMs(id) {
  try {
    const raw = String(id ?? "");
    if (!/^\d+$/.test(raw)) return 0;
    return Number((BigInt(raw) >> 22n) + 1420070400000n);
  } catch {
    return 0;
  }
}

async function discordModerationTimeout(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a Discord member to timeout.");
  const minutes = Math.max(0, Math.min(toNumber(body.minutes) || 0, 40320));
  const until = minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
  const response = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, until ? `Timed out member for ${minutes} minutes` : "Removed member timeout") },
    body: JSON.stringify({ communication_disabled_until: until }),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: until ? "moderation_timeout" : "moderation_timeout_clear", summary: until ? `Timed out ${userId} for ${minutes} minutes` : `Removed timeout from ${userId}`, metadata: { userId, minutes, until } });
  return { ok: true, action: until ? "timeout" : "timeout_removed", userId, minutes, until, response };
}

async function discordModerationKick(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a Discord member to kick.");
  await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: discordAuditReason(body.reason, "Kicked member from server"),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_kick", summary: `Kicked ${userId}`, metadata: { userId } });
  return { ok: true, action: "kick", userId };
}

async function discordModerationBan(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a Discord member to ban.");
  const deleteMessageSeconds = Math.max(0, Math.min(toNumber(body.deleteMessageSeconds) || 0, 604800));
  await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/bans/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, "Banned member from server") },
    body: JSON.stringify({ delete_message_seconds: deleteMessageSeconds }),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_ban", summary: `Banned ${userId}`, metadata: { userId, deleteMessageSeconds } });
  return { ok: true, action: "ban", userId, deleteMessageSeconds };
}

async function discordModerationUnban(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Enter a Discord user ID to unban.");
  await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/bans/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: discordAuditReason(body.reason, "Removed server ban"),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_unban", summary: `Unbanned ${userId}`, metadata: { userId } });
  return { ok: true, action: "unban", userId };
}

async function discordModerationPurge(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? "").trim();
  if (!/^\d+$/.test(channelId)) throw new Error("Choose a Discord channel to clean up.");
  const limit = Math.max(1, Math.min(toNumber(body.limit) || 25, 100));
  const messages = await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`, {}, settings);
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const ids = (Array.isArray(messages) ? messages : [])
    .filter((message) => snowflakeTimestampMs(message?.id) > cutoff)
    .map((message) => String(message.id))
    .filter(Boolean)
    .slice(0, limit);
  if (ids.length >= 2) {
    await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/messages/bulk-delete`, {
      method: "POST",
      headers: { "content-type": "application/json", ...discordAuditReason(body.reason, `Purged ${ids.length} channel messages`) },
      body: JSON.stringify({ messages: ids }),
    }, settings);
  } else if (ids.length === 1) {
    await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(ids[0])}`, {
      method: "DELETE",
      headers: discordAuditReason(body.reason, "Deleted channel message"),
    }, settings);
  }
  recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_purge", summary: `Purged ${ids.length} messages`, channelId, metadata: { channelId, requested: limit, deleted: ids.length } });
  return { ok: true, action: "purge", channelId, requested: limit, deleted: ids.length, skippedOlderThan14Days: limit - ids.length };
}

async function discordModerationBans(settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const bans = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/bans?limit=100`, {}, settings);
  return {
    bans: (Array.isArray(bans) ? bans : []).map((entry) => ({
      reason: String(entry.reason ?? ""),
      user: {
        id: String(entry.user?.id ?? ""),
        username: String(entry.user?.global_name ?? entry.user?.username ?? entry.user?.id ?? "Unknown user"),
        avatar: entry.user?.avatar ?? null,
      },
    })),
  };
}

function recordDiscordCase(caseType, details = {}, settings = getDiscordSettingsRaw()) {
  const at = new Date().toISOString();
  statements.insertDiscordModCase.run(
    String(settings.guildId ?? ""),
    String(caseType),
    String(details.userId ?? ""),
    String(details.moderator ?? "dashboard"),
    String(details.reason ?? ""),
    JSON.stringify(details),
    at,
  );
  return { caseId: db.prepare("SELECT last_insert_rowid() AS id").get()?.id, occurredAt: at };
}

function discordCaseLog(limit = 80, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  return {
    cases: statements.recentDiscordModCases.all(settings.guildId, Math.max(1, Math.min(toNumber(limit) || 80, 200))).map((row) => ({ ...row, details: safeJson(row.details_json, {}) })),
  };
}

async function discordWarningCreate(body, moderator = "dashboard", settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  if (!/^\d+$/.test(userId) || !reason) throw new Error("Warning needs a member and reason.");
  const at = new Date().toISOString();
  statements.insertDiscordWarning.run(settings.guildId, userId, moderator, reason, at);
  const modCase = recordDiscordCase("warning", { userId, moderator, reason }, settings);
  const warningId = db.prepare("SELECT last_insert_rowid() AS id").get()?.id;
  const deliveries = [];
  const warningEmbed = discordCommandEmbed("Discord Warning", `You have received a warning in Timbersteel Trade.`, [
    { name: "Reason", value: reason.slice(0, 1024), inline: false },
    { name: "Moderator", value: moderator, inline: true },
  ], 0xef6461);
  try {
    const response = await sendDiscordDirectMessage(userId, { embeds: [warningEmbed] }, settings);
    deliveries.push({ target: "member_dm", status: "sent", messageId: response?.id, channelId: response?.channel_id });
    recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_warning_dm", summary: `Warning DM sent to ${userId}`, channelId: response?.channel_id, metadata: { userId, moderator, reason, warningId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deliveries.push({ target: "member_dm", status: "failed", error: message });
    recordDiscordDeliverySafe({ status: "failed", eventType: "moderation_warning_dm", summary: `Warning DM failed for ${userId}`, error: message, metadata: { userId, moderator, reason, warningId } });
  }
  const logChannelId = String(settings.channels?.modLog || settings.channels?.modNotes || settings.channelId || "").trim();
  if (logChannelId) {
    try {
      const response = await sendDiscordMessage({ embeds: [discordCommandEmbed("Warning Recorded", `<@${userId}> received a warning.`, [
        { name: "Reason", value: reason.slice(0, 1024), inline: false },
        { name: "Moderator", value: moderator, inline: true },
        { name: "Case", value: String(modCase.caseId ?? warningId ?? "Recorded"), inline: true },
      ], 0xef6461)] }, settings, logChannelId);
      deliveries.push({ target: "mod_log", status: "sent", messageId: response?.id, channelId: response?.channel_id });
      recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_warning_log", summary: `Warning logged for ${userId}`, channelId: logChannelId, channelKey: settings.channels?.modLog ? "modLog" : "modNotes", metadata: { userId, moderator, reason, warningId, caseId: modCase.caseId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deliveries.push({ target: "mod_log", status: "failed", error: message });
      recordDiscordDeliverySafe({ status: "failed", eventType: "moderation_warning_log", summary: `Warning log failed for ${userId}`, channelId: logChannelId, channelKey: settings.channels?.modLog ? "modLog" : "modNotes", error: message, metadata: { userId, moderator, reason, warningId, caseId: modCase.caseId } });
    }
  }
  return { ok: true, warningId, deliveries, ...modCase };
}

function discordWarnings(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a member to view warnings.");
  return { warnings: statements.listDiscordWarnings.all(settings.guildId, userId) };
}

function discordWarningsClear(body, moderator = "dashboard", settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a member to clear warnings.");
  const cleared = statements.clearDiscordWarnings.run(settings.guildId, userId).changes;
  const modCase = recordDiscordCase("warnings_cleared", { userId, moderator, reason: body.reason ?? "", cleared }, settings);
  return { ok: true, cleared, ...modCase };
}

function discordModNoteCreate(body, moderator = "dashboard", settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  const note = String(body.note ?? "").trim();
  if (!/^\d+$/.test(userId) || !note) throw new Error("Mod note needs a member and note.");
  statements.insertDiscordModNote.run(settings.guildId, userId, moderator, note, new Date().toISOString());
  return { ok: true, noteId: db.prepare("SELECT last_insert_rowid() AS id").get()?.id };
}

function discordModNotes(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a member to view mod notes.");
  return { notes: statements.listDiscordModNotes.all(settings.guildId, userId) };
}

async function discordSlowmode(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? "").trim();
  const seconds = Math.max(0, Math.min(toNumber(body.seconds) || 0, 21600));
  if (!/^\d+$/.test(channelId)) throw new Error("Choose a channel for slowmode.");
  const response = await discordApiRequest(`/channels/${encodeURIComponent(channelId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, `Set slowmode to ${seconds} seconds`) },
    body: JSON.stringify({ rate_limit_per_user: seconds }),
  }, settings);
  recordDiscordCase("slowmode", { channelId, seconds, reason: body.reason ?? "" }, settings);
  return { ok: true, channelId, seconds, response };
}

async function discordLockdown(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? "").trim();
  const locked = body.locked !== false;
  if (!/^\d+$/.test(channelId)) throw new Error("Choose a channel for lockdown.");
  const sendMessagesBit = "2048";
  const payload = locked
    ? { type: 0, allow: "0", deny: sendMessagesBit }
    : { type: 0, allow: sendMessagesBit, deny: "0" };
  await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/permissions/${encodeURIComponent(settings.guildId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, locked ? "Locked channel" : "Unlocked channel") },
    body: JSON.stringify(payload),
  }, settings);
  recordDiscordCase(locked ? "lockdown" : "unlock", { channelId, reason: body.reason ?? "" }, settings);
  return { ok: true, channelId, locked };
}

async function discordTemporaryBan(body, settings = getDiscordSettingsRaw()) {
  const result = await discordModerationBan(body, settings);
  const hours = Math.max(1, Math.min(toNumber(body.hours) || 24, 24 * 365));
  const unbanAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  statements.upsertDiscordTempBan.run(settings.guildId, result.userId, unbanAt, String(body.reason ?? ""), new Date().toISOString());
  recordDiscordCase("temporary_ban", { userId: result.userId, hours, unbanAt, reason: body.reason ?? "" }, settings);
  return { ...result, action: "temporary_ban", hours, unbanAt };
}

async function processDiscordTempBans() {
  const settings = getDiscordSettingsRaw();
  if (!settings.botToken || !settings.guildId) return;
  for (const row of statements.dueDiscordTempBans.all(new Date().toISOString())) {
    try {
      await discordModerationUnban({ userId: row.user_id, reason: `Temporary ban expired: ${row.reason ?? ""}` }, settings);
      statements.deleteDiscordTempBan.run(row.guild_id, row.user_id);
    } catch (error) {
      recordDiscordDeliverySafe({ status: "failed", eventType: "temp_ban_unban", summary: `Temporary unban failed for ${row.user_id}`, error: error instanceof Error ? error.message : String(error), metadata: row });
    }
  }
}

async function syncDiscordAutoModeration(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const keywords = String(body.blockedWords ?? "").split(/[\n,]/).map((word) => word.trim()).filter(Boolean).slice(0, 100);
  if (!keywords.length) throw new Error("Add at least one blocked word or phrase.");
  const name = String(body.name ?? "Timbersteel keyword filter").trim() || "Timbersteel keyword filter";
  const alertChannelId = String(settings.channels?.modLog || settings.channels?.modNotes || settings.channelId || "").trim();
  const actions = [
    { type: 1, metadata: { custom_message: "That message was blocked by Timbersteel Trade AutoMod." } },
    ...(/^\d+$/.test(alertChannelId) ? [{ type: 2, metadata: { channel_id: alertChannelId } }] : []),
  ];
  const response = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/auto-moderation/rules`, {
    method: "POST",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, "Created bot-managed auto moderation rule") },
    body: JSON.stringify({
      name,
      event_type: 1,
      trigger_type: 1,
      trigger_metadata: { keyword_filter: keywords },
      actions,
      enabled: body.enabled !== false,
    }),
  }, settings);
  recordDiscordCase("automod_rule", { ruleId: response?.id, name, keywords: keywords.length, alertChannelId }, settings);
  return { ok: true, rule: response, alertChannelId: /^\d+$/.test(alertChannelId) ? alertChannelId : null };
}

async function discordNativeAutoModerationRules(settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const rules = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/auto-moderation/rules`, {}, settings);
  return { rules: Array.isArray(rules) ? rules : [] };
}

function normalizeCommandName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 32);
}

function discordCustomCommands() {
  return { commands: statements.listDiscordCustomCommands.all() };
}

function upsertDiscordCustomCommand(body) {
  const name = normalizeCommandName(body.name);
  const description = String(body.description ?? "Custom Timbersteel command").trim().slice(0, 100) || "Custom Timbersteel command";
  const response = String(body.response ?? "").trim();
  if (!/^[a-z0-9_-]{1,32}$/.test(name) || !response) throw new Error("Custom command needs a valid name and response.");
  statements.upsertDiscordCustomCommand.run(name, description, response, new Date().toISOString());
  return { ok: true, command: { name, description, response } };
}

async function postDiscordPoll(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? settings.channelId ?? "").trim();
  const title = String(body.title ?? "Poll").trim() || "Poll";
  const options = String(body.options ?? "").split(/\n|,/).map((entry) => entry.trim()).filter(Boolean).slice(0, 10);
  if (!channelId || options.length < 2) throw new Error("Poll needs a channel and at least two options.");
  const optionMeta = options.map((label, index) => ({ key: String(index), label }));
  const components = [];
  for (let i = 0; i < options.length; i += 5) {
    components.push({ type: 1, components: options.slice(i, i + 5).map((label, offset) => ({ type: 2, style: 2, label: label.slice(0, 80), custom_id: `poll:${i + offset}:${encodeURIComponent(label).slice(0, 60)}` })) });
  }
  const response = await sendDiscordMessage({ embeds: [discordCommandEmbed(title, "Vote using the buttons below.", options.map((option, index) => ({ name: `${index + 1}. ${option}`, value: "0 votes", inline: true })), 0x5865f2)], components }, settings, channelId);
  if (response?.id) statements.upsertDiscordComponentMessage.run(response.id, "poll", JSON.stringify({ title, description: "Vote using the buttons below.", color: 0x5865f2, options: optionMeta }), new Date().toISOString());
  recordDiscordCase("poll_posted", { channelId, messageId: response?.id, title, options }, settings);
  return { ok: true, response };
}

async function postDiscordRsvp(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? settings.channelId ?? "").trim();
  const title = String(body.title ?? "Event RSVP").trim() || "Event RSVP";
  const description = String(body.description ?? "").trim() || "Choose your RSVP below.";
  if (!channelId) throw new Error("RSVP needs a channel.");
  const response = await sendDiscordMessage({
    embeds: [discordCommandEmbed(title, description, [
      { name: "Going", value: "0", inline: true },
      { name: "Maybe", value: "0", inline: true },
      { name: "Not Going", value: "0", inline: true },
    ], 0x4ee28a)],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: "Going", custom_id: "rsvp:going" },
      { type: 2, style: 2, label: "Maybe", custom_id: "rsvp:maybe" },
      { type: 2, style: 4, label: "Not Going", custom_id: "rsvp:not-going" },
    ] }],
  }, settings, channelId);
  if (response?.id) statements.upsertDiscordComponentMessage.run(response.id, "rsvp", JSON.stringify({ title, description, color: 0x4ee28a, options: [
    { key: "going", label: "Going" },
    { key: "maybe", label: "Maybe" },
    { key: "not-going", label: "Not Going" },
  ] }), new Date().toISOString());
  recordDiscordCase("rsvp_posted", { channelId, messageId: response?.id, title }, settings);
  return { ok: true, response };
}

async function sendDiscordCleanEmbed(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? settings.channelId ?? "").trim();
  const title = String(body.title ?? "Message").trim() || "Message";
  const description = String(body.description ?? "").trim();
  const color = String(body.color ?? "").startsWith("#") ? parseInt(String(body.color).slice(1), 16) : 0xf0c64f;
  if (!channelId || !description) throw new Error("Embed needs a channel and message.");
  const response = await sendDiscordMessage({ embeds: [discordCommandEmbed(title, description, [], Number.isFinite(color) ? color : 0xf0c64f)] }, settings, channelId);
  recordDiscordCase("embed_posted", { channelId, messageId: response?.id, title }, settings);
  return { ok: true, response };
}

async function discordMemberProfile(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a member.");
  const [member, warnings, notes] = await Promise.all([
    discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/members/${encodeURIComponent(userId)}`, {}, settings),
    Promise.resolve(statements.listDiscordWarnings.all(settings.guildId, userId)),
    Promise.resolve(statements.listDiscordModNotes.all(settings.guildId, userId)),
  ]);
  return { member, warnings, notes };
}

async function discordNicknameReport(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const pattern = String(body.pattern ?? "").trim();
  if (!pattern) throw new Error("Enter a nickname pattern.");
  const regex = new RegExp(pattern, "i");
  const discovery = await discordGuildDiscovery(settings);
  return { pattern, mismatches: (discovery.members ?? []).filter((member) => !regex.test(String(member.username ?? ""))).slice(0, 100) };
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
    metadata: { label: "Tier 4 Scholar Workstation", tier: 4, buildingName: "Scholar Hall", crafterName: "Modular", skillName: "Scholar", professionKey: "scholar", totalXp: 82000, progressPct: 7.5 },
  },
  craftCompleted: {
    eventType: "production_completed",
    summary: "Craft completed: Refined Rough Plank",
    metadata: { label: "Refined Rough Plank", tier: 3, buildingName: "Carpentry Workshop", crafterName: "Modular", skillName: "Carpentry", professionKey: "carpentry", totalXp: 64000, progressPct: 100 },
  },
  supplies: {
    eventType: "supplies",
    summary: "Supply stock changed: 11,946 remaining",
    metadata: { runwayDays: 6.8, runway: "6 days 19 hours", upkeep: "448.5 supplies per day", runsOutAt: new Date(Date.now() + 6.8 * 24 * 60 * 60 * 1000).toISOString() },
  },
  appUpdate: {
    eventType: "app_update",
    summary: `Version ${appVersion} is live with the latest changes`,
    metadata: { version: appVersion, releaseKey: currentAppReleaseKey(), changelogUrl },
  },
};

async function currentAppUpdateDetails() {
  const reduceNotes = (notes, maxLength = 900) => {
    const reduced = [];
    let total = 0;
    for (const note of notes) {
      const line = `- ${note}`;
      if (total + line.length + (reduced.length ? 1 : 0) > maxLength) break;
      reduced.push(line);
      total += line.length + (reduced.length > 1 ? 1 : 0);
    }
    if (reduced.length < notes.length) reduced.push(`- Plus ${notes.length - reduced.length} more change${notes.length - reduced.length === 1 ? "" : "s"} in the changelog.`);
    return reduced.join("\n");
  };
  try {
    const changelog = await readFile(changelogPath, "utf8");
    const escapedVersion = appVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = changelog.match(new RegExp(`## \\[?${escapedVersion}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`));
    const section = match?.[1] ?? "";
    const notes = section
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .filter(Boolean)
      .slice(0, 12);
    if (notes.length) {
      return {
        summary: `Version ${appVersion} is live: ${notes[0].replace(/\.$/, "")}.`,
        changeNotes: reduceNotes(notes),
      };
    }
  } catch (error) {
    console.warn(`Unable to read changelog for Discord app update: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    summary: `Version ${appVersion} is live with the latest fixes and improvements.`,
    changeNotes: "- See the changelog for the full list of changes.",
  };
}

async function sendDiscordTestNotification(kind = "basic") {
  const settings = getDiscordSettingsRaw();
  if (kind === "basic") {
    const summary = "Discord integration test from Timbersteel Trade.";
    try {
      const response = await sendDiscordMessage({
        content: summary,
        allowed_mentions: { parse: [] },
      }, settings, settings.channelId);
      recordDiscordDeliverySafe({ status: "sent", eventType: "test_basic", channelId: settings.channelId, channelKey: "notifications", summary, metadata: discordDiagnosticContext("test_basic", {}, settings), response: { id: response?.id, channel_id: response?.channel_id } });
      return response;
    } catch (error) {
      recordDiscordDeliverySafe({ status: "failed", eventType: "test_basic", channelId: settings.channelId, channelKey: "notifications", summary, error: error instanceof Error ? error.message : String(error), metadata: discordDiagnosticContext("test_basic", {}, settings) });
      throw error;
    }
  }
  const sample = discordTestEvents[kind];
  if (!sample) throw new Error("Unknown Discord test notification");
  const updateDetails = sample.eventType === "app_update" ? await currentAppUpdateDetails() : null;
  const summary = updateDetails?.summary ?? sample.summary;
  const metadata = updateDetails ? { ...sample.metadata, changeNotes: updateDetails.changeNotes } : sample.metadata;
  const channelId = discordChannelForEvent(sample.eventType, sample.metadata, settings);
  const channelKey = discordChannelKeyForEvent(sample.eventType, sample.metadata, settings);
  try {
    const response = await sendDiscordMessage({
      embeds: [discordEmbedForActivity(sample.eventType, summary, new Date().toISOString(), metadata)],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDeliverySafe({ status: "sent", eventType: `test_${sample.eventType}`, channelId, channelKey, summary, metadata: discordDiagnosticContext(sample.eventType, metadata, settings), response: { id: response?.id, channel_id: response?.channel_id } });
    return response;
  } catch (error) {
    recordDiscordDeliverySafe({ status: "failed", eventType: `test_${sample.eventType}`, channelId, channelKey, summary, error: error instanceof Error ? error.message : String(error), metadata: discordDiagnosticContext(sample.eventType, metadata, settings) });
    throw error;
  }
}

async function announceDiscordAppUpdateIfNeeded() {
  const settings = getDiscordSettingsRaw();
  const releaseKey = currentAppReleaseKey();
  if (!settings.enabled || !settings.botToken || !settings.notify.appUpdates) {
    recordDiscordDeliverySafe({ status: "skipped", eventType: "app_update", summary: `Version ${appVersion} is now live.`, reason: "Discord disabled, bot token missing, or app update notifications disabled", metadata: discordDiagnosticContext("app_update", { version: appVersion, releaseKey, changelogUrl }, settings) });
    return;
  }
  const lastAnnounced = statements.getSetting.get("discord_last_announced_version")?.value ?? "";
  if (lastAnnounced === releaseKey) {
    recordDiscordDeliverySafe({ status: "skipped", eventType: "app_update", summary: `Version ${appVersion} is already announced.`, reason: `Release ${releaseKey} already announced`, metadata: discordDiagnosticContext("app_update", { version: appVersion, releaseKey, changelogUrl, lastAnnounced }, settings) });
    return;
  }
  const updateDetails = await currentAppUpdateDetails();
  const result = await sendDiscordActivity(
    "app_update",
    updateDetails.summary,
    new Date().toISOString(),
    { version: appVersion, releaseKey, changelogUrl, changeNotes: updateDetails.changeNotes },
    settings,
  );
  if (result.ok && !result.skipped) statements.upsertSetting.run("discord_last_announced_version", releaseKey, new Date().toISOString());
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
    recordDiscordDeliverySafe({ status: "skipped", eventType: "supply_report", summary: "Scheduled supply report", reason: "Discord disabled, bot token missing, or scheduled reports disabled", metadata: discordDiagnosticContext("supply_report", {}, settings) });
    return;
  }
  const lastSent = statements.getSetting.get("discord_last_supply_report_at")?.value ?? "";
  const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;
  const intervalMs = settings.supplyReportIntervalDays * 24 * 60 * 60 * 1000;
  if (lastSentMs && Date.now() - lastSentMs < intervalMs) return;
  const channelKey = settings.notificationChannels?.supplyReport ?? "modNotes";
  const channelId = settings.channels?.[channelKey] || settings.channelId;
  try {
    const response = await sendDiscordMessage({
      embeds: [discordSupplyEmbed(claim)],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDeliverySafe({ status: "sent", eventType: "supply_report", channelId, channelKey, summary: "Scheduled supply report", metadata: discordDiagnosticContext("supply_report", { claimId: claim.entityId ?? claim.id, supplies: claim.supplies }, settings), response: { id: response?.id, channel_id: response?.channel_id } });
  } catch (error) {
    recordDiscordDeliverySafe({ status: "failed", eventType: "supply_report", channelId, channelKey, summary: "Scheduled supply report", error: error instanceof Error ? error.message : String(error), metadata: discordDiagnosticContext("supply_report", { claimId: claim.entityId ?? claim.id, supplies: claim.supplies }, settings) });
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

function craftOutputCatalog(craftsPayload) {
  return new Map([...(craftsPayload?.items ?? []), ...(craftsPayload?.cargos ?? [])].map((item) => [String(item.id), item]));
}

function craftPrimarySkill(craft) {
  const skillId = toNumber(craft.levelRequirements?.[0]?.skill_id ?? craft.experiencePerProgress?.[0]?.skill_id);
  return skillId ? skillNames[skillId] ?? `Profession ${skillId}` : "";
}

function craftExperiencePerProgress(craft) {
  const skillId = toNumber(craft.levelRequirements?.[0]?.skill_id ?? craft.experiencePerProgress?.[0]?.skill_id);
  const match = craft.experiencePerProgress?.find?.((entry) => toNumber(entry.skill_id) === skillId);
  return toNumber(match?.quantity ?? craft.experiencePerProgress?.[0]?.quantity);
}

function craftContributionOutputItem(craft, catalog) {
  const outputId = craft.craftedItem?.[0]?.item_id;
  return catalog.get(String(outputId)) ?? {};
}

function craftContributionRecord(claimId, craft, contribution, catalog, observedAt) {
  const craftId = String(craft.entityId ?? "").trim();
  const contributorId = String(contribution.contributorEntityId ?? contribution.playerEntityId ?? contribution.entityId ?? "").trim();
  if (!craftId || !contributorId) return null;
  const item = craftContributionOutputItem(craft, catalog);
  const progress = toNumber(contribution.totalProgressContributed ?? contribution.contributedProgress ?? contribution.progress);
  const xpPerProgress = craftExperiencePerProgress(craft);
  return {
    key: `${claimId}:${craftId}:${contributorId}`,
    claimId,
    craftId,
    contributorId,
    contributorName: String(contribution.contributorUsername ?? contribution.username ?? contribution.userName ?? contributorId),
    profession: craftPrimarySkill(craft),
    craftLabel: String(item.name ?? craft.recipeName ?? craft.craftedItemName ?? "Unknown craft"),
    structureName: String(craft.buildingName ?? craft.structureName ?? "Unknown structure"),
    itemTier: item.tier == null ? (craft.tier == null ? null : String(craft.tier)) : String(item.tier),
    progress,
    xp: progress * xpPerProgress,
    count: toNumber(contribution.contributionCount),
    firstAt: contribution.firstContributedAt ?? null,
    lastAt: contribution.lastContributedAt ?? null,
    observedAt,
    raw: contribution,
  };
}

async function collectProductionContributionRecords(claimId, craftsPayload, observedAt) {
  const crafts = unwrap(craftsPayload, "craftResults", []).filter((craft) => craft?.entityId);
  const catalog = craftOutputCatalog(craftsPayload);
  const entries = await mapWithConcurrency(crafts, 4, async (craft) => {
    try {
      const contributions = await fetchCachedCraftContributions(craft.entityId);
      return contributions
        .map((contribution) => craftContributionRecord(claimId, craft, contribution, catalog, observedAt))
        .filter(Boolean);
    } catch {
      return [];
    }
  });
  return entries.flat();
}

function persistProductionContributions(records) {
  for (const record of records) {
    statements.upsertProductionContribution.run(
      record.key,
      record.claimId,
      record.craftId,
      record.contributorId,
      record.contributorName,
      record.profession || null,
      record.craftLabel,
      record.structureName,
      record.itemTier,
      record.progress,
      record.xp,
      record.count,
      record.firstAt,
      record.lastAt,
      record.observedAt,
      record.observedAt,
      JSON.stringify(record.raw),
    );
  }
}

async function recordSnapshot(payload) {
  const now = new Date().toISOString();
  let pendingProductionNotifications = [];
  let productionDiagnostics = [];
  const claimId = String(payload.claimId ?? payload.claim?.entityId ?? "");
  if (!claimId) throw new Error("Missing claim id");
  const productionContributionRecords = payload.crafts
    ? await collectProductionContributionRecords(claimId, payload.crafts, now)
    : [];

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
    mapWithConcurrency(partialCandidates, 4, async ({ listing, soldQuantity }) => ({ listing, soldQuantity, trade: await findConfirmedTrade(listing, soldQuantity) })),
    mapWithConcurrency(closedCandidates, 4, async ({ active, listing }) => ({ active, listing, trade: await findConfirmedTrade(listing, listing.quantity) })),
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
    if (payload.crafts) {
      const productionResult = recordProductionJobs(claimId, payload.crafts, now);
      pendingProductionNotifications = productionResult.pendingNotifications;
      productionDiagnostics = productionResult.diagnostics;
      persistProductionContributions(productionContributionRecords);
    }

    db.exec("COMMIT");
    for (const diagnostic of productionDiagnostics) recordDiscordDeliverySafe(diagnostic);
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
    ? await mapWithConcurrency(Array.from({ length: totalPages - 1 }, (_, index) => index + 2), 4, (page) => fetchBitjita(`${base}&page=${page}`))
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

async function fetchCachedPlayerDetail(playerId) {
  const key = String(playerId);
  const cached = playerDetailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const payload = await fetchBitjita(`/players/${encodeURIComponent(key)}`);
  const value = payload.player ?? payload;
  playerDetailCache.set(key, { value, expiresAt: Date.now() + 60 * 1000 });
  return value;
}

function fallbackPlayerFromMember(member, error) {
  const playerId = String(member?.playerEntityId ?? member?.entityId ?? member?.playerId ?? "").trim();
  return {
    entityId: playerId,
    playerEntityId: playerId,
    username: member?.userName ?? member?.username ?? member?.playerUsername ?? member?.name ?? playerId,
    userName: member?.userName ?? member?.username ?? member?.playerUsername ?? member?.name ?? playerId,
    signedIn: false,
    detailAvailable: false,
    detailError: error instanceof Error ? error.message : String(error ?? "Player detail unavailable"),
  };
}

async function fetchCachedCraftContributions(craftId) {
  const key = String(craftId);
  const cached = craftContributionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const payload = await fetchBitjita(`/crafts/${encodeURIComponent(key)}/contributions`);
  const value = payload.contributions ?? [];
  craftContributionCache.set(key, { value, expiresAt: Date.now() + 15 * 1000 });
  return value;
}

async function fetchAllRegionClaims(regionId) {
  const base = `/claims?regionId=${encodeURIComponent(regionId)}&limit=100&sort=supplies&order=desc`;
  const first = await fetchBitjita(`${base}&page=1`);
  const totalPages = Math.max(Math.ceil(toNumber(first.count) / 100), 1);
  const pages = totalPages > 1
    ? await mapWithConcurrency(Array.from({ length: totalPages - 1 }, (_, index) => index + 2), 4, (page) => fetchBitjita(`${base}&page=${page}`))
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

async function fetchCachedRegionClaims(regionId) {
  const key = String(regionId);
  const cached = regionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchAllRegionClaims(key);
  regionCache.set(key, { expiresAt: Date.now() + 10 * 60 * 1000, value });
  return value;
}

function parseRegionIds(value) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^\d+$/.test(entry));
}

function normalizeRegionRow(row, source = "bitjita") {
  const regionId = String(row?.regionId ?? row?.id ?? "").trim();
  if (!/^\d+$/.test(regionId)) return null;
  return {
    regionId,
    regionName: String(row?.regionName ?? row?.name ?? `Region ${regionId}`),
    active: row?.active !== false,
    syncing: row?.syncing === true,
    signedInPlayers: toNumber(row?.signedInPlayers ?? row?.playersOnline ?? row?.onlinePlayers),
    playersInQueue: toNumber(row?.playersInQueue ?? row?.queuedPlayers),
    updatedAt: row?.updatedAt ?? null,
    source,
  };
}

async function fetchCachedActiveRegions(extraRegionIds = []) {
  const settings = getSettings();
  const overrideIds = parseRegionIds(settings.additionalActiveRegions);
  const includeIds = parseRegionIds(extraRegionIds.join(","));
  const cacheKey = [...overrideIds, ...includeIds].sort((a, b) => toNumber(a) - toNumber(b)).join(",");
  if (activeRegionsCache && activeRegionsCache.key === cacheKey && activeRegionsCache.expiresAt > Date.now()) return activeRegionsCache.value;
  const [statusPayload, regionsPayload] = await Promise.all([
    fetchBitjita("/regions/status").catch(() => ({ regions: [] })),
    fetchBitjita("/regions").catch(() => []),
  ]);
  const byId = new Map();
  for (const row of unwrap(statusPayload, "regions", [])) {
    const normalized = normalizeRegionRow(row, "status");
    if (normalized) byId.set(normalized.regionId, normalized);
  }
  for (const row of unwrap(regionsPayload, "regions", Array.isArray(regionsPayload) ? regionsPayload : [])) {
    const normalized = normalizeRegionRow(row, "regions");
    if (!normalized) continue;
    byId.set(normalized.regionId, { ...normalized, ...byId.get(normalized.regionId), regionName: byId.get(normalized.regionId)?.regionName ?? normalized.regionName });
  }
  for (const regionId of [...overrideIds, ...includeIds]) {
    byId.set(regionId, {
      regionId,
      regionName: byId.get(regionId)?.regionName ?? `Region ${regionId}`,
      active: true,
      syncing: byId.get(regionId)?.syncing ?? false,
      signedInPlayers: byId.get(regionId)?.signedInPlayers ?? 0,
      playersInQueue: byId.get(regionId)?.playersInQueue ?? 0,
      updatedAt: byId.get(regionId)?.updatedAt ?? null,
      source: byId.has(regionId) ? byId.get(regionId).source : "admin",
    });
  }
  const value = {
    regions: [...byId.values()]
      .filter((region) => region.active !== false)
      .sort((a, b) => toNumber(a.regionId) - toNumber(b.regionId)),
    overrideRegionIds: overrideIds,
    updatedAt: new Date().toISOString(),
  };
  activeRegionsCache = { key: cacheKey, expiresAt: Date.now() + 5 * 60 * 1000, value };
  return value;
}

async function fetchMapCatalog() {
  if (mapCatalogCache && mapCatalogCache.expiresAt > Date.now()) return mapCatalogCache.value;
  const [resources, creatures] = await Promise.all([
    fetchBitjita("/resources"),
    fetchBitjita("/creatures"),
  ]);
  const value = { resources: unwrap(resources, "resources", []), creatures: unwrap(creatures, "creatures", []) };
  mapCatalogCache = { expiresAt: Date.now() + 10 * 60 * 1000, value };
  return value;
}

function passiveCraftTimestamp(value) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function summarizePassiveCrafts(payload) {
  const catalog = new Map(
    [...(payload?.items ?? []), ...(payload?.cargos ?? [])].map((item) => [String(item.id), item]),
  );
  const summaries = new Map();
  for (const craft of payload?.craftResults ?? []) {
    const output = craft.craftedItem?.[0] ?? {};
    const item = catalog.get(String(output.item_id)) ?? {};
    const outputName = item.name ?? "crafted item";
    const recipe = String(craft.recipeName ?? "Craft {0}")
      .replace(/\s*\{\d+\}/g, ` ${outputName}`)
      .replace(/\s+/g, " ")
      .trim();
    const key = [recipe, craft.buildingName, craft.status, item.id ?? output.item_id].join("|");
    const current = summaries.get(key);
    const timestamp = passiveCraftTimestamp(craft.timestamp);
    if (current) {
      current.quantity += toNumber(output.quantity) || 1;
      if (timestamp > current.sortTimestamp) {
        current.timestamp = craft.timestamp;
        current.sortTimestamp = timestamp;
      }
      continue;
    }
    summaries.set(key, {
      recipe,
      status: craft.status ?? "unknown",
      structure: craft.buildingName ?? "Unknown structure",
      timestamp: craft.timestamp,
      sortTimestamp: timestamp,
      quantity: toNumber(output.quantity) || 1,
      tier: item.tier,
    });
  }
  return Array.from(summaries.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp).slice(0, 8);
}

async function fetchCachedPassiveCrafts(member) {
  const playerId = String(member.playerEntityId ?? member.entityId ?? "").trim();
  if (!playerId) return { ok: false, error: "Missing player id" };
  const cached = passiveCraftsCache.get(playerId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const payload = await fetchBitjita(`/players/${encodeURIComponent(playerId)}/passive-crafts?status=all`);
  const value = {
    ok: true,
    playerId,
    memberName: member.userName ?? member.username ?? member.name ?? "Unknown member",
    rows: summarizePassiveCrafts(payload),
  };
  passiveCraftsCache.set(playerId, { value, expiresAt: Date.now() + 60 * 1000 });
  return value;
}

async function passiveCraftSummaries(body) {
  const members = Array.isArray(body?.members) ? body.members : [];
  const uniqueMembers = [...new Map(members
    .filter((member) => member && (member.playerEntityId ?? member.entityId))
    .slice(0, 50)
    .map((member) => [String(member.playerEntityId ?? member.entityId), member])).values()];
  const results = await mapWithConcurrency(uniqueMembers, 4, async (member) => {
    try {
      return await fetchCachedPassiveCrafts(member);
    } catch (error) {
      return {
        ok: false,
        playerId: String(member.playerEntityId ?? member.entityId ?? ""),
        memberName: member.userName ?? member.username ?? member.name ?? "Unknown member",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const rows = results
    .flatMap((result) => result.ok ? result.rows.map((row) => ({ ...row, playerId: result.playerId, memberName: result.memberName })) : [])
    .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
    .slice(0, 18);
  return {
    rows,
    requested: uniqueMembers.length,
    failed: results.filter((result) => !result.ok).length,
  };
}

async function playerDetailSummaries(body) {
  const members = Array.isArray(body?.members) ? body.members : [];
  const uniqueMembers = [...new Map(members
    .filter((member) => member && (member.playerEntityId ?? member.entityId))
    .slice(0, 100)
    .map((member) => [String(member.playerEntityId ?? member.entityId), member])).values()];
  const results = await mapWithConcurrency(uniqueMembers, 6, async (member) => {
    const playerId = String(member.playerEntityId ?? member.entityId ?? "");
    try {
      const player = await fetchCachedPlayerDetail(playerId);
      return { ok: true, player: { ...player, detailAvailable: true } };
    } catch (error) {
      return { ok: false, playerId, player: fallbackPlayerFromMember(member, error), error: error instanceof Error ? error.message : String(error) };
    }
  });
  return {
    players: results.map((result) => result.player),
    requested: uniqueMembers.length,
    failed: results.filter((result) => !result.ok).length,
    failures: results.filter((result) => !result.ok).map((result) => ({ playerId: result.playerId, error: result.error })).slice(0, 20),
  };
}

function itemCatalogKey(item) {
  const id = item?.id ?? item?.entityId ?? item?.itemId;
  return id == null ? "" : String(id);
}

function mergeCraftCatalogs(payloads) {
  const items = new Map();
  const cargos = new Map();
  const claims = new Map();
  for (const payload of payloads) {
    for (const item of unwrap(payload, "items", [])) {
      const key = itemCatalogKey(item);
      if (key) items.set(key, item);
    }
    for (const cargo of unwrap(payload, "cargos", [])) {
      const key = itemCatalogKey(cargo);
      if (key) cargos.set(key, cargo);
    }
    for (const claim of unwrap(payload, "claims", [])) {
      const key = itemCatalogKey(claim);
      if (key) claims.set(key, claim);
    }
  }
  return {
    items: [...items.values()],
    cargos: [...cargos.values()],
    claims: [...claims.values()],
  };
}

function craftClaimId(craft) {
  return String(craft?.claimEntityId ?? craft?.claim_entity_id ?? craft?.claim?.entityId ?? craft?.claimId ?? "");
}

function productionCraftCacheKey(claimId, members) {
  const ids = members.map((member) => String(member.playerEntityId ?? member.entityId ?? "")).filter(Boolean).sort();
  return `${claimId}:${ids.join(",")}`;
}

async function settlementProductionCrafts(body) {
  const claimId = String(body?.claimId ?? "").trim();
  if (!claimId) return { craftResults: [], items: [], cargos: [], claims: [], count: 0, publicCount: 0, privateCount: 0, failedMemberRequests: 0 };
  const members = Array.isArray(body?.members) ? body.members : [];
  const uniqueMembers = [...new Map(members
    .filter((member) => member && (member.playerEntityId ?? member.entityId))
    .slice(0, 50)
    .map((member) => [String(member.playerEntityId ?? member.entityId), member])).values()];
  const cacheKey = productionCraftCacheKey(claimId, uniqueMembers);
  const cached = productionCraftsCache.get(cacheKey);
  if (!body?.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const publicPayload = await fetchBitjita(`/crafts?claimEntityId=${encodeURIComponent(claimId)}&completed=false`).catch(() => ({ craftResults: [] }));
  const publicCrafts = unwrap(publicPayload, "craftResults", []);
  const publicIds = new Set(publicCrafts.map((craft) => String(craft.entityId ?? "")).filter(Boolean));
  const memberResults = await mapWithConcurrency(uniqueMembers, 4, async (member) => {
    const playerId = String(member.playerEntityId ?? member.entityId ?? "");
    try {
      return { ok: true, payload: await fetchBitjita(`/players/${encodeURIComponent(playerId)}/crafts?completed=false`) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const memberPayloads = memberResults.filter((result) => result.ok).map((result) => result.payload);
  const merged = new Map();

  for (const craft of publicCrafts) {
    if (!craft?.entityId || craftClaimId(craft) !== claimId) continue;
    merged.set(String(craft.entityId), { ...craft, isPublic: craft.isPublic !== false, visibilitySource: "claim-public" });
  }

  for (const payload of memberPayloads) {
    for (const craft of unwrap(payload, "craftResults", [])) {
      if (!craft?.entityId || craftClaimId(craft) !== claimId) continue;
      const id = String(craft.entityId);
      const existing = merged.get(id) ?? {};
      const isPublic = craft.isPublic === false ? false : publicIds.has(id) || craft.isPublic === true;
      merged.set(id, {
        ...existing,
        ...craft,
        isPublic,
        visibilitySource: isPublic ? existing.visibilitySource ?? "player-public" : "player-private",
      });
    }
  }

  const catalog = mergeCraftCatalogs([publicPayload, ...memberPayloads]);
  const craftResults = [...merged.values()].sort((a, b) => toNumber(b.totalActionsRequired) - toNumber(a.totalActionsRequired));
  const value = {
    craftResults,
    ...catalog,
    count: craftResults.length,
    publicCount: craftResults.filter((craft) => craft.isPublic !== false).length,
    privateCount: craftResults.filter((craft) => craft.isPublic === false).length,
    failedMemberRequests: memberResults.filter((result) => !result.ok).length,
  };
  productionCraftsCache.set(cacheKey, { value, expiresAt: Date.now() + 30 * 1000 });
  return value;
}

async function dashboardData(claimId) {
  const id = String(claimId ?? "").trim();
  if (!/^\d{8,}$/.test(id)) {
    const error = new Error("Choose a valid BitCraft settlement ID");
    error.statusCode = 400;
    throw error;
  }
  const [claimPayload, membersPayload, citizensPayload, buildingsPayload, constructionPayload, researchPayload, marketPayload, craftsPayload, regionStatus] = await Promise.all([
    fetchBitjita(`/claims/${id}`),
    fetchBitjita(`/claims/${id}/members`),
    fetchBitjita(`/claims/${id}/citizens`).catch(() => ({ citizens: [] })),
    fetchBitjita(`/claims/${id}/buildings`),
    fetchBitjita(`/claims/${id}/construction`).catch(() => ({ projects: [] })),
    fetchBitjita(`/claims/${id}/research`).catch(() => ({ research: [] })),
    fetchAllClaimListings(id).catch(() => ({ listings: [] })),
    fetchBitjita(`/crafts?claimEntityId=${encodeURIComponent(id)}&completed=false`).catch(() => ({ craftResults: [] })),
    fetchBitjita("/regions/status").catch(() => ({ regions: [] })),
  ]);
  const claim = claimPayload.claim ?? claimPayload;
  const members = unwrap(membersPayload, "members", []);
  const crafts = unwrap(craftsPayload, "craftResults", []);
  const [playerPayload, contributionEntries, region, tradeVolume] = await Promise.all([
    playerDetailSummaries({ members }),
    mapWithConcurrency(crafts.filter((craft) => craft.entityId), 4, async (craft) => {
      try {
        return [String(craft.entityId), await fetchCachedCraftContributions(craft.entityId)];
      } catch {
        return [String(craft.entityId), []];
      }
    }),
    claim?.regionId ? fetchCachedRegionClaims(claim.regionId).catch(() => ({ claims: [] })) : Promise.resolve({ claims: [] }),
    claim?.regionId ? fetchBitjita(`/stats/trade-volume?bucket=1%20day&limit=30&regionId=${encodeURIComponent(String(claim.regionId))}`).catch(() => ({ buckets: [], items: [], regions: [] })) : Promise.resolve({ buckets: [], items: [], regions: [] }),
  ]);
  return {
    claim: claimPayload,
    members: membersPayload,
    citizens: citizensPayload,
    buildings: buildingsPayload,
    construction: constructionPayload,
    research: researchPayload,
    market: marketPayload,
    crafts: craftsPayload,
    players: playerPayload.players ?? [],
    playerDetailDiagnostics: {
      requested: playerPayload.requested ?? 0,
      failed: playerPayload.failed ?? 0,
      failures: playerPayload.failures ?? [],
    },
    contributions: Object.fromEntries(contributionEntries),
    region,
    regionStatus,
    tradeVolume,
  };
}

async function craftContributionMap(crafts) {
  const entries = await mapWithConcurrency(crafts.filter((craft) => craft?.entityId), 4, async (craft) => {
    try {
      return [String(craft.entityId), await fetchCachedCraftContributions(craft.entityId)];
    } catch {
      return [String(craft.entityId), []];
    }
  });
  return Object.fromEntries(entries);
}

function currentStateCounts(data) {
  return {
    members: unwrap(data.members, "members", []).length,
    citizens: unwrap(data.citizens, "citizens", []).length,
    crafts: unwrap(data.crafts, "craftResults", []).length,
    marketListings: unwrap(data.market, "listings", []).length,
    players: Array.isArray(data.players) ? data.players.length : 0,
  };
}

function domainPayloadFromData(data, domain) {
  if (domain === "players") return { players: Array.isArray(data.players) ? data.players : [] };
  if (domain === "playerDetailDiagnostics") return data.playerDetailDiagnostics ?? {};
  return data[domain] ?? {};
}

function readDomainPayloadMap(claimId) {
  return Object.fromEntries(statements.domainPayloadsByClaim.all(String(claimId ?? "")).map((row) => [row.domain, {
    ...row,
    data: safeJson(row.data_json, {}),
  }]));
}

function rowData(row) {
  return safeJson(row?.data_json, {});
}

function tableBackedClaimData(claimId, rowsByDomain = {}) {
  const id = String(claimId ?? "");
  const payload = (domain, fallback) => rowsByDomain[domain]?.data ?? fallback;
  const claimRow = db.prepare("SELECT * FROM claim_current WHERE claim_id = ?").get(id);
  if (!claimRow) return null;

  const claim = {
    ...rowData(claimRow),
    entityId: rowData(claimRow).entityId ?? rowData(claimRow).id ?? id,
    id,
    claimId: id,
    name: claimRow.name ?? rowData(claimRow).name ?? rowData(claimRow).claimName,
    claimName: claimRow.name ?? rowData(claimRow).claimName ?? rowData(claimRow).name,
    regionId: claimRow.region_id ?? rowData(claimRow).regionId,
    regionName: claimRow.region_name ?? rowData(claimRow).regionName,
    ownerUsername: claimRow.owner_name ?? rowData(claimRow).ownerUsername ?? rowData(claimRow).ownerName,
    supplies: claimRow.supplies ?? rowData(claimRow).supplies,
    treasury: claimRow.treasury ?? rowData(claimRow).treasury,
    tier: claimRow.tier ?? rowData(claimRow).tier,
  };

  const memberRows = db.prepare("SELECT * FROM member_current WHERE claim_id = ? AND active = 1 ORDER BY username").all(id);
  const members = memberRows.map((row) => ({
    ...rowData(row),
    playerEntityId: row.player_entity_id ?? rowData(row).playerEntityId ?? row.member_key,
    entityId: row.player_entity_id ?? rowData(row).entityId ?? row.member_key,
    username: row.username ?? rowData(row).username ?? rowData(row).userName,
    userName: row.username ?? rowData(row).userName ?? rowData(row).username,
    coOwnerPermission: Boolean(row.co_owner_permission),
    officerPermission: Boolean(row.officer_permission),
    buildPermission: Boolean(row.build_permission),
    inventoryPermission: Boolean(row.inventory_permission),
  }));

  const players = db.prepare("SELECT * FROM player_current WHERE claim_id = ? AND active = 1 ORDER BY username").all(id).map((row) => ({
    ...rowData(row),
    entityId: row.player_entity_id,
    playerEntityId: row.player_entity_id,
    username: row.username ?? rowData(row).username ?? rowData(row).userName,
    userName: row.username ?? rowData(row).userName ?? rowData(row).username,
    signedIn: Boolean(row.signed_in),
    online: Boolean(row.signed_in),
    signInTimestamp: row.sign_in_timestamp,
    sessionSeconds: row.session_seconds,
    timePlayedSeconds: row.time_played_seconds,
    totalPlayedSeconds: row.time_played_seconds,
    timeSignedInSeconds: row.time_signed_in_seconds,
    totalSignedInSeconds: row.time_signed_in_seconds,
  }));

  const professionGroups = new Map();
  for (const row of db.prepare("SELECT * FROM profession_current WHERE claim_id = ?").all(id)) {
    const key = String(row.player_entity_id ?? row.username ?? "");
    if (!key) continue;
    const current = professionGroups.get(key) ?? {
      playerEntityId: row.player_entity_id,
      entityId: row.player_entity_id,
      username: row.username,
      userName: row.username,
      skills: {},
      totalLevel: 0,
      totalSkillLevel: 0,
      totalXP: 0,
      totalXp: 0,
    };
    current.skills[String(row.profession_id)] = row.level;
    current.totalLevel += toNumber(row.level);
    current.totalSkillLevel = current.totalLevel;
    current.totalXP += toNumber(row.xp);
    current.totalXp = current.totalXP;
    professionGroups.set(key, current);
  }
  const citizens = [...professionGroups.values()];

  const productionPayload = payload("crafts", {});
  const production = db.prepare("SELECT * FROM production_current WHERE claim_id = ? AND active = 1 ORDER BY last_seen DESC").all(id).map((row) => {
    const raw = rowData(row);
    const rawItem = raw.item ?? raw.output ?? raw.craftedItem?.[0] ?? {};
    const itemName = rawItem.name ?? raw.outputItemName ?? raw.itemName ?? raw.recipeName ?? raw.name ?? row.label;
    const normalized = normalizeProductionJob({ ...raw, itemName, recipeName: raw.recipeName ?? itemName }, productionPayload);
    const label = itemName ?? normalized.label ?? row.label ?? raw.label;
    return {
      ...raw,
      entityId: row.craft_entity_id,
      id: row.craft_entity_id,
      label,
      item: {
        ...rawItem,
        ...(raw.item ?? {}),
        name: rawItem.name ?? raw.outputItemName ?? raw.itemName ?? label,
        tier: rawItem.tier ?? raw.item?.tier ?? row.tier ?? raw.tier,
      },
      buildingName: row.building_name ?? raw.buildingName,
      crafterName: row.crafter_name ?? raw.crafterName,
      skillName: row.profession ?? raw.skillName,
      tier: row.tier ?? raw.tier,
      totalXp: row.total_xp ?? raw.totalXp,
      progressPct: row.progress ?? raw.progressPct,
      isPublic: Boolean(row.is_public),
    };
  });

  const containerRows = db.prepare("SELECT * FROM inventory_container_current WHERE claim_id = ? AND active = 1 ORDER BY container_name").all(id);
  const itemRowsByContainer = new Map();
  for (const row of db.prepare("SELECT * FROM inventory_item_current WHERE claim_id = ?").all(id)) {
    const list = itemRowsByContainer.get(row.container_key) ?? [];
    list.push(row);
    itemRowsByContainer.set(row.container_key, list);
  }
  const rawInventoryPayload = payload("inventories", {});
  const inventoryItems = new Map((rawInventoryPayload.items ?? []).map((entry) => [String(entry.id), entry]));
  const inventoryCargos = new Map((rawInventoryPayload.cargos ?? []).map((entry) => [String(entry.id), entry]));
  const buildings = containerRows.map((container) => {
    const slots = (itemRowsByContainer.get(container.container_key) ?? []).map((row, index) => {
      const raw = rowData(row);
      const itemType = row.item_type === "cargo" || row.item_type === 1 || row.item_type === "1" ? "cargo" : "item";
      const catalogEntry = {
        ...((itemType === "cargo" ? inventoryCargos : inventoryItems).get(String(row.item_id)) ?? {}),
        ...raw,
        id: row.item_id,
        name: row.item_name ?? raw.name ?? (itemType === "cargo" ? inventoryCargos : inventoryItems).get(String(row.item_id))?.name,
        tier: row.tier ?? raw.tier ?? (itemType === "cargo" ? inventoryCargos : inventoryItems).get(String(row.item_id))?.tier,
        rarityStr: row.rarity ?? raw.rarityStr ?? raw.rarity ?? (itemType === "cargo" ? inventoryCargos : inventoryItems).get(String(row.item_id))?.rarityStr,
        iconAssetName: raw.iconAssetName ?? (itemType === "cargo" ? inventoryCargos : inventoryItems).get(String(row.item_id))?.iconAssetName,
        tag: raw.tag ?? (itemType === "cargo" ? inventoryCargos : inventoryItems).get(String(row.item_id))?.tag,
      };
      if (row.item_id != null) (itemType === "cargo" ? inventoryCargos : inventoryItems).set(String(row.item_id), catalogEntry);
      return {
        slot: index,
        contents: {
          ...raw,
          item_id: row.item_id,
          itemId: row.item_id,
          item_type: itemType,
          itemType,
          quantity: row.quantity,
        },
      };
    });
    return {
      ...rowData(container),
      entityId: container.container_key,
      buildingEntityId: container.building_id,
      buildingName: container.building_name ?? rowData(container).buildingName,
      buildingNickname: container.container_name ?? rowData(container).buildingNickname ?? rowData(container).name,
      inventory: slots,
    };
  });

  const materialRowsByProject = new Map();
  for (const row of db.prepare("SELECT * FROM construction_material_current WHERE claim_id = ?").all(id)) {
    const list = materialRowsByProject.get(row.project_key) ?? [];
    list.push({
      ...rowData(row),
      name: row.item_name ?? rowData(row).name,
      required: row.required_quantity,
      contributed: row.added_quantity,
      type: rowData(row).type ?? (rowData(row).itemType === "cargo" ? "cargo" : "item"),
      itemId: rowData(row).itemId ?? rowData(row).item_id ?? row.material_key,
      stored: rowData(row).stored ?? 0,
    });
    materialRowsByProject.set(row.project_key, list);
  }
  const constructionProjects = db.prepare("SELECT * FROM construction_project_current WHERE claim_id = ? AND active = 1 ORDER BY structure_name").all(id).map((row) => ({
    ...rowData(row),
    entityId: row.project_key,
    id: row.project_key,
    name: row.structure_name ?? rowData(row).name,
    structureName: row.structure_name ?? rowData(row).structureName,
    buildingName: row.structure_name ?? rowData(row).buildingName,
    progress: row.progress ?? rowData(row).progress,
    materials: materialRowsByProject.get(row.project_key) ?? [],
  }));

  const researchRows = db.prepare("SELECT * FROM research_current WHERE claim_id = ? ORDER BY name").all(id).map((row) => ({
    ...rowData(row),
    id: row.research_key,
    name: row.name ?? rowData(row).name,
    status: row.status ?? rowData(row).status,
    unlocked: row.status === "unlocked" || rowData(row).unlocked === true,
  }));

  const regionClaims = db.prepare("SELECT * FROM region_claim_current WHERE claim_id = ? ORDER BY name").all(id).map((row) => ({
    ...rowData(row),
    entityId: row.region_claim_id,
    id: row.region_claim_id,
    claimId: row.region_claim_id,
    regionId: row.region_id,
    name: row.name ?? rowData(row).name,
    claimName: row.name ?? rowData(row).claimName,
    supplies: row.supplies ?? rowData(row).supplies,
    treasury: row.treasury ?? rowData(row).treasury,
    ownerUsername: row.owner_name ?? rowData(row).ownerUsername ?? rowData(row).ownerName,
  }));
  const regionStatuses = db.prepare("SELECT * FROM region_status_current WHERE active = 1 ORDER BY CAST(region_id AS INTEGER)").all().map((row) => ({
    ...rowData(row),
    regionId: row.region_id,
    id: row.region_id,
    name: row.region_name ?? rowData(row).name,
    regionName: row.region_name ?? rowData(row).regionName,
    signedInPlayers: row.signed_in_players ?? rowData(row).signedInPlayers,
    playersInQueue: row.players_in_queue ?? rowData(row).playersInQueue,
  }));

  const market = statements.activeListings.all(id).map((row) => ({
    ...safeJson(row.raw_json, {}),
    entityId: row.listing_key,
    itemName: row.item_name,
    name: row.item_name,
    side: row.side,
    owner: row.owner,
    ownerUsername: row.owner,
    ownerEntityId: row.owner_entity_id,
    itemId: row.item_id,
    itemType: row.item_type,
    quantity: row.quantity,
    price: row.price,
    totalPrice: row.total_value,
    totalValue: row.total_value,
    tier: row.tier,
    rarity: row.rarity,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }));

  const fallbackData = domainRowsToAppData(id, rowsByDomain);
  return {
    ...fallbackData,
    claim: { ...payload("claim", {}), claim },
    members: { members },
    citizens: { citizens },
    crafts: { ...productionPayload, craftResults: production },
    players,
    inventories: {
      ...payload("inventories", {}),
      buildings,
      items: [...inventoryItems.values()],
      cargos: [...inventoryCargos.values()],
    },
    construction: {
      ...payload("construction", {}),
      projects: constructionProjects,
    },
    research: {
      technologies: researchRows,
      research: researchRows,
    },
    market: {
      ...payload("market", {}),
      listings: market,
    },
    region: {
      ...payload("region", {}),
      claims: regionClaims,
    },
    regionStatus: {
      ...payload("regionStatus", {}),
      regions: regionStatuses,
    },
  };
}

function domainRowsToAppData(claimId, rowsByDomain) {
  const payload = (domain, fallback) => rowsByDomain[domain]?.data ?? fallback;
  const partialErrors = Object.values(rowsByDomain)
    .flatMap((row) => {
      const data = row.data && typeof row.data === "object" ? row.data : {};
      return [...(Array.isArray(data.partialErrors) ? data.partialErrors : []), row.last_error].filter(Boolean);
    })
    .map((error) => String(error));
  const lastSuccessValues = Object.values(rowsByDomain).map((row) => row.last_success_at ?? row.collected_at).filter(Boolean);
  const lastAttemptValues = Object.values(rowsByDomain).map((row) => row.last_attempt_at).filter(Boolean);
  const lastSuccessAt = lastSuccessValues.sort().at(-1) ?? null;
  const lastAttemptAt = lastAttemptValues.sort().at(-1) ?? null;
  const lastError = Object.values(rowsByDomain).map((row) => row.last_error).filter(Boolean).at(-1) ?? null;
  const counts = currentStateCounts({
    members: payload("members", { members: [] }),
    citizens: payload("citizens", { citizens: [] }),
    crafts: payload("crafts", { craftResults: [] }),
    market: payload("market", { listings: [] }),
    players: unwrap(payload("players", { players: [] }), "players", []),
  });
  const dataAgeSeconds = lastSuccessAt ? Math.max(Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 1000), 0) : null;
  return {
    claim: payload("claim", {}),
    members: payload("members", { members: [] }),
    citizens: payload("citizens", { citizens: [] }),
    buildings: payload("buildings", { buildings: [] }),
    construction: payload("construction", { projects: [] }),
    research: payload("research", { research: [] }),
    market: payload("market", { listings: [] }),
    crafts: payload("crafts", { craftResults: [] }),
    players: unwrap(payload("players", { players: [] }), "players", []),
    playerDetailDiagnostics: payload("playerDetailDiagnostics", {}),
    contributions: payload("contributions", {}),
    region: payload("region", { claims: [] }),
    regionStatus: payload("regionStatus", { regions: [] }),
    tradeVolume: payload("tradeVolume", {}),
    inventories: payload("inventories", { buildings: [] }),
    recruitment: payload("recruitment", { applications: [] }),
    layout: payload("layout", {}),
    skills: payload("skills", {}),
    partialErrors: [...new Set(partialErrors)],
    serverFreshness: {
      claimId: String(claimId ?? ""),
      collectedAt: lastSuccessAt,
      lastAttemptAt,
      lastSuccessAt,
      lastError,
      dataAgeSeconds,
      stale: dataAgeSeconds != null ? dataAgeSeconds > serverRefreshIntervalMs() / 1000 * 2 : true,
      counts,
    },
    collectorStatus: collectorStatusPayload(),
  };
}

function insertDomainChange(claimId, domain, eventType, subjectKey, summary, occurredAt, metadata = {}) {
  const key = `${claimId}:${domain}:${eventType}:${subjectKey}:${occurredAt}`;
  statements.insertDomainChange.run(String(claimId), domain, eventType, String(subjectKey), summary, occurredAt, JSON.stringify(metadata), key);
}

function itemNameFromRow(row) {
  return String(row?.itemName ?? row?.name ?? row?.item?.name ?? row?.cargo?.name ?? row?.cargoName ?? "Unknown item");
}

function itemIdFromRow(row) {
  return String(row?.itemId ?? row?.item_id ?? row?.id ?? row?.item?.id ?? row?.cargo?.id ?? "");
}

function itemQuantityFromRow(row) {
  return toNumber(row?.quantity ?? row?.amount ?? row?.count ?? row?.stackSize);
}

function inventoryStoredTotalsFromPayload(inventories) {
  const totals = new Map();
  for (const building of unwrap(inventories, "buildings", [])) {
    for (const slot of building.inventory ?? []) {
      const contents = slot.contents ?? {};
      const type = contents.item_type === "cargo" || contents.itemType === "cargo" || contents.itemType === 1 ? "cargo" : "item";
      const itemId = contents.item_id ?? contents.itemId;
      if (itemId == null) continue;
      const key = `${type}:${itemId}`;
      totals.set(key, (totals.get(key) ?? 0) + toNumber(contents.quantity));
    }
  }
  return totals;
}

function persistCurrentRows(claimId, data, collectedAt) {
  const claim = data.claim?.claim ?? data.claim ?? {};
  const claimIdText = String(claimId ?? "");
  const members = unwrap(data.members, "members", []);
  const players = Array.isArray(data.players) ? data.players : [];
  const citizens = unwrap(data.citizens, "citizens", []);
  const production = unwrap(data.crafts, "craftResults", []);
  const inventories = unwrap(data.inventories, "buildings", []);
  const constructionProjects = unwrap(data.construction, "projects", unwrap(data.construction, "buildings", []));
  const researchRows = unwrap(data.research, "technologies", unwrap(data.research, "research", unwrap(data.research, "entries", [])));
  const regionClaims = unwrap(data.region, "claims", []);
  const regionStatuses = unwrap(data.regionStatus, "regions", []);

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM claim_current WHERE claim_id = ?").run(claimIdText);
    db.prepare(`
      INSERT INTO claim_current (claim_id, name, region_id, region_name, owner_name, supplies, treasury, tier, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      claimIdText,
      claim.name ?? claim.claimName ?? null,
      claim.regionId ?? claim.region_id ?? claim.region ?? null,
      claim.regionName ?? claim.region_name ?? null,
      claim.ownerUsername ?? claim.ownerName ?? claim.owner?.username ?? claim.owner?.name ?? null,
      toNumber(claim.supplies ?? claim.suppliesAmount),
      toNumber(claim.treasury ?? claim.treasuryBalance ?? claim.gold),
      claim.tier ?? claim.level ?? null,
      JSON.stringify(claim),
      collectedAt,
    );

    const previousMembers = new Map(db.prepare("SELECT * FROM member_current WHERE claim_id = ? AND active = 1").all(claimIdText).map((row) => [row.member_key, row]));
    db.prepare("UPDATE member_current SET active = 0, updated_at = ? WHERE claim_id = ?").run(collectedAt, claimIdText);
    const upsertMember = db.prepare(`
      INSERT INTO member_current (claim_id, member_key, player_entity_id, username, co_owner_permission, officer_permission, build_permission, inventory_permission, active, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(claim_id, member_key) DO UPDATE SET
        player_entity_id = excluded.player_entity_id,
        username = excluded.username,
        co_owner_permission = excluded.co_owner_permission,
        officer_permission = excluded.officer_permission,
        build_permission = excluded.build_permission,
        inventory_permission = excluded.inventory_permission,
        active = 1,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    const activeMemberKeys = new Set();
    for (const member of members) {
      const key = String(member.playerEntityId ?? member.player_entity_id ?? member.entityId ?? member.id ?? member.username ?? member.userName ?? "").trim();
      if (!key) continue;
      activeMemberKeys.add(key);
      const permissions = parseMemberPermissions(member);
      upsertMember.run(
        claimIdText,
        key,
        String(member.playerEntityId ?? member.player_entity_id ?? member.entityId ?? member.id ?? ""),
        member.username ?? member.userName ?? member.name ?? null,
        permissions.coOwnerPermission ? 1 : 0,
        permissions.officerPermission ? 1 : 0,
        permissions.buildPermission ? 1 : 0,
        permissions.inventoryPermission ? 1 : 0,
        JSON.stringify(member),
        collectedAt,
      );
      const previous = previousMembers.get(key);
      if (!previous) insertDomainChange(claimIdText, "members", "member_joined", key, `${member.username ?? member.userName ?? "A member"} joined the tracked settlement`, collectedAt, { member });
      else {
        const nextFlags = [permissions.coOwnerPermission, permissions.officerPermission, permissions.buildPermission, permissions.inventoryPermission].map(Boolean).join("|");
        const previousFlags = [previous.co_owner_permission, previous.officer_permission, previous.build_permission, previous.inventory_permission].map(Boolean).join("|");
        if (nextFlags !== previousFlags) insertDomainChange(claimIdText, "members", "member_permissions_changed", key, `${member.username ?? member.userName ?? "A member"} permission flags changed`, collectedAt, { before: previousFlags, after: nextFlags });
      }
    }
    for (const [key, member] of previousMembers) {
      if (!activeMemberKeys.has(key)) insertDomainChange(claimIdText, "members", "member_left", key, `${member.username ?? "A member"} left the tracked settlement`, collectedAt, { member });
    }

    db.prepare("UPDATE player_current SET active = 0, updated_at = ? WHERE claim_id = ?").run(collectedAt, claimIdText);
    const upsertPlayer = db.prepare(`
      INSERT INTO player_current (claim_id, player_entity_id, username, signed_in, sign_in_timestamp, session_seconds, time_played_seconds, time_signed_in_seconds, active, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(claim_id, player_entity_id) DO UPDATE SET
        username = excluded.username,
        signed_in = excluded.signed_in,
        sign_in_timestamp = excluded.sign_in_timestamp,
        session_seconds = excluded.session_seconds,
        time_played_seconds = excluded.time_played_seconds,
        time_signed_in_seconds = excluded.time_signed_in_seconds,
        active = 1,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    for (const player of players) {
      const key = String(player.entityId ?? player.playerEntityId ?? player.id ?? "").trim();
      if (!key) continue;
      upsertPlayer.run(
        claimIdText,
        key,
        player.username ?? player.userName ?? player.name ?? null,
        player.signedIn === true || player.online === true || player.isOnline === true ? 1 : 0,
        toNumber(player.signInTimestamp ?? player.sign_in_timestamp ?? player.signedInTimestamp ?? player.sessionStartTimestamp ?? player.session_start_timestamp),
        toNumber(player.sessionSeconds ?? player.session_seconds ?? player.currentSessionSeconds),
        toNumber(player.timePlayed ?? player.totalTimePlayed ?? player.totalPlayed ?? player.timePlayedSeconds ?? player.totalPlayedSeconds ?? player.time_played ?? player.total_time_played),
        toNumber(player.timeSignedIn ?? player.totalTimeSignedIn ?? player.totalSignedIn ?? player.timeSignedInSeconds ?? player.totalSignedInSeconds ?? player.time_signed_in ?? player.total_time_signed_in),
        JSON.stringify(player),
        collectedAt,
      );
    }

    db.prepare("DELETE FROM profession_current WHERE claim_id = ?").run(claimIdText);
    const insertProfession = db.prepare(`
      INSERT INTO profession_current (claim_id, player_entity_id, username, profession_id, profession_name, level, xp, tier, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const citizen of citizens) {
      const playerKey = String(citizen.playerEntityId ?? citizen.player_entity_id ?? citizen.entityId ?? citizen.id ?? citizen.username ?? "").trim();
      const entries = citizen.skills ?? citizen.professions ?? citizen.skillLevels ?? citizen.professionLevels ?? citizen.experience ?? [];
      const list = Array.isArray(entries) ? entries : Object.entries(entries).map(([key, value]) => ({ professionId: key, ...(value && typeof value === "object" ? value : { level: value }) }));
      for (const entry of list) {
        const professionId = String(entry.skillId ?? entry.skill_id ?? entry.professionId ?? entry.id ?? entry.name ?? "").trim();
        if (!playerKey || !professionId) continue;
        const level = toNumber(entry.level ?? entry.skillLevel ?? entry.value);
        insertProfession.run(claimIdText, playerKey, citizen.username ?? citizen.userName ?? citizen.name ?? null, professionId, entry.skillName ?? entry.professionName ?? entry.name ?? skillNames[toNumber(professionId)] ?? null, level, toNumber(entry.xp ?? entry.experience), Math.floor(level / 10) + 1, JSON.stringify(entry), collectedAt);
      }
    }

    const previousProduction = new Map(db.prepare("SELECT * FROM production_current WHERE claim_id = ? AND active = 1").all(claimIdText).map((row) => [row.craft_entity_id, row]));
    db.prepare("UPDATE production_current SET active = 0, updated_at = ? WHERE claim_id = ?").run(collectedAt, claimIdText);
    const upsertProduction = db.prepare(`
      INSERT INTO production_current (claim_id, craft_entity_id, label, building_name, crafter_name, profession, tier, total_xp, progress, is_public, active, first_seen, last_seen, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(claim_id, craft_entity_id) DO UPDATE SET
        label = excluded.label,
        building_name = excluded.building_name,
        crafter_name = excluded.crafter_name,
        profession = excluded.profession,
        tier = excluded.tier,
        total_xp = excluded.total_xp,
        progress = excluded.progress,
        is_public = excluded.is_public,
        active = 1,
        last_seen = excluded.last_seen,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    const activeProductionKeys = new Set();
    for (const craft of production) {
      const normalized = normalizeProductionJob(craft, data.crafts);
      const key = String(craft.entityId ?? craft.id ?? normalized.key).trim();
      if (!key) continue;
      activeProductionKeys.add(key);
      const previous = previousProduction.get(key);
      upsertProduction.run(claimIdText, key, normalized.label, normalized.buildingName, normalized.crafterName, normalized.skillName, normalized.tier, normalized.totalXp, normalized.progressPct, craft.isPublic === false ? 0 : 1, previous?.first_seen ?? collectedAt, collectedAt, JSON.stringify(craft), collectedAt);
      if (!previous) insertDomainChange(claimIdText, "production", "production_started", key, `Craft started: ${normalized.label}`, collectedAt, normalized);
    }
    for (const [key, craft] of previousProduction) {
      if (!activeProductionKeys.has(key)) insertDomainChange(claimIdText, "production", "production_removed", key, `Craft removed: ${craft.label ?? key}`, collectedAt, craft);
    }

    db.prepare("UPDATE inventory_container_current SET active = 0, updated_at = ? WHERE claim_id = ?").run(collectedAt, claimIdText);
    db.prepare("DELETE FROM inventory_item_current WHERE claim_id = ?").run(claimIdText);
    const upsertContainer = db.prepare(`
      INSERT INTO inventory_container_current (claim_id, container_key, container_name, building_id, building_name, active, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(claim_id, container_key) DO UPDATE SET
        container_name = excluded.container_name,
        building_id = excluded.building_id,
        building_name = excluded.building_name,
        active = 1,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    const insertInventoryItem = db.prepare(`
      INSERT OR REPLACE INTO inventory_item_current (claim_id, container_key, item_key, item_id, item_type, item_name, quantity, tier, rarity, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const building of inventories) {
      const containers = building.containers ?? building.inventories ?? building.storage ?? (building.entityId || building.id || Array.isArray(building.inventory) || Array.isArray(building.items) ? [building] : []);
      for (const container of Array.isArray(containers) ? containers : []) {
        const containerKey = String(container.entityId ?? container.id ?? container.containerId ?? building.entityId ?? building.id ?? `${building.name ?? "container"}:${containers.indexOf(container)}`).trim();
        if (!containerKey) continue;
        upsertContainer.run(claimIdText, containerKey, container.buildingNickname ?? container.nickname ?? container.name ?? building.buildingNickname ?? building.nickname ?? building.name ?? building.buildingName ?? null, building.entityId ?? building.id ?? null, building.name ?? building.buildingName ?? null, JSON.stringify(container), collectedAt);
        const items = container.items ?? container.inventory ?? container.contents ?? container.cargos ?? [];
        for (const item of Array.isArray(items) ? items : []) {
          const row = item.contents ?? item;
          const itemId = itemIdFromRow(item);
          const rowItemId = itemId || itemIdFromRow(row);
          const rowType = row.itemType ?? row.item_type ?? item.itemType ?? item.item_type ?? null;
          const itemKey = String(item.key ?? item.entityId ?? item.id ?? `${rowItemId || itemNameFromRow(row)}:${rowType ?? ""}`).trim();
          insertInventoryItem.run(claimIdText, containerKey, itemKey, rowItemId || null, rowType, itemNameFromRow(row), itemQuantityFromRow(row), row.tier ?? row.itemTier ?? item.tier ?? item.itemTier ?? null, row.rarity ?? row.itemRarityStr ?? item.rarity ?? item.itemRarityStr ?? null, JSON.stringify(row), collectedAt);
        }
      }
    }

    db.prepare("UPDATE construction_project_current SET active = 0, updated_at = ? WHERE claim_id = ?").run(collectedAt, claimIdText);
    db.prepare("DELETE FROM construction_material_current WHERE claim_id = ?").run(claimIdText);
    const upsertProject = db.prepare(`
      INSERT INTO construction_project_current (claim_id, project_key, structure_name, progress, active, data_json, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(claim_id, project_key) DO UPDATE SET
        structure_name = excluded.structure_name,
        progress = excluded.progress,
        active = 1,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    const insertMaterial = db.prepare(`
      INSERT OR REPLACE INTO construction_material_current (claim_id, project_key, material_key, item_name, required_quantity, added_quantity, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const storedTotals = inventoryStoredTotalsFromPayload(data.inventories);
    const constructionItemLookup = new Map((data.construction?.items ?? []).map((entry) => [String(entry.id), entry]));
    const constructionCargoLookup = new Map((data.construction?.cargos ?? []).map((entry) => [String(entry.id), entry]));
    for (const project of constructionProjects) {
      const projectKey = String(project.entityId ?? project.id ?? project.projectId ?? project.buildingEntityId ?? project.name ?? "").trim();
      if (!projectKey) continue;
      upsertProject.run(claimIdText, projectKey, project.structureName ?? project.buildingName ?? project.name ?? null, toNumber(project.progress ?? project.progressPct), JSON.stringify(project), collectedAt);
      const contributed = new Map();
      for (const [type, rows] of [["item", project.items ?? []], ["cargo", project.cargos ?? []]]) {
        for (const material of Array.isArray(rows) ? rows : []) {
          const itemId = material.item_id ?? material.itemId ?? material.id;
          if (itemId == null) continue;
          const key = `${type}:${itemId}`;
          contributed.set(key, (contributed.get(key) ?? 0) + toNumber(material.quantity ?? material.amount));
        }
      }
      const materialGroups = [
        ["item", project.consumedItemStacks?.length ? project.consumedItemStacks : project.items ?? [], constructionItemLookup],
        ["cargo", project.consumedCargoStacks?.length ? project.consumedCargoStacks : project.cargos ?? [], constructionCargoLookup],
      ];
      for (const [type, rows, lookup] of materialGroups) {
        for (const material of Array.isArray(rows) ? rows : []) {
          const itemId = material.item_id ?? material.itemId ?? material.id;
          if (itemId == null) continue;
          const lookupEntry = lookup.get(String(itemId)) ?? {};
          const key = `${type}:${itemId}`;
          const enriched = {
            ...material,
            type,
            itemId,
            name: lookupEntry.name ?? itemNameFromRow(material),
            tier: lookupEntry.tier ?? material.tier,
            rarity: lookupEntry.rarityStr ?? lookupEntry.rarity ?? material.rarityStr ?? material.rarity,
            iconAssetName: lookupEntry.iconAssetName ?? material.iconAssetName,
            stored: storedTotals.get(key) ?? 0,
          };
          insertMaterial.run(claimIdText, projectKey, key, enriched.name, toNumber(material.requiredQuantity ?? material.required ?? material.quantity ?? material.amount), contributed.get(key) ?? 0, JSON.stringify(enriched), collectedAt);
        }
      }
    }

    db.prepare("DELETE FROM research_current WHERE claim_id = ?").run(claimIdText);
    const insertResearch = db.prepare("INSERT INTO research_current (claim_id, research_key, name, status, data_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    for (const research of Array.isArray(researchRows) ? researchRows : []) {
      const key = String(research.entityId ?? research.id ?? research.researchId ?? research.name ?? "").trim();
      if (!key) continue;
      insertResearch.run(claimIdText, key, research.name ?? research.researchName ?? null, research.status ?? (research.unlocked ? "unlocked" : null), JSON.stringify(research), collectedAt);
    }

    db.prepare("DELETE FROM region_claim_current WHERE claim_id = ?").run(claimIdText);
    const insertRegionClaim = db.prepare(`
      INSERT INTO region_claim_current (claim_id, region_id, region_claim_id, name, supplies, treasury, owner_name, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const regionClaim of regionClaims) {
      const regionClaimId = String(regionClaim.entityId ?? regionClaim.id ?? regionClaim.claimId ?? "").trim();
      if (!regionClaimId) continue;
      insertRegionClaim.run(claimIdText, String(regionClaim.regionId ?? regionClaim.region_id ?? ""), regionClaimId, regionClaim.name ?? regionClaim.claimName ?? null, toNumber(regionClaim.supplies), toNumber(regionClaim.treasury ?? regionClaim.gold), regionClaim.ownerUsername ?? regionClaim.ownerName ?? null, JSON.stringify(regionClaim), collectedAt);
    }

    db.prepare("UPDATE region_status_current SET active = 0, updated_at = ?").run(collectedAt);
    const upsertRegionStatus = db.prepare(`
      INSERT INTO region_status_current (region_id, region_name, signed_in_players, players_in_queue, active, data_json, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(region_id) DO UPDATE SET
        region_name = excluded.region_name,
        signed_in_players = excluded.signed_in_players,
        players_in_queue = excluded.players_in_queue,
        active = 1,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    for (const region of regionStatuses) {
      const regionId = String(region.regionId ?? region.id ?? region.entityId ?? "").trim();
      if (!regionId) continue;
      upsertRegionStatus.run(regionId, region.name ?? region.regionName ?? `R${regionId}`, toNumber(region.signedInPlayers ?? region.signed_in_players), toNumber(region.playersInQueue ?? region.players_in_queue), JSON.stringify(region), collectedAt);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function persistDomainPayloads(claimId, data, attemptedAt, collectedAt) {
  for (const domain of domainPayloadKeys) {
    const payload = domainPayloadFromData(data, domain);
    const domainError = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.partialError : null;
    statements.upsertDomainPayload.run(String(claimId), domain, JSON.stringify(payload), collectedAt, attemptedAt, collectedAt, domainError ? String(domainError) : null, collectedAt);
  }
  persistCurrentRows(claimId, data, collectedAt);
}

function collectorDue(claimId, collectorKey, payloadDomain, options = {}) {
  if (options.force) return true;
  const settings = getCollectorSettings()[collectorKey] ?? { enabled: true, intervalSeconds: Math.round(serverRefreshIntervalMs() / 1000) };
  const row = statements.domainPayload.get(String(claimId ?? ""), payloadDomain);
  if (!row) return settings.enabled !== false;
  if (settings.enabled === false) return false;
  const lastSuccessAt = row.last_success_at ?? row.collected_at;
  if (!lastSuccessAt) return true;
  return Date.now() - new Date(lastSuccessAt).getTime() >= settings.intervalSeconds * 1000;
}

function previousPayload(previous, domain, fallback) {
  return previous[domain]?.data ?? fallback;
}

async function fetchDomainPayload(previous, domain, fallback, label, load) {
  try {
    return await load();
  } catch (error) {
    const fallbackPayload = previousPayload(previous, domain, fallback);
    const message = `${label} refresh failed: ${error instanceof Error ? error.message : String(error)}`;
    if (!fallbackPayload || typeof fallbackPayload !== "object" || Array.isArray(fallbackPayload)) {
      return { value: fallbackPayload, partialError: message, partialErrors: [message] };
    }
    return {
      ...fallbackPayload,
      partialError: message,
      partialErrors: [...(Array.isArray(fallbackPayload.partialErrors) ? fallbackPayload.partialErrors : []), message],
    };
  }
}

async function buildCurrentClaimData(claimId, options = {}) {
  const id = String(claimId ?? "").trim();
  if (!/^\d{8,}$/.test(id)) {
    const error = new Error("Choose a valid BitCraft settlement ID");
    error.statusCode = 400;
    throw error;
  }
  const previous = readDomainPayloadMap(id);
  const claimPayload = collectorDue(id, "claim", "claim", options)
    ? await fetchBitjita(`/claims/${id}`)
    : previousPayload(previous, "claim", {});
  const claim = claimPayload.claim ?? claimPayload;
  const membersPayload = collectorDue(id, "members", "members", options)
    ? await fetchBitjita(`/claims/${id}/members`)
    : previousPayload(previous, "members", { members: [] });
  const members = unwrap(membersPayload, "members", []);

  const [
    citizensPayload,
    buildingsPayload,
    constructionPayload,
    researchPayload,
    marketPayload,
    productionPayload,
    playerPayload,
    inventoriesPayload,
    recruitmentPayload,
    layoutPayload,
    skillsPayload,
    regionStatus,
  ] = await Promise.all([
    collectorDue(id, "professions", "citizens", options) ? fetchDomainPayload(previous, "citizens", { citizens: [] }, "Citizens", () => fetchBitjita(`/claims/${id}/citizens`)) : Promise.resolve(previousPayload(previous, "citizens", { citizens: [] })),
    collectorDue(id, "construction", "buildings", options) || collectorDue(id, "claim", "buildings", options) ? fetchDomainPayload(previous, "buildings", { buildings: [] }, "Buildings", () => fetchBitjita(`/claims/${id}/buildings`)) : Promise.resolve(previousPayload(previous, "buildings", { buildings: [] })),
    collectorDue(id, "construction", "construction", options) ? fetchDomainPayload(previous, "construction", { projects: [] }, "Construction", () => fetchBitjita(`/claims/${id}/construction`)) : Promise.resolve(previousPayload(previous, "construction", { projects: [] })),
    collectorDue(id, "research", "research", options) ? fetchDomainPayload(previous, "research", { research: [] }, "Research", () => fetchBitjita(`/claims/${id}/research`)) : Promise.resolve(previousPayload(previous, "research", { research: [] })),
    collectorDue(id, "market", "market", options) ? fetchDomainPayload(previous, "market", { listings: [] }, "Market", () => fetchAllClaimListings(id)) : Promise.resolve(previousPayload(previous, "market", { listings: [] })),
    collectorDue(id, "production", "crafts", options)
      ? settlementProductionCrafts({ claimId: id, members, forceRefresh: true }).catch((error) => {
        const fallback = previousPayload(previous, "crafts", { craftResults: [] });
        return { ...fallback, partialError: error instanceof Error ? error.message : String(error) };
      })
      : Promise.resolve(previousPayload(previous, "crafts", { craftResults: [] })),
    collectorDue(id, "players", "players", options) ? fetchDomainPayload(previous, "players", { players: [] }, "Player details", () => playerDetailSummaries({ members })) : Promise.resolve(previousPayload(previous, "players", { players: [] })),
    collectorDue(id, "inventory", "inventories", options) ? fetchDomainPayload(previous, "inventories", { buildings: [] }, "Inventories", () => fetchBitjita(`/claims/${id}/inventories`)) : Promise.resolve(previousPayload(previous, "inventories", { buildings: [] })),
    collectorDue(id, "inventory", "recruitment", options) ? fetchDomainPayload(previous, "recruitment", { applications: [] }, "Recruitment", () => fetchBitjita(`/claims/${id}/recruitment`)) : Promise.resolve(previousPayload(previous, "recruitment", { applications: [] })),
    collectorDue(id, "inventory", "layout", options) ? fetchDomainPayload(previous, "layout", {}, "Layout", () => fetchBitjita(`/claims/${id}/layout`)) : Promise.resolve(previousPayload(previous, "layout", {})),
    collectorDue(id, "mapCatalog", "skills", options) || collectorDue(id, "professions", "skills", options) ? fetchDomainPayload(previous, "skills", { skills: [] }, "Skills catalogue", () => fetchBitjita("/skills")) : Promise.resolve(previousPayload(previous, "skills", { skills: [] })),
    collectorDue(id, "region", "regionStatus", options) ? fetchDomainPayload(previous, "regionStatus", { regions: [] }, "Region status", () => fetchBitjita("/regions/status")) : Promise.resolve(previousPayload(previous, "regionStatus", { regions: [] })),
  ]);
  const productionCrafts = unwrap(productionPayload, "craftResults", []);
  const contributionEntries = collectorDue(id, "production", "contributions", options)
    ? Object.entries(await craftContributionMap(productionCrafts))
    : Object.entries(previousPayload(previous, "contributions", {}));
  const [region, tradeVolume] = await Promise.all([
    collectorDue(id, "region", "region", options) && claim?.regionId ? fetchDomainPayload(previous, "region", { claims: [] }, "Region claims", () => fetchCachedRegionClaims(claim.regionId)) : Promise.resolve(previousPayload(previous, "region", { claims: [] })),
    collectorDue(id, "market", "tradeVolume", options) && claim?.regionId ? fetchDomainPayload(previous, "tradeVolume", { buckets: [], items: [], regions: [] }, "Trade volume", () => fetchBitjita(`/stats/trade-volume?bucket=1%20day&limit=30&regionId=${encodeURIComponent(String(claim.regionId))}`)) : Promise.resolve(previousPayload(previous, "tradeVolume", { buckets: [], items: [], regions: [] })),
  ]);
  const players = unwrap(playerPayload, "players", Array.isArray(playerPayload) ? playerPayload : []);
  return {
    claim: claimPayload,
    members: membersPayload,
    citizens: citizensPayload,
    buildings: buildingsPayload,
    construction: constructionPayload,
    research: researchPayload,
    market: marketPayload,
    crafts: productionPayload,
    players,
    playerDetailDiagnostics: {
      requested: playerPayload.requested ?? previousPayload(previous, "playerDetailDiagnostics", {}).requested ?? 0,
      failed: playerPayload.failed ?? previousPayload(previous, "playerDetailDiagnostics", {}).failed ?? 0,
      failures: playerPayload.failures ?? previousPayload(previous, "playerDetailDiagnostics", {}).failures ?? [],
    },
    contributions: Object.fromEntries(contributionEntries),
    region,
    regionStatus,
    tradeVolume,
    inventories: inventoriesPayload,
    recruitment: recruitmentPayload,
    layout: layoutPayload,
    skills: skillsPayload,
  };
}

function readCurrentClaimState(claimId) {
  const rowsByDomain = readDomainPayloadMap(claimId);
  const tableBacked = tableBackedClaimData(claimId, rowsByDomain);
  if (tableBacked) return tableBacked;
  if (!Object.keys(rowsByDomain).length) return null;
  return domainRowsToAppData(claimId, rowsByDomain);
}

async function refreshCurrentClaimState(claimId, options = {}) {
  const id = String(claimId ?? "").trim();
  const attemptedAt = new Date().toISOString();
  const dueCollectors = Object.entries(collectorPrimaryPayloadDomain)
    .filter(([key, domain]) => collectorDue(id, key, domain, options))
    .map(([key]) => key);
  const domainStartedAt = Object.fromEntries(dueCollectors.map((key) => [key, collectorAttempt(key)]));
  try {
    const data = await buildCurrentClaimData(id, options);
    const collectedAt = new Date().toISOString();
    persistDomainPayloads(id, data, attemptedAt, collectedAt);
    for (const [key, startedAt] of Object.entries(domainStartedAt)) collectorSuccess(key, startedAt);
    return readCurrentClaimState(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const [key, startedAt] of Object.entries(domainStartedAt)) {
      statements.updateDomainPayloadError.run(attemptedAt, message, attemptedAt, id, key);
      collectorFailure(key, startedAt, error);
    }
    const cached = options.allowStaleOnError ? readCurrentClaimState(id) : null;
    if (cached) return cached;
    throw error;
  }
}

async function currentClaimAppData(claimId) {
  const id = String(claimId ?? "").trim();
  if (!/^\d{8,}$/.test(id)) {
    const error = new Error("Choose a valid BitCraft settlement ID");
    error.statusCode = 400;
    throw error;
  }
  const cached = readCurrentClaimState(id);
  if (cached) return cached;
  return refreshCurrentClaimState(id, { allowStaleOnError: true });
}

function collectorStatusPayload() {
  refreshCollectorStatusSettings();
  const intervalMs = serverRefreshIntervalMs();
  pollStatus.intervalMs = intervalMs;
  const nextRunAt = pollStatus.running ? null : pollStatus.nextRunAt;
  return {
    enabled: serverPollingEnabled,
    intervalMs,
    running: pollStatus.running,
    nextRunAt,
    lastAttemptAt: pollStatus.lastAttemptAt,
    lastSuccessAt: pollStatus.lastSuccessAt,
    lastError: pollStatus.lastError,
    collectors: Object.fromEntries(Object.entries(pollStatus.collectors).map(([key, value]) => {
      const domain = collectorPrimaryPayloadDomain[key];
      const row = domain ? statements.domainPayload.get(getSettings().claimId, domain) : null;
      const lastSuccessAt = value.lastSuccessAt ?? row?.last_success_at ?? row?.collected_at ?? null;
      const collectorNextRunAt = lastSuccessAt && value.enabled !== false
        ? new Date(new Date(lastSuccessAt).getTime() + toNumber(value.intervalMs ?? intervalMs)).toISOString()
        : value.nextRunAt ?? nextRunAt;
      return [key, { ...value, lastSuccessAt, nextRunAt: collectorNextRunAt }];
    })),
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
  pollStatus.intervalMs = serverRefreshIntervalMs();
  pollStatus.lastAttemptAt = new Date().toISOString();
  try {
    const { claimId } = getSettings();
    await processDiscordTempBans().catch((error) => console.warn(`Discord temporary ban processing failed: ${error instanceof Error ? error.message : String(error)}`));
    await refreshCurrentClaimState(claimId, { force });
    const currentData = domainRowsToAppData(claimId, readDomainPayloadMap(claimId));
    const claim = currentData.claim?.claim ?? currentData.claim;
    const members = unwrap(currentData.members, "members", []);
    const buildings = unwrap(currentData.buildings, "buildings", []);
    await sendScheduledSupplyReportIfDue(claim).catch((error) => console.warn(`Discord supply report failed: ${error instanceof Error ? error.message : String(error)}`));
    const snapshotStartedAt = collectorAttempt("snapshotHistory");
    await enqueueSnapshot({
      claimId,
      claim,
      membersCount: members.length,
      buildingsCount: buildings.length,
      market: currentData.market ?? { listings: [] },
      crafts: currentData.crafts ?? { craftResults: [] },
      source: "server_poll",
    });
    collectorSuccess("snapshotHistory", snapshotStartedAt);
    const storageStartedAt = collectorAttempt("storageActivity");
    pollStatus.storageLastAttemptAt = new Date().toISOString();
    const storageResult = await collectStorageActivity(claimId, currentData.inventories ?? { buildings: [] });
    pollStatus.storageRequests = storageResult.requested;
    pollStatus.storageInserted = storageResult.inserted;
    pollStatus.storageLastError = storageResult.failures.length ? storageResult.failures.join("; ") : null;
    pollStatus.storageLastSuccessAt = new Date().toISOString();
    if (storageResult.failures.length) collectorFailure("storageActivity", storageStartedAt, new Error(storageResult.failures.join("; ")));
    else collectorSuccess("storageActivity", storageStartedAt);
    const marketStartedAt = collectorAttempt("marketTrades");
    await importMemberSellTrades(claimId, members);
    collectorSuccess("marketTrades", marketStartedAt);
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

function snapshotHistory(claimId, { limit = 96, daily = false, days = 7 } = {}) {
  const snapshotLimit = Math.min(Math.max(Number(limit) || 96, 2), 1000);
  if (daily) {
    const dayLimit = Math.min(Math.max(Number(days) || 7, 2), 30);
    const since = new Date(Date.now() - (dayLimit - 1) * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);
    const rows = db.prepare(`
      SELECT s.id, s.claim_id, s.captured_at, s.supplies, s.treasury, s.members_count, s.buildings_count, s.market_count
      FROM snapshots s
      JOIN (
        SELECT substr(captured_at, 1, 10) AS day_key, MAX(captured_at) AS captured_at
        FROM snapshots
        WHERE claim_id = ? AND captured_at >= ?
        GROUP BY substr(captured_at, 1, 10)
      ) latest
        ON substr(s.captured_at, 1, 10) = latest.day_key
       AND s.captured_at = latest.captured_at
      WHERE s.claim_id = ?
      ORDER BY s.captured_at ASC, s.id ASC
    `).all(claimId, since.toISOString(), claimId);
    const snapshotsByDay = new Map();
    for (const row of rows) {
      const dayKey = String(row.captured_at ?? "").slice(0, 10);
      if (dayKey) snapshotsByDay.set(dayKey, row);
    }
    return { snapshots: Array.from(snapshotsByDay.values()).slice(-dayLimit) };
  }
  const snapshots = db.prepare(`
    SELECT id, claim_id, captured_at, supplies, treasury, members_count, buildings_count, market_count
    FROM snapshots
    WHERE claim_id = ?
    ORDER BY captured_at DESC, id DESC
    LIMIT ?
  `).all(claimId, snapshotLimit).reverse();
  return { snapshots };
}

function activityHistory(claimId, limit = 500) {
  const eventLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const events = db.prepare("SELECT * FROM activity_events WHERE claim_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?").all(claimId, eventLimit);
  const total = toNumber(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE claim_id = ?").get(claimId)?.count);
  return { events, total };
}

function escapeSqlLike(value) {
  return String(value ?? "").replace(/[\\%_]/g, (match) => `\\${match}`);
}

function activitySearch(claimId, query, limit = 500) {
  const search = String(query ?? "").trim();
  const eventLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  if (!search) return activityHistory(claimId, eventLimit);
  const pattern = `%${escapeSqlLike(search)}%`;
  const where = `
    claim_id = ?
    AND (
      summary LIKE ? ESCAPE '\\'
      OR event_type LIKE ? ESCAPE '\\'
      OR metadata_json LIKE ? ESCAPE '\\'
      OR occurred_at LIKE ? ESCAPE '\\'
    )
  `;
  const args = [claimId, pattern, pattern, pattern, pattern];
  const events = db.prepare(`
    SELECT *
    FROM activity_events
    WHERE ${where}
    ORDER BY occurred_at DESC, id DESC
    LIMIT ?
  `).all(...args, eventLimit);
  const total = toNumber(db.prepare(`SELECT COUNT(*) AS count FROM activity_events WHERE ${where}`).get(...args)?.count);
  return { events, total, query: search, searchedAllHistory: true };
}

function normalizedMemberName(value) {
  const name = String(value ?? "").trim();
  if (!name || name === "-" || /^unknown/i.test(name)) return "";
  return name;
}

function activityMemberName(row) {
  const metadata = safeJson(row.metadata_json, {});
  return normalizedMemberName(
    metadata.memberName ??
    metadata.member ??
    metadata.owner ??
    metadata.ownerUsername ??
    metadata.sellerUsername ??
    metadata.contributorName ??
    metadata.contributorUsername ??
    metadata.crafterName ??
    metadata.actorName ??
    metadata.playerName ??
    metadata.username ??
    metadata.userName ??
    metadata.subjectName
  );
}

function activityCategory(eventType) {
  const type = String(eventType ?? "").toLowerCase();
  if (type.includes("market") || type.includes("sale") || type.includes("listing")) return "marketEvents";
  if (type.includes("storage") || type.includes("deposit") || type.includes("withdraw")) return "storageEvents";
  if (type.includes("production") || type.includes("craft")) return "productionEvents";
  if (type.includes("construction")) return "constructionEvents";
  return "otherEvents";
}

function activityLeaderboard(claimId) {
  const rows = db.prepare(`
    SELECT *
    FROM activity_events
    WHERE claim_id = ?
    ORDER BY occurred_at DESC, id DESC
    LIMIT 5000
  `).all(claimId);
  const members = new Map();
  let ignoredRows = 0;
  for (const row of rows) {
    const name = activityMemberName(row);
    if (!name) {
      ignoredRows += 1;
      continue;
    }
    const key = name.toLowerCase();
    const current = members.get(key) ?? {
      name,
      totalEvents: 0,
      marketEvents: 0,
      storageEvents: 0,
      productionEvents: 0,
      constructionEvents: 0,
      otherEvents: 0,
      lastActivityAt: null,
      lastSummary: "",
    };
    current.totalEvents += 1;
    const category = activityCategory(row.event_type);
    current[category] = toNumber(current[category]) + 1;
    const occurredAt = row.occurred_at ?? "";
    if (!current.lastActivityAt || String(occurredAt) > current.lastActivityAt) {
      current.lastActivityAt = occurredAt;
      current.lastSummary = row.summary ?? "";
    }
    members.set(key, current);
  }
  const memberList = Array.from(members.values()).sort((a, b) => b.totalEvents - a.totalEvents || String(a.name).localeCompare(String(b.name)));
  return {
    summary: {
      memberCount: memberList.length,
      totalEvents: memberList.reduce((sum, row) => sum + toNumber(row.totalEvents), 0),
      ignoredRows,
      lastActivityAt: rows[0]?.occurred_at ?? null,
    },
    members: memberList,
  };
}

function marketLeaderboard(claimId) {
  const activeListings = db.prepare(`
    SELECT owner, owner_entity_id, quantity, price, total_value, last_seen
    FROM market_listings
    WHERE claim_id = ? AND status = 'active'
  `).all(claimId);
  const trades = db.prepare(`
    SELECT seller_username, seller_entity_id, quantity, total_price, occurred_at
    FROM market_trades
    WHERE claim_id = ?
    ORDER BY occurred_at DESC, trade_id DESC
  `).all(claimId);
  const members = new Map();
  const getMember = (name, id = "") => {
    const memberName = normalizedMemberName(name);
    if (!memberName) return null;
    const key = String(id || memberName).toLowerCase();
    const current = members.get(key) ?? {
      memberId: id || null,
      name: memberName,
      activeListings: 0,
      activeListingValue: 0,
      confirmedSales: 0,
      confirmedSaleValue: 0,
      unitsSold: 0,
      lastSaleAt: null,
    };
    if (!current.memberId && id) current.memberId = id;
    members.set(key, current);
    return current;
  };
  for (const listing of activeListings) {
    const member = getMember(listing.owner, listing.owner_entity_id);
    if (!member) continue;
    member.activeListings += 1;
    member.activeListingValue += toNumber(listing.total_value) || toNumber(listing.quantity) * toNumber(listing.price);
  }
  for (const trade of trades) {
    const member = getMember(trade.seller_username, trade.seller_entity_id);
    if (!member) continue;
    member.confirmedSales += 1;
    member.confirmedSaleValue += toNumber(trade.total_price);
    member.unitsSold += toNumber(trade.quantity);
    const occurredAt = trade.occurred_at ?? "";
    if (!member.lastSaleAt || String(occurredAt) > member.lastSaleAt) member.lastSaleAt = occurredAt;
  }
  const memberList = Array.from(members.values())
    .sort((a, b) => b.confirmedSaleValue - a.confirmedSaleValue || b.activeListingValue - a.activeListingValue || String(a.name).localeCompare(String(b.name)));
  return {
    summary: {
      memberCount: memberList.length,
      activeListings: activeListings.length,
      activeListingValue: memberList.reduce((sum, row) => sum + toNumber(row.activeListingValue), 0),
      confirmedSales: trades.length,
      confirmedSaleValue: memberList.reduce((sum, row) => sum + toNumber(row.confirmedSaleValue), 0),
      unitsSold: memberList.reduce((sum, row) => sum + toNumber(row.unitsSold), 0),
      lastSaleAt: trades[0]?.occurred_at ?? null,
    },
    members: memberList,
  };
}

function contributionLeaderboard(claimId) {
  const rows = db.prepare(`
    SELECT *
    FROM production_contributions
    WHERE claim_id = ?
    ORDER BY last_contributed_at DESC, updated_at DESC
    LIMIT 5000
  `).all(claimId);
  const contributors = new Map();
  const professions = new Map();
  for (const row of rows) {
    const contributorKey = String(row.contributor_entity_id || row.contributor_name);
    const profession = String(row.profession || "Unknown");
    const contributor = contributors.get(contributorKey) ?? {
      contributorId: row.contributor_entity_id,
      name: row.contributor_name,
      totalProgress: 0,
      totalXp: 0,
      contributionCount: 0,
      craftCount: 0,
      lastContributedAt: null,
      professions: {},
    };
    contributor.totalProgress += toNumber(row.contributed_progress);
    contributor.totalXp += toNumber(row.contributed_xp);
    contributor.contributionCount += toNumber(row.contribution_count);
    contributor.craftCount += 1;
    if (!contributor.lastContributedAt || String(row.last_contributed_at ?? row.updated_at) > contributor.lastContributedAt) contributor.lastContributedAt = row.last_contributed_at ?? row.updated_at;
    contributor.professions[profession] = {
      progress: toNumber(contributor.professions[profession]?.progress) + toNumber(row.contributed_progress),
      xp: toNumber(contributor.professions[profession]?.xp) + toNumber(row.contributed_xp),
      crafts: toNumber(contributor.professions[profession]?.crafts) + 1,
    };
    contributors.set(contributorKey, contributor);

    const professionRow = professions.get(profession) ?? {
      profession,
      totalProgress: 0,
      totalXp: 0,
      craftCount: 0,
      contributorCount: new Set(),
      topContributor: "",
      topContributorProgress: 0,
      contributors: new Map(),
    };
    professionRow.totalProgress += toNumber(row.contributed_progress);
    professionRow.totalXp += toNumber(row.contributed_xp);
    professionRow.craftCount += 1;
    professionRow.contributorCount.add(contributorKey);
    const professionContributor = toNumber(professionRow.contributors.get(contributorKey)?.progress) + toNumber(row.contributed_progress);
    professionRow.contributors.set(contributorKey, { name: row.contributor_name, progress: professionContributor });
    if (professionContributor > professionRow.topContributorProgress) {
      professionRow.topContributor = row.contributor_name;
      professionRow.topContributorProgress = professionContributor;
    }
    professions.set(profession, professionRow);
  }
  const contributorList = Array.from(contributors.values())
    .map((entry) => ({ ...entry, professions: Object.entries(entry.professions).map(([profession, values]) => ({ profession, ...values })).sort((a, b) => b.progress - a.progress) }))
    .sort((a, b) => b.totalProgress - a.totalProgress);
  const professionList = Array.from(professions.values())
    .map((entry) => ({
      profession: entry.profession,
      totalProgress: entry.totalProgress,
      totalXp: entry.totalXp,
      craftCount: entry.craftCount,
      contributorCount: entry.contributorCount.size,
      topContributor: entry.topContributor,
      topContributorProgress: entry.topContributorProgress,
    }))
    .sort((a, b) => b.totalProgress - a.totalProgress);
  const contribution = {
    summary: {
      contributorCount: contributorList.length,
      professionCount: professionList.length,
      totalProgress: contributorList.reduce((sum, row) => sum + row.totalProgress, 0),
      totalXp: contributorList.reduce((sum, row) => sum + row.totalXp, 0),
      recordedCrafts: new Set(rows.map((row) => row.craft_entity_id)).size,
      lastContributedAt: rows[0]?.last_contributed_at ?? null,
    },
    contributors: contributorList.slice(0, 100),
    professions: professionList,
    recent: rows.slice(0, 50).map((row) => ({
      contributorId: row.contributor_entity_id,
      contributorName: row.contributor_name,
      profession: row.profession,
      craftLabel: row.craft_label,
      structureName: row.structure_name,
      itemTier: row.item_tier,
      totalProgress: toNumber(row.contributed_progress),
      totalXp: toNumber(row.contributed_xp),
      contributionCount: toNumber(row.contribution_count),
      firstContributedAt: row.first_contributed_at,
      lastContributedAt: row.last_contributed_at,
    })),
  };
  return {
    ...contribution,
    contribution,
    market: marketLeaderboard(claimId),
    activity: activityLeaderboard(claimId),
  };
}

function dashboardHistory(claimId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const treasuryRows = db.prepare(`
    SELECT metadata_json
    FROM activity_events
    WHERE claim_id = ? AND event_type = 'treasury' AND occurred_at >= ?
  `).all(claimId, todayStart.toISOString());
  const treasuryNetToday = treasuryRows.reduce((total, row) => {
    const metadata = safeJson(row.metadata_json, {});
    if (metadata.before == null || metadata.after == null) return total;
    return total + (toNumber(metadata.after) - toNumber(metadata.before));
  }, 0);
  const recentActivity = db.prepare(`
    SELECT *
    FROM activity_events
    WHERE claim_id = ? AND event_type NOT IN ('treasury', 'supplies')
    ORDER BY occurred_at DESC, id DESC
    LIMIT 5
  `).all(claimId);
  return { treasuryNetToday, recentActivity };
}

function localHistory(claimId, include = null, options = {}) {
  const sections = include instanceof Set && include.size ? include : new Set(["market", "activity", "snapshots"]);
  const history = {};
  if (sections.has("market")) history.market = marketHistory(claimId, 120);
  if (sections.has("activity")) history.activity = activityHistory(claimId, Math.min(Math.max(Number(options.activityLimit) || 2000, 1), 2000));
  if (sections.has("snapshots")) history.snapshots = snapshotHistory(claimId, { daily: true, days: 7, limit: 96 });
  if (sections.has("dashboard")) history.dashboard = dashboardHistory(claimId);
  return history;
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
    polling: collectorStatusPayload(),
    discord: { lastDelivery: discordLastDelivery, deliveryLog: discordDeliveryLog, gateway: { ...discordGatewayStatus } },
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
  res.writeHead(status, securityHeaders({ "content-type": contentType, "cache-control": "no-store", ...headers }));
  res.end(text);
}

function sendBinary(res, status, content, contentType, headers = {}) {
  res.writeHead(status, securityHeaders({ "content-type": contentType, "cache-control": "no-cache", ...headers }));
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

async function readRawBody(req, limit = BODY_LIMITS.json) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new RequestBodyTooLargeError(limit);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, limit = BODY_LIMITS.json) {
  return JSON.parse((await readRawBody(req, limit)).toString("utf8") || "{}");
}

const discordCommands = [
  { name: "help", description: "Show Timbersteel Trade bot commands and app links." },
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
  {
    name: "craftwatch",
    description: "Manage your craft profession notification roles.",
    options: [
      { type: 1, name: "list", description: "List your current craft notification roles." },
      { type: 1, name: "clear", description: "Remove all of your craft notification roles." },
    ],
  },
];

function registeredDiscordCommands() {
  return [
    ...discordCommands,
    ...statements.listDiscordCustomCommands.all().map((command) => ({
      name: command.name,
      description: String(command.description || "Custom Timbersteel command").slice(0, 100),
    })),
  ];
}

function discordOption(interaction, name) {
  return interaction?.data?.options?.find((option) => option.name === name)?.value;
}

function discordSubcommand(interaction) {
  return interaction?.data?.options?.find((option) => option.type === 1)?.name ?? "";
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

function discordUpdateMessageResponse(data) {
  return {
    type: 7,
    data: {
      allowed_mentions: { parse: [] },
      ...data,
    },
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

const discordPresenceActivityTypes = { playing: 0, listening: 2, watching: 3, competing: 5 };
let discordGatewaySocket = null;
let discordGatewayHeartbeat = null;
let discordGatewayReconnect = null;
let discordGatewaySessionToken = "";
const discordGatewayStatus = { connected: false, lastConnectedAt: null, lastDisconnectedAt: null, lastError: null, activity: "" };

function discordGatewayActivity(presence) {
  return {
    name: presence.activityText,
    type: discordPresenceActivityTypes[presence.activityType] ?? 3,
  };
}

function stopDiscordGateway() {
  if (discordGatewayHeartbeat) clearInterval(discordGatewayHeartbeat);
  if (discordGatewayReconnect) clearTimeout(discordGatewayReconnect);
  discordGatewayHeartbeat = null;
  discordGatewayReconnect = null;
  discordGatewaySessionToken = "";
  if (discordGatewaySocket) {
    try { discordGatewaySocket.close(); } catch {}
  }
  discordGatewaySocket = null;
  discordGatewayStatus.connected = false;
  discordGatewayStatus.lastDisconnectedAt = new Date().toISOString();
}

function scheduleDiscordGatewayReconnect(delayMs = 15000) {
  if (discordGatewayReconnect) clearTimeout(discordGatewayReconnect);
  discordGatewayReconnect = setTimeout(() => {
    discordGatewayReconnect = null;
    startDiscordGateway();
  }, delayMs);
}

function startDiscordGateway() {
  if (!discordStartupEnabled) {
    stopDiscordGateway();
    discordGatewayStatus.lastError = null;
    return;
  }
  const settings = getDiscordSettingsRaw();
  const presence = normalizeDiscordPresence(settings.presence ?? {});
  if (!settings.enabled || !settings.botToken || !presence.enabled || typeof WebSocket !== "function") {
    stopDiscordGateway();
    discordGatewayStatus.lastError = typeof WebSocket !== "function" ? "WebSocket is not available in this Node runtime" : null;
    return;
  }
  if (discordGatewaySocket && discordGatewaySessionToken === `${settings.botToken}:${presence.status}:${presence.activityType}:${presence.activityText}`) return;
  stopDiscordGateway();
  discordGatewaySessionToken = `${settings.botToken}:${presence.status}:${presence.activityType}:${presence.activityText}`;
  discordGatewayStatus.activity = `${presence.status} - ${presence.activityType} ${presence.activityText}`;
  const socket = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
  discordGatewaySocket = socket;
  socket.addEventListener("message", (event) => {
    const payload = safeJson(event.data, {});
    if (payload.op === 10) {
      const interval = Math.max(toNumber(payload.d?.heartbeat_interval), 10000);
      const heartbeat = () => {
        try { socket.send(JSON.stringify({ op: 1, d: null })); } catch {}
      };
      discordGatewayHeartbeat = setInterval(heartbeat, interval);
      heartbeat();
      socket.send(JSON.stringify({
        op: 2,
        d: {
          token: settings.botToken,
          intents: 0,
          properties: { os: "linux", browser: "timbersteel-trade", device: "timbersteel-trade" },
          presence: {
            status: presence.status,
            since: null,
            afk: false,
            activities: [discordGatewayActivity(presence)],
          },
        },
      }));
    }
    if (payload.op === 9) {
      discordGatewayStatus.lastError = "Discord gateway invalid session";
      scheduleDiscordGatewayReconnect(5000);
    }
  });
  socket.addEventListener("open", () => {
    discordGatewayStatus.connected = true;
    discordGatewayStatus.lastConnectedAt = new Date().toISOString();
    discordGatewayStatus.lastError = null;
  });
  socket.addEventListener("close", () => {
    if (discordGatewayHeartbeat) clearInterval(discordGatewayHeartbeat);
    discordGatewayHeartbeat = null;
    if (discordGatewaySocket === socket) discordGatewaySocket = null;
    discordGatewayStatus.connected = false;
    discordGatewayStatus.lastDisconnectedAt = new Date().toISOString();
    if (settings.enabled && settings.botToken && presence.enabled) scheduleDiscordGatewayReconnect();
  });
  socket.addEventListener("error", (event) => {
    discordGatewayStatus.lastError = event?.message ? String(event.message) : "Discord gateway connection error";
  });
}

function discordEmbedResponse(embed, options = {}) {
  return discordResponse("", { ...options, embeds: [embed] });
}

async function handleDiscordInteraction(req) {
  const rawBody = await readRawBody(req, BODY_LIMITS.discordInteraction);
  const settings = getDiscordSettingsRaw();
  if (!settings.publicKey || !verifyDiscordInteraction(req, rawBody, settings.publicKey)) {
    return { status: 401, body: { error: "Invalid Discord request signature" } };
  }
  const interaction = JSON.parse(rawBody.toString("utf8") || "{}");
  if (interaction.type === 1) return { status: 200, body: { type: 1 } };
  if (interaction.type === 4) return { status: 200, body: await discordAutocomplete(interaction) };
  if (interaction.type === 3) return { status: 200, body: await handleDiscordComponent(interaction) };
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

function discordHelpCommand() {
  const appUrl = "https://app.timbersteeltrade.com";
  return discordCommandEmbed("Timbersteel Trade Help", `[Open the dashboard](${appUrl}) for settlement monitoring, market analytics, public craft finding and bot settings.`, [
    { name: "/supplies", value: "Current settlement supplies, upkeep and runway.", inline: false },
    { name: "/online", value: "Shows which settlement members are currently online.", inline: false },
    { name: "/crafts", value: "Lists current settlement crafts. Optional skill filter supported.", inline: false },
    { name: "/price", value: "Looks up recent BitJita sale prices for an item.", inline: false },
    { name: "/craftwatch", value: "Shows and clears your profession notification roles.", inline: false },
    { name: "Links", value: `[App](${appUrl}) | [Feature requests](https://github.com/Red463/bitcraft-claim-monitor/issues)`, inline: false },
  ], 0x5865f2);
}

async function runDiscordCommand(interaction) {
  try {
    const command = String(interaction.data?.name ?? "");
    if (command === "help") return discordEmbedResponse(discordHelpCommand());
    if (command === "supplies") return discordEmbedResponse(await discordSuppliesCommand());
    if (command === "online") return discordEmbedResponse(await discordOnlineCommand());
    if (command === "crafts") return discordEmbedResponse(await discordCraftsCommand(String(discordOption(interaction, "skill") ?? "")));
    if (command === "price") return discordEmbedResponse(await discordPriceCommand(String(discordOption(interaction, "item") ?? ""), discordOption(interaction, "region")));
    if (command === "craftwatch") return await discordCraftWatchCommand(interaction);
    const custom = statements.getDiscordCustomCommand.get(command);
    if (custom) return discordResponse(custom.response, { ephemeral: false });
    return discordResponse("Unknown command.", { ephemeral: true });
  } catch (error) {
    return discordResponse(`Command failed: ${error instanceof Error ? error.message : String(error)}`, { ephemeral: true });
  }
}

async function handleDiscordComponent(interaction) {
  try {
    const customId = String(interaction.data?.custom_id ?? "");
    if (customId.startsWith("poll:")) return await handleDiscordVoteComponent(interaction, "poll");
    if (customId.startsWith("rsvp:")) return await handleDiscordVoteComponent(interaction, "rsvp");
    if (customId.startsWith("colourrole:")) return await handleDiscordColourRoleComponent(interaction);
    if (customId.startsWith("rolepanel:")) return await handleDiscordRolePanelComponent(interaction);
    if (customId.startsWith("welcome:")) return await handleDiscordWelcomeComponent(interaction);
    if (!customId.startsWith("craftwatch:")) return discordResponse("Unknown button.", { ephemeral: true });
    const [, action, professionKeyRaw, professionNameRaw = ""] = customId.split(":");
    const professionKey = normalizeProfessionKey(professionKeyRaw);
    const professionName = decodeURIComponent(professionNameRaw || professionKey || "Profession");
    const guildId = String(interaction.guild_id ?? "");
    const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
    const settings = getDiscordSettingsRaw();
    const roleId = String(settings.craftRoles?.[professionKey] ?? "").trim();
    if (!guildId || !userId || !professionKey) return discordResponse("Unable to update this watch. Discord did not provide enough context.", { ephemeral: true });
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    if (!roleId) return discordResponse(`${professionName} does not have a configured notification role yet.`, { ephemeral: true });
    const memberRoles = await getDiscordMemberRoleSet(guildId, userId, settings, interaction.member?.roles);
    if (action === "watch") {
      const removing = memberRoles.has(roleId);
      if (removing) await removeDiscordMemberRole(guildId, userId, roleId, settings);
      else await addDiscordMemberRole(guildId, userId, roleId, settings);
      recordDiscordDeliverySafe({
        status: "sent",
        eventType: "craftwatch_role",
        summary: `${removing ? "Removed" : "Added"} ${professionName} notification role`,
        reason: removing ? "Watch button toggled off" : "Watch button toggled on",
        metadata: { guildId, userId, professionKey, professionName, roleId, action: removing ? "remove" : "add" },
      });
      return discordResponse(
        removing
          ? `Stopped watching ${professionName} craft notifications. The ${professionName} notification role was removed from you.`
          : `You now have the ${professionName} notification role. Craft alerts always ping this role, so you will receive those pings while you have it. Click Toggle ${professionName} Notifications again to remove the role.`,
        { ephemeral: true },
      );
    }
    return discordResponse("Unknown craft watch action.", { ephemeral: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const customId = String(interaction.data?.custom_id ?? "");
    recordDiscordDeliverySafe({
      status: "failed",
      eventType: "craftwatch_role",
      summary: "Craft watch role update failed",
      error: message,
      metadata: { customId, guildId: interaction.guild_id, userId: interaction.member?.user?.id ?? interaction.user?.id },
    });
    return discordResponse(`Craft watch role update failed: ${message}`, { ephemeral: true });
  }
}

function discordComponentOptionsFromMessage(interaction, kind) {
  const prefix = `${kind}:`;
  const components = Array.isArray(interaction.message?.components) ? interaction.message.components : [];
  return components
    .flatMap((row) => Array.isArray(row.components) ? row.components : [])
    .map((component) => {
      const customId = String(component.custom_id ?? "");
      if (!customId.startsWith(prefix)) return null;
      const [, key, rawLabel = component.label ?? key] = customId.split(":");
      return { key, label: String(component.label ?? decodeURIComponent(rawLabel || key)) };
    })
    .filter(Boolean);
}

function discordComponentMessageMetadata(messageId, kind, interaction) {
  const row = statements.getDiscordComponentMessage.get(messageId, kind);
  if (row?.metadata_json) {
    try {
      const metadata = JSON.parse(row.metadata_json);
      if (Array.isArray(metadata.options) && metadata.options.length) return metadata;
    } catch {}
  }
  const options = discordComponentOptionsFromMessage(interaction, kind);
  const embed = Array.isArray(interaction.message?.embeds) ? interaction.message.embeds[0] : null;
  return {
    title: String(embed?.title ?? (kind === "rsvp" ? "Event RSVP" : "Poll")),
    description: String(embed?.description ?? (kind === "rsvp" ? "Choose your RSVP below." : "Vote using the buttons below.")),
    color: toNumber(embed?.color) || (kind === "rsvp" ? 0x4ee28a : 0x5865f2),
    options,
  };
}

function discordComponentCountFields(metadata, counts) {
  const byKey = new Map(counts.map((row) => [String(row.component_key), toNumber(row.count)]));
  const options = Array.isArray(metadata.options) ? metadata.options : [];
  return options.map((option, index) => {
    const count = byKey.get(String(option.key)) ?? 0;
    return {
      name: `${index + 1}. ${option.label}`,
      value: `${count.toLocaleString("en-GB")} vote${count === 1 ? "" : "s"}`,
      inline: true,
    };
  });
}

async function handleDiscordVoteComponent(interaction, kind) {
  const customId = String(interaction.data?.custom_id ?? "");
  const [, key, rawLabel = key] = customId.split(":");
  const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
  const messageId = String(interaction.message?.id ?? "");
  if (!userId || !messageId || !key) return discordResponse("Unable to record that selection.", { ephemeral: true });
  statements.upsertDiscordComponentVote.run(messageId, key, userId, kind, new Date().toISOString());
  const counts = statements.componentVoteCounts.all(messageId, kind);
  const metadata = discordComponentMessageMetadata(messageId, kind, interaction);
  if (metadata.options?.length) statements.upsertDiscordComponentMessage.run(messageId, kind, JSON.stringify(metadata), new Date().toISOString());
  const option = metadata.options?.find((entry) => String(entry.key) === key);
  const label = String(option?.label ?? decodeURIComponent(rawLabel || key));
  const fields = discordComponentCountFields(metadata, counts);
  if (!fields.length) return discordResponse(`Recorded: ${label}.`, { ephemeral: true });
  recordDiscordDeliverySafe({
    status: "sent",
    eventType: `${kind}_vote`,
    summary: `${kind === "rsvp" ? "RSVP" : "Poll"} vote recorded: ${label}`,
    metadata: { messageId, kind, componentKey: key, label, userId },
  });
  return discordUpdateMessageResponse({
    embeds: [discordCommandEmbed(metadata.title, metadata.description, fields, metadata.color)],
    components: interaction.message?.components ?? [],
  });
}

async function handleDiscordRolePanelComponent(interaction) {
  const customId = String(interaction.data?.custom_id ?? "");
  try {
    const [, panelKey, optionKey] = customId.split(":");
    const settings = getDiscordSettingsRaw();
    const guildId = String(interaction.guild_id ?? "");
    const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
    if (!guildId || !userId) return discordResponse("Role panels can only be used inside the Discord server.", { ephemeral: true });
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    const panel = settings.rolePanels.find((entry) => entry.key === panelKey);
    const option = panel?.options?.find((entry) => entry.key === optionKey);
    if (!panel || !option?.roleId) return discordResponse("That role option is no longer configured. Ask an admin to update the panel.", { ephemeral: true });
    const memberRoles = await getDiscordMemberRoleSet(guildId, userId, settings, interaction.member?.roles);
    const removing = memberRoles.has(option.roleId);
    if (panel.mode === "single") {
      for (const other of panel.options ?? []) {
        if (other.roleId && other.roleId !== option.roleId && memberRoles.has(other.roleId)) await removeDiscordMemberRole(guildId, userId, other.roleId, settings);
      }
      if (removing) await removeDiscordMemberRole(guildId, userId, option.roleId, settings);
      else await addDiscordMemberRole(guildId, userId, option.roleId, settings);
    } else {
      if (removing) await removeDiscordMemberRole(guildId, userId, option.roleId, settings);
      else await addDiscordMemberRole(guildId, userId, option.roleId, settings);
    }
    recordDiscordDeliverySafe({
      status: "sent",
      eventType: "role_panel_toggle",
      summary: `${removing ? "Removed" : "Added"} ${option.label}`,
      metadata: { guildId, userId, panelKey, optionKey, roleId: option.roleId, mode: panel.mode, action: removing ? "remove" : "add" },
    });
    return discordResponse(removing ? `Removed ${option.label}.` : `Added ${option.label}.`, { ephemeral: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType: "role_panel_toggle", summary: "Role panel update failed", error: message, metadata: { customId, guildId: interaction.guild_id, userId: interaction.member?.user?.id ?? interaction.user?.id } });
    return discordResponse(`Role update failed: ${message}`, { ephemeral: true });
  }
}

async function handleDiscordWelcomeComponent(interaction) {
  const customId = String(interaction.data?.custom_id ?? "");
  try {
    const [, action] = customId.split(":");
    const settings = getDiscordSettingsRaw();
    const flow = settings.welcomeFlow;
    const guildId = String(interaction.guild_id ?? "");
    const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
    if (action !== "ready") return discordResponse("Unknown welcome action.", { ephemeral: true });
    if (!guildId || !userId) return discordResponse("This button can only be used inside the Discord server.", { ephemeral: true });
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    if (flow.readyRoleId) await addDiscordMemberRole(guildId, userId, flow.readyRoleId, settings);
    recordDiscordDeliverySafe({ status: "sent", eventType: "welcome_ready", summary: "Welcome Ready clicked", metadata: { guildId, userId, roleId: flow.readyRoleId } });
    return discordResponse(flow.readyRoleId ? "You are marked as ready and your access role has been applied." : "You are marked as ready.", { ephemeral: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType: "welcome_ready", summary: "Welcome ready failed", error: message, metadata: { customId, guildId: interaction.guild_id, userId: interaction.member?.user?.id ?? interaction.user?.id } });
    return discordResponse(`Welcome update failed: ${message}`, { ephemeral: true });
  }
}

async function handleDiscordColourRoleComponent(interaction) {
  const customId = String(interaction.data?.custom_id ?? "");
  try {
    const [, action, colourKey, roleIdRaw = ""] = customId.split(":");
    const settings = getDiscordSettingsRaw();
    const guildId = String(interaction.guild_id ?? "");
    const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
    if (action !== "select") return discordResponse("Unknown colour action.", { ephemeral: true });
    if (!guildId || !userId) return discordResponse("Colour roles can only be changed inside the Discord server.", { ephemeral: true });
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    const roles = await resolvedColourRoles(settings);
    const selected = roles.find((role) => role.key === colourKey && role.roleId === roleIdRaw) ?? roles.find((role) => role.roleId === roleIdRaw);
    if (!selected) return discordResponse("That colour role is no longer configured. Ask an admin to repost the selector.", { ephemeral: true });
    const colourRoleIds = new Set(roles.map((role) => role.roleId));
    const memberRoles = new Set(Array.isArray(interaction.member?.roles) ? interaction.member.roles.map(String) : []);
    for (const roleId of colourRoleIds) {
      if (roleId !== selected.roleId && memberRoles.has(roleId)) await removeDiscordMemberRole(guildId, userId, roleId, settings);
    }
    if (!memberRoles.has(selected.roleId)) await addDiscordMemberRole(guildId, userId, selected.roleId, settings);
    recordDiscordDeliverySafe({
      status: "sent",
      eventType: "colour_role",
      summary: `Set colour role to ${selected.label}`,
      metadata: { guildId, userId, colourKey: selected.key, roleId: selected.roleId, removedRoleIds: [...colourRoleIds].filter((roleId) => roleId !== selected.roleId && memberRoles.has(roleId)) },
    });
    return discordResponse(`Your name colour is now ${selected.label}. Any previous colour role was removed.`, { ephemeral: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType: "colour_role", summary: "Colour role update failed", error: message, metadata: { customId, guildId: interaction.guild_id, userId: interaction.member?.user?.id ?? interaction.user?.id } });
    return discordResponse(`Colour role update failed: ${message}`, { ephemeral: true });
  }
}

async function discordCraftWatchCommand(interaction) {
  const guildId = String(interaction.guild_id ?? "");
  const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
  if (!guildId || !userId) return discordResponse("Craft watches can only be managed inside a Discord server.", { ephemeral: true });
  const settings = getDiscordSettingsRaw();
  const memberRoles = Array.isArray(interaction.member?.roles) ? new Set(interaction.member.roles.map(String)) : new Set();
  const roleEntries = Object.entries(settings.craftRoles ?? {}).filter(([, roleId]) => String(roleId ?? "").trim());
  const subcommand = discordSubcommand(interaction) || "list";
  if (subcommand === "clear") {
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    const removable = roleEntries.filter(([, roleId]) => memberRoles.has(String(roleId)));
    for (const [, roleId] of removable) await removeDiscordMemberRole(guildId, userId, String(roleId), settings);
    return discordResponse(`Removed ${removable.length.toLocaleString()} craft notification role${removable.length === 1 ? "" : "s"} from you.`, { ephemeral: true });
  }
  const watches = roleEntries.filter(([, roleId]) => memberRoles.has(String(roleId))).map(([key]) => professionLabel(key));
  return discordEmbedResponse(discordCommandEmbed("Craft Watches", "Your personal craft notification roles.", [
    { name: "Watching", value: watches.length ? watches.join(", ") : "None", inline: false },
  ]), { ephemeral: true });
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
    body: JSON.stringify(registeredDiscordCommands()),
  });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

function securityHeaders(headers = {}) {
  return {
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://bitjita.com https://discord.com",
      "frame-src https://bitcraftsync.app https://bitcraftmap.com https://bccodex.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    ...headers,
  };
}

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, securityHeaders({
    "content-type": "application/json",
    ...headers,
  }));
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
  res.writeHead(200, securityHeaders({
    "content-type": mimeType(candidate),
    "cache-control": candidate.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  }));
  if (method === "HEAD") return res.end();
  res.end(content);
  return true;
}

function pruneUpstreamCache(now = Date.now()) {
  for (const [key, value] of upstreamCache) {
    if (value.expiresAt <= now) upstreamCache.delete(key);
  }
  while (upstreamCache.size > UPSTREAM_CACHE_MAX_ENTRIES) {
    const oldestKey = upstreamCache.keys().next().value;
    if (!oldestKey) break;
    upstreamCache.delete(oldestKey);
  }
}

function bitjitaProxyCacheTtl(upstream) {
  const pathname = upstream.pathname;
  const policy = BITJITA_PROXY_CACHE_POLICIES.find((entry) => entry.pattern.test(pathname));
  return policy?.ttlMs ?? UPSTREAM_CACHE_TTL_MS;
}

function hasFreshUpstreamCache(upstream) {
  const key = upstream.toString();
  const cached = upstreamCache.get(key);
  return Boolean(cached && cached.expiresAt > Date.now());
}

async function fetchUpstreamCached(upstream) {
  const key = upstream.toString();
  const now = Date.now();
  const ttlMs = bitjitaProxyCacheTtl(upstream);
  const cached = upstreamCache.get(key);
  if (cached && cached.expiresAt > now) return { ...cached, cacheState: "hit" };
  if (cached) upstreamCache.delete(key);

  const inflight = upstreamInflight.get(key);
  if (inflight) {
    const value = await inflight;
    return { ...value, cacheState: "deduped" };
  }

  const request = (async () => {
    const response = await fetch(upstream, {
      headers: { accept: "application/json", "x-app-identifier": appIdentifier },
    });
    const body = Buffer.from(await response.arrayBuffer());
    const headers = {
      "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      "cache-control": `public, max-age=${Math.max(1, Math.floor(ttlMs / 1000))}`,
    };
    const value = { status: response.status, headers, body, expiresAt: Date.now() + ttlMs, ttlMs };
    if (response.ok) {
      upstreamCache.set(key, value);
      pruneUpstreamCache();
    }
    return value;
  })();

  upstreamInflight.set(key, request);
  try {
    const value = await request;
    return { ...value, cacheState: "miss" };
  } finally {
    upstreamInflight.delete(key);
  }
}

async function proxyBitjita(req, url, res) {
  const upstream = new URL(process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com");
  upstream.pathname = `/api/${url.pathname.slice("/api/bitjita/".length)}`;
  upstream.search = url.search;
  const cacheKey = upstream.toString();
  if (!hasFreshUpstreamCache(upstream) && !upstreamInflight.has(cacheKey) && !rateLimit(req, res, "proxy", RATE_LIMITS.proxy)) return;
  const response = await fetchUpstreamCached(upstream);
  res.writeHead(response.status, securityHeaders({ ...response.headers, "x-bitjita-cache": response.cacheState }));
  res.end(response.body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (shouldLogVisitor(url.pathname)) {
      res.once("finish", () => {
        try {
          recordVisitorSecurityEvent(req, url.pathname, res.statusCode);
        } catch (error) {
          if (!isTestRuntime) console.warn(`Visitor security logging failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method === "GET" && url.pathname === "/api/local/health") return send(res, 200, { ok: true, polling: collectorStatusPayload() });
    if (req.method === "GET" && url.pathname === "/api/local/collector-status") return send(res, 200, collectorStatusPayload());
    if (req.method === "GET" && url.pathname.startsWith("/api/bitjita/")) {
      return proxyBitjita(req, url, res);
    }
    if (req.method === "GET" && url.pathname === "/api/local/config") return send(res, 200, getSettings());
    if (req.method === "GET" && url.pathname.startsWith("/api/local/pages/")) {
      try {
        const page = url.pathname.slice("/api/local/pages/".length).replace(/\/+$/, "") || "dashboard";
        if (!validPage(page)) return send(res, 404, { error: "Unknown page" });
        return send(res, 200, await currentClaimAppData(url.searchParams.get("claimId") ?? getSettings().claimId, page));
      } catch (error) {
        return send(res, error?.statusCode ?? 500, { error: error instanceof Error ? error.message : "Unable to load local page data", collectorStatus: collectorStatusPayload() });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/app-data") {
      try {
        return send(res, 200, await currentClaimAppData(url.searchParams.get("claimId") ?? getSettings().claimId, url.searchParams.get("page") ?? "dashboard"));
      } catch (error) {
        return send(res, error?.statusCode ?? 500, { error: error instanceof Error ? error.message : "Unable to load local app data", collectorStatus: collectorStatusPayload() });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/recipe-detail") {
      try {
        const kind = String(url.searchParams.get("kind") ?? "items") === "cargo" ? "cargo" : "items";
        const id = String(url.searchParams.get("id") ?? "").trim();
        if (!/^\d+$/.test(id)) return send(res, 400, { error: "Recipe item id is required" });
        const cached = statements.getRecipeCatalogEntry.get(recipeCatalogKey(kind, id));
        if (!cached && !rateLimit(req, res, "recipe-detail", RATE_LIMITS.expensiveLocal)) return;
        const target = {
          id,
          kind,
          itemType: kind === "cargo" ? 1 : 0,
          name: url.searchParams.get("name") ?? undefined,
          tier: url.searchParams.get("tier") ?? undefined,
          rarity: url.searchParams.get("rarity") ?? undefined,
          tag: url.searchParams.get("tag") ?? undefined,
          iconAssetName: url.searchParams.get("iconAssetName") ?? undefined,
        };
        return send(res, 200, await recipeDetailFromCatalogOrFetch(target));
      } catch (error) {
        return send(res, error?.statusCode ?? 502, { error: error instanceof Error ? error.message : "Unable to load recipe detail" });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/auth/me") return send(res, 200, authStatus(req));
    if (req.method === "GET" && url.pathname === "/api/local/auth/discord/start") {
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      return handleDiscordOAuthStart(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/api/local/auth/discord/callback") {
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      return handleDiscordOAuthCallback(req, res, url);
    }
    if (req.method === "POST" && url.pathname === "/api/local/auth/logout") {
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin sign-out rejected" });
      return send(res, 200, { ok: true, user: null, discordLoginEnabled: discordOAuthConfig(req).enabled }, { "set-cookie": clearAppUserSession(req) });
    }
    if (req.method === "PUT" && url.pathname === "/api/local/auth/character") {
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      const user = requireAppUser(req, res);
      if (!user) return;
      const body = await readJson(req, BODY_LIMITS.auth);
      const characterPlayerId = String(body.characterPlayerId ?? "").trim();
      const characterName = String(body.characterName ?? "").trim();
      if (!characterPlayerId && !characterName) {
        statements.updateUserCharacter.run("", "", "unlinked", user.id);
        return send(res, 200, { user: publicAppUser(statements.userBySession.get(tokenHash(parseCookies(req).bitcraft_user_session), new Date().toISOString())) });
      }
      if (!/^\d{8,}$/.test(characterPlayerId)) return send(res, 400, { error: "Choose a valid BitCraft character" });
      if (!characterName || characterName.length > 80) return send(res, 400, { error: "Character name is required" });
      statements.updateUserCharacter.run(characterPlayerId, characterName, "pending", user.id);
      const updatedUser = statements.userBySession.get(tokenHash(parseCookies(req).bitcraft_user_session), new Date().toISOString());
      void sendDiscordCharacterLinkRequest(updatedUser, { characterPlayerId, characterName });
      return send(res, 200, { user: publicAppUser(updatedUser) });
    }
    if (req.method === "PUT" && url.pathname === "/api/local/auth/settings") {
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      const user = requireAppUser(req, res);
      if (!user) return;
      const body = await readJson(req, BODY_LIMITS.settings);
      const raw = JSON.stringify(body.settings && typeof body.settings === "object" && !Array.isArray(body.settings) ? body.settings : {});
      if (raw.length > 50000) return send(res, 413, { error: "Saved settings are too large" });
      statements.updateUserSettings.run(raw, user.id);
      return send(res, 200, { user: publicAppUser(statements.userBySession.get(tokenHash(parseCookies(req).bitcraft_user_session), new Date().toISOString())) });
    }
    if (req.method === "POST" && url.pathname === "/api/discord/interactions") {
      if (!rateLimit(req, res, "discord-interaction", RATE_LIMITS.discordInteraction)) return;
      const result = await handleDiscordInteraction(req);
      return send(res, result.status, result.body);
    }
    if (req.method === "POST" && url.pathname === "/api/local/analytics/event") {
      if (!rateLimit(req, res, "analytics", RATE_LIMITS.analytics)) return;
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin analytics event rejected" });
      try {
        return send(res, 201, recordAnalyticsEvent(await readJson(req, BODY_LIMITS.analytics), req));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return send(res, error?.statusCode ?? (message === "Analytics consent is required" ? 403 : 400), { error: message });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/region/claims") {
      if (!rateLimit(req, res, "region-claims", RATE_LIMITS.expensiveLocal)) return;
      const regionId = String(url.searchParams.get("regionId") ?? "").trim();
      if (!/^\d+$/.test(regionId)) return send(res, 400, { error: "Region id is required" });
      return send(res, 200, await fetchCachedRegionClaims(regionId));
    }
    if (req.method === "GET" && url.pathname === "/api/local/regions/active") {
      if (!rateLimit(req, res, "regions-active", RATE_LIMITS.expensiveLocal)) return;
      const include = parseRegionIds(url.searchParams.get("include"));
      return send(res, 200, await fetchCachedActiveRegions(include));
    }
    if (req.method === "GET" && url.pathname === "/api/local/map/catalog") {
      if (!rateLimit(req, res, "map-catalog", RATE_LIMITS.expensiveLocal)) return;
      return send(res, 200, await fetchMapCatalog());
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/local/branding/")) {
      const type = url.pathname.slice("/api/local/branding/".length);
      const asset = brandingAsset(type);
      if (!asset) return send(res, 404, { error: "Brand asset not configured" });
      return sendBinary(res, 200, await readFile(asset.filePath), asset.contentType);
    }
    if (req.method === "GET" && url.pathname === "/api/local/admin/me") return send(res, 200, adminStatus(req));
    if (req.method === "POST" && url.pathname === "/api/local/admin/setup") {
      if (!legacyAdminPasswordAuth) return send(res, 410, { error: "Password administrator setup has been replaced by Discord administrator access" });
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin administrator setup rejected" });
      if (toNumber(statements.adminCount.get()?.count) > 0) return send(res, 409, { error: "Admin user already exists" });
      const body = await readJson(req, BODY_LIMITS.auth);
      if (isProduction && !adminSetupKey) return send(res, 503, { error: "Admin setup is disabled until ADMIN_SETUP_KEY is configured on the server" });
      if (isProduction && String(body.setupKey ?? "") !== adminSetupKey) return send(res, 403, { error: "Invalid server setup key" });
      const username = String(body.username ?? "admin").trim();
      if (!validAdminUsername(username)) return send(res, 400, { error: "Username must be 3-32 letters, numbers, underscores or hyphens" });
      const password = String(body.password ?? "");
      if (password.length < 12) return send(res, 400, { error: "Password must be at least 12 characters" });
      const createdAt = new Date().toISOString();
      const result = statements.insertAdmin.run(username, await hashPassword(password), "owner", createdAt);
      statements.updateLastLogin.run(createdAt, result.lastInsertRowid);
      audit({ id: result.lastInsertRowid, username }, "admin.setup", { username });
      const session = createSession(result.lastInsertRowid);
      return send(res, 200, adminStatus({ headers: { cookie: session.cookie } }), { "set-cookie": session.cookie });
    }
    if (req.method === "POST" && url.pathname === "/api/local/admin/login") {
      if (!legacyAdminPasswordAuth) return send(res, 410, { error: "Administrator sign-in now uses Discord. Sign in with an approved Discord admin account." });
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin administrator sign-in rejected" });
      const body = await readJson(req, BODY_LIMITS.auth);
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
      const requiredPermission = adminPermissionFor(req.method, url.pathname);
      if (!requireAdminPermission(req, res, user, requiredPermission)) return;
      if (req.method === "GET" && url.pathname === "/api/local/admin/status") return send(res, 200, databaseStatus());
      if (req.method === "GET" && url.pathname === "/api/local/admin/jobs") return send(res, 200, scheduledJobsStatus());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/jobs") {
        const body = await readJson(req, BODY_LIMITS.json);
        const key = String(body.key ?? "").trim();
        if (!scheduledJobRegistry[key]) return send(res, 404, { error: "Unknown scheduled job" });
        const row = statements.getScheduledJob.get(key);
        if (!row) return send(res, 404, { error: "Scheduled job is not configured" });
        const enabled = body.enabled === false ? 0 : 1;
        if (body.scheduleConfig && typeof body.scheduleConfig === "object") {
          const schedule = serializeScheduledJobSchedule(body.scheduleConfig);
          const updatedAt = new Date().toISOString();
          statements.updateScheduledJobSettings.run(schedule, enabled, nextScheduledRunIso(schedule), updatedAt, key);
          audit(user, "scheduled_job.update", { key, enabled: Boolean(enabled), schedule });
        } else {
          statements.setScheduledJobEnabled.run(enabled, new Date().toISOString(), key);
          audit(user, "scheduled_job.toggle", { key, enabled: Boolean(enabled) });
        }
        return send(res, 200, scheduledJobsStatus());
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/jobs/run") {
        const body = await readJson(req, BODY_LIMITS.json);
        const key = String(body.key ?? "").trim();
        recoverStaleScheduledJobs();
        if (!scheduledJobRegistry[key]) return send(res, 404, { error: "Unknown scheduled job", ...scheduledJobsStatus() });
        const row = statements.getScheduledJob.get(key);
        if (!row) return send(res, 404, { error: "Scheduled job is not configured", ...scheduledJobsStatus() });
        if (row.running) return send(res, 409, { error: "Scheduled job is already running", ...scheduledJobsStatus() });
        audit(user, "scheduled_job.run_started", { key });
        void runScheduledJob(key, { manual: true })
          .then((result) => audit(user, "scheduled_job.run_completed", { key, metadata: result.metadata }))
          .catch((error) => console.warn(`Manual scheduled job ${key} failed: ${error instanceof Error ? error.message : String(error)}`));
        return send(res, 202, { ...scheduledJobsStatus(), result: { ok: true, key, started: true } });
      }
      if (req.method === "POST" && (url.pathname === "/api/local/admin/poll" || url.pathname === "/api/local/admin/collect-now")) {
        await collectServerSnapshot(true);
        audit(user, url.pathname.endsWith("/collect-now") ? "data.collect_now" : "data.poll");
        return send(res, 200, { ...databaseStatus(), collectorStatus: collectorStatusPayload() });
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
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/discovery") {
        const discovery = await discordGuildDiscovery();
        audit(user, "discord.discovery", { channels: discovery.channels.length, roles: discovery.roles.length, members: discovery.memberCount });
        return send(res, 200, discovery);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/test") {
        const body = await readJson(req);
        const kind = String(body.kind ?? "basic");
        await sendDiscordTestNotification(kind);
        audit(user, "discord.test_message", { kind });
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/colour-roles/post") {
        const response = await postDiscordColourSelector();
        audit(user, "discord.colour_roles_post", { messageId: response?.id });
        return send(res, 200, { ok: true, response });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/colour-roles/manage") {
        const body = await readJson(req).catch(() => ({}));
        const current = getDiscordSettingsRaw();
        const result = await manageDiscordColourRoles({ ...current, ...body, colourRoles: Array.isArray(body.colourRoles) ? body.colourRoles : current.colourRoles });
        audit(user, "discord.colour_roles_manage", { count: result.roles.length, anchorRole: result.anchorRole?.name ?? null });
        return send(res, 200, { ok: true, ...result, settings: getSettings() });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/roles/create") {
        const body = await readJson(req);
        const role = await createDiscordRoleFromAdmin(body);
        audit(user, "discord.role_create", { roleId: role?.id, name: body.name ?? body.roleName });
        return send(res, 201, { ok: true, role });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/role-panel/post") {
        const body = await readJson(req);
        const result = await postDiscordRolePanel(String(body.panelKey ?? ""));
        audit(user, "discord.role_panel_post", { panelKey: result.panel.key, messageId: result.response?.id, action: result.action });
        return send(res, 200, { ok: true, ...result, settings: getSettings() });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/welcome/post") {
        const result = await postDiscordWelcomeFlow();
        audit(user, "discord.welcome_post", { messageId: result.response?.id, action: result.action });
        return send(res, 200, { ok: true, ...result, settings: getSettings() });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/audit-log") return send(res, 200, await discordAuditLogReport());
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/role-cleanup") return send(res, 200, await discordRoleCleanupReport());
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/channel-permissions") return send(res, 200, await discordChannelPermissionReport());
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/inactive-report") {
        const body = await readJson(req).catch(() => ({}));
        return send(res, 200, await discordInactiveMemberReport(toNumber(body.days) || 30));
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/announcement") {
        const body = await readJson(req);
        const response = await sendDiscordAnnouncement(body);
        audit(user, "discord.announcement", { channelId: body.channelId, messageId: response?.id });
        return send(res, 200, { ok: true, response });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/pinned-info") {
        const body = await readJson(req);
        const result = await updateDiscordPinnedInfo(body);
        audit(user, "discord.pinned_info", { channelId: body.channelId, messageId: result.response?.id, action: result.action });
        return send(res, 200, { ok: true, ...result });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/scheduled-event") {
        const body = await readJson(req);
        const response = await createDiscordScheduledEvent(body);
        audit(user, "discord.scheduled_event", { eventId: response?.id, name: body.name });
        return send(res, 200, { ok: true, response });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/moderation/bans") return send(res, 200, await discordModerationBans());
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/timeout") {
        const body = await readJson(req);
        const result = await discordModerationTimeout(body);
        audit(user, "discord.moderation_timeout", { userId: result.userId, minutes: result.minutes });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/kick") {
        const body = await readJson(req);
        const result = await discordModerationKick(body);
        audit(user, "discord.moderation_kick", { userId: result.userId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/ban") {
        const body = await readJson(req);
        const result = await discordModerationBan(body);
        audit(user, "discord.moderation_ban", { userId: result.userId, deleteMessageSeconds: result.deleteMessageSeconds });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/unban") {
        const body = await readJson(req);
        const result = await discordModerationUnban(body);
        audit(user, "discord.moderation_unban", { userId: result.userId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/purge") {
        const body = await readJson(req);
        const result = await discordModerationPurge(body);
        audit(user, "discord.moderation_purge", { channelId: result.channelId, requested: result.requested, deleted: result.deleted });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/temp-ban") {
        const body = await readJson(req);
        const result = await discordTemporaryBan(body);
        audit(user, "discord.moderation_temp_ban", { userId: result.userId, hours: result.hours, unbanAt: result.unbanAt });
        return send(res, 200, result);
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/moderation/cases") return send(res, 200, discordCaseLog(url.searchParams.get("limit") ?? 80));
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/warnings") {
        const body = await readJson(req);
        const result = await discordWarningCreate(body, user.username);
        audit(user, "discord.warning_create", { userId: body.userId, warningId: result.warningId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/warnings/list") return send(res, 200, discordWarnings(await readJson(req)));
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/warnings/clear") {
        const body = await readJson(req);
        const result = discordWarningsClear(body, user.username);
        audit(user, "discord.warning_clear", { userId: body.userId, cleared: result.cleared });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/notes") {
        const body = await readJson(req);
        const result = discordModNoteCreate(body, user.username);
        audit(user, "discord.mod_note_create", { userId: body.userId, noteId: result.noteId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/notes/list") return send(res, 200, discordModNotes(await readJson(req)));
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/slowmode") {
        const result = await discordSlowmode(await readJson(req));
        audit(user, "discord.slowmode", { channelId: result.channelId, seconds: result.seconds });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/lockdown") {
        const result = await discordLockdown(await readJson(req));
        audit(user, result.locked ? "discord.lockdown" : "discord.unlock", { channelId: result.channelId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/automod") {
        const result = await syncDiscordAutoModeration(await readJson(req));
        audit(user, "discord.automod_create", { ruleId: result.rule?.id });
        return send(res, 200, result);
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/moderation/automod") return send(res, 200, await discordNativeAutoModerationRules());
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/nickname-report") return send(res, 200, await discordNicknameReport(await readJson(req)));
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/profile") return send(res, 200, await discordMemberProfile(await readJson(req)));
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/custom-commands") return send(res, 200, discordCustomCommands());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/discord/custom-commands") {
        const result = upsertDiscordCustomCommand(await readJson(req));
        audit(user, "discord.custom_command_upsert", { name: result.command.name });
        return send(res, 200, result);
      }
      if (req.method === "DELETE" && url.pathname === "/api/local/admin/discord/custom-commands") {
        const name = normalizeCommandName(url.searchParams.get("name"));
        statements.deleteDiscordCustomCommand.run(name);
        audit(user, "discord.custom_command_delete", { name });
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/poll") {
        const result = await postDiscordPoll(await readJson(req));
        audit(user, "discord.poll_post", { messageId: result.response?.id });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/rsvp") {
        const result = await postDiscordRsvp(await readJson(req));
        audit(user, "discord.rsvp_post", { messageId: result.response?.id });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/embed") {
        const result = await sendDiscordCleanEmbed(await readJson(req));
        audit(user, "discord.embed_post", { messageId: result.response?.id });
        return send(res, 200, result);
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/settings") return send(res, 200, getSettings());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/settings") {
        const body = await readJson(req, BODY_LIMITS.settings);
        const nextClaimId = String(body.claimId ?? "").trim();
        const nextSyncUrl = String(body.syncUrl ?? defaultSyncUrl).trim();
        if (!/^\d{8,}$/.test(nextClaimId)) return send(res, 400, { error: "Settlement ID must be a numeric BitCraft claim id" });
        if (!validSyncUrl(nextSyncUrl)) return send(res, 400, { error: "BitCraft Sync URL must be a https://bitcraftsync.app link" });
        const refreshSeconds = Number(body.refreshSeconds ?? 30);
        if (!Number.isInteger(refreshSeconds) || refreshSeconds < 15 || refreshSeconds > 300) return send(res, 400, { error: "Display refresh interval must be between 15 and 300 seconds" });
        const serverRefreshSeconds = Number(body.serverRefreshSeconds ?? refreshSeconds);
        if (!Number.isInteger(serverRefreshSeconds) || serverRefreshSeconds < 15 || serverRefreshSeconds > 300) return send(res, 400, { error: "Server collection interval must be between 15 and 300 seconds" });
        const collectorSettings = normalizeCollectorSettings(body.collectorSettings ?? {});
        const defaultPage = String(body.defaultPage ?? "dashboard");
        if (!validPage(defaultPage)) return send(res, 400, { error: "Unknown default page" });
        const defaultRegion = String(body.defaultRegion ?? "").trim();
        if (defaultRegion && !/^\d+$/.test(defaultRegion)) return send(res, 400, { error: "Default region must be numeric or blank" });
        const additionalActiveRegions = parseRegionIds(body.additionalActiveRegions).join(",");
        if (String(body.additionalActiveRegions ?? "").trim() && !additionalActiveRegions) return send(res, 400, { error: "Additional active regions must be numeric IDs separated by commas or spaces" });
        const excludedMemberIds = Array.isArray(body.excludedMemberIds)
          ? [...new Set(body.excludedMemberIds.map((value) => String(value ?? "").trim()).filter((value) => /^\d{8,}$/.test(value)))]
          : [];
        const snapshotRetentionDays = Number(body.snapshotRetentionDays ?? 365);
        if (!Number.isInteger(snapshotRetentionDays) || snapshotRetentionDays < 30 || snapshotRetentionDays > 3650) return send(res, 400, { error: "Retention must be between 30 and 3650 days" });
        const previousVisitorSecurity = visitorSecuritySettings(true);
        const submittedGeoipLicenseKey = typeof body.visitorSecurity?.geoipLicenseKey === "string" ? body.visitorSecurity.geoipLicenseKey.trim() : "";
        const visitorSecurity = {
          fullIpRetentionDays: Math.min(Math.max(Math.floor(toNumber(body.visitorSecurity?.fullIpRetentionDays) || 7), 1), 30),
          statsRetentionDays: Math.min(Math.max(Math.floor(toNumber(body.visitorSecurity?.statsRetentionDays) || 180), 30), 730),
          geoipProvider: ["ipapi", "local", "disabled"].includes(String(body.visitorSecurity?.geoipProvider ?? "ipapi")) ? String(body.visitorSecurity?.geoipProvider ?? "ipapi") : "ipapi",
          geoipCacheDays: Math.min(Math.max(Math.floor(toNumber(body.visitorSecurity?.geoipCacheDays) || 30), 1), 90),
          geoipSourceUrl: String(body.visitorSecurity?.geoipSourceUrl ?? "").trim(),
          geoipAccountId: String(body.visitorSecurity?.geoipAccountId ?? "").trim(),
          geoipLicenseKey: body.visitorSecurity?.geoipClearLicenseKey === true ? "" : submittedGeoipLicenseKey || previousVisitorSecurity.geoipLicenseKey || "",
        };
        if (visitorSecurity.geoipSourceUrl && !/^https?:\/\//i.test(visitorSecurity.geoipSourceUrl)) return send(res, 400, { error: "GeoIP source URL must start with http:// or https://" });
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
        statements.upsertSetting.run("server_refresh_seconds", String(serverRefreshSeconds), updatedAt);
        statements.upsertSetting.run("collector_settings_json", JSON.stringify(collectorSettings), updatedAt);
        statements.upsertSetting.run("default_page", defaultPage, updatedAt);
        statements.upsertSetting.run("default_region", defaultRegion, updatedAt);
        statements.upsertSetting.run("active_region_overrides", additionalActiveRegions, updatedAt);
        statements.upsertSetting.run("excluded_member_ids_json", JSON.stringify(excludedMemberIds), updatedAt);
        statements.upsertSetting.run("snapshot_retention_days", String(snapshotRetentionDays), updatedAt);
        statements.upsertSetting.run("visitor_security_json", JSON.stringify(visitorSecurity), updatedAt);
        statements.upsertSetting.run("toast_json", JSON.stringify(toastSettings), updatedAt);
        statements.upsertSetting.run("discord_json", JSON.stringify(discordSettings), updatedAt);
        if (discordToken) statements.upsertSecret.run("discord_bot_token", discordToken, updatedAt);
        if (body.discord?.clearBotToken === true) statements.deleteSecret.run("discord_bot_token");
        activeRegionsCache = null;
        pollStatus.intervalMs = serverRefreshSeconds * 1000;
        scheduleServerPolling(serverRefreshSeconds * 1000);
        refreshCollectorStatusSettings();
        audit(user, "settings.update", { claimId: nextClaimId, refreshSeconds, serverRefreshSeconds, collectorCount: Object.keys(collectorSettings).length, defaultPage, defaultRegion, additionalActiveRegions, excludedMemberCount: excludedMemberIds.length, snapshotRetentionDays, visitorSecurity: { fullIpRetentionDays: visitorSecurity.fullIpRetentionDays, statsRetentionDays: visitorSecurity.statsRetentionDays, geoipProvider: visitorSecurity.geoipProvider, geoipConfigured: visitorSecurity.geoipProvider === "ipapi" || Boolean(visitorSecurity.geoipSourceUrl) }, discordEnabled: discordSettings.enabled });
        startDiscordGateway();
        void announceDiscordAppUpdateIfNeeded().catch((error) => console.warn(`Discord app update announcement failed: ${error instanceof Error ? error.message : String(error)}`));
        return send(res, 200, getSettings());
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/branding") {
        const body = await readJson(req, BODY_LIMITS.branding);
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
          SELECT admin_users.id, admin_users.username, admin_users.role, admin_users.active, admin_users.created_at, admin_users.last_login_at,
                 admin_users.discord_id, admin_users.discord_username, admin_users.discord_global_name, admin_users.discord_avatar,
                 COUNT(admin_sessions.token_hash) AS sessions
          FROM admin_users LEFT JOIN admin_sessions ON admin_sessions.user_id = admin_users.id AND admin_sessions.expires_at > ?
          GROUP BY admin_users.id ORDER BY admin_users.username
        `).all(new Date().toISOString());
        return send(res, 200, { users: users.map((entry) => ({ ...entry, role: normalizeAdminRole(entry.role), roleLabel: ADMIN_ROLE_LABELS[normalizeAdminRole(entry.role)], avatarUrl: userAvatarUrl(entry) })), roles: ADMIN_ROLE_LABELS });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/user-accounts") {
        return send(res, 200, { accounts: statements.listUserAccounts.all().map(publicAppUser) });
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user-accounts/approval") {
        const body = await readJson(req);
        const userId = Number(body.userId);
        const status = String(body.status ?? "");
        if (!userId || !["pending", "approved", "rejected", "unlinked"].includes(status)) return send(res, 400, { error: "Choose an account and a valid link status" });
        const target = db.prepare("SELECT * FROM user_accounts WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Linked account not found" });
        statements.updateUserCharacterStatus.run(status, userId);
        audit(user, "linked_account.approval", { userId, discordId: target.discord_id, characterName: target.character_name, status });
        return send(res, 200, { accounts: statements.listUserAccounts.all().map(publicAppUser) });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/users") {
        const body = await readJson(req);
        const discordId = String(body.discordId ?? "").trim();
        const displayName = String(body.displayName ?? body.username ?? "").trim();
        const username = displayName || `Discord ${discordId}`;
        const password = String(body.password ?? "");
        const role = normalizeAdminRole(body.role ?? "admin");
        if (role === "owner" && normalizeAdminRole(user.role) !== "owner") return send(res, 403, { error: "Only owners can create owner administrators" });
        if (legacyAdminPasswordAuth && !discordId) {
          if (!validAdminUsername(username)) return send(res, 400, { error: "Username must be 3-32 letters, numbers, underscores or hyphens" });
          if (password.length < 12) return send(res, 400, { error: "Password must be at least 12 characters" });
          try {
            const result = statements.insertAdmin.run(username, await hashPassword(password), role, new Date().toISOString());
            audit(user, "user.create", { id: result.lastInsertRowid, username, role });
            return send(res, 201, { ok: true });
          } catch (error) {
            if (String(error).includes("UNIQUE")) return send(res, 409, { error: "That username is already in use" });
            throw error;
          }
        }
        if (!validDiscordId(discordId)) return send(res, 400, { error: "Enter a valid Discord user ID" });
        if (username.length < 2 || username.length > 80) return send(res, 400, { error: "Display name must be between 2 and 80 characters" });
        try {
          const result = statements.insertDiscordAdmin.run(username, "discord-oauth-admin", role, new Date().toISOString(), discordId, "", username, "");
          audit(user, "user.create", { id: result.lastInsertRowid, username, discordId, role });
          return send(res, 201, { ok: true });
        } catch (error) {
          if (String(error).includes("UNIQUE")) return send(res, 409, { error: "That Discord account is already an administrator" });
          throw error;
        }
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user/password") {
        if (!legacyAdminPasswordAuth) return send(res, 410, { error: "Administrator passwords have been replaced by Discord sign-in" });
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
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user/role") {
        const body = await readJson(req);
        const userId = Number(body.userId);
        const role = normalizeAdminRole(body.role);
        if (!userId) return send(res, 400, { error: "Select an administrator and role" });
        if (userId === user.id && role !== "owner") return send(res, 400, { error: "You cannot remove owner access from your current account" });
        const target = db.prepare("SELECT id, username, role FROM admin_users WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Admin user not found" });
        statements.updateAdminRole.run(role, userId);
        statements.deleteUserSessions.run(userId);
        audit(user, "user.role", { id: target.id, username: target.username, previousRole: normalizeAdminRole(target.role), role });
        return send(res, 200, { ok: true, signedOut: userId === user.id });
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
      if (req.method === "GET" && url.pathname === "/api/local/admin/visitor-security") {
        return send(res, 200, visitorSecurityDashboard(url.searchParams.get("days")));
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
      if (!rateLimit(req, res, "local-snapshot", RATE_LIMITS.expensiveLocal)) return;
      if (isProduction) return send(res, 403, { error: "Browser snapshot collection is disabled in production" });
      return send(res, 200, await enqueueSnapshot(await readJson(req, BODY_LIMITS.snapshot)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/market/history") {
      return send(res, 200, marketHistory(url.searchParams.get("claimId") ?? "", Number(url.searchParams.get("limit") ?? 100), url.searchParams.get("owner") ?? ""));
    }
    if (req.method === "GET" && url.pathname === "/api/local/leaderboard") {
      return send(res, 200, contributionLeaderboard(url.searchParams.get("claimId") ?? ""));
    }
    if (req.method === "POST" && url.pathname === "/api/local/passive-crafts") {
      if (!rateLimit(req, res, "passive-crafts", RATE_LIMITS.expensiveLocal)) return;
      return send(res, 200, await passiveCraftSummaries(await readJson(req, BODY_LIMITS.json)));
    }
    if (req.method === "POST" && url.pathname === "/api/local/player-details") {
      if (!rateLimit(req, res, "player-details", RATE_LIMITS.expensiveLocal)) return;
      return send(res, 200, await playerDetailSummaries(await readJson(req, BODY_LIMITS.json)));
    }
    if (req.method === "POST" && url.pathname === "/api/local/production/crafts") {
      if (!rateLimit(req, res, "production-crafts", RATE_LIMITS.expensiveLocal)) return;
      return send(res, 200, await settlementProductionCrafts(await readJson(req, BODY_LIMITS.json)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/dashboard-data") {
      if (!rateLimit(req, res, "dashboard-data", RATE_LIMITS.expensiveLocal)) return;
      try {
        return send(res, 200, await dashboardData(url.searchParams.get("claimId") ?? ""));
      } catch (error) {
        return send(res, error?.statusCode ?? 500, { error: error instanceof Error ? error.message : "Unable to load dashboard data" });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/history") {
      const include = String(url.searchParams.get("include") ?? "").split(",").map((part) => part.trim()).filter(Boolean);
      const allowed = new Set(["market", "activity", "snapshots", "dashboard"]);
      const sections = include.length ? new Set(include.filter((part) => allowed.has(part))) : null;
      return send(res, 200, localHistory(url.searchParams.get("claimId") ?? "", sections, {
        activityLimit: Number(url.searchParams.get("activityLimit") ?? 2000),
      }));
    }
    if (req.method === "GET" && url.pathname === "/api/local/snapshots") {
      const claimId = url.searchParams.get("claimId") ?? "";
      return send(res, 200, snapshotHistory(claimId, {
        limit: Number(url.searchParams.get("limit") ?? 96),
        daily: url.searchParams.get("daily") === "1",
        days: Number(url.searchParams.get("days") ?? 7),
      }));
    }
    if (req.method === "POST" && url.pathname === "/api/local/market/event/resolve") {
      if (isProduction) {
        const user = requireAdmin(req, res);
        if (!user || !requireAdminMutation(req, res, user)) return;
      }
      return send(res, 200, resolveMarketEvent(await readJson(req, BODY_LIMITS.json)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/activity") {
      const claimId = url.searchParams.get("claimId") ?? "";
      const query = url.searchParams.get("q") ?? "";
      return send(res, 200, query.trim()
        ? activitySearch(claimId, query, Number(url.searchParams.get("limit") ?? 500))
        : activityHistory(claimId, Number(url.searchParams.get("limit") ?? 500)));
    }
    if (!url.pathname.startsWith("/api/") && await serveBuiltFrontend(url, req.method, res)) return;
    send(res, 404, { error: "Not found" });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    send(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.APP_PORT ?? process.env.LOCAL_API_PORT ?? 18430);
const host = process.env.APP_HOST ?? "127.0.0.1";
let serverPollTimer = null;

function scheduleServerPolling(delayMs = 0) {
  if (!serverPollingEnabled) return;
  if (serverPollTimer) clearTimeout(serverPollTimer);
  const intervalMs = serverRefreshIntervalMs();
  pollStatus.intervalMs = intervalMs;
  pollStatus.nextRunAt = new Date(Date.now() + delayMs).toISOString();
  for (const key of Object.keys(pollStatus.collectors)) {
    setCollectorStatus(key, { nextRunAt: pollStatus.nextRunAt });
  }
  serverPollTimer = setTimeout(async () => {
    try {
      await collectServerSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pollStatus.lastAttemptAt = new Date().toISOString();
      pollStatus.lastError = message;
      if (!isTestRuntime) console.warn(`Server snapshot polling failed: ${message}`);
    } finally {
      scheduleServerPolling(serverRefreshIntervalMs());
    }
  }, delayMs);
}

server.listen(port, host, () => {
  console.log(`BitCraft monitor server listening on http://${host}:${port}${serveFrontend ? " with production frontend" : ""}`);
  startDiscordGateway();
  setTimeout(() => {
    void announceDiscordAppUpdateIfNeeded().catch((error) => console.warn(`Discord app update announcement failed: ${error instanceof Error ? error.message : String(error)}`));
  }, 5000);
  if (serverPollingEnabled) {
    console.log(`Server snapshot polling enabled every ${serverRefreshIntervalMs() / 1000} seconds`);
    scheduleServerPolling(0);
  }
  if (scheduledJobsEnabled && !isTestRuntime) {
    console.log("Scheduled jobs enabled; checking every 60 seconds");
    checkScheduledJobs();
    setInterval(checkScheduledJobs, 60 * 1000);
  }
});
