import React from "react";
import "../styles/research.css";
import { Box, CheckCircle2, Circle, Crown, LoaderCircle, Lock, MapPin, Search } from "lucide-react";
import { TierBadge } from "../components/main/Badges";
import { PageHeader } from "../components/main/PageHeader";
import { SearchBox } from "../components/main/SearchBox";
import { MiniStat } from "../components/main/Stats";
import { usePersistedState } from "../hooks/usePersistedState";
import { toNumber, type AnyRecord } from "../main-app-data";
import {
  groupResearchTechnologies,
  researchLanes,
  researchSettlementCaps,
} from "./researchView.ts";
import { unique } from "../utils/array";
import { formatNumber } from "../utils/format";
import { normalizeData } from "../utils/normalize";

// The provider-neutral research domain combines the live claim state with the
// global technology catalog, including prerequisite-derived availability.
export function Research({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = usePersistedState("research.tier", "All");
  const matching = data.research.filter((item) => {
    if (query && !String(item.name ?? "").toLowerCase().includes(query.toLowerCase())) return false;
    if (tier !== "All" && String(item.tier) !== tier) return false;
    return true;
  });
  const allGroups = groupResearchTechnologies(data.research);
  const lanes = researchLanes(matching);
  const tiers = unique(data.research.map((item) => String(item.tier)).filter(Boolean)).sort();
  const totalResearched = allGroups.researched.length;
  const totalAvailable = allGroups.available.length;
  const totalLocked = allGroups.locked.length;
  const completion = data.research.length ? Math.round((totalResearched / data.research.length) * 100) : 0;
  const researchedTechs = allGroups.researched;
  const { maxTiles, maxSupplies } = researchSettlementCaps(data.claim, data.research);
  const settlementTier = toNumber(data.claim.tier);
  const workstationTiers = researchedTechs
    .filter((item) => /tier\s+\d+/i.test(String(item.name ?? "")) && item.techType && !["tier_upgrade", "settlement"].includes(String(item.techType)))
    .reduce<Record<string, number>>((acc, item) => {
      acc[String(item.techType)] = Math.max(acc[String(item.techType)] ?? 0, toNumber(item.tier));
      return acc;
    }, {});
  const card = (item: AnyRecord, state: "researched" | "researching" | "available" | "locked") => (
    <div className={`research-card ${state === "researched" ? "done" : state}`} key={item.entityId ?? item.id ?? item.name}>
      <span>{state === "researched" ? <CheckCircle2 /> : state === "researching" ? <LoaderCircle /> : state === "locked" ? <Lock /> : <Circle />}</span>
      <strong>
        {item.name ?? item.techName ?? item.id ?? "Unknown Technology"}
        <small>
          {state === "locked" && item.missingRequirementIds?.length
            ? <span className="research-prerequisite-badge">{formatNumber(item.missingRequirementIds.length)} prerequisite{item.missingRequirementIds.length === 1 ? "" : "s"} missing</span>
            : item.suppliesCost ? `${formatNumber(item.suppliesCost)} supplies` : ""}
        </small>
      </strong>
      <div className="research-card-badges">
        {state === "locked" ? <span className="status-pill">Locked</span> : null}
        {item.tier ? <TierBadge tier={item.tier} /> : null}
      </div>
    </div>
  );
  return (
    <div className="panel research-panel" data-tour="research-page">
      <PageHeader
        title="Research"
        description="Technology progression and the next available unlocks"
        meta={<div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><CheckCircle2 size={14} /> {formatNumber(totalResearched)} researched</span>
            <span>{formatNumber(totalAvailable)} ready</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">{completion}%</span>
            <span>Research complete</span>
          </div>
        </div>}
      />
      <div className="summary-grid research-summary">
        <MiniStat icon={<CheckCircle2 />} label="Researched" value={formatNumber(totalResearched)} />
        <MiniStat icon={<Circle />} label="Ready" value={formatNumber(totalAvailable)} />
        <MiniStat icon={<Lock />} label="Locked" value={formatNumber(totalLocked)} />
        <MiniStat icon={<Crown />} label="Settlement Tier" value={`T${settlementTier || "-"}`} />
        <MiniStat icon={<Box />} label="Supply Cap" value={maxSupplies ? formatNumber(maxSupplies) : "-"} />
        <MiniStat icon={<MapPin />} label="Tile Cap" value={maxTiles ? formatNumber(maxTiles) : "-"} />
      </div>
      {Object.keys(workstationTiers).length ? (
        <div className="research-unlocks">
          {Object.entries(workstationTiers).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => (
            <span key={name}>{name.replaceAll("_", " ")} <TierBadge tier={value} /></span>
          ))}
        </div>
      ) : null}
      <section className="command-filter-panel research-command-panel">
        <div className="research-command-header">
          <span className="command-filter-title"><Search size={15} /> Research filters</span>
          <span>{formatNumber(matching.length)} matching technologies</span>
        </div>
        <div className="research-filter-grid">
          <label className="research-filter-field">
            <span>Technology</span>
            <SearchBox label="Search research technologies" value={query} onChange={setQuery} placeholder="Search technologies" />
          </label>
          <label className="research-filter-field">
            <span>Tier</span>
            <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
        </div>
      </section>
      <div className="two-col research-lanes">
        <section><h3><CheckCircle2 size={17} /> Completed Technology <small>{lanes.completed.length}</small></h3>{lanes.completed.map(({ item, state }) => card(item, state))}</section>
        <section><h3><Circle size={17} /> Available Research <small>{lanes.available.length}</small></h3>{lanes.available.map(({ item, state }) => card(item, state))}</section>
      </div>
    </div>
  );
}
