import React from "react";

import { SearchBox } from "../../components/main/SearchBox";
import type { AnyRecord } from "../../main-app-data";
import { formatCurrentSession } from "../../utils/format";
import { assignPlayerMarkerColours } from "./playerMarkerColours.mjs";
import { filterMapPlayerRows, mapPlayerTrackingSummary, sortedMapPlayerRows, type MapPlayerFilter, type MapTrackedExternalPlayer } from "./playerTracking";

type MapPlayerPanelTab = "settlement" | "all-players" | "tracked";

function PlayerColour({ colour }: { colour: string | undefined }) {
  return <span className="map-player-colour" aria-hidden="true" style={{ "--player-marker-color": colour } as React.CSSProperties} />;
}

export function MapPlayerTrackingPanel({
  roster,
  selectedIds,
  current,
  externalPlayers,
  onAutoOnline,
  onTrackOnline,
  onTrackAll,
  onTrackNone,
  onTogglePlayer,
  onRemoveExternal,
  onClearExternal,
}: {
  roster: AnyRecord[];
  selectedIds: string[] | null;
  current: Set<string>;
  externalPlayers: MapTrackedExternalPlayer[];
  onAutoOnline: () => void;
  onTrackOnline: () => void;
  onTrackAll: () => void;
  onTrackNone: () => void;
  onTogglePlayer: (id: string, tracked: boolean) => void;
  onRemoveExternal: (playerId: string) => void;
  onClearExternal: () => void;
}) {
  const [tab, setTab] = React.useState<MapPlayerPanelTab>("settlement");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<MapPlayerFilter>("all");
  const rows = React.useMemo(() => sortedMapPlayerRows(roster, current), [roster, current]);
  const visibleRows = React.useMemo(() => filterMapPlayerRows(rows, filter, search), [rows, filter, search]);
  const trackedRows = rows.filter((row) => row.tracked);
  const colourIds = [...new Set([...rows.map((row) => row.id), ...externalPlayers.map((player) => player.playerId)])].filter((id) => /^\d+$/.test(id));
  const colours = assignPlayerMarkerColours(colourIds);
  const onlineCount = rows.filter((row) => row.signedIn).length;
  const tabs: Array<{ id: MapPlayerPanelTab; label: string }> = [
    { id: "settlement", label: "Settlement" },
    { id: "all-players", label: "All players" },
    { id: "tracked", label: "Tracked" },
  ];
  const filters: Array<{ id: MapPlayerFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "online", label: "Online" },
    { id: "tracked", label: "Tracked" },
    { id: "untracked", label: "Untracked" },
  ];

  return (
    <section className="map-player-panel" aria-label="Player tracking" data-tour="map-player-tracking">
      <p className="map-player-summary">{mapPlayerTrackingSummary(selectedIds, roster)} · {onlineCount} online · {externalPlayers.length} external</p>
      <div className="map-player-primary-tabs" role="tablist" aria-label="Player sources">
        {tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      {tab === "settlement" ? <>
        <div className="map-player-presets" aria-label="Settlement tracking presets">
          <button type="button" className={selectedIds === null ? "active" : ""} onClick={onAutoOnline}>Auto</button>
          <button type="button" onClick={onTrackOnline}>Online</button>
          <button type="button" onClick={onTrackAll}>All</button>
          <button type="button" onClick={onTrackNone}>None</button>
        </div>
        <SearchBox label="Find settlement members" value={search} onChange={setSearch} placeholder="Find settlement members" />
        <div className="map-player-filter-tabs" aria-label="Settlement member filters">
          {filters.map((item) => <button type="button" className={filter === item.id ? "active" : ""} key={item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
        </div>
        <div className="map-player-list">
          {visibleRows.map((row) => <label key={row.id} className={row.tracked ? "active" : ""}>
            <input type="checkbox" checked={row.tracked} onChange={(event) => onTogglePlayer(row.id, event.target.checked)} />
            <PlayerColour colour={colours[row.id]} />
            <span><strong>{row.name}</strong><small>{row.signedIn ? `Online${formatCurrentSession(row.sessionSeconds) ? ` - ${formatCurrentSession(row.sessionSeconds)}` : ""}` : "Offline"}</small></span>
          </label>)}
          {!visibleRows.length ? <p className="legend">No settlement members match these filters.</p> : null}
        </div>
      </> : null}
      {tab === "all-players" ? <div className="map-player-global-unavailable">
        <SearchBox label="Find any BitCraft player" value="" onChange={() => {}} placeholder="Search at least 3 characters" />
        <p>Global player search is unavailable until Relay identity and coordinate verification completes.</p>
      </div> : null}
      {tab === "tracked" ? <div className="map-player-list">
        {trackedRows.map((row) => <div className="map-player-tracked-row" key={`settlement:${row.id}`}><PlayerColour colour={colours[row.id]} /><span><strong>{row.name}</strong><small>{row.signedIn ? "Settlement member · Online" : "Settlement member · Offline"}</small></span></div>)}
        {externalPlayers.map((player) => <div className="map-player-tracked-row" key={`external:${player.playerId}`}><PlayerColour colour={colours[player.playerId]} /><span><strong>{player.username}</strong><small>Offline - waiting for live position</small></span><button type="button" className="mini-action" onClick={() => onRemoveExternal(player.playerId)}>Remove</button></div>)}
        {externalPlayers.length ? <button type="button" className="toolbar-button" onClick={onClearExternal}>Clear external players</button> : null}
        {!trackedRows.length && !externalPlayers.length ? <p className="legend">No players are tracked.</p> : null}
      </div> : null}
    </section>
  );
}
