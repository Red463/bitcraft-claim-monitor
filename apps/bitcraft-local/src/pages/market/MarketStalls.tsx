import React from "react";
import { MapPin, Search, Store, X } from "lucide-react";

import { ItemLabel } from "../../components/main/ItemDisplay";
import { MiniStat } from "../../components/main/Stats";
import { useGameDataGeneration } from "../../hooks/useGameDataGeneration";
import { createDelayedRefreshTask } from "../../refresh/pageRefresh.mjs";
import type { AnyRecord } from "../../main-app-data";
import { formatNumber } from "../../utils/format";
import type { MapFocus } from "../map/mapUtils";
import { marketFreshnessNotice, type MarketRefreshProps } from "./globalMarket";

function positiveDecimal(value: unknown): boolean {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) && BigInt(normalized) > 0n;
}

export function MarketStalls({ claimId, regionId, onShowMap, refreshSequence, refreshHeaders, trackRefresh }: MarketRefreshProps & { claimId: string; regionId: string; onShowMap: (focus: NonNullable<MapFocus>, regionId?: string) => void }) {
  const [query, setQuery] = React.useState("");
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [state, setState] = React.useState<{ loading: boolean; error: string; data: AnyRecord | null }>({ loading: true, error: "", data: null });
  const [selectedStallKey, setSelectedStallKey] = React.useState<string | null>(null);
  const generationSequence = useGameDataGeneration(claimId, ["catalogs", "regional-market"]);

  React.useEffect(() => {
    const controller = new AbortController();
    const refresh = createDelayedRefreshTask(() => {
      const search = new URLSearchParams({
        claimId,
        regionId: regionId || "all",
        page: String(page),
        activeOnly: String(activeOnly),
      });
      if (query.trim()) search.set("q", query.trim());
      setState((current) => ({ ...current, loading: true, error: "" }));
      return fetch(`/api/local/market/stalls?${search}`, { headers: refreshHeaders, signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`stalls HTTP ${response.status}`)));
    }, 200);
    trackRefresh("global-market-stalls", refresh.promise)
      .then((payload) => {
        setState({ loading: false, error: "", data: payload });
        const returnedPage = Number(payload?.page);
        if (Number.isSafeInteger(returnedPage) && returnedPage > 0) {
          setPage((current) => current === returnedPage ? current : returnedPage);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
      });
    return () => {
      refresh.cancel();
      controller.abort();
    };
  }, [activeOnly, claimId, generationSequence, page, query, refreshSequence, regionId]);

  React.useEffect(() => setPage(1), [activeOnly, query, regionId]);
  React.useEffect(() => {
    if (!selectedStallKey) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedStallKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedStallKey]);

  const data = state.data;
  const stalls: AnyRecord[] = (Array.isArray(data?.stalls) ? data.stalls : []).map((stall: AnyRecord): AnyRecord => ({
    ...stall,
    activeOrderCount: stall.orders.filter((order: AnyRecord) => positiveDecimal(order.remainingStock)).length,
  }));
  const selectedStall = selectedStallKey
    ? stalls.find((stall: AnyRecord) => (
        `${String(stall.regionId ?? "")}:${String(stall.entityId ?? "")}` === selectedStallKey
      )) ?? null
    : null;
  const selectedOrders = selectedStall
    ? selectedStall.orders.filter((order: AnyRecord) => !activeOnly || positiveDecimal(order.remainingStock))
    : [];
  const freshnessNotice = marketFreshnessNotice(data);
  return (
    <section className="global-market-workspace market-stalls">
      <div className="market-specialized-filters">
        <label className="field market-stall-search"><span>Search stalls and offers</span><div className="input-with-icon"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Owner, stall, claim, or item" /></div></label>
        <label className="toggle-line"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /><span>Active orders only</span></label>
      </div>
      {state.error ? <div className="error">Barter Stalls unavailable: {state.error}. Last-good Relay data remains visible when available.</div> : null}
      {freshnessNotice ? <div className="info">{freshnessNotice}</div> : null}
      <div className="metric-grid market-stall-summary"><MiniStat icon={<Store />} label="Matching Stalls" value={formatNumber(data?.totalStalls)} /><MiniStat icon={<Store />} label="Active Orders" value={formatNumber(data?.totalOrders)} /></div>
      <div className="market-stall-list">
        {stalls.map((stall: AnyRecord) => <article key={stall.entityId} className="market-stall-row">
          <div className="market-stall-icon"><Store size={20} /></div>
          <div><strong>{stall.nickname || (stall.ownerName ? `${stall.ownerName}'s Stall` : `Stall ${stall.entityId}`)}</strong><span>{stall.claimName || "Unclaimed location"} · {stall.regionName || (stall.regionId ? `R${stall.regionId}` : "Unknown region")}</span><small>{stall.ownerName || "Unknown owner"} · {formatNumber(stall.activeOrderCount)} active orders{stall.locationX != null && stall.locationZ != null ? ` · X ${formatNumber(stall.locationX)}, Z ${formatNumber(stall.locationZ)}` : ""}</small></div>
          <div className="market-stall-actions"><button className="toolbar-button" onClick={() => setSelectedStallKey(`${String(stall.regionId ?? "")}:${String(stall.entityId ?? "")}`)}>View offers</button>{stall.locationX != null && stall.locationZ != null ? <button className="toolbar-button" onClick={() => onShowMap({ name: stall.nickname || stall.claimName || `Stall ${stall.entityId}`, locationX: stall.locationX ?? 0, locationZ: stall.locationZ ?? 0 }, String(stall.regionId ?? ""))}><MapPin size={14} /> Map</button> : null}</div>
        </article>)}
        {!stalls.length ? <div className="empty-state"><Store size={28} /><strong>{state.loading ? "Loading barter stalls…" : "No stalls match these filters"}</strong><span>Try another region, a broader search, or include stalls without active offers.</span></div> : null}
      </div>
      {data ? <div className="pagination-row"><span>Page {data.page} of {data.totalPages}</span><div><button className="toolbar-button" disabled={data.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button className="toolbar-button" disabled={data.page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div> : null}
      {selectedStall ? <div className="market-stall-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStallKey(null); }}>
        <section className="market-stall-modal" role="dialog" aria-modal="true" aria-labelledby="market-stall-title">
          <header><div><h2 id="market-stall-title">{selectedStall.nickname || `${selectedStall.ownerName || "Unknown"}'s Stall`}</h2><p>{selectedStall.claimName || "Unclaimed location"} · R{selectedStall.regionId ?? "?"} · {formatNumber(selectedStall.orderCount)} orders</p></div><button className="icon-button" aria-label="Close stall details" onClick={() => setSelectedStallKey(null)}><X size={18} /></button></header>
          <div className="market-stall-modal-body">{selectedOrders.length ? selectedOrders.map((order: AnyRecord) => <article className="market-stall-offer" key={order.entityId}>
            <div><span>Offers</span>{order.offers.length ? order.offers.map((entry: AnyRecord) => <ItemLabel key={`${entry.itemType}:${entry.itemId}`} item={{ ...entry, name: entry.itemName, itemType: entry.itemType === "cargo" ? 1 : 0 }} name={`${formatNumber(entry.quantity)} × ${entry.itemName}`} />) : <em>Nothing listed</em>}</div>
            <strong>for</strong>
            <div><span>Requires</span>{order.requires.length ? order.requires.map((entry: AnyRecord) => <ItemLabel key={`${entry.itemType}:${entry.itemId}`} item={{ ...entry, name: entry.itemName, itemType: entry.itemType === "cargo" ? 1 : 0 }} name={`${formatNumber(entry.quantity)} × ${entry.itemName}`} />) : <em>Nothing required</em>}</div>
            <small>{formatNumber(order.remainingStock)} remaining</small>
          </article>) : <div className="empty-state">This stall currently has no active offers.</div>}</div>
        </section>
      </div> : null}
    </section>
  );
}
