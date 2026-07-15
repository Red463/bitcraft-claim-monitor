import { Activity, RefreshCw } from "lucide-react";
import { ActionButton } from "../main/ActionButton";
import { BotStatusInfo } from "./BotStatusInfo";

type AnyRecord = Record<string, any>;

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value: unknown, maximumFractionDigits = 0): string {
  return toNumber(value).toLocaleString(undefined, { maximumFractionDigits });
}

function dateLabel(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
}

export function DiscordDiagnosticsPanel({
  filter,
  log,
  onFilterChange,
  onRefresh,
  pending,
}: {
  filter: string;
  log: AnyRecord[];
  onFilterChange: (value: string) => void;
  onRefresh: () => void | Promise<void>;
  pending: boolean;
}) {
  const safeLog = Array.isArray(log) ? log : [];
  const types = Array.from(new Set(safeLog.map((entry) => String(entry.event_type ?? "")).filter(Boolean))).sort();
  const filteredLog = filter === "all" ? safeLog : safeLog.filter((entry) => String(entry.event_type ?? "") === filter);
  const counts = {
    total: filteredLog.length,
    sent: filteredLog.filter((entry) => String(entry.status ?? "").toLowerCase() === "sent").length,
    skipped: filteredLog.filter((entry) => String(entry.status ?? "").toLowerCase() === "skipped").length,
    failed: filteredLog.filter((entry) => String(entry.status ?? "").toLowerCase() === "failed").length,
  };

  return (
    <section className="form-card discord-terminal-card">
      <div className="split-header">
        <h3><Activity size={17} /> Discord Diagnostics</h3>
        <div className="toolbar discord-diagnostics-toolbar">
          <select value={filter} onChange={(event) => onFilterChange(event.target.value)}>
            <option value="all">All types</option>
            {types.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <ActionButton className="toolbar-button" pending={pending} pendingLabel="Refreshing log..." onClick={() => void onRefresh()}><RefreshCw size={15} /> Refresh Log</ActionButton>
        </div>
      </div>
      <p className="legend">Newest entries are shown first. This records sent, skipped and failed Discord notifications with routing and filter details so notification issues can be diagnosed.</p>
      <div className="discord-diagnostics-summary" aria-label="Discord diagnostics summary">
        <BotStatusInfo label="Showing" content={formatNumber(counts.total)} />
        <BotStatusInfo label="Sent" content={formatNumber(counts.sent)} tone="success" />
        <BotStatusInfo label="Skipped" content={formatNumber(counts.skipped)} tone="warning" />
        <BotStatusInfo label="Failed" content={formatNumber(counts.failed)} tone="danger" />
      </div>
      <div className="discord-diagnostics-list" role="log" aria-label="Discord diagnostics log">
        {filteredLog.length ? filteredLog.map((entry) => {
          const metadata = entry.metadata ?? {};
          const statusName = String(entry.status ?? "unknown").toLowerCase();
          const detailRows = [
            ["Type", entry.event_type],
            ["Status", entry.status],
            entry.channel_key ? ["Channel key", entry.channel_key] : null,
            entry.channel_id ? ["Channel ID", entry.channel_id] : null,
            entry.reason ? ["Reason", entry.reason] : null,
            entry.error ? ["Error", entry.error] : null,
            metadata?.productionUsers ? ["Allowed crafters", metadata.productionUsers] : null,
            metadata?.productionMinXp !== undefined ? ["Minimum XP", formatNumber(metadata.productionMinXp)] : null,
            metadata?.productionMinAgeMinutes !== undefined ? ["Minimum age", `${metadata.productionMinAgeMinutes}m`] : null,
            metadata?.craftRoleId ? ["Craft role", metadata.craftRoleId] : null,
            metadata?.metadata?.crafterName ? ["Crafter", metadata.metadata.crafterName] : null,
            metadata?.metadata?.skillName ? ["Profession", metadata.metadata.skillName] : null,
            metadata?.metadata?.tier ? ["Tier", `T${metadata.metadata.tier}`] : null,
            metadata?.metadata?.totalXp !== undefined ? ["Craft XP", formatNumber(metadata.metadata.totalXp)] : null,
            metadata?.metadata?.progressPct !== undefined ? ["Progress", `${metadata.metadata.progressPct}%`] : null,
            metadata?.metadata?.activeCraftCount !== undefined ? ["Active crafts", metadata.metadata.activeCraftCount] : null,
          ].filter(Boolean) as [string, unknown][];
          return (
            <article className={`discord-diagnostic-card ${statusName}`} key={entry.id}>
              <div className="discord-diagnostic-top">
                <span className={`discord-diagnostic-status ${statusName}`}>{statusName}</span>
                <strong>{entry.summary ?? entry.event_type}</strong>
                <time>{dateLabel(entry.occurred_at)}</time>
              </div>
              <div className="discord-diagnostic-meta">
                {detailRows.map(([label, value]) => <BotStatusInfo key={label} label={label} content={String(value ?? "-")} />)}
              </div>
              {(Array.isArray(metadata?.metadata?.crafts) && metadata.metadata.crafts.length) || entry.response ? (
                <details className="discord-diagnostic-details">
                  <summary>Raw details</summary>
                  {Array.isArray(metadata?.metadata?.crafts) && metadata.metadata.crafts.length ? <code>crafts={JSON.stringify(metadata.metadata.crafts, null, 2)}</code> : null}
                  {entry.response ? <code>response={JSON.stringify(entry.response, null, 2)}</code> : null}
                </details>
              ) : null}
            </article>
          );
        }) : <div className="discord-log-empty">No Discord diagnostics recorded yet.</div>}
      </div>
    </section>
  );
}
