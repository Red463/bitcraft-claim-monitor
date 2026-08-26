import React from "react";
import "../styles/region.css";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Box,
  CircleDollarSign,
  Crown,
  Globe2,
  Hammer,
  MapPin,
  Server,
  Users,
} from "lucide-react";
import { TierBadge, TrackedOwnerName } from "../components/main/Badges";
import { MiniStat } from "../components/main/Stats";
import { usePersistedState } from "../hooks/usePersistedState";
import { toNumber, type AnyRecord } from "../main-app-data";
import { formatCompactNumber, formatNumber } from "../utils/format";
import { getOwnerName } from "../utils/ownership";
import { normalizeData } from "../utils/normalize";
import { regionScoreMaxima, settlementRegionScore } from "../utils/regionScore";

// Region compares the monitored settlement against the current complete
// generation published by its continuously connected regional Relay session.
export function Region({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [sortKey, setSortKey] = usePersistedState("region.sort.v2", "score");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("region.direction.v2", "desc");
  const allRows = data.region;
  const scoreMaxima = regionScoreMaxima(allRows);
  const scoreFormulaTitle = "Score = 90% tier + 7% treasury + 3% tiles. Supplies remain visible in the table but do not affect ranking. Treasury uses log scaling so huge treasuries do not dominate the ranking.";
  const scoreFor = (row: AnyRecord) => settlementRegionScore(row, scoreMaxima);
  const sorters: Record<string, (row: AnyRecord) => string | number> = {
    score: scoreFor,
    name: (row) => String(row.name ?? ""),
    owner: getOwnerName,
    tier: (row) => toNumber(row.tier),
    supplies: (row) => toNumber(row.supplies),
    treasury: (row) => toNumber(row.treasury),
    numTiles: (row) => toNumber(row.numTiles),
  };
  const rows = [...allRows].sort((a, b) => {
    const aVal = sorters[sortKey]?.(a) ?? 0;
    const bVal = sorters[sortKey]?.(b) ?? 0;
    const result = typeof aVal === "string" || typeof bVal === "string"
      ? String(aVal).localeCompare(String(bVal))
      : Number(aVal) - Number(bVal);
    return sortDir === "asc" ? result : -result;
  }).slice(0, 100);
  const mine = allRows.find((row) => String(row.entityId) === String(data.claim.entityId));
  const rank = (field: string) => {
    const sorted = [...allRows].sort((a, b) => toNumber(b[field]) - toNumber(a[field]));
    const idx = sorted.findIndex((row) => String(row.entityId) === String(data.claim.entityId));
    return idx >= 0 ? `#${idx + 1}` : "-";
  };
  const scoreRank = () => {
    const sorted = [...allRows].sort((a, b) => scoreFor(b) - scoreFor(a));
    const idx = sorted.findIndex((row) => String(row.entityId) === String(data.claim.entityId));
    return idx >= 0 ? `#${idx + 1}` : "-";
  };
  const chartRows = [...allRows].sort((a, b) => toNumber(b.supplies) - toNumber(a.supplies)).slice(0, 15);
  const maxSupplies = Math.max(...chartRows.map((row) => toNumber(row.supplies)), 1);
  const avgTier = allRows.length ? allRows.reduce((total, row) => total + toNumber(row.tier), 0) / allRows.length : 0;
  const avgTiles = allRows.length ? allRows.reduce((total, row) => total + toNumber(row.numTiles), 0) / allRows.length : 0;
  const totalTreasury = allRows.reduce((total, row) => total + toNumber(row.treasury), 0);
  const liveStatus = data.regionStatus.find((region) => String(region.regionId) === String(data.claim.regionId));
  const myRankRow = allRows.find((row) => String(row.entityId) === String(data.claim.entityId));
  const nearbyRows = myRankRow ? [...allRows]
    .filter((row) => String(row.entityId) !== String(data.claim.entityId))
    .map((row): AnyRecord => ({ ...row, distance: Math.abs(toNumber(row.locationX) - toNumber(myRankRow.locationX)) + Math.abs(toNumber(row.locationZ) - toNumber(myRankRow.locationZ)) }))
    .sort((a, b) => toNumber(a.distance) - toNumber(b.distance))
    .slice(0, 5) : [];
  function changeSort(nextKey: string) {
    if (nextKey === sortKey) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(nextKey);
      setSortDir(nextKey === "name" || nextKey === "owner" ? "asc" : "desc");
    }
  }
  const columns: Array<[string, string, (row: AnyRecord, index: number) => React.ReactNode]> = [
    ["#", "rank", (_r, i) => i + 1],
    ["Claim", "name", (r) => <span className={String(r.entityId) === String(data.claim.entityId) ? "mine-text" : ""}>{String(r.entityId) === String(data.claim.entityId) ? <Crown size={13} /> : null}{r.name}</span>],
    ["Owner", "owner", (r) => <TrackedOwnerName name={getOwnerName(r)} claim={data.claim} members={data.members} />],
    ["Score", "score", (r) => <strong title={scoreFormulaTitle}>{formatNumber(scoreFor(r), 0)}</strong>],
    ["Tier", "tier", (r) => <TierBadge tier={r.tier} />],
    ["Supplies", "supplies", (r) => formatNumber(r.supplies)],
    ["Treasury", "treasury", (r) => `${formatNumber(r.treasury)}g`],
    ["Tiles", "numTiles", (r) => formatNumber(r.numTiles)],
  ];
  const regionStatusLabel = liveStatus ? liveStatus.syncing ? "Syncing" : liveStatus.active ? "Active" : "Offline" : "-";
  return (
    <div className="panel region-panel" data-tour="region-page">
      <header className="members-topbar region-topbar">
        <div className="route-title-copy">
          <h2>{data.claim.regionName ?? "Region"}</h2>
          <p>{formatNumber(allRows.length)} settlements ranked by weighted score: tier, treasury, and tiles</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Server size={14} /> {regionStatusLabel}</span>
            <span><Users size={14} /> {liveStatus ? formatNumber(liveStatus.signedInPlayers) : "-"} online</span>
          </div>
          {myRankRow ? (
            <div className="dashboard-settlement-pill">
              <TierBadge tier={myRankRow.tier} />
              <span>{myRankRow.name}</span>
            </div>
          ) : null}
        </div>
      </header>
      {mine ? (
        <div className="rank-grid region-rank-grid">
          <MiniStat icon={<Crown />} label="Score Rank" value={scoreRank()} />
          <MiniStat icon={<Box />} label="Supply Rank" value={rank("supplies")} />
          <MiniStat icon={<CircleDollarSign />} label="Treasury Rank" value={rank("treasury")} />
          <MiniStat icon={<Hammer />} label="Tile Rank" value={rank("numTiles")} />
        </div>
      ) : null}
      <div className="metric-grid region-summary-grid">
        <MiniStat icon={<Globe2 />} label="Settlements" value={allRows.length} />
        <MiniStat icon={<Users />} label="Players Online" value={liveStatus ? formatNumber(liveStatus.signedInPlayers) : "-"} />
        <MiniStat icon={<Server />} label="Region Status" value={regionStatusLabel} />
        <MiniStat icon={<CircleDollarSign />} label="Region Treasury" value={formatCompactNumber(totalTreasury)} />
      </div>
      <div className="highlight-grid region-insights">
        <div><strong>Average Tier</strong><span>{avgTier.toFixed(1)} across known settlements</span></div>
        <div><strong>Average Tiles</strong><span>{formatNumber(avgTiles)} claimed tiles</span></div>
        <div><strong>Live Claims</strong><span>{formatNumber(allRows.length)} in the current Relay generation</span></div>
      </div>
      {toNumber(data.regionCoverage?.missingOwnerUsernameCount) > 0 ? (
        <div className="info">
          Owner usernames are unavailable for {formatNumber(data.regionCoverage.missingOwnerUsernameCount)} regional settlements.
        </div>
      ) : null}
      <div className="region-context">
        <section className="bar-panel region-leaders-panel">
          <h3><Box size={16} /> Supply Leaders</h3>
          {chartRows.map((row) => <div className="bar-row" key={row.entityId}><span>{row.name}</span><div><i style={{ width: `${(toNumber(row.supplies) / maxSupplies) * 100}%` }} className={String(row.entityId) === String(data.claim.entityId) ? "mine" : ""} /></div><b>{formatNumber(row.supplies)}</b></div>)}
        </section>
        {nearbyRows.length ? (
          <section className="nearby-panel">
            <h3><MapPin size={17} /> Close Settlements</h3>
            <p>These settlements are geographically closest to our monitored settlement.</p>
            {nearbyRows.map((row) => <div key={row.entityId}><strong>{row.name}</strong><span><TrackedOwnerName name={getOwnerName(row)} claim={data.claim} members={data.members} /> <TierBadge tier={row.tier} /></span><small>{formatNumber(row.supplies)} supplies</small></div>)}
          </section>
        ) : null}
      </div>
      <section className="command-filter-panel region-table-panel">
        <div className="command-filter-header">
          <span className="command-filter-title"><Globe2 size={15} /> Regional rankings</span>
          <span>Default sort uses weighted score: 90% tier, 7% treasury, 3% tiles</span>
        </div>
        <div className="table-wrap" tabIndex={0} aria-label="Regional rankings table">
          <table>
            <thead>
              <tr>{columns.map(([label, key]) => <th key={label}><button className="sort-button" title={key === "score" ? scoreFormulaTitle : undefined} onClick={() => key !== "rank" && changeSort(key)} disabled={key === "rank"}>{label}{key !== "rank" ? (sortKey === key ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />) : null}</button></th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => <tr className={String(row.entityId) === String(data.claim.entityId) ? "mine-row" : ""} key={row.entityId ?? index}>{columns.map(([label, , render]) => <td key={label}>{render(row, index) ?? "-"}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
