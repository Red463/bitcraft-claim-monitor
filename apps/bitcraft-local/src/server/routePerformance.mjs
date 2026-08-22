function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function normalizeRoutePerformancePath(rawUrl) {
  let pathname = "/";
  try {
    pathname = new URL(String(rawUrl ?? "/"), "http://local.invalid").pathname;
  } catch {}
  const normalized = pathname
    .split("/")
    .map((segment) => (/^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ? ":id" : segment))
    .join("/");
  return normalized.slice(0, 160) || "/";
}

function bodyBytes(chunk, encoding) {
  if (chunk === undefined || chunk === null) return 0;
  if (typeof chunk === "string") return Buffer.byteLength(chunk, typeof encoding === "string" ? encoding : undefined);
  if (ArrayBuffer.isView(chunk)) return chunk.byteLength;
  if (chunk instanceof ArrayBuffer) return chunk.byteLength;
  return Buffer.byteLength(String(chunk));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function percentiles(values) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  };
}

export function createRoutePerformanceTelemetry({ maxEntries = 10_000, now = () => Date.now() } = {}) {
  const entries = [];
  const rateLimits = new Map();
  const limit = Math.max(1, Math.floor(finiteNonNegative(maxEntries, 10_000)));

  function observe(req, res, { path = req?.url } = {}) {
    const startedAt = now();
    let observedResponseBytes = 0;
    let projectionMs = null;
    let finished = false;
    const originalWrite = typeof res.write === "function" ? res.write.bind(res) : null;
    const originalEnd = typeof res.end === "function" ? res.end.bind(res) : null;

    if (originalWrite) {
      res.write = (chunk, encoding, callback) => {
        observedResponseBytes += bodyBytes(chunk, encoding);
        return originalWrite(chunk, encoding, callback);
      };
    }
    if (originalEnd) {
      res.end = (chunk, encoding, callback) => {
        observedResponseBytes += bodyBytes(chunk, encoding);
        return originalEnd(chunk, encoding, callback);
      };
    }

    res.once("finish", () => {
      if (finished) return;
      finished = true;
      const declaredLength = finiteNonNegative(res.getHeader?.("content-length"), -1);
      entries.push({
        path: normalizeRoutePerformancePath(path),
        status: Math.floor(finiteNonNegative(res.statusCode, 200)),
        durationMs: finiteNonNegative(now() - startedAt),
        responseBytes: declaredLength >= 0 ? declaredLength : observedResponseBytes,
        projectionMs,
      });
      if (entries.length > limit) entries.splice(0, entries.length - limit);
    });

    return {
      recordProjection(value) {
        projectionMs = finiteNonNegative(value);
      },
    };
  }

  function snapshot() {
    const groups = new Map();
    for (const entry of entries) {
      const group = groups.get(entry.path) ?? [];
      group.push(entry);
      groups.set(entry.path, group);
    }
    return {
      sampleCount: entries.length,
      routes: [...groups.entries()].map(([path, samples]) => {
        const statusCounts = {};
        for (const sample of samples) statusCounts[sample.status] = (statusCounts[sample.status] ?? 0) + 1;
        return {
          path,
          sampleCount: samples.length,
          statusCounts,
          status429: statusCounts[429] ?? 0,
          durationMs: percentiles(samples.map((sample) => sample.durationMs)),
          responseBytes: percentiles(samples.map((sample) => sample.responseBytes)),
          projectionMs: percentiles(samples.filter((sample) => sample.projectionMs !== null).map((sample) => sample.projectionMs)),
        };
      }).sort((left, right) => left.path.localeCompare(right.path)),
      rateLimits: Object.fromEntries(rateLimits),
    };
  }

  function recordRateLimitDecision({ name, reportOnly, wouldLimit }) {
    if (!wouldLimit) return;
    const profileName = String(name ?? "").trim();
    if (!profileName) return;
    const current = rateLimits.get(profileName) ?? { reportOnly: Boolean(reportOnly), wouldLimit: 0 };
    current.reportOnly = Boolean(reportOnly);
    current.wouldLimit += 1;
    rateLimits.set(profileName, current);
  }

  return { observe, recordRateLimitDecision, snapshot };
}

export class HeavyRouteCapacityError extends Error {
  constructor() {
    super("Server projection capacity is temporarily full.");
    this.name = "HeavyRouteCapacityError";
    this.statusCode = 503;
    this.retryAfter = 1;
  }
}

export function createHeavyRouteGate({ maxConcurrent = 8, maxQueued = 16 } = {}) {
  const concurrentLimit = Math.max(1, Math.floor(finiteNonNegative(maxConcurrent, 8)));
  const queuedLimit = Math.max(0, Math.floor(finiteNonNegative(maxQueued, 16)));
  const queue = [];
  let active = 0;
  let rejected = 0;

  const start = (task) => {
    active += 1;
    return Promise.resolve().then(task).finally(() => {
      active -= 1;
      const next = queue.shift();
      if (next) start(next.task).then(next.resolve, next.reject);
    });
  };

  function run(task) {
    if (active < concurrentLimit) return start(task);
    if (queue.length >= queuedLimit) {
      rejected += 1;
      return Promise.reject(new HeavyRouteCapacityError());
    }
    return new Promise((resolve, reject) => queue.push({ task, resolve, reject }));
  }

  function snapshot() {
    return { active, queued: queue.length, rejected, maxConcurrent: concurrentLimit, maxQueued: queuedLimit };
  }

  return { run, snapshot };
}
