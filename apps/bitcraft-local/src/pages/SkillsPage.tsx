import React from "react";
import { Activity, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, GraduationCap, ShieldCheck, Target, TriangleAlert } from "lucide-react";
import { TierBadge } from "../components/main/Badges";
import { SearchBox } from "../components/main/SearchBox";
import { MiniStat } from "../components/main/Stats";
import { usePersistedState } from "../hooks/usePersistedState";
import { toNumber, type AnyRecord } from "../main-app-data";
import { formatNumber } from "../utils/format";
import { normalizeData } from "../utils/normalize";
import {
  ADVENTURE_SKILL_IDS,
  PROFESSION_IDS,
  TIER_COLORS,
  bitjitaSkillRows,
  levelClass,
  skillNameFromRows,
  skillTier,
  skillTierLabel,
} from "../utils/professions";
import { buildProfessionCapability, prioritizeSettlementNeeds, tierRequiredLevel, type NextTierOutlook } from "./professionCapability";

// The UI calls these "Professions" even though BitJita exposes them as skill
// rows. This page keeps the profession/adventure split explicit so future skill
// categories can be displayed without changing the underlying BitJita mapping.
type SortKey = "name" | "total" | "highest" | number;

export function Skills({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [insightsOpen, setInsightsOpen] = React.useState(false);
  const [focusSkill, setFocusSkill] = usePersistedState<number>("skills.focus", PROFESSION_IDS[0]);
  const [sortKey, setSortKey] = usePersistedState<SortKey>("skills.sort", "total");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("skills.direction", "desc");
  const [adventureSortKey, setAdventureSortKey] = usePersistedState<SortKey>("skills.adventure-sort", "total");
  const [adventureSortDir, setAdventureSortDir] = usePersistedState<"asc" | "desc">("skills.adventure-direction", "desc");
  const citizens = data.citizens;
  const professionRows = bitjitaSkillRows(data.skills, "Profession");
  const adventureRows = bitjitaSkillRows(data.skills, "Adventure");
  const professionIds = professionRows.length ? professionRows.map((skill) => toNumber(skill.id)).filter(Boolean) : PROFESSION_IDS;
  const adventureSkillIds = adventureRows.length ? adventureRows.map((skill) => toNumber(skill.id)).filter(Boolean) : ADVENTURE_SKILL_IDS;
  const skillLabel = (id: number) => skillNameFromRows([...professionRows, ...adventureRows], id);
  const focusedProfession = professionIds.includes(focusSkill) ? focusSkill : professionIds[0];
  const getName = (c: AnyRecord) => c.userName ?? c.username ?? "Unknown";
  const getSkill = (c: AnyRecord, id: number) => toNumber(c.skills?.[String(id)]);
  const getTotalFor = (ids: number[]) => (c: AnyRecord) => ids.reduce((total, id) => total + getSkill(c, id), 0);
  const getHighestFor = (ids: number[]) => (c: AnyRecord) => Math.max(...ids.map((id) => getSkill(c, id)), 0);
  const getTotal = getTotalFor(professionIds);
  const getHighest = getHighestFor(professionIds);
  React.useEffect(() => {
    if (focusSkill !== focusedProfession) setFocusSkill(focusedProfession);
  }, [focusSkill, focusedProfession, setFocusSkill]);
  React.useEffect(() => {
    if (typeof sortKey === "number" && !professionIds.includes(sortKey)) setSortKey("total");
  }, [professionIds, sortKey, setSortKey]);
  React.useEffect(() => {
    if (typeof adventureSortKey === "number" && !adventureSkillIds.includes(adventureSortKey)) setAdventureSortKey("total");
  }, [adventureSkillIds, adventureSortKey, setAdventureSortKey]);

  function toggleSort(key: SortKey, currentKey: SortKey, setKey: (value: SortKey) => void, setDirection: React.Dispatch<React.SetStateAction<"asc" | "desc">>) {
    if (currentKey === key) setDirection((dir) => dir === "desc" ? "asc" : "desc");
    else {
      setKey(key);
      setDirection("desc");
    }
  }

  const filtered = citizens.filter((citizen) => getName(citizen).toLowerCase().includes(searchTerm.toLowerCase()));
  const sortCitizens = (rows: AnyRecord[], ids: number[], activeSortKey: SortKey, activeSortDir: "asc" | "desc") => [...rows].sort((a, b) => {
    if (activeSortKey === "name") {
      return activeSortDir === "asc" ? getName(a).localeCompare(getName(b)) : getName(b).localeCompare(getName(a));
    }
    const totalFor = getTotalFor(ids);
    const highestFor = getHighestFor(ids);
    const va = activeSortKey === "total" ? totalFor(a) : activeSortKey === "highest" ? highestFor(a) : getSkill(a, activeSortKey);
    const vb = activeSortKey === "total" ? totalFor(b) : activeSortKey === "highest" ? highestFor(b) : getSkill(b, activeSortKey);
    return activeSortDir === "asc" ? va - vb : vb - va;
  });
  const sorted = sortCitizens(filtered, professionIds, sortKey, sortDir);
  const sortedAdventure = sortCitizens(filtered, adventureSkillIds, adventureSortKey, adventureSortDir);

  const settlementTier = Math.max(0, Math.min(10, Math.floor(toNumber(data.claim.tier))));
  const settlementBest = Math.max(...citizens.map(getHighest), 0);
  const nextSettlementTier = settlementTier > 0 && settlementTier < 10 ? settlementTier + 1 : null;
  const capabilities = professionIds.map((id) => {
    const name = skillLabel(id);
    return buildProfessionCapability({ id, name, settlementTier, members: citizens.map((citizen) => ({ name: getName(citizen), level: getSkill(citizen, id) })) });
  });
  const focusedCapability = capabilities.find((row) => row.id === focusedProfession) ?? capabilities[0];
  const settlementNeeds = prioritizeSettlementNeeds(capabilities);
  const currentReadyCount = capabilities.filter((row) => row.currentStatus === "ready").length;
  const nextCapableCount = capabilities.filter((row) => row.nextCapableCount > 0).length;
  const dependencyRiskCount = capabilities.filter((row) => row.dependencyRisk === "high").length;
  const focusRows = [...citizens].sort((a, b) => getSkill(b, focusedProfession) - getSkill(a, focusedProfession));
  const focusTierCounts = Object.keys(TIER_COLORS).map((tier) => {
    const tierNumber = Number(tier);
    return {
      tier: tierNumber,
      count: citizens.filter((c) => skillTier(getSkill(c, focusedProfession)) === tierNumber).length,
    };
  });
  const outlookLabel: Record<NextTierOutlook, string> = { ready: "Ready for next tier", developing: "Developing for next tier", "maximum-tier": "Maximum tier", unknown: "Tier unavailable" };
  const sortIcon = (key: SortKey, activeSortKey: SortKey, activeSortDir: "asc" | "desc") => activeSortKey !== key ? <ArrowUpDown size={11} /> : activeSortDir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />;

  return (
    <div className="panel skills-page" data-tour="skills-page">
      <header className="skills-topbar">
        <div>
          <h2>Settlement Capability</h2>
          <p>Can the settlement support T{settlementTier || "-"} now, and what needs attention before T{nextSettlementTier ?? (settlementTier || "-")}?</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><GraduationCap size={14} /> {professionIds.length} professions assessed</span>
            <span>{citizens.length} citizens</span>
          </div>
          <div className="dashboard-settlement-pill">
            {settlementTier ? <TierBadge tier={settlementTier} /> : <span className="status-pill muted">Tier unavailable</span>}
            <span>Settlement tier</span>
          </div>
        </div>
      </header>
      <div className="summary-grid skills-summary">
        <MiniStat icon={<Target />} label="Settlement Tier" value={settlementTier ? `T${settlementTier}` : "Unavailable"} />
        <MiniStat icon={<ShieldCheck />} label="Ready Now" value={settlementTier ? `${currentReadyCount}/${capabilities.length}` : "-"} />
        <MiniStat icon={<GraduationCap />} label="Next-Tier Capable" value={nextSettlementTier ? `${nextCapableCount}/${capabilities.length}` : settlementTier === 10 ? "Maximum" : "-"} />
        <MiniStat icon={<TriangleAlert />} label="Dependency Risks" value={settlementTier ? dependencyRiskCount : "-"} />
      </div>
      <section className="settlement-needs" aria-labelledby="settlement-needs-title">
        <div className="settlement-needs-heading"><span><TriangleAlert size={16} /></span><div><h3 id="settlement-needs-title">Settlement needs</h3><p>Current-tier gaps and professions that rely on one qualified member.</p></div></div>
        <div className="settlement-needs-list">
          {settlementNeeds.length ? settlementNeeds.map((need) => <button key={`${need.kind}-${need.professionId}`} type="button" onClick={() => setFocusSkill(need.professionId)}><span className={`capability-state ${need.kind}`}>{need.kind === "current-gap" ? "Gap" : "Dependency"}</span><strong>{need.professionName}</strong><small>{need.message}</small></button>) : <div className="settlement-needs-clear"><ShieldCheck size={16} /><span><strong>No immediate capability gaps</strong><small>Every profession supports the current settlement tier with more than one qualified member.</small></span></div>}
        </div>
      </section>
      <section className="profession-insights capability-dashboard">
        <div className="profession-insights-bar">
          <div className="profession-insights-title"><ShieldCheck size={15} /><span><strong>Profession capability</strong><small>Readiness against the settlement tier</small></span></div>
          <label className="profession-insights-select"><span>Profession</span><select className="select-control" value={focusedProfession} onChange={(event) => setFocusSkill(Number(event.target.value))}>
            {professionIds.map((id) => <option key={id} value={id}>{skillLabel(id)}</option>)}
          </select></label>
          <div className="profession-insights-glance" aria-label={`${skillLabel(focusedProfession)} summary`}>
            <span><small>Current tier</small><strong>{focusedCapability?.currentStatus === "ready" ? "Ready" : focusedCapability?.currentStatus === "gap" ? "Gap" : "Unknown"}</strong></span>
            <span><small>Qualified</small><strong>{focusedCapability?.currentCapableCount ?? 0} members</strong></span>
            <span><small>Dependency risk</small><strong>{focusedCapability?.dependencyRisk === "high" ? "High" : focusedCapability?.dependencyRisk === "covered" ? "Covered" : focusedCapability?.dependencyRisk === "gap" ? "Gap" : "Unknown"}</strong></span>
          </div>
          <button className="profession-insights-toggle" type="button" aria-expanded={insightsOpen} aria-controls="profession-insights-content" onClick={() => setInsightsOpen((open) => !open)}>{insightsOpen ? "Hide details" : "Show details"}<ChevronDown size={16} /></button>
        </div>
        <div className="capability-grid" aria-label="Profession readiness overview">
          {capabilities.map((capability) => <button type="button" key={capability.id} className={focusedProfession === capability.id ? "active" : ""} onClick={() => setFocusSkill(capability.id)}>
            <div className="capability-card-heading"><strong>{capability.name}</strong><span className={`capability-state ${capability.currentStatus}`}>{capability.currentStatus === "ready" ? `T${settlementTier} ready` : capability.currentStatus === "gap" ? `T${settlementTier} gap` : "Tier unknown"}</span></div>
            <div className="capability-card-metrics"><span><small>Current capable</small><b>{capability.currentCapableCount}</b></span><span><small>{nextSettlementTier ? `T${nextSettlementTier} capable` : "Next tier"}</small><b>{nextSettlementTier ? capability.nextCapableCount : "-"}</b></span><span><small>Levels to next</small><b>{capability.nextTier ? capability.nextLevelGap : "-"}</b></span></div>
            <p>{outlookLabel[capability.nextOutlook]}</p><small className="capability-explanation">{capability.explanation}</small>
          </button>)}
        </div>
        {insightsOpen ? <div className="skills-dashboard profession-insights-content" id="profession-insights-content">
        <section className="focus-panel">
          <div className="split-header">
            <h3><Target size={17} /> Capability Detail</h3>
            <select className="select-control" value={focusedProfession} onChange={(event) => setFocusSkill(Number(event.target.value))}>
              {professionIds.map((id) => <option key={id} value={id}>{skillLabel(id)}</option>)}
            </select>
          </div>
          <div className="focus-metrics">
            <span><small>Current requirement</small><strong>{settlementTier ? `T${settlementTier} · Lv ${tierRequiredLevel(settlementTier)}` : "Tier unavailable"}</strong></span>
            <span><small>Lead member</small><strong>{focusedCapability?.leadName ?? "No member"} · Lv {focusedCapability?.leadLevel ?? 0}</strong></span>
            <span><small>Qualified members</small><strong>{focusedCapability?.currentCapableCount ?? 0}</strong></span>
            <span><small>Next-tier gap</small><strong>{focusedCapability?.nextTier ? focusedCapability.nextLevelGap ? `${focusedCapability.nextLevelGap} levels` : "Capability ready" : "Maximum tier"}</strong></span>
            <span><small>Dependency risk</small><strong>{focusedCapability?.dependencyRisk === "high" ? "High - one qualified member" : focusedCapability?.dependencyRisk === "covered" ? "Covered" : "Capability gap"}</strong></span>
          </div>
          <div className="focus-tier-strip" aria-label={`${skillLabel(focusedProfession)} tier distribution`}>
            {focusTierCounts.map(({ tier, count }) => (
              <div key={tier} className={`focus-tier-segment tier-framed tier-${tier}`} title={`T${tier}: ${count} member${count === 1 ? "" : "s"}`}>
                <span>T{tier}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <div className="focus-list capability-member-list">
            {focusRows.map((citizen, index) => {
              const level = getSkill(citizen, focusedProfession);
              const tier = skillTier(level);
              return (
                <div key={citizen.entityId ?? getName(citizen)}>
                  <small>#{index + 1}</small>
                  <span>{getName(citizen)}</span>
                  <strong className={`focus-level-pill tier-framed tier-${tier || 1}`}>Lv {level}</strong>
                </div>
              );
            })}
          </div>
        </section>
        <section className="coverage-panel capability-explanation-panel">
          <h3><GraduationCap size={17} /> Why this profession is {focusedCapability?.currentStatus === "ready" ? "strong" : "weak"}</h3>
          <p>{focusedCapability?.explanation}</p>
          <div className="capability-outlook-detail"><span><small>Current readiness</small><strong>{focusedCapability?.currentStatus === "ready" ? `Supports T${settlementTier}` : `Does not yet support T${settlementTier}`}</strong></span><span><small>Next-tier outlook</small><strong>{focusedCapability ? outlookLabel[focusedCapability.nextOutlook] : "Unavailable"}</strong></span><span><small>Next requirement</small><strong>{focusedCapability?.nextTier ? `T${focusedCapability.nextTier} · Lv ${tierRequiredLevel(focusedCapability.nextTier)}` : "Maximum tier reached"}</strong></span></div>
        </section>
      </div> : null}
      </section>
      <div className="toolbar-row skills-toolbar">
        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search members" />
        <span>{sorted.length} shown</span>
      </div>
      <section className="skills-table-section">
        <div className="split-header">
          <h3><GraduationCap size={17} /> Professions</h3>
          <p className="legend">Professions are the main crafting and gathering disciplines.</p>
        </div>
      <div className="heatmap-wrap">
        <table className="skill-table">
          <thead>
            <tr>
              <th className="sticky-col clickable" onClick={() => toggleSort("name", sortKey, setSortKey, setSortDir)}>Member {sortIcon("name", sortKey, sortDir)}</th>
              <th className="clickable numeric summary-header" onClick={() => toggleSort("total", sortKey, setSortKey, setSortDir)}><span>Total Levels</span>{sortIcon("total", sortKey, sortDir)}</th>
              <th className="clickable numeric summary-header" onClick={() => toggleSort("highest", sortKey, setSortKey, setSortDir)}><span>Best Level</span>{sortIcon("highest", sortKey, sortDir)}</th>
              {professionIds.map((id) => (
                <th key={id} className={`clickable profession-header ${sortKey === id ? "sorted" : ""}`} onClick={() => toggleSort(id, sortKey, setSortKey, setSortDir)}>
                  <span>{skillLabel(id)}</span>{sortIcon(id, sortKey, sortDir)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((citizen, index) => {
              const name = getName(citizen);
              return (
                <tr key={citizen.entityId ?? name ?? index}>
                  <td className="sticky-col member-cell">{name}</td>
                  <td className="numeric">{formatNumber(getTotal(citizen))}</td>
                  <td className="numeric best">{getHighest(citizen)}</td>
                  {professionIds.map((id) => {
                    const level = getSkill(citizen, id);
                    return <td key={id} className={`skill-cell ${levelClass(level)}`} style={skillStyle(level)} title={`${name} - ${skillLabel(id)}: Lv ${level} (${skillTierLabel(level)})`}>{level > 0 ? level : "-"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky-col member-cell">Settlement Max</td>
              <td className="numeric">-</td>
              <td className="numeric best">{settlementBest}</td>
              {professionIds.map((id) => {
                const max = Math.max(...citizens.map((c) => getSkill(c, id)), 0);
                return <td key={id} className={`skill-cell ${levelClass(max)}`} style={skillStyle(max)} title={`${skillLabel(id)} max: Lv ${max} (${skillTierLabel(max)})`}>{max > 0 ? max : "-"}</td>;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="legend tier-legend">Profession tiers: <span className="lvl0">0</span> {Object.keys(TIER_COLORS).map((tier) => <TierBadge key={tier} tier={tier} />)} - cells show exact level, hover for tier</p>
      </section>
      <section className="skills-table-section">
        <div className="split-header">
          <h3><Activity size={17} /> Skills</h3>
          <p className="legend">Adventure skills are tracked separately from professions.</p>
        </div>
        <div className="heatmap-wrap">
          <table className="skill-table">
            <thead>
              <tr>
                <th className="sticky-col clickable" onClick={() => toggleSort("name", adventureSortKey, setAdventureSortKey, setAdventureSortDir)}>Member {sortIcon("name", adventureSortKey, adventureSortDir)}</th>
                <th className="clickable numeric summary-header" onClick={() => toggleSort("total", adventureSortKey, setAdventureSortKey, setAdventureSortDir)}><span>Total Levels</span>{sortIcon("total", adventureSortKey, adventureSortDir)}</th>
                <th className="clickable numeric summary-header" onClick={() => toggleSort("highest", adventureSortKey, setAdventureSortKey, setAdventureSortDir)}><span>Best Level</span>{sortIcon("highest", adventureSortKey, adventureSortDir)}</th>
                {adventureSkillIds.map((id) => (
                  <th key={id} className={`clickable profession-header ${adventureSortKey === id ? "sorted" : ""}`} onClick={() => toggleSort(id, adventureSortKey, setAdventureSortKey, setAdventureSortDir)}>
                    <span>{skillLabel(id)}</span>{sortIcon(id, adventureSortKey, adventureSortDir)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAdventure.map((citizen, index) => {
                const name = getName(citizen);
                const totalForSkills = getTotalFor(adventureSkillIds);
                const highestForSkills = getHighestFor(adventureSkillIds);
                return (
                  <tr key={citizen.entityId ?? name ?? index}>
                    <td className="sticky-col member-cell">{name}</td>
                    <td className="numeric">{formatNumber(totalForSkills(citizen))}</td>
                    <td className="numeric best">{highestForSkills(citizen)}</td>
                    {adventureSkillIds.map((id) => {
                      const level = getSkill(citizen, id);
                      return <td key={id} className={`skill-cell ${levelClass(level)}`} style={skillStyle(level)} title={`${name} - ${skillLabel(id)}: Lv ${level} (${skillTierLabel(level)})`}>{level > 0 ? level : "-"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky-col member-cell">Settlement Max</td>
                <td className="numeric">-</td>
                <td className="numeric best">{Math.max(...citizens.map(getHighestFor(adventureSkillIds)), 0)}</td>
                {adventureSkillIds.map((id) => {
                  const max = Math.max(...citizens.map((c) => getSkill(c, id)), 0);
                  return <td key={id} className={`skill-cell ${levelClass(max)}`} style={skillStyle(max)} title={`${skillLabel(id)} max: Lv ${max} (${skillTierLabel(max)})`}>{max > 0 ? max : "-"}</td>;
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="legend tier-legend">Skill tiers: <span className="lvl0">0</span> {Object.keys(TIER_COLORS).map((tier) => <TierBadge key={tier} tier={tier} />)} - cells show exact level, hover for tier</p>
      </section>
    </div>
  );
}

function skillStyle(level: number): React.CSSProperties {
  const tier = skillTier(level);
  const color = TIER_COLORS[tier];
  if (!color) return {};
  const textColor = tier === 9 ? "#c7c7c7" : tier === 10 ? "#deffff" : color;
  return { backgroundColor: `${color}${tier === 9 ? "55" : "25"}`, color: textColor };
}
