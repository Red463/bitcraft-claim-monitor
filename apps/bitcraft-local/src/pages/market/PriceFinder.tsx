import React from "react";
import { Activity, Bell, CheckCircle2, CircleDollarSign, Search, ShoppingBag, ShoppingCart, TrendingUp } from "lucide-react";

import { RarityBadge, TierBadge } from "../../components/main/Badges";
import { DataTable } from "../../components/main/DataTable";
import { ItemIcon } from "../../components/main/ItemDisplay";
import { MiniStat } from "../../components/main/Stats";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { dateLabel, formatNumber } from "../../utils/format";
import { activeRegionLabel, useActiveRegions } from "../../hooks/useActiveRegions";
import { usePersistedState } from "../../hooks/usePersistedState";
import { isMarketableItem } from "../../utils/items";
import { unique } from "../../utils/array";
import { updateQueryState } from "../../navigation";
import { trackAnalyticsEvent } from "../../utils/analytics";
import type { LoadState } from "../../types/app";

const API = "/api/bitjita";
const LOCAL_API = "/api/local";

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
      <div className="command-filter-header price-finder-header">
        <span className="command-filter-title"><Search size={15} /> Price lookup</span>
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
