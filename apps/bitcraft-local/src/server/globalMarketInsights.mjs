function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function chunkMarketItemKeys(keys, size = 100) {
  const chunks = [];
  for (let offset = 0; offset < keys.length; offset += size) {
    const chunk = keys.slice(offset, offset + size);
    chunks.push({
      itemIds: chunk.filter((key) => key.itemType === "item").map((key) => Number(key.itemId)),
      cargoIds: chunk.filter((key) => key.itemType === "cargo").map((key) => Number(key.itemId)),
    });
  }
  return chunks;
}

export function marketSnapshotRows(capturedAt, payload, catalog = new Map()) {
  const groups = [
    ["item", payload?.data?.items],
    ["cargo", payload?.data?.cargo],
  ];
  return groups.flatMap(([itemType, values]) => Object.entries(values ?? {}).map(([itemId, raw]) => {
    const key = `${itemType}:${itemId}`;
    const meta = catalog.get(key) ?? {};
    return {
      capturedAt,
      itemType,
      itemId: Number(itemId),
      itemName: String(meta.name ?? raw.itemName ?? "Unknown item"),
      iconAssetName: meta.iconAssetName ?? raw.iconAssetName ?? null,
      vwap24h: finiteNumber(raw.vwap24h),
      vwap7d: finiteNumber(raw.vwap7d),
      volume24h: finiteNumber(raw.volume24h) ?? 0,
      lowestSellPrice: finiteNumber(raw.lowestSellPrice),
      highestBuyPrice: finiteNumber(raw.highestBuyPrice),
    };
  }));
}

export async function collectMarketSnapshots({
  keys = [],
  capturedAt,
  catalog = new Map(),
  fetchBatch,
  batchSize = 100,
}) {
  const snapshots = [];
  const failures = [];
  for (const batch of chunkMarketItemKeys(keys, batchSize)) {
    try {
      const payload = await fetchBatch(batch);
      snapshots.push(...marketSnapshotRows(capturedAt, payload, catalog));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { snapshots, failures };
}

export function selectMarketMovers(currentRows, priorRows, limit = 10) {
  const priorByKey = new Map(priorRows.map((row) => [`${row.itemType}:${row.itemId}`, row]));
  const hasPrior = priorRows.length > 0;
  const movers = currentRows.flatMap((row) => {
    const baselinePrice = finiteNumber(priorByKey.get(`${row.itemType}:${row.itemId}`)?.vwap24h)
      ?? finiteNumber(row.vwap7d);
    const currentPrice = finiteNumber(row.vwap24h);
    if (!baselinePrice || currentPrice == null || toFiniteVolume(row.volume24h) <= 0) return [];
    return [{ ...row, baselinePrice, changePercent: ((currentPrice - baselinePrice) / baselinePrice) * 100 }];
  }).sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, Math.max(0, limit));
  return { baseline: hasPrior ? "prior-24h" : "7d-vwap", movers };
}

export function buildMarketOverview({
  generatedAt = null,
  regionId = "",
  currentRows = [],
  priorRows = [],
  topDeals = [],
  mostTraded = [],
  hubs = [],
  recentActivity = [],
  staleModules = [],
  nowMs = Date.now(),
} = {}) {
  const selectedRegionId = String(regionId ?? "").trim();
  const matchesRegion = (value) => !selectedRegionId || String(value ?? "").trim() === selectedRegionId;
  const dealMatchesRegion = (deal) => !selectedRegionId
    || matchesRegion(deal?.sourceRegionId ?? deal?.source_region_id ?? deal?.buyRegionId ?? deal?.buy_region_id)
    || matchesRegion(deal?.destinationRegionId ?? deal?.destination_region_id ?? deal?.sellRegionId ?? deal?.sell_region_id);
  const rowMatchesRegion = (row) => matchesRegion(row?.regionId ?? row?.region_id);
  const moverResult = selectMarketMovers(currentRows, priorRows, 12);
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const stale = staleModules.length > 0 || !Number.isFinite(generatedAtMs) || nowMs - generatedAtMs > 45 * 60 * 1000;
  return {
    generatedAt,
    stale,
    staleModules,
    moverBaseline: moverResult.baseline,
    topDeals: topDeals.filter(dealMatchesRegion).slice(0, 12),
    movers: moverResult.movers,
    mostTraded: mostTraded.filter(rowMatchesRegion).slice(0, 12),
    hubs: hubs.filter(rowMatchesRegion).slice(0, 12),
    recentActivity: recentActivity.filter(rowMatchesRegion).slice(0, 30),
  };
}

export function snapshotRetentionCutoff(capturedAt, retentionDays = 14) {
  return new Date(Date.parse(capturedAt) - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function toFiniteVolume(value) {
  return finiteNumber(value) ?? 0;
}
