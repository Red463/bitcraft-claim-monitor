import React from "react";
import "../styles/leaderboard.css";
import { Activity, CircleDollarSign, Clock, Factory, GraduationCap, RefreshCw, ShoppingBag, TrendingUp, Trophy, Users } from "lucide-react";

import { TierBadge, TrackedOwnerName } from "../components/main/Badges";
import { DataTable } from "../components/main/DataTable";
import { AsyncState } from "../components/main/AsyncState";
import { AppSkeleton } from "../components/main/AppChrome";
import { MiniStat } from "../components/main/Stats";
import { toNumber, type AnyRecord } from "../main-app-data";
import { formatCompactNumber, formatCurrentSession, formatNumber, formatPlaytime, timeAgo, timestampMs } from "../utils/format";
import { usePersistedState } from "../hooks/usePersistedState";
import { memberTrackingKeys } from "../utils/memberIdentity";
import { normalizeData } from "../utils/normalize";
import { PROFESSION_IDS, skillNameFromRows, skillRows, skillTier, SKILL_NAMES } from "../utils/professions";
import type { LoadState } from "../types/app";
import { effectiveTargetAllowed, targetIdForTab, type EffectiveAccess } from "../access/accessControl.mjs";
import { resolveAllowedView } from "../navigation/routeState.ts";
import { useManualRefresh } from "../refresh/ManualRefreshContext";
import { manualRefreshHeaders } from "../refresh/manualRefresh.mjs";
import { pageRefreshShowsRetainedDataProgress } from "../refresh/pageRefresh.mjs";
import { addDecimal, compareDecimal, formatExactDecimal } from "../server/game-data/exactDecimal.ts";

