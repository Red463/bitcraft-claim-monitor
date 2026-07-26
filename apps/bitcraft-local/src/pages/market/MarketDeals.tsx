import React from "react";
import { MapPin, Route, TrendingUp } from "lucide-react";

import { DataTable } from "../../components/main/DataTable";
import { ItemLabel } from "../../components/main/ItemDisplay";
import { MiniStat } from "../../components/main/Stats";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { formatCompactNumber, formatGoldAmount, formatNumber } from "../../utils/format";
import type { ActiveRegion } from "../../hooks/useActiveRegions";
import type { MapFocus } from "../map/mapUtils";
import { filterMarketDeals, type MarketRefreshProps } from "./globalMarket";

const API = "/api/bitjita";

export function MarketDeals({ sharedRegionId, activeRegions, onShowMap, refreshSequence, refreshHeaders, trackRefresh }: MarketRefreshProps & { sharedRegionId: string; activeRegions: ActiveRegion[]; onShowMap: (focus: NonNullable<MapFocus>, regionId?: string) => void }) {
  const [state, setState] = React.useState<{ loading: boolean; error: string; rows: AnyRecord[]; updatedAt: string }>({ loading: true, error: "", rows: [], updatedAt: "" });
  const [regions, setRegions] = React.useState<string[]>(sharedRegionId ? [sharedRegionId] : []);
  const [minimumQuantity, setMinimumQuantity] = React.useState("1");
  const [minimumProfit, setMinimumProfit] = React.useState("0");
  const [maximumProfit, setMaximumProfit] = React.useState("");
  const [maximumDistance, setMaximumDistance] = React.useState("");

  React.useEffect(() => setRegions(sharedRegionId ? [sharedRegionId] : []), [sharedRegionId]);
  React.useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    trackRefresh("global-market-deals", fetch(`${API}/market/deals`, { headers: refreshHeaders, signal: controller.signal }))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`deals HTTP ${response.status}`)))
      .then((payload) => setState({ loading: false, error: "", rows: Array.isArray(payload.arbitrage) ? payload.arbitrage : [], updatedAt: new Date().toISOString() }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
      });
    return () => controller.abort();
  }, [refreshSequence]);

  function toggleRegion(regionId: string) {
    setRegions((current) => current.includes(regionId) ? current.filter((entry) => entry !== regionId) : [...current, regionId]);
  }

  const rows = React.useMemo(() => filterMarketDeals(state.rows, regions).filter((deal) => {
    const quantity = toNumber(deal.maxQuantity ?? deal.maxTrade ?? deal.tradeQuantity ?? Math.min(toNumber(deal.buyQuantity), toNumber(deal.sellQuantity)));
    const percent = toNumber(deal.profitPercent ?? deal.gainPercent);
    const distance = toNumber(deal.distance);
    if (quantity < toNumber(minimumQuantity)) return false;
    if (percent < toNumber(minimumProfit)) return false;
    if (maximumProfit && percent > toNumber(maximumProfit)) return false;
    if (maximumDistance && distance > toNumber(maximumDistance)) return false;
    return true;
  }).sort(
    (a, b) => toNumber(b.profit ?? b.profitPerUnit) - toNumber(a.profit ?? a.profitPerUnit),
  ), [maximumDistance, maximumProfit, minimumProfit, minimumQuantity, regions, state.rows]);
  const topProfit = rows.reduce((best, row) => Math.max(best, toNumber(row.profit ?? row.profitPerUnit)), 0);
  const totalPotential = rows.reduce((total, row) => total + toNumber(row.profit ?? row.profitPerUnit) * toNumber(row.maxQuantity ?? row.maxTrade ?? row.tradeQuantity), 0);

  return (
    <section className="global-market-workspace market-deals">
      <div className="market-specialized-filters">
        <label className="field"><span>Minimum trade quantity</span><input type="number" min="1" value={minimumQuantity} onChange={(event) => setMinimumQuantity(event.target.value)} /></label>
        <label className="field"><span>Minimum profit %</span><input type="number" value={minimumProfit} onChange={(event) => setMinimumProfit(event.target.value)} /></label>
        <label className="field"><span>Maximum profit %</span><input type="number" placeholder="No maximum" value={maximumProfit} onChange={(event) => setMaximumProfit(event.target.value)} /></label>
        <label className="field"><span>Maximum distance</span><input type="number" placeholder="Any distance" value={maximumDistance} onChange={(event) => setMaximumDistance(event.target.value)} /></label>
      </div>
      <div className="market-region-pills" aria-label="Deal regions">
        <button className={!regions.length ? "active" : ""} onClick={() => setRegions([])}>All active regions</button>
        {activeRegions.map((region) => <button key={region.regionId} className={regions.includes(region.regionId) ? "active" : ""} onClick={() => toggleRegion(region.regionId)}>R{region.regionId} {region.regionName ?? ""}</button>)}
      </div>
      {state.error ? <div className="error">Deals unavailable: {state.error}</div> : null}
      <div className="metric-grid market-deal-summary"><MiniStat icon={<TrendingUp />} label="Matching Deals" value={formatNumber(rows.length)} /><MiniStat icon={<TrendingUp />} label="Best Unit Profit" value={formatGoldAmount(topProfit)} /><MiniStat icon={<TrendingUp />} label="Visible Potential" value={formatGoldAmount(totalPotential)} /></div>
      <DataTable
        rows={rows}
        rowLimit={250}
        columns={[
          ["Item", (deal) => <ItemLabel item={{ ...deal, name: deal.itemName, iconAssetName: deal.itemIconAssetName }} />, (deal) => String(deal.itemName ?? "")],
          ["Buy at", (deal) => <span className="market-price-location"><strong>{formatGoldAmount(deal.buyPrice)}</strong><small>{deal.buyLocation ?? "Unknown"} · R{deal.buyRegionId ?? "?"}</small></span>, (deal) => toNumber(deal.buyPrice)],
          ["Sell at", (deal) => <span className="market-price-location"><strong>{formatGoldAmount(deal.sellPrice)}</strong><small>{deal.sellLocation ?? "Unknown"} · R{deal.sellRegionId ?? "?"}</small></span>, (deal) => toNumber(deal.sellPrice)],
          ["Available", (deal) => formatNumber(deal.buyQuantity), (deal) => toNumber(deal.buyQuantity)],
          ["Wanted", (deal) => formatNumber(deal.sellQuantity), (deal) => toNumber(deal.sellQuantity)],
          ["Max trade", (deal) => formatNumber(deal.maxQuantity ?? deal.maxTrade ?? deal.tradeQuantity ?? Math.min(toNumber(deal.buyQuantity), toNumber(deal.sellQuantity))), (deal) => toNumber(deal.maxQuantity ?? deal.maxTrade ?? deal.tradeQuantity ?? Math.min(toNumber(deal.buyQuantity), toNumber(deal.sellQuantity)))],
          ["Unit profit", (deal) => {
            const profit = toNumber(deal.profit ?? deal.profitPerUnit ?? toNumber(deal.sellPrice) - toNumber(deal.buyPrice));
            return <span className="positive">{formatGoldAmount(profit)}</span>;
          }, (deal) => toNumber(deal.profit ?? deal.profitPerUnit ?? toNumber(deal.sellPrice) - toNumber(deal.buyPrice))],
          ["Gain", (deal) => {
            const profit = toNumber(deal.profit ?? deal.profitPerUnit ?? toNumber(deal.sellPrice) - toNumber(deal.buyPrice));
            const percent = toNumber(deal.profitPercent ?? deal.gainPercent ?? (toNumber(deal.buyPrice) ? (profit / toNumber(deal.buyPrice)) * 100 : 0));
            return <span className="positive">{formatNumber(percent)}%</span>;
          }, (deal) => {
            const profit = toNumber(deal.profit ?? deal.profitPerUnit ?? toNumber(deal.sellPrice) - toNumber(deal.buyPrice));
            const percent = toNumber(deal.profitPercent ?? deal.gainPercent ?? (toNumber(deal.buyPrice) ? (profit / toNumber(deal.buyPrice)) * 100 : 0));
            return percent;
          }],
          ["Distance", (deal) => formatCompactNumber(deal.distance), (deal) => toNumber(deal.distance)],
          ["Map", (deal) => <div className="market-map-actions">{toNumber(deal.buyLocationX) || toNumber(deal.buyLocationZ) ? <button className="icon-button" title="Show buy location" onClick={() => onShowMap({ name: String(deal.buyLocation ?? "Buy market"), locationX: toNumber(deal.buyLocationX), locationZ: toNumber(deal.buyLocationZ) }, String(deal.buyRegionId ?? ""))}><MapPin size={14} /></button> : null}{toNumber(deal.sellLocationX) || toNumber(deal.sellLocationZ) ? <button className="icon-button" title="Show sell location" onClick={() => onShowMap({ name: String(deal.sellLocation ?? "Sell market"), locationX: toNumber(deal.sellLocationX), locationZ: toNumber(deal.sellLocationZ) }, String(deal.sellRegionId ?? ""))}><Route size={14} /></button> : null}</div>, undefined, false],
        ]}
        emptyState={state.loading ? "Loading current arbitrage routes…" : "No deals match these route filters."}
        emptyKind="no-match"
        scrollLabel="Global market deals table"
      />
      {state.updatedAt ? <p className="legend">Deal data loaded {new Date(state.updatedAt).toLocaleTimeString()}.</p> : null}
    </section>
  );
}
