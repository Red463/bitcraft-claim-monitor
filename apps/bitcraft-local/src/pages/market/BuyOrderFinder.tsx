import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleDollarSign, Package, ShoppingBag, ShoppingCart, TrendingUp } from "lucide-react";

import { RarityBadge, TierBadge } from "../../components/main/Badges";
import { ItemIcon, ItemLabel } from "../../components/main/ItemDisplay";
import { MiniStat } from "../../components/main/Stats";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { formatCompactNumber, formatNumber, timeAgo } from "../../utils/format";
import { activeRegionLabel, useActiveRegions } from "../../hooks/useActiveRegions";
import { usePersistedState } from "../../hooks/usePersistedState";
import { unique } from "../../utils/array";
import { updateQueryState } from "../../navigation";
import { trackAnalyticsEvent } from "../../utils/analytics";
import type { LoadState } from "../../types/app";

const LOCAL_API = "/api/local";

export function BuyOrderFinder({ monitoredRegionId }: { monitoredRegionId: string }) {
  const defaultRegion = monitoredRegionId || "19";
  const [search, setSearch] = usePersistedState("market.buyOrders.search", "");
  const [regionChoice, setRegionChoice] = usePersistedState("market.buyOrders.region", defaultRegion);
  const activeRegions = useActiveRegions(defaultRegion);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = usePersistedState("market.buyOrders.pageSize", "50");
  const [sort, setSort] = React.useState("unitPrice");
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc");
  const [state, setState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: true });

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const region = params.get("buyRegion");
    if (region) setRegionChoice(region === "all" ? "All" : region);
  }, [setRegionChoice]);

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        regionId: regionChoice === "All" ? "all" : regionChoice,
        search: search.trim(),
        page: String(page),
        pageSize: String(pageSize),
        sort,
        direction,
      });
      setState((current) => ({ ...current, error: null, loading: true }));
      fetch(`${LOCAL_API}/market/buy-orders?${params}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`buy orders HTTP ${response.status}`)))
        .then((payload) => setState({ data: payload, error: null, loading: false }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ data: null, error: "Unable to load cached buy orders", loading: false });
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [regionChoice, search, page, pageSize, sort, direction]);

  const regionIds = unique([
    defaultRegion,
    regionChoice !== "All" ? regionChoice : "",
    ...activeRegions.map((region) => String(region.regionId ?? "")).filter(Boolean),
  ].filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b));
  const rows: AnyRecord[] = state.data?.rows ?? [];
  const opportunities: AnyRecord[] = state.data?.opportunities ?? [];
  const total = toNumber(state.data?.total);
  const pageCount = toNumber(state.data?.pageCount) || 1;
  const bestOrder = rows[0];
  const marketCount = new Set(rows.map((order) => order.marketClaimId || order.marketClaimName)).size;
  const regionLabel = regionChoice === "All" ? "All Regions" : `R${regionChoice}`;

  function setRegion(nextRegion: string) {
    setRegionChoice(nextRegion);
    setPage(1);
    updateQueryState({ buyRegion: nextRegion === "All" ? "all" : nextRegion });
    trackAnalyticsEvent("buy_order_region_filter", { region: nextRegion === "All" ? "all_regions" : "selected_region" });
  }

  function changeSort(nextSort: string) {
    if (sort === nextSort) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSort(nextSort);
      setDirection(nextSort === "item" || nextSort === "buyer" || nextSort === "settlement" ? "asc" : "desc");
    }
    setPage(1);
  }

  function SortHeader({ id, children }: { id: string; children: React.ReactNode }) {
    const active = sort === id;
    return (
      <button className={`table-sort-button ${active ? "is-sorted" : ""}`} type="button" onClick={() => changeSort(id)}>
        {children}
        <span className="table-sort-indicator">{active ? (direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}</span>
      </button>
    );
  }

  return (
    <section className="price-finder buy-order-finder">
      <div className="command-filter-header price-finder-header">
        <span className="command-filter-title"><ShoppingBag size={15} /> Buy order lookup</span>
        <span>{state.loading ? "Updating cached orders..." : `${formatNumber(total)} cached orders`}</span>
      </div>
      <div className="price-finder-controls">
        <label className="research-filter-field price-item-search">
          <span>Search buy orders</span>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Item, buyer, settlement, rarity..." />
        </label>
        <label className="research-filter-field price-region-field">
          <span>Region</span>
          <select value={regionChoice} onChange={(event) => setRegion(event.target.value)}>
            {regionIds.map((regionId) => {
              const region = activeRegions.find((entry) => String(entry.regionId) === String(regionId)) ?? { regionId };
              return <option value={regionId} key={regionId}>{activeRegionLabel(region, defaultRegion)}</option>;
            })}
            <option value="All">All Regions</option>
          </select>
        </label>
        <label className="research-filter-field price-page-size-field">
          <span>Rows</span>
          <select value={pageSize} onChange={(event) => { setPageSize(event.target.value); setPage(1); }}>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
        </label>
      </div>
      {state.error ? <div className="error">Unable to load cached buy orders: {state.error}</div> : null}
      <div className="metric-grid">
        <MiniStat icon={<ShoppingBag />} label="Current Buy Orders" value={formatNumber(total)} />
        <MiniStat icon={<CircleDollarSign />} label="Best Unit Price" value={bestOrder ? `${formatNumber(bestOrder.unitPrice)}g` : "-"} />
        <MiniStat icon={<Package />} label="Visible Demand" value={formatNumber(rows.reduce((sum, order) => sum + toNumber(order.quantity), 0))} />
        <MiniStat icon={<TrendingUp />} label="Visible Buy Value" value={formatCompactNumber(rows.reduce((sum, order) => sum + toNumber(order.totalValue), 0))} />
        <MiniStat icon={<ShoppingCart />} label="Markets Visible" value={formatNumber(marketCount)} />
      </div>
      <section className="buy-order-opportunities">
        <h3><TrendingUp size={17} /> Best Opportunities <small>Requires 3+ same-region sales in the last 7 days</small></h3>
        {opportunities.length ? (
          <div className="opportunity-strip">
            {opportunities.map((order) => (
              <article className="opportunity-card" key={order.orderKey}>
                <ItemIcon item={order} />
                <div>
                  <strong>{order.itemName}</strong>
                  <span>{formatNumber(order.unitPrice)}g buy order vs {formatNumber(Math.round(toNumber(order.averageUnitPrice)))}g average</span>
                  <small>{formatNumber(order.quantity)} wanted at {order.marketClaimName || `R${order.regionId}`}</small>
                </div>
                <b>{formatNumber(Math.round(toNumber(order.premiumPercent)))}% above 7d avg</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state price-empty"><TrendingUp />No high-confidence opportunities yet. Orders still appear in the table below.</div>
        )}
      </section>
      <section>
        <h3><ShoppingBag size={17} /> Current Buy Orders <small>{regionLabel}</small></h3>
        <div className="table-wrap" tabIndex={0} aria-label="Current buy orders table">
          <table>
            <thead>
              <tr>
                <th><SortHeader id="item">Item</SortHeader></th>
                <th><SortHeader id="tier">Tier</SortHeader></th>
                <th><SortHeader id="rarity">Rarity</SortHeader></th>
                <th><SortHeader id="region">Region</SortHeader></th>
                <th><SortHeader id="buyer">Buyer</SortHeader></th>
                <th><SortHeader id="settlement">Settlement</SortHeader></th>
                <th><SortHeader id="quantity">Qty</SortHeader></th>
                <th><SortHeader id="unitPrice">Unit Price</SortHeader></th>
                <th><SortHeader id="totalValue">Total Value</SortHeader></th>
                <th><SortHeader id="premium">Premium</SortHeader></th>
                <th><SortHeader id="lastSeen">Last Seen</SortHeader></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.orderKey}>
                  <td><ItemLabel item={order} /></td>
                  <td>{order.tier ? <TierBadge tier={order.tier} /> : "-"}</td>
                  <td>{order.rarity ? <RarityBadge rarity={order.rarity} /> : "-"}</td>
                  <td>{order.regionName || (order.regionId ? `R${order.regionId}` : "-")}</td>
                  <td>{order.buyerName || "-"}</td>
                  <td>{order.marketClaimName || "-"}</td>
                  <td>{formatNumber(order.quantity)}</td>
                  <td>{formatNumber(order.unitPrice)}g</td>
                  <td>{formatNumber(order.totalValue)}g</td>
                  <td>{order.premiumPercent == null ? <span className="muted">No sales baseline</span> : `${formatNumber(Math.round(order.premiumPercent))}%`}</td>
                  <td>{order.lastSeen ? timeAgo(order.lastSeen) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <div className="empty-state price-empty"><ShoppingBag />{state.loading ? "Loading cached buy orders..." : total ? "No buy orders match your search." : "No cached buy orders are available for this region yet. The regional buy-order collector may not have populated it."}</div> : null}
        </div>
        <div className="pagination-row">
          <span>{formatNumber(total)} matching orders - page {page} of {pageCount}</span>
          <div>
            <button className="toolbar-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <button className="toolbar-button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
          </div>
        </div>
      </section>
    </section>
  );
}
