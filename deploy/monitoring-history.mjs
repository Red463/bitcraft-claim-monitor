const DAY_MS = 86_400_000;

export function compactMonitoringHistory(rows = [], {
  now = Date.now(),
  maxRows = 12_000,
  maxBytes = 5_000_000,
} = {}) {
  const buckets = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const capturedAt = Date.parse(row?.capturedAt);
    const age = now - capturedAt;
    if (!Number.isFinite(capturedAt) || age >= 365 * DAY_MS) continue;
    const bucketSize = age < DAY_MS ? 60_000 : age < 7 * DAY_MS ? 15 * 60_000 : 60 * 60_000;
    const key = Math.floor(capturedAt / bucketSize) * bucketSize;
    const existing = buckets.get(key);
    if (!existing || Date.parse(existing.capturedAt) < capturedAt) buckets.set(key, row);
  }

  const newestFirst = [...buckets.values()].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  const bounded = [];
  let bytes = 0;
  for (const row of newestFirst) {
    if (bounded.length >= Math.max(1, maxRows)) break;
    const rowBytes = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (bytes + rowBytes > Math.max(1, maxBytes)) break;
    bounded.push(row);
    bytes += rowBytes;
  }
  return bounded.reverse();
}
