import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../deploy/backup-bitcraft-monitor", import.meta.url), "utf8");

test("backup command has fixed production defaults and a dedicated lock", () => {
  assert.match(script, /DATA_DIR="\$\{DATA_DIR:-\/var\/lib\/bitcraft-claim-monitor\}"/);
  assert.match(script, /BACKUP_DIR="\$\{BACKUP_DIR:-\/var\/backups\/bitcraft-claim-monitor\}"/);
  assert.match(script, /BACKUP_LOCK_FILE="\$\{BACKUP_LOCK_FILE:-\/run\/lock\/bitcraft-claim-monitor-backup\.lock\}"/);
  assert.match(script, /daily\|migration\|manual/);
});

test("backup command validates a partial copy before publishing it", () => {
  assert.match(script, /bitcraft-local-.*\.partial/);
  assert.match(script, /PRAGMA quick_check/);
  assert.match(script, /mv -- "\$partial" "\$final"/);
  assert.match(script, /HEARTBEAT_SECONDS="\$\{HEARTBEAT_SECONDS:-30\}"/);
  assert.match(script, /Backup still running: elapsed=/);
});

test("backup command pauses only background database writers", () => {
  assert.match(script, /systemctl stop "\$COLLECTOR_TIMER"/);
  assert.match(script, /systemctl stop "\$COLLECTOR_SERVICE"/);
  assert.match(script, /systemctl stop "\$WORKER_SERVICE"/);
  assert.doesNotMatch(script, /systemctl stop.*bitcraft-claim-monitor\.service/);
  assert.match(script, /restore_services/);
});

test("backup command declares retention for each completed backup class", () => {
  assert.match(script, /DAILY_KEEP="\$\{DAILY_KEEP:-7\}"/);
  assert.match(script, /MIGRATION_KEEP="\$\{MIGRATION_KEEP:-3\}"/);
  assert.match(script, /MANUAL_KEEP="\$\{MANUAL_KEEP:-3\}"/);
  assert.match(script, /LEGACY_KEEP="\$\{LEGACY_KEEP:-3\}"/);
});

test("backup command exposes guarded legacy cleanup modes", () => {
  assert.match(script, /--dry-run-prune/);
  assert.match(script, /--apply-prune/);
  assert.match(script, /Would remove:/);
  assert.match(script, /Recoverable bytes:/);
  assert.match(script, /Newest retained backup failed validation/);
  assert.match(script, /DEPLOY_LOCK_FILE="\$\{DEPLOY_LOCK_FILE:-\/run\/lock\/bitcraft-claim-monitor-deploy\.lock\}"/);
});
