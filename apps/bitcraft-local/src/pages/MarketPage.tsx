import React from "react";
import { Activity, Bell, CircleDollarSign, Globe2, Search, ShoppingBag, Store, TrendingUp } from "lucide-react";

import { effectiveTargetAllowed, targetIdForTab, type EffectiveAccess } from "../access/accessControl.mjs";
import { activeRegionLabel, useActiveRegions } from "../hooks/useActiveRegions";
import { usePersistedState } from "../hooks/usePersistedState";
import { toNumber, type AnyRecord } from "../main-app-data";
import { updateQueryState } from "../navigation";
import { marketViewLocation, resolveAllowedView, type GlobalMarketViewId } from "../navigation/routeState.ts";
import { useManualRefresh } from "../refresh/ManualRefreshContext";
import { manualRefreshHeaders } from "../refresh/manualRefresh.mjs";
import "../styles/market.css";
import type { ActivePanel } from "../types/app";
import type { MapFocus } from "./map/mapUtils";
import { DealWatchlist } from "./market/DealWatchlist";
import { MarketBrowse } from "./market/MarketBrowse";
import { MarketDeals } from "./market/MarketDeals";
import { MarketOverview } from "./market/MarketOverview";
import { MarketStalls } from "./market/MarketStalls";
import { marketFavoriteKeys, type MarketItemKey } from "./market/globalMarket";

const FAVORITES_KEY = "bitcraft.market.favorites.v1";

const MARKET_VIEWS = [
  { id: "overview" as const, label: "Overview", icon: Activity },
  { id: "browse" as const, label: "Browse", icon: Search },
  { id: "deals" as const, label: "Deals", icon: TrendingUp },
  { id: "buy-orders" as const, label: "Buy Orders", icon: ShoppingBag },
  { id: "deal-watch" as const, label: "Deal Watch", icon: Bell },
  { id: "stalls" as const, label: "Stalls", icon: Store },
];

