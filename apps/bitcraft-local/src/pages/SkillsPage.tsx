import React from "react";
import { Activity, ArrowDown, ArrowUp, ArrowUpDown, GraduationCap, Star, TrendingUp } from "lucide-react";
import { TierBadge } from "../components/main/Badges";
import { SearchBox } from "../components/main/SearchBox";
import { Info, MiniStat } from "../components/main/Stats";
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

// The UI calls these "Professions" even though BitJita exposes them as skill
// rows. This page keeps the profession/adventure split explicit so future skill
// categories can be displayed without changing the underlying BitJita mapping.
type SortKey = "name" | "total" | "highest" | number;

export function Skills({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [searchTerm, setSearchTerm] = React.useState("");
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

  const settlementTotalLevel = citizens.reduce((sum, c) => sum + getTotal(c), 0);
  const settlementBest = Math.max(...citizens.map(getHighest), 0);
  const averageTotal = citizens.length ? settlementTotalLevel / citizens.length : 0;
  const topMember = [...citizens].sort((a, b) => getTotal(b) - getTotal(a))[0];
  const topMemberName = topMember ? getName(topMember) : "-";
  const focusRows = [...citizens].sort((a, b) => getSkill(b, focusedProfession) - getSkill(a, focusedProfession)).slice(0, 5);
  const focusAverage = citizens.length ? citizens.reduce((sum, c) => sum + getSkill(c, focusedProfession), 0) / citizens.length : 0;
  const focusTier = Math.max(...citizens.map((c) => skillTier(getSkill(c, focusedProfession))), 0);
  const focusT3 = citizens.filter((c) => skillTier(getSkill(c, focusedProfession)) >= 3).length;
  const focusT5 = citizens.filter((c) => skillTier(getSkill(c, focusedProfession)) >= 5).length;
  const focusTierCounts = Object.keys(TIER_COLORS).map((tier) => {
    const tierNumber = Number(tier);
    return {
      tier: tierNumber,
      count: citizens.filter((c) => skillTier(getSkill(c, focusedProfession)) === tierNumber).length,
    };
  });
  const summarizeCoverage = (ids: number[]) => ids.map((id) => {
    const levels = citizens.map((c) => getSkill(c, id));
    const max = Math.max(...levels, 0);
    const avg = citizens.length ? levels.reduce((sum, level) => sum + level, 0) / citizens.length : 0;
    const tier = skillTier(max);
    const specialists = levels.filter((level) => skillTier(level) >= 5).length;
    return { id, name: skillLabel(id), max, avg, tier, specialists };
  }).sort((a, b) => b.max - a.max || b.avg - a.avg);
  const coverage = summarizeCoverage(professionIds);
  const sortIcon = (key: SortKey, activeSortKey: SortKey, activeSortDir: "asc" | "desc") => activeSortKey !== key ? <ArrowUpDown size={11} /> : activeSortDir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />;

  return (
    <div className="panel skills-page">
      <header className="members-topbar skills-topbar">
        <div>
          <h2>Member Professions</h2>
          <p>{citizens.length} citizens - {professionIds.length} professions tracked separately from adventure skills</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><GraduationCap size={14} /> {professionIds.length} professions</span>
            <span>{adventureSkillIds.length} skills</span>
          </div>
          <div className="dashboard-settlement-pill">
            <TierBadge tier={Math.max(1, skillTier(settlementBest))} />
            <span>Highest member tier</span>
          </div>
        </div>
      </header>
      <div className="summary-grid skills-summary">
        <MiniStat icon={<TrendingUp />} label="Profession Levels" value={formatNumber(settlementTotalLevel)} />
        <MiniStat icon={<Star />} label="Highest Profession" value={settlementBest} />
        <MiniStat icon={<Activity />} label="Avg Profession Total" value={formatNumber(averageTotal, 1)} />
        <MiniStat icon={<GraduationCap />} label="Top Professional" value={topMemberName} />
      </div>
      <div className="skills-dashboard">
        <section className="focus-panel">
          <div className="split-header">
            <h3><Star size={17} /> Profession Focus</h3>
            <select className="select-control" value={focusedProfession} onChange={(event) => setFocusSkill(Number(event.target.value))}>
              {professionIds.map((id) => <option key={id} value={id}>{skillLabel(id)}</option>)}
            </select>
          </div>
          <div className="focus-metrics">
            <Info label="Average level" value={formatNumber(focusAverage, 1)} />
            <Info label="Best tier" value={focusTier ? <TierBadge tier={focusTier} /> : "-"} />
            <Info label="T3+" value={`${focusT3} members`} />
            <Info label="T5+" value={`${focusT5} members`} />
          </div>
          <div className="focus-tier-strip" aria-label={`${skillLabel(focusedProfession)} tier distribution`}>
            {focusTierCounts.map(({ tier, count }) => (
              <div key={tier} className={`focus-tier-segment tier-framed tier-${tier}`} title={`T${tier}: ${count} member${count === 1 ? "" : "s"}`}>
                <span>T{tier}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <div className="focus-list">
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
        <section className="coverage-panel">
          <h3><GraduationCap size={17} /> Profession Coverage</h3>
          <div className="coverage-list">
            {coverage.slice(0, 8).map((skill) => (
              <button key={skill.id} className={focusedProfession === skill.id ? "active" : ""} onClick={() => setFocusSkill(skill.id)}>
                <span>{skill.name}</span>
                <b>{skill.tier ? <><TierBadge tier={skill.tier} /> <span>/ Lv {skill.max}</span></> : "-"}</b>
                <small>Avg {formatNumber(skill.avg, 1)} - {skill.specialists} at T5+</small>
              </button>
            ))}
          </div>
        </section>
      </div>
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
