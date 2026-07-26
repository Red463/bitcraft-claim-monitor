import React from "react";
import { MapPin, Search, Store, X } from "lucide-react";

import { ItemLabel } from "../../components/main/ItemDisplay";
import { MiniStat } from "../../components/main/Stats";
import { formatNumber } from "../../utils/format";
import type { MapFocus } from "../map/mapUtils";
import { normalizeStallsPayload, type MarketRefreshProps } from "./globalMarket";
import type { AnyRecord } from "../../main-app-data";

const API = "/api/bitjita";

export function MarketStalls({ regionId, onShowMap, refreshSequence, refreshHeaders, trackRefresh }: MarketRefreshProps & { regionId: string; onShowMap: (focus: NonNullable<MapFocus>, regionId?: string) => void }) {
  const [query, setQuery] = React.useState("");
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [state, setState] = React.useState<{ loading: boolean; error: string; data: ReturnType<typeof normalizeStallsPayload> | null }>({ loading: true, error: "", data: null });
  const [selectedStall, setSelectedStall] = React.useState<AnyRecord | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const search = new URLSearchParams({ page: String(page) });
      if (query.trim()) search.set("search", query.trim());
      if (regionId) search.set("region", regionId);
      if (activeOnly) search.set("hideEmpty", "true");
      setState((current) => ({ ...current, loading: true, error: "" }));
      trackRefresh("global-market-stalls", fetch(`${API}/stalls?${search}`, { headers: refreshHeaders, signal: controller.signal }))
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`stalls HTTP ${response.status}`)))
        .then((payload) => setState({ loading: false, error: "", data: normalizeStallsPayload(payload) }))
        .catch((error) => {
          if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeOnly, page, query, refreshSequence, regionId]);

  React.useEffect(() => setPage(1), [activeOnly, query, regionId]);
  React.useEffect(() => {
    if (!selectedStall) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedStall(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedStall]);

  const data = state.data;
  const stalls = (data?.stalls ?? []).map((stall) => ({
    ...stall,
    activeOrderCount: stall.orders.filter((order: AnyRecord) => Number(order.remainingStock) > 0).length,
  }));
  const selectedOrders = selectedStall
    ? selectedStall.orders.filter((order: AnyRecord) => !activeOnly || Number(order.remainingStock) > 0)
    : [];
  return (
    <section className="global-market-workspace market-stalls">
      <div className="market-specialized-filters">
        <label className="field market-stall-search"><span>Search stalls and offers</span><div className="input-with-icon"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Owner, stall, claim, or item" /></div></label>
        <label className="toggle-line"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /><span>Active orders only</span></label>
      </div>
      {state.error ? <div className="error">Barter Stalls unavailable: {state.error}. The page will recover automatically when BitJita's JSON feed is available again.</div> : null}
      <div className="metric-grid market-stall-summary"><MiniStat icon={<Store />} label="Matching Stalls" value={formatNumber(data?.totalStalls)} /><MiniStat icon={<Store />} label="Active Orders" value={formatNumber(data?.totalOrders)} /></div>
      <div className="market-stall-list">
        {stalls.map((stall) => <article key={stall.entityId} className="market-stall-row">
          <div className="market-stall-icon"><Store size={20} /></div>
          <div><strong>{stall.nickname || (stall.ownerName ? `${stall.ownerName}'s Stall` : `Stall ${stall.entityId}`)}</strong><span>{stall.claimName || "Unclaimed location"} · {stall.regionName || (stall.regionId ? `R${stall.regionId}` : "Unknown region")}</span><small>{stall.ownerName || "Unknown owner"} · {formatNumber(stall.activeOrderCount)} active orders{stall.locationX != null && stall.locationZ != null ? ` · X ${formatNumber(stall.locationX)}, Z ${formatNumber(stall.locationZ)}` : ""}</small></div>
          <div className="market-stall-actions"><button className="toolbar-button" onClick={() => setSelectedStall(stall)}>View offers</button>{stall.locationX != null && stall.locationZ != null ? <button className="toolbar-button" onClick={() => onShowMap({ name: stall.nickname || stall.claimName || `Stall ${stall.entityId}`, locationX: stall.locationX ?? 0, locationZ: stall.locationZ ?? 0 }, String(stall.regionId ?? ""))}><MapPin size={14} /> Map</button> : null}</div>
        </article>)}
        {!stalls.length ? <div className="empty-state"><Store size={28} /><strong>{state.loading ? "Loading barter stalls…" : "No stalls match these filters"}</strong><span>Try another region, a broader search, or include stalls without active offers.</span></div> : null}
      </div>
      {data ? <div className="pagination-row"><span>Page {data.page} of {data.totalPages}</span><div><button className="toolbar-button" disabled={data.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button className="toolbar-button" disabled={data.page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div> : null}
      {selectedStall ? <div className="market-stall-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStall(null); }}>
        <section className="market-stall-modal" role="dialog" aria-modal="true" aria-labelledby="market-stall-title">
          <header><div><h2 id="market-stall-title">{selectedStall.nickname || `${selectedStall.ownerName || "Unknown"}'s Stall`}</h2><p>{selectedStall.claimName || "Unclaimed location"} · R{selectedStall.regionId ?? "?"} · {formatNumber(selectedStall.orderCount)} orders</p></div><button className="icon-button" aria-label="Close stall details" onClick={() => setSelectedStall(null)}><X size={18} /></button></header>
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
