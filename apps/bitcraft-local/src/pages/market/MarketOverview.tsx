import React from "react";
import { Activity, ArrowRight, Clock3, MapPin, Star, Store, TrendingUp } from "lucide-react";

import { ItemLabel } from "../../components/main/ItemDisplay";
import { MiniStat } from "../../components/main/Stats";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { formatCompactNumber, formatGoldAmount, formatNumber, timeAgo } from "../../utils/format";
import type { MapFocus } from "../map/mapUtils";
import type { MarketItemKey, MarketRefreshProps } from "./globalMarket";

const API = "/api/bitjita";
const LOCAL_API = "/api/local";

type Props = MarketRefreshProps & {
  regionId: string;
  favorites: MarketItemKey[];
  onOpenItem: (item: AnyRecord) => void;
  onShowMap: (focus: NonNullable<MapFocus>, regionId?: string) => void;
};

function itemShape(row: AnyRecord) {
  return { ...row, id: row.itemId ?? row.id, name: row.itemName ?? row.name, itemType: row.itemType === "cargo" ? 1 : row.itemType };
}

export function MarketOverview({ regionId, favorites, onOpenItem, onShowMap, refreshSequence, refreshHeaders, trackRefresh }: Props) {
  const [state, setState] = React.useState<{ loading: boolean; error: string; data: AnyRecord | null }>({ loading: true, error: "", data: null });
  const [favoriteRows, setFavoriteRows] = React.useState<AnyRecord[]>([]);

  React.useEffect(() => {
    const controller = new AbortController();
    const search = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
    setState((current) => ({ ...current, loading: true, error: "" }));
    trackRefresh("global-market-overview", fetch(`${LOCAL_API}/market/overview${search}`, { headers: refreshHeaders, signal: controller.signal }))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`overview HTTP ${response.status}`)))
      .then((payload) => setState({ loading: false, error: "", data: payload }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
      });
    return () => controller.abort();
  }, [refreshSequence, regionId]);

  React.useEffect(() => {
    const controller = new AbortController();
    trackRefresh("global-market-favorites", Promise.all(favorites.slice(0, 20).map(async (favorite) => {
      const detailType = favorite.itemType === "cargo" ? "cargo" : "item";
      const historyType = favorite.itemType === "cargo" ? "cargo" : "items";
      const regionParam = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
      const historyRegion = regionId ? `&regionId=${encodeURIComponent(regionId)}` : "";
      const [detailResponse, historyResponse] = await Promise.all([
        fetch(`${API}/market/${detailType}/${favorite.itemId}${regionParam}`, { headers: refreshHeaders, signal: controller.signal }),
        fetch(`${API}/market/${historyType}/${favorite.itemId}/price-history?bucket=1%20day&limit=7${historyRegion}`, { headers: refreshHeaders, signal: controller.signal }),
      ]);
      if (!detailResponse.ok) return null;
      const detail = await detailResponse.json();
      const history = historyResponse.ok ? await historyResponse.json() : {};
      const sells = Array.isArray(detail.sellOrders) ? detail.sellOrders : [];
      const buys = Array.isArray(detail.buyOrders) ? detail.buyOrders : [];
      return {
        ...favorite,
        ...(detail.item ?? {}),
        itemName: detail.item?.name ?? detail.item?.itemName ?? `Item ${favorite.itemId}`,
        bestSell: sells.length ? Math.min(...sells.map((order: AnyRecord) => toNumber(order.price ?? order.unitPrice))) : null,
        bestBuy: buys.length ? Math.max(...buys.map((order: AnyRecord) => toNumber(order.priceThreshold ?? order.price ?? order.unitPrice))) : null,
        volume24h: toNumber(history.priceStats?.soldVolume24h) + toNumber(history.priceStats?.boughtVolume24h),
        recentTrades: history.recentTrades ?? [],
      };
    }))).then((rows) => setFavoriteRows(rows.filter(Boolean) as AnyRecord[])).catch(() => {
      if (!controller.signal.aborted) setFavoriteRows([]);
    });
    return () => controller.abort();
  }, [favorites, refreshSequence, regionId]);

  const data = state.data ?? {};
  const deals: AnyRecord[] = Array.isArray(data.topDeals) ? data.topDeals : [];
  const movers: AnyRecord[] = Array.isArray(data.movers) ? data.movers : [];
  const traded: AnyRecord[] = Array.isArray(data.mostTraded) ? data.mostTraded : [];
  const hubs: AnyRecord[] = Array.isArray(data.hubs) ? data.hubs : [];
  const recent: AnyRecord[] = Array.isArray(data.recentActivity) ? data.recentActivity : [];
  const favoriteRecent = favoriteRows.flatMap((row) => (row.recentTrades ?? []).slice(0, 2).map((trade: AnyRecord) => ({ ...trade, itemId: row.itemId, itemType: row.itemType, itemName: row.itemName, iconAssetName: row.iconAssetName })));
  const activityRows = [...recent, ...favoriteRecent].sort((a, b) => String(b.createdAt ?? b.timestamp ?? "").localeCompare(String(a.createdAt ?? a.timestamp ?? ""))).slice(0, 12);
  const generatedAt = data.generatedAt ? new Date(data.generatedAt) : null;

  return (
    <section className="global-market-workspace market-overview">
      <div className="market-overview-status">
        <div><strong>{regionId ? `Region ${regionId} market` : "All active regions"}</strong><span>{generatedAt ? `Updated ${timeAgo(generatedAt.toISOString())}${Array.isArray(data.staleModules) && data.staleModules.length ? ` · cached: ${data.staleModules.join(", ")}` : ""}` : "Waiting for the first aggregate"}</span></div>
        {data.stale ? <span className="status-pill warning">Stale data</span> : <span className="status-pill">Live sources</span>}
      </div>
      {state.error ? <div className="error">Overview aggregates unavailable: {state.error}. Live Browse, Deals, Buy Orders, Deal Watch and Stalls remain usable.</div> : null}
      <section className="market-overview-section">
        <h3><Star size={16} /> Favorites <small>Stored only in this browser</small></h3>
        {favoriteRows.length ? <div className="market-favorite-strip">{favoriteRows.map((row) => {
          const spread = row.bestSell != null && row.bestBuy != null ? row.bestSell - row.bestBuy : null;
          return <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>Sell <b>{row.bestSell == null ? "—" : formatGoldAmount(row.bestSell)}</b></span><span>Buy <b>{row.bestBuy == null ? "—" : formatGoldAmount(row.bestBuy)}</b></span><span>Spread <b>{spread == null ? "—" : formatGoldAmount(spread)}</b></span><small>{formatNumber(row.volume24h)} volume</small></button>;
        })}</div> : <div className="empty-state compact"><Star size={22} /><span>Star items in Browse and their live prices will appear here without requiring an account.</span></div>}
      </section>
      <div className="market-overview-grid">
        <section className="market-overview-section market-overview-wide">
          <h3><TrendingUp size={16} /> Top deals right now <small>{regionId ? `R${regionId}` : "Global routes"}</small></h3>
          {deals.length ? <div className="table-wrap" tabIndex={0} aria-label="Top global market deals"><table><thead><tr><th>Item</th><th>Buy at</th><th>Sell at</th><th>Profit</th><th>Qty</th><th>Distance</th><th>Map</th></tr></thead><tbody>{deals.slice(0, 8).map((deal) => <tr key={String(deal.id ?? `${deal.itemType}:${deal.itemId}:${deal.buyLocationId}`)}><td><button className="market-item-link" onClick={() => onOpenItem(itemShape(deal))}><ItemLabel item={itemShape({ ...deal, iconAssetName: deal.itemIconAssetName })} /></button></td><td><span className="market-price-location"><strong>{formatGoldAmount(deal.buyPrice)}</strong><small>{deal.buyLocation ?? "Unknown"}</small></span></td><td><span className="market-price-location"><strong>{formatGoldAmount(deal.sellPrice)}</strong><small>{deal.sellLocation ?? "Unknown"}</small></span></td><td className="positive">{formatGoldAmount(deal.profit ?? deal.profitPerUnit)}</td><td>{formatNumber(deal.maxQuantity ?? deal.maxTrade ?? deal.tradeQuantity)}</td><td>{formatCompactNumber(deal.distance)}</td><td><div className="market-map-actions"><button className="icon-button" title="Show buy location" onClick={() => onShowMap({ name: String(deal.buyLocation), locationX: toNumber(deal.buyLocationX), locationZ: toNumber(deal.buyLocationZ) }, String(deal.buyRegionId ?? ""))}><MapPin size={13} /></button><button className="icon-button" title="Show sell location" onClick={() => onShowMap({ name: String(deal.sellLocation), locationX: toNumber(deal.sellLocationX), locationZ: toNumber(deal.sellLocationZ) }, String(deal.sellRegionId ?? ""))}><MapPin size={13} /></button></div></td></tr>)}</tbody></table></div> : <div className="empty-state compact">{state.loading ? "Loading deals…" : "No qualifying deals."}</div>}
        </section>
        <section className="market-overview-section">
          <h3><TrendingUp size={16} /> Biggest movers <small>Global · {data.moverBaseline === "prior-24h" ? "24h vs prior 24h" : "24h vs 7d warm-up"}</small></h3>
          <div className="market-ranking-list">{movers.slice(0, 8).map((row) => <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><b className={toNumber(row.changePercent) >= 0 ? "positive" : "negative"}>{toNumber(row.changePercent) >= 0 ? "+" : ""}{formatNumber(row.changePercent)}%</b></button>)}</div>
          {!movers.length ? <div className="empty-state compact">Collecting a reliable price baseline.</div> : null}
        </section>
        <section className="market-overview-section">
          <h3><Activity size={16} /> Most traded <small>24h</small></h3>
          <div className="market-ranking-list">{traded.slice(0, 10).map((row) => <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>{formatCompactNumber(row.totalQuantity ?? row.volume24h)} units · {formatGoldAmount(row.totalValue)}</span></button>)}</div>
          {!traded.length ? <div className="empty-state compact">No trade-volume data is available.</div> : null}
        </section>
        <section className="market-overview-section">
          <h3><Store size={16} /> Trade hubs <small>7-day activity</small></h3>
          <div className="market-ranking-list">{hubs.slice(0, 10).map((hub) => <button key={String(hub.claimId)} onClick={() => toNumber(hub.locationX) || toNumber(hub.locationZ) ? onShowMap({ name: hub.claimName, locationX: toNumber(hub.locationX), locationZ: toNumber(hub.locationZ) }, String(hub.regionId ?? "")) : undefined}><span><b>{hub.claimName ?? "Unknown settlement"}</b><small>{hub.regionName ?? `R${hub.regionId ?? "?"}`}</small></span><span>{formatGoldAmount(hub.tradedValue)} · {formatNumber(hub.traders)} traders</span>{toNumber(hub.locationX) || toNumber(hub.locationZ) ? <MapPin size={14} /> : null}</button>)}</div>
          {!hubs.length ? <div className="empty-state compact">No trade hubs were returned.</div> : null}
        </section>
        <section className="market-overview-section">
          <h3><Clock3 size={16} /> Recent market activity <small>Representative, not exhaustive</small></h3>
          <div className="market-activity-list">{activityRows.map((row, index) => <button key={String(row.id ?? `${row.itemType}:${row.itemId}:${row.createdAt}:${index}`)} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>{formatNumber(row.quantity)} @ {formatGoldAmount(row.unitPrice ?? row.price)}</span><small>{row.regionName ?? row.claimName ?? "Global market"} · {timeAgo(row.createdAt ?? row.timestamp)}</small><ArrowRight size={13} /></button>)}</div>
          {!activityRows.length ? <div className="empty-state compact">Recent activity will appear after the first insight refresh or favorite lookup.</div> : null}
        </section>
      </div>
    </section>
  );
}