export function Market({
  access,
  locationSearch,
  fallbackRegionId,
  onQueryStateChange,
  onNavigate,
  onShowMap,
  onDiscordLogin,
}: {
  access?: EffectiveAccess | null;
  locationSearch: string;
  fallbackRegionId: string;
  onQueryStateChange: () => void;
  onNavigate: (panel: ActivePanel, tab?: string) => void;
  onShowMap: (focus: NonNullable<MapFocus>, regionId?: string) => void;
  onDiscordLogin: (returnTo?: string) => void;
}) {
  const location = React.useMemo(() => marketViewLocation(new URLSearchParams(locationSearch).get("tab")), [locationSearch]);
  const { request, trackPromise } = useManualRefresh();
  const [view, setView] = usePersistedState<GlobalMarketViewId>("globalMarket.view", "overview");
  const [regionChoice, setRegionChoice] = usePersistedState("globalMarket.region", "All");
  const [favorites, setFavorites] = React.useState<MarketItemKey[]>(() => {
    try {
      return marketFavoriteKeys(window.localStorage.getItem(FAVORITES_KEY));
    } catch {
      return [];
    }
  });
  const activeRegions = useActiveRegions();
  const activeRegionIds = React.useMemo(() => new Set(activeRegions.map((region) => region.regionId)), [activeRegions]);
  const regionId = regionChoice !== "All" && activeRegionIds.has(regionChoice) ? regionChoice : "";
  const views = React.useMemo(() => MARKET_VIEWS.filter((entry) => effectiveTargetAllowed(access, targetIdForTab("market", entry.id))), [access]);
  const allowedView = resolveAllowedView(location.page === "market" ? location.view as GlobalMarketViewId : view, views.map((entry) => entry.id));
  const currentView = allowedView ?? view;
  const marketRefresh = React.useMemo(() => ({
    refreshSequence: request?.sequence ?? 0,
    refreshHeaders: manualRefreshHeaders(request, "market"),
    trackRefresh: trackPromise,
  }), [request?.id, request?.sequence, trackPromise]);

  React.useEffect(() => {
    if (location.page === "settlement-market") {
      onNavigate("settlement-market", location.canonicalTab);
      return;
    }
    if (location.shouldReplace || currentView !== location.view) {
      updateQueryState({ page: "market", tab: currentView });
      onQueryStateChange();
    }
    if (currentView !== view) setView(currentView);
  }, [currentView, location, onNavigate, onQueryStateChange, setView, view]);

  React.useEffect(() => {
    if (regionChoice !== "All" && activeRegions.length && !activeRegionIds.has(regionChoice)) setRegionChoice("All");
  }, [activeRegionIds, activeRegions.length, regionChoice, setRegionChoice]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // Favorites remain usable for this session when browser storage is blocked.
    }
  }, [favorites]);

  function selectView(next: GlobalMarketViewId) {
    setView(next);
    updateQueryState({ page: "market", tab: next }, "push");
    onQueryStateChange();
  }

  function toggleFavorite(key: MarketItemKey) {
    setFavorites((current) => current.some((entry) => entry.itemType === key.itemType && entry.itemId === key.itemId)
      ? current.filter((entry) => entry.itemType !== key.itemType || entry.itemId !== key.itemId)
      : [...current, key]);
  }

  function openItem(item: AnyRecord) {
    const itemId = toNumber(item.itemId ?? item.id);
    const itemType = item.itemType === "cargo" || toNumber(item.itemType) === 1 ? "1" : "0";
    setView("browse");
    updateQueryState({
      page: "market",
      tab: "browse",
      item: String(itemId),
      itemName: String(item.itemName ?? item.name ?? `Item ${itemId}`),
      itemType,
    }, "push");
    onQueryStateChange();
  }

  if (!allowedView) return <div className="panel restricted-access-panel"><section className="empty-state restricted-access-state"><Globe2 size={34} /><strong>Market is restricted</strong><span>No global market workspaces are available for your account.</span></section></div>;

  return (
    <div className="panel market-page global-market-page">
      <header className="members-topbar market-topbar">
        <div><h2>Market</h2><p>Global listings, demand, price intelligence and barter offers across every active region.</p></div>
        <div className="dashboard-top-meta"><div className="dashboard-settlement-pill"><Globe2 size={15} /><span>{regionId ? `Region ${regionId}` : "All active regions"}</span></div></div>
      </header>
      <section className="market-command-panel global-market-command" data-tour="market-tools">
        <div className="global-market-tabs" role="tablist" aria-label="Global market workspaces">
          {views.map((entry) => {
            const Icon = entry.icon;
            return <button role="tab" aria-selected={currentView === entry.id} className={currentView === entry.id ? "active" : ""} key={entry.id} onClick={() => selectView(entry.id)}><Icon size={15} />{entry.label}</button>;
          })}
        </div>
        <label className="field global-market-region"><span>Market region</span><select value={regionId || "All"} onChange={(event) => setRegionChoice(event.target.value)}><option value="All">All active regions</option>{activeRegions.map((region) => <option value={region.regionId} key={region.regionId}>{activeRegionLabel(region, fallbackRegionId)}</option>)}</select></label>
      </section>
      {currentView === "overview" ? <MarketOverview {...marketRefresh} regionId={regionId} favorites={favorites} onOpenItem={openItem} onShowMap={onShowMap} /> : null}
      {currentView === "browse" ? <MarketBrowse {...marketRefresh} mode="browse" regionId={regionId} favorites={favorites} onToggleFavorite={toggleFavorite} onShowMap={onShowMap} locationSearch={locationSearch} onQueryStateChange={onQueryStateChange} /> : null}
      {currentView === "deals" ? <MarketDeals {...marketRefresh} sharedRegionId={regionId} activeRegions={activeRegions} onShowMap={onShowMap} /> : null}
      {currentView === "buy-orders" ? <MarketBrowse {...marketRefresh} mode="buy" regionId={regionId} favorites={favorites} onToggleFavorite={toggleFavorite} onShowMap={onShowMap} locationSearch={locationSearch} onQueryStateChange={onQueryStateChange} /> : null}
      {currentView === "deal-watch" ? <DealWatchlist {...marketRefresh} monitoredRegionId={regionId || fallbackRegionId} onDiscordLogin={onDiscordLogin} /> : null}
      {currentView === "stalls" ? <MarketStalls {...marketRefresh} regionId={regionId} onShowMap={onShowMap} /> : null}
      <footer className="global-market-source"><CircleDollarSign size={14} /><span>Live market data is provided by BitJita. Global insight snapshots are retained locally for trend calculations.</span></footer>
    </div>
  );
}
