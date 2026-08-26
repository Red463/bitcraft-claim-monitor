import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const updater = readFileSync(new URL("../../deploy/update-bitcraft-claim-monitor-relay", import.meta.url), "utf8");
let workflow = "";
try {
  workflow = readFileSync(new URL("../../.github/workflows/configure-public-caddy.yml", import.meta.url), "utf8");
} catch {
  // RED: the protected workflow does not exist yet.
}

test("restricted updater exposes only a revision-bound confirmed public Caddy mode", () => {
  assert.match(updater, /--configure-public-caddy/);
  assert.match(updater, /--confirmation claim-monitor\.com/);
  assert.match(updater, /public-caddy-bootstrap-v1/);
  assert.match(updater, /BITCRAFT_PUBLIC_CADDY_UPDATER=1/);
  assert.match(updater, /configure-public-caddy\.mjs/);
  assert.match(updater, /node --check[\s\\]+"\$release_dir\/deploy\/configure-public-caddy\.mjs"/);
});

test("public Caddy workflow is manual, main-only, approval-protected, and verifies both profiles", () => {
  assert.match(workflow, /^name: Configure public Claim Monitor Caddy$/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*confirmation:[\s\S]*type: string/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /CUTOVER_CONFIRMATION.*claim-monitor\.com/);
  assert.match(workflow, /environment: relay-cutover/);
  assert.match(workflow, /--revision '\$GITHUB_SHA' --configure-public-caddy --confirmation 'claim-monitor\.com'/);
  assert.match(workflow, /https:\/\/app\.timbersteeltrade\.com\/api\/local\/health/);
  assert.match(workflow, /https:\/\/claim-monitor\.com\/api\/profile/);
  assert.match(workflow, /https:\/\/www\.claim-monitor\.com\//);
  assert.doesNotMatch(workflow, /cat \/etc\/caddy|journalctl|printenv/);
});
