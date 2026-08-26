import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const updater = readFileSync(new URL("../../deploy/update-bitcraft-claim-monitor-relay", import.meta.url), "utf8");
let workflow = "";
try {
  workflow = readFileSync(new URL("../../.github/workflows/enable-public-readonly.yml", import.meta.url), "utf8");
} catch {
  // RED: the protected Stage 1 workflow does not exist yet.
}

test("restricted updater exposes a revision-bound public read-only activation mode", () => {
  assert.match(updater, /--enable-public-readonly/);
  assert.match(updater, /--disable-public-readonly/);
  assert.match(updater, /public-readonly-v2/);
  assert.match(updater, /BITCRAFT_PUBLIC_READONLY_UPDATER=1/);
  assert.match(updater, /show "\$REVISION:deploy\/enable-public-readonly\.mjs"/);
  assert.match(updater, /public-readonly-v2/);
});

test("Stage 1 workflow requires approval and verifies both isolated profiles", () => {
  assert.match(workflow, /^name: Enable public Claim Monitor read-only profile$/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*confirmation:[\s\S]*type: string/);
  assert.match(workflow, /approve:[\s\S]*environment: relay-cutover/);
  assert.match(workflow, /activate:[\s\S]*environment: relay-preview/);
  assert.match(workflow, /public-readonly-v2/);
  assert.match(workflow, /--enable-public-readonly --confirmation 'claim-monitor\.com'/);
  assert.match(workflow, /publicProfileEnabled === true/);
  assert.match(workflow, /publicCollaborationEnabled === false/);
  assert.match(workflow, /publicLegalConfigurationConfirmed === true/);
  assert.match(workflow, /api\/public\/settlements\/search/);
  assert.match(workflow, /search\.hints\[0\]\.claimId/);
  assert.match(workflow, /domains=claim%2Cmembers%2Ccitizens%2Cinventories%2Ccrafts/);
  assert.match(workflow, /public-snapshot\.json/);
  assert.match(workflow, /readFileSync\(`\$\{root\}\/public-snapshot\.json`/);
  assert.doesNotMatch(workflow, /' "\$PROFILE" "\$SEARCH" "\$SNAPSHOT"/);
  assert.match(workflow, /api\/local\/health/);
  assert.match(workflow, /https:\/\/app\.timbersteeltrade\.com\/bot/);
  assert.match(workflow, /Capture Timbersteel invariant baseline/);
  assert.match(workflow, /api\/local\/bootstrap/);
  assert.match(workflow, /api\/local\/craft-plan/);
  assert.match(workflow, /api\/local\/history/);
  assert.match(workflow, /api\/local\/notification-activity/);
  assert.match(workflow, /api\/local\/collector-status/);
  assert.match(workflow, /api\/local\/admin\/me/);
  assert.match(workflow, /deepEqual\(current, baseline\)/);
  assert.match(workflow, /timbersteelFingerprints/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /--disable-public-readonly --confirmation 'claim-monitor\.com'/);
});
