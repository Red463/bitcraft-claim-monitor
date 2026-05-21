import { useState, useEffect, useRef, useCallback } from "react";
import { useGetClaim, useGetClaimMembers, useGetClaimBuildings, useGetClaimConstruction, useGetClaimMarketListings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { RefreshCw, Clock, Activity, Users, Building, Hammer, ShoppingCart, Coins, Trash2 } from "lucide-react";

type Snapshot = {
  timestamp: string;
  claim: Record<string, unknown>;
  members: Record<string, unknown>[];
  buildings: Record<string, unknown>[];
  construction: Record<string, unknown>[];
  market: Record<string, unknown>[];
};

type ActivityItem = {
  id: string;
  type: "member" | "building" | "construction" | "market" | "stat";
  message: string;
  timestamp: string;
  icon: "users" | "building" | "hammer" | "cart" | "coins";
};

const SNAPSHOT_KEY  = "bitcraft-snapshot-v2";
const ACTIVITY_KEY  = "bitcraft-activity-v2";
const MAX_LOG_SIZE  = 200;

function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch { return null; }
}

function saveSnapshot(snap: Snapshot) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap)); } catch { /* quota */ }
}

function loadActivityLog(): ActivityItem[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    return raw ? (JSON.parse(raw) as ActivityItem[]) : [];
  } catch { return []; }
}

function saveActivityLog(log: ActivityItem[]) {
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log)); } catch { /* quota */ }
}

function clearActivityLog() {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch { /* quota */ }
}

