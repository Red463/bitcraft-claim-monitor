import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readDeployment = (name) => readFileSync(
  new URL(`../../../deploy/${name}`, import.meta.url),
  "utf8",
);

test("Relay preview web and worker units use isolated paths and record-only Discord", () => {
  for (const name of [
    "bitcraft-claim-monitor-relay.service",
    "bitcraft-claim-monitor-relay-worker.service",
  ]) {
    const unit = readDeployment(name);
    assert.match(unit, /\/opt\/bitcraft-claim-monitor-relay\/current/);
    assert.match(unit, /BITCRAFT_LOCAL_DATA_DIR=\/var\/lib\/bitcraft-claim-monitor-relay/);
    assert.match(unit, /DISCORD_DELIVERY_MODE=record/);
    assert.match(unit, /ENABLE_DISCORD_STARTUP=false/);
    assert.match(unit, /EnvironmentFile=-\/etc\/bitcraft-claim-monitor-relay\.env/);
    assert.match(
      unit,
      /ExecStart=\/usr\/bin\/env DISCORD_DELIVERY_MODE=record ENABLE_DISCORD_STARTUP=false \/usr\/bin\/node /,
    );
  }
  assert.match(readDeployment("bitcraft-claim-monitor-relay.service"), /APP_PORT=19430/);
});

test("Relay preview deployment excludes maintained service artifacts", () => {
  for (const name of [
    "bitcraft-claim-monitor.service",
    "bitcraft-claim-monitor-worker.service",
    "bitcraft-monitor-collector.service",
    "bitcraft-monitor-collector.timer",
    "bitcraft-claim-monitor-backup.service",
    "bitcraft-claim-monitor-backup.timer",
  ]) {
    assert.equal(existsSync(new URL(`../../../deploy/${name}`, import.meta.url)), false);
  }
});

test("Relay preview backup and Caddy routing do not share the maintained service", () => {
  const backup = readDeployment("bitcraft-claim-monitor-relay-backup.service");
  assert.match(backup, /BACKUP_DIR=\/var\/backups\/bitcraft-claim-monitor-relay/);
  assert.match(backup, /WORKER_SERVICE=bitcraft-claim-monitor-relay-worker\.service/);

  const caddy = readDeployment("Caddyfile.example");
  assert.match(caddy, /relay\.timbersteeltrade\.com\s*\{/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:19430/);
});
