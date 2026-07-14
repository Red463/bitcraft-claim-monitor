import React from "react";
import { Activity, AlertTriangle, CheckCircle2, Copy, Cpu, Database, HardDrive, MemoryStick, Network, RefreshCw, Server, ShieldAlert } from "lucide-react";
import { formatNumber } from "../../utils/format";
import type { AnyRecord } from "../../main-app-data";

const LOCAL_API = "/api/local";
const pct = (value: unknown) => `${formatNumber(Number(value) || 0, 1)}%`;
const bytes = (value: unknown) => {
  const amount = Number(value) || 0;
  if (amount >= 1024 ** 3) return `${formatNumber(amount / 1024 ** 3, 1)} GB`;
  if (amount >= 1024 ** 2) return `${formatNumber(amount / 1024 ** 2, 1)} MB`;
  return `${formatNumber(amount / 1024, 1)} KB`;
};

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return <div className="server-health-chart-empty">History will appear after the VPS collector has run.</div>;
  const max = Math.max(...clean, 1);
  const points = clean.map((value, index) => `${(index / (clean.length - 1)) * 100},${36 - (value / max) * 34}`).join(" ");
  return <svg className="server-health-sparkline" viewBox="0 0 100 38" role="img" aria-label={label} preserveAspectRatio="none"><polyline points={points} /></svg>;
}

