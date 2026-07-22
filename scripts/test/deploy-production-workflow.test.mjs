import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/deploy-production.yml", import.meta.url);
const deploymentUrl = new URL("../../DEPLOYMENT.md", import.meta.url);

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

test("verification runs real systemd validation before deployment", () => {
  const workflow = readFileSync(workflowUrl, "utf8");
  const verifyJob = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  deploy:"));
  const nodePathIndex = verifyJob.indexOf('sudo ln -s "$(command -v node)" /usr/bin/node');
  const systemdVerifyIndex = verifyJob.indexOf("systemd-analyze verify");

  assert.match(verifyJob, /systemd-analyze verify/);
  assert.match(verifyJob, /deploy\/bitcraft-claim-monitor-backup\.service/);
  assert.match(verifyJob, /deploy\/bitcraft-claim-monitor-backup\.timer/);
  assert.ok(nodePathIndex >= 0, "verifier must provide the production Node executable path");
  assert.ok(systemdVerifyIndex > nodePathIndex, "production Node path must exist before systemd validation");
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

test("workflow supports explicit backups and long-running SSH keepalives", () => {
  const workflow = readFileSync(workflowUrl, "utf8");
  assert.match(workflow, /force_database_backup:[\s\S]*type: boolean[\s\S]*default: false/);
  assert.match(workflow, /deploy:[\s\S]*timeout-minutes: 45/);
  assert.match(workflow, /ServerAliveInterval=30/);
  assert.match(workflow, /ServerAliveCountMax=10/);
  assert.match(workflow, /FORCE_DATABASE_BACKUP/);
});

test("deployment runbook explains the backup lifecycle and guarded cleanup", () => {
  const deployment = readFileSync(deploymentUrl, "utf8");
  assert.match(deployment, /database-schema-version/);
  assert.match(deployment, /backup-bitcraft-monitor --dry-run-prune/);
  assert.match(deployment, /backup-bitcraft-monitor --apply-prune/);
  assert.match(deployment, /bitcraft-claim-monitor-backup\.timer/);
  assert.match(deployment, /force_database_backup/);
  assert.match(deployment, /seven daily/i);
  assert.match(deployment, /three migration/i);
  assert.match(deployment, /three manual/i);
});