function diffSnapshots(prev: Snapshot, curr: Snapshot): ActivityItem[] {
  const items: ActivityItem[] = [];
  const now = new Date().toISOString();

  // Members joined / left / permissions changed
  const prevMemberIds = new Set(prev.members.map(m => String(m.entityId ?? m.username)));
  const currMemberMap = new Map(curr.members.map(m => [String(m.entityId ?? m.username), m]));
  for (const [id, m] of currMemberMap) {
    if (!prevMemberIds.has(id))
      items.push({ id: `join-${id}-${now}`, type: "member", message: `New member joined: ${m.username ?? id}`, timestamp: now, icon: "users" });
  }
  for (const pm of prev.members) {
    const id = String(pm.entityId ?? pm.username);
    const cm = currMemberMap.get(id);
    if (!cm)
      items.push({ id: `left-${id}-${now}`, type: "member", message: `Member left: ${pm.username ?? id}`, timestamp: now, icon: "users" });
    else if (pm.officerPermission !== cm.officerPermission || pm.coOwnerPermission !== cm.coOwnerPermission)
      items.push({ id: `perm-${id}-${now}`, type: "member", message: `Permissions changed for ${cm.username ?? id}`, timestamp: now, icon: "users" });
  }

  // Buildings added / removed
  const prevBldIds = new Set(prev.buildings.map(b => String(b.entityId)));
  const currBldIds = new Set(curr.buildings.map(b => String(b.entityId)));
  for (const b of curr.buildings)
    if (!prevBldIds.has(String(b.entityId)))
      items.push({ id: `build-add-${b.entityId}-${now}`, type: "building", message: `New building added: ${b.name ?? b.entityId}`, timestamp: now, icon: "building" });
  for (const b of prev.buildings)
    if (!currBldIds.has(String(b.entityId)))
      items.push({ id: `build-rem-${b.entityId}-${now}`, type: "building", message: `Building removed: ${b.name ?? b.entityId}`, timestamp: now, icon: "building" });

  // Construction started / completed
  const prevConIds = new Set(prev.construction.map(c => String(c.entityId)));
  const currConIds = new Set(curr.construction.map(c => String(c.entityId)));
  for (const c of curr.construction)
    if (!prevConIds.has(String(c.entityId)))
      items.push({ id: `con-add-${c.entityId}-${now}`, type: "construction", message: `Construction started: ${c.buildingName ?? c.entityId}`, timestamp: now, icon: "hammer" });
  for (const c of prev.construction)
    if (!currConIds.has(String(c.entityId)))
      items.push({ id: `con-done-${c.entityId}-${now}`, type: "construction", message: `Construction completed: ${c.buildingName ?? c.entityId}`, timestamp: now, icon: "hammer" });

  // Market listings added / removed
  const prevMktIds = new Set(prev.market.map(l => String(l.entityId)));
  const currMktIds = new Set(curr.market.map(l => String(l.entityId)));
  const newListings = curr.market.filter(l => !prevMktIds.has(String(l.entityId)));
  const goneListings = prev.market.filter(l => !currMktIds.has(String(l.entityId)));
  if (newListings.length === 1)
    items.push({ id: `mkt-add-${newListings[0].entityId}-${now}`, type: "market", message: `New listing: ${newListings[0].itemName ?? "item"} (${newListings[0].orderType})`, timestamp: now, icon: "cart" });
  else if (newListings.length > 1)
    items.push({ id: `mkt-add-bulk-${now}`, type: "market", message: `${newListings.length} new market listings added`, timestamp: now, icon: "cart" });
  if (goneListings.length > 0)
    items.push({ id: `mkt-rem-${now}`, type: "market", message: `${goneListings.length} market listing${goneListings.length !== 1 ? "s" : ""} removed / filled`, timestamp: now, icon: "cart" });

  // Supplies / treasury changes (only flag meaningful deltas > 0.5% to avoid noise)
  const prevSupplies = Number(prev.claim.supplies ?? 0);
  const currSupplies = Number(curr.claim.supplies ?? 0);
  const supplyDelta  = currSupplies - prevSupplies;
  if (Math.abs(supplyDelta) > 0 && prevSupplies > 0 && Math.abs(supplyDelta / prevSupplies) > 0.005)
    items.push({ id: `supplies-${now}`, type: "stat", message: `Supplies ${supplyDelta >= 0 ? "+" : ""}${supplyDelta.toLocaleString()} (now ${currSupplies.toLocaleString()})`, timestamp: now, icon: "coins" });

  const prevTreasury = Number(prev.claim.treasury ?? 0);
  const currTreasury = Number(curr.claim.treasury ?? 0);
  const treasDelta   = currTreasury - prevTreasury;
  if (Math.abs(treasDelta) > 0 && prevTreasury > 0 && Math.abs(treasDelta / prevTreasury) > 0.005)
    items.push({ id: `treasury-${now}`, type: "stat", message: `Treasury ${treasDelta >= 0 ? "+" : ""}${treasDelta.toLocaleString()}g (now ${currTreasury.toLocaleString()}g)`, timestamp: now, icon: "coins" });

  return items;
}

function IconForType({ icon }: { icon: ActivityItem["icon"] }) {
  switch (icon) {
    case "users":    return <Users    className="w-4 h-4 text-sky-400" />;
    case "building": return <Building className="w-4 h-4 text-emerald-400" />;
    case "hammer":   return <Hammer   className="w-4 h-4 text-amber-400" />;
    case "cart":     return <ShoppingCart className="w-4 h-4 text-primary" />;
    case "coins":    return <Coins    className="w-4 h-4 text-yellow-400" />;
    default:         return <Activity className="w-4 h-4 text-primary" />;
  }
}

