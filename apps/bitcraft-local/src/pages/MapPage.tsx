import React from "react";
import "../styles/map.css";
import { ExternalLink, MapPin, PanelLeftClose, PanelLeftOpen, Search, Users, X } from "lucide-react";

import { TierBadge } from "../components/main/Badges";
import { Dialog } from "../components/main/Dialog";
import { SearchBox } from "../components/main/SearchBox";
import { toNumber, unwrap, type AnyRecord } from "../main-app-data";
import { formatCurrentSession, formatNumber } from "../utils/format";
import { activeRegionLabel, useActiveRegions } from "../hooks/useActiveRegions";
import { usePersistedState } from "../hooks/usePersistedState";
import { gameIconUrl } from "../utils/items";
import { memberDisplayName, memberTrackingId } from "../utils/memberIdentity";
import { normalizeData } from "../utils/normalize";
import { unique } from "../utils/array";
import { updateQueryState } from "../navigation";
import { bitcraftMapUrl, mapEmbedSignature, mapResourceCategory, mapResourceToken, normalizeMapResourceToken, parseBitcraftMapUrl, type MapFocus } from "./map/mapUtils";
import { currentMapPlayerSelection, defaultMapPlayerSelection, filterMapPlayerRows, mapPlayerTrackingId, mapPlayerTrackingSummary, sortedMapPlayerRows, type MapPlayerFilter } from "./map/playerTracking";

const LOCAL_API = "/api/local";
const FRAME_TIMEOUT_MS = 12000;
type FrameState = "loading" | "ready" | "timed-out" | "failed";

