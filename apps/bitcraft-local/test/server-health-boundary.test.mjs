import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/components/admin/ServerHealthSection.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../src/server/adminPermissions.mjs", import.meta.url), "utf8");
const collector = readFileSync(new URL("../../../deploy/collect-server-health.mjs", import.meta.url), "utf8");
const deploy = readFileSync(new URL("../../../deploy/update-bitcraft-monitor", import.meta.url), "utf8");

test("Server Health is a focused owner-only admin operations page", () => {
  assert.match(admin, /key: "server-health"/);
  assert.match(admin, /permissions\?\.includes\("\*"\)/);
  assert.match(admin, /<ServerHealthSection/);
  assert.match(page, /15 sec/);
  assert.match(page, /Copy bundle/);
  assert.match(page, /Top processes/);
  assert.match(page, /Recent service logs/);
  assert.match(page, /bundle.*1/);
  assert.match(page, /window\.setTimeout/);
  assert.doesNotMatch(page, /window\.setInterval\(\(\) => void refresh\(\), intervalSeconds/);
});

test("server exposes bounded read-only health diagnostics", () => {
  assert.match(server, /GET" && url\.pathname === "\/api\/local\/admin\/server-health"/);
  assert.match(server, /filterServerHealthLogs/);
  assert.match(server, /includeDiagnosticBundle:\s*url\.searchParams\.get\("bundle"\) === "1"/);
  assert.match(permissions, /server\.monitor\.view/);
  assert.doesNotMatch(page, />\s*(?:Restart|Kill process|Run systemctl)\s*</i);
});

test("deployment installs a root collector timer without granting Node sudo", () => {
  assert.match(collector, /journalctl/);
  assert.match(collector, /systemctl/);
  assert.match(collector, /history\.jsonl/);
  assert.match(deploy, /bitcraft-monitor-collector\.timer/);
  assert.doesNotMatch(readFileSync(new URL("../../../deploy/bitcraft-claim-monitor.service", import.meta.url), "utf8"), /sudo|journalctl|systemctl/);
  assert.match(readFileSync(new URL("../../../deploy/bitcraft-claim-monitor.service", import.meta.url), "utf8"), /Environment=MALLOC_TRIM_THRESHOLD_=131072/);
  assert.match(readFileSync(new URL("../../../deploy/bitcraft-claim-monitor-worker.service", import.meta.url), "utf8"), /Environment=MALLOC_TRIM_THRESHOLD_=131072/);
});
