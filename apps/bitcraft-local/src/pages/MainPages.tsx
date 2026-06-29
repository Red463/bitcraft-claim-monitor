import React from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Box,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Factory,
  Globe2,
  GraduationCap,
  Hammer,
  Lock,
  Map as MapIcon,
  MapPin,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  RefreshCw,
  Save,
  Search,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
  User,
  Wrench,
  X,
} from "lucide-react";
import { RarityBadge, TierBadge, TrackedOwnerName } from "../components/main/Badges";
import { DataTable } from "../components/main/DataTable";
import { ItemIcon, ItemLabel, TierMaterialIcon } from "../components/main/ItemDisplay";
import { SearchBox } from "../components/main/SearchBox";
import { Segmented } from "../components/main/Segmented";
import { MiniStat } from "../components/main/Stats";
import {
  buildConstructionProjects,
  toNumber,
  unwrap,
  type AnyRecord,
} from "../main-app-data";
import {
  dateLabel,
  formatCompactNumber,
  formatCurrentSession,
  formatDuration,
  formatEquipmentSlot,
  formatNumber,
  shortDateLabel,
  timeAgo,
  timestampMs,
} from "../utils/format";
import { mapWithBrowserConcurrency } from "../utils/concurrency";
import { activeRegionLabel, useActiveRegions } from "../hooks/useActiveRegions";
import { hasPersistedState, usePersistedState } from "../hooks/usePersistedState";
import { getTrackedOwnerName } from "../utils/ownership";
import { bitjitaIconUrl, isMarketableItem, playerToolbeltTools } from "../utils/items";
import { memberDisplayName, memberTrackingId } from "../utils/memberIdentity";
import { normalizeData } from "../utils/normalize";
import { unique } from "../utils/array";
import { SKILL_IDS, SKILL_NAMES, TOOL_TAG_BY_TYPE } from "../utils/professions";
import { updateQueryState } from "../navigation";
import { trackAnalyticsEvent } from "../utils/analytics";
import type { ActivePanel, LoadState } from "../types/app";
import { bitcraftMapUrl, mapResourceCategory, mapResourceToken, normalizeMapResourceToken, parseBitcraftMapUrl, type MapFocus } from "./map/mapUtils";
import { BEST_SELLER_SORTS, bestSellerSortValue, buildMarketDaily, buildMarketTopItems, formatMarketDay, type BestSellerSortKey } from "./market/marketAnalytics";
import { displayItemName, listingDate, listingTrackingKey, liveDaysSince, safeDisplayJson } from "./market/listingUtils";
import { craftProgressKey, hasRecentCraftContribution, productionMetrics } from "./production/productionUtils";

/*
 * Main application pages that still share a large amount of display logic.
 *
 * AppShell passes normalized BitJita data and local history into these pages.
 * Keep automatic BitJita fetching out of page components unless the interaction
 * is an explicit user-triggered tool such as market search or map catalog lookup.
 */

