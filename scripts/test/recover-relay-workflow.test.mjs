import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/recover-relay-service.yml", import.meta.url), "utf8");

test("recovery is manual, protected, pinned, and narrowly targets the stuck Relay updater", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: relay-preview/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /pkill -KILL -f '\[u\]pdate-bitcraft-claim-monitor-relay --revision'/);
  assert.match(workflow, /systemctl kill --kill-whom=all --signal=KILL bitcraft-claim-monitor-relay\.service bitcraft-claim-monitor-relay-worker\.service/);
  assert.match(workflow, /systemctl reset-failed bitcraft-claim-monitor-relay\.service bitcraft-claim-monitor-relay-worker\.service/);
  assert.match(workflow, /systemctl start bitcraft-claim-monitor-relay\.service;/);
  assert.match(workflow, /systemctl start bitcraft-claim-monitor-relay-worker\.service bitcraft-claim-monitor-relay-collector\.service/);
  assert.match(workflow, /native-map-failed-\$\{GITHUB_SHA\}/);
  assert.match(workflow, /for directory in map-overview map-tiles map-road-tiles/);
  assert.match(workflow, /sudo mv \/var\/lib\/bitcraft-claim-monitor-relay\/\\\$directory \\\$quarantine\//);
  assert.match(workflow, /127\.0\.0\.1:19430\/api\/local\/health/);
  assert.match(workflow, /--header 'Host: app\.timbersteeltrade\.com'/);
  assert.doesNotMatch(workflow, /journalctl|cat \/etc|printenv/);
});
