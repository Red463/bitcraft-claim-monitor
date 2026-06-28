import React from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Box,
  Building2,
  Calculator,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  Clock,
  Crown,
  Database,
  ExternalLink,
  Factory,
  FileText,
  Globe2,
  GraduationCap,
  Hammer,
  Lock,
  Map as MapIcon,
  MapPin,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  RefreshCw,
  Save,
  Search,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  User,
  Wrench,
  X,
} from "lucide-react";

import { DashboardCardHeader, DashboardMetric, DashboardTrend } from "../components/main/DashboardWidgets";
import { RarityBadge, TierBadge, TrackedOwnerName } from "../components/main/Badges";
import { DataTable } from "../components/main/DataTable";
import { ItemIcon, ItemLabel, TierMaterialIcon } from "../components/main/ItemDisplay";
import { SearchBox } from "../components/main/SearchBox";
import { Segmented } from "../components/main/Segmented";
import { Info, MiniStat, Stat } from "../components/main/Stats";
import {
  buildConstructionProjects,
  claimSupplyCap,
  claimSupplyRunOutAt,
  parseDateValue,
  toNumber,
  unwrap,
  type AnyRecord,
} from "../main-app-data";
import {
  dateLabel,
  formatCompactNumber,
  formatCurrentSession,
  formatDaysAndHours,
  formatDuration,
  formatEquipmentSlot,
  formatNumber,
  formatPlaytime,
  shortDateLabel,
  timeAgo,
  timestampMs,
} from "../utils/format";
import { mapWithBrowserConcurrency } from "../utils/concurrency";
import { hasPersistedState, usePersistedState } from "../hooks/usePersistedState";
import { getTrackedOwnerName } from "../utils/ownership";
import { bitjitaIconUrl, isMarketableItem, playerToolbeltTools } from "../utils/items";
import { memberDisplayName, memberTrackingId, memberTrackingKeys } from "../utils/memberIdentity";
import { normalizeData } from "../utils/normalize";
import { unique } from "../utils/array";
import { bitjitaSkillRows, PROFESSION_IDS, skillNameFromRows, skillTier, SKILL_IDS, SKILL_NAMES, TOOL_TAG_BY_TYPE } from "../utils/professions";
import type { ActivePanel, LoadState } from "../types/app";
import { activityActorName, activityContainerName, activityMetadata, activitySummary, compactActivity, sanitizeActivityLog, signedDelta } from "./activity/activityUtils";
import { bitcraftMapUrl, mapResourceCategory, mapResourceToken, normalizeMapResourceToken, parseBitcraftMapUrl, type MapFocus } from "./map/mapUtils";
import { BEST_SELLER_SORTS, bestSellerSortValue, buildMarketDaily, buildMarketTopItems, formatMarketDay, type BestSellerSortKey } from "./market/marketAnalytics";
import { displayItemName, listingDate, listingTrackingKey, liveDaysSince, safeDisplayJson } from "./market/listingUtils";
import { craftProgressKey, hasRecentCraftContribution, productionMetrics } from "./production/productionUtils";

/*
 * Main application pages that still share a large amount of display logic.
 *
 * AppShell passes normalized BitJita data and local history into these pages.
 * Keep automatic BitJita fetching out of page components unless the interaction
 * is an explicit user-triggered tool such as market search or map catalog lookup.
 */

const API = "/api/bitjita";
const LOCAL_API = "/api/local";
const ANALYTICS_CONSENT_COOKIE = "claim_monitor_analytics_consent_v2";
const ANALYTICS_VISITOR_COOKIE = "claim_monitor_analytics_visitor";
const ANALYTICS_SESSION_KEY = "claim-monitor.analytics.session";

type ActiveRegion = { regionId: string; regionName?: string; active?: boolean; syncing?: boolean; signedInPlayers?: number; playersInQueue?: number; updatedAt?: string | null; source?: string };

function getCookie(name: string): string {
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

function analyticsSessionId(): string | null {
  if (getCookie(ANALYTICS_CONSENT_COOKIE) !== "accepted") return null;
  const visitorId = getCookie(ANALYTICS_VISITOR_COOKIE);
  if (!visitorId) return null;
  let sessionId = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY) ?? "";
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, sessionId);
  }
  return sessionId;
}

function trackAnalyticsEvent(eventName: string, properties?: Record<string, string | number | boolean>, durationSeconds?: number, pageOverride?: ActivePanel) {
  const sessionId = analyticsSessionId();
  if (!sessionId) return;
  const page = pageOverride ?? new URLSearchParams(window.location.search).get("page") as ActivePanel | null ?? "dashboard";
  if (page === "admin") return;
  void fetch(`${LOCAL_API}/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ sessionId, eventName, page, properties, durationSeconds }),
  }).catch(() => undefined);
}

function updateQueryState(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function activeRegionLabel(region: ActiveRegion, settlementRegionId?: string): string {
  const suffixes = [
    String(region.regionId) === String(settlementRegionId ?? "") ? "settlement" : "",
    region.source === "admin" ? "manual" : "",
  ].filter(Boolean);
  return `R${region.regionId}${region.regionName ? ` - ${region.regionName}` : ""}${suffixes.length ? ` (${suffixes.join(", ")})` : ""}`;
}

function useActiveRegions(includeRegionId?: string): ActiveRegion[] {
  const [regions, setRegions] = React.useState<ActiveRegion[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    const include = includeRegionId && /^\d+$/.test(String(includeRegionId)) ? `?include=${encodeURIComponent(String(includeRegionId))}` : "";
    fetch(`${LOCAL_API}/regions/active${include}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`active regions HTTP ${response.status}`)))
      .then((payload) => {
        const rows = Array.isArray(payload.regions) ? payload.regions : [];
        setRegions(rows.map((region: AnyRecord) => ({
          ...region,
          regionId: String(region.regionId ?? ""),
        })).filter((region: ActiveRegion) => /^\d+$/.test(region.regionId)));
      })
      .catch(() => {
        if (!controller.signal.aborted && includeRegionId) setRegions([{ regionId: String(includeRegionId), regionName: `Region ${includeRegionId}`, source: "fallback" }]);
      });
    return () => controller.abort();
  }, [includeRegionId]);
  return regions;
}

export function Dashboard({ data, activity, snapshots, dashboardSummary, lastUpdated, onNavigate }: { data: ReturnType<typeof normalizeData>; activity: AnyRecord[]; snapshots: AnyRecord[]; dashboardSummary: AnyRecord | null; lastUpdated: Date | null; onNavigate: (panel: ActivePanel, marketTab?: string) => void }) {
  // The dashboard intentionally mixes live BitJita data with local historical
  // snapshots. Snapshot-backed trends only appear when enough history exists;
  // the page should never fabricate trend data.
  const { claim, members, market, construction, crafts, research } = data;
  const supplies = toNumber(claim.supplies);
  const supplyCap = claimSupplyCap(claim);
  const treasury = toNumber(claim.treasury);
  const upkeep = toNumber(claim.upkeepCost);
  const tileCost = toNumber(claim.tileCost);
  const tileCount = toNumber(claim.numTiles);
  const suppliesPerDay = (upkeep || tileCost * tileCount) * 24;
  const supplyRunOutAt = claimSupplyRunOutAt(claim);
  const runOutDate = parseDateValue(supplyRunOutAt);
  const supplyDays = runOutDate && runOutDate.getTime() > Date.now()
    ? (runOutDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    : suppliesPerDay > 0 ? supplies / suppliesPerDay : 0;
  const supplyPct = supplyCap > 0 ? Math.max(2, Math.min(100, (supplies / supplyCap) * 100)) : Math.max(4, Math.min(100, supplyDays ? (Math.min(supplyDays, 14) / 14) * 100 : 0));
  const onlinePlayers = data.players.filter((player) => player.signedIn);
  const onlineCount = onlinePlayers.length;
  const constructionProjects = Array.isArray(construction) ? construction : (construction.projects ?? []);
  const activeProjects = constructionProjects.filter((project: AnyRecord) => toNumber(project.progress) < toNumber(project.actionsRequired || 0)).length;
  const activeCrafts = crafts.filter((job) => {
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    return total > 0 && progress < total && hasRecentCraftContribution(data.contributions[String(job.entityId)] ?? []);
  }).length;
  const marketListingValue = market.reduce((total, listing) => {
    const explicitTotal = toNumber(listing.totalValue ?? listing.total_value);
    return total + (explicitTotal || toNumber(listing.price) * Math.max(1, toNumber(listing.quantity || 1)));
  }, 0);
  const regionSettlements = data.region;
  const regionWealth = regionSettlements.reduce((total, row) => total + toNumber(row.treasury), 0);
  const regionWealthDetail = regionSettlements.length
    ? `${formatNumber(regionSettlements.length)} settlement${regionSettlements.length === 1 ? "" : "s"} in region`
    : "Region data loading";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const treasuryEventsToday = activity.filter((event) => {
    if (event.event_type !== "treasury") return false;
    const occurredAt = parseDateValue(event.occurred_at);
    return !!occurredAt && occurredAt >= todayStart;
  }).map((event) => ({ event, metadata: activityMetadata(event) })).filter(({ metadata }) => metadata.before != null && metadata.after != null);
  const treasuryDeltasToday = treasuryEventsToday.map(({ metadata }) => toNumber(metadata.after) - toNumber(metadata.before));
  const fallbackTreasuryNetToday = treasuryDeltasToday.reduce((total, delta) => total + delta, 0);
  const treasuryNetToday = dashboardSummary?.treasuryNetToday == null ? fallbackTreasuryNetToday : toNumber(dashboardSummary.treasuryNetToday);
  const treasuryTrend = [...snapshots]
    .map((snapshot) => ({ at: String(snapshot.captured_at ?? snapshot.capturedAt ?? ""), value: toNumber(snapshot.treasury) }))
    .filter((point) => point.at && point.value > 0)
    .sort((a, b) => timestampMs(a.at) - timestampMs(b.at))
    .slice(-48);
  const dashboardSummaryActivity = Array.isArray(dashboardSummary?.recentActivity) ? dashboardSummary.recentActivity : null;
  const dashboardActivity = [...(dashboardSummaryActivity ?? activity)]
    .filter((event) => !["treasury", "supplies"].includes(String(event.event_type ?? "")))
    .sort((a, b) => timestampMs(b.occurred_at) - timestampMs(a.occurred_at));
  const recentActivity = dashboardActivity.slice(0, 5);
  const memberByPlayerId = new Map(members.map((member) => [String(member.playerEntityId), member]));
  const dashboardMembers: AnyRecord[] = onlinePlayers.map((player: AnyRecord) => {
    const member = memberByPlayerId.get(String(player.entityId));
    return {
      ...player,
      displayName: player.username ?? player.userName ?? member?.userName ?? "Unknown member",
      regionName: player.regionName ?? claim.regionName,
    };
  }).slice(0, 4);
  const rawData = (data as ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }).raw;
  const craftItemLookup = new Map([...(rawData?.crafts?.items ?? []), ...(rawData?.crafts?.cargos ?? [])].map((item: AnyRecord) => [String(item.id), item]));
  const currentCrafts = crafts.map((job) => {
    const item = craftItemLookup.get(String(job.craftedItem?.[0]?.item_id)) ?? {};
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
    const skillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
    const experiencePerEffort = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skill_id) === skillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity ?? job.experiencePerEffort);
    const totalXp = toNumber(job.totalXp ?? job.totalXP) || total * experiencePerEffort;
    const name = String(item.name ?? job.recipeName ?? job.craftName ?? job.buildingName ?? "Craft");
    return {
      id: String(job.entityId ?? `${job.recipeName}-${job.buildingName}`),
      item: Object.keys(item).length ? item : { name },
      name,
      detail: job.buildingName ?? "Production",
      pct,
      totalXp,
    };
  }).sort((a, b) => b.pct - a.pct || b.totalXp - a.totalXp || a.name.localeCompare(b.name));
  const currentCraftsDisplay = currentCrafts.slice(0, 5);
  const totalProductionXp = currentCrafts.reduce((sum, job) => sum + job.totalXp, 0);
  const attention = [
    supplyDays > 0 && supplyDays < 7 ? { icon: <AlertTriangle />, count: "!", title: "Low Supplies", body: `${formatDaysAndHours(supplyDays)} remaining`, panel: "inventory" as ActivePanel, tone: "danger" } : null,
    activeProjects ? { icon: <Hammer />, count: activeProjects, title: "Construction Projects", body: `${activeProjects} project${activeProjects === 1 ? "" : "s"} in progress`, panel: "construction" as ActivePanel, tone: "warn" } : null,
    crafts.length ? { icon: <Factory />, count: crafts.length, title: "Production Queue", body: `${activeCrafts} active, ${crafts.length} total job${crafts.length === 1 ? "" : "s"}`, panel: "production" as ActivePanel, tone: "blue" } : null,
  ].filter(Boolean).slice(0, 4) as Array<{ icon: React.ReactNode; count: React.ReactNode; title: string; body: string; panel: ActivePanel; tone: string }>;
  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <h2>Dashboard</h2>
          <p>Real-time summary of {claim.name ?? "the monitored settlement"}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span className="dashboard-region-line"><Globe2 size={15} /> {claim.regionName ?? "Unknown"} <span className="dashboard-region-badge">R{claim.regionId ?? "?"}</span></span>
            <span className="dashboard-refresh-line"><span className="online-dot is-online" /> Last updated {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "waiting"}</span>
          </div>
          <span className="dashboard-claim-link"><TierBadge tier={claim.tier} /> {claim.name ?? "Monitored Settlement"}</span>
        </div>
      </header>

      <section className="dashboard-kpis">
        <DashboardMetric icon={<Users />} label="Members" value={members.length} detail={`${onlineCount} online now`} onClick={() => onNavigate("members")} />
        <DashboardMetric icon={<Package />} label="Supply Status" value={formatDaysAndHours(supplyDays)} detail={`${formatNumber(supplies)} stored`} progress={supplyPct} tone="green" onClick={() => onNavigate("inventory")} />
        <DashboardMetric icon={<Hammer />} label="Construction" value={activeProjects} detail={`${activeProjects} current project${activeProjects === 1 ? "" : "s"}`} onClick={() => onNavigate("construction")} />
        <DashboardMetric icon={<TrendingUp />} label="Market Listings" value={market.length} detail={`${formatCompactNumber(marketListingValue)} total listing value`} tone="green" onClick={() => onNavigate("market")} />
        <DashboardMetric icon={<CircleDollarSign />} label="Region Wealth" value={regionSettlements.length ? formatCompactNumber(regionWealth) : "-"} detail={regionWealthDetail} tone="gold" onClick={() => onNavigate("empire")} />
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-card dashboard-card-chart">
          <DashboardCardHeader title="Treasury Over Time" icon={<CircleDollarSign size={15} />} action="7 Days" />
          <div className="dashboard-money-row">
            <strong>{formatNumber(treasury)}g</strong>
            <span className={treasuryNetToday < 0 ? "negative" : treasuryNetToday > 0 ? "positive" : ""}>{signedDelta(treasuryNetToday, 0, "g")} net today</span>
          </div>
          <DashboardTrend points={treasuryTrend} suffix="g" />
        </article>

        <article className="dashboard-card dashboard-card-supply">
          <DashboardCardHeader title="Supply Status" icon={<Package size={15} />} />
          <div className="dashboard-supply-lead"><strong>{formatDaysAndHours(supplyDays)}</strong><span>until full depletion</span></div>
          <div className="dashboard-supply-cap"><span>{formatNumber(supplies)}{supplyCap ? ` / ${formatNumber(supplyCap)}` : ""}</span><span>{supplyCap ? `${Math.round((supplies / supplyCap) * 100)}% capacity` : "Runway estimate"}</span></div>
          <div className="dashboard-progress"><div style={{ width: `${supplyPct}%` }} /></div>
          <div className="dashboard-supply-breakdown">
            <ul>
              <li><span className="yellow" /> Supplies per day <b>{formatNumber(suppliesPerDay, 0)}</b></li>
              <li><span className="green" /> Storage cap <b>{supplyCap ? formatNumber(supplyCap) : "Unknown"}</b></li>
              <li><span className="blue" /> Current stock <b>{formatNumber(supplies)}</b></li>
            </ul>
          </div>
        </article>

        <article className="dashboard-card dashboard-card-activity">
          <DashboardCardHeader title="Recent Activity" icon={<Activity size={15} />} action="View all" onClick={() => onNavigate("activity")} />
          <div className="dashboard-feed">
            {recentActivity.length ? recentActivity.map((event) => {
              const style = activityStyle(event);
              return (
                <button key={event.id ?? `${event.event_type}-${event.occurred_at}`} className={`dashboard-feed-row ${style.tone}`} onClick={() => onNavigate("activity")}>
                  <span>{style.icon}</span>
                  <strong>{style.label}</strong>
                  <small>{activitySummary(event)}</small>
                  <time>{timeAgo(event.occurred_at)}</time>
                </button>
              );
            }) : <div className="dashboard-empty">{activity.length ? "No non-treasury or non-supply activity has been recorded yet." : "No local activity history has been recorded yet."}</div>}
          </div>
        </article>

        <article className="dashboard-card dashboard-card-members">
          <DashboardCardHeader title={`Online Members (${onlineCount})`} icon={<Users size={15} />} action="View all" onClick={() => onNavigate("members")} />
          <div className="dashboard-member-list">
            {dashboardMembers.length ? dashboardMembers.map((player) => (
              <button key={player.entityId} onClick={() => onNavigate("members")}>
                <span className="dashboard-avatar">{String(player.displayName ?? "?").slice(0, 1).toUpperCase()}<i className="online-dot is-online" /></span>
                <span className="dashboard-member-copy">
                  <strong><TrackedOwnerName name={player.displayName} claim={claim} /></strong>
                  <small>{player.regionName ?? "Online"}</small>
                </span>
                <span className="dashboard-member-session">
                  <em>Online</em>
                  <small>{formatCurrentSession(player.sessionSeconds) ? `Playing ${formatCurrentSession(player.sessionSeconds)}` : "Playtime unavailable"}</small>
                </span>
              </button>
            )) : <div className="dashboard-empty">No members are currently online.</div>}
          </div>
        </article>

        <article className="dashboard-card dashboard-card-production">
          <DashboardCardHeader title="Current Crafts" icon={<Factory size={15} />} action="View production" onClick={() => onNavigate("production")} />
          <div className="dashboard-production-list">
            {currentCraftsDisplay.length ? currentCraftsDisplay.map((job) => (
              <button key={job.id} onClick={() => onNavigate("production")}>
                <span className="dashboard-item-icon"><ItemIcon item={job.item} /></span>
                <strong>{job.name}</strong>
                <b>{job.pct}%</b>
                <i><span style={{ width: `${Math.max(4, job.pct)}%` }} /></i>
              </button>
            )) : <div className="dashboard-empty">No current production jobs in the API snapshot.</div>}
          </div>
          <div className="dashboard-total-row"><span>Total Production XP</span><strong>{formatNumber(totalProductionXp)}</strong></div>
        </article>

        <article className="dashboard-card dashboard-card-attention">
          <DashboardCardHeader title="Needs Attention" icon={<AlertTriangle size={15} />} />
          <div className="dashboard-alert-list">
            {attention.length ? attention.map((item) => (
              <button key={item.title} className={item.tone} onClick={() => onNavigate(item.panel)}>
                <span>{item.count}</span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <ArrowUp size={14} />
              </button>
            )) : <div className="dashboard-empty">No urgent settlement issues detected.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}

