import React from "react";
import { ArrowDownUp, BarChart3, MapPin, Search, ShoppingBag, Star } from "lucide-react";

import { DataTable } from "../../components/main/DataTable";
import { ItemIcon, ItemLabel } from "../../components/main/ItemDisplay";
import { RarityBadge, TierBadge } from "../../components/main/Badges";
import { MiniStat } from "../../components/main/Stats";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { updateQueryState } from "../../navigation";
import { formatCompactNumber, formatGoldAmount, formatNumber, timeAgo } from "../../utils/format";
import { isMarketableItem } from "../../utils/items";
import type { MapFocus } from "../map/mapUtils";
import type { MarketItemKey, MarketRefreshProps } from "./globalMarket";
import { marketItemType, normalizeMarketOrders } from "./globalMarket";

const API = "/api/bitjita";

type Props = MarketRefreshProps & {
  mode: "browse" | "buy";
  regionId: string;
  favorites: MarketItemKey[];
  onToggleFavorite: (key: MarketItemKey) => void;
  onShowMap: (focus: NonNullable<MapFocus>, regionId?: string) => void;
  locationSearch: string;
  onQueryStateChange: () => void;
};

function itemKey(item: AnyRecord): MarketItemKey {
  return { itemType: marketItemType(item.itemType), itemId: toNumber(item.id ?? item.itemId) };
}

function marketTypePath(item: AnyRecord, history = false) {
  const cargo = marketItemType(item.itemType) === "cargo";
  return history ? (cargo ? "cargo" : "items") : (cargo ? "cargo" : "item");
}

