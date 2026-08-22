import { createHash } from "node:crypto";

import type { RegionId, SchemaFingerprintDiagnostic } from "./contracts.ts";
export type { SchemaFingerprintDiagnostic } from "./contracts.ts";
import { RelayHttpClient } from "./http.ts";

type Fetcher = typeof fetch;
const SCHEMA_VERSION = "9";
const DEFAULT_SCHEMA_FINGERPRINT_CACHE_MS = 45_000;
type SchemaFingerprintResult = {
  fingerprint: string;
  attemptedAt: string;
};
type SchemaFingerprintCacheEntry = {
  promise: Promise<SchemaFingerprintResult>;
  expiresAt: number;
  settled: boolean;
};
const schemaFingerprintCaches = new WeakMap<
  Fetcher,
  Map<string, SchemaFingerprintCacheEntry>
>();

export type RelayTopologyDiscoveryOptions = {
  sourceKeys?: ReadonlySet<string>;
  expectedFingerprints?: Partial<Record<"global" | "regional", string>>;
  schemaFingerprintCacheMs?: number;
  now?: () => number;
};

export type RelaySourceTopology = {
  sourceKey: "global" | `region:${number}`;
  database: string;
  port: number;
  schemaFingerprint: string | null;
  schemaFingerprintDiagnostic?: SchemaFingerprintDiagnostic;
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
  const mirrorDatabase = String(metrics.mirror_database ?? "");
  const database = String(source.database ?? "");
  const candidates = [upstreamDatabase, mirrorDatabase, database, sourceName];
  for (const candidate of candidates) {
    const match = candidate.match(/(?:bitcraft-live-|region:)(\d+)$/);
    if (match) return match[1];
  }
  return null;
}

function sourceKeyFor(
  sourceName: string,
  source: Record<string, unknown>,
): "global" | `region:${number}` | null {
  const regionId = regionIdFor(sourceName, source);
  if (regionId) return `region:${Number(regionId)}`;
  return sourceName === "global" ? "global" : null;
}

function sourceReady(source: Record<string, unknown>) {
  const metrics = asRecord(source.metrics);
  const upstream = asRecord(metrics.upstream);
  const legacyReady = source.schema_cached === true
    && metrics.initial_subscribe_complete === true
    && upstream.state === "up";
  const tablesLive = Number(source.tables_live);
  const tablesTotal = Number(source.tables_total);
  const liveSourceReady = source.schema_cached === true
    && source.connectivity === "live"
    && Number.isInteger(tablesLive)
    && Number.isInteger(tablesTotal)
    && tablesTotal > 0
    && tablesLive === tablesTotal;
  return legacyReady || liveSourceReady;
}

function schemaUrl(baseUrl: string, source: Record<string, unknown>, database: string) {
  const url = new URL(baseUrl);
  url.port = String(Number(source.port));
  url.pathname = `/v1/database/${encodeURIComponent(database)}/schema`;
  url.search = `version=${SCHEMA_VERSION}`;
  url.hash = "";
  return url.href;
}

function operationalSchemaUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  return url.href;
}

async function fetchSchemaFingerprint(
  url: string,
  fetcher: Fetcher,
  attemptedAt: string,
): Promise<SchemaFingerprintResult> {
  const diagnosticUrl = operationalSchemaUrl(url);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(8_000) });
    } catch (error) {
      lastError = error;
      continue;
    }
    if (!response.ok) {
      const error = new Error(`Relay schema ${diagnosticUrl} returned HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
      continue;
    }
    try {
      const schema = await response.text();
      if (!schema) throw new Error(`Relay schema ${diagnosticUrl} was empty`);
      return {
        fingerprint: createHash("sha256").update(schema).digest("hex"),
        attemptedAt,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Relay schema ${diagnosticUrl} could not be fingerprinted`);
}