const API = "/api/bitjita";
const LOCAL_API = "/api/local";
function BestSellersLeaderboard({ rows, itemMeta }: { rows: AnyRecord[]; itemMeta: Map<string, AnyRecord> }) {
  const [sort, setSort] = React.useState<BestSellerSortKey>("units");
  const sortedRows = React.useMemo(
    () => [...rows].sort((a, b) => bestSellerSortValue(b, sort) - bestSellerSortValue(a, sort)),
    [rows, sort],
  );
  const featured = sortedRows.slice(0, 3);
  const remaining = sortedRows.slice(3);

  if (!sortedRows.length) {
    return (
      <div className="market-best-empty">
        <Star size={24} />
        <strong>No confirmed best sellers yet</strong>
        <span>API-confirmed sales will appear here once BitJita reports completed trades for this selection.</span>
      </div>
    );
  }

  const renderItem = (row: AnyRecord, index: number, variant: "featured" | "compact") => {
    const itemName = String(row.itemName ?? row.item_name ?? row.name ?? "Unknown item");
    const meta = itemMeta.get(itemName) ?? {};
    const item: AnyRecord = { ...meta, ...row, name: itemName, itemName };
    const tier = item.itemTier ?? item.tier;
    const rarity = item.itemRarityStr ?? item.rarity;
    const rank = index + 1;
    return (
      <article className={`market-best-row ${variant}`} key={`${itemName}-${rank}`}>
        <span className={`market-best-rank rank-${rank}`}>#{rank}</span>
        <ItemIcon item={item} />
        <div className="market-best-name">
          <strong>{itemName}</strong>
          <span>
            {tier ? <TierBadge tier={tier} /> : null}
            {rarity ? <RarityBadge rarity={rarity} /> : null}
            <small title={dateLabel(row.lastSoldAt)}>Last trade {timeAgo(row.lastSoldAt)}</small>
          </span>
        </div>
        <div className="market-best-stats">
          <span><b>{formatNumber(row.unitsSold)}</b><small>units</small></span>
          <span><b>{formatCompactNumber(row.totalValue)}</b><small>revenue</small></span>
          <span><b>{formatNumber(row.avgUnitPrice)}g</b><small>avg</small></span>
          <span><b>{formatNumber(row.salesCount)}</b><small>sales</small></span>
        </div>
      </article>
    );
  };

  return (
    <div className="market-best-leaderboard">
      <div className="market-best-toolbar" aria-label="Best sellers ranking controls">
        <span>Ranked by</span>
        <div>
          {BEST_SELLER_SORTS.map((option) => (
            <button key={option.key} type="button" className={sort === option.key ? "active" : ""} onClick={() => setSort(option.key)} aria-pressed={sort === option.key}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="market-best-featured">
        {featured.map((row, index) => renderItem(row, index, "featured"))}
      </div>
      {remaining.length ? (
        <div className="market-best-compact">
          {remaining.map((row, index) => renderItem(row, index + featured.length, "compact"))}
        </div>
      ) : null}
    </div>
  );
}
export function Market({ data, history, claimId }: { data: ReturnType<typeof normalizeData>; history: AnyRecord | null; claimId: string }) {
  const [q, setQ] = React.useState("");
  const [view, setView] = usePersistedState<"live" | "analytics" | "pricing" | "buyOrders">("market.view", "live");
  const [tab, setTab] = React.useState<"sell" | "buy">("sell");
  const [tier, setTier] = usePersistedState("market.tier", "All");
  const [rarity, setRarity] = usePersistedState("market.rarity", "All");
  const [memberFilter, setMemberFilter] = usePersistedState("market.member", "All");
  const [memberHistory, setMemberHistory] = React.useState<AnyRecord | null>(null);
  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "live" || requested === "analytics" || requested === "pricing") setView(requested);
    if (requested === "buy-orders" || requested === "buyOrders") setView("buyOrders");
  }, [setView]);
  const selectView = (next: "live" | "analytics" | "pricing" | "buyOrders") => {
    setView(next);
    updateQueryState({ page: "market", tab: next === "buyOrders" ? "buy-orders" : next });
    trackAnalyticsEvent("market_tab_viewed", { tab: next });
  };
  const memberOptions = React.useMemo(() => {
    const names = [
      ...data.members.map((member) => member.userName ?? member.username ?? member.playerUsername ?? member.name),
      ...data.market.map((listing) => listing.ownerUsername ?? listing.owner ?? listing.ownerName),
    ].filter(Boolean).map(String);
    return unique(names).sort((a, b) => a.localeCompare(b));
  }, [data.members, data.market]);
  const ownerMatches = React.useCallback((owner: unknown) => memberFilter === "All" || String(owner ?? "").toLowerCase() === memberFilter.toLowerCase(), [memberFilter]);
  const all = data.market.filter((listing) => ownerMatches(listing.ownerUsername ?? listing.owner ?? listing.ownerName));
  React.useEffect(() => {
    if (memberFilter === "All") {
      setMemberHistory(null);
      return;
    }
    const controller = new AbortController();
    setMemberHistory(null);
    fetch(`${LOCAL_API}/market/history?claimId=${encodeURIComponent(claimId)}&limit=120&owner=${encodeURIComponent(memberFilter)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market history HTTP ${response.status}`)))
      .then((result) => setMemberHistory(result))
      .catch(() => {
        if (!controller.signal.aborted) setMemberHistory({ sales: [], topItems: [], daily: [], totals: {} });
      });
    return () => controller.abort();
  }, [claimId, memberFilter, history]);
  const analytics = memberFilter === "All" ? history : memberHistory;
  const apiTrades: AnyRecord[] = (analytics?.sales ?? [])
    .map((event: AnyRecord) => {
      const raw = safeDisplayJson(event.raw_json) ?? {};
      return {
        id: event.id,
        itemName: event.item_name,
        name: event.item_name,
        iconAssetName: event.iconAssetName ?? raw.iconAssetName,
        quantity: event.quantity,
        unitPrice: event.price,
        totalPrice: event.total_value,
        sellerUsername: event.owner,
        purchaserUsername: raw.purchaserUsername,
        itemTier: event.tier ?? raw.itemTier,
        itemRarityStr: event.rarity ?? raw.itemRarityStr,
        timestamp: event.occurred_at,
      };
    })
    .sort((a: AnyRecord, b: AnyRecord) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const marketItemMeta = React.useMemo(() => {
    const entries = [...data.market, ...apiTrades].map((item: AnyRecord) => [String(item.itemName ?? item.name ?? ""), item] as const);
    return new Map(entries.filter(([name]) => Boolean(name)));
  }, [apiTrades, data.market]);
  const trackedLiveListings = React.useMemo(
    () => new Map<string, AnyRecord>((history?.liveListings ?? []).map((listing: AnyRecord) => [String(listing.listing_key), listing])),
    [history?.liveListings],
  );
  const listingListedAt = (listing: AnyRecord) => listingDate(listing, trackedLiveListings.get(listingTrackingKey(listing))?.first_seen);
  const sellOrders = all.filter((m) => String(m.side ?? m.orderType ?? "sell").toLowerCase().includes("sell"));
  const buyOrders = all.filter((m) => String(m.side ?? m.orderType ?? "").toLowerCase().includes("buy"));
  const current = tab === "sell" ? (sellOrders.length ? sellOrders : all) : buyOrders;
  const tiers = unique(all.map((m) => String(m.itemTier ?? m.tier)).filter((value) => value && value !== "undefined"));
  const rarities = unique(all.map((m) => m.itemRarityStr ?? m.rarity).filter(Boolean));
  const rows = current.filter((m) => {
    if (q && !String(m.itemName ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (tier !== "All" && String(m.itemTier ?? m.tier) !== tier) return false;
    if (rarity !== "All" && (m.itemRarityStr ?? m.rarity) !== rarity) return false;
    return true;
  });
  const renderedRows = rows.slice(0, 500);
  const highest = [...all].sort((a, b) => toNumber(b.price) * toNumber(b.quantity || 1) - toNumber(a.price) * toNumber(a.quantity || 1)).slice(0, 3);
  const saleEvents = apiTrades.map((trade: AnyRecord) => ({
    itemName: trade.itemName,
    item_name: trade.itemName,
    quantity: trade.quantity,
    price: trade.unitPrice,
    totalValue: trade.totalPrice,
    total_value: trade.totalPrice,
    occurredAt: trade.timestamp ?? trade.createdAt,
    occurred_at: trade.timestamp ?? trade.createdAt,
  }));
  const topItems = analytics?.topItems ?? buildMarketTopItems(saleEvents);
  const daily = analytics?.daily ?? buildMarketDaily(saleEvents);
  const confirmedSales = toNumber(analytics?.totals?.confirmedSales ?? apiTrades.length);
  const confirmedRevenue = toNumber(analytics?.totals?.trackedValue ?? apiTrades.reduce((total: number, trade: AnyRecord) => total + toNumber(trade.totalPrice), 0));
  const unitsSold = toNumber(analytics?.totals?.confirmedUnits ?? apiTrades.reduce((total: number, trade: AnyRecord) => total + toNumber(trade.quantity), 0));
  const averageSaleValue = confirmedSales ? confirmedRevenue / confirmedSales : 0;
  const listingValue = all.reduce((total, listing) => total + toNumber(listing.price) * Math.max(1, toNumber(listing.quantity)), 0);
  const maxDailyValue = Math.max(...daily.map((row: AnyRecord) => toNumber(row.totalValue)), 1);
  const trendRange = daily.length ? `${formatMarketDay(daily[0].day)} to ${formatMarketDay(daily[daily.length - 1].day)}` : "No confirmed sales";
  const filterLabel = memberFilter === "All" ? "all members" : memberFilter;
  return (
    <div className="panel market-page">
      <header className="members-topbar market-topbar">
        <div>
          <h2>Market</h2>
          <p>{view === "pricing" ? "Regional completed-trade pricing for smarter listings" : view === "buyOrders" ? "Find active buy orders across regional markets" : `${formatNumber(all.length)} live listing${all.length === 1 ? "" : "s"} for ${filterLabel}`}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><ShoppingCart size={14} /> {formatNumber(all.length)} listings</span>
            <span>{formatNumber(confirmedSales)} confirmed sales</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">R{data.claim?.regionId ?? "?"}</span>
            <span>{data.claim?.name ?? "Settlement market"}</span>
          </div>
        </div>
      </header>
      <div className="summary-grid market-summary">
        <MiniStat icon={<ShoppingCart />} label="Live Listings" value={formatNumber(all.length)} />
        <MiniStat icon={<CircleDollarSign />} label="Listing Value" value={formatCompactNumber(listingValue)} />
        <MiniStat icon={<CheckCircle2 />} label="Confirmed Sales" value={formatNumber(confirmedSales)} />
        <MiniStat icon={<TrendingUp />} label="Sales Revenue" value={formatCompactNumber(confirmedRevenue)} />
      </div>
      <section className="production-command-panel market-command-panel">
        <div className="market-command-header">
          <span className="production-command-title"><CircleDollarSign size={15} /> Market tools</span>
          <span className="market-command-note">{view === "pricing" ? "Use completed trade history to estimate listing prices." : view === "buyOrders" ? "Search current buy orders by item and region." : "Browse settlement market data by view and member."}</span>
        </div>
        <div className="market-tool-row">
          <div className="tabs primary-tabs market-tabs">
            <button className={view === "live" ? "active" : ""} onClick={() => selectView("live")}><ShoppingCart size={15} /> Live Listings</button>
            <button className={view === "analytics" ? "active" : ""} onClick={() => selectView("analytics")}><TrendingUp size={15} /> Analytics</button>
            <button className={view === "pricing" ? "active" : ""} onClick={() => selectView("pricing")}><CircleDollarSign size={15} /> Price Finder</button>
            <button className={view === "buyOrders" ? "active" : ""} onClick={() => selectView("buyOrders")}><ShoppingBag size={15} /> Buy Order Finder</button>
          </div>
          <label className={`market-member-field ${view === "pricing" || view === "buyOrders" ? "is-placeholder" : ""}`}>
            <span>Member</span>
            {view !== "pricing" && view !== "buyOrders" ? (
              <select className="select-control" value={memberFilter} onChange={(event) => { setMemberFilter(event.target.value); trackAnalyticsEvent("market_member_filter_used", { scope: event.target.value === "All" ? "all" : "member" }); }}>
                <option>All</option>
                {memberOptions.map((name) => <option key={name}>{name}</option>)}
              </select>
            ) : <span className="market-member-placeholder">{view === "buyOrders" ? "All market buyers" : "All settlement history"}</span>}
          </label>
        </div>
      </section>
      {view === "pricing" ? (
        <PriceFinder monitoredRegionId={String(data.claim?.regionId ?? "19")} />
      ) : view === "buyOrders" ? (
        <BuyOrderFinder monitoredRegionId={String(data.claim?.regionId ?? "19")} />
      ) : view === "analytics" ? (
        <>
          <p className="legend market-legend">Completed sales for orders listed at this settlement market, confirmed from BitJita trade records.</p>
          <div className="metric-grid market-analytics-metrics">
            <MiniStat icon={<CheckCircle2 />} label="Confirmed Sales" value={formatNumber(confirmedSales)} />
            <MiniStat icon={<Package />} label="Units Sold" value={formatNumber(unitsSold)} />
            <MiniStat icon={<CircleDollarSign />} label="Sales Revenue" value={formatCompactNumber(confirmedRevenue)} />
            <MiniStat icon={<TrendingUp />} label="Average Sale Value" value={`${formatNumber(averageSaleValue)}g`} />
          </div>
          <div className="two-col market-analytics">
            <section>
              <h3><Star size={17} /> Best Sellers</h3>
              <p className="legend">Top confirmed sellers from recorded BitJita trade history.</p>
              <BestSellersLeaderboard rows={topItems} itemMeta={marketItemMeta} />
            </section>
            <section>
              <h3><TrendingUp size={17} /> Revenue By Day</h3>
              <p className="legend">{trendRange}. Confirmed sales only; bar length represents revenue.</p>
              <div className="daily-sales">
                {daily.length ? daily.map((row: AnyRecord) => (
                  <div className="daily-sale-row" key={row.day}>
                    <span>{formatMarketDay(row.day)}</span>
                    <div className="daily-sale-bar"><i style={{ width: `${(toNumber(row.totalValue) / maxDailyValue) * 100}%` }} /></div>
                    <strong>{formatNumber(row.totalValue)}g</strong>
                    <small>{formatNumber(row.salesCount)} sale{row.salesCount === 1 ? "" : "s"} - {formatNumber(row.unitsSold)} units</small>
                  </div>
                )) : <p className="legend">No API-confirmed sales found for this selection.</p>}
              </div>
            </section>
          </div>
          <section className="market-section">
            <h3><CheckCircle2 size={17} /> Recent Confirmed Sales</h3>
            <p className="legend">Imported completed sales retained in this monitor's history for the selected current settlement member(s).</p>
            <DataTable rows={apiTrades} columns={[
              ["When", r => dateLabel(r.timestamp ?? r.createdAt)],
              ["Item", r => <ItemLabel item={r} name={r.itemName ?? "-"} />],
              ["Tier", r => r.itemTier ? <TierBadge tier={r.itemTier} /> : "-"],
              ["Qty", r => formatNumber(r.quantity)],
              ["Unit Price", r => `${formatNumber(r.unitPrice)}g`],
              ["Value", r => `${formatNumber(r.totalPrice)}g`],
              ["Seller", r => r.sellerUsername ?? "-"],
              ["Buyer", r => r.purchaserUsername ?? r.buyerUsername ?? "-"],
            ]} />
          </section>
        </>
      ) : (
        <>
      <div className="market-live-grid">
        <MiniStat icon={<ShoppingCart />} label="Visible Listings" value={all.length} />
        <MiniStat icon={<TrendingDown />} label="Sell Orders" value={sellOrders.length || all.length} />
        <MiniStat icon={<TrendingUp />} label="Buy Orders" value={buyOrders.length} />
        <MiniStat icon={<CircleDollarSign />} label="Top Value" value={highest[0] ? formatCompactNumber(toNumber(highest[0].price) * toNumber(highest[0].quantity || 1)) : "-"} />
      </div>
      <div className="highlight-grid market-highlights">{highest.map((listing) => <div key={listing.entityId ?? listing.itemName}><ItemLabel item={{ ...listing, name: listing.itemName }} name={listing.itemName} /><span>{formatNumber(toNumber(listing.price) * toNumber(listing.quantity || 1))}g - {formatNumber(listing.price)}g ea</span></div>)}</div>
      <section className="production-command-panel market-filter-panel">
        <div className="market-command-header">
          <span className="production-command-title"><Search size={15} /> Listing filters</span>
          <span>{formatNumber(rows.length)} visible rows</span>
        </div>
        <div className="market-filter-grid">
          <label className="research-filter-field">
            <span>Search</span>
            <SearchBox value={q} onChange={setQ} placeholder="Search market" />
          </label>
          <label className="research-filter-field">
            <span>Order Type</span>
            <div className="segmented market-order-tabs"><button className={tab === "sell" ? "active" : ""} onClick={() => setTab("sell")}><TrendingDown size={15} /> Sell</button><button className={tab === "buy" ? "active" : ""} onClick={() => setTab("buy")}><TrendingUp size={15} /> Buy</button></div>
          </label>
          <label className="research-filter-field">
            <span>Tier</span>
            <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="research-filter-field">
            <span>Rarity</span>
            <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}><option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
        </div>
      </section>
      {rows.length > renderedRows.length ? <p className="legend market-legend">Showing the first {formatNumber(renderedRows.length)} of {formatNumber(rows.length)} matching listings. Narrow the filters to inspect more specific results.</p> : null}
      <DataTable rows={renderedRows} columns={[
        ["Item", r => <ItemLabel item={{ ...r, name: r.itemName }} name={r.itemName ?? "Unknown"} />],
        ["Side", r => <span className={`pill ${String(r.side ?? r.orderType).includes("buy") ? "buy" : "sell"}`}>{r.side ?? r.orderType ?? "sell"}</span>],
        ["Qty", r => formatNumber(r.quantity)],
          ["Unit Price", r => `${formatNumber(r.price)}g`],
          ["Total Price", r => `${formatNumber(r.totalValue ?? r.total_value ?? (toNumber(r.price) * toNumber(r.quantity)))}g`],
          ["Tier", r => (r.itemTier ?? r.tier) ? <TierBadge tier={r.itemTier ?? r.tier} /> : "-"],
        ["Rarity", r => (r.itemRarityStr ?? r.rarity) ? <RarityBadge rarity={r.itemRarityStr ?? r.rarity} /> : "-"],
        ["Owner", r => <TrackedOwnerName name={r.ownerUsername ?? "-"} claim={data.claim} />],
        ["Listed", r => listingListedAt(r) ? dateLabel(listingListedAt(r)) : "-"],
        ["Live", r => liveDaysSince(listingListedAt(r))],
      ]} />
        </>
      )}
    </div>
  );
}

export function PriceFinder({ monitoredRegionId }: { monitoredRegionId: string }) {
  const defaultRegion = monitoredRegionId || "19";
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [searchState, setSearchState] = React.useState<"idle" | "loading" | "error">("idle");
  const [regionChoice, setRegionChoice] = usePersistedState("market.price.region", defaultRegion);
  const activeRegions = useActiveRegions(defaultRegion);
  const [priceState, setPriceState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: false });
  const [authState, setAuthState] = React.useState<AnyRecord>({ user: null, discordLoginEnabled: false });
  const [watchState, setWatchState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: false });
  const [watchBusy, setWatchBusy] = React.useState("");
  const activeRegion = regionChoice === "All" ? "" : regionChoice;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    const itemName = params.get("itemName");
    const itemType = params.get("itemType");
    const region = params.get("region");
    if (itemId && itemName) {
      setSelectedItem({ id: itemId, name: itemName, itemType: toNumber(itemType) });
      setQuery(itemName);
    }
    if (region) setRegionChoice(region === "all" ? "All" : region);
  }, [setRegionChoice]);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedItem?.name === query.trim()) {
      setSuggestions([]);
      setSearchState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      fetch(`${API}/market?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market search HTTP ${response.status}`)))
        .then((payload) => {
          setSuggestions((payload.data?.items ?? []).filter(isMarketableItem).slice(0, 8));
          setSearchState("idle");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setSearchState("error");
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedItem?.name]);

  React.useEffect(() => {
    if (!selectedItem) {
      setPriceState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    const type = toNumber(selectedItem.itemType) === 1 ? "cargo" : "items";
    const regionParam = activeRegion ? `&regionId=${encodeURIComponent(activeRegion)}` : "";
    setPriceState((current) => ({ ...current, error: null, loading: true }));
    fetch(`${API}/market/${type}/${selectedItem.id}/price-history?bucket=1%20day&limit=30${regionParam}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`price history HTTP ${response.status}`)))
      .then((payload) => setPriceState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setPriceState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, [selectedItem, activeRegion, regionChoice]);

  const refreshDealWatches = React.useCallback(() => {
    const controller = new AbortController();
    setWatchState((current) => ({ ...current, error: null, loading: true }));
    fetch(`${LOCAL_API}/market/deal-watches`, { signal: controller.signal })
      .then((response) => response.status === 401 ? { watches: [], settings: null, signedOut: true } : response.ok ? response.json() : Promise.reject(new Error(`deal watches HTTP ${response.status}`)))
      .then((payload) => setWatchState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setWatchState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${LOCAL_API}/auth/me`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { user: null, discordLoginEnabled: false })
      .then((payload) => setAuthState(payload ?? { user: null, discordLoginEnabled: false }))
      .catch(() => {
        if (!controller.signal.aborted) setAuthState({ user: null, discordLoginEnabled: false });
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => refreshDealWatches(), [refreshDealWatches]);

  async function addDealWatch() {
    if (!selectedItem || !activeRegion) return;
    setWatchBusy("add");
    try {
      const response = await fetch(`${LOCAL_API}/market/deal-watches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          regionId: activeRegion,
          itemId: selectedItem.id,
          itemType: toNumber(selectedItem.itemType),
          itemName: selectedItem.name,
          tier: selectedItem.tier ?? selectedItem.itemTier,
          rarity: selectedItem.rarityStr ?? selectedItem.rarity ?? selectedItem.itemRarityStr,
          iconAssetName: selectedItem.iconAssetName ?? selectedItem.assetName ?? selectedItem.itemIconAssetName,
        }),
      });
      if (response.status === 401) {
        window.location.href = `${LOCAL_API}/auth/discord/start?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `deal watch HTTP ${response.status}`);
      }
      refreshDealWatches();
    } catch (error) {
      setWatchState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setWatchBusy("");
    }
  }

  async function updateDealWatch(watch: AnyRecord, patch: AnyRecord) {
    const id = String(watch.id ?? "");
    if (!id) return;
    setWatchBusy(id);
    try {
      const response = await fetch(`${LOCAL_API}/market/deal-watches/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(`deal watch HTTP ${response.status}`);
      refreshDealWatches();
    } catch (error) {
      setWatchState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setWatchBusy("");
    }
  }

  async function deleteDealWatch(watch: AnyRecord) {
    const id = String(watch.id ?? "");
    if (!id) return;
    setWatchBusy(id);
    try {
      const response = await fetch(`${LOCAL_API}/market/deal-watches/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`deal watch HTTP ${response.status}`);
      refreshDealWatches();
    } catch (error) {
      setWatchState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setWatchBusy("");
    }
  }

  function saveDealWatchThreshold(watch: AnyRecord, value: string) {
    const thresholdPercent = Math.min(Math.max(Number(value) || toNumber(watch.thresholdPercent) || 30, 1), 95);
    if (Math.abs(thresholdPercent - toNumber(watch.thresholdPercent)) < 0.01) return;
    updateDealWatch(watch, { thresholdPercent });
  }
  function chooseItem(item: AnyRecord) {
    setSelectedItem(item);
    setQuery(String(item.name));
    setSuggestions([]);
    updateQueryState({ item: String(item.id), itemName: String(item.name), itemType: String(item.itemType ?? 0), region: activeRegion || "all" });
    trackAnalyticsEvent("price_finder_search", { region: activeRegion ? "selected_region" : "all_regions" });
  }

  const stats = priceState.data?.priceStats ?? {};
  const suggestedWindow = stats.avg24h != null ? "Last 24 Hours" : stats.avg7d != null ? "Last 7 Days" : stats.avg30d != null ? "Last 30 Days" : "";
  const suggestedAverage = stats.avg24h ?? stats.avg7d ?? stats.avg30d;
  const suggestedPrice = suggestedAverage == null ? null : Math.max(1, Math.round(toNumber(suggestedAverage)));
  const tradeCount = toNumber(stats.totalTrades);
  const confidence = tradeCount >= 20 ? "High confidence" : tradeCount >= 5 ? "Medium confidence" : tradeCount > 0 ? "Low confidence" : "No sales data";
  const recentTrades: AnyRecord[] = priceState.data?.recentTrades ?? [];
  const regionLabel = activeRegion ? `R${activeRegion}` : "All Regions";
  const regionIds = unique([
    defaultRegion,
    regionChoice !== "All" ? regionChoice : "",
    ...activeRegions.map((region) => String(region.regionId ?? "")).filter(Boolean),
  ].filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b));
  const dealWatches: AnyRecord[] = Array.isArray(watchState.data?.watches) ? watchState.data.watches : [];
  const dealSettings = watchState.data?.settings ?? {};
  const selectedWatch = selectedItem && activeRegion
    ? dealWatches.find((watch) => String(watch.regionId) === String(activeRegion) && String(watch.itemId) === String(selectedItem.id) && toNumber(watch.itemType) === toNumber(selectedItem.itemType))
    : null;
  const signInHref = `${LOCAL_API}/auth/discord/start?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
  const maxWatches = toNumber(dealSettings.maxWatchesPerUser) || 10;
  return (
    <section className="price-finder">
      <div className="market-command-header price-finder-header">
        <span className="production-command-title"><Search size={15} /> Price lookup</span>
        <span>{regionLabel} completed trades</span>
      </div>
      <div className="price-finder-controls">
        <label className="research-filter-field price-item-search">
          <span>Item</span>
          <div className="suggestion-anchor">
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedItem(null); }} placeholder="Start typing an item name" />
            {suggestions.length ? <div className="suggestion-menu">{suggestions.map((item) => (
              <button key={`${item.itemType}-${item.id}`} type="button" onClick={() => chooseItem(item)}>
                <ItemIcon item={item} />
                <strong>{item.name}</strong>
                {item.tier ? <TierBadge tier={item.tier} /> : null}
                <small className="item-meta-line">{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}{item.tag ?? ""}</small>
              </button>
            ))}</div> : null}
          </div>
          {searchState === "loading" ? <small className="legend">Finding market items...</small> : null}
          {searchState === "error" ? <small className="legend">Unable to search items right now.</small> : null}
        </label>
        <label className="research-filter-field price-region-field">
          <span>Region</span>
          <select value={regionChoice} onChange={(event) => { setRegionChoice(event.target.value); updateQueryState({ region: event.target.value === "All" ? "all" : event.target.value }); trackAnalyticsEvent("price_finder_region_changed", { scope: event.target.value === "All" ? "all_regions" : "specific_region" }); }}>
            {regionIds.map((regionId) => {
              const region = activeRegions.find((entry) => String(entry.regionId) === String(regionId)) ?? { regionId };
              return <option value={regionId} key={regionId}>{activeRegionLabel(region, defaultRegion)}</option>;
            })}
            <option value="All">All Regions</option>
          </select>
        </label>
      </div>
      {!selectedItem ? <div className="empty-state price-empty"><CircleDollarSign />Choose an item to examine completed trade pricing.</div> : null}
      {selectedItem && priceState.loading && !priceState.data ? <div className="loading">Loading price history for {selectedItem.name}...</div> : null}
      {priceState.error ? <div className="error">Unable to load price history: {priceState.error}</div> : null}
      {selectedItem && priceState.data ? (
        <>
            <div className="price-finder-heading">
              <div><h3>{selectedItem.name}</h3><span>{regionLabel} market trade history</span></div>
              <div className="price-recommendation">
              <span>Suggested List Price</span>
              <strong>{suggestedPrice == null ? "-" : `${formatNumber(suggestedPrice)}g`}</strong>
                <small>{suggestedWindow ? `Based on ${suggestedWindow.toLowerCase()} average` : "No completed trades in this selection"}</small>
              </div>
              <div className="deal-watch-action">
                {!authState.user ? (
                  <a className="toolbar-button" href={signInHref}><Bell size={15} /> Sign in to watch</a>
                ) : selectedWatch ? (
                  <button className="toolbar-button" type="button" disabled><CheckCircle2 size={15} /> Watching deals</button>
                ) : (
                  <button className="toolbar-button primary" type="button" onClick={addDealWatch} disabled={!activeRegion || watchBusy === "add"} title={!activeRegion ? "Choose a single region before watching an item." : "Watch this item for below-average regional sell listings."}>
                    <Bell size={15} /> {watchBusy === "add" ? "Adding..." : "Watch for deals"}
                  </button>
                )}
                <small>{activeRegion ? `${formatNumber(dealWatches.length)} / ${formatNumber(maxWatches)} watches used` : "Choose one region to watch for deals."}</small>
              </div>
            </div>
            <div className="metric-grid">
            <MiniStat icon={<Activity />} label="Last 24 Hours" value={stats.avg24h == null ? "-" : `${formatNumber(Math.round(stats.avg24h))}g`} title="Average completed-trade unit price during the last 24 hours." />
            <MiniStat icon={<TrendingUp />} label="Last 7 Days" value={stats.avg7d == null ? "-" : `${formatNumber(Math.round(stats.avg7d))}g`} />
            <MiniStat icon={<CircleDollarSign />} label="Last 30 Days" value={stats.avg30d == null ? "-" : `${formatNumber(Math.round(stats.avg30d))}g`} />
            <MiniStat icon={<ShoppingCart />} label="Trade Volume" value={formatNumber(stats.totalVolume)} />
            <MiniStat icon={<CheckCircle2 />} label="Price Confidence" value={confidence} />
          </div>
          <p className="legend">Suggested price follows the most recent available completed-trade average and is rounded to whole gold. Review recent trades and active listings before posting.</p>
          <section className="deal-watchlist-section">
            <h3><Bell size={17} /> Deal Watchlist <small>{authState.user ? `${formatNumber(dealWatches.length)} watched items` : "Discord sign-in required"}</small></h3>
            {watchState.error ? <div className="error">Deal watchlist: {watchState.error}</div> : null}
            {!authState.user ? (
              <div className="deal-watch-empty"><span>Sign in with Discord to save watched items and receive deal alerts.</span><a className="toolbar-button" href={signInHref}>Sign in with Discord</a></div>
            ) : dealWatches.length ? (
              <div className="deal-watch-list">
                {dealWatches.map((watch) => (
                  <article className="deal-watch-row" key={String(watch.id)}>
                    <ItemLabel item={{ ...watch, name: watch.itemName, tier: watch.tier, rarity: watch.rarity, iconAssetName: watch.iconAssetName }} name={String(watch.itemName ?? "Unknown item")} />
                    <div className="deal-watch-meta">
                      <span>R{watch.regionId}</span>
                      <label className="deal-watch-threshold"><span>Alert at</span><input type="number" min={1} max={95} step={1} key={String(watch.thresholdPercent)} defaultValue={Math.round(toNumber(watch.thresholdPercent) || 30)} disabled={watchBusy === String(watch.id)} onBlur={(event) => saveDealWatchThreshold(watch, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><em>% below average</em></label>
                      <span>Last checked {watch.lastCheckedAt ? timeAgo(watch.lastCheckedAt) : "not yet"}</span>
                      <span>Last alert {watch.lastAlertAt ? timeAgo(watch.lastAlertAt) : "none"}</span>
                    </div>
                    <div className="deal-watch-actions">
                      <button className="toolbar-button" type="button" disabled={watchBusy === String(watch.id)} onClick={() => updateDealWatch(watch, { enabled: !watch.enabled })}>{watch.enabled ? "Disable" : "Enable"}</button>
                      <button className="toolbar-button danger" type="button" disabled={watchBusy === String(watch.id)} onClick={() => deleteDealWatch(watch)}><X size={14} /> Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="deal-watch-empty"><span>No watched items yet. Search an item and choose a single region, then click Watch for deals.</span></div>
            )}
          </section>
          <section>
            <h3><ShoppingBag size={17} /> Recent Trades <small>{formatNumber(stats.totalTrades)} total trades</small></h3>
            <DataTable rows={recentTrades.slice(0, 15)} columns={[
              ["When", row => dateLabel(row.timestamp ?? row.createdAt)],
              ["Unit Price", row => `${formatNumber(row.unitPrice ?? row.price)}g`],
              ["Quantity", row => formatNumber(row.quantity)],
              ["Value", row => `${formatNumber(row.totalPrice ?? row.total_value ?? toNumber(row.quantity) * toNumber(row.unitPrice))}g`],
              ["Seller", row => row.sellerUsername ?? "-"],
              ["Buyer", row => row.purchaserUsername ?? row.buyerUsername ?? "-"],
            ]} />
          </section>
        </>
      ) : null}
    </section>
  );
}

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
      <div className="market-command-header price-finder-header">
        <span className="production-command-title"><ShoppingBag size={15} /> Buy order lookup</span>
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
        <div className="table-wrap">
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
export function MemberPassiveCrafts({ members, refreshToken }: { members: AnyRecord[]; refreshToken: number }) {
  const [state, setState] = React.useState<LoadState<AnyRecord[]>>({ data: null, error: null, loading: true });
  const memberKey = members.map((member) => String(member.playerEntityId ?? "")).filter(Boolean).join(",");
  React.useEffect(() => {
    if (!memberKey) {
      setState({ data: [], error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => previous.data ? { ...previous, loading: true, error: null } : { data: null, error: null, loading: true });
    const memberEntries = members.filter((member) => member.playerEntityId);
    fetch(`${LOCAL_API}/passive-crafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ members: memberEntries.map((member) => ({
        playerEntityId: member.playerEntityId,
        userName: member.userName ?? member.username,
      })) }),
      signal: controller.signal,
    }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`passive crafts HTTP ${response.status}`)))
      .then((payload) => {
      if (controller.signal.aborted) return;
      const rows = (payload.rows ?? []) as AnyRecord[];
      const failures = toNumber(payload.failed);
      setState({
        data: rows,
        error: failures ? `${failures} member${failures === 1 ? "" : "s"} could not be loaded.` : null,
        loading: false,
      });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        data: previous.data ?? [],
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      }));
    });
    return () => controller.abort();
  }, [memberKey, refreshToken]);
  const rows = state.data ?? [];
  return (
    <section className="settlement-passive-crafts">
      <div className="split-header">
        <div className="dashboard-section-heading">
          <h3><Factory size={15} /> Member Passive Crafts</h3>
          <p>Recent public passive output for current settlement members. BitJita does not report craft location, so entries may have been performed elsewhere.</p>
        </div>
        {state.loading && rows.length ? <span className="refreshing-label">Updating...</span> : null}
      </div>
      {state.error ? <p className="legend">{state.error}</p> : null}
      {state.loading && !state.data ? <p className="legend">Loading passive craft history...</p> : null}
      {!state.loading && rows.length === 0 ? <div className="empty-state"><Factory />No passive craft history reported for settlement members.</div> : null}
      {rows.length ? <DataTable rows={rows} columns={[
        ["Output", (row) => <strong>{row.recipe}</strong>],
        ["Tier", (row) => row.tier ? <TierBadge tier={row.tier} /> : "-"],
        ["Member", (row) => row.memberName],
        ["Structure", (row) => row.structure],
        ["Status", (row) => <span className={`status-pill ${row.status === "complete" ? "complete" : ""}`}>{formatEquipmentSlot(row.status)}</span>],
        ["Quantity", (row) => formatNumber(row.quantity)],
        ["Latest", (row) => timeAgo(row.timestamp)],
      ]} /> : null}
    </section>
  );
}