export function ActivityPanel() {
  const queryClient = useQueryClient();

  // Persist activity log in localStorage — survives panel switches
  const [activityLog, setActivityLog] = useState<ActivityItem[]>(() => loadActivityLog());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track whether we've done the initial mount diff
  const didMountDiff = useRef(false);
  // Flag set when user triggers a manual refresh — we snapshot once data settles
  const pendingSnapshot = useRef(false);

  const { data: claim }        = useGetClaim(CLAIM_ID);
  const { data: members }      = useGetClaimMembers(CLAIM_ID);
  const { data: buildings }    = useGetClaimBuildings(CLAIM_ID);
  const { data: construction } = useGetClaimConstruction(CLAIM_ID);
  const { data: market }       = useGetClaimMarketListings(CLAIM_ID);

  const allDataReady = !!(claim && members && buildings && construction && market);

  const buildSnapshot = useCallback((): Snapshot | null => {
    if (!claim) return null;
    return {
      timestamp: new Date().toISOString(),
      claim: claim as Record<string, unknown>,
      members: (members ?? []) as Record<string, unknown>[],
      buildings: (buildings ?? []) as Record<string, unknown>[],
      construction: (construction ?? []) as Record<string, unknown>[],
      market: (market ?? []) as Record<string, unknown>[],
    };
  }, [claim, members, buildings, construction, market]);

  const compareAndSave = useCallback(() => {
    const curr = buildSnapshot();
    if (!curr) return;
    const prev = loadSnapshot();
    if (prev) {
      const diffs = diffSnapshots(prev, curr);
      if (diffs.length > 0) {
        setActivityLog(log => {
          const merged = [...diffs, ...log].slice(0, MAX_LOG_SIZE);
          saveActivityLog(merged);
          return merged;
        });
      }
    }
    saveSnapshot(curr);
  }, [buildSnapshot]);

  // Mount diff: run exactly once when all data is first available
  useEffect(() => {
    if (didMountDiff.current || !allDataReady) return;
    didMountDiff.current = true;
    compareAndSave();
  }, [allDataReady, compareAndSave]);

  // Post-refresh diff: run once after user-triggered refresh, when data has settled
  useEffect(() => {
    if (!pendingSnapshot.current || !allDataReady) return;
    pendingSnapshot.current = false;
    setIsRefreshing(false);
    compareAndSave();
  }, [claim, members, buildings, construction, market, allDataReady, compareAndSave]);

  const handleRefresh = useCallback(() => {
    pendingSnapshot.current = true;
    setIsRefreshing(true);
    setLastRefreshed(new Date());
    queryClient.invalidateQueries();
  }, [queryClient]);

  const handleClear = useCallback(() => {
    clearActivityLog();
    setActivityLog([]);
  }, []);

  const storedSnapshot = loadSnapshot();

  return (
    <div className="p-6 space-y-6" data-testid="activity-panel">
      <SectionHeader
        title="Activity & Alerts"
        description="Changes detected between visits and refreshes"
        actions={
          <div className="flex items-center gap-3">
            {activityLog.length > 0 && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border/50 rounded bg-card hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors text-muted-foreground"
                data-testid="clear-button"
              >
                <Trash2 className="w-3 h-3" />
                Clear log
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded bg-card hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-foreground"
              data-testid="refresh-button"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing…" : "Refresh Data"}
            </button>
          </div>
        }
      />

      {/* Status bar */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          {lastRefreshed
            ? `Last refreshed ${formatDistanceToNow(lastRefreshed, { addSuffix: true })}`
            : "Not yet refreshed this session"}
        </div>
        {storedSnapshot && (
          <div>
            Snapshot from {format(new Date(storedSnapshot.timestamp), "MMM d, HH:mm")}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="p-4 border border-border/50 rounded bg-card/50 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">How Activity Tracking Works</p>
        <p>On your first visit and each time you click Refresh, the current data is compared against your previous snapshot. Changes appear in the log below. The log and snapshot are saved in your browser — they persist between page switches and sessions.</p>
      </div>

      {activityLog.length === 0 ? (
        <div className="p-8 border border-border rounded bg-card text-center text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="font-serif text-base">No activity recorded yet</p>
          <p className="text-xs mt-1">Activity appears when data changes between visits. Click Refresh Data to compare against your current snapshot.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="font-serif text-primary text-sm">Change Log ({activityLog.length} events)</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {activityLog.map(item => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 border border-border/50 rounded bg-card hover:bg-secondary/20 transition-colors"
                data-testid={`activity-item-${item.id}`}
              >
                <div className="mt-0.5 shrink-0">
                  <IconForType icon={item.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{item.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 capitalize">{item.type}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