export function MarketBrowse({ mode, regionId, favorites, onToggleFavorite, onShowMap, locationSearch, onQueryStateChange, refreshSequence, refreshHeaders, trackRefresh }: Props) {
  const params = React.useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const [query, setQuery] = React.useState(mode === "browse" ? params.get("q") ?? "" : params.get("buyQ") ?? "");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(() => {
    const id = params.get(mode === "browse" ? "item" : "buyItem");
    const name = params.get(mode === "browse" ? "itemName" : "buyItemName");
    const type = params.get(mode === "browse" ? "itemType" : "buyItemType");
    return id && name ? { id, name, itemType: toNumber(type) } : null;
  });
  const [catalogState, setCatalogState] = React.useState<{ loading: boolean; error: string; categories: string[] }>({ loading: false, error: "", categories: [] });
  const [detailState, setDetailState] = React.useState<{ loading: boolean; error: string; detail: AnyRecord | null; history: AnyRecord | null }>({ loading: false, error: "", detail: null, history: null });
  const [category, setCategory] = React.useState(params.get("category") ?? "");
  const [availableOnly, setAvailableOnly] = React.useState(params.get("available") !== "false");
  const [hasSell, setHasSell] = React.useState(params.get("sell") !== "false");
  const [hasBuy, setHasBuy] = React.useState(mode === "buy" || params.get("buy") === "true");
  const [catalogSort, setCatalogSort] = React.useState<"relevance" | "name" | "orders">(() => {
    const saved = params.get("sort");
    return saved === "name" || saved === "orders" ? saved : "relevance";
  });
  const [orderTab, setOrderTab] = React.useState<"sell" | "buy">(mode === "buy" ? "buy" : "sell");
  const [minimumQuantity, setMinimumQuantity] = React.useState("0");
  const [minimumPrice, setMinimumPrice] = React.useState("0");
  const [locationFilter, setLocationFilter] = React.useState("");
  const [playerFilter, setPlayerFilter] = React.useState("");
  const [detailTab, setDetailTab] = React.useState<"orders" | "stats">("orders");
  const [range, setRange] = React.useState<"24h" | "7d" | "30d" | "all">("30d");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedItem?.name === query.trim()) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const search = new URLSearchParams();
      if (availableOnly) search.set("hasOrders", "true");
      setCatalogState((current) => ({ ...current, loading: true, error: "" }));
      trackRefresh("global-market-catalog", fetch(`${API}/market?${search}`, { headers: refreshHeaders, signal: controller.signal }))
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market search HTTP ${response.status}`)))
        .then((payload) => {
          const catalog = (payload.data?.items ?? []).filter(isMarketableItem);
          const queryToken = query.trim().toLowerCase();
          const categories = [...new Set<string>(catalog.map((entry: AnyRecord) => String(entry.category ?? entry.tag ?? "").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
          const items = catalog.filter((entry: AnyRecord) => {
            if (!String(entry.name ?? entry.itemName ?? "").toLowerCase().includes(queryToken)) return false;
            if (category && String(entry.category ?? entry.tag ?? "") !== category) return false;
            if (hasSell && !entry.hasSellOrders && toNumber(entry.sellOrders) <= 0) return false;
            if (hasBuy && !entry.hasBuyOrders && toNumber(entry.buyOrders) <= 0) return false;
            return true;
          }).sort((left: AnyRecord, right: AnyRecord) => {
            if (catalogSort === "name") return String(left.name ?? left.itemName ?? "").localeCompare(String(right.name ?? right.itemName ?? ""));
            if (catalogSort === "orders") return toNumber(right.orderCount ?? right.sellOrders ?? right.buyOrders) - toNumber(left.orderCount ?? left.sellOrders ?? left.buyOrders);
            return 0;
          });
          setSuggestions(items.slice(0, 12));
          setCatalogState({ loading: false, error: "", categories });
        })
        .catch((error) => {
          if (!controller.signal.aborted) setCatalogState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [availableOnly, catalogSort, category, hasBuy, hasSell, query, refreshSequence, selectedItem?.name]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      updateQueryState(mode === "browse" ? {
        q: query || null,
        category: category || null,
        available: availableOnly ? null : "false",
        sell: hasSell ? null : "false",
        buy: hasBuy ? "true" : null,
        sort: catalogSort === "relevance" ? null : catalogSort,
      } : {
        buyQ: query || null,
      });
      onQueryStateChange();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [availableOnly, catalogSort, category, hasBuy, hasSell, mode, onQueryStateChange, query]);

  React.useEffect(() => {
    if (!selectedItem) {
      setDetailState({ loading: false, error: "", detail: null, history: null });
      return;
    }
    const controller = new AbortController();
    const regionParam = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
    const detailUrl = `${API}/market/${marketTypePath(selectedItem)}/${selectedItem.id}`;
    const historyUrl = `${API}/market/${marketTypePath(selectedItem, true)}/${selectedItem.id}/price-history?bucket=1%20day&limit=${range === "24h" ? "2" : range === "7d" ? "7" : range === "30d" ? "30" : "500"}${regionId ? `&regionId=${encodeURIComponent(regionId)}` : ""}`;
    setDetailState((current) => ({ ...current, loading: true, error: "" }));
    trackRefresh("global-market-item-detail", Promise.all([
      fetch(`${detailUrl}${regionParam}`, { headers: refreshHeaders, signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`order book HTTP ${response.status}`))),
      fetch(historyUrl, { headers: refreshHeaders, signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`price history HTTP ${response.status}`))),
    ])).then(([detail, history]) => setDetailState({ loading: false, error: "", detail, history }))
      .catch((error) => {
        if (!controller.signal.aborted) setDetailState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
      });
    return () => controller.abort();
  }, [range, refreshSequence, regionId, selectedItem]);

  function chooseItem(item: AnyRecord) {
    setSelectedItem(item);
    setQuery(String(item.name ?? item.itemName ?? ""));
    setSuggestions([]);
    setPage(1);
    const key = itemKey(item);
    updateQueryState(mode === "browse" ? {
      item: String(key.itemId),
      itemName: String(item.name ?? item.itemName ?? ""),
      itemType: key.itemType === "cargo" ? "1" : "0",
      q: query || null,
    } : {
      buyItem: String(key.itemId),
      buyItemName: String(item.name ?? item.itemName ?? ""),
      buyItemType: key.itemType === "cargo" ? "1" : "0",
      buyQ: query || null,
    }, "replace");
    onQueryStateChange();
  }

  const selectedKey = selectedItem ? itemKey(selectedItem) : null;
  const itemMetadata = { ...selectedItem, ...(detailState.detail?.item ?? {}) };
  const favorite = selectedKey ? favorites.some((entry) => entry.itemType === selectedKey.itemType && entry.itemId === selectedKey.itemId) : false;
  const orders = React.useMemo(() => normalizeMarketOrders(detailState.detail ?? {}).filter((order) => (!regionId || String(order.regionId) === regionId)), [detailState.detail, regionId]);
  const filteredOrders = React.useMemo(() => orders.filter((order) => {
    if (order.side !== orderTab) return false;
    if (order.quantity < toNumber(minimumQuantity)) return false;
    if (orderTab === "buy" && order.unitPrice < toNumber(minimumPrice)) return false;
    if (locationFilter && !`${order.claimName} ${order.regionName}`.toLowerCase().includes(locationFilter.toLowerCase())) return false;
    if (playerFilter && !order.ownerName.toLowerCase().includes(playerFilter.toLowerCase())) return false;
    return true;
  }).sort(
    (a, b) => orderTab === "buy"
      ? b.unitPrice - a.unitPrice
      : a.unitPrice - b.unitPrice,
  ), [locationFilter, minimumPrice, minimumQuantity, orderTab, orders, playerFilter]);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const sells = orders.filter((order) => order.side === "sell");
  const buys = orders.filter((order) => order.side === "buy");
  const regionSummaries = React.useMemo(() => {
    const byRegion = new Map<string, { name: string; sells: number; buys: number; quantity: number }>();
    for (const order of orders) {
      const key = String(order.regionId ?? "unknown");
      const current = byRegion.get(key) ?? { name: order.regionName || (order.regionId ? `R${order.regionId}` : "Unknown region"), sells: 0, buys: 0, quantity: 0 };
      current[order.side === "sell" ? "sells" : "buys"] += 1;
      current.quantity += order.quantity;
      byRegion.set(key, current);
    }
    return [...byRegion.entries()].sort(([left], [right]) => toNumber(left) - toNumber(right));
  }, [orders]);
  const bestSell = sells.length ? Math.min(...sells.map((order) => order.unitPrice)) : null;
  const bestBuy = buys.length ? Math.max(...buys.map((order) => order.unitPrice)) : null;
  const spread = bestSell != null && bestBuy != null ? bestSell - bestBuy : null;
  const stats = detailState.history?.priceStats ?? {};
  const priceData: AnyRecord[] = Array.isArray(detailState.history?.priceData) ? detailState.history.priceData : [];
  const chartMax = Math.max(1, ...priceData.map((row) => toNumber(row.vwap ?? row.avgPrice ?? row.price)));
  const recentTrades: AnyRecord[] = Array.isArray(detailState.history?.recentTrades) ? detailState.history.recentTrades : [];

  return (
    <section className="global-market-workspace market-browse">
      <div className="global-market-searchbar">
        <label className="field market-catalog-search">
          <span>{mode === "buy" ? "Find an item with buy orders" : "Search global catalog"}</span>
          <div className="suggestion-anchor">
            <Search size={16} />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedItem(null); }} placeholder="Item or cargo name" role="combobox" aria-expanded={suggestions.length > 0} aria-controls={`${mode}-market-suggestions`} />
            {suggestions.length ? <div className="suggestion-menu" id={`${mode}-market-suggestions`} role="listbox">{suggestions.map((item) => (
              <button key={`${item.itemType}-${item.id}`} type="button" onClick={() => chooseItem(item)}>
                <ItemIcon item={item} /><strong>{item.name}</strong>{item.tier ? <TierBadge tier={item.tier} /> : null}<small>{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}{item.tag ?? ""}</small>
              </button>
            ))}</div> : null}
          </div>
        </label>
        {mode === "browse" ? <>
          <label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{catalogState.categories.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
          <label className="field"><span>Sort</span><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)}><option value="relevance">Relevance</option><option value="name">Item name</option><option value="orders">Order count</option></select></label>
          <div className="market-toggle-group">
            <label className="toggle-line"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /><span>Available only</span></label>
            <label className="toggle-line"><input type="checkbox" checked={hasSell} onChange={(event) => setHasSell(event.target.checked)} /><span>Has sell</span></label>
            <label className="toggle-line"><input type="checkbox" checked={hasBuy} onChange={(event) => setHasBuy(event.target.checked)} /><span>Has buy</span></label>
          </div>
        </> : null}
      </div>
      {catalogState.error ? <div className="error">Market search unavailable: {catalogState.error}</div> : null}
      {!selectedItem ? <div className="empty-state market-global-empty"><ShoppingBag size={28} /><strong>{mode === "buy" ? "Choose an item to inspect live demand" : "Search the global market catalog"}</strong><span>{mode === "buy" ? "Buy orders are loaded live after item selection; no monitored-settlement cache is used." : "Use the filters above, then select an item for live orders and completed-trade statistics."}</span></div> : (
        <div className="market-item-detail">
          <header>
            <div className="market-item-identity">
              <ItemIcon item={itemMetadata} />
              <div>
                <h2>{itemMetadata.name}</h2>
                <div className="market-item-meta">
                  <span>{selectedKey?.itemType === "cargo" ? "Cargo" : "Item"}</span>
                  <span>{regionId ? `Region ${regionId}` : "All active regions"}</span>
                  {toNumber(itemMetadata.tier) > 0 ? <span>Tier {itemMetadata.tier}</span> : null}
                  <span>{itemMetadata.rarityStr ?? itemMetadata.rarity ?? "Rarity unavailable"}</span>
                  <span>{itemMetadata.category ?? itemMetadata.tag ?? "Category unavailable"}</span>
                </div>
              </div>
            </div>
            <button className={`toolbar-button ${favorite ? "active" : ""}`} type="button" onClick={() => selectedKey && onToggleFavorite(selectedKey)} aria-pressed={favorite}><Star size={15} fill={favorite ? "currentColor" : "none"} /> {favorite ? "Favorited" : "Favorite"}</button>
          </header>
          {detailState.error ? <div className="error">Unable to load this market: {detailState.error}</div> : null}
          {detailState.loading && !detailState.detail ? <div className="market-loading-strip">Loading live orders and trade history…</div> : null}
          <div className="metric-grid market-order-summary">
            <MiniStat icon={<ArrowDownUp />} label="Best Sell" value={bestSell == null ? "—" : `${formatNumber(bestSell)}g`} />
            <MiniStat icon={<ArrowDownUp />} label="Best Buy" value={bestBuy == null ? "—" : `${formatNumber(bestBuy)}g`} />
            <MiniStat icon={<ArrowDownUp />} label="Spread" value={spread == null ? "—" : `${formatNumber(spread)}g`} />
            <MiniStat icon={<ShoppingBag />} label="Liquidity" value={formatNumber(orders.reduce((sum, order) => sum + order.quantity, 0))} />
            <MiniStat icon={<ShoppingBag />} label="Sell Orders" value={formatNumber(sells.length)} />
            <MiniStat icon={<ShoppingBag />} label="Buy Orders" value={formatNumber(buys.length)} />
          </div>
          {regionSummaries.length ? <div className="market-region-summaries" aria-label="Regional order summaries">{regionSummaries.map(([key, summary]) => <span key={key}><b>{summary.name}</b>{formatNumber(summary.sells)} sell · {formatNumber(summary.buys)} buy · {formatCompactNumber(summary.quantity)} units</span>)}</div> : null}
          <div className="tabs market-order-tabs">
            <button className={detailTab === "orders" ? "active" : ""} onClick={() => setDetailTab("orders")}>Orders</button>
            <button className={detailTab === "stats" ? "active" : ""} onClick={() => setDetailTab("stats")}>Stats</button>
          </div>
          {detailTab === "orders" ? <>
            <div className="market-order-filters">
              <div className="tabs market-order-tabs"><button className={orderTab === "sell" ? "active" : ""} onClick={() => { setOrderTab("sell"); setPage(1); }}>Sell ({sells.length})</button><button className={orderTab === "buy" ? "active" : ""} onClick={() => { setOrderTab("buy"); setPage(1); }}>Buy ({buys.length})</button></div>
              <label className="field"><span>Minimum quantity</span><input type="number" min="0" value={minimumQuantity} onChange={(event) => setMinimumQuantity(event.target.value)} /></label>
              {orderTab === "buy" ? <label className="field"><span>Minimum price</span><input type="number" min="0" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} /></label> : null}
              <label className="field"><span>Settlement or region</span><input value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} /></label>
              <label className="field"><span>{orderTab === "buy" ? "Buyer" : "Seller"}</span><input value={playerFilter} onChange={(event) => setPlayerFilter(event.target.value)} /></label>
            </div>
            <DataTable
              rows={filteredOrders}
              rowOffset={(Math.min(page, pageCount) - 1) * pageSize}
              rowLimit={pageSize}
              scrollLabel={`${orderTab} market orders table`}
              emptyState={`No ${orderTab} orders match these filters.`}
              columns={[
                ["Price", (order) => formatGoldAmount(order.unitPrice), (order) => order.unitPrice],
                ["Quantity", (order) => formatNumber(order.quantity), (order) => order.quantity],
                ["Total", (order) => formatGoldAmount(order.unitPrice * order.quantity), (order) => order.unitPrice * order.quantity],
                ["Region", (order) => order.regionName || (order.regionId ? `R${order.regionId}` : "—"), (order) => order.regionName || String(order.regionId ?? "")],
                ["Settlement", (order) => order.claimName || "Unknown settlement", (order) => order.claimName],
                [orderTab === "buy" ? "Buyer" : "Seller", (order) => order.ownerName || "—", (order) => order.ownerName],
                ["Map", (order) => order.locationX != null && order.locationZ != null ? <button className="icon-button" title="Show on map" onClick={() => onShowMap({ name: order.claimName || selectedItem.name, locationX: order.locationX, locationZ: order.locationZ }, String(order.regionId ?? ""))}><MapPin size={15} /></button> : "—", undefined, false],
              ]}
            />
            <div className="pagination-row"><span>Page {Math.min(page, pageCount)} of {pageCount} · {formatNumber(filteredOrders.length)} orders</span><div><button className="toolbar-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button className="toolbar-button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>
          </> : (
            <div className="market-stats-workspace">
              <div className="market-range-tabs">{(["24h", "7d", "30d", "all"] as const).map((entry) => <button className={range === entry ? "active" : ""} key={entry} onClick={() => setRange(entry)}>{entry}</button>)}</div>
              <div className="metric-grid"><MiniStat icon={<BarChart3 />} label="24h VWAP" value={stats.avg24h == null ? "—" : `${formatNumber(stats.avg24h)}g`} /><MiniStat icon={<BarChart3 />} label="7d VWAP" value={stats.avg7d == null ? "—" : `${formatNumber(stats.avg7d)}g`} /><MiniStat icon={<BarChart3 />} label="30d Average" value={stats.avg30d == null ? "—" : `${formatNumber(stats.avg30d)}g`} /><MiniStat icon={<BarChart3 />} label="High / Low" value={stats.allTimeHigh == null ? "—" : `${formatNumber(stats.allTimeHigh)} / ${formatNumber(stats.allTimeLow)}g`} /><MiniStat icon={<BarChart3 />} label="Volume" value={formatNumber(stats.totalVolume)} /><MiniStat icon={<BarChart3 />} label="24h Change" value={stats.priceChange24h == null ? "—" : `${toNumber(stats.priceChange24h) >= 0 ? "+" : ""}${formatNumber(stats.priceChange24h)}%`} /></div>
              <section className="market-price-chart" aria-label={`${range} price history chart`}>{priceData.length ? priceData.map((row, index) => { const price = toNumber(row.vwap ?? row.avgPrice ?? row.price); return <span key={String(row.bucket ?? row.timestamp ?? index)} title={`${formatNumber(price)}g`} style={{ height: `${Math.max(4, (price / chartMax) * 100)}%` }} />; }) : <div className="empty-state">No completed-trade price history is available for this selection.</div>}</section>
              <section className="market-recent-trades"><h3>Recent trades <small>Representative item history</small></h3>{recentTrades.length ? recentTrades.slice(0, 20).map((trade, index) => <div key={String(trade.id ?? `${trade.timestamp}-${index}`)}><ItemLabel item={{ ...selectedItem, itemName: selectedItem.name }} /><span>{formatNumber(trade.quantity)} @ {formatNumber(trade.unitPrice ?? trade.price)}g</span><small>{trade.regionName ?? trade.claimName ?? "Unknown market"} · {timeAgo(trade.createdAt ?? trade.timestamp)}</small></div>) : <div className="empty-state">No recent trades were returned.</div>}</section>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
