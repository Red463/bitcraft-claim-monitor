import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/recover-relay-service.yml", import.meta.url), "utf8");

test("recovery is manual, protected, pinned, and narrowly targets the stuck Relay updater", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: relay-preview/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /pkill -TERM -f '\[u\]pdate-bitcraft-claim-monitor-relay --revision'/);
  assert.match(workflow, /systemctl restart bitcraft-claim-monitor-relay\.service bitcraft-claim-monitor-relay-worker\.service/);
  assert.match(workflow, /127\.0\.0\.1:19430\/api\/local\/health/);
  assert.doesNotMatch(workflow, /journalctl|cat \/etc|printenv/);
});