function cachedSchemaFingerprint(
  baseUrl: string,
  source: Record<string, unknown>,
  database: string,
  fetcher: Fetcher,
  options: RelayTopologyDiscoveryOptions,
) {
  const now = options.now ?? Date.now;
  const cacheMs = options.schemaFingerprintCacheMs
    ?? DEFAULT_SCHEMA_FINGERPRINT_CACHE_MS;
  const url = schemaUrl(baseUrl, source, database);
  const cacheKey = [
    url,
    String(source.connected_since ?? ""),
    String(source.tables_live ?? ""),
    String(source.tables_total ?? ""),
  ].join("|");
  let cache = schemaFingerprintCaches.get(fetcher);
  if (!cache) {
    cache = new Map();
    schemaFingerprintCaches.set(fetcher, cache);
  }
  for (const [key, entry] of cache) {
    if (entry.settled && entry.expiresAt <= now()) cache.delete(key);
  }
  const cached = cache.get(cacheKey);
  if (cached && (!cached.settled || cached.expiresAt > now())) {
    return cached.promise;
  }
  const entry: SchemaFingerprintCacheEntry = {
    promise: Promise.resolve({ fingerprint: "", attemptedAt: new Date(now()).toISOString() }),
    expiresAt: Number.POSITIVE_INFINITY,
    settled: false,
  };
  const promise = fetchSchemaFingerprint(url, fetcher, new Date(now()).toISOString());
  entry.promise = promise;
  cache.set(cacheKey, entry);
  void promise.then(
    () => {
      entry.settled = true;
      entry.expiresAt = now() + Math.max(0, cacheMs);
    },
    () => {
      if (cache?.get(cacheKey) === entry) {
        cache.delete(cacheKey);
      }
    },
  );
  return promise;
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
    const sourceKey = sourceKeyFor(sourceName, source);
    if (!sourceKey) continue;
    const metrics = asRecord(source.metrics);
    const publisher = asRecord(metrics.publisher);
    const database = String(source.database ?? metrics.mirror_database ?? "").trim();
    const port = Number(source.port);
    if (!database || !Number.isInteger(port) || port <= 0 || port > 65535) continue;
    const schemaFingerprint = typeof publisher.fingerprint === "string" && publisher.fingerprint
      ? publisher.fingerprint
      : null;
    if (sourceKey === "global") {
      global = {
        sourceKey: "global",
        database,
        port,
        schemaFingerprint,
        ready: sourceReady(source),
      };
      continue;
    }
    const regionId = sourceKey.slice("region:".length);
    regions.set(regionId, {
      sourceKey,
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

export async function discoverRelayTopologyWithClient(
  baseUrl: string,
  http: RelayHttpClient,
  fetcher: Fetcher = fetch,
  options: RelayTopologyDiscoveryOptions = {},
): Promise<RelayTopology> {
  const [healthValue, cacheValue] = await Promise.all([
    http.health(),
    http.cacheHealth(),
  ]);
  const topology = relayTopologyFromPayloads(healthValue, cacheValue);
  const health = asRecord(healthValue);
  const fingerprintTasks: Promise<void>[] = [];
  for (const [sourceName, rawSource] of Object.entries(asRecord(health.sources))) {
    const source = asRecord(rawSource);
    const sourceKey = sourceKeyFor(sourceName, source);
    if (!sourceKey) continue;
    if (options.sourceKeys && !options.sourceKeys.has(sourceKey)) continue;
    const target = sourceKey === "global"
      ? topology.global
      : topology.regions.get(sourceKey.slice("region:".length));
    if (!target?.ready || target.schemaFingerprint) continue;
    const url = schemaUrl(baseUrl, source, target.database);
    const expectedKind = sourceKey === "global" ? "global" : "regional";
    const expected = String(options.expectedFingerprints?.[expectedKind] ?? "").trim() || null;
    fingerprintTasks.push(
      cachedSchemaFingerprint(baseUrl, source, target.database, fetcher, options)
        .then(({ fingerprint, attemptedAt }) => {
          target.schemaFingerprint = fingerprint;
          if (expected == null) return;
          const mismatch = expected != null && expected.toLowerCase() !== fingerprint.toLowerCase();
          target.schemaFingerprintDiagnostic = {
            sourceKey,
            schemaUrl: operationalSchemaUrl(url),
            expected,
            observed: fingerprint,
            attemptedAt,
            status: mismatch ? "mismatch" : "verified",
            error: mismatch ? `Relay ${expectedKind} schema fingerprint mismatch` : null,
          };
        })
        .catch((error) => {
          target.schemaFingerprintDiagnostic = {
            sourceKey,
            schemaUrl: operationalSchemaUrl(url),
            expected,
            observed: null,
            attemptedAt: new Date((options.now ?? Date.now)()).toISOString(),
            status: "download_error",
            error: error instanceof Error ? error.message : String(error),
          };
          // A source can remain topology-ready while its schema is unavailable.
          // Subscription runtimes require a non-null fingerprint and preserve
          // their last-good generation until the schema can be verified.
        }),
    );
  }
  await Promise.all(fingerprintTasks);
  return topology;
}

export async function discoverRelayTopology(
  baseUrl: string,
  fetcher: Fetcher = fetch,
  options: RelayTopologyDiscoveryOptions = {},
): Promise<RelayTopology> {
  return discoverRelayTopologyWithClient(
    baseUrl,
    new RelayHttpClient({ baseUrl, fetcher }),
    fetcher,
    options,
  );
}
