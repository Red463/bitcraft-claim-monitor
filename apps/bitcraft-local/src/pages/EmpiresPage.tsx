import React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Castle, Clock, Crown, Hammer, Landmark, MapPin, Package, RadioTower, Shield, Users, X, Zap } from "lucide-react";
import { DataTable } from "../components/main/DataTable";
import { MiniStat } from "../components/main/Stats";
import { usePersistedState } from "../hooks/usePersistedState";
import { toNumber, type AnyRecord } from "../main-app-data";
import { dateLabel, formatCompactNumber, formatNumber, timeAgo } from "../utils/format";
import { buildWatchtowerEmpireFilters, coordinateText, filterWatchtowerRows, presentWatchtowerRows } from "./empires/watchtowerPresentation";

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
  return coordinateText(row);
}

function mapHref(row: AnyRecord): string | null {
  const x = rawCoordinate(row, "x");
  const z = rawCoordinate(row, "z");
  if (x == null || z == null) return null;
  const name = `${row.displayName ?? row.nickname ?? "Watchtower"} - ${row.empireName ?? "Empire"}`;
  return `/?page=map&mapName=${encodeURIComponent(name)}&mapX=${encodeURIComponent(String(x))}&mapZ=${encodeURIComponent(String(z))}`;
}

function statusPill(active: boolean, label: string) {
  return <span className={`status-pill ${active ? "good" : "muted"}`}>{label}</span>;
}

function compactDate(value: unknown): string {
  if (!value) return "-";
  return `${timeAgo(value)} (${dateLabel(value)})`;
}

