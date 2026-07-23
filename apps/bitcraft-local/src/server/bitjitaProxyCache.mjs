export const DEFAULT_BITJITA_PROXY_CACHE_POLICIES = [
  { pattern: /^\/api\/(?:resources|creatures|skills|items|cargos|recipes|crafting-recipes)(?:\/|$)/, ttlMs: 60 * 60 * 1000 },
  { pattern: /^\/api\/market$/, ttlMs: 5 * 60 * 1000 },
  { pattern: /^\/api\/players\/[^/]+$/, ttlMs: 60 * 1000 },
  { pattern: /^\/api\/claims\/[^/]+\/(?:members|citizens)$/, ttlMs: 30 * 1000 },
  { pattern: /^\/api\/claims\/[^/]+\/(?:market\/listings|buildings|inventories|construction|research|layout)$/, ttlMs: 15 * 1000 },
  { pattern: /^\/api\/crafts(?:\/|$)/, ttlMs: 15 * 1000 },
  { pattern: /^\/api\/logs\/storage$/, ttlMs: 10 * 1000 },
];

function numeric(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function staleUpstreamResponse(cached) {
  return cached ? { ...cached, cacheState: "stale-if-error", stale: true } : null;
}

export function bitjitaProxyCacheTtl(upstream, options = {}) {
  const policies = options.policies ?? DEFAULT_BITJITA_PROXY_CACHE_POLICIES;
  const defaultTtlMs = numeric(options.defaultTtlMs, 15_000);
  const pathname = upstream.pathname;
  const policy = policies.find((entry) => entry.pattern.test(pathname));
  return policy?.ttlMs ?? defaultTtlMs;
}

export function createBitjitaProxyCache(options = {}) {
  const cache = options.cache ?? new Map();
  const inflight = options.inflight ?? new Map();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const appIdentifier = options.appIdentifier ?? "BitCraft Claim Monitor";
  const defaultTtlMs = numeric(options.defaultTtlMs, 15_000);
  const staleIfErrorMs = Math.max(0, numeric(options.staleIfErrorMs, 5 * 60 * 1000));
  const maxEntries = Math.max(1, numeric(options.maxEntries, 300));
  const defaultTimeoutMs = Math.max(0, numeric(options.timeoutMs, 12_000));
  const policies = options.policies ?? DEFAULT_BITJITA_PROXY_CACHE_POLICIES;

  function prune(pruneAt = now()) {
    for (const [key, value] of cache) {
      if ((value.staleExpiresAt ?? value.expiresAt) <= pruneAt) cache.delete(key);
    }
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }

  function hasFreshCache(upstream) {
    const cached = cache.get(upstream.toString());
    return Boolean(cached && cached.expiresAt > now());
  }

  function hasInflight(upstream) {
    return inflight.has(upstream.toString());
  }

  async function fetchUpstreamCached(upstream, requestOptions = {}) {
    const key = upstream.toString();
    const requestedAt = now();
    const ttlMs = bitjitaProxyCacheTtl(upstream, { policies, defaultTtlMs });
    const cached = cache.get(key);
    if (!requestOptions.forceRefresh && cached && cached.expiresAt > requestedAt) return { ...cached, cacheState: "hit" };
    const staleCandidate = cached && (cached.staleExpiresAt ?? cached.expiresAt) > requestedAt ? cached : null;

    const pending = inflight.get(key);
    if (pending) {
      try {
        const value = await pending;
        return { ...value, cacheState: "deduped" };
      } catch (error) {
        const stale = staleUpstreamResponse(staleCandidate);
        if (stale) return stale;
        throw error;
      }
    }

    const request = (async () => {
      try {
        const timeoutMs = Math.max(0, numeric(requestOptions.timeoutMs, defaultTimeoutMs));
        const fetchOptions = { headers: { accept: "application/json", "x-app-identifier": appIdentifier } };
        if (timeoutMs > 0) fetchOptions.signal = AbortSignal.timeout(timeoutMs);
        const response = await fetchImpl(upstream, fetchOptions);
        const body = Buffer.from(await response.arrayBuffer());
        const responseAt = now();
        const headers = {
          "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
          "cache-control": `public, max-age=${Math.max(1, Math.floor(ttlMs / 1000))}`,
        };
        const value = { status: response.status, headers, body, expiresAt: responseAt + ttlMs, staleExpiresAt: responseAt + ttlMs + staleIfErrorMs, ttlMs };
        if (response.ok) {
          cache.set(key, value);
          prune();
        } else if (staleCandidate && response.status >= 500) {
          return staleUpstreamResponse(staleCandidate);
        }
        return value;
      } catch (error) {
        const stale = staleUpstreamResponse(staleCandidate);
        if (stale) return stale;
        throw error;
      }
    })();

    inflight.set(key, request);
    try {
      const value = await request;
      return { ...value, cacheState: value.cacheState ?? "miss" };
    } finally {
      inflight.delete(key);
    }
  }

  return {
    cacheSize: () => cache.size,
    fetchUpstreamCached,
    hasFreshCache,
    hasInflight,
    prune,
  };
}
