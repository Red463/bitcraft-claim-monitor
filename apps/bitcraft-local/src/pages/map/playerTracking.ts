import type { AnyRecord } from "../../main-app-data";

export type MapPlayerFilter = "all" | "online" | "tracked" | "untracked";

export type MapPlayerTrackingRow = {
  id: string;
  name: string;
  signedIn: boolean;
  sessionSeconds: number | null;
  tracked: boolean;
};

export function mapPlayerTrackingId(player: AnyRecord): string {
  return String(player.entityId ?? player.playerEntityId ?? player.playerId ?? "").trim();
}

function mapPlayerName(player: AnyRecord): string {
  return String(player.username ?? player.userName ?? player.name ?? "Unknown player").trim() || "Unknown player";
}

export function defaultMapPlayerSelection(roster: AnyRecord[]): string[] {
  return roster
    .filter((player) => player.signedIn === true)
    .map(mapPlayerTrackingId)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function currentMapPlayerSelection(selectedIds: string[] | null, roster: AnyRecord[]): Set<string> {
  return new Set(selectedIds === null ? defaultMapPlayerSelection(roster) : selectedIds.filter(Boolean));
}

export function mapPlayerTrackingSummary(selectedIds: string[] | null, roster: AnyRecord[]): string {
  if (selectedIds === null) return `Auto: ${defaultMapPlayerSelection(roster).length} online tracked`;
  return `Manual: ${selectedIds.filter(Boolean).length} of ${roster.length} tracked`;
}

export function sortedMapPlayerRows(roster: AnyRecord[], trackedIds: Set<string>): MapPlayerTrackingRow[] {
  return roster
    .map((player) => {
      const id = mapPlayerTrackingId(player);
      return {
        id,
        name: mapPlayerName(player),
        signedIn: player.signedIn === true,
        sessionSeconds: typeof player.sessionSeconds === "number" ? player.sessionSeconds : null,
        tracked: Boolean(id && trackedIds.has(id)),
      } satisfies MapPlayerTrackingRow;
    })
    .filter((row) => Boolean(row.id))
    .sort((a, b) => Number(b.tracked) - Number(a.tracked) || Number(b.signedIn) - Number(a.signedIn) || a.name.localeCompare(b.name));
}

export function filterMapPlayerRows(rows: MapPlayerTrackingRow[], filter: MapPlayerFilter, search: string): MapPlayerTrackingRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === "online" && !row.signedIn) return false;
    if (filter === "tracked" && !row.tracked) return false;
    if (filter === "untracked" && row.tracked) return false;
    return !query || row.name.toLowerCase().includes(query);
  });
}