import React from "react";
import { Activity, ArrowRight, Clock3, Star, Store, TrendingUp } from "lucide-react";

import { DataTable } from "../../components/main/DataTable";
import { ItemLabel } from "../../components/main/ItemDisplay";
import { useGameDataGeneration } from "../../hooks/useGameDataGeneration";
import type { AnyRecord } from "../../main-app-data";
import { formatGoldAmount, formatNumber, timeAgo } from "../../utils/format";
import type { MarketItemKey, MarketRefreshProps } from "./globalMarket";
import { marketFreshnessNotice } from "./globalMarket";

type Props = MarketRefreshProps & {
  claimId: string;
  regionId: string;
  favorites: MarketItemKey[];
  onOpenItem: (item: AnyRecord) => void;
};

function decimalBigInt(value: unknown): bigint {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) ? BigInt(normalized) : 0n;
}

function itemShape(row: AnyRecord) {
  return {
    ...row,
    id: String(row.itemId ?? row.id ?? "0"),
    name: row.itemName ?? row.name,
    itemType: row.itemType === "cargo" ? 1 : row.itemType,
  };
}

function bestPrice(rows: AnyRecord[], direction: "low" | "high"): string | null {
  return rows.reduce<string | null>((best, row) => {
    const price = String(row.price ?? row.priceThreshold ?? row.unitPrice ?? "0");
    if (best == null) return price;
    if (direction === "low") return decimalBigInt(price) < decimalBigInt(best) ? price : best;
    return decimalBigInt(price) > decimalBigInt(best) ? price : best;
  }, null);
}

export function MarketOverview({
  claimId,
  regionId,
  favorites,
  onOpenItem,
  refreshSequence,
  refreshHeaders,
  trackRefresh,
}: Props) {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string;
    data: AnyRecord | null;
  }>({ loading: true, error: "", data: null });
  const [favoriteRows, setFavoriteRows] = React.useState<AnyRecord[]>([]);
  const generationSequence = useGameDataGeneration(claimId, ["catalogs", "regional-market"]);

  React.useEffect(() => {
    const controller = new AbortController();
    const search = new URLSearchParams({
      claimId,
      regionId: regionId || "all",
    });
    setState((current) => ({ ...current, loading: true, error: "" }));
    const refresh = fetch(`/api/local/market/overview?${search}`, {
      headers: refreshHeaders,
      signal: controller.signal,
    })
      .then((response) => response.ok
        ? response.json()
        : Promise.reject(new Error(`overview HTTP ${response.status}`)));
    trackRefresh("global-market-overview", refresh)
      .then((payload) => setState({ loading: false, error: "", data: payload }))
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
  }, [claimId, generationSequence, refreshSequence, regionId]);

  React.useEffect(() => {
    const controller = new AbortController();
    trackRefresh("global-market-favorites", Promise.all(favorites.slice(0, 20).map(async (favorite) => {
      const search = new URLSearchParams({
        claimId,
        regionId: regionId || "all",
        itemType: favorite.itemType,
        itemId: favorite.itemId,
      });
      const response = await fetch(`/api/local/market/order-book?${search}`, {
        headers: refreshHeaders,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`favorite order book HTTP ${response.status}`);
      const detail = await response.json();
      const sells = Array.isArray(detail.sellOrders) ? detail.sellOrders : [];
      const buys = Array.isArray(detail.buyOrders) ? detail.buyOrders : [];
      return {
        ...favorite,
        ...(detail.item ?? {}),
        itemName: detail.item?.name ?? `Item ${favorite.itemId}`,
        bestSell: bestPrice(sells, "low"),
        bestBuy: bestPrice(buys, "high"),
        currentQuantity: [...sells, ...buys]
          .reduce((total, order) => total + decimalBigInt(order.quantity), 0n)
          .toString(),
      };
    })))
      .then((rows) => {
        if (!controller.signal.aborted) setFavoriteRows(rows);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [claimId, favorites, generationSequence, refreshSequence, regionId]);

  const data = state.data ?? {};
  const deals: AnyRecord[] = Array.isArray(data.topDeals) ? data.topDeals : [];
  const movers: AnyRecord[] = Array.isArray(data.movers) ? data.movers : [];
  const liquid: AnyRecord[] = Array.isArray(data.mostLiquid) ? data.mostLiquid : [];
  const hubs: AnyRecord[] = Array.isArray(data.hubs) ? data.hubs : [];
  const activityRows: AnyRecord[] = Array.isArray(data.recentActivity)
    ? data.recentActivity.slice(0, 12)
    : [];
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
      <section className="market-overview-section">
        <h3><Star size={16} /> Favorites <small>Stored only in this browser</small></h3>
        {favoriteRows.length ? <div className="market-favorite-strip">{favoriteRows.map((row) => {
          const spread = row.bestSell != null && row.bestBuy != null
            ? (decimalBigInt(row.bestSell) - decimalBigInt(row.bestBuy)).toString()
            : null;
          return <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>Sell <b>{row.bestSell == null ? "—" : formatGoldAmount(row.bestSell)}</b></span><span>Buy <b>{row.bestBuy == null ? "—" : formatGoldAmount(row.bestBuy)}</b></span><span>Spread <b>{spread == null ? "—" : formatGoldAmount(spread)}</b></span><small>{formatNumber(row.currentQuantity)} units in current orders</small></button>;
        })}</div> : <div className="empty-state compact"><Star size={22} /><span>Star items in Browse and their current Relay order books will appear here.</span></div>}
      </section>
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
          <div className="market-ranking-list">{liquid.slice(0, 10).map((row) => <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>{formatNumber(decimalBigInt(row.offeredQuantity) + decimalBigInt(row.wantedQuantity))} units · {formatGoldAmount(row.currentNotional)} notional</span></button>)}</div>
          {!liquid.length ? <div className="empty-state compact">No current order liquidity is available.</div> : null}
        </section>
        <section className="market-overview-section">
          <h3><Store size={16} /> Active order hubs <small>Current generation</small></h3>
          <div className="market-ranking-list">{hubs.slice(0, 10).map((hub) => <div className="market-ranking-entry" key={String(hub.claimId)}><span><b>{hub.claimName ?? "Unknown settlement"}</b><small>{hub.regionName ?? `R${hub.regionId ?? "?"}`}</small></span><span>{formatNumber(hub.orderCount)} orders · {formatNumber(hub.sellerCount)} sellers · {formatNumber(hub.buyerCount)} buyers</span></div>)}</div>
          {!hubs.length ? <div className="empty-state compact">No active order hubs are available.</div> : null}
        </section>
        <section className="market-overview-section">
          <h3><Clock3 size={16} /> Recent open orders <small>Current, not completed trades</small></h3>
          <div className="market-activity-list">{activityRows.map((row) => <button key={String(row.id)} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>{row.side === "buy" ? "Wanted" : "Offered"}: {formatNumber(row.quantity)} @ {formatGoldAmount(row.unitPrice)}</span><small>{row.claimName ?? "Unknown market"} · {timeAgo(row.createdAt)}</small><ArrowRight size={13} /></button>)}</div>
          {!activityRows.length ? <div className="empty-state compact">No current orders are available.</div> : null}
        </section>
      </div>
    </section>
  );
}