const CORE_MATERIAL_GROUPS = [
  { label: "Ingots", matcher: (row: AnyRecord) => /^(?:Refined )?Ingot$/i.test(String(row.tag ?? "")) },
  { label: "Planks", matcher: (row: AnyRecord) => /^(?:Refined )?Plank$/i.test(String(row.tag ?? "")) },
  { label: "Bricks", matcher: (row: AnyRecord) => /^(?:Refined )?Brick$/i.test(String(row.tag ?? "")) && !/^Unfired /i.test(String(row.name ?? "")) },
  { label: "Leather", matcher: (row: AnyRecord) => /^(?:Refined )?Leather$/i.test(String(row.tag ?? "")) },
  { label: "Cloth", matcher: (row: AnyRecord) => /^(?:Refined )?Cloth$/i.test(String(row.tag ?? "")) },
] as const;

export function Inventory({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [q, setQ] = React.useState("");
  const [containerQ, setContainerQ] = React.useState("");
  const [type, setType] = usePersistedState("inventory.type", "All");
  const [tier, setTier] = usePersistedState("inventory.tier", "All");
  const [rarity, setRarity] = usePersistedState("inventory.rarity", "All");
  const [buildingFilter, setBuildingFilter] = usePersistedState("inventory.container", "All");
  const [coreMaterialFilter, setCoreMaterialFilter] = usePersistedState("inventory.core-material", "All");
  const [nonEmptyOnly, setNonEmptyOnly] = usePersistedState("inventory.non-empty", true);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [itemDetail, setItemDetail] = React.useState<AnyRecord | null>(null);
  React.useEffect(() => {
    if (!selectedItem?.itemId) {
      setItemDetail(null);
      return;
    }
    const controller = new AbortController();
    const resource = selectedItem.type === "Cargo" ? "cargo" : "items";
    fetch(`${API}/${resource}/${selectedItem.itemId}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`item detail HTTP ${response.status}`)))
      .then(setItemDetail)
      .catch(() => { if (!controller.signal.aborted) setItemDetail(null); });
    return () => controller.abort();
  }, [selectedItem?.itemId, selectedItem?.type]);
  const itemLookup = new Map([...(data.inventories.items ?? []), ...(data.inventories.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const containers = ((data.inventories.buildings ?? []) as AnyRecord[]).map((building) => {
    const items = (building.inventory ?? []).map((slot: AnyRecord, index: number) => {
      const contents = slot.contents ?? {};
      const lookup = itemLookup.get(String(contents.item_id)) ?? {};
      const name = displayItemName(lookup.name) ?? displayItemName(lookup.tag) ?? displayItemName(contents.itemName) ?? displayItemName(contents.name) ?? `Item #${contents.item_id ?? "?"}`;
      const tag = displayItemName(lookup.tag);
      return {
        id: `${building.entityId}-${contents.item_id}-${slot.slot ?? index}`,
        building: building.buildingNickname ?? building.buildingName,
        itemId: contents.item_id == null ? null : String(contents.item_id),
        name,
        iconAssetName: lookup.iconAssetName,
        quantity: contents.quantity,
        type: contents.item_type === "cargo" ? "Cargo" : "Item",
        tier: lookup.tier,
        rarity: lookup.rarityStr,
        tag: tag && tag !== name ? tag : null,
      };
    });
    return {
      id: String(building.entityId ?? building.buildingName),
      name: building.buildingNickname ?? building.buildingName ?? "Unknown Container",
      locked: Boolean(building.locked),
      items,
    };
  });
  const allRows = containers.flatMap((container) => container.items);
  const materialSummary: AnyRecord[] = CORE_MATERIAL_GROUPS.map((group): AnyRecord => {
    const matches = allRows.filter((row: AnyRecord) => group.matcher(row));
    const quantity = matches.reduce((total: number, row: AnyRecord) => total + toNumber(row.quantity), 0);
    const containerCount = new Set(matches.map((row: AnyRecord) => row.building).filter(Boolean)).size;
    const tierBreakdown = Object.values(matches.reduce((acc: Record<string, AnyRecord>, row: AnyRecord) => {
      const tierNumber = toNumber(row.tier);
      const tierLabel = tierNumber > 0 ? `T${tierNumber}` : "Other";
      const current = acc[tierLabel] ?? { tierLabel, tier: tierNumber, quantity: 0, item: row };
      current.quantity += toNumber(row.quantity);
      if (!current.item?.iconAssetName && row.iconAssetName) current.item = row;
      acc[tierLabel] = current;
      return acc;
    }, {})).sort((a: AnyRecord, b: AnyRecord) => {
      if (a.tierLabel === "Other") return 1;
      if (b.tierLabel === "Other") return -1;
      return toNumber(a.tier) - toNumber(b.tier);
    });
    return { label: group.label, quantity, containerCount, tierBreakdown };
  });
  const selectedCoreMaterial = CORE_MATERIAL_GROUPS.find((group) => group.label === coreMaterialFilter);
  const filteredContainers = containers.map((container) => ({
    ...container,
    items: container.items.filter((row: AnyRecord) => {
      if (selectedCoreMaterial && !selectedCoreMaterial.matcher(row)) return false;
      if (q && !row.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (type !== "All" && row.type !== type) return false;
      if (tier !== "All" && String(row.tier) !== tier) return false;
      if (rarity !== "All" && row.rarity !== rarity) return false;
      if (buildingFilter !== "All" && row.building !== buildingFilter) return false;
      return true;
    }),
  })).filter((container) => {
    if (containerQ && !container.name.toLowerCase().includes(containerQ.toLowerCase())) return false;
    if (selectedCoreMaterial && container.items.length === 0) return false;
    if (nonEmptyOnly && container.items.length === 0) return false;
    return true;
  });
  const rows = filteredContainers.flatMap((container) => container.items);
  const buildings = unique(allRows.map((row: AnyRecord) => String(row.building)).filter(Boolean));
  const tiers = unique(allRows.map((row: AnyRecord) => String(row.tier)).filter((value: string) => value && value !== "undefined" && value !== "-1" && value !== "0"));
  const rarities = unique(allRows.map((row: AnyRecord) => String(row.rarity)).filter((value: string) => value && value !== "undefined" && value !== "Default"));
  const totalItems = rows.reduce((total: number, row: AnyRecord) => total + toNumber(row.quantity), 0);
  const occupiedContainers = containers.filter((container) => container.items.length > 0).length;
  const uniqueVisibleItems = unique(rows.map((row: AnyRecord) => String(row.name))).length;
  return (
    <div className="panel inventory-page">
      <header className="members-topbar inventory-topbar">
        <div>
          <h2>Inventory & Storage</h2>
          <p>{containers.length} containers - {rows.length} visible stacks</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Package size={14} /> {formatNumber(totalItems)} visible items</span>
            <span>{formatNumber(uniqueVisibleItems)} unique</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">{formatNumber(occupiedContainers)}</span>
            <span>Occupied containers</span>
          </div>
        </div>
      </header>
      <div className="summary-grid inventory-summary">
        <MiniStat icon={<Package />} label="Total Items" value={formatNumber(totalItems)} />
        <MiniStat icon={<Box />} label="Unique Items" value={uniqueVisibleItems} />
        <MiniStat icon={<Package />} label="Occupied Containers" value={occupiedContainers} />
        <MiniStat icon={<Building2 />} label="Containers" value={containers.length} />
      </div>
      <section className="material-watch">
        <div className="split-header">
          <h3><Package size={17} /> Core Materials</h3>
        </div>
        <div className="material-watch-grid">
          {materialSummary.map((group) => (
            <button
              type="button"
              className={`material-card ${group.quantity ? "" : "empty"} ${coreMaterialFilter === group.label ? "active" : ""}`}
              key={group.label}
              aria-pressed={coreMaterialFilter === group.label}
              onClick={() => setCoreMaterialFilter(coreMaterialFilter === group.label ? "All" : group.label)}
            >
              <span>{group.label}</span>
              <strong>{formatNumber(group.quantity)}</strong>
              <small>{group.containerCount ? `${group.containerCount} container${group.containerCount === 1 ? "" : "s"}` : "None stored"}</small>
              {group.tierBreakdown.length ? (
                <div className="material-tier-list">
                  {group.tierBreakdown.map((entry: AnyRecord) => <div key={entry.tierLabel}>{entry.tierLabel === "Other" ? <b>{entry.tierLabel}</b> : <TierMaterialIcon item={entry.item} tier={entry.tier} />}<em>{formatNumber(entry.quantity)}</em></div>)}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </section>
      {selectedItem && itemDetail ? (
        <section className="item-detail">
          <div className="split-header">
            <h3><Package size={17} /> {selectedItem.name}</h3>
            <button className="mini-action" onClick={() => setSelectedItem(null)}>Close</button>
          </div>
          <div className="metric-grid">
            <MiniStat icon={<Factory />} label="Crafting Recipes" value={(itemDetail.craftingRecipes ?? []).length} />
            <MiniStat icon={<Wrench />} label="Used In Recipes" value={(itemDetail.recipesUsingItem ?? []).length} />
            <MiniStat icon={<TrendingUp />} label="Related Skills" value={(itemDetail.relatedSkills ?? []).length} />
            <MiniStat icon={<CircleDollarSign />} label="Market Data" value={itemDetail.marketStats ? "Available" : "None"} />
          </div>
          <div className="highlight-grid">
            {[...(itemDetail.craftingRecipes ?? []), ...(itemDetail.recipesUsingItem ?? [])].slice(0, 6).map((recipe: AnyRecord) => (
              <div key={recipe.id ?? recipe.name}><strong>{recipe.name ?? "Recipe"}</strong><span>{recipe.buildingName ?? "No station listed"}</span></div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="production-command-panel inventory-command-panel">
        <div className="inventory-command-header">
          <span className="production-command-title"><Search size={15} /> Inventory filters</span>
          <div className="inventory-command-actions">
            {selectedCoreMaterial ? <button className="mini-action active" onClick={() => setCoreMaterialFilter("All")}><X size={13} /> {selectedCoreMaterial.label} only</button> : null}
            <label className="inventory-inline-toggle"><span>Non-empty only</span><input type="checkbox" checked={nonEmptyOnly} onChange={(event) => setNonEmptyOnly(event.target.checked)} /></label>
          </div>
        </div>
        <div className="inventory-filter-grid">
          <label className="inventory-filter-field"><span>Item</span><SearchBox value={q} onChange={setQ} placeholder="Search items" /></label>
          <label className="inventory-filter-field"><span>Container</span><SearchBox value={containerQ} onChange={setContainerQ} placeholder="Search containers" /></label>
          <label className="inventory-filter-field"><span>Type</span>
            <select className="select-control" value={type} onChange={(event) => setType(event.target.value)}>
              <option>All</option><option>Item</option><option>Cargo</option>
            </select>
          </label>
          <label className="inventory-filter-field"><span>Tier</span>
            <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}>
              <option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="inventory-filter-field"><span>Rarity</span>
            <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}>
              <option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="inventory-filter-field"><span>Storage</span>
            <select className="select-control" value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}>
              <option>All</option>{buildings.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="container-list">
        {selectedCoreMaterial && filteredContainers.length === 0 ? <div className="empty-state"><Package />No containers match the {selectedCoreMaterial.label.toLowerCase()} filter.</div> : null}
        {filteredContainers.map((container) => {
          const quantity = container.items.reduce((total: number, item: AnyRecord) => total + toNumber(item.quantity), 0);
          return (
            <details className="container-card" key={container.id} open={filteredContainers.length <= 4}>
              <summary>
                <span><Package size={16} /> <strong>{container.name}</strong>{container.locked ? <Lock size={13} /> : null}</span>
                <small>{container.items.length} stacks - {formatNumber(quantity)} items</small>
              </summary>
              <DataTable rows={container.items} columns={[
                ["Item", (r) => <button className="item-link with-icon" onClick={() => setSelectedItem(r)}><ItemIcon item={r} /><span><strong>{r.name}</strong>{r.tag ? <small className="muted-line">{r.tag}</small> : null}</span></button>],
                ["Qty", (r) => formatNumber(r.quantity)],
                ["Tier", (r) => r.tier ? <TierBadge tier={r.tier} /> : "-"],
                ["Rarity", (r) => r.rarity ? <RarityBadge rarity={r.rarity} /> : "-"],
                ["Type", (r) => r.type],
              ]} />
            </details>
          );
        })}
      </div>
    </div>
  );
}

function BestSellersLeaderboard({ rows, itemMeta }: { rows: AnyRecord[]; itemMeta: Map<string, AnyRecord> }) {
  const [sort, setSort] = React.useState<BestSellerSortKey>("units");
  const sortedRows = React.useMemo(
    () => [...rows].sort((a, b) => bestSellerSortValue(b, sort) - bestSellerSortValue(a, sort)),
    [rows, sort],
  );
  const featured = sortedRows.slice(0, 3);
  const remaining = sortedRows.slice(3);

  if (!sortedRows.length) {
    return (
      <div className="market-best-empty">
        <Star size={24} />
        <strong>No confirmed best sellers yet</strong>
        <span>API-confirmed sales will appear here once BitJita reports completed trades for this selection.</span>
      </div>
    );
  }

  const renderItem = (row: AnyRecord, index: number, variant: "featured" | "compact") => {
    const itemName = String(row.itemName ?? row.item_name ?? row.name ?? "Unknown item");
    const meta = itemMeta.get(itemName) ?? {};
    const item: AnyRecord = { ...meta, ...row, name: itemName, itemName };
    const tier = item.itemTier ?? item.tier;
    const rarity = item.itemRarityStr ?? item.rarity;
    const rank = index + 1;
    return (
      <article className={`market-best-row ${variant}`} key={`${itemName}-${rank}`}>
        <span className={`market-best-rank rank-${rank}`}>#{rank}</span>
        <ItemIcon item={item} />
        <div className="market-best-name">
          <strong>{itemName}</strong>
          <span>
            {tier ? <TierBadge tier={tier} /> : null}
            {rarity ? <RarityBadge rarity={rarity} /> : null}
            <small title={dateLabel(row.lastSoldAt)}>Last trade {timeAgo(row.lastSoldAt)}</small>
          </span>
        </div>
        <div className="market-best-stats">
          <span><b>{formatNumber(row.unitsSold)}</b><small>units</small></span>
          <span><b>{formatCompactNumber(row.totalValue)}</b><small>revenue</small></span>
          <span><b>{formatNumber(row.avgUnitPrice)}g</b><small>avg</small></span>
          <span><b>{formatNumber(row.salesCount)}</b><small>sales</small></span>
        </div>
      </article>
    );
  };

  return (
    <div className="market-best-leaderboard">
      <div className="market-best-toolbar" aria-label="Best sellers ranking controls">
        <span>Ranked by</span>
        <div>
          {BEST_SELLER_SORTS.map((option) => (
            <button key={option.key} type="button" className={sort === option.key ? "active" : ""} onClick={() => setSort(option.key)} aria-pressed={sort === option.key}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="market-best-featured">
        {featured.map((row, index) => renderItem(row, index, "featured"))}
      </div>
      {remaining.length ? (
        <div className="market-best-compact">
          {remaining.map((row, index) => renderItem(row, index + featured.length, "compact"))}
        </div>
      ) : null}
    </div>
  );
}
export function Market({ data, history, claimId }: { data: ReturnType<typeof normalizeData>; history: AnyRecord | null; claimId: string }) {
  const [q, setQ] = React.useState("");
  const [view, setView] = usePersistedState<"live" | "analytics" | "pricing" | "buyOrders">("market.view", "live");
  const [tab, setTab] = React.useState<"sell" | "buy">("sell");
  const [tier, setTier] = usePersistedState("market.tier", "All");
  const [rarity, setRarity] = usePersistedState("market.rarity", "All");
  const [memberFilter, setMemberFilter] = usePersistedState("market.member", "All");
  const [memberHistory, setMemberHistory] = React.useState<AnyRecord | null>(null);
  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "live" || requested === "analytics" || requested === "pricing") setView(requested);
    if (requested === "buy-orders" || requested === "buyOrders") setView("buyOrders");
  }, [setView]);
  const selectView = (next: "live" | "analytics" | "pricing" | "buyOrders") => {
    setView(next);
    updateQueryState({ page: "market", tab: next === "buyOrders" ? "buy-orders" : next });
    trackAnalyticsEvent("market_tab_viewed", { tab: next });
  };
  const memberOptions = React.useMemo(() => {
    const names = [
      ...data.members.map((member) => member.userName ?? member.username ?? member.playerUsername ?? member.name),
      ...data.market.map((listing) => listing.ownerUsername ?? listing.owner ?? listing.ownerName),
    ].filter(Boolean).map(String);
    return unique(names).sort((a, b) => a.localeCompare(b));
  }, [data.members, data.market]);
  const ownerMatches = React.useCallback((owner: unknown) => memberFilter === "All" || String(owner ?? "").toLowerCase() === memberFilter.toLowerCase(), [memberFilter]);
  const all = data.market.filter((listing) => ownerMatches(listing.ownerUsername ?? listing.owner ?? listing.ownerName));
  React.useEffect(() => {
    if (memberFilter === "All") {
      setMemberHistory(null);
      return;
    }
    const controller = new AbortController();
    setMemberHistory(null);
    fetch(`${LOCAL_API}/market/history?claimId=${encodeURIComponent(claimId)}&limit=120&owner=${encodeURIComponent(memberFilter)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market history HTTP ${response.status}`)))
      .then((result) => setMemberHistory(result))
      .catch(() => {
        if (!controller.signal.aborted) setMemberHistory({ sales: [], topItems: [], daily: [], totals: {} });
      });
    return () => controller.abort();
  }, [claimId, memberFilter, history]);
  const analytics = memberFilter === "All" ? history : memberHistory;
  const apiTrades: AnyRecord[] = (analytics?.sales ?? [])
    .map((event: AnyRecord) => {
      const raw = safeDisplayJson(event.raw_json) ?? {};
      return {
        id: event.id,
        itemName: event.item_name,
        name: event.item_name,
        iconAssetName: event.iconAssetName ?? raw.iconAssetName,
        quantity: event.quantity,
        unitPrice: event.price,
        totalPrice: event.total_value,
        sellerUsername: event.owner,
        purchaserUsername: raw.purchaserUsername,
        itemTier: event.tier ?? raw.itemTier,
        itemRarityStr: event.rarity ?? raw.itemRarityStr,
        timestamp: event.occurred_at,
      };
    })
    .sort((a: AnyRecord, b: AnyRecord) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const marketItemMeta = React.useMemo(() => {
    const entries = [...data.market, ...apiTrades].map((item: AnyRecord) => [String(item.itemName ?? item.name ?? ""), item] as const);
    return new Map(entries.filter(([name]) => Boolean(name)));
  }, [apiTrades, data.market]);
  const trackedLiveListings = React.useMemo(
    () => new Map<string, AnyRecord>((history?.liveListings ?? []).map((listing: AnyRecord) => [String(listing.listing_key), listing])),
    [history?.liveListings],
  );
  const listingListedAt = (listing: AnyRecord) => listingDate(listing, trackedLiveListings.get(listingTrackingKey(listing))?.first_seen);
  const sellOrders = all.filter((m) => String(m.side ?? m.orderType ?? "sell").toLowerCase().includes("sell"));
  const buyOrders = all.filter((m) => String(m.side ?? m.orderType ?? "").toLowerCase().includes("buy"));
  const current = tab === "sell" ? (sellOrders.length ? sellOrders : all) : buyOrders;
  const tiers = unique(all.map((m) => String(m.itemTier ?? m.tier)).filter((value) => value && value !== "undefined"));
  const rarities = unique(all.map((m) => m.itemRarityStr ?? m.rarity).filter(Boolean));
  const rows = current.filter((m) => {
    if (q && !String(m.itemName ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (tier !== "All" && String(m.itemTier ?? m.tier) !== tier) return false;
    if (rarity !== "All" && (m.itemRarityStr ?? m.rarity) !== rarity) return false;
    return true;
  });
  const renderedRows = rows.slice(0, 500);
  const highest = [...all].sort((a, b) => toNumber(b.price) * toNumber(b.quantity || 1) - toNumber(a.price) * toNumber(a.quantity || 1)).slice(0, 3);
  const saleEvents = apiTrades.map((trade: AnyRecord) => ({
    itemName: trade.itemName,
    item_name: trade.itemName,
    quantity: trade.quantity,
    price: trade.unitPrice,
    totalValue: trade.totalPrice,
    total_value: trade.totalPrice,
    occurredAt: trade.timestamp ?? trade.createdAt,
    occurred_at: trade.timestamp ?? trade.createdAt,
  }));
  const topItems = analytics?.topItems ?? buildMarketTopItems(saleEvents);
  const daily = analytics?.daily ?? buildMarketDaily(saleEvents);
  const confirmedSales = toNumber(analytics?.totals?.confirmedSales ?? apiTrades.length);
  const confirmedRevenue = toNumber(analytics?.totals?.trackedValue ?? apiTrades.reduce((total: number, trade: AnyRecord) => total + toNumber(trade.totalPrice), 0));
  const unitsSold = toNumber(analytics?.totals?.confirmedUnits ?? apiTrades.reduce((total: number, trade: AnyRecord) => total + toNumber(trade.quantity), 0));
  const averageSaleValue = confirmedSales ? confirmedRevenue / confirmedSales : 0;
  const listingValue = all.reduce((total, listing) => total + toNumber(listing.price) * Math.max(1, toNumber(listing.quantity)), 0);
  const maxDailyValue = Math.max(...daily.map((row: AnyRecord) => toNumber(row.totalValue)), 1);
  const trendRange = daily.length ? `${formatMarketDay(daily[0].day)} to ${formatMarketDay(daily[daily.length - 1].day)}` : "No confirmed sales";
  const filterLabel = memberFilter === "All" ? "all members" : memberFilter;
  return (
    <div className="panel market-page">
      <header className="members-topbar market-topbar">
        <div>
          <h2>Market</h2>
          <p>{view === "pricing" ? "Regional completed-trade pricing for smarter listings" : view === "buyOrders" ? "Find active buy orders across regional markets" : `${formatNumber(all.length)} live listing${all.length === 1 ? "" : "s"} for ${filterLabel}`}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><ShoppingCart size={14} /> {formatNumber(all.length)} listings</span>
            <span>{formatNumber(confirmedSales)} confirmed sales</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">R{data.claim?.regionId ?? "?"}</span>
            <span>{data.claim?.name ?? "Settlement market"}</span>
          </div>
        </div>
      </header>
      <div className="summary-grid market-summary">
        <MiniStat icon={<ShoppingCart />} label="Live Listings" value={formatNumber(all.length)} />
        <MiniStat icon={<CircleDollarSign />} label="Listing Value" value={formatCompactNumber(listingValue)} />
        <MiniStat icon={<CheckCircle2 />} label="Confirmed Sales" value={formatNumber(confirmedSales)} />
        <MiniStat icon={<TrendingUp />} label="Sales Revenue" value={formatCompactNumber(confirmedRevenue)} />
      </div>
      <section className="production-command-panel market-command-panel">
        <div className="market-command-header">
          <span className="production-command-title"><CircleDollarSign size={15} /> Market tools</span>
          <span className="market-command-note">{view === "pricing" ? "Use completed trade history to estimate listing prices." : view === "buyOrders" ? "Search current buy orders by item and region." : "Browse settlement market data by view and member."}</span>
        </div>
        <div className="market-tool-row">
          <div className="tabs primary-tabs market-tabs">
            <button className={view === "live" ? "active" : ""} onClick={() => selectView("live")}><ShoppingCart size={15} /> Live Listings</button>
            <button className={view === "analytics" ? "active" : ""} onClick={() => selectView("analytics")}><TrendingUp size={15} /> Analytics</button>
            <button className={view === "pricing" ? "active" : ""} onClick={() => selectView("pricing")}><CircleDollarSign size={15} /> Price Finder</button>
            <button className={view === "buyOrders" ? "active" : ""} onClick={() => selectView("buyOrders")}><ShoppingBag size={15} /> Buy Order Finder</button>
          </div>
          <label className={`market-member-field ${view === "pricing" || view === "buyOrders" ? "is-placeholder" : ""}`}>
            <span>Member</span>
            {view !== "pricing" && view !== "buyOrders" ? (
              <select className="select-control" value={memberFilter} onChange={(event) => { setMemberFilter(event.target.value); trackAnalyticsEvent("market_member_filter_used", { scope: event.target.value === "All" ? "all" : "member" }); }}>
                <option>All</option>
                {memberOptions.map((name) => <option key={name}>{name}</option>)}
              </select>
            ) : <span className="market-member-placeholder">{view === "buyOrders" ? "All market buyers" : "All settlement history"}</span>}
          </label>
        </div>
      </section>
      {view === "pricing" ? (
        <PriceFinder monitoredRegionId={String(data.claim?.regionId ?? "19")} />
      ) : view === "buyOrders" ? (
        <BuyOrderFinder monitoredRegionId={String(data.claim?.regionId ?? "19")} />
      ) : view === "analytics" ? (
        <>
          <p className="legend market-legend">Completed sales for orders listed at this settlement market, confirmed from BitJita trade records.</p>
          <div className="metric-grid market-analytics-metrics">
            <MiniStat icon={<CheckCircle2 />} label="Confirmed Sales" value={formatNumber(confirmedSales)} />
            <MiniStat icon={<Package />} label="Units Sold" value={formatNumber(unitsSold)} />
            <MiniStat icon={<CircleDollarSign />} label="Sales Revenue" value={formatCompactNumber(confirmedRevenue)} />
            <MiniStat icon={<TrendingUp />} label="Average Sale Value" value={`${formatNumber(averageSaleValue)}g`} />
          </div>
          <div className="two-col market-analytics">
            <section>
              <h3><Star size={17} /> Best Sellers</h3>
              <p className="legend">Top confirmed sellers from recorded BitJita trade history.</p>
              <BestSellersLeaderboard rows={topItems} itemMeta={marketItemMeta} />
            </section>
            <section>
              <h3><TrendingUp size={17} /> Revenue By Day</h3>
              <p className="legend">{trendRange}. Confirmed sales only; bar length represents revenue.</p>
              <div className="daily-sales">
                {daily.length ? daily.map((row: AnyRecord) => (
                  <div className="daily-sale-row" key={row.day}>
                    <span>{formatMarketDay(row.day)}</span>
                    <div className="daily-sale-bar"><i style={{ width: `${(toNumber(row.totalValue) / maxDailyValue) * 100}%` }} /></div>
                    <strong>{formatNumber(row.totalValue)}g</strong>
                    <small>{formatNumber(row.salesCount)} sale{row.salesCount === 1 ? "" : "s"} - {formatNumber(row.unitsSold)} units</small>
                  </div>
                )) : <p className="legend">No API-confirmed sales found for this selection.</p>}
              </div>
            </section>
          </div>
          <section className="market-section">
            <h3><CheckCircle2 size={17} /> Recent Confirmed Sales</h3>
            <p className="legend">Imported completed sales retained in this monitor's history for the selected current settlement member(s).</p>
            <DataTable rows={apiTrades} columns={[
              ["When", r => dateLabel(r.timestamp ?? r.createdAt)],
              ["Item", r => <ItemLabel item={r} name={r.itemName ?? "-"} />],
              ["Tier", r => r.itemTier ? <TierBadge tier={r.itemTier} /> : "-"],
              ["Qty", r => formatNumber(r.quantity)],
              ["Unit Price", r => `${formatNumber(r.unitPrice)}g`],
              ["Value", r => `${formatNumber(r.totalPrice)}g`],
              ["Seller", r => r.sellerUsername ?? "-"],
              ["Buyer", r => r.purchaserUsername ?? r.buyerUsername ?? "-"],
            ]} />
          </section>
        </>
      ) : (
        <>
      <div className="market-live-grid">
        <MiniStat icon={<ShoppingCart />} label="Visible Listings" value={all.length} />
        <MiniStat icon={<TrendingDown />} label="Sell Orders" value={sellOrders.length || all.length} />
        <MiniStat icon={<TrendingUp />} label="Buy Orders" value={buyOrders.length} />
        <MiniStat icon={<CircleDollarSign />} label="Top Value" value={highest[0] ? formatCompactNumber(toNumber(highest[0].price) * toNumber(highest[0].quantity || 1)) : "-"} />
      </div>
      <div className="highlight-grid market-highlights">{highest.map((listing) => <div key={listing.entityId ?? listing.itemName}><ItemLabel item={{ ...listing, name: listing.itemName }} name={listing.itemName} /><span>{formatNumber(toNumber(listing.price) * toNumber(listing.quantity || 1))}g - {formatNumber(listing.price)}g ea</span></div>)}</div>
      <section className="production-command-panel market-filter-panel">
        <div className="market-command-header">
          <span className="production-command-title"><Search size={15} /> Listing filters</span>
          <span>{formatNumber(rows.length)} visible rows</span>
        </div>
        <div className="market-filter-grid">
          <label className="research-filter-field">
            <span>Search</span>
            <SearchBox value={q} onChange={setQ} placeholder="Search market" />
          </label>
          <label className="research-filter-field">
            <span>Order Type</span>
            <div className="segmented market-order-tabs"><button className={tab === "sell" ? "active" : ""} onClick={() => setTab("sell")}><TrendingDown size={15} /> Sell</button><button className={tab === "buy" ? "active" : ""} onClick={() => setTab("buy")}><TrendingUp size={15} /> Buy</button></div>
          </label>
          <label className="research-filter-field">
            <span>Tier</span>
            <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="research-filter-field">
            <span>Rarity</span>
            <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}><option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
        </div>
      </section>
      {rows.length > renderedRows.length ? <p className="legend market-legend">Showing the first {formatNumber(renderedRows.length)} of {formatNumber(rows.length)} matching listings. Narrow the filters to inspect more specific results.</p> : null}
      <DataTable rows={renderedRows} columns={[
        ["Item", r => <ItemLabel item={{ ...r, name: r.itemName }} name={r.itemName ?? "Unknown"} />],
        ["Side", r => <span className={`pill ${String(r.side ?? r.orderType).includes("buy") ? "buy" : "sell"}`}>{r.side ?? r.orderType ?? "sell"}</span>],
        ["Qty", r => formatNumber(r.quantity)],
          ["Unit Price", r => `${formatNumber(r.price)}g`],
          ["Total Price", r => `${formatNumber(r.totalValue ?? r.total_value ?? (toNumber(r.price) * toNumber(r.quantity)))}g`],
          ["Tier", r => (r.itemTier ?? r.tier) ? <TierBadge tier={r.itemTier ?? r.tier} /> : "-"],
        ["Rarity", r => (r.itemRarityStr ?? r.rarity) ? <RarityBadge rarity={r.itemRarityStr ?? r.rarity} /> : "-"],
        ["Owner", r => <TrackedOwnerName name={r.ownerUsername ?? "-"} claim={data.claim} />],
        ["Listed", r => listingListedAt(r) ? dateLabel(listingListedAt(r)) : "-"],
        ["Live", r => liveDaysSince(listingListedAt(r))],
      ]} />
        </>
      )}
    </div>
  );
}

export function PriceFinder({ monitoredRegionId }: { monitoredRegionId: string }) {
  const defaultRegion = monitoredRegionId || "19";
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [searchState, setSearchState] = React.useState<"idle" | "loading" | "error">("idle");
  const [regionChoice, setRegionChoice] = usePersistedState("market.price.region", defaultRegion);
  const activeRegions = useActiveRegions(defaultRegion);
  const [priceState, setPriceState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: false });
  const [authState, setAuthState] = React.useState<AnyRecord>({ user: null, discordLoginEnabled: false });
  const [watchState, setWatchState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: false });
  const [watchBusy, setWatchBusy] = React.useState("");
  const activeRegion = regionChoice === "All" ? "" : regionChoice;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    const itemName = params.get("itemName");
    const itemType = params.get("itemType");
    const region = params.get("region");
    if (itemId && itemName) {
      setSelectedItem({ id: itemId, name: itemName, itemType: toNumber(itemType) });
      setQuery(itemName);
    }
    if (region) setRegionChoice(region === "all" ? "All" : region);
  }, [setRegionChoice]);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedItem?.name === query.trim()) {
      setSuggestions([]);
      setSearchState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      fetch(`${API}/market?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market search HTTP ${response.status}`)))
        .then((payload) => {
          setSuggestions((payload.data?.items ?? []).filter(isMarketableItem).slice(0, 8));
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
  }, [query, selectedItem?.name]);

  React.useEffect(() => {
    if (!selectedItem) {
      setPriceState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    const type = toNumber(selectedItem.itemType) === 1 ? "cargo" : "items";
    const regionParam = activeRegion ? `&regionId=${encodeURIComponent(activeRegion)}` : "";
    setPriceState((current) => ({ ...current, error: null, loading: true }));
    fetch(`${API}/market/${type}/${selectedItem.id}/price-history?bucket=1%20day&limit=30${regionParam}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`price history HTTP ${response.status}`)))
      .then((payload) => setPriceState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setPriceState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, [selectedItem, activeRegion, regionChoice]);

  const refreshDealWatches = React.useCallback(() => {
    const controller = new AbortController();
    setWatchState((current) => ({ ...current, error: null, loading: true }));
    fetch(`${LOCAL_API}/market/deal-watches`, { signal: controller.signal })
      .then((response) => response.status === 401 ? { watches: [], settings: null, signedOut: true } : response.ok ? response.json() : Promise.reject(new Error(`deal watches HTTP ${response.status}`)))
      .then((payload) => setWatchState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setWatchState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${LOCAL_API}/auth/me`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { user: null, discordLoginEnabled: false })
      .then((payload) => setAuthState(payload ?? { user: null, discordLoginEnabled: false }))
      .catch(() => {
        if (!controller.signal.aborted) setAuthState({ user: null, discordLoginEnabled: false });
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => refreshDealWatches(), [refreshDealWatches]);

  async function addDealWatch() {
    if (!selectedItem || !activeRegion) return;
    setWatchBusy("add");
    try {
      const response = await fetch(`${LOCAL_API}/market/deal-watches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          regionId: activeRegion,
          itemId: selectedItem.id,
          itemType: toNumber(selectedItem.itemType),
          itemName: selectedItem.name,
          tier: selectedItem.tier ?? selectedItem.itemTier,
          rarity: selectedItem.rarityStr ?? selectedItem.rarity ?? selectedItem.itemRarityStr,
          iconAssetName: selectedItem.iconAssetName ?? selectedItem.assetName ?? selectedItem.itemIconAssetName,
        }),
      });
      if (response.status === 401) {
        window.location.href = `${LOCAL_API}/auth/discord/start?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `deal watch HTTP ${response.status}`);
      }
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
        headers: { "content-type": "application/json" },
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
      const response = await fetch(`${LOCAL_API}/market/deal-watches/${encodeURIComponent(id)}`, { method: "DELETE" });
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
  function chooseItem(item: AnyRecord) {
    setSelectedItem(item);
    setQuery(String(item.name));
    setSuggestions([]);
    updateQueryState({ item: String(item.id), itemName: String(item.name), itemType: String(item.itemType ?? 0), region: activeRegion || "all" });
    trackAnalyticsEvent("price_finder_search", { region: activeRegion ? "selected_region" : "all_regions" });
  }

  const stats = priceState.data?.priceStats ?? {};
  const suggestedWindow = stats.avg24h != null ? "Last 24 Hours" : stats.avg7d != null ? "Last 7 Days" : stats.avg30d != null ? "Last 30 Days" : "";
  const suggestedAverage = stats.avg24h ?? stats.avg7d ?? stats.avg30d;
  const suggestedPrice = suggestedAverage == null ? null : Math.max(1, Math.round(toNumber(suggestedAverage)));
  const tradeCount = toNumber(stats.totalTrades);
  const confidence = tradeCount >= 20 ? "High confidence" : tradeCount >= 5 ? "Medium confidence" : tradeCount > 0 ? "Low confidence" : "No sales data";
  const recentTrades: AnyRecord[] = priceState.data?.recentTrades ?? [];
  const regionLabel = activeRegion ? `R${activeRegion}` : "All Regions";
  const regionIds = unique([
    defaultRegion,
    regionChoice !== "All" ? regionChoice : "",
    ...activeRegions.map((region) => String(region.regionId ?? "")).filter(Boolean),
  ].filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b));
  const dealWatches: AnyRecord[] = Array.isArray(watchState.data?.watches) ? watchState.data.watches : [];
  const dealSettings = watchState.data?.settings ?? {};
  const selectedWatch = selectedItem && activeRegion
    ? dealWatches.find((watch) => String(watch.regionId) === String(activeRegion) && String(watch.itemId) === String(selectedItem.id) && toNumber(watch.itemType) === toNumber(selectedItem.itemType))
    : null;
  const signInHref = `${LOCAL_API}/auth/discord/start?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
  const maxWatches = toNumber(dealSettings.maxWatchesPerUser) || 10;
  return (
    <section className="price-finder">
      <div className="market-command-header price-finder-header">
        <span className="production-command-title"><Search size={15} /> Price lookup</span>
        <span>{regionLabel} completed trades</span>
      </div>
      <div className="price-finder-controls">
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
          <select value={regionChoice} onChange={(event) => { setRegionChoice(event.target.value); updateQueryState({ region: event.target.value === "All" ? "all" : event.target.value }); trackAnalyticsEvent("price_finder_region_changed", { scope: event.target.value === "All" ? "all_regions" : "specific_region" }); }}>
            {regionIds.map((regionId) => {
              const region = activeRegions.find((entry) => String(entry.regionId) === String(regionId)) ?? { regionId };
              return <option value={regionId} key={regionId}>{activeRegionLabel(region, defaultRegion)}</option>;
            })}
            <option value="All">All Regions</option>
          </select>
        </label>
      </div>
      {!selectedItem ? <div className="empty-state price-empty"><CircleDollarSign />Choose an item to examine completed trade pricing.</div> : null}
      {selectedItem && priceState.loading && !priceState.data ? <div className="loading">Loading price history for {selectedItem.name}...</div> : null}
      {priceState.error ? <div className="error">Unable to load price history: {priceState.error}</div> : null}
      {selectedItem && priceState.data ? (
        <>
            <div className="price-finder-heading">
              <div><h3>{selectedItem.name}</h3><span>{regionLabel} market trade history</span></div>
              <div className="price-recommendation">
              <span>Suggested List Price</span>
              <strong>{suggestedPrice == null ? "-" : `${formatNumber(suggestedPrice)}g`}</strong>
                <small>{suggestedWindow ? `Based on ${suggestedWindow.toLowerCase()} average` : "No completed trades in this selection"}</small>
              </div>
              <div className="deal-watch-action">
                {!authState.user ? (
                  <a className="toolbar-button" href={signInHref}><Bell size={15} /> Sign in to watch</a>
                ) : selectedWatch ? (
                  <button className="toolbar-button" type="button" disabled><CheckCircle2 size={15} /> Watching deals</button>
                ) : (
                  <button className="toolbar-button primary" type="button" onClick={addDealWatch} disabled={!activeRegion || watchBusy === "add"} title={!activeRegion ? "Choose a single region before watching an item." : "Watch this item for below-average regional sell listings."}>
                    <Bell size={15} /> {watchBusy === "add" ? "Adding..." : "Watch for deals"}
                  </button>
                )}
                <small>{activeRegion ? `${formatNumber(dealWatches.length)} / ${formatNumber(maxWatches)} watches used` : "Choose one region to watch for deals."}</small>
              </div>
            </div>
            <div className="metric-grid">
            <MiniStat icon={<Activity />} label="Last 24 Hours" value={stats.avg24h == null ? "-" : `${formatNumber(Math.round(stats.avg24h))}g`} title="Average completed-trade unit price during the last 24 hours." />
            <MiniStat icon={<TrendingUp />} label="Last 7 Days" value={stats.avg7d == null ? "-" : `${formatNumber(Math.round(stats.avg7d))}g`} />
            <MiniStat icon={<CircleDollarSign />} label="Last 30 Days" value={stats.avg30d == null ? "-" : `${formatNumber(Math.round(stats.avg30d))}g`} />
            <MiniStat icon={<ShoppingCart />} label="Trade Volume" value={formatNumber(stats.totalVolume)} />
            <MiniStat icon={<CheckCircle2 />} label="Price Confidence" value={confidence} />
          </div>
          <p className="legend">Suggested price follows the most recent available completed-trade average and is rounded to whole gold. Review recent trades and active listings before posting.</p>
          <section className="deal-watchlist-section">
            <h3><Bell size={17} /> Deal Watchlist <small>{authState.user ? `${formatNumber(dealWatches.length)} watched items` : "Discord sign-in required"}</small></h3>
            {watchState.error ? <div className="error">Deal watchlist: {watchState.error}</div> : null}
            {!authState.user ? (
              <div className="deal-watch-empty"><span>Sign in with Discord to save watched items and receive deal alerts.</span><a className="toolbar-button" href={signInHref}>Sign in with Discord</a></div>
            ) : dealWatches.length ? (
              <div className="deal-watch-list">
                {dealWatches.map((watch) => (
                  <article className="deal-watch-row" key={String(watch.id)}>
                    <ItemLabel item={{ ...watch, name: watch.itemName, tier: watch.tier, rarity: watch.rarity, iconAssetName: watch.iconAssetName }} name={String(watch.itemName ?? "Unknown item")} />
                    <div className="deal-watch-meta">
                      <span>R{watch.regionId}</span>
                      <label className="deal-watch-threshold"><span>Alert at</span><input type="number" min={1} max={95} step={1} key={String(watch.thresholdPercent)} defaultValue={Math.round(toNumber(watch.thresholdPercent) || 30)} disabled={watchBusy === String(watch.id)} onBlur={(event) => saveDealWatchThreshold(watch, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><em>% below average</em></label>
                      <span>Last checked {watch.lastCheckedAt ? timeAgo(watch.lastCheckedAt) : "not yet"}</span>
                      <span>Last alert {watch.lastAlertAt ? timeAgo(watch.lastAlertAt) : "none"}</span>
                    </div>
                    <div className="deal-watch-actions">
                      <button className="toolbar-button" type="button" disabled={watchBusy === String(watch.id)} onClick={() => updateDealWatch(watch, { enabled: !watch.enabled })}>{watch.enabled ? "Disable" : "Enable"}</button>
                      <button className="toolbar-button danger" type="button" disabled={watchBusy === String(watch.id)} onClick={() => deleteDealWatch(watch)}><X size={14} /> Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="deal-watch-empty"><span>No watched items yet. Search an item and choose a single region, then click Watch for deals.</span></div>
            )}
          </section>
          <section>
            <h3><ShoppingBag size={17} /> Recent Trades <small>{formatNumber(stats.totalTrades)} total trades</small></h3>
            <DataTable rows={recentTrades.slice(0, 15)} columns={[
              ["When", row => dateLabel(row.timestamp ?? row.createdAt)],
              ["Unit Price", row => `${formatNumber(row.unitPrice ?? row.price)}g`],
              ["Quantity", row => formatNumber(row.quantity)],
              ["Value", row => `${formatNumber(row.totalPrice ?? row.total_value ?? toNumber(row.quantity) * toNumber(row.unitPrice))}g`],
              ["Seller", row => row.sellerUsername ?? "-"],
              ["Buyer", row => row.purchaserUsername ?? row.buyerUsername ?? "-"],
            ]} />
          </section>
        </>
      ) : null}
    </section>
  );
}

export function BuyOrderFinder({ monitoredRegionId }: { monitoredRegionId: string }) {
  const defaultRegion = monitoredRegionId || "19";
  const [search, setSearch] = usePersistedState("market.buyOrders.search", "");
  const [regionChoice, setRegionChoice] = usePersistedState("market.buyOrders.region", defaultRegion);
  const activeRegions = useActiveRegions(defaultRegion);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = usePersistedState("market.buyOrders.pageSize", "50");
  const [sort, setSort] = React.useState("unitPrice");
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc");
  const [state, setState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: true });

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const region = params.get("buyRegion");
    if (region) setRegionChoice(region === "all" ? "All" : region);
  }, [setRegionChoice]);

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        regionId: regionChoice === "All" ? "all" : regionChoice,
        search: search.trim(),
        page: String(page),
        pageSize: String(pageSize),
        sort,
        direction,
      });
      setState((current) => ({ ...current, error: null, loading: true }));
      fetch(`${LOCAL_API}/market/buy-orders?${params}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`buy orders HTTP ${response.status}`)))
        .then((payload) => setState({ data: payload, error: null, loading: false }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ data: null, error: "Unable to load cached buy orders", loading: false });
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [regionChoice, search, page, pageSize, sort, direction]);

  const regionIds = unique([
    defaultRegion,
    regionChoice !== "All" ? regionChoice : "",
    ...activeRegions.map((region) => String(region.regionId ?? "")).filter(Boolean),
  ].filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b));
  const rows: AnyRecord[] = state.data?.rows ?? [];
  const opportunities: AnyRecord[] = state.data?.opportunities ?? [];
  const total = toNumber(state.data?.total);
  const pageCount = toNumber(state.data?.pageCount) || 1;
  const bestOrder = rows[0];
  const marketCount = new Set(rows.map((order) => order.marketClaimId || order.marketClaimName)).size;
  const regionLabel = regionChoice === "All" ? "All Regions" : `R${regionChoice}`;

  function setRegion(nextRegion: string) {
    setRegionChoice(nextRegion);
    setPage(1);
    updateQueryState({ buyRegion: nextRegion === "All" ? "all" : nextRegion });
    trackAnalyticsEvent("buy_order_region_filter", { region: nextRegion === "All" ? "all_regions" : "selected_region" });
  }

  function changeSort(nextSort: string) {
    if (sort === nextSort) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSort(nextSort);
      setDirection(nextSort === "item" || nextSort === "buyer" || nextSort === "settlement" ? "asc" : "desc");
    }
    setPage(1);
  }

  function SortHeader({ id, children }: { id: string; children: React.ReactNode }) {
    const active = sort === id;
    return (
      <button className={`table-sort-button ${active ? "is-sorted" : ""}`} type="button" onClick={() => changeSort(id)}>
        {children}
        <span className="table-sort-indicator">{active ? (direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}</span>
      </button>
    );
  }

  return (
    <section className="price-finder buy-order-finder">
      <div className="market-command-header price-finder-header">
        <span className="production-command-title"><ShoppingBag size={15} /> Buy order lookup</span>
        <span>{state.loading ? "Updating cached orders..." : `${formatNumber(total)} cached orders`}</span>
      </div>
      <div className="price-finder-controls">
        <label className="research-filter-field price-item-search">
          <span>Search buy orders</span>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Item, buyer, settlement, rarity..." />
        </label>
        <label className="research-filter-field price-region-field">
          <span>Region</span>
          <select value={regionChoice} onChange={(event) => setRegion(event.target.value)}>
            {regionIds.map((regionId) => {
              const region = activeRegions.find((entry) => String(entry.regionId) === String(regionId)) ?? { regionId };
              return <option value={regionId} key={regionId}>{activeRegionLabel(region, defaultRegion)}</option>;
            })}
            <option value="All">All Regions</option>
          </select>
        </label>
        <label className="research-filter-field price-page-size-field">
          <span>Rows</span>
          <select value={pageSize} onChange={(event) => { setPageSize(event.target.value); setPage(1); }}>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
        </label>
      </div>
      {state.error ? <div className="error">Unable to load cached buy orders: {state.error}</div> : null}
      <div className="metric-grid">
        <MiniStat icon={<ShoppingBag />} label="Current Buy Orders" value={formatNumber(total)} />
        <MiniStat icon={<CircleDollarSign />} label="Best Unit Price" value={bestOrder ? `${formatNumber(bestOrder.unitPrice)}g` : "-"} />
        <MiniStat icon={<Package />} label="Visible Demand" value={formatNumber(rows.reduce((sum, order) => sum + toNumber(order.quantity), 0))} />
        <MiniStat icon={<TrendingUp />} label="Visible Buy Value" value={formatCompactNumber(rows.reduce((sum, order) => sum + toNumber(order.totalValue), 0))} />
        <MiniStat icon={<ShoppingCart />} label="Markets Visible" value={formatNumber(marketCount)} />
      </div>
      <section className="buy-order-opportunities">
        <h3><TrendingUp size={17} /> Best Opportunities <small>Requires 3+ same-region sales in the last 7 days</small></h3>
        {opportunities.length ? (
          <div className="opportunity-strip">
            {opportunities.map((order) => (
              <article className="opportunity-card" key={order.orderKey}>
                <ItemIcon item={order} />
                <div>
                  <strong>{order.itemName}</strong>
                  <span>{formatNumber(order.unitPrice)}g buy order vs {formatNumber(Math.round(toNumber(order.averageUnitPrice)))}g average</span>
                  <small>{formatNumber(order.quantity)} wanted at {order.marketClaimName || `R${order.regionId}`}</small>
                </div>
                <b>{formatNumber(Math.round(toNumber(order.premiumPercent)))}% above 7d avg</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state price-empty"><TrendingUp />No high-confidence opportunities yet. Orders still appear in the table below.</div>
        )}
      </section>
      <section>
        <h3><ShoppingBag size={17} /> Current Buy Orders <small>{regionLabel}</small></h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th><SortHeader id="item">Item</SortHeader></th>
                <th><SortHeader id="tier">Tier</SortHeader></th>
                <th><SortHeader id="rarity">Rarity</SortHeader></th>
                <th><SortHeader id="region">Region</SortHeader></th>
                <th><SortHeader id="buyer">Buyer</SortHeader></th>
                <th><SortHeader id="settlement">Settlement</SortHeader></th>
                <th><SortHeader id="quantity">Qty</SortHeader></th>
                <th><SortHeader id="unitPrice">Unit Price</SortHeader></th>
                <th><SortHeader id="totalValue">Total Value</SortHeader></th>
                <th><SortHeader id="premium">Premium</SortHeader></th>
                <th><SortHeader id="lastSeen">Last Seen</SortHeader></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.orderKey}>
                  <td><ItemLabel item={order} /></td>
                  <td>{order.tier ? <TierBadge tier={order.tier} /> : "-"}</td>
                  <td>{order.rarity ? <RarityBadge rarity={order.rarity} /> : "-"}</td>
                  <td>{order.regionName || (order.regionId ? `R${order.regionId}` : "-")}</td>
                  <td>{order.buyerName || "-"}</td>
                  <td>{order.marketClaimName || "-"}</td>
                  <td>{formatNumber(order.quantity)}</td>
                  <td>{formatNumber(order.unitPrice)}g</td>
                  <td>{formatNumber(order.totalValue)}g</td>
                  <td>{order.premiumPercent == null ? <span className="muted">No sales baseline</span> : `${formatNumber(Math.round(order.premiumPercent))}%`}</td>
                  <td>{order.lastSeen ? timeAgo(order.lastSeen) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <div className="empty-state price-empty"><ShoppingBag />{state.loading ? "Loading cached buy orders..." : total ? "No buy orders match your search." : "No cached buy orders are available for this region yet. The regional buy-order collector may not have populated it."}</div> : null}
        </div>
        <div className="pagination-row">
          <span>{formatNumber(total)} matching orders - page {page} of {pageCount}</span>
          <div>
            <button className="toolbar-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <button className="toolbar-button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
          </div>
        </div>
      </section>
    </section>
  );
}

export function PublicCraftFinder({ refreshToken, monitoredRegionId, monitoredOwnerName, defaultRegionId, onShowMap }: { refreshToken: number; monitoredRegionId: string; monitoredOwnerName?: string; defaultRegionId?: string; onShowMap: (focus: NonNullable<MapFocus>) => void }) {
  type PublicCraftSortKey = "output" | "tier" | "settlement" | "required" | "remaining" | "availableXp" | "owner";
  const [skillId, setSkillId] = usePersistedState("public-crafts.skill", "All");
  const [regionId, setRegionId] = usePersistedState("public-crafts.region", defaultRegionId || monitoredRegionId || "All");
  const [sortKey, setSortKey] = usePersistedState<PublicCraftSortKey>("public-crafts.sort", "remaining");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("public-crafts.direction", "desc");
  const hasSavedRegion = React.useRef(hasPersistedState("public-crafts.region"));
  const activeRegions = useActiveRegions(monitoredRegionId);
  const [state, setState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: true });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("skill")) setSkillId(params.get("skill")!);
    if (params.get("region")) setRegionId(params.get("region")!);
  }, [setRegionId, setSkillId]);
  React.useEffect(() => {
    const preferredRegion = defaultRegionId || monitoredRegionId;
    if (!hasSavedRegion.current && preferredRegion && regionId === "All") {
      hasSavedRegion.current = true;
      setRegionId(preferredRegion);
    }
  }, [defaultRegionId, monitoredRegionId, regionId, setRegionId]);
  React.useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const skillQuery = skillId === "All" ? "" : `&skillId=${encodeURIComponent(skillId)}`;
    fetch(`${API}/crafts?completed=false${skillQuery}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`crafts HTTP ${response.status}`)))
      .then((payload) => setState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, error: error instanceof Error ? error.message : String(error), loading: false }));
      });
    return () => controller.abort();
  }, [skillId, refreshToken]);
  const jobs: AnyRecord[] = state.data?.craftResults ?? [];
  const itemLookup = new Map([...(state.data?.items ?? []), ...(state.data?.cargos ?? [])].map((item: AnyRecord) => [String(item.id), item]));
  const publicJobs: AnyRecord[] = jobs.filter((job) => job.isPublic === true && !job.completed).map((job): AnyRecord => {
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    const remaining = Math.max(0, total - progress);
    const requiredSkillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
    const experience = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skill_id) === requiredSkillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
    const item = itemLookup.get(String(job.craftedItem?.[0]?.item_id));
    return {
      ...job,
      output: item?.name ?? `Recipe #${job.recipeId ?? "?"}`,
      tier: item?.tier ?? job.tier,
      remaining,
      experience,
      availableXp: remaining * experience,
      requiredSkillId,
      requiredSkillName: SKILL_NAMES[requiredSkillId] ?? `Skill ${requiredSkillId}`,
      minimumLevel: toNumber(job.levelRequirements?.find((requirement: AnyRecord) => toNumber(requirement.skill_id) === requiredSkillId)?.level ?? job.levelRequirements?.[0]?.level),
    };
  }).filter((job) => job.remaining > 0);
  const regions = unique([
    ...activeRegions.map((region) => String(region.regionId)).filter(Boolean),
    ...publicJobs.map((job) => String(job.regionId)).filter(Boolean),
    ...(monitoredRegionId ? [monitoredRegionId] : []),
  ]).sort((a, b) => toNumber(a) - toNumber(b));
  const filteredJobs = publicJobs
    .filter((job) => regionId === "All" || String(job.regionId) === regionId)
    .sort((a, b) => {
      const values: Record<PublicCraftSortKey, (job: AnyRecord) => string | number> = {
        output: (job) => String(job.output ?? ""),
        tier: (job) => toNumber(job.tier),
        settlement: (job) => String(job.claimName ?? ""),
        required: (job) => toNumber(job.minimumLevel),
        remaining: (job) => toNumber(job.remaining),
        availableXp: (job) => toNumber(job.availableXp),
        owner: (job) => String(job.ownerUsername ?? ""),
      };
      const left = values[sortKey](a);
      const right = values[sortKey](b);
      const result = typeof left === "string" || typeof right === "string"
        ? String(left).localeCompare(String(right))
        : Number(left) - Number(right);
      return sortDir === "asc" ? result : -result;
    });
  const visibleJobs = filteredJobs.slice(0, 100);
  const skillName = skillId === "All" ? "All Skills" : SKILL_NAMES[toNumber(skillId)] ?? "Selected skill";
  const highestTier = Math.max(...filteredJobs.map((job) => toNumber(job.tier)), 0);
  const totalAvailableXp = filteredJobs.reduce((sum, job) => sum + toNumber(job.availableXp), 0);
  const activeSettlements = new Set(filteredJobs.map((job) => String(job.claimName ?? job.claimEntityId ?? "")).filter(Boolean)).size;
  function changeSort(nextKey: PublicCraftSortKey) {
    if (nextKey === sortKey) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(nextKey);
      setSortDir(["output", "settlement", "owner"].includes(nextKey) ? "asc" : "desc");
    }
  }
  const columns: Array<[string, PublicCraftSortKey, (job: AnyRecord) => React.ReactNode]> = [
    ["Craft", "output", (job) => <><strong>{job.output}</strong><small className="muted-line">{job.buildingName}</small></>],
    ["Tier", "tier", (job) => job.tier ? <TierBadge tier={job.tier} /> : "-"],
    ["Settlement", "settlement", (job) => <><strong>{job.claimName ?? "Unknown"}</strong>{job.claimLocationX != null && job.claimLocationZ != null ? <button className="map-location-link" onClick={() => { trackAnalyticsEvent("public_craft_map_opened"); onShowMap({ name: `${job.claimName ?? "Public craft"} - ${job.output}`, locationX: toNumber(job.claimLocationX), locationZ: toNumber(job.claimLocationZ) }); }}><MapPin size={12} />R{job.regionId} - {job.claimLocationX}, {job.claimLocationZ}</button> : null}</>],
    ["Required", "required", (job) => `${job.requiredSkillName} Lv ${job.minimumLevel}+`],
    ["Effort to Craft", "remaining", (job) => formatNumber(job.remaining)],
    ["XP Available", "availableXp", (job) => formatNumber(job.availableXp)],
    ["Owner", "owner", (job) => <TrackedOwnerName name={job.ownerUsername ?? "-"} claim={{ ownerPlayerUsername: monitoredOwnerName }} />],
  ];
  return (
    <section className="public-craft-finder">
      <header className="members-topbar public-craft-topbar">
        <div>
          <h2>Public Craft Finder</h2>
          <p>{state.loading && !state.data ? "Loading public jobs..." : `${skillName} - ${formatNumber(filteredJobs.length)} public job${filteredJobs.length === 1 ? "" : "s"}${filteredJobs.length > visibleJobs.length ? ` - top ${visibleJobs.length} shown` : ""}`}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Search size={14} /> {skillName}</span>
            <span>{regionId === "All" ? "All regions" : `R${regionId}`}</span>
          </div>
          <div className="dashboard-settlement-pill">
            {highestTier ? <TierBadge tier={highestTier} /> : <span className="status-pill">No tier</span>}
            <span>Highest public craft tier</span>
          </div>
        </div>
      </header>
      <div className="summary-grid public-craft-summary">
        <MiniStat icon={<Factory />} label="Public Jobs" value={formatNumber(filteredJobs.length)} />
        <MiniStat icon={<Globe2 />} label="Settlements" value={formatNumber(activeSettlements)} />
        <MiniStat icon={<GraduationCap />} label="Skill Filter" value={skillName} />
        <MiniStat icon={<TrendingUp />} label="XP Available" value={formatNumber(totalAvailableXp)} />
      </div>
      <div className="production-command-panel public-craft-command-panel">
        <div className="production-command-main">
          <span className="production-command-title"><Search size={15} /> Craft filters</span>
          <label className="inline-field"><span>Skill</span>
            <select className="select-control" value={skillId} onChange={(event) => { setSkillId(event.target.value); updateQueryState({ skill: event.target.value }); trackAnalyticsEvent("public_craft_skill_filter_used", { scope: event.target.value === "All" ? "all_skills" : "specific_skill" }); }}>
              <option value="All">All Skills</option>
              {SKILL_IDS.map((id) => <option key={id} value={id}>{SKILL_NAMES[id]}</option>)}
            </select>
          </label>
          <label className="inline-field"><span>Region</span>
            <select className="select-control" value={regionId} onChange={(event) => { setRegionId(event.target.value); updateQueryState({ region: event.target.value }); trackAnalyticsEvent("public_craft_region_filter_used", { scope: event.target.value === "All" ? "all_regions" : "specific_region" }); }}>
              <option>All</option>{regions.map((id) => {
                const region = activeRegions.find((entry) => String(entry.regionId) === String(id)) ?? { regionId: id };
                return <option key={id} value={id}>{activeRegionLabel(region, monitoredRegionId)}</option>;
              })}
            </select>
          </label>
        </div>
        <div className="public-craft-hint">
          <MapPin size={13} />
          <span>Click a settlement location to open it on the map. Column headings sort the results.</span>
        </div>
      </div>
      {state.error ? <div className="error">Failed to load public crafts: {state.error}</div> : null}
      {!state.loading && !state.error && visibleJobs.length === 0 ? <div className="empty-state"><Factory />No public {skillName.toLowerCase()} jobs found.</div> : null}
      {visibleJobs.length ? <div className="table-wrap"><table><thead><tr>{columns.map(([label, key]) => <th key={key}><button className="sort-button" onClick={() => changeSort(key)}>{label}{sortKey === key ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}</button></th>)}</tr></thead><tbody>{visibleJobs.map((job, index) => <tr className="data-row" key={job.entityId ?? index}>{columns.map(([label, , render]) => <td key={label}>{render(job)}</td>)}</tr>)}</tbody></table></div> : null}
    </section>
  );
}

