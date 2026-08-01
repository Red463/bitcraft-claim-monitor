import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../deploy/update-bitcraft-claim-monitor-relay", import.meta.url), "utf8");
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const deployment = readFileSync(new URL("../../DEPLOYMENT.md", import.meta.url), "utf8");
const gitAttributes = readFileSync(new URL("../../.gitattributes", import.meta.url), "utf8");

test("Relay updater has only isolated defaults", () => {
  for (const expected of [
    /APP_ROOT="\$\{APP_ROOT:-\/opt\/bitcraft-claim-monitor-relay\}"/,
    /DATA_DIR="\$\{DATA_DIR:-\/var\/lib\/bitcraft-claim-monitor-relay\}"/,
    /BACKUP_DIR="\$\{BACKUP_DIR:-\/var\/backups\/bitcraft-claim-monitor-relay\}"/,
    /CONFIG_DIR="\$\{CONFIG_DIR:-\/etc\/bitcraft-claim-monitor-relay\}"/,
    /BACKUP_HELPER_PATH="\$\{BACKUP_HELPER_PATH:-\/usr\/local\/bin\/backup-bitcraft-claim-monitor-relay\}"/,
    /LOCK_FILE="\$\{LOCK_FILE:-\/run\/lock\/bitcraft-claim-monitor-relay-deploy\.lock\}"/,
    /WEB_SERVICE="\$\{WEB_SERVICE:-bitcraft-claim-monitor-relay\.service\}"/,
    /WORKER_SERVICE="\$\{WORKER_SERVICE:-bitcraft-claim-monitor-relay-worker\.service\}"/,
    /HEALTH_URL="\$\{HEALTH_URL:-http:\/\/127\.0\.0\.1:19430\/api\/local\/health\}"/,
    /PUBLIC_URL="\$\{PUBLIC_URL:-https:\/\/relay\.timbersteeltrade\.com\}"/,
    /LOG_FILE="\$\{LOG_FILE:-\/tmp\/bitcraft-claim-monitor-relay-update-/,
  ]) {
    assert.match(script, expected);
  }
});

