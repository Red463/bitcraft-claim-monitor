import React from "react";
import { Activity, Bookmark, Clock3, Globe2, Search, Store, TrendingUp } from "lucide-react";

import { effectiveTargetAllowed, targetIdForTab, type EffectiveAccess } from "../access/accessControl.mjs";
import { activeRegionLabel, useActiveRegions } from "../hooks/useActiveRegions";
import { useGameDataGeneration } from "../hooks/useGameDataGeneration";
import { usePersistedState } from "../hooks/usePersistedState";
import { toNumber, type AnyRecord } from "../main-app-data";
import { updateQueryState } from "../navigation";
import { marketViewLocation, resolveAllowedView, type GlobalMarketViewId } from "../navigation/routeState.ts";
import { useManualRefresh } from "../refresh/ManualRefreshContext";
import { manualRefreshHeaders } from "../refresh/manualRefresh.mjs";
import "../styles/market.css";
import type { ActivePanel } from "../types/app";
import type { MapFocus } from "./map/mapUtils";
import { timeAgo } from "../utils/format";
import { MarketBrowse } from "./market/MarketBrowse";
import { MarketOpportunities } from "./market/MarketOpportunities";
import { MarketOverview } from "./market/MarketOverview";
import { MarketSaved } from "./market/MarketSaved";
import { MarketStalls } from "./market/MarketStalls";
import { marketFavoriteKeys, type MarketItemKey } from "./market/globalMarket";
import { nextTabIndex } from "./market/marketUi";

const FAVORITES_KEY = "bitcraft.market.favorites.v1";

const MARKET_VIEWS = [
  { id: "overview" as const, label: "Overview", icon: Activity, accessTabs: ["overview"] },
  { id: "browse" as const, label: "Browse", icon: Search, accessTabs: ["browse"] },
  { id: "opportunities" as const, label: "Opportunities", icon: TrendingUp, accessTabs: ["deals", "buy-orders"] },
  { id: "saved" as const, label: "Saved", icon: Bookmark, accessTabs: ["browse", "deal-watch"] },
  { id: "stalls" as const, label: "Stalls", icon: Store, accessTabs: ["stalls"] },
];