export function MemberPassiveCrafts({ members, refreshToken }: { members: AnyRecord[]; refreshToken: number }) {
  const [state, setState] = React.useState<LoadState<AnyRecord[]>>({ data: null, error: null, loading: true });
  const memberKey = members.map((member) => String(member.playerEntityId ?? "")).filter(Boolean).join(",");
  React.useEffect(() => {
    if (!memberKey) {
      setState({ data: [], error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => previous.data ? { ...previous, loading: true, error: null } : { data: null, error: null, loading: true });
    const memberEntries = members.filter((member) => member.playerEntityId);
    fetch(`${LOCAL_API}/passive-crafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ members: memberEntries.map((member) => ({
        playerEntityId: member.playerEntityId,
        userName: member.userName ?? member.username,
      })) }),
      signal: controller.signal,
    }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`passive crafts HTTP ${response.status}`)))
      .then((payload) => {
      if (controller.signal.aborted) return;
      const rows = (payload.rows ?? []) as AnyRecord[];
      const failures = toNumber(payload.failed);
      setState({
        data: rows,
        error: failures ? `${failures} member${failures === 1 ? "" : "s"} could not be loaded.` : null,
        loading: false,
      });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        data: previous.data ?? [],
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      }));
    });
    return () => controller.abort();
  }, [memberKey, refreshToken]);
  const rows = state.data ?? [];
  return (
    <section className="settlement-passive-crafts">
      <div className="split-header">
        <div className="dashboard-section-heading">
          <h3><Factory size={15} /> Member Passive Crafts</h3>
          <p>Recent public passive output for current settlement members. BitJita does not report craft location, so entries may have been performed elsewhere.</p>
        </div>
        {state.loading && rows.length ? <span className="refreshing-label">Updating...</span> : null}
      </div>
      {state.error ? <p className="legend">{state.error}</p> : null}
      {state.loading && !state.data ? <p className="legend">Loading passive craft history...</p> : null}
      {!state.loading && rows.length === 0 ? <div className="empty-state"><Factory />No passive craft history reported for settlement members.</div> : null}
      {rows.length ? <DataTable rows={rows} columns={[
        ["Output", (row) => <strong>{row.recipe}</strong>],
        ["Tier", (row) => row.tier ? <TierBadge tier={row.tier} /> : "-"],
        ["Member", (row) => row.memberName],
        ["Structure", (row) => row.structure],
        ["Status", (row) => <span className={`status-pill ${row.status === "complete" ? "complete" : ""}`}>{formatEquipmentSlot(row.status)}</span>],
        ["Quantity", (row) => formatNumber(row.quantity)],
        ["Latest", (row) => timeAgo(row.timestamp)],
      ]} /> : null}
    </section>
  );
}

export function Production({ data, refreshToken, selectedMemberId, onSelectMember }: { data: ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }; refreshToken: number; selectedMemberId: string; onSelectMember: (id: string) => void }) {
  type ProductionSortKey = "tier" | "totalXp" | "remainingXp" | "remainingEffort" | "completion" | "name";
  const [sortKey, setSortKey] = usePersistedState<ProductionSortKey>("production.sort", "tier");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("production.direction", "desc");
  const [showPrivateCrafts, setShowPrivateCrafts] = usePersistedState("production.showPrivateCrafts", true);
  const [toolbeltTools, setToolbeltTools] = React.useState<AnyRecord[] | null>(null);
  const [toolbeltError, setToolbeltError] = React.useState(false);
  const toolsForMemberRef = React.useRef<string | null>(null);
  const observedCraftProgressRef = React.useRef<Map<string, number>>(new Map());
  const [observedMovingCrafts, setObservedMovingCrafts] = React.useState<Set<string>>(() => new Set());
  const itemLookup = new Map([...(data.raw?.crafts?.items ?? []), ...(data.raw?.crafts?.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const selectedMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  const selectedCitizen = selectedMember ? data.citizens.find((citizen: AnyRecord) => String(citizen.userName ?? citizen.username) === String(selectedMember.userName ?? selectedMember.username)) ?? null : null;
  const craftProgressSignature = React.useMemo(() => data.crafts.map((job: AnyRecord) => [
    craftProgressKey(job),
    toNumber(job.progress),
    toNumber(job.totalActionsRequired),
  ].join(":")).join("|"), [data.crafts]);
  React.useEffect(() => {
    const previous = observedCraftProgressRef.current;
    const next = new Map<string, number>();
    const moving = new Set<string>();
    for (const job of data.crafts) {
      const key = craftProgressKey(job);
      const progress = toNumber(job.progress);
      const total = toNumber(job.totalActionsRequired);
      const previousProgress = previous.get(key);
      if (previousProgress != null && progress > previousProgress && (!total || progress < total)) moving.add(key);
      next.set(key, progress);
    }
    observedCraftProgressRef.current = next;
    setObservedMovingCrafts(moving);
  }, [craftProgressSignature]);
  const isCraftObservedMoving = React.useCallback((job: AnyRecord) => observedMovingCrafts.has(craftProgressKey(job)), [observedMovingCrafts]);
  const isCraftWorking = React.useCallback((job: AnyRecord, contributors: AnyRecord[]) => {
    return hasRecentCraftContribution(contributors) || isCraftObservedMoving(job);
  }, [isCraftObservedMoving]);
  React.useEffect(() => {
    if (!selectedMember?.playerEntityId) {
      setToolbeltTools(null);
      setToolbeltError(false);
      toolsForMemberRef.current = null;
      return;
    }
    const controller = new AbortController();
    const memberId = String(selectedMember.playerEntityId);
    if (toolsForMemberRef.current !== memberId) {
      toolsForMemberRef.current = memberId;
      setToolbeltTools(null);
    }
    setToolbeltError(false);
    fetch(`${API}/players/${memberId}/inventories`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`inventories HTTP ${response.status}`)))
      .then((payload) => setToolbeltTools(playerToolbeltTools(payload)))
      .catch(() => { if (!controller.signal.aborted) setToolbeltError(true); });
    return () => controller.abort();
  }, [selectedMember?.playerEntityId, refreshToken]);
  function eligibility(job: AnyRecord) {
    if (!selectedMember) return null;
    const requirement = job.levelRequirements?.[0] ?? {};
    const requiredLevel = toNumber(requirement.level);
    const skillId = toNumber(requirement.skill_id);
    const skillName = SKILL_NAMES[skillId] ?? "Required skill";
    const memberLevel = toNumber(selectedCitizen?.skills?.[String(skillId)]);
    const skillOk = memberLevel >= requiredLevel;
    const toolRequirement = job.toolRequirements?.[0];
    const maxToolCraftTier = (item: AnyRecord) => toNumber(item.tier) + 1;
    const craftTier = toNumber(toolRequirement?.level);
    const expectedTool = toolRequirement ? TOOL_TAG_BY_TYPE[toNumber(toolRequirement.tool_type)] : null;
    const ownedTool = !toolRequirement ? null : (toolbeltTools ?? []).find((item) => {
      const correctType = toNumber(item.toolType) === toNumber(toolRequirement.tool_type) ||
        String(item.tags ?? item.tag ?? "") === expectedTool;
      return correctType && maxToolCraftTier(item) >= craftTier;
    });
    if (!skillOk) return { ok: false, text: `Needs ${skillName} Lv ${requiredLevel} (has ${memberLevel})` };
    if (toolbeltError && toolbeltTools == null) return { ok: false, pending: true, text: "Toolbelt unavailable" };
    if (toolRequirement && toolbeltTools == null) return { ok: false, pending: true, text: "Checking Toolbelt..." };
    if (toolRequirement && !ownedTool) return { ok: false, text: `Needs T${Math.max(1, craftTier - 1)}+ ${expectedTool ?? "required tool"} in Toolbelt` };
    return { ok: true, text: `Can craft - ${skillName} Lv ${memberLevel}${ownedTool ? ` - ${ownedTool.name} (${formatNumber(ownedTool.toolPower)} power)` : ""}` };
  }
  const privateCrafts = data.crafts.filter((job) => job.isPublic === false);
  const visibleCrafts = showPrivateCrafts ? data.crafts : data.crafts.filter((job) => job.isPublic !== false);
  const jobs = [...visibleCrafts].sort((a, b) => {
    const aMetrics = productionMetrics(a, itemLookup);
    const bMetrics = productionMetrics(b, itemLookup);
    const aValue = sortKey === "remainingEffort" ? aMetrics.remaining : aMetrics[sortKey];
    const bValue = sortKey === "remainingEffort" ? bMetrics.remaining : bMetrics[sortKey];
    const comparison = sortKey === "name"
      ? String(aValue).localeCompare(String(bValue))
      : toNumber(aValue) - toNumber(bValue);
    if (comparison !== 0) return sortDir === "asc" ? comparison : -comparison;
    const aActive = isCraftWorking(a, data.contributions[String(a.entityId)] ?? []) ? 1 : 0;
    const bActive = isCraftWorking(b, data.contributions[String(b.entityId)] ?? []) ? 1 : 0;
    return bActive - aActive || bMetrics.completion - aMetrics.completion;
  });
  const crafterCounts = visibleCrafts.reduce<Record<string, number>>((acc, job) => {
    const name = String(job.ownerUsername ?? "Unknown");
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const activeJobs = jobs.filter((job) => {
    const total = toNumber(job.totalActionsRequired);
    return total > toNumber(job.progress) && isCraftWorking(job, data.contributions[String(job.entityId)] ?? []);
  }).length;
  const totalProductionXp = jobs.reduce((sum, job) => sum + productionMetrics(job, itemLookup).totalXp, 0);
  const remainingProductionXp = jobs.reduce((sum, job) => sum + productionMetrics(job, itemLookup).remainingXp, 0);
  const highestTier = Math.max(...jobs.map((job) => productionMetrics(job, itemLookup).tier), 0);

  return (
    <div className="panel production-page">
      <header className="members-topbar production-topbar">
        <div>
          <h2>Active Production</h2>
          <p>{visibleCrafts.length === 0 ? "No active crafting jobs" : `${activeJobs} active now - ${visibleCrafts.length} jobs across ${Object.keys(crafterCounts).length} crafters`}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Factory size={14} /> {formatNumber(visibleCrafts.length)} shown</span>
            {privateCrafts.length ? <span><Lock size={14} /> {formatNumber(privateCrafts.length)} private</span> : null}
            <span>{formatNumber(Object.keys(crafterCounts).length)} crafters</span>
          </div>
          <div className="dashboard-settlement-pill">
            {highestTier ? <TierBadge tier={highestTier} /> : <span className="status-pill">No tier</span>}
            <span>Highest craft tier</span>
          </div>
        </div>
      </header>
      <div className="summary-grid production-summary">
        <MiniStat icon={<Factory />} label="Total Jobs" value={formatNumber(visibleCrafts.length)} />
        <MiniStat icon={<Activity />} label="Active Now" value={formatNumber(activeJobs)} />
        <MiniStat icon={<TrendingUp />} label="Total XP" value={formatNumber(totalProductionXp)} />
        <MiniStat icon={<Star />} label="XP Remaining" value={formatNumber(remainingProductionXp)} />
      </div>
      <div className="production-command-panel">
        <div className="production-command-main">
          <span className="production-command-title"><Wrench size={15} /> Production controls</span>
          <label className="inline-field"><span>Member</span>
            <select className="select-control" value={selectedMemberId} onChange={(event) => { onSelectMember(event.target.value); trackAnalyticsEvent("production_eligibility_filter_used", { scope: event.target.value === "All" ? "all_members" : "member" }); }}>
              <option value="All">All members</option>
              {data.members.map((member: AnyRecord) => <option key={member.playerEntityId} value={String(member.playerEntityId)}>{member.userName ?? member.username}</option>)}
            </select>
          </label>
          <label className="inline-field"><span>Sort by</span>
            <select className="select-control" value={sortKey} onChange={(event) => setSortKey(event.target.value as ProductionSortKey)}>
              <option value="tier">Tier</option>
              <option value="totalXp">Total XP</option>
              <option value="remainingXp">XP Remaining</option>
              <option value="remainingEffort">Effort Remaining</option>
              <option value="completion">Completion</option>
              <option value="name">Item Name</option>
            </select>
          </label>
          <Segmented options={["Descending", "Ascending"]} value={sortDir === "desc" ? "Descending" : "Ascending"} onChange={(direction) => setSortDir(direction === "Descending" ? "desc" : "asc")} label="Direction" />
          <label className="production-private-toggle"><span><Lock size={13} /> Show private crafts</span><input type="checkbox" checked={showPrivateCrafts} onChange={(event) => setShowPrivateCrafts(event.target.checked)} /></label>
        </div>
        {Object.keys(crafterCounts).length ? (
          <div className="production-crafter-line">
            <span>Current crafters</span>
            <div className="crafter-pills">
              {Object.entries(crafterCounts).map(([name, count]) => (
                <span key={name}>
                  <User size={12} />
                  <strong><TrackedOwnerName name={name} claim={data.claim} /></strong>
                  <small>{count}</small>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {selectedMember ? <div className="production-member-banner"><User size={15} /><span>Checking jobs for</span><strong><TrackedOwnerName name={selectedMember.userName ?? selectedMember.username} claim={data.claim} /></strong><small>Requires skill level and a suitable Toolbelt tool. A tool can craft one tier above its own tier; power controls effort per action.</small></div> : null}
      {data.crafts.length === 0 ? <div className="empty-state"><Factory />No crafting jobs are currently active.</div> : null}
      {data.crafts.length > 0 && visibleCrafts.length === 0 ? <div className="empty-state"><Lock />Private crafts are hidden by your Production controls.</div> : null}
      <div className="production-grid">
        {jobs.map((job, index) => {
          const first = job.craftedItem?.[0] ?? {};
          const { item, skillId, experiencePerEffort, total, progress, remaining, totalXp, remainingXp, tier } = productionMetrics(job, itemLookup);
          const skillName = SKILL_NAMES[skillId] ?? job.levelRequirements?.[0]?.skillName ?? (skillId ? `Skill ${skillId}` : null);
          const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
          const contributors: AnyRecord[] = data.contributions[String(job.entityId)] ?? [];
          const isWorking = total > progress && isCraftWorking(job, contributors);
          const isDone = total > 0 && progress >= total;
          const status = isWorking ? "Active now" : isDone ? "Ready" : progress > 0 ? "Paused" : "Queued";
          const eligibilityStatus = eligibility(job);
          return (
            <article className={`production-card ${isWorking ? "active-work" : ""} ${eligibilityStatus?.ok ? "can-craft" : ""}`} key={job.entityId ?? index}>
              <header>
                <div><Factory size={15} /><strong>{job.buildingName ?? "Unknown Structure"}{job.isPublic === false ? <span className="private-craft-pill" title="Private craft. BitJita returned this through member craft data with isPublic false."><Lock size={11} /> Private</span> : null}</strong><span><TrackedOwnerName name={job.ownerUsername ?? "Unknown"} claim={data.claim} /></span></div>
                <p><span className={`status-pill ${isWorking ? "working" : ""}`}>{status}</span>{skillName ? <small>{skillName} Lv {job.levelRequirements?.[0]?.level ?? 1}+</small> : null}</p>
              </header>
              <section>
                <div className={`craft-title ${item?.iconAssetName ? "has-icon" : ""}`}>{item?.iconAssetName ? <ItemIcon item={item} /> : null}<h3>{item?.name ?? (skillName ? `${skillName} craft` : `Item #${first.item_id ?? "?"}`)}</h3>{tier ? <TierBadge tier={tier} /> : null}</div>
                {!item.name && job.recipeId ? <small>recipe #{job.recipeId}</small> : null}
                <div className="work-chips">
                  <span>{formatNumber(job.craftCount)} craft{toNumber(job.craftCount) === 1 ? "" : "s"}</span>
                  <span>{formatNumber(remaining)} effort to craft</span>
                  {experiencePerEffort ? <span>{formatNumber(totalXp)} total XP</span> : null}
                </div>
                <div className="progress-meta"><span>Effort applied</span><span>{formatNumber(progress)} / {formatNumber(total)}</span></div>
                <div className={`progress ${isWorking ? "is-moving" : ""}`}><div style={{ width: `${pct}%` }} /></div>
                <div className="progress-meta"><strong>{pct}%</strong><span>{experiencePerEffort ? `${formatNumber(remainingXp)} XP remaining` : "XP not provided"}</span></div>
                {eligibilityStatus ? <div className={`eligibility-pill ${eligibilityStatus.ok ? "eligible" : eligibilityStatus.pending ? "pending" : "blocked"}`}>{eligibilityStatus.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{eligibilityStatus.text}</div> : null}
                {contributors.length ? (
                  <div className="contributors">
                    <small>Contributors</small>
                    {contributors.slice(0, 3).map((person) => (
                      <span key={person.contributorEntityId}><strong><TrackedOwnerName name={person.contributorUsername ?? "Unknown"} claim={data.claim} /></strong> {formatNumber(person.totalProgressContributed)} progress - {timeAgo(person.lastContributedAt)}</span>
                    ))}
                  </div>
                ) : <small>No contributions recorded by the API.</small>}
              </section>
            </article>
          );
        })}
      </div>
      <MemberPassiveCrafts members={data.members} refreshToken={refreshToken} />
    </div>
  );
}

type LeaderboardTab = "contribution" | "professions" | "activity" | "market" | "online";

const LEADERBOARD_TABS: Array<{ id: LeaderboardTab; label: string; icon: React.ReactNode }> = [
  { id: "contribution", label: "Contribution", icon: <Trophy size={14} /> },
  { id: "professions", label: "Professions", icon: <GraduationCap size={14} /> },
  { id: "activity", label: "Activity", icon: <Activity size={14} /> },
  { id: "market", label: "Market", icon: <CircleDollarSign size={14} /> },
  { id: "online", label: "Online / Sessions", icon: <Users size={14} /> },
];

export function Leaderboard({
  claimId,
  refreshToken,
  excludedMemberIds = [],
  data,
}: {
  claimId: string;
  refreshToken: number;
  excludedMemberIds?: string[];
  data: ReturnType<typeof normalizeData>;
}) {
  const [state, setState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: true });
  const [activeTab, setActiveTab] = usePersistedState<LeaderboardTab>("leaderboard.tab", "contribution");
  const [professionFilter, setProfessionFilter] = React.useState("All");
  const [professionSort, setProfessionSort] = React.useState("totalLevel");
  const [activitySort, setActivitySort] = React.useState("totalEvents");
  const [marketSort, setMarketSort] = React.useState("confirmedSaleValue");
  React.useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    fetch(`${LOCAL_API}/leaderboard?claimId=${encodeURIComponent(claimId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`leaderboard HTTP ${response.status}`)))
      .then((payload) => setState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, [claimId, refreshToken]);
  const leaderboard = state.data ?? {};
  const contributionBoard = leaderboard.contribution ?? leaderboard;
  const excludedLeaderboardKeys = React.useMemo(() => new Set(excludedMemberIds.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean)), [excludedMemberIds]);
  const isExcluded = React.useCallback((entry: AnyRecord) => memberTrackingKeys(entry).some((key) => excludedLeaderboardKeys.has(key)), [excludedLeaderboardKeys]);
  const contributors: AnyRecord[] = React.useMemo(() => {
    const rows = contributionBoard.contributors ?? [];
    if (!excludedLeaderboardKeys.size) return rows;
    return rows.filter((entry: AnyRecord) => !memberTrackingKeys({ playerEntityId: entry.contributorId, userName: entry.name }).some((key) => excludedLeaderboardKeys.has(key)));
  }, [contributionBoard.contributors, excludedLeaderboardKeys]);
  const recent: AnyRecord[] = React.useMemo(() => {
    const rows = contributionBoard.recent ?? [];
    if (!excludedLeaderboardKeys.size) return rows;
    return rows.filter((entry: AnyRecord) => !memberTrackingKeys({ playerEntityId: entry.contributorId, userName: entry.contributorName }).some((key) => excludedLeaderboardKeys.has(key)));
  }, [contributionBoard.recent, excludedLeaderboardKeys]);
  const professions: AnyRecord[] = React.useMemo(() => {
    const byProfession = new Map<string, AnyRecord>();
    for (const contributor of contributors) {
      for (const row of contributor.professions ?? []) {
        const profession = String(row.profession ?? "Unknown");
        const current = byProfession.get(profession) ?? { profession, totalProgress: 0, totalXp: 0, craftCount: 0, contributorCount: 0, topContributor: "", topContributorProgress: 0 };
        const progress = toNumber(row.progress);
        current.totalProgress += progress;
        current.totalXp += toNumber(row.xp);
        current.craftCount += toNumber(row.crafts);
        current.contributorCount += 1;
        if (progress > current.topContributorProgress) {
          current.topContributor = contributor.name;
          current.topContributorProgress = progress;
        }
        byProfession.set(profession, current);
      }
    }
    return Array.from(byProfession.values()).sort((a, b) => b.totalProgress - a.totalProgress);
  }, [contributors]);
  const summary = React.useMemo(() => ({
    ...(contributionBoard.summary ?? {}),
    contributorCount: contributors.length,
    professionCount: professions.length,
    totalProgress: contributors.reduce((sum, row) => sum + toNumber(row.totalProgress), 0),
    totalXp: contributors.reduce((sum, row) => sum + toNumber(row.totalXp), 0),
    recordedCrafts: contributors.reduce((sum, row) => sum + toNumber(row.craftCount), 0),
    lastContributedAt: recent[0]?.lastContributedAt ?? null,
  }), [contributors, contributionBoard.summary, professions.length, recent]);
  const filteredContributors = professionFilter === "All"
    ? contributors
    : contributors.filter((entry) => entry.professions?.some?.((profession: AnyRecord) => profession.profession === professionFilter));
  const topContributor = contributors[0];
  const topProfession = professions[0];
  const professionRows = bitjitaSkillRows(data.skills, "Profession");
  const professionIds = professionRows.length ? professionRows.map((skill) => toNumber(skill.id)).filter(Boolean) : PROFESSION_IDS;
  const professionLabel = (id: number) => skillNameFromRows(professionRows, id) || SKILL_NAMES[id] || `Profession ${id}`;
  const citizens: AnyRecord[] = React.useMemo(() => {
    const rows = data.citizens ?? [];
    if (!excludedLeaderboardKeys.size) return rows;
    return rows.filter((entry) => !isExcluded({ playerEntityId: entry.playerEntityId ?? entry.entityId, userName: entry.userName ?? entry.username }));
  }, [data.citizens, excludedLeaderboardKeys.size, isExcluded]);
  const professionCompareRows = React.useMemo(() => citizens.map((citizen) => {
    const skills = citizen.skills ?? {};
    const levels = professionIds.map((id) => ({ id, name: professionLabel(id), level: toNumber(skills[String(id)]) }));
    const highest = levels.reduce((best, row) => row.level > best.level ? row : best, { id: 0, name: "None yet", level: 0 });
    return {
      entityId: citizen.entityId ?? citizen.playerEntityId ?? citizen.userName,
      name: citizen.userName ?? citizen.username ?? "Unknown member",
      totalLevel: professionIds.reduce((total, id) => total + toNumber(skills[String(id)]), 0),
      totalXp: toNumber(citizen.totalXP ?? citizen.totalXp),
      highestLevel: highest.level,
      highestProfession: highest.name,
      highestTier: skillTier(highest.level),
      selectedLevel: professionFilter === "All" ? highest.level : toNumber(skills[String(professionIds.find((id) => professionLabel(id) === professionFilter) ?? "")]),
      levels,
    };
  }), [citizens, professionFilter, professionIds, professionRows]);
  const professionSortValue = (row: AnyRecord) => {
    if (professionSort === "totalXp") return toNumber(row.totalXp);
    if (professionSort === "highestLevel") return toNumber(row.highestLevel);
    if (professionSort === "selectedLevel") return toNumber(row.selectedLevel);
    return toNumber(row.totalLevel);
  };
  const sortedProfessionRows = [...professionCompareRows]
    .filter((row) => professionFilter === "All" || row.levels.some((level: AnyRecord) => level.name === professionFilter))
    .sort((a, b) => professionSortValue(b) - professionSortValue(a) || String(a.name).localeCompare(String(b.name)));
  const marketRows: AnyRecord[] = React.useMemo(() => {
    const rows = leaderboard.market?.members ?? [];
    if (!excludedLeaderboardKeys.size) return rows;
    return rows.filter((entry: AnyRecord) => !isExcluded({ playerEntityId: entry.memberId, userName: entry.name }));
  }, [excludedLeaderboardKeys.size, isExcluded, leaderboard.market?.members]);
  const sortedMarketRows = [...marketRows].sort((a, b) => toNumber(b[marketSort]) - toNumber(a[marketSort]) || String(a.name).localeCompare(String(b.name)));
  const activityRows: AnyRecord[] = React.useMemo(() => {
    const rows = leaderboard.activity?.members ?? [];
    if (!excludedLeaderboardKeys.size) return rows;
    return rows.filter((entry: AnyRecord) => !isExcluded({ userName: entry.name }));
  }, [excludedLeaderboardKeys.size, isExcluded, leaderboard.activity?.members]);
  const sortedActivityRows = [...activityRows].sort((a, b) => toNumber(b[activitySort]) - toNumber(a[activitySort]) || String(a.name).localeCompare(String(b.name)));
  const playerById = React.useMemo(() => new Map((data.players ?? []).map((player) => [String(player.playerEntityId ?? player.entityId ?? player.id ?? ""), player])), [data.players]);
  const playerByName = React.useMemo(() => new Map((data.players ?? []).map((player) => [String(player.username ?? player.userName ?? "").toLowerCase(), player])), [data.players]);
  const onlineRows = React.useMemo(() => {
    const rows = data.members.map((member) => {
      const playerId = String(member.playerEntityId ?? member.entityId ?? "");
      const player = playerById.get(playerId) ?? playerByName.get(String(member.userName ?? member.username ?? "").toLowerCase()) ?? {};
      return {
        entityId: playerId,
        name: member.userName ?? member.username ?? "Unknown member",
        signedIn: Boolean(player.signedIn ?? player.online),
        sessionSeconds: player.sessionSeconds,
        timePlayedSeconds: player.timePlayedSeconds,
        timeSignedInSeconds: player.timeSignedInSeconds,
        lastLoginTimestamp: member.lastLoginTimestamp,
      };
    });
    return rows.sort((a, b) => Number(b.signedIn) - Number(a.signedIn) || toNumber(b.sessionSeconds) - toNumber(a.sessionSeconds) || String(a.name).localeCompare(String(b.name)));
  }, [data.members, playerById, playerByName]);
  const mostPlayedRow = onlineRows.reduce<AnyRecord | null>((best, row) => toNumber(row.timePlayedSeconds) > toNumber(best?.timePlayedSeconds) ? row : best, null);
  const longestSessionRow = onlineRows.reduce<AnyRecord | null>((best, row) => toNumber(row.sessionSeconds) > toNumber(best?.sessionSeconds) ? row : best, null);
  const activeTabMeta = LEADERBOARD_TABS.find((tab) => tab.id === activeTab) ?? LEADERBOARD_TABS[0];
  const tabSummary = activeTab === "professions" ? [
    <MiniStat key="members" icon={<Users />} label="Members Compared" value={formatNumber(sortedProfessionRows.length)} />,
    <MiniStat key="total" icon={<GraduationCap />} label="Total Profession Levels" value={formatNumber(sortedProfessionRows.reduce((total, row) => total + toNumber(row.totalLevel), 0))} />,
    <MiniStat key="highest" icon={<TrendingUp />} label="Highest Level" value={formatNumber(Math.max(...sortedProfessionRows.map((row) => toNumber(row.highestLevel)), 0))} />,
    <MiniStat key="top" icon={<Trophy />} label="Top Member" value={sortedProfessionRows[0]?.name ?? "None yet"} />,
  ] : activeTab === "activity" ? [
    <MiniStat key="members" icon={<Users />} label="Members With Activity" value={formatNumber(sortedActivityRows.length)} />,
    <MiniStat key="events" icon={<Activity />} label="Recorded Events" value={formatNumber(sortedActivityRows.reduce((total, row) => total + toNumber(row.totalEvents), 0))} />,
    <MiniStat key="top" icon={<Trophy />} label="Most Recorded" value={sortedActivityRows[0]?.name ?? "None yet"} />,
    <MiniStat key="updated" icon={<Clock />} label="Latest Activity" value={leaderboard.activity?.summary?.lastActivityAt ? timeAgo(leaderboard.activity.summary.lastActivityAt) : "No history"} />,
  ] : activeTab === "market" ? [
    <MiniStat key="members" icon={<Users />} label="Market Members" value={formatNumber(sortedMarketRows.length)} />,
    <MiniStat key="listings" icon={<ShoppingBag />} label="Active Listings" value={formatNumber(leaderboard.market?.summary?.activeListings)} />,
    <MiniStat key="sales" icon={<CircleDollarSign />} label="Confirmed Sales Value" value={formatCompactNumber(leaderboard.market?.summary?.confirmedSaleValue)} />,
    <MiniStat key="top" icon={<Trophy />} label="Top Seller" value={sortedMarketRows[0]?.name ?? "None yet"} />,
  ] : activeTab === "online" ? [
    <MiniStat key="online" icon={<Users />} label="Online Now" value={formatNumber(onlineRows.filter((row) => row.signedIn).length)} />,
    <MiniStat key="members" icon={<Users />} label="Tracked Members" value={formatNumber(onlineRows.length)} />,
    <MiniStat key="played" icon={<Trophy />} label="Most Played" value={mostPlayedRow?.timePlayedSeconds ? `${mostPlayedRow.name} - ${formatPlaytime(mostPlayedRow.timePlayedSeconds)}` : "Unavailable"} />,
    <MiniStat key="longest" icon={<Clock />} label="Longest Current Session" value={formatCurrentSession(longestSessionRow?.sessionSeconds) ?? "Unavailable"} />,
  ] : [
    <MiniStat key="progress" icon={<Trophy />} label="Recorded Contribution" value={formatNumber(summary.totalProgress)} />,
    <MiniStat key="xp" icon={<TrendingUp />} label="Estimated XP" value={formatNumber(summary.totalXp)} />,
    <MiniStat key="top" icon={<Users />} label="Top Contributor" value={topContributor?.name ?? "None yet"} />,
    <MiniStat key="profession" icon={<GraduationCap />} label="Top Profession" value={topProfession?.profession ?? "None yet"} />,
  ];
  return (
    <div className="panel leaderboard-page">
      <header className="members-topbar leaderboard-topbar">
        <div>
          <h2>Leaderboard</h2>
          <p>Compare settlement members across contribution, professions, market history, activity, and online status.</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Trophy size={14} /> {formatNumber(summary.contributorCount)} contributors</span>
            <span><Factory size={14} /> {formatNumber(summary.recordedCrafts)} crafts</span>
            <span>{summary.lastContributedAt ? `Updated ${timeAgo(summary.lastContributedAt)}` : "No history yet"}</span>
          </div>
        </div>
      </header>
      <nav className="leaderboard-tabs" aria-label="Leaderboard categories">
        {LEADERBOARD_TABS.map((tab) => (
          <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
      <div className="summary-grid leaderboard-summary">
        {tabSummary}
      </div>
      <section className="dashboard-card leaderboard-card leaderboard-context">
        <header className="dashboard-card-title"><span>{activeTabMeta.icon} {activeTabMeta.label}</span></header>
        <p>{activeTab === "activity" || activeTab === "market" ? "This tab uses local recorded settlement history, so it represents what the app has observed and stored for this claim." : activeTab === "professions" ? "This tab uses current BitJita citizen profession data for the monitored settlement." : activeTab === "online" ? "This tab uses current member and player detail data when BitJita provides it." : "This tab uses recorded BitJita craft contribution data observed by the app."}</p>
      </section>
      {activeTab === "contribution" ? (
      <section className="dashboard-card leaderboard-card">
        <header className="dashboard-card-title">
          <span><Trophy size={14} /> Member standings</span>
          <label className="inline-field leaderboard-filter"><span>Profession</span>
            <select className="select-control" value={professionFilter} onChange={(event) => setProfessionFilter(event.target.value)}>
              <option value="All">All professions</option>
              {professions.map((profession) => <option key={profession.profession} value={profession.profession}>{profession.profession}</option>)}
            </select>
          </label>
        </header>
        {state.loading ? <div className="empty-state"><RefreshCw /> Loading contribution history...</div> : null}
        {state.error ? <div className="error">Failed to load leaderboard: {state.error}</div> : null}
        {!state.loading && !state.error && !contributors.length ? (
          <div className="empty-state"><Trophy />No craft contributions have been recorded yet. The leaderboard starts filling as settlement craft contribution data is observed during refreshes.</div>
        ) : null}
        {filteredContributors.length ? (
          <DataTable
            rows={filteredContributors}
            columns={[
              ["Member", (entry) => <strong>{entry.name}</strong>],
              ["Progress", (entry) => formatNumber(entry.totalProgress)],
              ["Estimated XP", (entry) => formatNumber(entry.totalXp)],
              ["Crafts", (entry) => formatNumber(entry.craftCount)],
              ["Top professions", (entry) => (
                <div className="leaderboard-profession-tags">
                {(entry.professions ?? []).slice(0, 3).map((profession: AnyRecord) => <span key={profession.profession}>{profession.profession} <b>{formatNumber(profession.progress)}</b></span>)}
                </div>
              )],
              ["Last contribution", (entry) => entry.lastContributedAt ? timeAgo(entry.lastContributedAt) : "Unknown"],
            ]}
          />
        ) : null}
      </section>
      ) : null}
      {activeTab === "professions" ? (
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title">
            <span><GraduationCap size={14} /> Profession comparison</span>
            <div className="leaderboard-control-row">
              <label className="inline-field leaderboard-filter"><span>Profession</span>
                <select className="select-control" value={professionFilter} onChange={(event) => setProfessionFilter(event.target.value)}>
                  <option value="All">All professions</option>
                  {professionIds.map((id) => <option key={id} value={professionLabel(id)}>{professionLabel(id)}</option>)}
                </select>
              </label>
              <label className="inline-field leaderboard-filter"><span>Sort by</span>
                <select className="select-control" value={professionSort} onChange={(event) => setProfessionSort(event.target.value)}>
                  <option value="totalLevel">Total levels</option>
                  <option value="totalXp">Total XP</option>
                  <option value="highestLevel">Highest level</option>
                  <option value="selectedLevel">Selected profession</option>
                </select>
              </label>
            </div>
          </header>
          {!sortedProfessionRows.length ? <div className="empty-state"><GraduationCap />No citizen profession data is available for tracked settlement members.</div> : (
            <DataTable rows={sortedProfessionRows} columns={[
              ["Member", (entry) => <strong>{entry.name}</strong>],
              ["Highest profession", (entry) => `${entry.highestProfession} ${formatNumber(entry.highestLevel)}`],
              ["Total levels", (entry) => formatNumber(entry.totalLevel)],
              ["Total XP", (entry) => entry.totalXp ? formatNumber(entry.totalXp) : "-"],
              ["Highest tier", (entry) => entry.highestTier ? <TierBadge tier={entry.highestTier} /> : "No tier"],
              ["Profession levels", (entry) => <div className="leaderboard-profession-tags">{entry.levels.filter((level: AnyRecord) => toNumber(level.level) > 0).slice(0, 6).map((level: AnyRecord) => <span key={level.id}>{level.name} <b>{formatNumber(level.level)}</b></span>)}</div>],
            ]} />
          )}
        </section>
      ) : null}
      {activeTab === "activity" ? (
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title">
            <span><Activity size={14} /> Recorded activity</span>
            <label className="inline-field leaderboard-filter"><span>Sort by</span>
              <select className="select-control" value={activitySort} onChange={(event) => setActivitySort(event.target.value)}>
                <option value="totalEvents">Total events</option>
                <option value="marketEvents">Market events</option>
                <option value="storageEvents">Storage events</option>
                <option value="productionEvents">Production events</option>
                <option value="constructionEvents">Construction events</option>
              </select>
            </label>
          </header>
          {!sortedActivityRows.length ? <div className="empty-state"><Activity />No member activity has been recorded with identifiable member names yet.</div> : (
            <DataTable rows={sortedActivityRows} columns={[
              ["Member", (entry) => <strong>{entry.name}</strong>],
              ["Total events", (entry) => formatNumber(entry.totalEvents)],
              ["Market", (entry) => formatNumber(entry.marketEvents)],
              ["Storage", (entry) => formatNumber(entry.storageEvents)],
              ["Production", (entry) => formatNumber(entry.productionEvents)],
              ["Construction", (entry) => formatNumber(entry.constructionEvents)],
              ["Latest", (entry) => entry.lastActivityAt ? timeAgo(entry.lastActivityAt) : "Unknown"],
            ]} />
          )}
        </section>
      ) : null}
      {activeTab === "market" ? (
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title">
            <span><CircleDollarSign size={14} /> Market comparison</span>
            <label className="inline-field leaderboard-filter"><span>Sort by</span>
              <select className="select-control" value={marketSort} onChange={(event) => setMarketSort(event.target.value)}>
                <option value="confirmedSaleValue">Confirmed sale value</option>
                <option value="confirmedSales">Confirmed sales</option>
                <option value="unitsSold">Units sold</option>
                <option value="activeListingValue">Active listing value</option>
                <option value="activeListings">Active listings</option>
              </select>
            </label>
          </header>
          {!sortedMarketRows.length ? <div className="empty-state"><CircleDollarSign />No settlement market listings or confirmed sales have been recorded yet.</div> : (
            <DataTable rows={sortedMarketRows} columns={[
              ["Member", (entry) => <strong>{entry.name}</strong>],
              ["Active listings", (entry) => formatNumber(entry.activeListings)],
              ["Listing value", (entry) => `${formatNumber(entry.activeListingValue)}g`],
              ["Confirmed sales", (entry) => formatNumber(entry.confirmedSales)],
              ["Sale value", (entry) => `${formatNumber(entry.confirmedSaleValue)}g`],
              ["Units sold", (entry) => formatNumber(entry.unitsSold)],
              ["Last sale", (entry) => entry.lastSaleAt ? timeAgo(entry.lastSaleAt) : "No sales"],
            ]} />
          )}
        </section>
      ) : null}
      {activeTab === "online" ? (
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title"><span><Users size={14} /> Online and sessions</span></header>
          {!onlineRows.length ? <div className="empty-state"><Users />No tracked settlement members are available.</div> : (
            <DataTable rows={onlineRows} columns={[
              ["Member", (entry) => <strong><TrackedOwnerName name={entry.name} claim={data.claim} /></strong>],
              ["Status", (entry) => entry.signedIn ? <span className="online-text">Online</span> : <span className="muted-cell">Offline</span>],
              ["Current session", (entry) => {
                const sessionLabel = formatCurrentSession(entry.sessionSeconds);
                return entry.signedIn && sessionLabel ? `Playing ${sessionLabel}` : "-";
              }],
              ["Total played", (entry) => formatPlaytime(entry.timePlayedSeconds)],
              ["Total signed in", (entry) => formatPlaytime(entry.timeSignedInSeconds)],
              ["Last login", (entry) => entry.lastLoginTimestamp ? timeAgo(entry.lastLoginTimestamp) : "Unknown"],
            ]} />
          )}
        </section>
      ) : null}
      {activeTab === "contribution" ? (
      <div className="leaderboard-grid">
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title"><span><GraduationCap size={14} /> Profession totals</span></header>
          <div className="leaderboard-profession-list">
            {professions.map((profession) => (
              <article key={profession.profession}>
                <div>
                  <strong>{profession.profession}</strong>
                  <small>{formatNumber(profession.contributorCount)} contributor{toNumber(profession.contributorCount) === 1 ? "" : "s"} - {formatNumber(profession.craftCount)} craft records</small>
                </div>
                <span>{formatNumber(profession.totalProgress)}</span>
                <em>Top: {profession.topContributor || "Unknown"}</em>
              </article>
            ))}
            {!professions.length ? <div className="empty-state compact"><GraduationCap />No profession totals yet.</div> : null}
          </div>
        </section>
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title"><span><Activity size={14} /> Recent recorded contributions</span></header>
          <div className="leaderboard-recent-list">
            {recent.slice(0, 12).map((entry, index) => (
              <article key={`${entry.contributorId}-${entry.craftLabel}-${index}`}>
                <span className="activity-dot" />
                <div>
                  <strong>{entry.contributorName}</strong>
                  <small>{entry.profession || "Unknown profession"} - {entry.craftLabel} at {entry.structureName}</small>
                </div>
                <span>{formatNumber(entry.totalProgress)}</span>
                <time>{entry.lastContributedAt ? timeAgo(entry.lastContributedAt) : "Unknown"}</time>
              </article>
            ))}
            {!recent.length ? <div className="empty-state compact"><Activity />No recent contribution rows yet.</div> : null}
          </div>
        </section>
      </div>
      ) : null}
    </div>
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
  const defaultSelection = React.useMemo(() => {
    const online = roster.filter((player) => player.signedIn).map((player) => String(player.entityId)).filter(Boolean);
    return new Set(online.length ? online : roster.map((player) => String(player.entityId)).filter(Boolean));
  }, [roster]);
  const current = React.useMemo(() => selectedIds === null ? defaultSelection : new Set(selectedIds), [defaultSelection, selectedIds]);
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
  const mapUrl = React.useMemo(() => bitcraftMapUrl([...current], mapMarker, Boolean(focus), selectedResourceIds, mapRegionIds, selectedEnemyIds), [current, focus, mapMarker, selectedResourceIds.join(","), selectedEnemyIds.join(","), mapRegionIds.join(",")]);
  React.useEffect(() => {
    const parsed = parseBitcraftMapUrl(mapUrl);
    setMapUrlLog((currentLog) => [{
      at: new Date().toISOString(),
      rosterSource,
      rosterCount: roster.length,
      memberCount: data.members.length,
      playerDetailCount: data.players.length,
      playerDetailRequested: playerDetailDiagnostics.requested ?? roster.length,
      playerDetailFailed: playerDetailDiagnostics.failed ?? degradedPlayerCount,
      selectedMode: selectedIds === null ? "auto-online" : "manual",
      selectedPlayerIds: [...current].sort(),
      playerIdParam: parsed.playerId ?? "",
      resourceIdParam: parsed.resourceId ?? "",
      enemyIdParam: parsed.enemyId ?? "",
      regionIdParam: parsed.regionId ?? "",
      hasWaypoint: Boolean(parsed.hasWaypoint),
      url: mapUrl,
    }, ...currentLog].slice(0, 20));
  }, [mapUrl, rosterSource, roster.length, selectedIds, current]);
  const focusKey = focus ? `${focus.name}:${focus.locationX}:${focus.locationZ}` : "";
  React.useEffect(() => {
    if (focus) updateQueryState({ mapName: focus.name, mapX: String(focus.locationX), mapZ: String(focus.locationZ) });
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
  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev === null ? [...defaultSelection] : prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const nextIds = [...next].sort();
      return nextIds;
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
  function toggleAll() {
    const nextIds = current.size === roster.length ? [] : roster.map((player) => String(player.entityId)).filter(Boolean).sort();
    setSelectedIds(nextIds);
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
  const currentFrameUrl = mapUrl;
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
      <div className="player-pills">
        <button className={current.size === roster.length ? "active" : ""} onClick={toggleAll}>All</button>
        <button onClick={resetMapFilters}>Clear filters</button>
        {roster.map((player) => {
          const id = String(player.entityId);
          return <button key={id} className={current.has(id) ? "active" : ""} onClick={() => toggle(id)} title={player.signedIn ? `Online${formatCurrentSession(player.sessionSeconds) ? ` - ${formatCurrentSession(player.sessionSeconds)}` : ""}` : "Offline"}><span className={`online-dot ${player.signedIn ? "is-online" : ""}`} />{player.username}{current.has(id) ? <MapPin size={12} /> : null}</button>;
        })}
      </div>
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
            <SearchBox value={resourceSearch} onChange={setResourceSearch} placeholder="Find resources" />
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
              const iconUrl = bitjitaIconUrl(resource);
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
        <iframe key={currentFrameUrl} className="map-frame" src={currentFrameUrl} title="BitCraft World Map" />
      </div>
    </div>
  );
}

const ACTIVITY_FILTERS = [
  ["all", "All"],
  ["storage", "Storage"],
  ["treasury", "Treasury"],
  ["supplies", "Supplies"],
  ["market", "Market"],
  ["members", "Members"],
  ["buildings", "Structures"],
] as const;

export function activityStyle(item: AnyRecord): { label: string; tone: string; icon: React.ReactNode } {
  const eventType = String(item.event_type ?? "");
  if (eventType.includes("market")) return { label: "Market", tone: "market", icon: <ShoppingCart size={18} /> };
  switch (eventType) {
    case "storage": return { label: "Storage", tone: "storage", icon: <Box size={18} /> };
    case "treasury": return { label: "Treasury", tone: "treasury", icon: <CircleDollarSign size={18} /> };
    case "supplies": return { label: "Supplies", tone: "supplies", icon: <Package size={18} /> };
    case "members": return { label: "Members", tone: "members", icon: <Users size={18} /> };
    case "buildings": return { label: "Structures", tone: "buildings", icon: <Building2 size={18} /> };
    default: return { label: "Update", tone: "default", icon: <Activity size={18} /> };
  }
}

export function ActivityPanel({ activity, activityTotal, claimId, error }: { activity: AnyRecord[]; activityTotal: number; claimId: string; error: string | null }) {
  const [filter, setFilter] = usePersistedState<(typeof ACTIVITY_FILTERS)[number][0]>("activity.filter", "all");
  const [memberFilter, setMemberFilter] = usePersistedState("activity.member", "All");
  const [searchQuery, setSearchQuery] = usePersistedState("activity.search", "");
  const [searchState, setSearchState] = React.useState<{ loading: boolean; error: string | null; events: AnyRecord[]; total: number; query: string }>({ loading: false, error: null, events: [], total: 0, query: "" });
  const [compact, setCompact] = usePersistedState("activity.compact", true);
  const [members, setMembers] = React.useState<AnyRecord[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/claims/${claimId}/members`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`members HTTP ${response.status}`)))
      .then((payload) => setMembers(unwrap<AnyRecord[]>(payload, "members", [])))
      .catch(() => undefined);
    return () => controller.abort();
  }, [claimId]);
  const trimmedSearch = searchQuery.trim();
  React.useEffect(() => {
    if (!trimmedSearch) {
      setSearchState({ loading: false, error: null, events: [], total: 0, query: "" });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState((current) => ({ ...current, loading: true, error: null, query: trimmedSearch }));
      fetch(`${LOCAL_API}/activity?claimId=${encodeURIComponent(claimId)}&q=${encodeURIComponent(trimmedSearch)}&limit=500`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`activity search HTTP ${response.status}`)))
        .then((payload) => setSearchState({ loading: false, error: null, events: payload.events ?? [], total: toNumber(payload.total ?? payload.events?.length), query: trimmedSearch }))
        .catch((searchError) => {
          if (!controller.signal.aborted) setSearchState({ loading: false, error: searchError instanceof Error ? searchError.message : String(searchError), events: [], total: 0, query: trimmedSearch });
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [claimId, trimmedSearch]);
  const searching = Boolean(trimmedSearch);
  const sourceActivity = searching ? searchState.events : activity;
  const sourceTotal = searching ? searchState.total : activityTotal;
  const combined = [...sourceActivity].sort((a, b) => timestampMs(b.occurred_at ?? b.occurredAt) - timestampMs(a.occurred_at ?? a.occurredAt) || toNumber(b.id) - toNumber(a.id));
  const memberOptions = unique(members.map((member) => String(member.userName ?? member.username ?? "")).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  React.useEffect(() => {
    if (memberFilter !== "All" && !memberOptions.includes(memberFilter)) setMemberFilter("All");
  }, [memberFilter, memberOptions.join("|")]);
  const memberActivity = memberFilter === "All" ? combined : combined.filter((item) => activityActorName(item).toLowerCase() === memberFilter.toLowerCase());
  const baseFiltered = filter === "all" ? memberActivity : memberActivity.filter((item) => String(item.event_type ?? "").includes(filter));
  const filtered = compact ? compactActivity(baseFiltered) : baseFiltered;
  const filterCounts = new Map(ACTIVITY_FILTERS.map(([id]) => [id, id === "all" ? memberActivity.length : memberActivity.filter((item) => String(item.event_type ?? "").includes(id)).length]));
  const storageMoves = memberActivity.filter((item) => item.event_type === "storage").length;
  const settlementChanges = memberActivity.length - storageMoves;
  const latestEvent = memberActivity[0]?.occurred_at ?? memberActivity[0]?.occurredAt;
  const scopeLabel = memberFilter === "All" ? "settlement" : memberFilter;
  return (
    <div className="panel activity-panel">
      <header className="members-topbar activity-topbar">
        <div>
          <h2>Activity</h2>
          <p>A live audit trail of settlement updates and owned-storage movements.</p>
        </div>
        <div className="dashboard-top-meta" aria-label="Activity status">
          <div className="dashboard-meta-cluster">
            <span><Activity size={15} /> {formatNumber(memberActivity.length)} {searching ? "matching" : "recent"} events</span>
            <span>{latestEvent ? `Last event ${timeAgo(latestEvent)}` : "Awaiting activity"}</span>
          </div>
          <div className="dashboard-meta-cluster">
            <span>{memberFilter === "All" ? "All members" : memberFilter}</span>
            <span>{filter === "all" ? "All categories" : ACTIVITY_FILTERS.find(([id]) => id === filter)?.[1]}</span>
          </div>
        </div>
      </header>
      {error ? <div className="error">Local history unavailable: {error}</div> : null}
      {searchState.error ? <div className="error">Activity search failed: {searchState.error}</div> : null}
      <div className="activity-overview">
        <MiniStat icon={<Activity />} label={searching ? "Search Matches" : memberFilter === "All" ? "Total History" : "Member Events"} value={formatNumber(memberFilter === "All" ? sourceTotal : memberActivity.length)} title={searching ? `${formatNumber(combined.length)} matching rows loaded from full database search` : memberFilter === "All" ? `${formatNumber(combined.length)} recent events loaded` : `Attributed to ${memberFilter}`} />
        <MiniStat icon={<Box />} label="Storage Moves" value={formatNumber(storageMoves)} title="Settlement containers only" />
        <MiniStat icon={<Building2 />} label={memberFilter === "All" ? "System Changes" : "Other Changes"} value={formatNumber(settlementChanges)} title={memberFilter === "All" ? "Within loaded history" : "Not attributed to members"} />
        <MiniStat icon={<RefreshCw />} label="Latest Event" value={latestEvent ? timeAgo(latestEvent) : "-"} title={latestEvent ? dateLabel(latestEvent) : "Awaiting activity"} />
      </div>
      <section className="production-command-panel activity-command-panel" aria-label="Activity filters">
        <div className="activity-command-head">
          <strong><Activity size={16} /> Activity Filters</strong>
          <span>Showing {filtered.length} of {memberActivity.length} recent {scopeLabel} events{memberFilter === "All" && activityTotal > combined.length ? ` - ${formatNumber(activityTotal)} retained` : ""}</span>
        </div>
        <div className="activity-filter-grid">
          <label className="field activity-search-field">
            <span>Search full history</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search player, item, chest, event, date..."
            />
          </label>
          <label className="field">
            <span>Member</span>
            <select className="select-control" value={memberFilter} onChange={(event) => { setMemberFilter(event.target.value); trackAnalyticsEvent("activity_member_filter_used", { scope: event.target.value === "All" ? "all_members" : "member" }); }}>
              <option value="All">All members</option>
              {memberOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div className="activity-filters" role="group" aria-label="Activity categories">
            {ACTIVITY_FILTERS.map(([id, label]) => (
              <button key={id} className={filter === id ? "active" : ""} onClick={() => { setFilter(id); trackAnalyticsEvent("activity_category_filter_used", { category: id }); }}>
                <span>{label}</span>
                <strong>{filterCounts.get(id) ?? 0}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="activity-options">
          <label className="check-control"><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} /> Combine repeated treasury changes</label>
          <span>{searching ? `Searching all stored activity for "${searchState.query || trimmedSearch}". Showing up to 500 newest matches.` : memberFilter !== "All" ? "Member filtering only includes attributed storage and market events." : "Activity is limited to monitored settlement history."}</span>
          {searching ? <button className="toolbar-button" onClick={() => setSearchQuery("")}>Clear search</button> : null}
        </div>
      </section>
      {searchState.loading ? <div className="loading activity-search-loading"><RefreshCw size={15} /> Searching full activity history...</div> : null}
      <div className="activity-timeline">
        {filtered.length ? filtered.map((item) => {
          const display = activityStyle(item);
          return (
            <article className={`activity-event ${display.tone}`} key={item.id ?? `${item.occurred_at}-${item.summary}`}>
              <div className="activity-event-icon">{display.icon}</div>
              <div className="activity-event-body">
                <header><span>{display.label}</span><time>{timeAgo(item.occurred_at ?? item.occurredAt)}</time></header>
                <p>{activitySummary(item)}</p>
                {activityContainerName(item) ? <small><Box size={12} /> {activityContainerName(item)}</small> : null}
              </div>
              <time className="activity-event-date">{dateLabel(item.occurred_at ?? item.occurredAt)}</time>
            </article>
          );
        }) : <div className="empty-state activity-empty"><Activity />{combined.length ? "No activity matches this filter." : "No activity has been returned yet."}</div>}
      </div>
    </div>
  );
}

