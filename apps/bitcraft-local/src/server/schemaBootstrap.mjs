export const schemaBootstrapSql = `
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
    source_key TEXT,
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
  CREATE TABLE IF NOT EXISTS market_buy_orders_current (
    claim_id TEXT NOT NULL,
    order_key TEXT NOT NULL,
    region_id TEXT NOT NULL,
    region_name TEXT,
    market_claim_id TEXT,
    market_claim_name TEXT,
    buyer_entity_id TEXT,
    buyer_name TEXT,
    item_id TEXT,
    item_type TEXT,
    item_name TEXT NOT NULL,
    tier TEXT,
    rarity TEXT,
    icon_asset_name TEXT,
    quantity REAL,
    unit_price REAL,
    total_value REAL,
    stored_coins REAL,
    listed_at TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    raw_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, order_key)
  );
  CREATE TABLE IF NOT EXISTS market_regional_sale_averages_current (
    claim_id TEXT NOT NULL,
    region_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '0',
    item_name TEXT,
    average_unit_price REAL,
    sales_count REAL,
    units_sold REAL,
    total_value REAL,
    window_days INTEGER NOT NULL DEFAULT 7,
    first_bucket_at TEXT,
    last_bucket_at TEXT,
    raw_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (claim_id, region_id, item_id, item_type)
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
  CREATE TABLE IF NOT EXISTS market_deal_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    discord_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    region_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '0',
    item_name TEXT NOT NULL,
    tier INTEGER,
    rarity TEXT,
    icon_asset_name TEXT,
    threshold_percent REAL NOT NULL DEFAULT 30,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_checked_at TEXT,
    last_alert_at TEXT,
    last_baseline_window_days INTEGER,
    last_baseline_average REAL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, claim_id, region_id, item_id, item_type)
  );
  CREATE TABLE IF NOT EXISTS market_deal_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watch_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    discord_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    region_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '0',
    item_name TEXT NOT NULL,
    tier INTEGER,
    rarity TEXT,
    icon_asset_name TEXT,
    listing_key TEXT NOT NULL,
    market_claim_id TEXT,
    market_claim_name TEXT,
    seller_name TEXT,
    quantity REAL,
    unit_price REAL,
    total_value REAL,
    baseline_window_days INTEGER NOT NULL,
    baseline_average REAL NOT NULL,
    sales_count INTEGER NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL,
    dm_status TEXT NOT NULL DEFAULT 'pending',
    dm_error TEXT,
    created_at TEXT NOT NULL,
    read_at TEXT,
    raw_json TEXT NOT NULL,
    UNIQUE (watch_id, listing_key)
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
  CREATE INDEX IF NOT EXISTS idx_market_buy_orders_region ON market_buy_orders_current (claim_id, region_id, active, unit_price DESC);
  CREATE INDEX IF NOT EXISTS idx_market_buy_orders_item ON market_buy_orders_current (claim_id, region_id, item_id, item_type, active);
  CREATE INDEX IF NOT EXISTS idx_market_regional_sale_avg_item ON market_regional_sale_averages_current (claim_id, region_id, item_id, item_type);
  CREATE INDEX IF NOT EXISTS idx_market_deal_watches_user ON market_deal_watches (user_id, enabled, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_market_deal_watches_scan ON market_deal_watches (claim_id, region_id, enabled, item_id, item_type);
  CREATE INDEX IF NOT EXISTS idx_market_deal_alerts_user ON market_deal_alerts (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_market_deal_alerts_watch ON market_deal_alerts (watch_id, created_at DESC);
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
  CREATE INDEX IF NOT EXISTS idx_snapshots_claim_captured ON snapshots (claim_id, captured_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON snapshots (captured_at);
`;

export function applySchemaBootstrap(db) {
  db.exec(schemaBootstrapSql);
}
