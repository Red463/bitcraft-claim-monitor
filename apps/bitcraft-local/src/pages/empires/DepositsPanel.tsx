import React from "react";
import { CircleHelp, Clock, Gem, MapPin, Zap } from "lucide-react";

import { AsyncState } from "../../components/main/AsyncState";
import { AppSkeleton } from "../../components/main/AppChrome";
import { DataTable, type DataTableColumn } from "../../components/main/DataTable";
import { MiniStat } from "../../components/main/Stats";
import { type AnyRecord } from "../../main-app-data";
import { dateLabel, formatNumber, timeAgo } from "../../utils/format";
import { presentDepositStatus, summarizeDeposits } from "./depositPresentation";

function respawnLabel(row: AnyRecord): string {
  if (row.status !== "respawning" || !row.respawnAt) return "-";
  return `${timeAgo(row.respawnAt)} (${dateLabel(row.respawnAt)})`;
}

export function DepositsPanel({
  data,
  loading,
  error,
  monitoredRegionId,
}: {
  data: AnyRecord | null;
  loading: boolean;
  error: string | null;
  monitoredRegionId: string;
}) {
  const rows = React.useMemo(() => (
    (Array.isArray(data?.deposits) ? data.deposits : [])
      .filter((row: AnyRecord) => String(row.regionId ?? "") === monitoredRegionId)
  ), [data, monitoredRegionId]);
  const summary = React.useMemo(() => summarizeDeposits(rows), [rows]);
  const partialErrors = Array.isArray(data?.partialErrors)
    ? data.partialErrors.map(String)
    : [];
  const columns: DataTableColumn[] = [
    ["Deposit", (row) => <span className="deposit-name-cell"><Gem size={14} /><strong>{row.name ?? `Deposit ${row.entityId}`}</strong></span>],
    ["Status", (row) => {
      const presentation = presentDepositStatus(row);
      return <span className={`status-pill ${presentation.tone}`}>{presentation.label}</span>;
    }],
    ["North / East", (row) => (
      row.north == null || row.east == null
        ? "-"
        : <span className="coordinate-cell"><MapPin size={13} /> N {formatNumber(row.north)}, E {formatNumber(row.east)}</span>
    )],
    ["Respawn", respawnLabel],
  ];

  if (loading && !data) return <AppSkeleton />;
  if (error && !data) {
    return <AsyncState kind="error" title="Unable to load Hexite deposits" detail={error} />;
  }

  return (
    <>
      <div className="stats-grid">
        <MiniStat icon={<Gem />} label="Deposits" value={formatNumber(summary.total)} />
        <MiniStat icon={<Zap />} label="Explicitly active" value={formatNumber(summary.active)} />
        <MiniStat icon={<Clock />} label="Respawning" value={formatNumber(summary.respawning)} />
        <MiniStat
          icon={<CircleHelp />}
          label="Unknown state"
          value={formatNumber(summary.unknown)}
        />
      </div>
      {loading && data ? <AsyncState kind="loading" title="Refreshing Hexite deposits" detail="Current Relay rows remain visible." compact /> : null}
      {error ? <AsyncState kind="error" title="Unable to refresh Hexite deposits" detail={error} compact /> : null}
      {data?.stale ? <AsyncState kind="stale" title="Showing last-good deposit data" detail="Relay refresh is recovering; status and respawn times may be out of date." compact /> : null}
      {partialErrors.length ? <div className="warning-card">{partialErrors.slice(0, 3).join("; ")}</div> : null}
      <section className="dashboard-card table-panel deposits-panel">
        <div className="panel-head">
          <strong><Gem size={15} /> Hexite deposits · Region {monitoredRegionId}</strong>
          <span>{summary.nextRespawnAt ? `Next respawn ${timeAgo(summary.nextRespawnAt)}` : `${formatNumber(rows.length)} shown`}</span>
        </div>
        <p className="deposit-status-note">
          <CircleHelp size={14} />
          Unknown does not mean active or harvestable. Only an explicit Relay
          <strong> active</strong> state is shown as active.
        </p>
        <DataTable
          rows={rows}
          columns={columns}
          scrollLabel="Hexite deposits table"
          emptyState={<AsyncState kind="empty" title="No Hexite deposits returned" detail={`Relay has no deposit rows for Region ${monitoredRegionId}.`} compact />}
        />
      </section>
    </>
  );
}
