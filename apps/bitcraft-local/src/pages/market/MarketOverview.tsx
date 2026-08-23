import { Activity, TrendingUp } from "lucide-react";

import { DataTable } from "../../components/main/DataTable";
import { ItemLabel } from "../../components/main/ItemDisplay";
import type { AnyRecord } from "../../main-app-data";
import { formatGoldAmount, formatNumber, timeAgo } from "../../utils/format";
import { marketFreshnessNotice, type MarketItemKey, type MarketRefreshProps } from "./globalMarket";
import { MarketFavorites } from "./MarketFavorites";
import { exactMarketInteger } from "./marketUi";

type Props = MarketRefreshProps & {
  claimId: string;
  regionId: string;
  overviewState: { loading: boolean; error: string; data: AnyRecord | null };
  favorites: MarketItemKey[];
  onOpenItem: (item: AnyRecord) => void;
};

function itemShape(row: AnyRecord) {
  return {
    ...row,
    id: String(row.itemId ?? row.id ?? "0"),
    name: row.itemName ?? row.name,
    itemType: row.itemType === "cargo" ? 1 : row.itemType,
  };
}

export function MarketOverview({
  claimId,
  regionId,
  overviewState: state,
  favorites,
  onOpenItem,
  refreshSequence,
  refreshHeaders,
  trackRefresh,
}: Props) {
  const data = state.data ?? {};
  const deals: AnyRecord[] = Array.isArray(data.topDeals) ? data.topDeals : [];
  const movers: AnyRecord[] = Array.isArray(data.movers) ? data.movers : [];
  const liquid: AnyRecord[] = Array.isArray(data.mostLiquid) ? data.mostLiquid : [];
  const generatedAt = data.generatedAt ? new Date(data.generatedAt) : null;
  const observedSince = data.observedSince ? String(data.observedSince) : null;
  const freshnessNotice = marketFreshnessNotice(data);

  return (
    <section className="global-market-workspace market-overview">
      <div className="market-overview-status">
        <div><strong>{regionId ? `Region ${regionId} market` : "All active regions"}</strong><span>{generatedAt ? `Generation updated ${timeAgo(generatedAt.toISOString())}` : "Waiting for the first live order generation"}</span></div>
        {data.freshness === "fresh" ? <span className="status-pill">Live sources</span> : <span className="status-pill warning">{data.freshness === "stale" ? "Stale data" : "Unavailable"}</span>}
      </div>
      {freshnessNotice ? <div className="info">{freshnessNotice}</div> : null}
      {state.error ? <div className="error">Overview unavailable: {state.error}. The last rendered generation remains visible.</div> : null}
      <MarketFavorites claimId={claimId} regionId={regionId} favorites={favorites} onOpenItem={onOpenItem} refreshSequence={refreshSequence} refreshHeaders={refreshHeaders} trackRefresh={trackRefresh} />
      <div className="market-overview-grid">
        <section className="market-overview-section market-overview-wide">
          <h3><TrendingUp size={16} /> Top deals right now <small>{regionId ? `R${regionId}` : "Active-region routes"}</small></h3>
          <DataTable
            rows={deals.slice(0, 8)}
            columns={[
              ["Item", (deal) => <button className="market-item-link" onClick={() => onOpenItem(itemShape(deal))}><ItemLabel item={itemShape({ ...deal, iconAssetName: deal.itemIconAssetName })} /></button>, (deal) => String(deal.itemName ?? "")],
              ["Buy at", (deal) => <span className="market-price-location"><strong>{formatGoldAmount(deal.buyPrice)}</strong><small>{deal.buyLocation ?? "Unknown"} · R{deal.buyRegionId ?? "?"}</small></span>, (deal) => deal.buyPrice],
              ["Sell at", (deal) => <span className="market-price-location"><strong>{formatGoldAmount(deal.sellPrice)}</strong><small>{deal.sellLocation ?? "Unknown"} · R{deal.sellRegionId ?? "?"}</small></span>, (deal) => deal.sellPrice],
              ["Profit", (deal) => <span className="positive">{formatGoldAmount(deal.profit)}</span>, (deal) => deal.profit],
              ["Qty", (deal) => formatNumber(deal.maxQuantity), (deal) => deal.maxQuantity],
            ]}
            emptyState={state.loading ? "Loading live deals…" : "No profitable current-order routes."}
            scrollLabel="Top global market deals"
          />
        </section>
        <section className="market-overview-section">
          <h3><TrendingUp size={16} /> Biggest movers <small>{observedSince ? `Locally observed since ${new Date(observedSince).toLocaleDateString()}` : "Collecting confirmed sales"}</small></h3>
          <div className="market-ranking-list">{movers.slice(0, 8).map((row) => <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><b>{formatNumber(row.changePercent)}%</b></button>)}</div>
          {!movers.length ? <div className="empty-state compact">Collecting locally confirmed sales. Movers appear once both rolling 24-hour windows contain observations.</div> : null}
        </section>
        <section className="market-overview-section">
          <h3><Activity size={16} /> Current liquidity <small>Open orders</small></h3>
          <div className="market-ranking-list">{liquid.slice(0, 10).map((row) => <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>{formatNumber(exactMarketInteger(row.offeredQuantity) + exactMarketInteger(row.wantedQuantity))} units · {formatGoldAmount(row.currentNotional)} notional</span></button>)}</div>
          {!liquid.length ? <div className="empty-state compact">No current order liquidity is available.</div> : null}
        </section>
      </div>
    </section>
  );
}
