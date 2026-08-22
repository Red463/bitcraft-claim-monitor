const DEFAULT_MAX_ENTRIES = 8;
const DEFAULT_MAX_BYTES = 4_194_304;
const DEFAULT_TTL_MS = 300_000;
const ENTRY_OVERHEAD_BYTES = 512;

export type PageNavigationCacheValue<T = unknown> = {
  claimId: string;
  panel: string;
  data: T;
  payloadBytes?: number;
  generation?: string | number | null;
  coherence?: string | null;
  updatedAt?: string;
  cacheState?: string | null;
  stale?: boolean;
};

type StoredEntry<T> = {
  value: PageNavigationCacheValue<T>;
  storedAt: number;
  approximateBytes: number;
};

export type PageNavigationCacheStats = {
  hits: number;
  misses: number;
  evictions: number;
  entries: number;
  approximateBytes: number;
};

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function approximateEntryBytes(scopeKey: string, value: PageNavigationCacheValue): number | null {
  const payloadBytes = Number(value.payloadBytes);
  if (!Number.isFinite(payloadBytes) || payloadBytes < 0) return null;
  // Decoded objects retain the response payload plus keys, Map bookkeeping, and
  // cache metadata. This intentionally favors early eviction over heap growth.
  return Math.ceil(payloadBytes) + (utf8Bytes(scopeKey) * 2) + ENTRY_OVERHEAD_BYTES;
}

export function createPageNavigationCache<T = unknown>({
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxBytes = DEFAULT_MAX_BYTES,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now,
}: {
  maxEntries?: number;
  maxBytes?: number;
  ttlMs?: number;
  now?: () => number;
} = {}) {
  const entries = new Map<string, StoredEntry<T>>();
  let residentBytes = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  const entryLimit = Math.max(0, Math.floor(maxEntries));
  const byteLimit = Math.max(0, Math.floor(maxBytes));
  const entryTtlMs = Math.max(0, Math.floor(ttlMs));

  function remove(scopeKey: string, countEviction = false): void {
    const existing = entries.get(scopeKey);
    if (!existing) return;
    entries.delete(scopeKey);
    residentBytes -= existing.approximateBytes;
    if (countEviction) evictions += 1;
  }

  function evictToBounds(): void {
    while (entries.size > entryLimit || residentBytes > byteLimit) {
      const oldestKey = entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) return;
      remove(oldestKey, true);
    }
  }

  return {
    get(scopeKey: string): PageNavigationCacheValue<T> | undefined {
      const existing = entries.get(scopeKey);
      if (!existing) {
        misses += 1;
        return undefined;
      }
      if (now() - existing.storedAt > entryTtlMs) {
        remove(scopeKey);
        misses += 1;
        return undefined;
      }
      entries.delete(scopeKey);
      entries.set(scopeKey, existing);
      hits += 1;
      return existing.value;
    },

    set(scopeKey: string, value: PageNavigationCacheValue<T>): PageNavigationCacheValue<T> {
      remove(scopeKey);
      const bytes = approximateEntryBytes(scopeKey, value);
      if (bytes === null || bytes > byteLimit || entryLimit === 0) return value;
      entries.set(scopeKey, { value, storedAt: now(), approximateBytes: bytes });
      residentBytes += bytes;
      evictToBounds();
      return value;
    },

    clearClaim(claimId: string): void {
      for (const [scopeKey, entry] of entries) {
        if (entry.value.claimId === claimId) remove(scopeKey);
      }
    },

    clear(): void {
      entries.clear();
      residentBytes = 0;
    },

    stats(): PageNavigationCacheStats {
      return {
        hits,
        misses,
        evictions,
        entries: entries.size,
        approximateBytes: residentBytes,
      };
    },
  };
}
