function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export const domainCollectorDefaults = {
  claim: { label: "Claim", intervalSeconds: 30 },
  members: { label: "Members", intervalSeconds: 30 },
  players: { label: "Player details", intervalSeconds: 60 },
  professions: { label: "Professions", intervalSeconds: 30 },
  production: { label: "Production", intervalSeconds: 30 },
  inventory: { label: "Inventory and storage", intervalSeconds: 60 },
  construction: { label: "Construction", intervalSeconds: 60 },
  research: { label: "Research", intervalSeconds: 600 },
  market: { label: "Market", intervalSeconds: 60 },
  buyOrders: { label: "Regional buy orders", intervalSeconds: 1800 },
  region: { label: "Region", intervalSeconds: 300 },
  mapCatalog: { label: "Map/catalog", intervalSeconds: 600 },
  snapshotHistory: { label: "Snapshot and history", intervalSeconds: 900 },
  storageActivity: { label: "Storage activity", intervalSeconds: 60 },
  marketTrades: { label: "Member market trades", intervalSeconds: 60 },
};

export const domainPayloadKeys = ["claim", "members", "citizens", "buildings", "construction", "research", "market", "regionalBuyOrders", "crafts", "players", "playerDetailDiagnostics", "contributions", "region", "regionStatus", "tradeVolume", "inventories", "recruitment", "layout", "skills"];
export const collectorPrimaryPayloadDomain = {
  claim: "claim",
  members: "members",
  players: "players",
  professions: "citizens",
  production: "crafts",
  inventory: "inventories",
  construction: "construction",
  research: "research",
  market: "market",
  buyOrders: "regionalBuyOrders",
  region: "region",
  mapCatalog: "skills",
};

export const payloadDomainCollector = {
  claim: "claim",
  members: "members",
  players: "players",
  playerDetailDiagnostics: "players",
  citizens: "professions",
  skills: "mapCatalog",
  crafts: "production",
  contributions: "production",
  inventories: "inventory",
  recruitment: "inventory",
  layout: "inventory",
  buildings: "construction",
  construction: "construction",
  research: "research",
  market: "market",
  tradeVolume: "market",
  regionalBuyOrders: "buyOrders",
  region: "region",
  regionStatus: "region",
};

export const collectorCurrentTables = {
  production: ["production_contributions"],
  market: ["market_listings", "market_trades"],
  buyOrders: ["market_buy_orders_current", "market_regional_sale_averages_current"],
  mapCatalog: ["domain_payload_current"],
  snapshotHistory: ["snapshots"],
  storageActivity: ["activity_events"],
  marketTrades: ["market_trades"],
};

export function normalizeCollectorSettings(value = {}) {
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

