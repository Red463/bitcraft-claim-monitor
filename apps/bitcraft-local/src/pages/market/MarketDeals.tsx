import React from "react";
import { TrendingUp } from "lucide-react";

import { DataTable } from "../../components/main/DataTable";
import { ItemLabel } from "../../components/main/ItemDisplay";
import { MiniStat } from "../../components/main/Stats";
import { useGameDataGeneration } from "../../hooks/useGameDataGeneration";
import type { ActiveRegion } from "../../hooks/useActiveRegions";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { formatGoldAmount, formatNumber } from "../../utils/format";
import {
  bestMarketDealPotential,
  filterMarketDeals,
  marketFreshnessNotice,
  type MarketRefreshProps,
} from "./globalMarket";

function decimalBigInt(value: unknown): bigint {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) ? BigInt(normalized) : 0n;
}

export function MarketDeals({
  claimId,
  sharedRegionId,
  activeRegions,
  refreshSequence,
  refreshHeaders,
  trackRefresh,
}: MarketRefreshProps & {
  claimId: string;
  sharedRegionId: string;
  activeRegions: ActiveRegion[];
}) {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string;
    rows: AnyRecord[];
    updatedAt: string;
    freshness: string;
    ageMs: number | null;
    warnings: string[];
  }>({
    loading: true,
    error: "",
    rows: [],
    updatedAt: "",
    freshness: "unavailable",
    ageMs: null,
    warnings: [],
  });
  const [regions, setRegions] = React.useState<string[]>(sharedRegionId ? [sharedRegionId] : []);
  const [minimumQuantity, setMinimumQuantity] = React.useState("1");
  const [minimumProfit, setMinimumProfit] = React.useState("0");
  const [maximumProfit, setMaximumProfit] = React.useState("");
  const generationSequence = useGameDataGeneration(claimId, ["catalogs", "regional-market"]);

  React.useEffect(() => setRegions(sharedRegionId ? [sharedRegionId] : []), [sharedRegionId]);
  React.useEffect(() => {
    const controller = new AbortController();
    const search = new URLSearchParams({ claimId });
    search.set("regions", regions.join(","));
    setState((current) => ({ ...current, loading: true, error: "" }));
    trackRefresh(
      "global-market-deals",
      fetch(`/api/local/market/deals?${search}`, {
        headers: refreshHeaders,
        signal: controller.signal,
      }),
    )
      .then((response) => response.ok
        ? response.json()
        : Promise.reject(new Error(`deals HTTP ${response.status}`)))
      .then((payload) => setState({
        loading: false,
        error: "",
        rows: Array.isArray(payload.deals) ? payload.deals : [],
        updatedAt: String(payload.generatedAt ?? ""),
        freshness: String(payload.freshness ?? "unavailable"),
        ageMs: Number.isFinite(Number(payload.ageMs)) ? Number(payload.ageMs) : null,
        warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
      }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      });
    return () => controller.abort();
  }, [claimId, generationSequence, refreshSequence, regions]);

  function toggleRegion(regionId: string) {
    setRegions((current) => current.includes(regionId)
      ? current.filter((entry) => entry !== regionId)
      : [...current, regionId]);
  }

  const rows = React.useMemo(() => filterMarketDeals(state.rows, regions)
    .filter((deal) => {
      const percent = toNumber(deal.profitPercent);
      if (decimalBigInt(deal.maxQuantity) < decimalBigInt(minimumQuantity)) return false;
      if (percent < toNumber(minimumProfit)) return false;
      if (maximumProfit && percent > toNumber(maximumProfit)) return false;
      return true;
    })
    .sort((left, right) => {
      const leftProfit = decimalBigInt(left.profit);
      const rightProfit = decimalBigInt(right.profit);
      return leftProfit < rightProfit ? 1 : leftProfit > rightProfit ? -1 : 0;
    }), [maximumProfit, minimumProfit, minimumQuantity, regions, state.rows]);
  const topProfit = rows.reduce((best, row) => {
    const profit = decimalBigInt(row.profit);
    return profit > best ? profit : best;
  }, 0n);
  const bestRoutePotential = bestMarketDealPotential(rows);
  const freshnessNotice = marketFreshnessNotice(state);

  return (
    <section className="global-market-workspace market-deals">
      <div className="market-specialized-filters">
        <label className="field"><span>Minimum trade quantity</span><input type="number" min="1" value={minimumQuantity} onChange={(event) => setMinimumQuantity(event.target.value)} /></label>
        <label className="field"><span>Minimum profit %</span><input type="number" value={minimumProfit} onChange={(event) => setMinimumProfit(event.target.value)} /></label>
        <label className="field"><span>Maximum profit %</span><input type="number" placeholder="No maximum" value={maximumProfit} onChange={(event) => setMaximumProfit(event.target.value)} /></label>
      </div>
      <div className="market-region-pills" aria-label="Deal regions">
        <button className={!regions.length ? "active" : ""} onClick={() => setRegions([])}>All active regions</button>
        {activeRegions.map((region) => <button key={region.regionId} className={regions.includes(region.regionId) ? "active" : ""} onClick={() => toggleRegion(region.regionId)}>R{region.regionId} {region.regionName ?? ""}</button>)}
      </div>
      {freshnessNotice ? <div className="info">{freshnessNotice}</div> : null}
      {state.error ? <div className="error">Deals unavailable: {state.error}. The last rendered live generation remains visible.</div> : null}
      <div className="metric-grid market-deal-summary"><MiniStat icon={<TrendingUp />} label="Matching Deals" value={formatNumber(rows.length)} /><MiniStat icon={<TrendingUp />} label="Best Unit Profit" value={formatGoldAmount(topProfit)} /><MiniStat icon={<TrendingUp />} label="Best Route Potential" value={formatGoldAmount(bestRoutePotential)} /></div>
      <DataTable
        rows={rows}
        rowLimit={250}
        columns={[
          ["Item", (deal) => <ItemLabel item={{ ...deal, name: deal.itemName, iconAssetName: deal.itemIconAssetName }} />, (deal) => String(deal.itemName ?? "")],
          ["Buy at", (deal) => <span className="market-price-location"><strong>{formatGoldAmount(deal.buyPrice)}</strong><small>{deal.buyLocation ?? "Unknown"} · R{deal.buyRegionId ?? "?"}</small></span>, (deal) => deal.buyPrice],
          ["Sell at", (deal) => <span className="market-price-location"><strong>{formatGoldAmount(deal.sellPrice)}</strong><small>{deal.sellLocation ?? "Unknown"} · R{deal.sellRegionId ?? "?"}</small></span>, (deal) => deal.sellPrice],
          ["Available", (deal) => formatNumber(deal.buyQuantity), (deal) => deal.buyQuantity],
          ["Wanted", (deal) => formatNumber(deal.sellQuantity), (deal) => deal.sellQuantity],
          ["Max trade", (deal) => formatNumber(deal.maxQuantity), (deal) => deal.maxQuantity],
          ["Distance", (deal) => deal.distance == null ? "—" : `${formatNumber(deal.distance)} tiles`, (deal) => deal.distance ?? Number.MAX_SAFE_INTEGER],
          ["Unit profit", (deal) => <span className="positive">{formatGoldAmount(deal.profit)}</span>, (deal) => deal.profit],
          ["Gain", (deal) => <span className="positive">{formatNumber(deal.profitPercent)}%</span>, (deal) => toNumber(deal.profitPercent)],
        ]}
        emptyState={state.loading ? "Loading current arbitrage routes…" : "No deals match these route filters."}
        emptyKind="no-match"
        scrollLabel="Global market deals table"
      />
      {state.updatedAt ? <p className="legend">{state.freshness === "fresh" ? "Current" : "Last-good"} order generation received {new Date(state.updatedAt).toLocaleTimeString()}. Same-region distance uses live marketplace coordinates; cross-region routes remain unmeasured.</p> : null}
    </section>
  );
}
