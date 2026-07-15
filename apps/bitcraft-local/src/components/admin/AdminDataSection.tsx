import React from "react";
import { Database, Download, HardDrive, RefreshCw, Save } from "lucide-react";
import { DataTable } from "../main/DataTable";
import { SearchBox } from "../main/SearchBox";
import { Info } from "../main/Stats";
import type { AnyRecord } from "../../main-app-data";
import { toNumber } from "../../main-app-data";
import { dateLabel, formatNumber } from "../../utils/format";
import { bytesLabel } from "./adminDisplay";

type AdminDataSectionProps = {
  tab: "database" | "backups";
  data: {
    tables: AnyRecord[];
    selectedTable: string;
    tableResult: AnyRecord;
    tableSearch: string;
    tableOffset: number;
    backups: AnyRecord[];
    snapshotRetentionDays: number;
  };
  pending: (key: string) => boolean;
  error?: string | null;
  result?: { message: string; kind: "success" | "info" } | null;
  onSelectTable: (table: string) => void;
  onTableSearchChange: (search: string) => void;
  onPreviousTablePage: () => void;
  onNextTablePage: () => void;
  onCreateBackup: () => void;
  onPruneSnapshots: () => void;
  tableExportHref: (format: "csv" | "json") => string;
  backupDownloadHref: (name: string) => string;
};

export function AdminDataSection({
  tab,
  data,
  pending,
  error,
  result,
  onSelectTable,
  onTableSearchChange,
  onPreviousTablePage,
  onNextTablePage,
  onCreateBackup,
  onPruneSnapshots,
  tableExportHref,
  backupDownloadHref,
}: AdminDataSectionProps) {
  const activeTableResult = data.tableResult.table === data.selectedTable
    ? data.tableResult
    : { table: data.selectedTable, rows: [], columns: [], total: 0, offset: data.tableOffset, limit: 50 };
  const tableRows: AnyRecord[] = activeTableResult.rows ?? [];
  const tableColumns = activeTableResult.columns ?? Object.keys(tableRows[0] ?? {});
  const selectedTableInfo = data.tables.find((table) => table.name === data.selectedTable);
  const tableRangeStart = activeTableResult.total ? data.tableOffset + 1 : 0;
  const tableRangeEnd = Math.min(data.tableOffset + tableRows.length, toNumber(activeTableResult.total));

  return (
    <>
      {error ? <div className="admin-message error" role="alert" aria-live="assertive">{error}</div> : null}
      {result ? <div className={`admin-message ${result.kind}`} role="status" aria-live="polite">{result.message}</div> : null}
      {tab === "database" ? (
        <section className="form-card database-browser">
          <div className="database-browser-header">
            <div>
              <h3><Database size={17} /> Database Browser</h3>
              <p className="legend">Inspect SQLite tables and export filtered records. Use this for support and diagnostics, not normal settlement operations.</p>
            </div>
            <label className="field database-table-select">
              <span>Table</span>
              <select className="select-control" value={data.selectedTable} onChange={(event) => onSelectTable(event.target.value)}>{data.tables.map((table) => <option key={table.name} value={table.name}>{table.name} ({formatNumber(table.rows)})</option>)}</select>
            </label>
          </div>
          <div className="database-inspector-stats">
            <Info label="Selected table" value={data.selectedTable || "-"} />
            <Info label="Total rows" value={formatNumber(selectedTableInfo?.rows ?? activeTableResult.total)} />
            <Info label="Columns" value={formatNumber(tableColumns.length)} />
            <Info label="Showing" value={`${formatNumber(tableRangeStart)}-${formatNumber(tableRangeEnd)}`} />
          </div>
          <div className="database-toolbar">
            <SearchBox label="Search visible database records" value={data.tableSearch} onChange={onTableSearchChange} placeholder="Search across visible table records" />
            <div className="database-export-actions">
              <a className="toolbar-button" title="Download the selected table with the current search filter as CSV." href={tableExportHref("csv")}><Download size={14} /> Export CSV</a>
              <a className="toolbar-button" title="Download the selected table with the current search filter as JSON." href={tableExportHref("json")}><Download size={14} /> Export JSON</a>
            </div>
          </div>
          {tableColumns.length ? <DataTable rows={tableRows} scrollLabel="Database records table" emptyState="No database records match the current search." columns={tableColumns.map((key: string) => [key, (row: AnyRecord) => { const value = String(row[key] ?? "-"); const display = value.length > 120 ? `${value.slice(0, 120)}...` : value; return <code className={value.startsWith("{") || value.startsWith("[") ? "database-cell-code" : ""}>{display}</code>; }])} /> : <p className="legend">No records returned.</p>}
          <div className="pager"><span>{formatNumber(activeTableResult.total)} matching records</span><button className="toolbar-button" disabled={!data.tableOffset} onClick={onPreviousTablePage}>Previous</button><button className="toolbar-button" disabled={data.tableOffset + 50 >= activeTableResult.total} onClick={onNextTablePage}>Next</button></div>
        </section>
      ) : null}

      {tab === "backups" ? (
        <div className="admin-section">
          <section className="form-card">
            <div className="split-header"><h3><HardDrive size={17} /> Database Backups</h3><button className="toolbar-button primary" disabled={pending("backup-create")} title="Create a downloadable SQLite backup on the server." onClick={onCreateBackup}><Save size={15} /> Create Backup</button></div>
            <p className="legend">Downloadable SQLite copies are stored on the server. Restore them manually on the VPS while services are stopped.</p>
            <div className="backup-list">{data.backups.length ? data.backups.map((backup) => <div key={backup.name}><div><strong>{backup.name}</strong><span>{bytesLabel(backup.size)} | {dateLabel(backup.createdAt)}</span></div><a className="toolbar-button" title="Download this database backup file." href={backupDownloadHref(backup.name)}><Download size={14} /> Download</a></div>) : <p className="legend">No database backups have been created yet.</p>}</div>
          </section>
          <section className="form-card maintenance-card">
            <h3><Database size={17} /> Retention Maintenance</h3>
            <p className="legend">Removes snapshots older than the configured {data.snapshotRetentionDays}-day retention window. Market and activity history are retained.</p>
            <button className="toolbar-button" disabled={pending("snapshots-prune")} title="Remove expired snapshot rows only. Market trades and activity history are retained." onClick={onPruneSnapshots}><RefreshCw size={15} /> Remove Expired Snapshots</button>
          </section>
        </div>
      ) : null}
    </>
  );
}
