import React from "react";
import { TrendingUp } from "lucide-react";

import { LiveValue } from "./Stats";
import { formatNumber, shortDateLabel, timestampMs } from "../../utils/format";

export function DashboardMetric({
  icon,
  label,
  value,
  detail,
  progress,
  trend,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  progress?: number;
  trend?: string;
  tone?: string;
  onClick?: () => void;
}) {
  return (
    <button className={`dashboard-metric ${tone ?? ""}`} onClick={onClick}>
      <span className="dashboard-metric-icon">{icon}</span>
      <span className="dashboard-metric-label">{label}</span>
      <strong><LiveValue value={value} /></strong>
      <small>{detail}</small>
      {trend ? <em>{trend}</em> : null}
      {progress != null ? <i className="dashboard-mini-progress"><span style={{ width: `${progress}%` }} /></i> : null}
    </button>
  );
}

export function DashboardCardHeader({ title, icon, action, onClick }: { title: string; icon?: React.ReactNode; action?: string; onClick?: () => void }) {
  return (
    <header className="dashboard-card-header">
      <h3>{icon ? <span className="dashboard-card-title-icon">{icon}</span> : null}{title}</h3>
      {action ? onClick ? <button onClick={onClick}>{action}</button> : <span className="dashboard-card-range">{action}</span> : null}
    </header>
  );
}

export function DashboardTrend({ points, suffix = "", emptyMessage = "Daily trend appears after snapshots exist for at least two days.", ariaLabel = "Dashboard trend" }: { points: Array<{ at: string; value: number }>; suffix?: string; emptyMessage?: string; ariaLabel?: string }) {
  const datedPoints = points
    .map((point) => ({ ...point, ms: timestampMs(point.at) }))
    .filter((point) => point.ms > 0)
    .sort((a, b) => a.ms - b.ms);
  if (datedPoints.length < 2) {
    return <div className="dashboard-chart-empty"><TrendingUp size={18} /><span>{emptyMessage}</span></div>;
  }
  const width = 560;
  const height = 230;
  const pad = 18;
  const dayMs = 24 * 60 * 60 * 1000;
  const latestSnapshot = datedPoints[datedPoints.length - 1];
  const end = new Date(latestSnapshot.ms);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - 6 * dayMs);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const dailyPoints = new Map<number, { at: string; value: number; ms: number; dayMs: number }>();
  for (const point of datedPoints) {
    if (point.ms < startMs || point.ms > endMs) continue;
    const day = new Date(point.ms);
    day.setHours(12, 0, 0, 0);
    const dayMs = day.getTime();
    const existing = dailyPoints.get(dayMs);
    if (!existing || point.ms >= existing.ms) dailyPoints.set(dayMs, { ...point, dayMs });
  }
  const chartPoints = [...dailyPoints.values()].sort((a, b) => a.dayMs - b.dayMs);
  if (chartPoints.length < 2) {
    return <div className="dashboard-chart-empty"><TrendingUp size={18} /><span>{emptyMessage}</span></div>;
  }
  const values = chartPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const isFlat = max === min;
  const range = Math.max(max - min, 1);
  const xForDay = (dayMsValue: number) => pad + ((dayMsValue - startMs) / Math.max(endMs - startMs, 1)) * (width - pad * 2);
  const yForValue = (value: number) => isFlat ? height / 2 : height - pad - ((value - min) / range) * (height - pad * 2);
  const path = chartPoints.map((point, index) => {
    const x = xForDay(point.dayMs);
    const y = yForValue(point.value);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const areaPath = `${path} L${width - pad},${height - pad} L${pad},${height - pad} Z`;
  const latest = chartPoints[chartPoints.length - 1];
  const latestX = xForDay(latest.dayMs);
  const latestY = yForValue(latest.value);
  const axisDays = Array.from({ length: 7 }, (_, index) => new Date(startMs + index * dayMs));
  return (
    <div className="dashboard-chart">
      <svg viewBox={`0 0 ${width} ${height}`} aria-label={`${ariaLabel} ending at ${formatNumber(latest.value)}${suffix}`}>
        <defs>
          <linearGradient id="dashboardAreaGold" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(247, 200, 54, .46)" />
            <stop offset="100%" stopColor="rgba(247, 200, 54, 0)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((y) => <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} className="dashboard-chart-grid" />)}
        {chartPoints.length >= 3 ? <path d={areaPath} className="dashboard-chart-area" /> : null}
        <path d={path} className="dashboard-chart-line" />
        <circle cx={latestX} cy={latestY} r="5" className="dashboard-chart-dot" />
      </svg>
      <div className="dashboard-chart-axis">{axisDays.map((day) => <span key={day.toISOString()}>{shortDateLabel(day.toISOString())}</span>)}</div>
    </div>
  );
}
