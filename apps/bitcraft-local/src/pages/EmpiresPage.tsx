import React from "react";
import { AlertTriangle, Castle, Clock, Copy, Crown, Hammer, Landmark, MapPin, Package, RadioTower, Shield, Users, X, Zap } from "lucide-react";
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

function rawCoordinate(row: AnyRecord, axis: "x" | "z"): number | null {
  const value = axis === "x" ? row.locationX ?? row.x : row.locationZ ?? row.z;
  if (value == null || value === "") return null;
  const number = toNumber(value);
  return Number.isFinite(number) ? number : null;
}

function coordinates(row: AnyRecord): string {
  const x = rawCoordinate(row, "x");
  const z = rawCoordinate(row, "z");
  return x == null || z == null ? "-" : `${formatNumber(x, 0)}, ${formatNumber(z, 0)}`;
}

function mapHref(row: AnyRecord): string | null {
  const x = rawCoordinate(row, "x");
  const z = rawCoordinate(row, "z");
  if (x == null || z == null) return null;
  const name = `${row.nickname ?? "Watchtower"} - ${row.empireName ?? "Empire"}`;
  return `/?page=map&mapName=${encodeURIComponent(name)}&mapX=${encodeURIComponent(String(x))}&mapZ=${encodeURIComponent(String(z))}`;
}

function statusPill(active: boolean, label: string) {
  return <span className={`status-pill ${active ? "good" : "muted"}`}>{label}</span>;
}

function compactDate(value: unknown): string {
  if (!value) return "-";
  return `${timeAgo(value)} (${dateLabel(value)})`;
}

function permissionLabel(member: AnyRecord): string {
  const labels = [];
  if (member.hasStorage) labels.push("Storage");
  if (member.canAddHexite) labels.push("Can add hexite");
  return labels.join(", ") || "No relevant access";
}

function TowerAccessDialog({ tower, onClose }: { tower: AnyRecord; onClose: () => void }) {
  const accessMembers: AnyRecord[] = Array.isArray(tower.accessMembers) ? tower.accessMembers : [];
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog tower-access-dialog" role="dialog" aria-modal="true" aria-labelledby="tower-access-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><RadioTower /><h2 id="tower-access-title">{tower.nickname ?? "Watchtower"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close tower details"><X size={16} /></button>
        </header>
        <div className="tower-dialog-summary">
          <span><Landmark size={14} /> {tower.empireName ?? "Unknown empire"}</span>
          <span><MapPin size={14} /> {coordinates(tower)}</span>
          {mapHref(tower) ? <a className="toolbar-button" href={mapHref(tower) ?? "#"}><MapPin size={14} /> Open on map</a> : null}
        </div>
        <div className="tower-access-note">
          Showing empire members BitJita reports with storage access or likely claim-management access for adding hexite.
        </div>
        <div className="tower-access-list">
          {accessMembers.length ? accessMembers.map((member) => (
            <article key={member.entityId || member.username}>
              <div>
                <strong>{member.username ?? "Unknown"}</strong>
                <small>{member.rankTitle ?? "Citizen"}</small>
              </div>
              <div className="tower-access-flags">
                {member.hasStorage ? <span><Package size={13} /> Storage</span> : null}
                {member.canAddHexite ? <span><Hammer size={13} /> Add hexite</span> : null}
              </div>
              <span className={member.signedIn ? "status-pill good" : "status-pill muted"}>{member.signedIn ? "Online now" : compactDate(member.lastLoginTimestamp)}</span>
            </article>
          )) : <div className="empty-state compact">No storage or hexite-capable members were returned for this empire.</div>}
        </div>
      </section>
    </div>
  );
}

export function Empires({ monitoredRegionId }: { monitoredRegionId: string }) {
  const initialRegion = monitoredRegionId && /^\d+$/.test(String(monitoredRegionId)) ? String(monitoredRegionId) : "19";
  const [tab, setTab] = usePersistedState<EmpireTab>("empires.tab", "overview");
  const [regionId, setRegionId] = usePersistedState("empires.region", initialRegion);
  const [inactiveDays, setInactiveDays] = usePersistedState("empires.inactiveDays", "14");
  const regions = useEmpireRegions(monitoredRegionId);
  const [overview, setOverview] = React.useState<{ data: AnyRecord | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [watchtowers, setWatchtowers] = React.useState<{ data: AnyRecord | null; loading: boolean; error: string | null }>({ data: null, loading: false, error: null });
  const [selectedTower, setSelectedTower] = React.useState<AnyRecord | null>(null);

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
  const accessMembersByEmpire = React.useMemo(() => {
    const map = new Map<string, AnyRecord[]>();
    for (const empire of (watchtowers.data?.empires ?? []) as AnyRecord[]) {
      map.set(String(empire.entityId ?? empire.empireId ?? ""), Array.isArray(empire.accessMembers) ? empire.accessMembers : []);
    }
    return map;
  }, [watchtowers.data]);

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
    ["Tower", (row) => {
      const accessMembers = accessMembersByEmpire.get(String(row.empireId ?? "")) ?? [];
      return <span className="tower-name-cell"><strong>{row.nickname ?? "Watchtower"}</strong><small>{accessMembers.length ? `${formatNumber(accessMembers.length)} access members` : "No access members returned"}</small></span>;
    }],
    ["Coordinates", (row) => {
      const href = mapHref(row);
      return <span className="coordinate-cell"><MapPin size={13} /> {href ? <a href={href} onClick={(event) => event.stopPropagation()}>{coordinates(row)}</a> : coordinates(row)} <button className="icon-inline-button" type="button" title="Copy coordinates" onClick={(event) => { event.stopPropagation(); void navigator.clipboard?.writeText(coordinates(row)); }}><Copy size={13} /></button></span>;
    }],
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
          <section className="command-filter-panel empires-watch-controls">
            <strong><Clock size={15} /> Inactivity threshold</strong>
            <label className="field compact-field"><span>Days offline</span><input value={inactiveDays} onChange={(event) => setInactiveDays(event.target.value.replace(/\D/g, "").slice(0, 3) || "1")} /></label>
          </section>
          <div className="info-card empires-unclaimed-note"><AlertTriangle size={16} /> {watchtowers.data?.unclaimedMessage ?? "Unclaimed watchtowers are not exposed by the current BitJita public API."}</div>
          {watchtowers.error ? <div className="error-card"><AlertTriangle /> {watchtowers.error}</div> : null}
          {Array.isArray(watchtowers.data?.errors) && watchtowers.data.errors.length ? <div className="warning-card">Some empire tower scans failed: {watchtowers.data.errors.slice(0, 3).join("; ")}</div> : null}
          <section className="dashboard-card table-panel">
            <div className="panel-head"><strong><RadioTower size={15} /> Claimed watchtowers</strong><span>{watchtowers.loading ? "Refreshing..." : `${formatNumber(towerRows.length)} shown`}</span></div>
            <DataTable rows={towerRows} columns={towerColumns} onRowClick={(row) => setSelectedTower({ ...row, accessMembers: accessMembersByEmpire.get(String(row.empireId ?? "")) ?? [] })} rowClassName={() => "clickable-row"} />
          </section>
        </>
      )}
      {selectedTower ? <TowerAccessDialog tower={selectedTower} onClose={() => setSelectedTower(null)} /> : null}
    </div>
  );
}
