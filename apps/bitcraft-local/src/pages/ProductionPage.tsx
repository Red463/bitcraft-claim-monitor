import React from "react";
import { Activity, AlertTriangle, CheckCircle2, Factory, Lock, Star, TrendingUp, User, Wrench } from "lucide-react";

import { TierBadge, TrackedOwnerName } from "../components/main/Badges";
import { DataTable } from "../components/main/DataTable";
import { ItemIcon } from "../components/main/ItemDisplay";
import { Segmented } from "../components/main/Segmented";
import { MiniStat } from "../components/main/Stats";
import { toNumber, type AnyRecord } from "../main-app-data";
import { formatEquipmentSlot, formatNumber, timeAgo } from "../utils/format";
import { usePersistedState } from "../hooks/usePersistedState";
import { playerToolbeltTools } from "../utils/items";
import { normalizeData } from "../utils/normalize";
import { SKILL_NAMES, TOOL_TAG_BY_TYPE } from "../utils/professions";
import { trackAnalyticsEvent } from "../utils/analytics";
import type { LoadState } from "../types/app";
import { craftProgressKey, hasRecentCraftContribution, productionMetrics } from "./production/productionUtils";

const API = "/api/bitjita";
const LOCAL_API = "/api/local";

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
