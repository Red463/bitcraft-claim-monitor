import type { RegionId } from "./contracts.ts";
import { RelayHttpClient } from "./http.ts";

type Fetcher = typeof fetch;

export type RelaySourceTopology = {
  sourceKey: "global" | `region:${number}`;
  database: string;
  port: number;
  schemaFingerprint: string | null;
  ready: boolean;
};

export type RelayTopology = {
  discoveredAt: string;
  cacheReady: boolean;
  global: RelaySourceTopology | null;
  regions: Map<RegionId, RelaySourceTopology>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function regionIdFor(sourceName: string, source: Record<string, unknown>): string | null {
  const metrics = asRecord(source.metrics);
  const upstreamDatabase = String(metrics.upstream_database ?? "");
  const candidates = [upstreamDatabase, sourceName];
  for (const candidate of candidates) {
    const match = candidate.match(/(?:bitcraft-live-|region:)(\d+)$/);
    if (match) return match[1];
  }
  return null;
}

function sourceReady(source: Record<string, unknown>) {
  const metrics = asRecord(source.metrics);
  const upstream = asRecord(metrics.upstream);
  return source.schema_cached === true
    && metrics.initial_subscribe_complete === true
    && upstream.state === "up";
}

export function relayTopologyFromPayloads(
  healthValue: unknown,
  cacheValue: unknown,
  discoveredAt = new Date().toISOString(),
): RelayTopology {
  const health = asRecord(healthValue);
  const cache = asRecord(cacheValue);
  const cacheRegions = new Map(
    (Array.isArray(cache.regions) ? cache.regions : []).map((value) => {
      const row = asRecord(value);
      return [String(row.region ?? ""), row.ready === true] as const;
    }),
  );
  const regions = new Map<RegionId, RelaySourceTopology>();
  let global: RelaySourceTopology | null = null;

  for (const [sourceName, rawSource] of Object.entries(asRecord(health.sources))) {
    const source = asRecord(rawSource);
    const metrics = asRecord(source.metrics);
    const publisher = asRecord(metrics.publisher);
    const database = String(source.database ?? metrics.mirror_database ?? "").trim();
    const port = Number(source.port);
    if (!database || !Number.isInteger(port) || port <= 0 || port > 65535) continue;
    const schemaFingerprint = typeof publisher.fingerprint === "string" && publisher.fingerprint
      ? publisher.fingerprint
      : null;
    const regionId = regionIdFor(sourceName, source);
    if (!regionId) {
      if (sourceName !== "global") continue;
      global = {
        sourceKey: "global",
        database,
        port,
        schemaFingerprint,
        ready: sourceReady(source),
      };
      continue;
    }
    regions.set(regionId, {
      sourceKey: `region:${Number(regionId)}`,
      database,
      port,
      schemaFingerprint,
      ready: sourceReady(source) && cacheRegions.get(regionId) === true,
    });
  }

  return {
    discoveredAt,
    cacheReady: cache.ready === true,
    global,
    regions,
  };
}

export async function discoverRelayTopology(baseUrl: string, fetcher: Fetcher = fetch): Promise<RelayTopology> {
  const http = new RelayHttpClient({ baseUrl, fetcher });
  const [healthValue, cacheValue] = await Promise.all([
    http.health(),
    http.cacheHealth(),
  ]);
  return relayTopologyFromPayloads(healthValue, cacheValue);
}
