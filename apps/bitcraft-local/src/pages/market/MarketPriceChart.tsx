import React from "react";

import type { AnyRecord } from "../../main-app-data";
import { formatGoldAmount } from "../../utils/format";
import { marketChartPoints } from "./marketUi";

function shortLabel(value: string): string {
  if (!value) return "Observation";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MarketPriceChart({ rows, range }: { rows: AnyRecord[]; range: string }) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const width = 720;
  const height = 200;
  const points = marketChartPoints(rows, width, height);
  if (!points.length) return <div className="empty-state market-chart-empty">No completed-trade price history is available for this selection.</div>;

  const low = Math.min(...points.map((point) => point.price));
  const high = Math.max(...points.map((point) => point.price));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `0,${height} ${polyline} ${width},${height}`;
  const first = points[0];
  const last = points.at(-1)!;

  return (
    <figure className="market-price-chart">
      <div className="market-chart-scale" aria-hidden="true"><span>{formatGoldAmount(high)}</span><span>{formatGoldAmount(low)}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="group" aria-labelledby={`${titleId} ${descriptionId}`}>
        <title id={titleId}>{range} confirmed-sale price history</title>
        <desc id={descriptionId}>{points.length} locally observed price points from {shortLabel(first.label)} to {shortLabel(last.label)}. Low {formatGoldAmount(low)} and high {formatGoldAmount(high)}.</desc>
        <polygon className="market-chart-area" points={area} aria-hidden="true" />
        <polyline className="market-chart-line" points={polyline} aria-hidden="true" />
        {points.map((point, index) => <circle key={`${point.label}-${index}`} className="market-chart-point" cx={point.x} cy={point.y} r="4" tabIndex={0} aria-label={`${shortLabel(point.label)}: ${formatGoldAmount(point.price)}`} />)}
      </svg>
      <div className="market-chart-axis" aria-hidden="true"><span>{shortLabel(first.label)}</span><span>{shortLabel(last.label)}</span></div>
      <figcaption>{points.length} locally observed confirmed-sale price points · Low {formatGoldAmount(low)} · High {formatGoldAmount(high)}</figcaption>
    </figure>
  );
}
