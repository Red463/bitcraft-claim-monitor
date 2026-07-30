import React from "react";
import "../styles/activity.css";
import { Activity, Box, Building2, RefreshCw } from "lucide-react";

import { MiniStat } from "../components/main/Stats";
import { toNumber, type AnyRecord } from "../main-app-data";
import { dateLabel, formatNumber, timeAgo, timestampMs } from "../utils/format";
import { usePersistedState } from "../hooks/usePersistedState";
import { unique } from "../utils/array";
import { trackAnalyticsEvent } from "../utils/analytics";
import { activityActorName, activityContainerName, activitySummary, compactActivity } from "./activity/activityUtils";
import { activityStyle } from "./activity/activityDisplay";
import { effectiveTargetAllowed, targetIdForTab, type EffectiveAccess } from "../access/accessControl.mjs";
import { resolveAllowedView } from "../navigation/routeState.ts";

const LOCAL_API = "/api/local";

const ACTIVITY_FILTERS = [
  ["all", "All"],
  ["storage", "Storage"],
  ["treasury", "Treasury"],
  ["supplies", "Supplies"],
  ["market", "Market"],
  ["members", "Members"],
  ["buildings", "Structures"],
] as const;

export function ActivityPanel({ activity, activityTotal, claimId, error, members, access }: { activity: AnyRecord[]; activityTotal: number; claimId: string; error: string | null; members: AnyRecord[]; access?: EffectiveAccess | null }) {
  const [filter, setFilter] = usePersistedState<(typeof ACTIVITY_FILTERS)[number][0]>("activity.filter", "all");
  const [memberFilter, setMemberFilter] = usePersistedState("activity.member", "All");
  const [searchQuery, setSearchQuery] = usePersistedState("activity.search", "");
  const [searchState, setSearchState] = React.useState<{ loading: boolean; error: string | null; events: AnyRecord[]; total: number; query: string }>({ loading: false, error: null, events: [], total: 0, query: "" });
  const [compact, setCompact] = usePersistedState("activity.compact", true);
  const visibleActivityFilters = React.useMemo(() => ACTIVITY_FILTERS.filter(([id]) => effectiveTargetAllowed(access, targetIdForTab("activity", id))), [access]);
  const resolvedFilter = resolveAllowedView(filter, visibleActivityFilters.map(([id]) => id));
  React.useEffect(() => {
    if (resolvedFilter && resolvedFilter !== filter) setFilter(resolvedFilter);
  }, [filter, resolvedFilter, setFilter]);
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
  const currentFilter = resolvedFilter ?? filter;
  const baseFiltered = currentFilter === "all" ? memberActivity : memberActivity.filter((item) => String(item.event_type ?? "").includes(currentFilter));
  const filtered = compact ? compactActivity(baseFiltered) : baseFiltered;
  const filterCounts = new Map(ACTIVITY_FILTERS.map(([id]) => [id, id === "all" ? memberActivity.length : memberActivity.filter((item) => String(item.event_type ?? "").includes(id)).length]));
  const storageMoves = memberActivity.filter((item) => item.event_type === "storage").length;
  const settlementChanges = memberActivity.length - storageMoves;
  const latestEvent = memberActivity[0]?.occurred_at ?? memberActivity[0]?.occurredAt;
  const scopeLabel = memberFilter === "All" ? "settlement" : memberFilter;
  if (!resolvedFilter) return (
    <div className="panel restricted-access-panel">
      <section className="empty-state restricted-access-state">
        <Activity size={34} />
        <strong>Activity is restricted</strong>
        <span>No activity categories are available for your account.</span>
      </section>
    </div>
  );
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
            <span>{currentFilter === "all" ? "All categories" : visibleActivityFilters.find(([id]) => id === currentFilter)?.[1]}</span>
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
      <section className="command-filter-panel activity-command-panel" aria-label="Activity filters" data-tour="activity-controls">
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
            {visibleActivityFilters.map(([id, label]) => (
              <button key={id} className={currentFilter === id ? "active" : ""} onClick={() => { setFilter(id); trackAnalyticsEvent("activity_category_filter_used", { category: id }); }}>
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