export function Production({ data, refreshToken, selectedMemberId, onSelectMember }: { data: ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }; refreshToken: number; selectedMemberId: string; onSelectMember: (id: string) => void }) {
  type ProductionSortKey = "tier" | "totalXp" | "remainingXp" | "remainingEffort" | "completion" | "name";
  const [sortKey, setSortKey] = usePersistedState<ProductionSortKey>("production.sort", "tier");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("production.direction", "desc");
  const [showPrivateCrafts, setShowPrivateCrafts] = usePersistedState("production.showPrivateCrafts", true);
  const [toolbeltTools, setToolbeltTools] = React.useState<AnyRecord[] | null>(null);
  const [toolbeltError, setToolbeltError] = React.useState(false);
  const toolsForMemberRef = React.useRef<string | null>(null);
  const observedCraftProgressRef = React.useRef<Map<string, number>>(new Map());
  const [observedMovingCrafts, setObservedMovingCrafts] = React.useState<Set<string>>(() => new Set());
  const itemLookup = new Map([...(data.raw?.crafts?.items ?? []), ...(data.raw?.crafts?.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const selectedMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  const selectedCitizen = selectedMember ? data.citizens.find((citizen: AnyRecord) => String(citizen.userName ?? citizen.username) === String(selectedMember.userName ?? selectedMember.username)) ?? null : null;
  const craftProgressSignature = React.useMemo(() => data.crafts.map((job: AnyRecord) => [
    craftProgressKey(job),
    toNumber(job.progress),
    toNumber(job.totalActionsRequired),
  ].join(":")).join("|"), [data.crafts]);
  React.useEffect(() => {
    const previous = observedCraftProgressRef.current;
    const next = new Map<string, number>();
    const moving = new Set<string>();
    for (const job of data.crafts) {
      const key = craftProgressKey(job);
      const progress = toNumber(job.progress);
      const total = toNumber(job.totalActionsRequired);
      const previousProgress = previous.get(key);
      if (previousProgress != null && progress > previousProgress && (!total || progress < total)) moving.add(key);
      next.set(key, progress);
    }
    observedCraftProgressRef.current = next;
    setObservedMovingCrafts(moving);
  }, [craftProgressSignature]);
  const isCraftObservedMoving = React.useCallback((job: AnyRecord) => observedMovingCrafts.has(craftProgressKey(job)), [observedMovingCrafts]);
  const isCraftWorking = React.useCallback((job: AnyRecord, contributors: AnyRecord[]) => {
    return hasRecentCraftContribution(contributors) || isCraftObservedMoving(job);
  }, [isCraftObservedMoving]);
  React.useEffect(() => {
    if (!selectedMember?.playerEntityId) {
      setToolbeltTools(null);
      setToolbeltError(false);
      toolsForMemberRef.current = null;
      return;
    }
    const controller = new AbortController();
    const memberId = String(selectedMember.playerEntityId);
    if (toolsForMemberRef.current !== memberId) {
      toolsForMemberRef.current = memberId;
      setToolbeltTools(null);
    }
    setToolbeltError(false);
    fetch(`${API}/players/${memberId}/inventories`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`inventories HTTP ${response.status}`)))
      .then((payload) => setToolbeltTools(playerToolbeltTools(payload)))
      .catch(() => { if (!controller.signal.aborted) setToolbeltError(true); });
    return () => controller.abort();
  }, [selectedMember?.playerEntityId, refreshToken]);
  function eligibility(job: AnyRecord) {
    if (!selectedMember) return null;
    const requirement = job.levelRequirements?.[0] ?? {};
    const requiredLevel = toNumber(requirement.level);
    const skillId = toNumber(requirement.skill_id);
    const skillName = SKILL_NAMES[skillId] ?? "Required skill";
    const memberLevel = toNumber(selectedCitizen?.skills?.[String(skillId)]);
    const skillOk = memberLevel >= requiredLevel;
    const toolRequirement = job.toolRequirements?.[0];
    const maxToolCraftTier = (item: AnyRecord) => toNumber(item.tier) + 1;
    const craftTier = toNumber(toolRequirement?.level);
    const expectedTool = toolRequirement ? TOOL_TAG_BY_TYPE[toNumber(toolRequirement.tool_type)] : null;
    const ownedTool = !toolRequirement ? null : (toolbeltTools ?? []).find((item) => {
      const correctType = toNumber(item.toolType) === toNumber(toolRequirement.tool_type) ||
        String(item.tags ?? item.tag ?? "") === expectedTool;
      return correctType && maxToolCraftTier(item) >= craftTier;
    });
    if (!skillOk) return { ok: false, text: `Needs ${skillName} Lv ${requiredLevel} (has ${memberLevel})` };
    if (toolbeltError && toolbeltTools == null) return { ok: false, pending: true, text: "Toolbelt unavailable" };
    if (toolRequirement && toolbeltTools == null) return { ok: false, pending: true, text: "Checking Toolbelt..." };
    if (toolRequirement && !ownedTool) return { ok: false, text: `Needs T${Math.max(1, craftTier - 1)}+ ${expectedTool ?? "required tool"} in Toolbelt` };
    return { ok: true, text: `Can craft - ${skillName} Lv ${memberLevel}${ownedTool ? ` - ${ownedTool.name} (${formatNumber(ownedTool.toolPower)} power)` : ""}` };
  }
  const privateCrafts = data.crafts.filter((job) => job.isPublic === false);
  const visibleCrafts = showPrivateCrafts ? data.crafts : data.crafts.filter((job) => job.isPublic !== false);
  const jobs = [...visibleCrafts].sort((a, b) => {
    const aMetrics = productionMetrics(a, itemLookup);
    const bMetrics = productionMetrics(b, itemLookup);
    const aValue = sortKey === "remainingEffort" ? aMetrics.remaining : aMetrics[sortKey];
    const bValue = sortKey === "remainingEffort" ? bMetrics.remaining : bMetrics[sortKey];
    const comparison = sortKey === "name"
      ? String(aValue).localeCompare(String(bValue))
      : toNumber(aValue) - toNumber(bValue);
    if (comparison !== 0) return sortDir === "asc" ? comparison : -comparison;
    const aActive = isCraftWorking(a, data.contributions[String(a.entityId)] ?? []) ? 1 : 0;
    const bActive = isCraftWorking(b, data.contributions[String(b.entityId)] ?? []) ? 1 : 0;
    return bActive - aActive || bMetrics.completion - aMetrics.completion;
  });
  const crafterCounts = visibleCrafts.reduce<Record<string, number>>((acc, job) => {
    const name = String(job.ownerUsername ?? "Unknown");
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const activeJobs = jobs.filter((job) => {
    const total = toNumber(job.totalActionsRequired);
    return total > toNumber(job.progress) && isCraftWorking(job, data.contributions[String(job.entityId)] ?? []);
  }).length;
  const totalProductionXp = jobs.reduce((sum, job) => sum + productionMetrics(job, itemLookup).totalXp, 0);
  const remainingProductionXp = jobs.reduce((sum, job) => sum + productionMetrics(job, itemLookup).remainingXp, 0);
  const highestTier = Math.max(...jobs.map((job) => productionMetrics(job, itemLookup).tier), 0);

  return (
    <div className="panel production-page">
      <header className="members-topbar production-topbar">
        <div>
          <h2>Active Production</h2>
          <p>{visibleCrafts.length === 0 ? "No active crafting jobs" : `${activeJobs} active now - ${visibleCrafts.length} jobs across ${Object.keys(crafterCounts).length} crafters`}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Factory size={14} /> {formatNumber(visibleCrafts.length)} shown</span>
            {privateCrafts.length ? <span><Lock size={14} /> {formatNumber(privateCrafts.length)} private</span> : null}
            <span>{formatNumber(Object.keys(crafterCounts).length)} crafters</span>
          </div>
          <div className="dashboard-settlement-pill">
            {highestTier ? <TierBadge tier={highestTier} /> : <span className="status-pill">No tier</span>}
            <span>Highest craft tier</span>
          </div>
        </div>
      </header>
      <div className="summary-grid production-summary">
        <MiniStat icon={<Factory />} label="Total Jobs" value={formatNumber(visibleCrafts.length)} />
        <MiniStat icon={<Activity />} label="Active Now" value={formatNumber(activeJobs)} />
        <MiniStat icon={<TrendingUp />} label="Total XP" value={formatNumber(totalProductionXp)} />
        <MiniStat icon={<Star />} label="XP Remaining" value={formatNumber(remainingProductionXp)} />
      </div>
      <div className="production-command-panel">
        <div className="production-command-main">
          <span className="production-command-title"><Wrench size={15} /> Production controls</span>
          <label className="inline-field"><span>Member</span>
            <select className="select-control" value={selectedMemberId} onChange={(event) => { onSelectMember(event.target.value); trackAnalyticsEvent("production_eligibility_filter_used", { scope: event.target.value === "All" ? "all_members" : "member" }); }}>
              <option value="All">All members</option>
              {data.members.map((member: AnyRecord) => <option key={member.playerEntityId} value={String(member.playerEntityId)}>{member.userName ?? member.username}</option>)}
            </select>
          </label>
          <label className="inline-field"><span>Sort by</span>
            <select className="select-control" value={sortKey} onChange={(event) => setSortKey(event.target.value as ProductionSortKey)}>
              <option value="tier">Tier</option>
              <option value="totalXp">Total XP</option>
              <option value="remainingXp">XP Remaining</option>
              <option value="remainingEffort">Effort Remaining</option>
              <option value="completion">Completion</option>
              <option value="name">Item Name</option>
            </select>
          </label>
          <Segmented options={["Descending", "Ascending"]} value={sortDir === "desc" ? "Descending" : "Ascending"} onChange={(direction) => setSortDir(direction === "Descending" ? "desc" : "asc")} label="Direction" />
          <label className="production-private-toggle"><span><Lock size={13} /> Show private crafts</span><input type="checkbox" checked={showPrivateCrafts} onChange={(event) => setShowPrivateCrafts(event.target.checked)} /></label>
        </div>
        {Object.keys(crafterCounts).length ? (
          <div className="production-crafter-line">
            <span>Current crafters</span>
            <div className="crafter-pills">
              {Object.entries(crafterCounts).map(([name, count]) => (
                <span key={name}>
                  <User size={12} />
                  <strong><TrackedOwnerName name={name} claim={data.claim} /></strong>
                  <small>{count}</small>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {selectedMember ? <div className="production-member-banner"><User size={15} /><span>Checking jobs for</span><strong><TrackedOwnerName name={selectedMember.userName ?? selectedMember.username} claim={data.claim} /></strong><small>Requires skill level and a suitable Toolbelt tool. A tool can craft one tier above its own tier; power controls effort per action.</small></div> : null}
      {data.crafts.length === 0 ? <div className="empty-state"><Factory />No crafting jobs are currently active.</div> : null}
      {data.crafts.length > 0 && visibleCrafts.length === 0 ? <div className="empty-state"><Lock />Private crafts are hidden by your Production controls.</div> : null}
      <div className="production-grid">
        {jobs.map((job, index) => {
          const first = job.craftedItem?.[0] ?? {};
          const { item, skillId, experiencePerEffort, total, progress, remaining, totalXp, remainingXp, tier } = productionMetrics(job, itemLookup);
          const skillName = SKILL_NAMES[skillId] ?? job.levelRequirements?.[0]?.skillName ?? (skillId ? `Skill ${skillId}` : null);
          const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
          const contributors: AnyRecord[] = data.contributions[String(job.entityId)] ?? [];
          const isWorking = total > progress && isCraftWorking(job, contributors);
          const isDone = total > 0 && progress >= total;
          const status = isWorking ? "Active now" : isDone ? "Ready" : progress > 0 ? "Paused" : "Queued";
          const eligibilityStatus = eligibility(job);
          return (
            <article className={`production-card ${isWorking ? "active-work" : ""} ${eligibilityStatus?.ok ? "can-craft" : ""}`} key={job.entityId ?? index}>
              <header>
                <div><Factory size={15} /><strong>{job.buildingName ?? "Unknown Structure"}{job.isPublic === false ? <span className="private-craft-pill" title="Private craft. BitJita returned this through member craft data with isPublic false."><Lock size={11} /> Private</span> : null}</strong><span><TrackedOwnerName name={job.ownerUsername ?? "Unknown"} claim={data.claim} /></span></div>
                <p><span className={`status-pill ${isWorking ? "working" : ""}`}>{status}</span>{skillName ? <small>{skillName} Lv {job.levelRequirements?.[0]?.level ?? 1}+</small> : null}</p>
              </header>
              <section>
                <div className={`craft-title ${item?.iconAssetName ? "has-icon" : ""}`}>{item?.iconAssetName ? <ItemIcon item={item} /> : null}<h3>{item?.name ?? (skillName ? `${skillName} craft` : `Item #${first.item_id ?? "?"}`)}</h3>{tier ? <TierBadge tier={tier} /> : null}</div>
                {!item.name && job.recipeId ? <small>recipe #{job.recipeId}</small> : null}
                <div className="work-chips">
                  <span>{formatNumber(job.craftCount)} craft{toNumber(job.craftCount) === 1 ? "" : "s"}</span>
                  <span>{formatNumber(remaining)} effort to craft</span>
                  {experiencePerEffort ? <span>{formatNumber(totalXp)} total XP</span> : null}
                </div>
                <div className="progress-meta"><span>Effort applied</span><span>{formatNumber(progress)} / {formatNumber(total)}</span></div>
                <div className={`progress ${isWorking ? "is-moving" : ""}`}><div style={{ width: `${pct}%` }} /></div>
                <div className="progress-meta"><strong>{pct}%</strong><span>{experiencePerEffort ? `${formatNumber(remainingXp)} XP remaining` : "XP not provided"}</span></div>
                {eligibilityStatus ? <div className={`eligibility-pill ${eligibilityStatus.ok ? "eligible" : eligibilityStatus.pending ? "pending" : "blocked"}`}>{eligibilityStatus.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{eligibilityStatus.text}</div> : null}
                {contributors.length ? (
                  <div className="contributors">
                    <small>Contributors</small>
                    {contributors.slice(0, 3).map((person) => (
                      <span key={person.contributorEntityId}><strong><TrackedOwnerName name={person.contributorUsername ?? "Unknown"} claim={data.claim} /></strong> {formatNumber(person.totalProgressContributed)} progress - {timeAgo(person.lastContributedAt)}</span>
                    ))}
                  </div>
                ) : <small>No contributions recorded by the API.</small>}
              </section>
            </article>
          );
        })}
      </div>
      <MemberPassiveCrafts members={data.members} refreshToken={refreshToken} />
    </div>
  );
}