function TowerAccessDialog({ tower, onClose }: { tower: AnyRecord; onClose: () => void }) {
  const members: AnyRecord[] = Array.isArray(tower.members) ? tower.members : [];
  const [rankFilters, setRankFilters] = React.useState<string[]>([]);
  const rankOptions = React.useMemo(() => Array.from(new Set(members.map((member) => String(member.rankTitle ?? "Citizen")))).sort((a, b) => a.localeCompare(b)), [members]);
  const visibleMembers = rankFilters.length ? members.filter((member) => rankFilters.includes(String(member.rankTitle ?? "Citizen"))) : members;
  const toggleRankFilter = (rank: string) => {
    setRankFilters((current) => current.includes(rank) ? current.filter((value) => value !== rank) : [...current, rank]);
  };

  return createPortal(
    <div className="help-overlay empires-watchtower-overlay" onClick={onClose}>
      <section className="help-dialog tower-access-dialog" role="dialog" aria-modal="true" aria-labelledby="tower-access-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><RadioTower /><h2 id="tower-access-title">{tower.displayName ?? tower.nickname ?? "Watchtower"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close tower details"><X size={16} /></button>
        </header>
        <div className="tower-dialog-summary">
          <span><Landmark size={14} /> {tower.empireName ?? "Unknown empire"}</span>
          {mapHref(tower) ? <a className="toolbar-button" href={mapHref(tower) ?? "#"}><MapPin size={14} /> Open on map</a> : null}
        </div>
        <div className="tower-access-note">
          Showing all empire members BitJita reports for this empire, with last login and relevant watchtower access flags.
        </div>
        {rankOptions.length ? (
          <div className="tower-rank-filter" aria-label="Filter members by rank">
            <span>Ranks</span>
            <button type="button" className={rankFilters.length === 0 ? "active" : ""} aria-label="Show all ranks" onClick={() => setRankFilters([])}>All</button>
            {rankOptions.map((rank) => (
              <button key={rank} type="button" className={rankFilters.includes(rank) ? "active" : ""} onClick={() => toggleRankFilter(rank)}>{rank}</button>
            ))}
          </div>
        ) : null}
        <div className="tower-access-list">
          {visibleMembers.length ? visibleMembers.map((member) => (
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
          )) : <div className="empty-state compact">{members.length ? "No members match the selected ranks." : "No empire members were returned for this empire."}</div>}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function Empires({ monitoredRegionId }: { monitoredRegionId: string }) {
  const initialRegion = monitoredRegionId && /^\d+$/.test(String(monitoredRegionId)) ? String(monitoredRegionId) : "19";
  const [tab, setTab] = usePersistedState<EmpireTab>("empires.tab", "overview");
  const [regionId, setRegionId] = usePersistedState("empires.region", initialRegion);
  const [inactiveDays, setInactiveDays] = usePersistedState("empires.inactiveDays", "14");
  const [selectedWatchtowerEmpire, setSelectedWatchtowerEmpire] = usePersistedState("empires.watchtowerEmpire", "all");
  const [watchtowerRiskOnly, setWatchtowerRiskOnly] = usePersistedState("empires.watchtowerRiskOnly", false);
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
  const presentedTowerRows = React.useMemo(() => presentWatchtowerRows(towerRows), [towerRows]);
  const watchtowerEmpireFilters = React.useMemo(() => buildWatchtowerEmpireFilters(watchtowers.data?.empires ?? [], presentedTowerRows), [presentedTowerRows, watchtowers.data]);
  const visibleTowerRows = React.useMemo(() => filterWatchtowerRows(presentedTowerRows, selectedWatchtowerEmpire, watchtowerRiskOnly), [presentedTowerRows, selectedWatchtowerEmpire, watchtowerRiskOnly]);
  const selectedEmpireRiskCount = React.useMemo(() => filterWatchtowerRows(presentedTowerRows, selectedWatchtowerEmpire, true).length, [presentedTowerRows, selectedWatchtowerEmpire]);
  React.useEffect(() => {
    if (selectedWatchtowerEmpire !== "all" && watchtowerEmpireFilters.length && !watchtowerEmpireFilters.some((filter) => filter.id === selectedWatchtowerEmpire)) setSelectedWatchtowerEmpire("all");
  }, [selectedWatchtowerEmpire, setSelectedWatchtowerEmpire, watchtowerEmpireFilters]);
  const overviewSummary = overview.data?.summary ?? {};
  const towerSummary = watchtowers.data?.summary ?? {};
  const largestEmpire = overviewSummary.largestEmpireName ?? "-";
  const membersByEmpire = React.useMemo(() => {
    const map = new Map<string, AnyRecord[]>();
    for (const empire of (watchtowers.data?.empires ?? []) as AnyRecord[]) {
      map.set(String(empire.entityId ?? empire.empireId ?? ""), Array.isArray(empire.members) ? empire.members : []);
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
      const members = membersByEmpire.get(String(row.empireId ?? "")) ?? [];
      return <span className="tower-name-cell"><strong>{row.displayName ?? "Watchtower"}</strong>{row.rawNickname ? <small>{row.rawNickname}</small> : null}<small>{members.length ? `${formatNumber(members.length)} empire members` : "No members returned"}{row.shortTowerId ? ` - ${row.shortTowerId}` : ""}</small></span>;
    }],
    ["Map", (row) => {
      const href = mapHref(row);
      return href ? <a className="toolbar-button compact-map-action" href={href} onClick={(event) => event.stopPropagation()}><MapPin size={13} /> Open on map</a> : <span className="status-pill muted">No map</span>;
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
          <section className="command-filter-panel empires-watch-controls inactivity-threshold-card">
            <div className="threshold-copy">
              <strong><Clock size={15} /> Inactivity threshold</strong>
              <span>Marks leader activity as risk after this many days offline.</span>
            </div>
            <label className="field compact-field"><span>Days offline</span><input value={inactiveDays} onChange={(event) => setInactiveDays(event.target.value.replace(/\D/g, "").slice(0, 3) || "1")} /></label>
          </section>
          {watchtowers.error ? <div className="error-card"><AlertTriangle /> {watchtowers.error}</div> : null}
          {Array.isArray(watchtowers.data?.errors) && watchtowers.data.errors.length ? <div className="warning-card">Some empire tower scans failed: {watchtowers.data.errors.slice(0, 3).join("; ")}</div> : null}
          <section className="dashboard-card table-panel">
            <div className="panel-head watchtower-panel-head"><strong><RadioTower size={15} /> Claimed watchtowers</strong><span>{watchtowers.loading ? "Refreshing..." : visibleTowerRows.length === towerRows.length ? `${formatNumber(towerRows.length)} shown` : `${formatNumber(visibleTowerRows.length)} of ${formatNumber(towerRows.length)} shown`}</span></div>
            <div className="watchtower-filter-bar">
              <div className="watchtower-empire-filter" aria-label="Filter watchtowers by empire">
                {watchtowerEmpireFilters.map((filter) => (
                  <button key={filter.id} type="button" className={selectedWatchtowerEmpire === filter.id ? "active" : ""} onClick={() => setSelectedWatchtowerEmpire(filter.id)}>
                    <span>{filter.label}</span><small>{formatNumber(filter.count)}</small>
                  </button>
                ))}
              </div>
              <label className={`watchtower-risk-toggle ${watchtowerRiskOnly ? "active" : ""}`}>
                <input type="checkbox" checked={watchtowerRiskOnly} onChange={(event) => setWatchtowerRiskOnly(event.target.checked)} />
                <Shield size={14} />
                <span>At risk only</span>
                <small>{formatNumber(selectedEmpireRiskCount)}</small>
              </label>
            </div>
            <DataTable rows={visibleTowerRows} columns={towerColumns} onRowClick={(row) => setSelectedTower({ ...row, members: membersByEmpire.get(String(row.empireId ?? "")) ?? [] })} rowClassName={() => "clickable-row"} />
          </section>
        </>
      )}
      {selectedTower ? <TowerAccessDialog tower={selectedTower} onClose={() => setSelectedTower(null)} /> : null}
    </div>
  );
}

