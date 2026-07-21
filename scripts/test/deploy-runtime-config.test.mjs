import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const web = readFileSync(new URL("../../deploy/bitcraft-claim-monitor.service", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../deploy/bitcraft-claim-monitor-worker.service", import.meta.url), "utf8");
const collector = readFileSync(new URL("../../deploy/bitcraft-monitor-collector.service", import.meta.url), "utf8");
const caddy = readFileSync(new URL("../../deploy/Caddyfile.example", import.meta.url), "utf8");
const backupService = readFileSync(new URL("../../deploy/bitcraft-claim-monitor-backup.service", import.meta.url), "utf8");
const backupTimer = readFileSync(new URL("../../deploy/bitcraft-claim-monitor-backup.timer", import.meta.url), "utf8");
const schemaVersion = readFileSync(new URL("../../deploy/database-schema-version", import.meta.url), "utf8");

test("production services execute through the active release symlink", () => {
  for (const unit of [web, worker, collector]) {
    assert.match(unit, /\/opt\/bitcraft-claim-monitor\/current\//);
    assert.doesNotMatch(unit, /\/opt\/bitcraft-claim-monitor\/apps\//);
  }
});

test("Caddy waits through brief safe-request restarts", () => {
  assert.match(caddy, /lb_try_duration 5s/);
  assert.match(caddy, /lb_try_interval 250ms/);
  assert.match(caddy, /lb_retry_match[\s\S]*method GET HEAD/);
  assert.doesNotMatch(caddy, /lb_retry_match[\s\S]*(POST|PUT|PATCH|DELETE)/);
});

test("Caddy returns explicit browser and API maintenance responses", () => {
  assert.match(caddy, /handle_errors/);
  assert.match(caddy, /@api path \/api\/\*/);
  assert.match(caddy, /application\/json/);
  assert.match(caddy, /Claim Monitor is updating/);
  assert.match(caddy, /503/);
});

test("database backup schedule is persistent and runs daily in London time", () => {
  assert.equal(schemaVersion, "1\n");
  assert.match(backupService, /ExecStart=\/usr\/local\/bin\/backup-bitcraft-monitor daily/);
  assert.match(backupTimer, /OnCalendar=\*-\*-\* 03:30:00 Europe\/London/);
  assert.match(backupTimer, /RandomizedDelaySec=15m/);
  assert.match(backupTimer, /Persistent=true/);
});
