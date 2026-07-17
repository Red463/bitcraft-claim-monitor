import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/deploy-production.yml", import.meta.url);

test("production deployment is manual, main-only, and serialized", () => {
  const workflow = readFileSync(workflowUrl, "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /concurrency:[\s\S]*group: production/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("deployment credentials are gated behind verification and production approval", () => {
  const workflow = readFileSync(workflowUrl, "utf8");
  assert.match(workflow, /verify:/);
  assert.match(workflow, /pnpm --filter @workspace\/bitcraft-local test/);
  assert.match(workflow, /pnpm --filter @workspace\/bitcraft-local run build/);
  assert.match(workflow, /deploy:[\s\S]*needs: verify/);
  assert.match(workflow, /environment: production/);
});

test("workflow pins host identity and deploys the verified commit with system SSH", () => {
  const workflow = readFileSync(workflowUrl, "utf8");
  assert.match(workflow, /VPS_KNOWN_HOSTS/);
  assert.match(workflow, /chmod 600.*known_hosts/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /UserKnownHostsFile=.*known_hosts/);
  assert.match(workflow, /update-bitcraft-monitor --revision.*GITHUB_SHA/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(workflow, /appleboy|ssh-action/);
});