const LOCAL_API = "/api/local";

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
  access,
}: {
  claimId: string;
  refreshToken: number;
  excludedMemberIds?: string[];
  data: ReturnType<typeof normalizeData>;
  access?: EffectiveAccess | null;
}) {
  const { request, trackPromise } = useManualRefresh();
  const showRefreshProgress = pageRefreshShowsRetainedDataProgress(request);
  const [state, setState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: true });
  const [activeTab, setActiveTab] = usePersistedState<LeaderboardTab>("leaderboard.tab", "contribution");
  const [professionFilter, setProfessionFilter] = React.useState("All");
  const [professionSort, setProfessionSort] = React.useState("totalLevel");
  const [activitySort, setActivitySort] = React.useState("totalEvents");
  const [marketSort, setMarketSort] = React.useState("confirmedSaleValue");
  const visibleTabs = React.useMemo(() => LEADERBOARD_TABS.filter((tab) => effectiveTargetAllowed(access, targetIdForTab("leaderboard", tab.id))), [access]);
  const resolvedTab = resolveAllowedView(activeTab, visibleTabs.map((tab) => tab.id));
  React.useEffect(() => {
    if (resolvedTab && resolvedTab !== activeTab) setActiveTab(resolvedTab);
  }, [activeTab, resolvedTab, setActiveTab]);
  React.useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    const refresh = fetch(`${LOCAL_API}/leaderboard?claimId=${encodeURIComponent(claimId)}`, { headers: manualRefreshHeaders(request, "leaderboard"), signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`leaderboard HTTP ${response.status}`)))
      .then((payload) => setState({ data: payload, error: null, loading: false }));
    void trackPromise("leaderboard", refresh)
      .catch((error) => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error), loading: false }));
      });
    return () => controller.abort();
  }, [claimId, refreshToken, request?.sequence, trackPromise]);
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
        const current = byProfession.get(profession) ?? { profession, totalProgress: "0", totalXp: "0", craftCount: "0", contributorCount: 0, topContributor: "", topContributorProgress: "0" };
        const progress = String(row.progress ?? "0");
        current.totalProgress = addDecimal(String(current.totalProgress), progress);
        current.totalXp = addDecimal(String(current.totalXp), String(row.xp ?? "0"));
        current.craftCount = addDecimal(String(current.craftCount), String(row.crafts ?? "0"));
        current.contributorCount += 1;
        if (compareDecimal(progress, String(current.topContributorProgress)) > 0) {
          current.topContributor = contributor.name;
          current.topContributorProgress = progress;
        }
        byProfession.set(profession, current);
      }
    }
    return Array.from(byProfession.values()).sort((a, b) => compareDecimal(String(b.totalProgress), String(a.totalProgress)));
  }, [contributors]);
  const summary = React.useMemo(() => ({
    ...(contributionBoard.summary ?? {}),
    contributorCount: contributors.length,
    professionCount: professions.length,
    totalProgress: contributors.reduce((sum, row) => addDecimal(sum, String(row.totalProgress ?? "0")), "0"),
    totalXp: contributors.reduce((sum, row) => addDecimal(sum, String(row.totalXp ?? "0")), "0"),
    recordedCrafts: contributors.reduce((sum, row) => addDecimal(sum, String(row.craftCount ?? "0")), "0"),
    lastContributedAt: recent[0]?.lastContributedAt ?? null,
  }), [contributors, contributionBoard.summary, professions.length, recent]);
  const filteredContributors = professionFilter === "All"
    ? contributors
    : contributors.filter((entry) => entry.professions?.some?.((profession: AnyRecord) => profession.profession === professionFilter));
  const topContributor = contributors[0];
  const topProfession = professions[0];
  const professionRows = skillRows(data.skills, "Profession");
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
  const currentTab = resolvedTab ?? activeTab;
  const activeTabMeta = visibleTabs.find((tab) => tab.id === currentTab) ?? LEADERBOARD_TABS[0];
  const tabSummary = currentTab === "professions" ? [
    <MiniStat key="members" icon={<Users />} label="Members Compared" value={formatNumber(sortedProfessionRows.length)} />,
    <MiniStat key="total" icon={<GraduationCap />} label="Total Profession Levels" value={formatNumber(sortedProfessionRows.reduce((total, row) => total + toNumber(row.totalLevel), 0))} />,
    <MiniStat key="highest" icon={<TrendingUp />} label="Highest Level" value={formatNumber(Math.max(...sortedProfessionRows.map((row) => toNumber(row.highestLevel)), 0))} />,
    <MiniStat key="top" icon={<Trophy />} label="Top Member" value={sortedProfessionRows[0]?.name ?? "None yet"} />,
  ] : currentTab === "activity" ? [
    <MiniStat key="members" icon={<Users />} label="Members With Activity" value={formatNumber(sortedActivityRows.length)} />,
    <MiniStat key="events" icon={<Activity />} label="Recorded Events" value={formatNumber(sortedActivityRows.reduce((total, row) => total + toNumber(row.totalEvents), 0))} />,
    <MiniStat key="top" icon={<Trophy />} label="Most Recorded" value={sortedActivityRows[0]?.name ?? "None yet"} />,
    <MiniStat key="updated" icon={<Clock />} label="Latest Activity" value={leaderboard.activity?.summary?.lastActivityAt ? timeAgo(leaderboard.activity.summary.lastActivityAt) : "No history"} />,
  ] : currentTab === "market" ? [
    <MiniStat key="members" icon={<Users />} label="Market Members" value={formatNumber(sortedMarketRows.length)} />,
    <MiniStat key="listings" icon={<ShoppingBag />} label="Active Listings" value={formatNumber(leaderboard.market?.summary?.activeListings)} />,
    <MiniStat key="sales" icon={<CircleDollarSign />} label="Confirmed Sales Value" value={formatCompactNumber(leaderboard.market?.summary?.confirmedSaleValue)} />,
    <MiniStat key="top" icon={<Trophy />} label="Top Seller" value={sortedMarketRows[0]?.name ?? "None yet"} />,
  ] : currentTab === "online" ? [
    <MiniStat key="online" icon={<Users />} label="Online Now" value={formatNumber(onlineRows.filter((row) => row.signedIn).length)} />,
    <MiniStat key="members" icon={<Users />} label="Tracked Members" value={formatNumber(onlineRows.length)} />,
    <MiniStat key="played" icon={<Trophy />} label="Most Played" value={mostPlayedRow?.timePlayedSeconds ? `${mostPlayedRow.name} - ${formatPlaytime(mostPlayedRow.timePlayedSeconds)}` : "Unavailable"} />,
    <MiniStat key="longest" icon={<Clock />} label="Longest Current Session" value={formatCurrentSession(longestSessionRow?.sessionSeconds) ?? "Unavailable"} />,
  ] : [
    <MiniStat key="progress" icon={<Trophy />} label="Recorded Contribution" value={formatExactDecimal(summary.totalProgress)} />,
    <MiniStat key="xp" icon={<TrendingUp />} label="Estimated XP" value={formatExactDecimal(summary.totalXp)} />,
    <MiniStat key="top" icon={<Users />} label="Top Contributor" value={topContributor?.name ?? "None yet"} />,
    <MiniStat key="profession" icon={<GraduationCap />} label="Top Profession" value={topProfession?.profession ?? "None yet"} />,
  ];
  if (!resolvedTab) return (
    <div className="panel restricted-access-panel">
      <AsyncState kind="restricted" title="Leaderboard is restricted" detail="No leaderboard categories are available for your account." />
    </div>
  );
  if (state.loading && !state.data) return <AppSkeleton />;
  if (state.error && !state.data) return <AsyncState kind="error" title="Unable to load leaderboard" detail={state.error} />;
  return (
    <div className="panel leaderboard-page" data-tour="leaderboard-page">
      <header className="members-topbar leaderboard-topbar">
        <div>
          <h2>Leaderboard</h2>
          <p>Compare settlement members across contribution, professions, market history, activity, and online status.</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Trophy size={14} /> {formatNumber(summary.contributorCount)} contributors</span>
            <span><Factory size={14} /> {formatExactDecimal(summary.recordedCrafts)} crafts</span>
            <span>{summary.lastContributedAt ? `Updated ${timeAgo(summary.lastContributedAt)}` : "No history yet"}</span>
          </div>
        </div>
      </header>
      <nav className="leaderboard-tabs" aria-label="Leaderboard categories">
        {visibleTabs.map((tab) => (
          <button key={tab.id} className={currentTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
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
        <p>{currentTab === "activity" || currentTab === "market" ? "This tab uses local recorded settlement history, so it represents what the app has observed and stored for this claim." : currentTab === "professions" ? "This tab uses current Relay citizen profession data for the monitored settlement." : currentTab === "online" ? "This tab uses current Relay member and player data." : "This tab uses locally recorded craft contribution data observed by the app."}</p>
      </section>
      {currentTab === "contribution" ? (
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
        {state.loading && state.data && showRefreshProgress ? <AsyncState kind="loading" title="Refreshing contribution history" detail="Current standings remain visible while the latest records load." compact /> : null}
        {state.error ? <AsyncState kind="error" title="Leaderboard refresh failed" detail={`Current standings are retained. ${state.error}`} compact /> : null}
        {!state.loading && !contributors.length ? (
          <AsyncState kind="empty" title="No craft contributions recorded yet" detail="The leaderboard fills as settlement craft contribution data is observed during refreshes." />
        ) : null}
        {filteredContributors.length ? (
          <DataTable
            scrollLabel="Craft contributions table"
            emptyState="No settlement summary rows were returned."
            rows={filteredContributors}
            columns={[
              ["Member", (entry) => <strong>{entry.name}</strong>],
              ["Progress", (entry) => formatExactDecimal(entry.totalProgress)],
              ["Estimated XP", (entry) => formatExactDecimal(entry.totalXp)],
              ["Crafts", (entry) => formatExactDecimal(entry.craftCount)],
              ["Top professions", (entry) => (
                <div className="leaderboard-profession-tags">
                {(entry.professions ?? []).slice(0, 3).map((profession: AnyRecord) => <span key={profession.profession}>{profession.profession} <b>{formatExactDecimal(profession.progress)}</b></span>)}
                </div>
              )],
              ["Last contribution", (entry) => entry.lastContributedAt ? timeAgo(entry.lastContributedAt) : "Unknown", (entry) => timestampMs(entry.lastContributedAt)],
            ]}
          />
        ) : null}
      </section>
      ) : null}
      {currentTab === "professions" ? (
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
          {!sortedProfessionRows.length ? <AsyncState kind={professionFilter === "All" ? "empty" : "no-match"} title={professionFilter === "All" ? "No profession data available" : "No members match this profession"} detail={professionFilter === "All" ? "Profession levels appear when Relay returns citizen skill data." : "Choose another profession or show all professions."} /> : (
            <DataTable rows={sortedProfessionRows} scrollLabel="Profession leaderboard table" emptyState="No profession leaderboard rows were returned." columns={[
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
      {currentTab === "activity" ? (
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
            <DataTable rows={sortedActivityRows} scrollLabel="Activity leaderboard table" emptyState="No activity leaderboard rows were returned." columns={[
              ["Member", (entry) => <strong>{entry.name}</strong>],
              ["Total events", (entry) => formatNumber(entry.totalEvents)],
              ["Market", (entry) => formatNumber(entry.marketEvents)],
              ["Storage", (entry) => formatNumber(entry.storageEvents)],
              ["Production", (entry) => formatNumber(entry.productionEvents)],
              ["Construction", (entry) => formatNumber(entry.constructionEvents)],
              ["Latest", (entry) => entry.lastActivityAt ? timeAgo(entry.lastActivityAt) : "Unknown", (entry) => timestampMs(entry.lastActivityAt)],
            ]} />
          )}
        </section>
      ) : null}
      {currentTab === "market" ? (
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
            <DataTable rows={sortedMarketRows} scrollLabel="Market leaderboard table" emptyState="No market leaderboard rows were returned." columns={[
              ["Member", (entry) => <strong>{entry.name}</strong>],
              ["Active listings", (entry) => formatNumber(entry.activeListings)],
              ["Listing value", (entry) => `${formatNumber(entry.activeListingValue)}g`],
              ["Confirmed sales", (entry) => formatNumber(entry.confirmedSales)],
              ["Sale value", (entry) => `${formatNumber(entry.confirmedSaleValue)}g`],
              ["Units sold", (entry) => formatNumber(entry.unitsSold)],
              ["Last sale", (entry) => entry.lastSaleAt ? timeAgo(entry.lastSaleAt) : "No sales", (entry) => timestampMs(entry.lastSaleAt)],
            ]} />
          )}
        </section>
      ) : null}
      {currentTab === "online" ? (
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title"><span><Users size={14} /> Online and sessions</span></header>
          {!onlineRows.length ? <div className="empty-state"><Users />No tracked settlement members are available.</div> : (
            <DataTable rows={onlineRows} scrollLabel="Online members table" emptyState="No members are currently online." columns={[
              ["Member", (entry) => <strong><TrackedOwnerName name={entry.name} claim={data.claim} members={data.members} /></strong>],
              ["Status", (entry) => entry.signedIn ? <span className="online-text">Online</span> : <span className="muted-cell">Offline</span>],
              ["Current session", (entry) => {
                const sessionLabel = formatCurrentSession(entry.sessionSeconds);
                return entry.signedIn && sessionLabel ? `Playing ${sessionLabel}` : "-";
              }, (entry) => entry.signedIn ? toNumber(entry.sessionSeconds) : 0],
              ["Total played", (entry) => formatPlaytime(entry.timePlayedSeconds), (entry) => toNumber(entry.timePlayedSeconds)],
              ["Total signed in", (entry) => formatPlaytime(entry.timeSignedInSeconds), (entry) => toNumber(entry.timeSignedInSeconds)],
              ["Last login", (entry) => entry.lastLoginTimestamp ? timeAgo(entry.lastLoginTimestamp) : "Unknown", (entry) => timestampMs(entry.lastLoginTimestamp)],
            ]} />
          )}
        </section>
      ) : null}
      {currentTab === "contribution" ? (
      <div className="leaderboard-grid">
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title"><span><GraduationCap size={14} /> Profession totals</span></header>
          <div className="leaderboard-profession-list">
            {professions.map((profession) => (
              <article key={profession.profession}>
                <div>
                  <strong>{profession.profession}</strong>
                  <small>{formatNumber(profession.contributorCount)} contributor{toNumber(profession.contributorCount) === 1 ? "" : "s"} - {formatExactDecimal(profession.craftCount)} craft records</small>
                </div>
                <span>{formatExactDecimal(profession.totalProgress)}</span>
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
                <span>{formatExactDecimal(entry.totalProgress)}</span>
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
