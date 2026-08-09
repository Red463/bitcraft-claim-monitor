import React from "react";
import "../styles/public-craft.css";
import { ArrowDown, ArrowUp, ArrowUpDown, Factory, Globe2, GraduationCap, MapPin, Search, TrendingUp } from "lucide-react";

import { TierBadge, TrackedOwnerName } from "../components/main/Badges";
import { MiniStat } from "../components/main/Stats";
import { AsyncState } from "../components/main/AsyncState";
import { AppSkeleton } from "../components/main/AppChrome";
import { toNumber, type AnyRecord } from "../main-app-data";
import { formatNumber } from "../utils/format";
import { activeRegionLabel, useActiveRegions } from "../hooks/useActiveRegions";
import { hasPersistedState, usePersistedState } from "../hooks/usePersistedState";
import { unique } from "../utils/array";
import { SKILL_IDS, SKILL_NAMES } from "../utils/professions";
import { updateQueryState } from "../navigation";
import { trackAnalyticsEvent } from "../utils/analytics";
import type { MapFocus } from "./map/mapUtils";
import {
  compareCraftEffort,
  formatCraftEffort,
  publicCraftMapCoordinates,
  remainingCraftEffort,
} from "./publicCraftMath";

function publicCraftOwnerName(job: AnyRecord): string {
  const username = String(job.ownerUsername ?? "").trim();
  const ownerEntityId = String(job.ownerEntityId ?? "").trim();
  return username || (/^\d+$/.test(ownerEntityId) ? `Player ${ownerEntityId}` : "-");
}

