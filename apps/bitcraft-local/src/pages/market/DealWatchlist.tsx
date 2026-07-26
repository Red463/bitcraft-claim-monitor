import React from "react";
import { Bell, Search, X } from "lucide-react";

import { RarityBadge, TierBadge } from "../../components/main/Badges";
import { ItemIcon, ItemLabel } from "../../components/main/ItemDisplay";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { formatNumber, timeAgo } from "../../utils/format";
import { activeRegionLabel, useActiveRegions } from "../../hooks/useActiveRegions";
import { usePersistedState } from "../../hooks/usePersistedState";
import { isMarketableItem } from "../../utils/items";
import { unique } from "../../utils/array";
import type { LoadState } from "../../types/app";
import type { MarketRefreshProps } from "./globalMarket";

const API = "/api/bitjita";
const LOCAL_API = "/api/local";

export function DealWatchlist({ monitoredRegionId, refreshSequence, refreshHeaders, trackRefresh, onDiscordLogin }: MarketRefreshProps & {
  monitoredRegionId: string;
  onDiscordLogin: (returnTo?: string) => void;
}) {
  const defaultRegion = monitoredRegionId;
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [searchState, setSearchState] = React.useState<"idle" | "loading" | "error">("idle");
  const [regionChoice, setRegionChoice] = usePersistedState("market.dealWatch.region", defaultRegion);
  const activeRegions = useActiveRegions();
  const [authState, setAuthState] = React.useState<AnyRecord>({ user: null, discordLoginEnabled: false });
  const [watchState, setWatchState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: false });
  const [watchBusy, setWatchBusy] = React.useState("");
  const [thresholdDraft, setThresholdDraft] = React.useState("30");
  const activeRegionIds = React.useMemo(() => new Set(activeRegions.map((region) => String(region.regionId))), [activeRegions]);
  const activeRegion = activeRegionIds.has(regionChoice)
    ? regionChoice
    : activeRegionIds.has(defaultRegion)
      ? defaultRegion
      : String(activeRegions[0]?.regionId ?? "");

  React.useEffect(() => {
    if (activeRegion && regionChoice !== activeRegion) setRegionChoice(activeRegion);
  }, [activeRegion, regionChoice, setRegionChoice]);

  const refreshDealWatches = React.useCallback(() => {
    const controller = new AbortController();
    setWatchState((current) => ({ ...current, error: null, loading: true }));
    trackRefresh("global-market-deal-watches", fetch(`${LOCAL_API}/market/deal-watches`, { headers: refreshHeaders, signal: controller.signal }))
      .then((response) => response.status === 401 ? { watches: [], settings: null, signedOut: true } : response.ok ? response.json() : Promise.reject(new Error(`deal watches HTTP ${response.status}`)))
      .then((payload) => setWatchState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setWatchState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, [refreshSequence]);

  React.useEffect(() => {
    const controller = new AbortController();
    trackRefresh("global-market-auth", fetch(`${LOCAL_API}/auth/me`, { headers: refreshHeaders, signal: controller.signal }))
      .then((response) => response.ok ? response.json() : { user: null, discordLoginEnabled: false })
      .then((payload) => setAuthState(payload ?? { user: null, discordLoginEnabled: false }))
      .catch(() => {
        if (!controller.signal.aborted) setAuthState({ user: null, discordLoginEnabled: false });
      });
    return () => controller.abort();
  }, [refreshSequence]);

  React.useEffect(() => refreshDealWatches(), [refreshDealWatches]);

  React.useEffect(() => {
    const defaultThreshold = toNumber(watchState.data?.settings?.thresholdPercent) || 30;
    setThresholdDraft(String(Math.round(defaultThreshold)));
  }, [watchState.data?.settings?.thresholdPercent]);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedItem?.name === query.trim()) {
      setSuggestions([]);
      setSearchState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      trackRefresh("global-market-watch-search", fetch(`${API}/market?hasOrders=true`, { headers: refreshHeaders, signal: controller.signal }))
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market search HTTP ${response.status}`)))
        .then((payload) => {
          const queryToken = query.trim().toLowerCase();
          setSuggestions((payload.data?.items ?? []).filter(isMarketableItem).filter((item: AnyRecord) => String(item.name ?? item.itemName ?? "").toLowerCase().includes(queryToken)).slice(0, 8));
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
  }, [query, refreshSequence, selectedItem?.name]);

  function chooseItem(item: AnyRecord) {
    setSelectedItem(item);
    setQuery(String(item.name));
    setSuggestions([]);
  }

  async function addDealWatch() {
    if (!selectedItem || !activeRegion) return;
    setWatchBusy("add");
    try {
      const response = await fetch(`${LOCAL_API}/market/deal-watches`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": String(authState.csrfToken ?? "") },
        body: JSON.stringify({
          regionId: activeRegion,
          itemId: selectedItem.id,
          itemType: toNumber(selectedItem.itemType),
          itemName: selectedItem.name,
          tier: selectedItem.tier ?? selectedItem.itemTier,
          rarity: selectedItem.rarityStr ?? selectedItem.rarity ?? selectedItem.itemRarityStr,
          iconAssetName: selectedItem.iconAssetName ?? selectedItem.assetName ?? selectedItem.itemIconAssetName,
          thresholdPercent: Math.min(Math.max(Number(thresholdDraft) || toNumber(watchState.data?.settings?.thresholdPercent) || 30, 1), 95),
        }),
      });
      if (response.status === 401) {
        onDiscordLogin(`${window.location.pathname}${window.location.search}`);
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `deal watch HTTP ${response.status}`);
      }
      setSelectedItem(null);
      setQuery("");
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
        headers: { "content-type": "application/json", "x-csrf-token": String(authState.csrfToken ?? "") },
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
      const response = await fetch(`${LOCAL_API}/market/deal-watches/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-csrf-token": String(authState.csrfToken ?? "") },
      });
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

  const dealWatches: AnyRecord[] = Array.isArray(watchState.data?.watches) ? watchState.data.watches : [];
  const dealSettings = watchState.data?.settings ?? {};
  const maxWatches = toNumber(dealSettings.maxWatchesPerUser) || 10;
  const regionIds = unique([
    defaultRegion,
    regionChoice !== "All" ? regionChoice : "",
    ...activeRegions.map((region) => String(region.regionId ?? "")).filter(Boolean),
  ].filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b));
  const duplicateWatch = selectedItem
    ? dealWatches.find((watch) => String(watch.regionId) === String(activeRegion) && String(watch.itemId) === String(selectedItem.id) && toNumber(watch.itemType) === toNumber(selectedItem.itemType))
    : null;

  return (
    <section className="deal-watchlist-page">
      <section className="deal-watch-add-card">
        <div className="command-filter-header">
          <span className="command-filter-title"><Bell size={15} /> Add deal watch</span>
          <span>{formatNumber(dealWatches.length)} / {formatNumber(maxWatches)} watches used</span>
        </div>
        <div className="price-finder-controls deal-watch-add-controls">
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
            <select value={activeRegion} onChange={(event) => setRegionChoice(event.target.value)}>
              {regionIds.map((regionId) => {
                const region = activeRegions.find((entry) => String(entry.regionId) === String(regionId)) ?? { regionId };
                return <option value={regionId} key={regionId}>{activeRegionLabel(region, defaultRegion)}</option>;
              })}
            </select>
          </label>
          <label className="research-filter-field deal-watch-add-threshold">
            <span>Alert threshold</span>
            <div className="unit-input"><input type="number" min={1} max={95} step={1} value={thresholdDraft} onChange={(event) => setThresholdDraft(event.target.value)} /><em>% below average</em></div>
          </label>
        </div>
        {!authState.user ? (
          <div className="deal-watch-empty"><span>Sign in with Discord to save watched items and receive deal alerts.</span><button className="toolbar-button" type="button" onClick={() => onDiscordLogin()}>Sign in with Discord</button></div>
        ) : (
          <div className="toolbar-row">
            <button className="toolbar-button primary" type="button" onClick={addDealWatch} disabled={!selectedItem || Boolean(duplicateWatch) || watchBusy === "add" || dealWatches.length >= maxWatches}>
              <Bell size={15} /> {watchBusy === "add" ? "Adding..." : "Watch item"}
            </button>
            <span className="legend">{duplicateWatch ? "This item is already watched in the selected region." : selectedItem ? `${selectedItem.name} in R${activeRegion}` : "Choose an item and region to add a watch."}</span>
          </div>
        )}
      </section>

      <section className="deal-watchlist-section">
        <h3><Bell size={17} /> Deal Watchlist <small>{authState.user ? `${formatNumber(dealWatches.length)} watched items` : "Discord sign-in required"}</small></h3>
        {watchState.error ? <div className="error">Deal watchlist: {watchState.error}</div> : null}
        {!authState.user ? (
          <div className="deal-watch-empty"><span>Sign in with Discord to save watched items and receive deal alerts.</span><button className="toolbar-button" type="button" onClick={() => onDiscordLogin()}>Sign in with Discord</button></div>
        ) : dealWatches.length ? (
          <div className="deal-watch-list">
            {dealWatches.map((watch) => (
              <article className="deal-watch-row" key={String(watch.id)}>
                <ItemLabel item={{ ...watch, name: watch.itemName, tier: watch.tier, rarity: watch.rarity, iconAssetName: watch.iconAssetName }} name={String(watch.itemName ?? "Unknown item")} />
                <div className="deal-watch-meta">
                  <div className="deal-watch-fact"><span>Region</span><strong>R{watch.regionId}</strong></div>
                  <label className="deal-watch-fact deal-watch-threshold"><span>Alert below average</span><span><input type="number" min={1} max={95} step={1} key={String(watch.thresholdPercent)} defaultValue={Math.round(toNumber(watch.thresholdPercent) || 30)} disabled={watchBusy === String(watch.id)} onBlur={(event) => saveDealWatchThreshold(watch, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><em>%</em></span></label>
                  <div className="deal-watch-fact"><span>Last checked</span><strong>{watch.lastCheckedAt ? timeAgo(watch.lastCheckedAt) : "Not yet"}</strong></div>
                  <div className="deal-watch-fact"><span>Last alert</span><strong>{watch.lastAlertAt ? timeAgo(watch.lastAlertAt) : "None"}</strong></div>
                </div>
                <div className="deal-watch-actions">
                  <button className="toolbar-button" type="button" disabled={watchBusy === String(watch.id)} onClick={() => updateDealWatch(watch, { enabled: !watch.enabled })}>{watch.enabled ? "Disable" : "Enable"}</button>
                  <button className="toolbar-button danger" type="button" disabled={watchBusy === String(watch.id)} onClick={() => deleteDealWatch(watch)}><X size={14} /> Remove</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="deal-watch-empty"><span>No watched items yet. Search an item above, choose a region, then click Watch item.</span></div>
        )}
      </section>
    </section>
  );
}
