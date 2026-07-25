import React from "react";
import { TrendingUp } from "lucide-react";

import { LiveValue } from "./Stats";
import { formatCompactNumber, formatGoldAmount, formatNumber, shortDateLabel, timestampMs } from "../../utils/format";

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

export function DashboardCardHeader({ title, icon, action, onClick, control }: { title: string; icon?: React.ReactNode; action?: string; onClick?: () => void; control?: React.ReactNode }) {
  return (
    <header className="dashboard-card-header">
      <h3>{icon ? <span className="dashboard-card-title-icon">{icon}</span> : null}{title}</h3>
      {control ? <div className="dashboard-chart-controls">{control}</div> : action ? onClick ? <button onClick={onClick}>{action}</button> : <span className="dashboard-card-range">{action}</span> : null}
    </header>
  );
}

function niceChartStep(range: number, intervalCount = 3): number {
  const roughStep = Math.max(range / intervalCount, Number.EPSILON);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export function DashboardTrend({
  points,
  suffix = "",
  emptyMessage = "Daily trend appears after snapshots exist for at least two days.",
  ariaLabel = "Dashboard trend",
  yAxisLabel = "Value",
}: {
  points: Array<{ at: string; value: number }>;
  suffix?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  yAxisLabel?: string;
}) {
  const [activePointIndex, setActivePointIndex] = React.useState<number | null>(null);
  const summaryId = React.useId();
  const datedPoints = points
    .map((point) => ({ ...point, ms: timestampMs(point.at) }))
    .filter((point) => point.ms > 0)
    .sort((a, b) => a.ms - b.ms);
  if (datedPoints.length < 2) {
    return <div className="dashboard-chart-empty"><TrendingUp size={18} /><span>{emptyMessage}</span></div>;
  }
  const width = 560;
  const height = 230;
  const plotLeft = 62;
  const plotRight = 12;
  const plotTop = 24;
  const plotBottom = height - 18;
  const latestSnapshot = datedPoints[datedPoints.length - 1];
  const dailyPoints = new Map<string, { at: string; value: number; ms: number }>();
  for (const point of datedPoints) {
    const day = new Date(point.ms).toISOString().slice(0, 10);
    const existing = dailyPoints.get(day);
    if (!existing || point.ms >= existing.ms) dailyPoints.set(day, point);
  }
  const chartPoints = [...dailyPoints.values()].sort((a, b) => a.ms - b.ms);
  if (chartPoints.length < 2) {
    return <div className="dashboard-chart-empty"><TrendingUp size={18} /><span>{emptyMessage}</span></div>;
  }
  const startMs = chartPoints[0].ms;
  const endMs = chartPoints[chartPoints.length - 1].ms;
  const values = chartPoints.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;
  const padding = valueRange > 0 ? valueRange * 0.08 : Math.max(Math.abs(maxValue) * 0.02, 1);
  const paddedMin = Math.max(0, minValue - padding);
  const paddedMax = maxValue + padding;
  const yStep = niceChartStep(Math.max(paddedMax - paddedMin, 1));
  const yMin = Math.floor(paddedMin / yStep) * yStep;
  const yMax = Math.max(yMin + yStep, Math.ceil(paddedMax / yStep) * yStep);
  const yTicks = Array.from({ length: Math.round((yMax - yMin) / yStep) + 1 }, (_, index) => yMin + index * yStep);
  const xForTime = (time: number) => plotLeft + ((time - startMs) / Math.max(endMs - startMs, 1)) * (width - plotLeft - plotRight);
  const yForValue = (value: number) => plotBottom - ((value - yMin) / Math.max(yMax - yMin, 1)) * (plotBottom - plotTop);
  const path = chartPoints.map((point, index) => {
    const x = xForTime(point.ms);
    const y = yForValue(point.value);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const firstX = xForTime(chartPoints[0].ms);
  const latestX = xForTime(latestSnapshot.ms);
  const areaPath = `${path} L${latestX},${plotBottom} L${firstX},${plotBottom} Z`;
  const latest = chartPoints[chartPoints.length - 1];
  const first = chartPoints[0];
  const summaryText = `${ariaLabel}: ${formatNumber(first.value)}${suffix} on ${shortDateLabel(first.at)}, ending at ${formatNumber(latest.value)}${suffix} on ${shortDateLabel(latest.at)}, across ${chartPoints.length} daily snapshots.`;
  const latestY = yForValue(latest.value);
  const axisPointCount = Math.min(7, chartPoints.length);
  const axisPoints = Array.from({ length: axisPointCount }, (_, index) => (
    chartPoints[Math.round((index / Math.max(axisPointCount - 1, 1)) * (chartPoints.length - 1))]
  ));
  const activePoint = activePointIndex == null ? null : chartPoints[activePointIndex] ?? null;
  const activeX = activePoint ? xForTime(activePoint.ms) : 0;
  const activeY = activePoint ? yForValue(activePoint.value) : 0;
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    const nearestIndex = chartPoints.reduce((bestIndex, point, index) => (
      Math.abs(xForTime(point.ms) - pointerX) < Math.abs(xForTime(chartPoints[bestIndex].ms) - pointerX) ? index : bestIndex
    ), 0);
    setActivePointIndex(nearestIndex);
  };
  return (
    <div className="dashboard-chart">
      <p id={summaryId} className="dashboard-chart-summary">{summaryText}</p>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} aria-describedby={summaryId} onPointerMove={handlePointerMove} onPointerLeave={() => setActivePointIndex(null)}>
        <defs>
          <linearGradient id="dashboardAreaGold" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(247, 200, 54, .46)" />
            <stop offset="100%" stopColor="rgba(247, 200, 54, 0)" />
          </linearGradient>
        </defs>
        <text x={plotLeft} y="14" className="dashboard-chart-y-title">{yAxisLabel}</text>
        <g role="group" aria-label={yAxisLabel}>
          {yTicks.map((tick) => {
            const y = yForValue(tick);
            return <g key={tick}>
              <line x1={plotLeft} x2={width - plotRight} y1={y} y2={y} className="dashboard-chart-grid" />
              <text x={plotLeft - 9} y={y + 4} textAnchor="end" className="dashboard-chart-y-axis">{suffix === "g" ? formatGoldAmount(tick) : `${formatCompactNumber(tick)}${suffix}`}</text>
            </g>;
          })}
        </g>
        {chartPoints.length >= 3 ? <path d={areaPath} className="dashboard-chart-area" /> : null}
        <path d={path} className="dashboard-chart-line" />
        <circle cx={latestX} cy={latestY} r="5" className="dashboard-chart-dot" />
        {activePoint ? <><line x1={activeX} x2={activeX} y1={plotTop} y2={plotBottom} className="dashboard-chart-guide" /><circle cx={activeX} cy={activeY} r="6" className="dashboard-chart-active-dot" /></> : null}
        {chartPoints.map((point) => <circle key={point.ms} cx={xForTime(point.ms)} cy={yForValue(point.value)} r="12" className="dashboard-chart-hit" aria-hidden="true" />)}
      </svg>
      {activePoint ? <div className="dashboard-chart-tooltip" style={{ left: `${Math.max(12, Math.min(88, (activeX / width) * 100))}%` }} role="status"><span>{shortDateLabel(activePoint.at)}</span><strong>{formatNumber(activePoint.value)}{suffix}</strong></div> : null}
      <div className="dashboard-chart-axis" style={{ gridTemplateColumns: `repeat(${axisPoints.length}, minmax(0, 1fr))` }}>{axisPoints.map((point) => <span key={point.ms}>{shortDateLabel(point.at)}</span>)}</div>
    </div>
  );
}