export function PublicCraftFinder({ providerData, providerLoading, providerError, monitoredClaimId, monitoredRegionId, monitoredOwnerName, defaultRegionId, activeRegionScopeKey, onShowMap }: { providerData?: AnyRecord | null; providerLoading: boolean; providerError: string | null; monitoredClaimId: string; monitoredRegionId: string; monitoredOwnerName?: string; defaultRegionId?: string; activeRegionScopeKey?: string; onShowMap: (focus: NonNullable<MapFocus>) => void }) {
  type PublicCraftSortKey = "output" | "tier" | "settlement" | "required" | "remaining" | "availableXp" | "owner";
  const [skillId, setSkillId] = usePersistedState("public-crafts.skill", "All");
  const [regionId, setRegionId] = usePersistedState("public-crafts.region", defaultRegionId || monitoredRegionId || "All");
  const [sortKey, setSortKey] = usePersistedState<PublicCraftSortKey>("public-crafts.sort", "remaining");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("public-crafts.direction", "desc");
  const hasSavedRegion = React.useRef(hasPersistedState("public-crafts.region"));
  const activeRegions = useActiveRegions(monitoredRegionId, monitoredClaimId, activeRegionScopeKey);
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
  const jobs: AnyRecord[] = providerData?.craftResults ?? [];
  const publicJobs: AnyRecord[] = jobs.filter((job) => job.isPublic === true && !job.completed).map((job): AnyRecord => {
    const remaining = remainingCraftEffort(job.totalActionsRequired, job.progress);
    const requiredSkillId = toNumber(job.levelRequirements?.[0]?.skillId ?? job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skillId ?? job.experiencePerProgress?.[0]?.skill_id);
    const experience = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skillId ?? xp.skill_id) === requiredSkillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
    return {
      ...job,
      output: job.outputName ?? job.recipeName ?? `Recipe #${job.recipeId ?? "?"}`,
      remaining,
      experience,
      availableXp: remaining == null ? null : toNumber(remaining) * experience,
      requiredSkillId,
      requiredSkillName: SKILL_NAMES[requiredSkillId] ?? `Skill ${requiredSkillId}`,
      minimumLevel: toNumber(job.levelRequirements?.find((requirement: AnyRecord) => toNumber(requirement.skillId ?? requirement.skill_id) === requiredSkillId)?.level ?? job.levelRequirements?.[0]?.level),
    };
  }).filter((job) => job.remaining == null || compareCraftEffort(job.remaining, "0") > 0);
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
        remaining: (job) => job.remaining == null ? "" : String(job.remaining),
        availableXp: (job) => job.availableXp == null ? -1 : toNumber(job.availableXp),
        owner: publicCraftOwnerName,
      };
      const left = values[sortKey](a);
      const right = values[sortKey](b);
      const result = sortKey === "remaining"
        ? compareCraftEffort(left, right)
        : typeof left === "string" || typeof right === "string"
        ? String(left).localeCompare(String(right))
        : Number(left) - Number(right);
      return sortDir === "asc" ? result : -result;
    });
  const visibleJobs = filteredJobs.slice(0, 100);
  const skillName = skillId === "All" ? "All Skills" : SKILL_NAMES[toNumber(skillId)] ?? "Selected skill";
  const highestTier = Math.max(...filteredJobs.map((job) => toNumber(job.tier)), 0);
  const totalAvailableXp = filteredJobs.reduce((sum, job) => sum + toNumber(job.availableXp ?? 0), 0);
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
    ["Settlement", "settlement", (job) => {
      const mapLocation = publicCraftMapCoordinates(job);
      return <><strong>{job.claimName ?? "Unknown"}</strong>{mapLocation ? <button className="map-location-link" onClick={() => { trackAnalyticsEvent("public_craft_map_opened"); onShowMap({ name: `${job.claimName ?? "Public craft"} - ${job.output}`, locationX: mapLocation.locationX, locationZ: mapLocation.locationZ }); }}><MapPin size={12} />R{job.regionId} - {mapLocation.locationX}, {mapLocation.locationZ}</button> : null}</>;
    }],
    ["Required", "required", (job) => `${job.requiredSkillName} Lv ${job.minimumLevel}+`],
    ["Effort to Craft", "remaining", (job) => formatCraftEffort(job.remaining)],
    ["XP Available", "availableXp", (job) => job.availableXp == null ? "-" : formatNumber(job.availableXp)],
    ["Owner", "owner", (job) => <TrackedOwnerName name={publicCraftOwnerName(job)} claim={{ ownerPlayerUsername: monitoredOwnerName }} />],
  ];
  if (providerLoading && !providerData) return <AppSkeleton />;
  if (providerError && !providerData) return <AsyncState kind="error" title="Unable to load public craft jobs" detail={providerError} />;
  return (
    <section className="public-craft-finder" data-tour="publiccrafts-page">
      <header className="members-topbar public-craft-topbar">
        <div>
          <h2>Public Craft Finder</h2>
          <p>{providerLoading && !providerData ? "Loading public jobs..." : `${skillName} - ${formatNumber(filteredJobs.length)} public job${filteredJobs.length === 1 ? "" : "s"}${filteredJobs.length > visibleJobs.length ? ` - top ${visibleJobs.length} shown` : ""}`}</p>
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
      <div className="command-filter-panel public-craft-command-panel">
        <div className="command-filter-main">
          <span className="command-filter-title"><Search size={15} /> Craft filters</span>
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
      {providerLoading ? <AsyncState kind="loading" title="Refreshing public craft jobs" detail="Current results remain visible while the next Relay generation is applied." compact /> : null}
      {!providerLoading && visibleJobs.length === 0 ? <AsyncState kind={publicJobs.length ? "no-match" : "empty"} title={publicJobs.length ? "No public crafts match these filters" : "No public craft jobs are open"} detail={publicJobs.length ? "Choose another skill or region to broaden the results." : "Public jobs will appear here when settlements expose incomplete crafts."} /> : null}
      {visibleJobs.length ? <div className="table-wrap" tabIndex={0} aria-label="Public craft jobs table"><table><thead><tr>{columns.map(([label, key]) => <th key={key}><button className="sort-button" onClick={() => changeSort(key)}>{label}{sortKey === key ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}</button></th>)}</tr></thead><tbody>{visibleJobs.map((job, index) => <tr className="data-row" key={job.entityId ?? index}>{columns.map(([label, , render]) => <td key={label}>{render(job)}</td>)}</tr>)}</tbody></table></div> : null}
    </section>
  );
}
