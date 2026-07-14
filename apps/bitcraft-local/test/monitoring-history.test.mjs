import assert from "node:assert/strict";
import test from "node:test";

import { compactMonitoringHistory } from "../../../deploy/monitoring-history.mjs";

const row = (now, ageMinutes, value = ageMinutes) => ({
  schemaVersion: 1,
  capturedAt: new Date(now - ageMinutes * 60_000).toISOString(),
  host: { cpuPercent: value },
});

test("monitoring history keeps recent detail and compacts older samples", () => {
  const now = Date.UTC(2026, 6, 14, 12);
  const input = [
    row(now, 10), row(now, 11),
    row(now, 2 * 1440 + 1), row(now, 2 * 1440 + 2), row(now, 2 * 1440 + 16),
    row(now, 10 * 1440 + 10), row(now, 10 * 1440 + 20), row(now, 10 * 1440 + 61),
    row(now, 366 * 1440),
  ];
  const output = compactMonitoringHistory(input, { now });
  assert.equal(output.filter((entry) => now - Date.parse(entry.capturedAt) < 86_400_000).length, 2);
  assert.equal(output.filter((entry) => {
    const age = now - Date.parse(entry.capturedAt);
    return age >= 86_400_000 && age < 7 * 86_400_000;
  }).length, 2);
  assert.equal(output.filter((entry) => now - Date.parse(entry.capturedAt) >= 7 * 86_400_000).length, 2);
  assert.equal(output.some((entry) => entry.host.cpuPercent === 366 * 1440), false);
});

test("monitoring history observes row and byte bounds", () => {
  const now = Date.UTC(2026, 6, 14, 12);
  const input = Array.from({ length: 100 }, (_, index) => ({ ...row(now, index), note: "x".repeat(100) }));
  const output = compactMonitoringHistory(input, { now, maxRows: 20, maxBytes: 2_000 });
  assert.ok(output.length <= 20);
  assert.ok(Buffer.byteLength(output.map(JSON.stringify).join("\n")) <= 2_000);
});