export function ServerHealthSection() {
  const [data, setData] = React.useState<AnyRecord | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [intervalSeconds, setIntervalSeconds] = React.useState(30);
  const [service, setService] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [bundleLoading, setBundleLoading] = React.useState(false);
  const refreshPromiseRef = React.useRef<Promise<void> | null>(null);

  const refresh = React.useCallback(() => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const request = (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ service, severity, search, limit: "100" });
        const response = await fetch(`${LOCAL_API}/admin/server-health?${params}`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        setData(body);
        setError("");
      } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
      finally { setLoading(false); }
    })();
    refreshPromiseRef.current = request;
    void request.finally(() => { if (refreshPromiseRef.current === request) refreshPromiseRef.current = null; });
    return request;
  }, [service, severity, search]);

  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        await refresh();
        if (!cancelled) schedule();
      }, intervalSeconds * 1000);
    };
    schedule();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [refresh, intervalSeconds]);

  const snapshot = data?.hostSnapshot;
  const host = snapshot?.host ?? {};
  const application = data?.application ?? {};
  const history = Array.isArray(data?.history) ? data.history : [];
  const state = String(data?.overall?.state ?? "warning");
  const StateIcon = state === "healthy" ? CheckCircle2 : state === "critical" ? ShieldAlert : AlertTriangle;
  const copyBundle = async () => {
    setBundleLoading(true);
    try {
      const params = new URLSearchParams({ service, severity, search, limit: "100", bundle: "1" });
      const response = await fetch(`${LOCAL_API}/admin/server-health?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      await navigator.clipboard.writeText(JSON.stringify(body.diagnosticBundle ?? body, null, 2));
      setError("");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
    finally { setBundleLoading(false); }
  };

  return <div className="admin-section server-health-page">
    <section className={`server-health-command ${state}`}>
      <div><StateIcon size={22} /><span><strong>{state === "healthy" ? "All monitored systems healthy" : state === "critical" ? "Critical server condition" : "Server health needs attention"}</strong><small>{data?.overall?.reasons?.join(" · ") || "No active health warnings"}</small></span></div>
      <div className="toolbar"><label className="inline-field"><span>Auto refresh</span><select value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))}><option value="15">15 sec</option><option value="30">30 sec</option><option value="60">60 sec</option></select></label><button className="toolbar-button" disabled={bundleLoading} onClick={() => void copyBundle()}><Copy size={14} /> {bundleLoading ? "Preparing" : "Copy bundle"}</button><button className="toolbar-button primary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={14} /> {loading ? "Refreshing" : "Refresh"}</button></div>
    </section>
    {error ? <div className="admin-message error">{error}</div> : null}
    {data?.collectorWarning ? <div className="admin-message info">{data.collectorWarning}. Application telemetry remains available.</div> : null}
    <div className="server-health-metrics">
      {[{ icon: <Cpu />, label: "CPU / load", value: `${pct(host.cpuPercent)} · ${formatNumber(host.load1, 2)}`, detail: `${host.cores ?? "-"} cores` }, { icon: <MemoryStick />, label: "Memory", value: pct(host.memoryPercent), detail: `Swap ${pct(host.swapPercent)}` }, { icon: <HardDrive />, label: "Disk", value: pct(host.diskPercent), detail: bytes(host.diskBytes) }, { icon: <Activity />, label: "Event loop", value: `${formatNumber(application.eventLoopDelayMs, 1)} ms`, detail: `${formatNumber(application.requests)} requests sampled` }, { icon: <Database />, label: "Database", value: bytes(data?.database?.databaseSize), detail: `${formatNumber(data?.database?.counts?.snapshots)} snapshots` }, { icon: <Network />, label: "Network", value: `${bytes(host.networkRxBytesPerSecond)}/s`, detail: `${bytes(host.networkTxBytesPerSecond)}/s sent` }].map((item) => <article key={item.label}><span>{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong><em>{item.detail}</em></div></article>)}
    </div>
    <section className="form-card server-health-services"><div className="split-header"><div><h3><Server size={17} /> Services</h3><p className="legend">Read-only systemd state from the root-owned collector.</p></div><span className="server-health-freshness">Snapshot {snapshot ? `${Math.round(snapshot.ageMs / 1000)}s ago` : "unavailable"}</span></div><div>{(snapshot?.services ?? []).map((item: AnyRecord) => <article key={item.name}><span className={`health-dot ${item.active ? "healthy" : "critical"}`} /><div><strong>{item.name}</strong><small>{item.state} · PID {item.pid || "-"} · {item.restarts} restarts</small></div><span>{bytes(item.memoryBytes)}</span></article>)}</div></section>
    <div className="server-health-charts"><section className="form-card"><h3>CPU and load</h3><Sparkline label="Seven-day CPU usage history" values={history.map((row: AnyRecord) => row.host?.cpuPercent)} /></section><section className="form-card"><h3>Memory</h3><Sparkline label="Seven-day memory usage history" values={history.map((row: AnyRecord) => row.host?.memoryPercent)} /></section><section className="form-card"><h3>Disk growth</h3><Sparkline label="Seven-day disk usage history" values={history.map((row: AnyRecord) => row.host?.diskPercent)} /></section></div>
    <div className="server-health-runtime-grid"><section className="form-card"><h3>Craft Planner</h3><dl><div><dt>Latest calculation</dt><dd>{formatNumber(application.planner?.lastDurationMs)} ms</dd></div><div><dt>Latest payload</dt><dd>{bytes(application.planner?.lastResponseBytes)}</dd></div><div><dt>Cache hits</dt><dd>{formatNumber(application.planner?.cacheHits)}</dd></div><div><dt>In-flight reuse</dt><dd>{formatNumber(application.planner?.inflightReuse)}</dd></div></dl></section><section className="form-card"><h3>BitJita</h3><dl><div><dt>Requests</dt><dd>{formatNumber(application.bitjita?.requests)}</dd></div><div><dt>Failures</dt><dd>{formatNumber(application.bitjita?.failures)}</dd></div><div><dt>Timeouts</dt><dd>{formatNumber(application.bitjita?.timeouts)}</dd></div><div><dt>Rate limits</dt><dd>{formatNumber(application.bitjita?.rateLimits)}</dd></div></dl></section><section className="form-card"><h3>Active incidents</h3><div className="server-health-incidents">{(data?.incidents ?? []).filter((item: AnyRecord) => item.state !== "recovered").slice(0, 6).map((item: AnyRecord) => <div key={item.incident_key}><span className="health-dot critical" /><strong>{String(item.incident_key).replaceAll("_", " ")}</strong><small>{item.state} · {item.consecutive_bad} samples</small></div>)}{!(data?.incidents ?? []).some((item: AnyRecord) => item.state !== "recovered") ? <p className="legend">No active incidents.</p> : null}</div></section></div>
    <section className="form-card"><div className="split-header"><div><h3>Slow endpoints</h3><p className="legend">In-process request timings from the last hour; query values are never retained.</p></div></div><div className="table-scroll"><table><thead><tr><th>Route</th><th>Requests</th><th>Average</th><th>Maximum</th></tr></thead><tbody>{(application.slowEndpoints ?? []).map((item: AnyRecord) => <tr key={item.path}><td><code>{item.path}</code></td><td>{formatNumber(item.count)}</td><td>{formatNumber(item.averageMs)} ms</td><td>{formatNumber(item.maxMs)} ms</td></tr>)}</tbody></table></div></section>
    <section className="form-card"><div className="split-header"><div><h3>Top processes</h3><p className="legend">Command lines are redacted before collection and again by the API.</p></div></div><div className="table-scroll"><table><thead><tr><th>Process</th><th>User</th><th>CPU</th><th>Memory</th><th>Command</th></tr></thead><tbody>{(snapshot?.processes ?? []).map((item: AnyRecord) => <tr key={item.pid}><td>{item.name} <small>PID {item.pid}</small></td><td>{item.user}</td><td>{pct(item.cpuPercent)}</td><td>{pct(item.memoryPercent)}</td><td><code>{item.command}</code></td></tr>)}</tbody></table></div></section>
    <section className="form-card"><div className="split-header"><div><h3>Recent service logs</h3><p className="legend">Bounded warning and error entries from web, worker, and Caddy.</p></div><div className="server-health-log-filters"><select aria-label="Filter logs by service" value={service} onChange={(event) => setService(event.target.value)}><option value="">All services</option>{([...new Set<string>((snapshot?.logs ?? []).map((entry: AnyRecord) => String(entry.service)))]).map((name: string) => <option key={name}>{name}</option>)}</select><select aria-label="Filter logs by severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">All severities</option><option value="error">Errors</option><option value="warning">Warnings</option></select><input aria-label="Search server logs" placeholder="Search logs" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="server-health-log-list">{(data?.logs?.entries ?? []).map((entry: AnyRecord) => <article key={entry.id}><span className={`health-dot ${entry.severity === "error" ? "critical" : "warning"}`} /><div><strong>{entry.service}</strong><p>{entry.message}</p></div><time>{new Date(entry.at).toLocaleString()}</time></article>)}{!data?.logs?.entries?.length ? <p className="legend">No matching warning or error entries.</p> : null}</div></section>
  </div>;
}
