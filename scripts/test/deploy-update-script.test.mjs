import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../deploy/update-bitcraft-monitor", import.meta.url), "utf8");
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const deployment = readFileSync(new URL("../../DEPLOYMENT.md", import.meta.url), "utf8");
const gitAttributes = readFileSync(new URL("../../.gitattributes", import.meta.url), "utf8");

test("VPS updater validates an exact main-branch revision before preparing a release", () => {
  assert.match(script, /--revision/);
  assert.match(script, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(script, /merge-base --is-ancestor/);
  assert.match(script, /origin\/main/);
  assert.match(script, /flock/);
});

test("VPS updater builds an immutable release before cutover", () => {
  assert.match(script, /SOURCE_DIR="\$\{SOURCE_DIR:-\$APP_ROOT\/source\}"/);
  assert.match(script, /RELEASES_DIR="\$\{RELEASES_DIR:-\$APP_ROOT\/releases\}"/);
  assert.match(script, /CURRENT_LINK="\$\{CURRENT_LINK:-\$APP_ROOT\/current\}"/);
  assert.match(script, /git[^\n]+worktree add --detach/);
  assert.match(
    script,
    /prepare_release "\$release_dir"[\s\S]*validate_release_config "\$release_dir"[\s\S]*schema_backup_kind[\s\S]*atomic_switch "\$release_dir"/,
  );
  assert.doesNotMatch(script, /log "Stopping services"[\s\S]*Fetching latest code/);
});

test("VPS updater validates cutover and restores the previous release on failure", () => {
  assert.match(script, /expected_version/);
  assert.match(script, /rollback_release\(\)/);
  assert.match(script, /atomic_switch "\$previous_release"/);
  assert.doesNotMatch(script, /sqlite3[^\n]+\.backup/);
  assert.match(
    script,
    /restart_service "\$WEB_SERVICE"[\s\S]*wait_for_health "\$expected_version"[\s\S]*restart_service "\$WORKER_SERVICE"/,
  );
});

test("VPS updater retains three releases only after success", () => {
  assert.match(script, /KEEP_RELEASES="\$\{KEEP_RELEASES:-3\}"/);
  assert.match(script, /prune_releases\(\)/);
  assert.match(script, /deployment_succeeded=1[\s\S]*prune_releases "\$release_dir"/);
  assert.match(script, /sudo -u "\$RUN_USER" git -C "\$SOURCE_DIR" worktree remove --force/);
  assert.match(script, /sudo -u "\$RUN_USER" git -C "\$SOURCE_DIR" worktree prune/);
});

test("VPS updater waits for service and release health", () => {
  assert.match(script, /wait_for_service\(\)/);
  assert.match(script, /wait_for_health\(\)/);
  assert.match(script, /curl -fsS --connect-timeout 1 --max-time 10 "\$HEALTH_URL"/);
  assert.match(script, /sleep 2/);
  assert.match(script, /Waiting for web health/);
});

test("VPS update script keeps successful output compact while logging details", () => {
  assert.match(script, /LOG_FILE="\$\{LOG_FILE:-\/tmp\/bitcraft-claim-monitor-update-\$\(date \+%Y%m%d-%H%M%S\)\.log\}"/);
  assert.match(script, /printf "Full log: %s\\n" "\$LOG_FILE"/);
  assert.match(script, /run_logged\(\)/);
  assert.match(script, /run_logged "Installing dependencies"/);
  assert.match(script, /run_logged "Building app"/);
  assert.match(script, /Preparation: %ss/);
  assert.match(script, /Cutover: %ss/);
});

test("VPS update script exposes verbose and public-check controls", () => {
  assert.match(script, /--verbose/);
  assert.match(script, /--no-public-check/);
  assert.match(script, /VERBOSE=1/);
  assert.match(script, /SKIP_PUBLIC_CHECK=1/);
});

test("VPS updater creates backups only for migrations or an explicit force", () => {
  assert.match(script, /--force-backup/);
  assert.match(script, /database-schema-version/);
  assert.match(script, /backup-bitcraft-monitor.*migration.*--revision/);
  assert.match(script, /backup-bitcraft-monitor.*manual.*--revision/);
  assert.doesNotMatch(script, /create_predeploy_backup/);
  assert.doesNotMatch(script, /sqlite3[^\n]+\.backup/);
});

test("VPS update script prints concise readiness and failure diagnostics", () => {
  assert.match(script, /service_summary\(\)/);
  assert.match(script, /systemctl show "\$service"/);
  assert.match(script, /journalctl -u "\$service"/);
  assert.match(script, /tail -n 80 "\$LOG_FILE"/);
  assert.match(script, /Health: ok=/);
  assert.match(script, /Public: /);
  assert.match(script, /Requested revision:/);
  assert.match(script, /Previous revision:/);
  assert.match(script, /Rollback:/);
  assert.match(script, /Active release:/);
  assert.match(script, /Failed release retained:/);
});

test("deployment docs install and explain the tracked staged update helper", () => {
  assert.match(deployment, /deploy\/update-bitcraft-monitor/);
  assert.match(deployment, /install -m 0755 "\$RELEASE\/deploy\/update-bitcraft-monitor" \/usr\/local\/bin\/update-bitcraft-monitor/);
  assert.match(deployment, /concise summary/);
  assert.match(deployment, /full VPS log/);
  assert.match(deployment, /--verbose/);
  assert.match(deployment, /--no-public-check/);
});

test("deployment docs describe the staged layout and manual GitHub release path", () => {
  assert.match(deployment, /\/opt\/bitcraft-claim-monitor\/source/);
  assert.match(deployment, /\/opt\/bitcraft-claim-monitor\/releases/);
  assert.match(deployment, /current.*symbolic link/i);
  assert.match(deployment, /Deploy production/);
  assert.match(deployment, /production environment/);
  assert.match(deployment, /required reviewer/i);
  assert.match(deployment, /VPS_KNOWN_HOSTS/);
  assert.match(deployment, /automatic rollback/i);
  assert.match(deployment, /backward compatible/i);
  assert.doesNotMatch(readme, /cd \/opt\/bitcraft-claim-monitor[\s\S]*update-bitcraft-monitor\n/);
});

test("VPS update script is checked out with Unix line endings", () => {
  assert.match(gitAttributes, /deploy\/update-bitcraft-monitor\s+text\s+eol=lf/);
});
