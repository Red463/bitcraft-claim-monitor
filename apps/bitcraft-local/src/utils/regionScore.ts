import { toNumber, type AnyRecord } from "../main-app-data.ts";

export type RegionScoreMaxima = { tier: number; supplies: number; treasury: number; numTiles: number };

export function regionScoreMaxima(rows: AnyRecord[]): RegionScoreMaxima {
  const maxima: RegionScoreMaxima = { tier: 0, supplies: 0, treasury: 0, numTiles: 0 };
  for (const row of rows) {
    maxima.tier = Math.max(maxima.tier, toNumber(row.tier));
    maxima.supplies = Math.max(maxima.supplies, toNumber(row.supplies));
    maxima.treasury = Math.max(maxima.treasury, toNumber(row.treasury));
    maxima.numTiles = Math.max(maxima.numTiles, toNumber(row.numTiles));
  }
  return maxima;
}

function normalizedLinear(value: unknown, max: number): number {
  return max > 0 ? Math.max(0, toNumber(value)) / max : 0;
}

function normalizedLog(value: unknown, max: number): number {
  return max > 0 ? Math.log10(Math.max(0, toNumber(value)) + 1) / Math.log10(max + 1) : 0;
}

export function settlementRegionScore(row: AnyRecord, maxima: RegionScoreMaxima): number {
  const score =
    normalizedLinear(row.tier, maxima.tier) * 0.75 +
    normalizedLinear(row.supplies, maxima.supplies) * 0.15 +
    normalizedLog(row.treasury, maxima.treasury) * 0.07 +
    normalizedLinear(row.numTiles, maxima.numTiles) * 0.03;
  return Math.round(score * 1000);
}