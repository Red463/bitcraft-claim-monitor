import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const updater = readFileSync(new URL("../../deploy/update-bitcraft-claim-monitor-relay", import.meta.url), "utf8");
const helper = readFileSync(new URL("../../deploy/cutover-relay-production.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../.github/workflows/cutover-relay-production.yml", import.meta.url), "utf8");
const deployment = readFileSync(new URL("../../DEPLOYMENT.md", import.meta.url), "utf8");

test("restricted updater delegates only exact cutover modes before its routine transaction", () => {
  for (const option of ["--prepare-cutover", "--apply-cutover", "--abort-cutover", "--confirmation", "--manifest-hash"]) {
    assert.match(updater, new RegExp(option.replaceAll("-", "\\-")));
  }
  assert.match(updater, /CUTOVER_HELPER_PATH=.*cutover-relay-production\.mjs/);
  assert.match(updater, /BITCRAFT_CUTOVER_UPDATER=1/);
  assert.match(updater, /node "\$CUTOVER_HELPER_PATH"/);
  assert.match(updater, /Unknown or mixed cutover mode/);
  for (const guard of ["REVISION_SEEN", "CUTOVER_CONFIRMATION_SEEN", "CUTOVER_MANIFEST_HASH_SEEN"]) {
    assert.match(updater, new RegExp(`${guard}=0`));
    assert.match(updater, new RegExp(`\\$\\{?${guard}\\}?`));
  }
  const cutoverValidation = updater.slice(
    updater.indexOf('if [[ -n "$CUTOVER_MODE" ]]'),
    updater.indexOf("delegate_cutover_mode()"),
  );
  assert.match(cutoverValidation, /prepare\)[\s\S]*"\$CUTOVER_MANIFEST_HASH_SEEN" == "0"[\s\S]*apply\|abort\)/);
  assert.match(cutoverValidation, /apply\|abort\)[\s\S]*"\$CUTOVER_CONFIRMATION_SEEN" == "0"/);

  const main = updater.slice(updater.indexOf("main()"));
  const delegation = main.indexOf("delegate_cutover_mode");
  assert.ok(delegation >= 0);
  assert.ok(delegation < main.indexOf("trap cleanup_deployment_transaction EXIT"));
  assert.ok(delegation < main.indexOf('exec 9>"$LOCK_FILE"'));

  assert.match(main, /prepare_release "\$release_dir"/);
  assert.match(main, /snapshot_live_installation/);
  assert.match(main, /atomic_switch "\$release_dir"/);
  assert.doesNotMatch(main.slice(main.indexOf("trap cleanup_deployment_transaction EXIT")), /CUTOVER_HELPER_PATH/);
});

test("production cutover workflow is manual, main-only, serialized, and approval-separated", () => {
  assert.match(workflow, /^name: Cut over Relay production$/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*confirmation:[\s\S]*type: string/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /confirmation.*app\.timbersteeltrade\.com/);
  assert.match(workflow, /concurrency:[\s\S]*group: relay-production-cutover[\s\S]*cancel-in-progress: false/);
  assert.match(workflow, /prepare:[\s\S]*needs: verify[\s\S]*environment: relay-preview/);
  assert.match(workflow, /apply:[\s\S]*needs: prepare[\s\S]*environment: relay-cutover/);
  assert.match(workflow, /abort:[\s\S]*always\(\)[\s\S]*needs\.apply\.result != 'success'/);
});

test("workflow verifies all contracts and invokes exact revision-bound prepare/apply/abort modes", () => {
  const verify = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  prepare:"));
  for (const expected of [
    /pnpm --filter @workspace\/bitcraft-local test/,
    /pnpm --filter @workspace\/bitcraft-local run build/,
    /sudo "\$\(command -v node\)" --test scripts\/test\/deploy-\*\.test\.mjs/,
    /systemd-analyze verify/,
    /caddy validate --config deploy\/Caddyfile\.example/,
    /caddy validate --config deploy\/Caddyfile\.cutover-maintenance/,
  ]) assert.match(verify, expected);

  assert.match(workflow, /--revision '\$GITHUB_SHA' --prepare-cutover --confirmation 'app\.timbersteeltrade\.com'/);
  assert.match(workflow, /--revision '\$GITHUB_SHA' --apply-cutover --manifest-hash '\$MANIFEST_HASH'/);
  assert.match(workflow, /--revision '\$GITHUB_SHA' --abort-cutover --manifest-hash '\$MANIFEST_HASH'/);
  assert.match(workflow, /ServerAliveInterval=30/);
  assert.match(workflow, /ServerAliveCountMax=10/);
  assert.match(workflow, /ConnectTimeout=15/);
  assert.match(workflow, /timeout-minutes:/);
});

test("workflow parses only the non-secret prepare summary and never publishes remote logs", () => {
  assert.match(workflow, /PREPARE_OUTPUT="\$\(ssh/);
  assert.match(workflow, /JSON\.parse/);
  assert.match(workflow, /manifestHash/);
  assert.match(workflow, /GITHUB_OUTPUT/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(workflow, /printf[^\n]*(?:PREPARE_OUTPUT|APPLY_OUTPUT|ABORT_OUTPUT)/);
  assert.doesNotMatch(workflow, /set -x/);
  assert.doesNotMatch(workflow, /appleboy|ssh-action/);
  assert.match(helper, /operation: "cutover-failed"/);
  assert.match(helper, /ensureRootPrivateDirectory\(paths\.stateDirectory/);
  assert.match(helper, /ensureRootPrivateDirectory\(paths\.logDirectory/);
});

test("runbook documents the distinct protected cutover environment and recovery boundary", () => {
  for (const expected of [
    /relay-cutover/,
    /required reviewer/i,
    /RELAY_VPS_HOST/,
    /RELAY_VPS_DEPLOY_USER/,
    /RELAY_VPS_SSH_PRIVATE_KEY/,
    /RELAY_VPS_KNOWN_HOSTS/,
    /app\.timbersteeltrade\.com/,
    /15-minute.*watchdog/i,
    /before admission.*abort/i,
    /after admission.*fix-forward/i,
    /cutover[^\n]*[→>-][^\n]*deploy[^\n]*[→>-][^\n]*backup/i,
  ]) assert.match(deployment, expected);
});
