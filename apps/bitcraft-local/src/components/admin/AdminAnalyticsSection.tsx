import React from "react";
import { Activity, AlertTriangle, Clock, Command, Database, Factory, Globe2, Lock, MapPin, RefreshCw, Server, Shield, TrendingUp, Users, X } from "lucide-react";
import { DataTable } from "../main/DataTable";
import { SearchBox } from "../main/SearchBox";
import { Info, Stat } from "../main/Stats";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { dateLabel, formatDuration, formatNumber } from "../../utils/format";
import { safeDisplayJson } from "../../utils/displayHelpers";

type AdminAnalyticsSectionProps = {
  tab: "analytics" | "audit";
  data: {
    analyticsDays: string;
    analyticsData: AnyRecord | null;
    visitorSecurityData: AnyRecord | null;
    securityEventSearch: string;
    securityEventPage: number;
    securityEventPageSize: number;
    auditData: AnyRecord;
    auditFilter: string;
    auditVisibleCount: number;
  };
  pending: (key: string) => boolean;
  error?: string | null;
  result?: { message: string; kind: "success" | "info" } | null;
  onAnalyticsDaysChange: (days: string) => void;
  onClearAnalytics: () => void;
  onSecurityEventSearchChange: (search: string) => void;
  onSecurityEventPageChange: (page: number) => void;
  onSecurityEventPageSizeChange: (pageSize: number) => void;
  onAuditFilterChange: (filter: string) => void;
  onLoadMoreAudit: () => void;
  onRefreshAudit: () => void;
};

