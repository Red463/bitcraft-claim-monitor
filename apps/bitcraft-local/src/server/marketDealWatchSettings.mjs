function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeMarketDealWatchSettings(value = {}) {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const minimum = config.minActiveListings ?? config.minConfirmedSales;
  return {
    maxWatchesPerUser: Math.min(Math.max(Math.floor(toNumber(config.maxWatchesPerUser) || 10), 1), 100),
    thresholdPercent: Math.min(Math.max(toNumber(config.thresholdPercent) || 30, 1), 95),
    minActiveListings: Math.min(Math.max(Math.floor(toNumber(minimum) || 3), 1), 100),
    discordDmEnabled: config.discordDmEnabled !== false,
  };
}