test("Relay updater validates an exact main-branch revision before preparing a release", () => {
  assert.match(script, /--revision/);
  assert.match(script, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(script, /merge-base --is-ancestor/);
  assert.match(script, /origin\/main/);
  assert.match(script, /flock/);
});

test("Relay updater builds an immutable release before cutover", () => {
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

test("Relay updater validates cutover and restores the previous release on failure", () => {
  assert.match(script, /expected_version/);
  assert.match(script, /rollback_release\(\)/);
  assert.match(script, /atomic_switch "\$previous_release"/);
  assert.doesNotMatch(script, /sqlite3[^\n]+\.backup/);
  assert.match(
    script,
    /restart_service "\$WEB_SERVICE"[\s\S]*wait_for_health "\$expected_version"[\s\S]*restart_service "\$WORKER_SERVICE"/,
  );
});

test("Relay updater retains three releases only after success", () => {
  assert.match(script, /KEEP_RELEASES="\$\{KEEP_RELEASES:-3\}"/);
  assert.match(script, /prune_releases\(\)/);
  assert.match(script, /deployment_succeeded=1[\s\S]*prune_releases "\$release_dir"/);
  assert.match(script, /sudo -u "\$RUN_USER" git -C "\$SOURCE_DIR" worktree remove --force/);
  assert.match(script, /sudo -u "\$RUN_USER" git -C "\$SOURCE_DIR" worktree prune/);
});

test("Relay updater waits for service and release health", () => {
  assert.match(script, /wait_for_service\(\)/);
  assert.match(script, /wait_for_health\(\)/);
  assert.match(script, /curl -fsS --connect-timeout 1 --max-time 10 "\$HEALTH_URL"/);
  assert.match(script, /sleep 2/);
  assert.match(script, /Waiting for web health/);
});

test("Relay updater keeps successful output compact while logging details", () => {
  assert.match(script, /printf "Full log: %s\\n" "\$LOG_FILE"/);
  assert.match(script, /run_logged\(\)/);
  assert.match(script, /run_logged "Installing dependencies"/);
  assert.match(script, /run_logged "Building app"/);
  assert.match(script, /Preparation: %ss/);
  assert.match(script, /Cutover: %ss/);
  assert.match(script, /--verbose/);
  assert.match(script, /--no-public-check/);
});

test("Relay updater creates encrypted backups only for migrations or an explicit force", () => {
  assert.match(script, /--force-backup/);
  assert.match(script, /database-schema-version/);
  assert.match(script, /"\$BACKUP_HELPER_PATH" migration --revision/);
  assert.match(script, /"\$BACKUP_HELPER_PATH" manual --revision/);
  assert.match(script, /stage_backup_helper\(\)/);
  assert.match(script, /restore_staged_backup_helper\(\)/);
  assert.match(script, /trap cleanup_staged_backup_helper EXIT/);
  assert.match(script, /backup_crypto_helper_snapshot=""/);
  assert.match(script, /privacy_replay_helper_snapshot=""/);
  assert.match(
    script,
    /restore_installed_helper "\$backup_crypto_helper_snapshot" "\$BACKUP_CRYPTO_HELPER_PATH"/,
  );
  assert.match(
    script,
    /restore_installed_helper "\$privacy_replay_helper_snapshot" "\$PRIVACY_REPLAY_HELPER_PATH"/,
  );
  assert.doesNotMatch(script, /create_predeploy_backup/);
  assert.doesNotMatch(script, /sqlite3[^\n]+\.backup/);
});

test("Relay updater validates and installs only Relay units", () => {
  for (const unit of [
    "bitcraft-claim-monitor-relay.service",
    "bitcraft-claim-monitor-relay-worker.service",
    "bitcraft-claim-monitor-relay-collector.service",
    "bitcraft-claim-monitor-relay-collector.timer",
    "bitcraft-claim-monitor-relay-backup.service",
    "bitcraft-claim-monitor-relay-backup.timer",
  ]) {
    assert.match(script, new RegExp(unit.replaceAll(".", "\\.")));
  }
  assert.match(script, /systemctl enable "\$WEB_SERVICE" "\$WORKER_SERVICE" "\$COLLECTOR_TIMER"/);
  assert.match(script, /systemctl enable --now "\$BACKUP_TIMER"/);
});

test("routine Relay updates validate but never overwrite or reload Caddy", () => {
  assert.match(script, /caddy validate[\s\S]*Caddyfile\.example/);
  assert.doesNotMatch(script, /install[^\n]*Caddyfile\.example[^\n]*\/etc\/caddy\/Caddyfile/);
  assert.doesNotMatch(script, /systemctl (?:reload|restart) caddy/);
});

test("Relay updater never targets maintained deployment identities", () => {
  for (const target of [
    /http:\/\/127\.0\.0\.1:18430/,
    /\/usr\/local\/bin\/update-bitcraft-monitor(?!-relay)/,
    /\/opt\/bitcraft-claim-monitor(?:\/|")/,
    /\/var\/lib\/bitcraft-claim-monitor(?:\/|")/,
    /\/var\/backups\/bitcraft-claim-monitor(?:\/|")/,
    /(^|[^-])bitcraft-claim-monitor\.service/m,
    /(^|[^-])bitcraft-claim-monitor-worker\.service/m,
    /(^|[^-])bitcraft-monitor-collector\.(?:service|timer)/m,
    /(^|[^-])bitcraft-claim-monitor-backup\.(?:service|timer)/m,
  ]) {
    assert.doesNotMatch(script, target);
  }
});

test("Relay updater prints concise readiness and failure diagnostics", () => {
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

test("deployment docs install and explain the tracked Relay updater", () => {
  assert.match(deployment, /deploy\/update-bitcraft-claim-monitor-relay/);
  assert.match(
    deployment,
    /install -m 0755 .*deploy\/update-bitcraft-claim-monitor-relay.*\/usr\/local\/bin\/update-bitcraft-claim-monitor-relay/,
  );
  assert.match(deployment, /concise summary/);
  assert.match(deployment, /full VPS log/);
  assert.match(deployment, /--verbose/);
  assert.match(deployment, /--no-public-check/);
});

test("README points to the Relay preview workflow, environment, and runbook", () => {
  assert.match(readme, /Deploy Relay preview/);
  assert.match(readme, /relay-preview/);
  assert.match(readme, /\[`?DEPLOYMENT\.md`?\]\(\.\/DEPLOYMENT\.md\)/);
  assert.doesNotMatch(readme, /manually run \*\*Deploy production\*\*/);
});

test("Relay shell helpers are checked out with Unix line endings", () => {
  assert.match(gitAttributes, /deploy\/update-bitcraft-claim-monitor-relay\s+text\s+eol=lf/);
  assert.match(gitAttributes, /deploy\/backup-bitcraft-claim-monitor-relay\s+text\s+eol=lf/);
  assert.doesNotMatch(gitAttributes, /deploy\/update-bitcraft-monitor\s/);
  assert.doesNotMatch(gitAttributes, /deploy\/backup-bitcraft-monitor\s/);
});