export function AdminAnalyticsSection({
  tab,
  data,
  pending,
  error,
  result,
  onAnalyticsDaysChange,
  onClearAnalytics,
  onSecurityEventSearchChange,
  onSecurityEventPageChange,
  onSecurityEventPageSizeChange,
  onAuditFilterChange,
  onLoadMoreAudit,
  onRefreshAudit,
}: AdminAnalyticsSectionProps) {
  const securityRecent = data.visitorSecurityData?.recent ?? {};
  const securityEventRows: AnyRecord[] = Array.isArray(securityRecent) ? securityRecent : securityRecent.rows ?? [];
  const securityEventTotal = Array.isArray(securityRecent) ? securityEventRows.length : toNumber(securityRecent.total);
  const securityEventActivePage = Array.isArray(securityRecent) ? 1 : toNumber(securityRecent.page) || data.securityEventPage;
  const securityEventActivePageSize = Array.isArray(securityRecent) ? securityEventRows.length || data.securityEventPageSize : toNumber(securityRecent.pageSize) || data.securityEventPageSize;
  const securityEventPageCount = Math.max(1, Math.ceil(securityEventTotal / Math.max(securityEventActivePageSize, 1)));
  const securityEventRangeStart = securityEventTotal ? (securityEventActivePage - 1) * securityEventActivePageSize + 1 : 0;
  const securityEventRangeEnd = securityEventTotal ? Math.min(securityEventRangeStart + securityEventRows.length - 1, securityEventTotal) : 0;
  const auditRows: AnyRecord[] = Array.isArray(data.auditData.auditLog) ? data.auditData.auditLog : [];
  const loginRows: AnyRecord[] = Array.isArray(data.auditData.logins) ? data.auditData.logins : [];
  const normalizedAuditFilter = data.auditFilter.trim().toLowerCase();
  const filteredAuditLog = normalizedAuditFilter ? auditRows.filter((entry) => `${entry.action ?? ""} ${entry.username ?? ""} ${entry.details ?? ""}`.toLowerCase().includes(normalizedAuditFilter)) : auditRows;
  const filteredLoginRows = normalizedAuditFilter ? loginRows.filter((entry) => `${entry.username ?? ""} ${entry.remote_address ?? ""} ${entry.successful ? "successful" : "failed"}`.toLowerCase().includes(normalizedAuditFilter)) : loginRows;
  const visibleAuditLog = filteredAuditLog.slice(0, data.auditVisibleCount);
  const visibleLoginRows = filteredLoginRows.slice(0, data.auditVisibleCount);

  return (
    <>
      {error ? <div className="admin-message error" role="alert" aria-live="assertive">{error}</div> : null}
      {result ? <div className={`admin-message ${result.kind}`} role="status" aria-live="polite">{result.message}</div> : null}
      {tab === "analytics" ? (
        <>
          <section className="form-card">
            <div className="split-header">
              <h3><TrendingUp size={17} /> Usage Analytics</h3>
              <div className="toolbar"><label className="inline-field"><span>Period</span><select className="select-control" value={data.analyticsDays} onChange={(event) => onAnalyticsDaysChange(event.target.value)}><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><button className="toolbar-button danger" disabled={pending("analytics-clear")} title="Delete all opt-in usage analytics records. Security request logs are separate." onClick={onClearAnalytics}><X size={14} /> Clear Data</button></div>
            </div>
            <p className="legend">First-party analytics collected only from visitors who accept analytics cookies. Browser identifiers are random, reporting is aggregate, and raw events are retained for up to {data.analyticsData?.retentionDays ?? 90} days.</p>
            <div className="metric-grid analytics-metrics">
              <Stat icon={<Users />} label="Visitors" value={formatNumber(data.analyticsData?.totals?.visitors)} />
              <Stat icon={<Globe2 />} label="Sessions" value={formatNumber(data.analyticsData?.totals?.sessions)} />
              <Stat icon={<Activity />} label="Page Views" value={formatNumber(data.analyticsData?.totals?.pageViews)} />
              <Stat icon={<Command />} label="Feature Uses" value={formatNumber(data.analyticsData?.totals?.interactions)} />
              <Stat icon={<RefreshCw />} label="Time Recorded" value={formatDuration(toNumber(data.analyticsData?.totals?.durationSeconds))} />
            </div>
          </section>
          <div className="admin-grid">
            <section className="form-card">
              <h3><Globe2 size={17} /> Most Used Pages</h3>
              <DataTable rows={data.analyticsData?.pages ?? []} scrollLabel="Page analytics table" emptyState="No page analytics were recorded for this period." columns={[
                ["Page", (row) => String(row.page).replaceAll("publiccrafts", "Public Craft Finder")],
                ["Views", (row) => formatNumber(row.pageViews)],
                ["Visitors", (row) => formatNumber(row.visitors)],
                ["Time", (row) => formatDuration(toNumber(row.durationSeconds))],
              ]} />
            </section>
            <section className="form-card">
              <h3><Factory size={17} /> Feature Usage</h3>
              <DataTable rows={data.analyticsData?.features ?? []} scrollLabel="Feature analytics table" emptyState="No feature analytics were recorded for this period." columns={[
                ["Feature", (row) => String(row.eventName).replaceAll("_", " ")],
                ["Uses", (row) => formatNumber(row.uses)],
                ["Visitors", (row) => formatNumber(row.visitors)],
              ]} />
            </section>
          </div>
          <section className="form-card">
            <div className="split-header">
              <div>
                <h3><Shield size={17} /> Visitor Security & Location</h3>
                <p className="legend">Server-side request logging for security and abuse prevention. This runs independently of optional analytics cookies. Full IPs are retained for {data.visitorSecurityData?.retention?.fullIpDays ?? 7} days, then anonymised stats remain.</p>
              </div>
            </div>
            <div className="metric-grid analytics-metrics">
              <Stat icon={<Activity />} label="Requests" value={formatNumber(data.visitorSecurityData?.totals?.requests)} />
              <Stat icon={<Users />} label="Unique Visitors" value={formatNumber(data.visitorSecurityData?.totals?.uniqueVisitors)} />
              <Stat icon={<AlertTriangle />} label="Error Responses" value={formatNumber(data.visitorSecurityData?.totals?.errors)} />
              <Stat icon={<MapPin />} label="GeoIP Status" value={data.visitorSecurityData?.geoip?.configured ? `${data.visitorSecurityData?.geoip?.provider === "ipapi" ? "ipapi cache" : "local"} · ${formatNumber(data.visitorSecurityData?.geoip?.entries)} records` : "Not configured"} />
              <Stat icon={<Clock />} label="Full IP Retention" value={`${formatNumber(data.visitorSecurityData?.retention?.fullIpDays ?? 7)} days`} />
            </div>
          </section>
          <div className="admin-grid">
            <section className="form-card">
              <h3><Globe2 size={17} /> Location Summary</h3>
              <DataTable rows={data.visitorSecurityData?.locations ?? []} scrollLabel="Visitor locations table" emptyState="No visitor locations were recorded for this period." columns={[
                ["Country", (row) => row.country || "Unknown"],
                ["City", (row) => row.city || "-"],
                ["Requests", (row) => formatNumber(row.requests)],
                ["Visitors", (row) => formatNumber(row.visitors)],
              ]} />
            </section>
            <section className="form-card">
              <h3><Server size={17} /> Route Groups</h3>
              <DataTable rows={data.visitorSecurityData?.routes ?? []} scrollLabel="Route visits table" emptyState="No route visits were recorded for this period." columns={[
                ["Group", (row) => row.routeGroup],
                ["Requests", (row) => formatNumber(row.requests)],
                ["Errors", (row) => formatNumber(row.errors)],
              ]} />
            </section>
          </div>
          <section className="form-card">
            <div className="split-header">
              <div>
                <h3><Database size={17} /> Recent Security Events</h3>
                <p className="legend">Search and page through retained server-side request logs for security and abuse investigation.</p>
              </div>
              <label className="inline-field">
                <span>Rows</span>
                <select className="select-control" value={data.securityEventPageSize} onChange={(event) => onSecurityEventPageSizeChange(Number(event.target.value))}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </label>
            </div>
            <div className="database-toolbar">
              <SearchBox label="Search visitor security events" value={data.securityEventSearch} onChange={onSecurityEventSearchChange} placeholder="Search time, group, status, IP, country or city" />
              <span className="legend">{formatNumber(securityEventTotal)} matching events</span>
            </div>
            <DataTable rows={securityEventRows} scrollLabel="Security events table" emptyState="No security events match the current search and filters." columns={[
              ["Time", (row) => dateLabel(row.occurredAt)],
              ["Method", (row) => row.method],
              ["Group", (row) => row.routeGroup],
              ["Status", (row) => row.statusCode],
              ["IP", (row) => row.ipAddress ?? row.ipAnonymized ?? "-"],
              ["Location", (row) => [row.city, row.country].filter(Boolean).join(", ") || "Unknown"],
            ]} />
            <div className="pager">
              <span>Showing {formatNumber(securityEventRangeStart)}-{formatNumber(securityEventRangeEnd)} of {formatNumber(securityEventTotal)} events</span>
              <button className="toolbar-button" disabled={securityEventActivePage <= 1} onClick={() => onSecurityEventPageChange(Math.max(1, securityEventActivePage - 1))}>Previous</button>
              <span className="legend">Page {formatNumber(securityEventActivePage)} of {formatNumber(securityEventPageCount)}</span>
              <button className="toolbar-button" disabled={securityEventActivePage >= securityEventPageCount} onClick={() => onSecurityEventPageChange(securityEventActivePage + 1)}>Next</button>
            </div>
          </section>
        </>
      ) : null}

      {tab === "audit" ? (
        <>
          <section className="form-card audit-console-card">
            <div className="split-header">
              <div>
                <h3><Activity size={17} /> Audit Trail</h3>
                <p className="legend">Search recent administrator actions and sign-ins. Results are bounded so the page stays usable.</p>
              </div>
              <button className={`toolbar-button${pending("audit-refresh") ? " is-loading" : ""}`} disabled={pending("audit-refresh")} onClick={onRefreshAudit}><RefreshCw size={15} /> Refresh</button>
            </div>
            <div className="audit-toolbar">
              <label className="field"><span>Search audit records</span><input value={data.auditFilter} onChange={(event) => onAuditFilterChange(event.target.value)} placeholder="Action, admin, IP, result" /></label>
              <div className="audit-summary-strip">
                <Info label="Actions shown" value={`${formatNumber(Math.min(visibleAuditLog.length, filteredAuditLog.length))} of ${formatNumber(filteredAuditLog.length)}`} />
                <Info label="Sign-ins shown" value={`${formatNumber(Math.min(visibleLoginRows.length, filteredLoginRows.length))} of ${formatNumber(filteredLoginRows.length)}`} />
              </div>
            </div>
            <div className="audit-table" role="table" aria-label="Admin actions">
              <div className="audit-table-row header" role="row"><span>Action</span><span>Admin</span><span>When</span><span>Details</span></div>
              {visibleAuditLog.length ? visibleAuditLog.map((entry: AnyRecord) => (
                <div className="audit-table-row" role="row" key={entry.id}>
                  <strong>{entry.action}</strong>
                  <span>{entry.username ?? "Unknown"}</span>
                  <time>{dateLabel(entry.occurred_at)}</time>
                  <small>{entry.details ? String(safeDisplayJson(entry.details)) : "-"}</small>
                </div>
              )) : <p className="legend">{normalizedAuditFilter ? "No administrator actions match this filter." : "No administrator actions have been recorded yet."}</p>}
            </div>
            {data.auditData.auditLog.length > data.auditVisibleCount || filteredAuditLog.length > visibleAuditLog.length ? (
              <button className="toolbar-button audit-load-more" onClick={onLoadMoreAudit}>Load more actions</button>
            ) : null}
          </section>
          <section className="form-card audit-console-card">
            <h3><Lock size={17} /> Sign-in History</h3>
            <div className="audit-table compact" role="table" aria-label="Admin sign-in history">
              <div className="audit-table-row header" role="row"><span>Result</span><span>Admin</span><span>When</span><span>Remote address</span></div>
              {visibleLoginRows.length ? visibleLoginRows.map((entry: AnyRecord) => (
                <div key={entry.id} className={`audit-table-row ${entry.successful ? "" : "failed"}`} role="row">
                  <strong>{entry.successful ? "Successful sign-in" : "Failed sign-in"}</strong>
                  <span>{entry.username ?? "Unknown"}</span>
                  <time>{dateLabel(entry.occurred_at)}</time>
                  <small>{entry.remote_address ?? "-"}</small>
                </div>
              )) : <p className="legend">No administrator sign-ins match this filter.</p>}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
