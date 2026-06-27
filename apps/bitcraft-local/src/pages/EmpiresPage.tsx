import React from "react";
import { AlertTriangle, Castle, Clock, Copy, Crown, Landmark, MapPin, RadioTower, Shield, Users, Zap } from "lucide-react";
import { DataTable } from "../components/main/DataTable";
import { MiniStat } from "../components/main/Stats";
import { usePersistedState } from "../hooks/usePersistedState";
import { toNumber, type AnyRecord } from "../main-app-data";
import { dateLabel, formatCompactNumber, formatNumber, timeAgo } from "../utils/format";

const LOCAL_API = "/api/local";

type EmpireTab = "overview" | "watchtowers";
type ActiveRegion = { regionId: string; regionName?: string; source?: string };

function useEmpireRegions(includeRegionId?: string): ActiveRegion[] {
  const [regions, setRegions] = React.useState<ActiveRegion[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    const include = includeRegionId && /^\d+$/.test(String(includeRegionId)) ? `?include=${encodeURIComponent(String(includeRegionId))}` : "";
    fetch(`${LOCAL_API}/regions/active${include}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`active regions HTTP ${response.status}`)))
      .then((payload) => {
        const rows = Array.isArray(payload.regions) ? payload.regions : [];
        setRegions(rows.map((region: AnyRecord) => ({
          regionId: String(region.regionId ?? ""),
          regionName: String(region.regionName ?? region.name ?? `Region ${region.regionId ?? ""}`),
          source: String(region.source ?? ""),
        })).filter((region: ActiveRegion) => /^\d+$/.test(region.regionId)));
      })
      .catch(() => {
        if (!controller.signal.aborted && includeRegionId) setRegions([{ regionId: String(includeRegionId), regionName: `Region ${includeRegionId}`, source: "fallback" }]);
      });
    return () => controller.abort();
  }, [includeRegionId]);
  return regions;
}

function regionLabel(region: ActiveRegion, monitoredRegionId?: string) {
  const suffix = String(region.regionId) === String(monitoredRegionId ?? "") ? " (settlement)" : "";
  return `R${region.regionId}${region.regionName ? ` - ${region.regionName}` : ""}${suffix}`;
}

function coordinates(row: AnyRecord): string {
  const x = row.locationX ?? row.x;
  const z = row.locationZ ?? row.z;
  return x == null || z == null ? "-" : `${formatNumber(x, 0)}, ${formatNumber(z, 0)}`;
}

function statusPill(active: boolean, label: string) {
  return <span className={`status-pill ${active ? "good" : "muted"}`}>{label}</span>;
}

function compactDate(value: unknown): string {
  if (!value) return "-";
  return `${timeAgo(value)} (${dateLabel(value)})`;
}

export function Empires({ monitoredRegionId }: { monitoredRegionId: string }) {
  const initialRegion = monitoredRegionId && /^\d+$/.test(String(monitoredRegionId)) ? String(monitoredRegionId) : "19";
  const [tab, setTab] = usePersistedState<EmpireTab>("empires.tab", "overview");
  const [regionId, setRegionId] = usePersistedState("empires.region", initialRegion);
  const [inactiveDays, setInactiveDays] = usePersistedState("empires.inactiveDays", "14");
  const regions = useEmpireRegions(monitoredRegionId);
  const [overview, setOverview] = React.useState<{ data: AnyRecord | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [watchtowers, setWatchtowers] = React.useState<{ data: AnyRecord | null; loading: boolean; error: string | null }>({ data: null, loading: false, error: null });

  React.useEffect(() => {
    if (regions.length && !regions.some((region) => region.regionId === regionId)) setRegionId(initialRegion);
  }, [initialRegion, regionId, regions, setRegionId]);

  React.useEffect(() => {
    const controller = new AbortController();
    setOverview((current) => ({ ...current, loading: true, error: null }));
    fetch(`${LOCAL_API}/empires?regionId=${encodeURIComponent(regionId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Empires HTTP ${response.status}`)))
      .then((payload) => setOverview({ data: payload, loading: false, error: null }))
      .catch((error) => {
        if (!controller.signal.aborted) setOverview((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
      });
    return () => controller.abort();
  }, [regionId]);

  React.useEffect(() => {
    if (tab !== "watchtowers") return;
    const controller = new AbortController();
    setWatchtowers((current) => ({ ...current, loading: true, error: null }));
    fetch(`${LOCAL_API}/empires/watchtowers?regionId=${encodeURIComponent(regionId)}&inactiveDays=${encodeURIComponent(inactiveDays)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Watchtowers HTTP ${response.status}`)))
      .then((payload) => setWatchtowers({ data: payload, loading: false, error: null }))
      .catch((error) => {
        if (!controller.signal.aborted) setWatchtowers((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
      });
    return () => controller.abort();
  }, [inactiveDays, regionId, tab]);

  const overviewRows: AnyRecord[] = overview.data?.empires ?? [];
  const towerRows: AnyRecord[] = watchtowers.data?.towers ?? [];
  const overviewSummary = overview.data?.summary ?? {};
  const towerSummary = watchtowers.data?.summary ?? {};
  const largestEmpire = overviewSummary.largestEmpireName ?? "-";

  const overviewColumns: Array<[string, (row: AnyRecord) => React.ReactNode]> = [
    ["Empire", (row) => <strong>{row.name}</strong>],
    ["Leader", (row) => row.leader ?? "-"],
    ["Members", (row) => formatNumber(row.memberCount)],
    ["Territory", (row) => formatNumber(row.territoryChunks)],
    ["Region claims", (row) => formatNumber(row.regionalClaims)],
    ["Treasury", (row) => formatCompactNumber(row.empireCurrencyTreasury)],
    ["Location", (row) => coordinates(row)],
    ["Updated", (row) => compactDate(row.updatedAt)],
  ];
  const towerColumns: Array<[string, (row: AnyRecord) => React.ReactNode]> = [
    ["Empire", (row) => <strong>{row.empireName}</strong>],
    ["Tower", (row) => row.nickname ?? "Watchtower"],
    ["Coordinates", (row) => <span className="coordinate-cell"><MapPin size={13} /> {coordinates(row)} <button className="icon-inline-button" type="button" title="Copy coordinates" onClick={(event) => { event.stopPropagation(); void navigator.clipboard?.writeText(coordinates(row)); }}><Copy size={13} /></button></span>],
    ["Energy", (row) => formatNumber(row.energy)],
    ["Upkeep", (row) => formatNumber(row.upkeep)],
    ["Active", (row) => statusPill(Boolean(row.active), row.active ? "Active" : "Inactive")],
    ["Siege", (row) => toNumber(row.siegeCount) > 0 ? <span className="status-pill danger">{formatNumber(row.siegeCount)} siege</span> : <span className="status-pill muted">None</span>],
    ["Leader activity", (row) => row.inactiveRisk ? <span className="status-pill warn" title={row.inactivityReason}>Risk</span> : <span className="status-pill good" title={row.lastLeaderLogin ? dateLabel(row.lastLeaderLogin) : row.inactivityReason}>OK</span>],
  ];

  return (
    <div className="panel empires-page">
      <header className="page-title-row">
        <div>
          <h2>Empires</h2>
          <p>Regional empire overview and claimed watchtower scouting.</p>
        </div>
        <div className="page-title-actions">
          <label className="field compact-field">
            <span>Region</span>
            <select className="select-control" value={regionId} onChange={(event) => setRegionId(event.target.value)}>
              {regions.length ? regions.map((region) => <option key={region.regionId} value={region.regionId}>{regionLabel(region, monitoredRegionId)}</option>) : <option value={regionId}>R{regionId}</option>}
            </select>
          </label>
        </div>
      </header>

      <div className="leaderboard-tabs empires-tabs" role="tablist" aria-label="Empire views">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><Landmark size={15} /> Overview</button>
        <button className={tab === "watchtowers" ? "active" : ""} onClick={() => setTab("watchtowers")}><RadioTower size={15} /> Watchtowers</button>
      </div>

      {tab === "overview" ? (
        <>
          <div className="stats-grid">
            <MiniStat icon={<Landmark />} label="Regional empires" value={overview.loading && !overview.data ? "..." : formatNumber(overviewSummary.empires)} />
            <MiniStat icon={<Castle />} label="Empire claims" value={formatNumber(overviewSummary.regionalClaims)} />
            <MiniStat icon={<Users />} label="Total members" value={formatNumber(overviewSummary.totalMembers)} />
            <MiniStat icon={<Crown />} label="Largest empire" value={largestEmpire} />
          </div>
          {overview.error ? <div className="error-card"><AlertTriangle /> {overview.error}</div> : null}
          <section className="dashboard-card table-panel">
            <div className="panel-head"><strong><Landmark size={15} /> Regional empires</strong><span>{overview.loading ? "Refreshing..." : `${formatNumber(overviewRows.length)} shown`}</span></div>
            <DataTable rows={overviewRows} columns={overviewColumns} />
          </section>
        </>
      ) : (
        <>
          <div className="stats-grid">
            <MiniStat icon={<RadioTower />} label="Towers found" value={watchtowers.loading && !watchtowers.data ? "..." : formatNumber(towerSummary.towerCount)} />
            <MiniStat icon={<Clock />} label="Inactive-risk empires" value={formatNumber(towerSummary.inactiveRiskEmpires)} />
            <MiniStat icon={<Shield />} label="Under siege" value={formatNumber(towerSummary.underSiege)} />
            <MiniStat icon={<Zap />} label="Active towers" value={formatNumber(towerSummary.activeTowers)} />
          </div>
          <section className="production-command-panel empires-watch-controls">
            <strong><Clock size={15} /> Inactivity threshold</strong>
            <label className="field compact-field"><span>Days offline</span><input value={inactiveDays} onChange={(event) => setInactiveDays(event.target.value.replace(/\D/g, "").slice(0, 3) || "1")} /></label>
          </section>
          <div className="info-card empires-unclaimed-note"><AlertTriangle size={16} /> {watchtowers.data?.unclaimedMessage ?? "Unclaimed watchtowers are not exposed by the current BitJita public API."}</div>
          {watchtowers.error ? <div className="error-card"><AlertTriangle /> {watchtowers.error}</div> : null}
          {Array.isArray(watchtowers.data?.errors) && watchtowers.data.errors.length ? <div className="warning-card">Some empire tower scans failed: {watchtowers.data.errors.slice(0, 3).join("; ")}</div> : null}
          <section className="dashboard-card table-panel">
            <div className="panel-head"><strong><RadioTower size={15} /> Claimed watchtowers</strong><span>{watchtowers.loading ? "Refreshing..." : `${formatNumber(towerRows.length)} shown`}</span></div>
            <DataTable rows={towerRows} columns={towerColumns} />
          </section>
        </>
      )}
    </div>
  );
}