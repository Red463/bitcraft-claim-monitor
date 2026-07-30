function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export const domainCollectorDefaults = {
  claim: { label: "Current settlement", intervalSeconds: 30 },
  members: { label: "Members", intervalSeconds: 30 },
  players: { label: "Player details", intervalSeconds: 60 },
  professions: { label: "Professions", intervalSeconds: 30 },
  production: { label: "Production", intervalSeconds: 30 },
  inventory: { label: "Inventory and storage", intervalSeconds: 60 },
  market: { label: "Market", intervalSeconds: 60 },
  mapCatalog: { label: "Map/catalog", intervalSeconds: 600 },
  productionContributions: { label: "Production contribution sync", intervalSeconds: 300 },
  marketTrades: { label: "Member market trades", intervalSeconds: 60 },
};

export const domainPayloadKeys = ["claim", "members", "citizens", "buildings", "market", "crafts", "players", "playerDetailDiagnostics", "contributions", "inventories", "skills"];
export const collectorPrimaryPayloadDomain = {
  claim: "claim",
  members: "members",
  players: "players",
  professions: "citizens",
  production: "crafts",
  inventory: "inventories",
  market: "market",
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
  buildings: "claim",
  market: "market",
};

export function payloadDomainsForCollectors(collectorKeys = []) {
  const selected = new Set(Array.isArray(collectorKeys) ? collectorKeys.map(String) : []);
  return domainPayloadKeys.filter((domain) => selected.has(payloadDomainCollector[domain]));
}

export const collectorCurrentTables = {
  production: ["production_contributions"],
  market: ["market_trades"],
  mapCatalog: ["domain_payload_current"],
  productionContributions: ["production_jobs", "production_contributions"],
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