function MapPlayerTrackingControls({
  roster,
  selectedIds,
  current,
  onAutoOnline,
  onTrackOnline,
  onTrackAll,
  onTrackNone,
  onTogglePlayer,
  onClearFilters,
}: {
  roster: AnyRecord[];
  selectedIds: string[] | null;
  current: Set<string>;
  onAutoOnline: () => void;
  onTrackOnline: () => void;
  onTrackAll: () => void;
  onTrackNone: () => void;
  onTogglePlayer: (id: string, tracked: boolean) => void;
  onClearFilters: () => void;
}) {
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<MapPlayerFilter>("all");
  const rows = React.useMemo(() => sortedMapPlayerRows(roster, current), [roster, current]);
  const visibleRows = React.useMemo(() => filterMapPlayerRows(rows, filter, search), [rows, filter, search]);
  const summary = mapPlayerTrackingSummary(selectedIds, roster);
  const trackedCount = current.size;
  const onlineCount = roster.filter((player) => player.signedIn === true).length;
  const filterTabs: Array<{ key: MapPlayerFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "online", label: "Online" },
    { key: "tracked", label: "Tracked" },
    { key: "untracked", label: "Untracked" },
  ];

  return (
    <section className="map-player-tracking" aria-label="Player tracking" data-tour="map-player-tracking">
      <div className="map-player-tracking-summary">
        <Users size={16} />
        <div>
          <strong>Player Tracking</strong>
          <span>{summary}</span>
        </div>
      </div>
      <div className="map-player-tracking-actions">
        <button className={selectedIds === null ? "active" : ""} onClick={onAutoOnline}>Auto online</button>
        <button className={trackedCount === roster.length && roster.length > 0 ? "active" : ""} onClick={onTrackAll}>All</button>
        <button className={trackedCount === 0 ? "active" : ""} onClick={onTrackNone}>None</button>
        <button onClick={() => setManagerOpen(true)}>Manage</button>
        <button onClick={onClearFilters}>Clear filters</button>
      </div>
      {managerOpen ? (
        <Dialog open title="Manage players" onClose={() => setManagerOpen(false)} className="map-player-dialog" backdropClassName="map-player-dialog-overlay">
            <header>
              <div>
                <h3>Manage players</h3>
                <p>{trackedCount} tracked, {onlineCount} online, {roster.length} total</p>
              </div>
              <button className="icon-button" onClick={() => setManagerOpen(false)} aria-label="Close player manager"><X size={15} /></button>
            </header>
            <div className="map-player-bulk-actions">
              <button onClick={onTrackOnline}>Track online</button>
              <button onClick={onTrackAll}>Track all</button>
              <button onClick={onTrackNone}>Track none</button>
              <button onClick={onAutoOnline}>Reset to auto</button>
            </div>
            <div className="map-player-manager-controls">
              <div className="map-player-tabs" role="tablist" aria-label="Player filters">
                {filterTabs.map((tab) => <button key={tab.key} className={filter === tab.key ? "active" : ""} onClick={() => setFilter(tab.key)}>{tab.label}</button>)}
              </div>
              <SearchBox label="Find tracked members" value={search} onChange={setSearch} placeholder="Find members" />
            </div>
            <div className="map-player-list">
              {visibleRows.map((row) => (
                <label key={row.id} className={row.tracked ? "active" : ""}>
                  <input type="checkbox" checked={row.tracked} onChange={(event) => onTogglePlayer(row.id, event.target.checked)} />
                  <span className={`online-dot ${row.signedIn ? "is-online" : ""}`} />
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.signedIn ? `Online${formatCurrentSession(row.sessionSeconds) ? ` - ${formatCurrentSession(row.sessionSeconds)}` : ""}` : "Offline"}</small>
                  </span>
                </label>
              ))}
              {!visibleRows.length ? <p className="legend">No members match these filters.</p> : null}
            </div>
        </Dialog>
      ) : null}
    </section>
  );
}
export function MapPanel({ data, focus, onClearFocus }: { data: ReturnType<typeof normalizeData>; focus: MapFocus; onClearFocus: () => void }) {
  const [selectedIds, setSelectedIds] = usePersistedState<string[] | null>("map.players", null);
  const [selectedResources, setSelectedResources] = usePersistedState<string[]>("map.resources", []);
  const [resourceSearch, setResourceSearch] = usePersistedState("map.resource-search", "");
  const [resourceTier, setResourceTier] = usePersistedState("map.resource-tier", "All");
  const [resourceCategory, setResourceCategory] = usePersistedState("map.resource-category", "All");
  const [resourceRegions, setResourceRegions] = usePersistedState<string[]>("map.regions", data.claim.regionId != null ? [String(data.claim.regionId)] : []);
  const [resourcePanelCollapsed, setResourcePanelCollapsed] = usePersistedState("map.resource-finder-collapsed", false);
  const [resources, setResources] = React.useState<AnyRecord[]>([]);
  const [resourceError, setResourceError] = React.useState("");
  const [, setMapUrlLog] = usePersistedState<AnyRecord[]>("diagnostics.mapUrlLog", []);
  const memberRoster = React.useMemo(() => {
    const detailById = new Map(data.players
      .map((player) => [String(player.entityId ?? player.playerEntityId ?? player.playerId ?? ""), player] as const)
      .filter(([id]) => Boolean(id)));
    const rows: AnyRecord[] = data.members.map((member) => {
      const playerId = memberTrackingId(member);
      const detail = detailById.get(playerId);
      return {
        ...(detail ?? {}),
        ...member,
        entityId: playerId,
        playerEntityId: playerId,
        username: detail?.username ?? detail?.userName ?? memberDisplayName(member),
        userName: detail?.userName ?? detail?.username ?? memberDisplayName(member),
        signedIn: detail?.signedIn === true,
        sessionSeconds: detail?.sessionSeconds ?? null,
        detailAvailable: detail ? detail.detailAvailable !== false : false,
        detailError: detail?.detailError,
      };
    });
    const memberIds = new Set(rows.map((player) => String(player.entityId)).filter(Boolean));
    for (const player of data.players) {
      const playerId = String(player.entityId ?? player.playerEntityId ?? player.playerId ?? "");
      if (playerId && !memberIds.has(playerId)) rows.push({ ...player, entityId: playerId, playerEntityId: playerId });
    }
    return rows;
  }, [data.members, data.players]);
  const roster = memberRoster;
  const rawData = (data as ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }).raw;
  const playerDetailDiagnostics = rawData?.playerDetailDiagnostics ?? {};
  const degradedPlayerCount = roster.filter((player) => player.detailAvailable === false).length;
  const rosterSource = degradedPlayerCount ? "members + partial detail" : roster.length ? "members + player detail" : "empty";
  const activeRegions = useActiveRegions(String(data.claim.regionId ?? ""));
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${LOCAL_API}/map/catalog`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`map catalog HTTP ${response.status}`)))
      .then((catalogPayload) => {
        const resourceRows: AnyRecord[] = unwrap<AnyRecord[]>(catalogPayload, "resources", [])
          .filter((resource) => resource?.id != null && resource?.name)
          .map((resource) => ({ ...resource, mapKind: "resource", mapId: String(resource.id), mapSortOrder: toNumber(resource.id) }));
        const creatureRows: AnyRecord[] = unwrap<AnyRecord[]>(catalogPayload, "creatures", [])
          .filter((creature) => creature?.enemyType != null && creature?.name && (creature.huntable === true || String(creature.tag ?? "").toLowerCase().includes("animal")))
          .map((creature) => ({ ...creature, id: `enemy:${creature.enemyType}`, mapKind: "enemy", mapId: String(creature.enemyType), mapSortOrder: 100000 + toNumber(creature.enemyType), tag: "Huntable Animal" }));
        setResources([...resourceRows, ...creatureRows].sort((a, b) => toNumber(a.mapSortOrder) - toNumber(b.mapSortOrder) || String(a.name).localeCompare(String(b.name))));
        setResourceError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResourceError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, []);
  const current = React.useMemo(() => currentMapPlayerSelection(selectedIds, roster), [selectedIds, roster]);
  const defaultFocus = data.claim.locationX != null && data.claim.locationZ != null ? {
    name: data.claim.name ?? "Monitored settlement",
    locationX: toNumber(data.claim.locationX),
    locationZ: toNumber(data.claim.locationZ),
  } : null;
  const normalizedSelectedResources = React.useMemo(() => selectedResources.map(normalizeMapResourceToken).filter(Boolean), [selectedResources]);
  const resourceByToken = React.useMemo(() => new Map(resources.map((resource) => [mapResourceToken(resource), resource])), [resources]);
  const resourceCategories = React.useMemo(() => unique(resources.map(mapResourceCategory).filter(Boolean)).sort((a, b) => a.localeCompare(b)), [resources]);
  const resourceTiers = React.useMemo(() => unique(resources.map((resource) => String(resource.tier ?? "")).filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b)), [resources]);
  const regionOptions = React.useMemo(() => unique([
    ...activeRegions.map((region) => String(region.regionId ?? "")),
    String(data.claim.regionId ?? ""),
    ...data.regionStatus.map((region) => String(region.regionId ?? "")),
  ].filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b)), [activeRegions, data.claim.regionId, data.regionStatus]);
  const mapMarker = focus ?? defaultFocus;
  const mapRegionIds = resourceRegions.length ? resourceRegions : regionOptions;
  const selectedResourceIds = React.useMemo(() => normalizedSelectedResources.filter((token) => token.startsWith("resource:")).map((token) => token.slice("resource:".length)), [normalizedSelectedResources]);
  const selectedEnemyIds = React.useMemo(() => normalizedSelectedResources.filter((token) => token.startsWith("enemy:")).map((token) => token.slice("enemy:".length)), [normalizedSelectedResources]);
  const currentPlayerIds = React.useMemo(() => [...current].sort(), [current]);
  const currentPlayerIdsKey = currentPlayerIds.join(",");
  const mapSignature = React.useMemo(() => mapEmbedSignature({
    playerIds: currentPlayerIds,
    mapMarker,
    flyTo: Boolean(focus),
    resourceIds: selectedResourceIds,
    regionIds: mapRegionIds,
    enemyIds: selectedEnemyIds,
  }), [currentPlayerIdsKey, focus, mapMarker, selectedResourceIds.join(","), selectedEnemyIds.join(","), mapRegionIds.join(",")]);
  const mapUrl = React.useMemo(() => bitcraftMapUrl(currentPlayerIds, mapMarker, Boolean(focus), selectedResourceIds, mapRegionIds, selectedEnemyIds), [mapSignature]);
  const [currentFrameUrl, setCurrentFrameUrl] = React.useState(mapUrl);
  const [frameState, setFrameState] = React.useState<FrameState>("loading");
  const [frameAttempt, setFrameAttempt] = React.useState(0);
  React.useEffect(() => {
    setCurrentFrameUrl((previousUrl) => previousUrl === mapUrl ? previousUrl : mapUrl);
  }, [mapSignature, mapUrl]);
  React.useEffect(() => {
    setFrameState("loading");
    const timeout = window.setTimeout(() => setFrameState((current) => current === "loading" ? "timed-out" : current), FRAME_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [currentFrameUrl, frameAttempt]);
  React.useEffect(() => {
    const parsed = parseBitcraftMapUrl(currentFrameUrl);
    setMapUrlLog((currentLog) => [{
      at: new Date().toISOString(),
      rosterSource,
      rosterCount: roster.length,
      memberCount: data.members.length,
      playerDetailCount: data.players.length,
      playerDetailRequested: playerDetailDiagnostics.requested ?? roster.length,
      playerDetailFailed: playerDetailDiagnostics.failed ?? degradedPlayerCount,
      selectedMode: selectedIds === null ? "auto-online" : "manual",
      selectedPlayerIds: currentPlayerIds,
      playerIdParam: parsed.playerId ?? "",
      resourceIdParam: parsed.resourceId ?? "",
      enemyIdParam: parsed.enemyId ?? "",
      regionIdParam: parsed.regionId ?? "",
      hasWaypoint: Boolean(parsed.hasWaypoint),
      url: currentFrameUrl,
    }, ...currentLog].slice(0, 20));
  }, [currentFrameUrl, mapSignature, rosterSource, roster.length, selectedIds, currentPlayerIdsKey]);
  const focusKey = focus ? `${focus.name}:${focus.locationX}:${focus.locationZ}` : "";
  React.useEffect(() => {
    if (focus) updateQueryState({ label: focus.name, x: String(focus.locationX), z: String(focus.locationZ), regionId: focus.regionId ?? null, mapName: null, mapX: null, mapZ: null });
  }, [focusKey]);
  const visibleResources = React.useMemo(() => {
    const query = resourceSearch.trim().toLowerCase();
    return resources.filter((resource) => {
      const name = String(resource.name ?? "");
      const tag = mapResourceCategory(resource);
      if (query && !`${name} ${tag}`.toLowerCase().includes(query)) return false;
      if (resourceTier !== "All" && String(resource.tier ?? "") !== resourceTier) return false;
      if (resourceCategory !== "All" && tag !== resourceCategory) return false;
      return true;
    }).sort((a, b) => {
      if (resourceCategory !== "All") return toNumber(a.tier) - toNumber(b.tier) || String(a.name).localeCompare(String(b.name));
      return toNumber(a.mapSortOrder) - toNumber(b.mapSortOrder) || String(a.name).localeCompare(String(b.name));
    });
  }, [resources, resourceSearch, resourceTier, resourceCategory]);
  function setResourceRegion(value: string) {
    setResourceRegions(value === "All" ? [] : [value]);
  }
  function setManualPlayers(ids: string[]) {
    setSelectedIds([...new Set(ids.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  }
  function trackOnlinePlayers() {
    setManualPlayers(defaultMapPlayerSelection(roster));
  }
  function trackAllPlayers() {
    setManualPlayers(roster.map(mapPlayerTrackingId));
  }
  function trackNoPlayers() {
    setSelectedIds([]);
  }
  function togglePlayerTracking(id: string, tracked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev === null ? defaultMapPlayerSelection(roster) : prev.filter(Boolean));
      if (tracked) next.add(id);
      else next.delete(id);
      return [...next].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
  }
  function toggleResource(token: string) {
    const normalizedToken = normalizeMapResourceToken(token);
    setSelectedResources((prev) => {
      const next = new Set(prev.map(normalizeMapResourceToken).filter(Boolean));
      if (next.has(normalizedToken)) next.delete(normalizedToken);
      else next.add(normalizedToken);
      return [...next].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
  }
  function resetMapFilters() {
    setSelectedIds(null);
    setSelectedResources([]);
    setResourceSearch("");
    setResourceTier("All");
    setResourceCategory("All");
    setResourceRegions(data.claim.regionId != null ? [String(data.claim.regionId)] : []);
    onClearFocus();
  }
  const onlineCount = roster.filter((player) => player.signedIn).length;
  return (
    <div className={`panel map-panel full-height ${focus ? "has-focus" : ""}`}>
      <header className="members-topbar map-topbar">
        <div>
          <h2>World Map</h2>
          <p>Live player and resource tracking via bitcraftmap.com</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Users size={14} /> {formatNumber(onlineCount)} online</span>
            <span>{formatNumber(roster.length)} members total</span>
          </div>
          <a className="toolbar-button" href={currentFrameUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open full map</a>
        </div>
      </header>
      {focus ? (
        <div className="map-focus">
          <MapPin size={17} />
          <div><strong>{focus.name}</strong><span>{focus.locationX}, {focus.locationZ}</span></div>
          <button className="mini-action" onClick={onClearFocus}>Clear</button>
        </div>
      ) : null}
      <MapPlayerTrackingControls
        roster={roster}
        selectedIds={selectedIds}
        current={current}
        onAutoOnline={() => setSelectedIds(null)}
        onTrackOnline={trackOnlinePlayers}
        onTrackAll={trackAllPlayers}
        onTrackNone={trackNoPlayers}
        onTogglePlayer={togglePlayerTracking}
        onClearFilters={resetMapFilters}
      />
      <div className={`map-workspace ${resourcePanelCollapsed ? "resources-collapsed" : ""}`}>
        <aside className={`map-resource-panel ${resourcePanelCollapsed ? "collapsed" : ""}`}>
          <div className="map-resource-heading">
            <Search size={16} />
            <div><strong>Resource Finder</strong><span>{selectedResources.length ? `${formatNumber(selectedResources.length)} tracked` : "Track resources on the map"}</span></div>
            <button className="icon-button" type="button" onClick={() => setResourcePanelCollapsed((current) => !current)} title={resourcePanelCollapsed ? "Expand resource finder" : "Collapse resource finder"} aria-label={resourcePanelCollapsed ? "Expand resource finder" : "Collapse resource finder"}>
              {resourcePanelCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
          {!resourcePanelCollapsed ? <><div className="map-resource-controls">
            <label className="field"><span>Region</span><select className="select-control map-region-select" value={resourceRegions.length === 1 ? resourceRegions[0] : "All"} onChange={(event) => setResourceRegion(event.target.value)}><option value="All">All regions</option>{regionOptions.map((id) => {
              const region = activeRegions.find((entry) => String(entry.regionId) === String(id)) ?? data.regionStatus.find((entry) => String(entry.regionId) === String(id)) ?? { regionId: id };
              return <option key={id} value={id}>{activeRegionLabel({ ...region, regionId: String(region.regionId ?? id) }, String(data.claim.regionId ?? ""))}</option>;
            })}</select></label>
            <label className="field"><span>Tier</span><select className="select-control" value={resourceTier} onChange={(event) => setResourceTier(event.target.value)}><option>All</option>{resourceTiers.map((tier) => <option key={tier}>{tier}</option>)}</select></label>
            <label className="field"><span>Category</span><select className="select-control" value={resourceCategory} onChange={(event) => setResourceCategory(event.target.value)}><option>All</option>{resourceCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <SearchBox label="Find map resources" value={resourceSearch} onChange={setResourceSearch} placeholder="Find resources" />
          </div>
          {selectedResources.length ? (
            <div className="map-selected-resources">
              {selectedResources.map((id) => {
                const token = normalizeMapResourceToken(id);
                const resource = resourceByToken.get(token);
                return <button key={id} onClick={() => toggleResource(id)}>{resource?.name ?? `Resource ${id}`}<X size={12} /></button>;
              })}
            </div>
          ) : null}
          {resourceError ? <div className="error">Resources unavailable: {resourceError}</div> : null}
          <div className="map-resource-list">
            {visibleResources.map((resource) => {
              const id = mapResourceToken(resource);
              const active = normalizedSelectedResources.includes(id);
              const iconUrl = gameIconUrl(resource);
              return <button key={id} className={active ? "active" : ""} onClick={() => toggleResource(id)}>
                <span className="map-resource-icon">{iconUrl ? <img src={iconUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <MapPin size={15} />}</span>
                <strong>{resource.name}</strong>
                {resource.tier != null ? <TierBadge tier={resource.tier} /> : null}
                <small>{resource.mapKind === "enemy" ? "Animal" : mapResourceCategory(resource) || resource.tag || "Resource"}</small>
              </button>;
            })}
            {!visibleResources.length ? <p className="legend">{resources.length ? "No resources match these filters." : "Loading resources from BitJita..."}</p> : null}
          </div></> : null}
        </aside>
        <div className={`map-frame-host is-${frameState}`}>
          <iframe key={frameAttempt} className="map-frame" src={currentFrameUrl} title="BitCraft World Map" onLoad={() => setFrameState("ready")} onError={() => setFrameState("failed")} />
          {frameState !== "ready" ? (
            <section className="map-frame-state" aria-live="polite">
              <strong>{frameState === "loading" ? "Loading embedded map..." : frameState === "timed-out" ? "The embedded map is taking longer than expected." : "The embedded map could not be loaded."}</strong>
              <span>{frameState === "loading" ? "The map will appear here when the external host responds." : "You can retry the embed or open the full page. This does not affect Claim Monitor data."}</span>
              {frameState !== "loading" ? <div><button className="toolbar-button primary" onClick={() => setFrameAttempt((current) => current + 1)}>Retry</button><a className="toolbar-button" href={currentFrameUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open full page</a></div> : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

