import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function craftPlanEffortBaselineKey(config, catalogRevision, modelVersion) {
  return createHash("sha256")
    .update(JSON.stringify(stable({ config, catalogRevision, modelVersion })))
    .digest("hex");
}

export function createCraftPlanEffortBaselineCache({ maxEntries = 16, maxBytes = 2 * 1024 * 1024 } = {}) {
  const values = new Map();
  const inflight = new Map();
  const counters = { hits: 0, misses: 0, inflightReuse: 0 };
  let bytes = 0;
  let generation = 0;

  function evict() {
    while (values.size > maxEntries || bytes > maxBytes) {
      const oldest = values.keys().next().value;
      if (oldest == null) break;
      bytes -= values.get(oldest).bytes;
      values.delete(oldest);
    }
  }

  return {
    async getOrCreate(key, loader) {
      if (values.has(key)) {
        counters.hits += 1;
        const entry = values.get(key);
        values.delete(key);
        values.set(key, entry);
        return entry.value;
      }
      if (inflight.has(key)) {
        counters.inflightReuse += 1;
        return inflight.get(key);
      }
      counters.misses += 1;
      const loadGeneration = generation;
      const promise = Promise.resolve().then(loader).then((value) => {
        const entryBytes = Buffer.byteLength(JSON.stringify(value));
        if (loadGeneration === generation && entryBytes <= maxBytes) {
          const previous = values.get(key);
          if (previous) bytes -= previous.bytes;
          values.set(key, { value, bytes: entryBytes });
          bytes += entryBytes;
          evict();
        }
        return value;
      }).finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key);
      });
      inflight.set(key, promise);
      return promise;
    },
    clear() {
      generation += 1;
      values.clear();
      inflight.clear();
      bytes = 0;
    },
    stats() {
      return { ...counters, entries: values.size, bytes };
    },
  };
}
