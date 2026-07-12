import assert from "node:assert/strict";
import test from "node:test";
import { filterServerHealthLogs, normalizeServerHealthSnapshot, redactServerHealthText, serverHealthState } from "../src/server/serverHealth.mjs";

const snapshot = (overrides = {}) => normalizeServerHealthSnapshot({ schemaVersion: 1, capturedAt: new Date().toISOString(), host: { diskPercent: 40, memoryPercent: 50, cores: 2 }, services: [{ name: "web", active: true }], processes: [], logs: [], ...overrides });

test("server health redaction removes credentials and Discord ids", () => {
  const output = redactServerHealthText("--token=secret Bearer abc.def https://tom:pass@example.com user 145544610234630144");
  assert.doesNotMatch(output, /secret|abc\.def|tom:pass|145544610234630144/);
});

test("server health normalizes bounded process and log records", () => {
  const result = snapshot({ processes: [{ pid: "12", command: "app --password=hunter2" }], logs: [{ severity: "error", message: "token=abc" }] });
  assert.equal(result.processes[0].pid, 12);
  assert.doesNotMatch(result.processes[0].command, /hunter2/);
  assert.doesNotMatch(result.logs[0].message, /abc/);
});

test("server health state reports critical host conditions", () => {
  assert.equal(serverHealthState(snapshot({ host: { diskPercent: 91, memoryPercent: 50, cores: 2 } })).state, "critical");
  assert.equal(serverHealthState(snapshot({ services: [{ name: "worker", active: false }] })).state, "critical");
});

test("server health log filters and pagination remain bounded", () => {
  const logs = [{ service: "web", severity: "error", message: "Failed request" }, { service: "worker", severity: "warning", message: "Retry" }];
  assert.equal(filterServerHealthLogs(logs, { service: "web", search: "failed", limit: 500 }).entries.length, 1);
});
