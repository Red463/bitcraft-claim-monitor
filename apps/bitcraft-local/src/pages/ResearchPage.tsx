import React from "react";
import { Box, CheckCircle2, Circle, Crown, Lock, MapPin, Search } from "lucide-react";
import { TierBadge } from "../components/main/Badges";
import { SearchBox } from "../components/main/SearchBox";
import { MiniStat } from "../components/main/Stats";
import { usePersistedState } from "../hooks/usePersistedState";
import { claimSupplyCap, toNumber, type AnyRecord } from "../main-app-data";
import { unique } from "../utils/array";
import { formatNumber } from "../utils/format";
import { normalizeData } from "../utils/normalize";

// BitCraft research unlocks are effectively instant once obtained, so this page
// presents researched versus available technologies and derives settlement caps
// from the unlocked tech list rather than modelling an active research queue.
export function Research({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = usePersistedState("research.tier", "All");
  const matching = data.research.filter((item) => {
    if (query && !String(item.name ?? "").toLowerCase().includes(query.toLowerCase())) return false;
    if (tier !== "All" && String(item.tier) !== tier) return false;
    return true;
  });
  const researched = matching.filter((item) => item.isResearched);
  const available = matching.filter((item) => !item.isResearched);
  const tiers = unique(data.research.map((item) => String(item.tier)).filter(Boolean)).sort();
  const totalResearched = data.research.filter((item) => item.isResearched).length;
  const totalAvailable = data.research.filter((item) => !item.isResearched).length;
  const completion = data.research.length ? Math.round((totalResearched / data.research.length) * 100) : 0;
  const researchedTechs = data.research.filter((item) => item.isResearched);
  const maxTiles = Math.max(toNumber(data.claim.numTiles), ...researchedTechs.map((item) => toNumber(item.area)), 0);
  const maxSupplies = claimSupplyCap(data.claim);
  const settlementTier = toNumber(data.claim.tier);
  const workstationTiers = researchedTechs
    .filter((item) => /tier\s+\d+/i.test(String(item.name ?? "")) && item.techType && !["tier_upgrade", "settlement"].includes(String(item.techType)))
    .reduce<Record<string, number>>((acc, item) => {
      acc[String(item.techType)] = Math.max(acc[String(item.techType)] ?? 0, toNumber(item.tier));
      return acc;
    }, {});
  const card = (item: AnyRecord, done: boolean) => (
    <div className={`research-card ${done ? "done" : ""}`} key={item.entityId ?? item.id ?? item.name}>
      <span>{done ? <CheckCircle2 /> : <Circle />}</span>
      <strong>{item.name ?? item.techName ?? item.id ?? "Unknown Technology"}<small>{item.suppliesCost ? `${formatNumber(item.suppliesCost)} supplies` : ""}</small></strong>
      {item.tier ? <TierBadge tier={item.tier} /> : null}
    </div>
  );
  return (
    <div className="panel research-panel">
      <header className="members-topbar research-topbar">
        <div>
          <h2>Research & Technology</h2>
          <p>Technology progression and the next available unlocks</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><CheckCircle2 size={14} /> {formatNumber(totalResearched)} researched</span>
            <span>{formatNumber(totalAvailable)} available</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">{completion}%</span>
            <span>Research complete</span>
          </div>
        </div>
      </header>
      <div className="summary-grid research-summary">
        <MiniStat icon={<CheckCircle2 />} label="Researched" value={formatNumber(totalResearched)} />
        <MiniStat icon={<Lock />} label="Available" value={formatNumber(totalAvailable)} />
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
      <section className="production-command-panel research-command-panel">
        <div className="research-command-header">
          <span className="production-command-title"><Search size={15} /> Research filters</span>
          <span>{formatNumber(matching.length)} matching technologies</span>
        </div>
        <div className="research-filter-grid">
          <label className="research-filter-field">
            <span>Technology</span>
            <SearchBox value={query} onChange={setQuery} placeholder="Search technologies" />
          </label>
          <label className="research-filter-field">
            <span>Tier</span>
            <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
        </div>
      </section>
      <div className="two-col research-lanes"><section><h3><CheckCircle2 size={17} /> Completed Technology <small>{researched.length}</small></h3>{researched.map((item) => card(item, true))}</section><section><h3><Lock size={17} /> Available Research <small>{available.length}</small></h3>{available.map((item) => card(item, false))}</section></div>
    </div>
  );
}