export function Market({
  claimId,
  access,
  locationSearch,
  fallbackRegionId,
  activeRegionScopeKey,
  onQueryStateChange,
  onNavigate,
  onShowMap,
  onDiscordLogin,
}: {
  claimId: string;
  access?: EffectiveAccess | null;
  locationSearch: string;
  fallbackRegionId: string;
  activeRegionScopeKey?: string;
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
  const [pendingWatchItem, setPendingWatchItem] = React.useState<AnyRecord | null>(null);
  const activeRegions = useActiveRegions(undefined, claimId, activeRegionScopeKey);
  const marketGeneration = useGameDataGeneration(claimId, ["catalogs", "regional-market"]);
  const [freshnessAt, setFreshnessAt] = React.useState(() => new Date().toISOString());
  const [, setFreshnessTick] = React.useState(0);
  const activeRegionIds = React.useMemo(() => new Set(activeRegions.map((region) => region.regionId)), [activeRegions]);
  const regionId = regionChoice !== "All" && activeRegionIds.has(regionChoice) ? regionChoice : "";
  const tabAllowed = React.useCallback((tab: string) => effectiveTargetAllowed(access, targetIdForTab("market", tab)), [access]);
  const views = React.useMemo(() => MARKET_VIEWS.filter((entry) => entry.accessTabs.some(tabAllowed)), [tabAllowed]);
  const allowedView = resolveAllowedView(location.page === "market" ? location.view as GlobalMarketViewId : view, views.map((entry) => entry.id));
  const currentView = allowedView ?? view;
  const marketRefresh = React.useMemo(() => ({
    refreshSequence: request?.sequence ?? 0,
    refreshHeaders: manualRefreshHeaders(request, "market"),
    trackRefresh: trackPromise,
  }), [request?.id, request?.sequence, trackPromise]);

  React.useEffect(() => setFreshnessAt(new Date().toISOString()), [marketGeneration, request?.sequence]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setFreshnessTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  function onTabsKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (!buttons.length || current < 0) return;
    event.preventDefault();
    const next = nextTabIndex(current, buttons.length, event.key);
    const nextView = views[next]?.id;
    if (nextView) selectView(nextView);
    buttons[next]?.focus();
  }

  function toggleFavorite(key: MarketItemKey) {
    setFavorites((current) => current.some((entry) => entry.itemType === key.itemType && entry.itemId === key.itemId)
      ? current.filter((entry) => entry.itemType !== key.itemType || entry.itemId !== key.itemId)
      : [...current, key]);
  }

  function openItem(item: AnyRecord) {
    const itemId = String(item.itemId ?? item.id ?? "0");
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

  function watchItem(item: AnyRecord) {
    setPendingWatchItem(item);
    selectView("saved");
  }

  if (!allowedView) return <div className="panel restricted-access-panel"><section className="empty-state restricted-access-state"><Globe2 size={34} /><strong>Market is restricted</strong><span>No global market workspaces are available for your account.</span></section></div>;

  return (
    <div className="panel market-page global-market-page">
      <header className="members-topbar market-topbar">
        <div><h2>Market</h2><p>Global listings, demand, price intelligence and barter offers across every active region.</p></div>
      </header>
      <section className="market-command-panel global-market-command" data-tour="market-tools">
        <div className="global-market-tabs" role="tablist" aria-label="Global market workspaces" onKeyDown={onTabsKeyDown}>
          {views.map((entry) => {
            const Icon = entry.icon;
            return <button id={`market-tab-${entry.id}`} role="tab" aria-selected={currentView === entry.id} aria-controls={`market-panel-${entry.id}`} tabIndex={currentView === entry.id ? 0 : -1} className={currentView === entry.id ? "active" : ""} key={entry.id} onClick={() => selectView(entry.id)}><Icon size={15} />{entry.label}</button>;
          })}
        </div>
        <div className="global-market-toolbar-meta"><span className="global-market-freshness"><Clock3 size={13} /> Updated {timeAgo(freshnessAt)}</span><label className="field global-market-region"><span>Market region</span><select value={regionId || "All"} onChange={(event) => setRegionChoice(event.target.value)}><option value="All">All active regions</option>{activeRegions.map((region) => <option value={region.regionId} key={region.regionId}>{activeRegionLabel(region, fallbackRegionId)}</option>)}</select></label></div>
      </section>
      {currentView === "overview" ? <div id="market-panel-overview" role="tabpanel" aria-labelledby="market-tab-overview"><MarketOverview {...marketRefresh} claimId={claimId} regionId={regionId} favorites={favorites} onOpenItem={openItem} /></div> : null}
      {currentView === "browse" ? <div id="market-panel-browse" role="tabpanel" aria-labelledby="market-tab-browse"><MarketBrowse {...marketRefresh} claimId={claimId} mode="browse" regionId={regionId} favorites={favorites} onToggleFavorite={toggleFavorite} canWatch={tabAllowed("deal-watch")} onWatchItem={watchItem} onShowMap={onShowMap} locationSearch={locationSearch} onQueryStateChange={onQueryStateChange} /></div> : null}
      {currentView === "opportunities" ? <MarketOpportunities {...marketRefresh} claimId={claimId} regionId={regionId} activeRegions={activeRegions} canViewRoutes={tabAllowed("deals")} canViewDemand={tabAllowed("buy-orders")} locationSearch={locationSearch} onQueryStateChange={onQueryStateChange} /> : null}
      {currentView === "saved" ? <MarketSaved {...marketRefresh} claimId={claimId} monitoredRegionId={regionId} favorites={favorites} canViewFavorites={tabAllowed("browse")} canViewWatches={tabAllowed("deal-watch")} initialWatchItem={pendingWatchItem} onWatchItemConsumed={() => setPendingWatchItem(null)} onOpenItem={openItem} onDiscordLogin={onDiscordLogin} /> : null}
      {currentView === "stalls" ? <div id="market-panel-stalls" role="tabpanel" aria-labelledby="market-tab-stalls"><MarketStalls {...marketRefresh} claimId={claimId} regionId={regionId} onShowMap={onShowMap} /></div> : null}
    </div>
  );
}
