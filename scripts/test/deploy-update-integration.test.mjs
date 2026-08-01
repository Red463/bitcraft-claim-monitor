import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("../../deploy/update-bitcraft-claim-monitor-relay", import.meta.url);
const hasBash = process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;

test("failure after unit installation restores every live artifact and prior runtime", { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-deploy-"));

  const harness = `
    set -euo pipefail
    source "$1"
    APP_ROOT="$2"
    CURRENT_LINK="$2/current"
    SYSTEMD_DIR="$2/systemd"
    BACKUP_HELPER_PATH="$2/bin/backup"
    BACKUP_CRYPTO_HELPER_PATH="$2/lib/crypto"
    PRIVACY_REPLAY_HELPER_PATH="$2/lib/replay"
    UPDATER_PATH="$2/bin/updater"
    LOG_FILE="$2/update.log"
    TMPDIR="$2/tmp"
    TEST_ROOT="$2"
    mkdir -p "$2/releases/previous" "$2/releases/candidate" "$SYSTEMD_DIR" "$2/bin" "$2/lib" "$TMPDIR"
    ln -s "releases/previous" "$CURRENT_LINK"
    : >"$LOG_FILE"
    for path in \
      "$BACKUP_HELPER_PATH" \
      "$BACKUP_CRYPTO_HELPER_PATH" \
      "$PRIVACY_REPLAY_HELPER_PATH" \
      "$UPDATER_PATH" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-worker.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-collector.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-collector.timer" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-backup.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-backup.timer"; do
      printf 'original:%s\n' "$path" >"$path"
    done
    systemctl() {
      case "$1" in
        is-active|is-enabled) return 0 ;;
        *) return 0 ;;
      esac
    }
    restart_service() { return 0; }
    wait_for_service() { return 0; }
    wait_for_health() { return 0; }

    snapshot_live_installation
    # Simulate a failure immediately after candidate unit/helper installation.
    for path in \
      "$BACKUP_HELPER_PATH" \
      "$BACKUP_CRYPTO_HELPER_PATH" \
      "$PRIVACY_REPLAY_HELPER_PATH" \
      "$UPDATER_PATH" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-worker.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-collector.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-collector.timer" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-backup.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-backup.timer"; do
      printf 'candidate\n' >"$path"
    done
    atomic_switch "$2/releases/candidate"
    rollback_deployment_transaction

    [[ "$(readlink -f "$CURRENT_LINK")" == "$2/releases/previous" ]]
    for path in \
      "$BACKUP_HELPER_PATH" \
      "$BACKUP_CRYPTO_HELPER_PATH" \
      "$PRIVACY_REPLAY_HELPER_PATH" \
      "$UPDATER_PATH" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-worker.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-collector.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-collector.timer" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-backup.service" \
      "$SYSTEMD_DIR/bitcraft-claim-monitor-relay-backup.timer"; do
      grep -Fqx "original:$path" "$path"
    done
    cleanup_deployment_transaction
  `;

  try {
    const result = spawnSync("bash", ["-c", harness, "test", script.pathname, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failure after backup timer enable is restored by EXIT cleanup", { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-timer-finalize-"));
  const harness = `
    set -euo pipefail
    source "$1"
    APP_ROOT="$2"
    CURRENT_LINK="$2/current"
    SYSTEMD_DIR="$2/systemd"
    BACKUP_HELPER_PATH="$2/bin/backup"
    BACKUP_CRYPTO_HELPER_PATH="$2/lib/crypto"
    PRIVACY_REPLAY_HELPER_PATH="$2/lib/replay"
    UPDATER_PATH="$2/bin/updater"
    LOG_FILE="$2/update.log"
    TMPDIR="$2/tmp"
    TEST_ROOT="$2"
    mkdir -p "$2/releases/previous" "$SYSTEMD_DIR" "$2/bin" "$2/lib" "$TMPDIR"
    ln -s "releases/previous" "$CURRENT_LINK"
    : >"$LOG_FILE"
    printf 'original-updater\n' >"$UPDATER_PATH"
    printf 'original-unit\n' >"$SYSTEMD_DIR/bitcraft-claim-monitor-relay.service"

    systemctl() {
      local operation="$1"
      shift
      case "$operation" in
        is-active)
          [[ "$*" == *"$BACKUP_TIMER"* && -f "$TEST_ROOT/timer-active" ]]
          ;;
        is-enabled)
          [[ "$*" == *"$BACKUP_TIMER"* && -f "$TEST_ROOT/timer-enabled" ]]
          ;;
        enable)
          : >"$TEST_ROOT/timer-enabled"
          [[ "$1" != "--now" ]] || : >"$TEST_ROOT/timer-active"
          ;;
        disable)
          rm -f "$TEST_ROOT/timer-enabled"
          ;;
        start)
          : >"$TEST_ROOT/timer-active"
          ;;
        stop)
          rm -f "$TEST_ROOT/timer-active"
          ;;
        daemon-reload)
          ;;
      esac
    }
    restart_service() { return 0; }
    wait_for_service() { return 0; }
    wait_for_health() { return 0; }

    set +e
    (
      set -e
      trap cleanup_deployment_transaction EXIT
      snapshot_live_installation
      printf 'candidate-updater\n' >"$UPDATER_PATH"
      printf 'candidate-unit\n' >"$SYSTEMD_DIR/bitcraft-claim-monitor-relay.service"
      systemctl enable --now "$BACKUP_TIMER"
      false
    )
    failure_status=$?
    set -e
    [[ "$failure_status" -ne 0 ]]
    grep -Fqx 'original-updater' "$UPDATER_PATH"
    grep -Fqx 'original-unit' "$SYSTEMD_DIR/bitcraft-claim-monitor-relay.service"
    [[ ! -e "$TEST_ROOT/timer-enabled" ]]
    [[ ! -e "$TEST_ROOT/timer-active" ]]
  `;

  try {
    const result = spawnSync("bash", ["-c", harness, "test", script.pathname, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("individual restore failure attempts every path and retains the recovery snapshot", { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-restore-failure-"));
  const harness = `
    set -euo pipefail
    source "$1"
    TEST_ROOT="$2"
    LOG_FILE="$2/update.log"
    transaction_dir="$2/recovery"
    transaction_started=1
    mkdir -p "$transaction_dir"
    : >"$LOG_FILE"
    restore_live_path() {
      printf '%s\n' "$1" >>"$TEST_ROOT/restore-attempts"
      [[ "$1" != "updater" ]]
    }
    systemctl() {
      if [[ "$1" == "daemon-reload" ]]; then
        : >"$TEST_ROOT/daemon-reload-attempted"
      fi
      return 0
    }
    restore_previous_runtime() { return 0; }

    set +e
    rollback_deployment_transaction
    rollback_status=$?
    cleanup_deployment_transaction
    cleanup_status=$?
    set -e

    [[ "$rollback_status" -ne 0 ]]
    [[ "$cleanup_status" -ne 0 ]]
    [[ "$(wc -l <"$2/restore-attempts")" -eq 11 ]]
    [[ -f "$2/daemon-reload-attempted" ]]
    [[ -d "$transaction_dir" ]]
    grep -Fq "Recovery snapshot retained at: $transaction_dir" "$LOG_FILE"
  `;

  try {
    const result = spawnSync("bash", ["-c", harness, "test", script.pathname, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("KEEP_RELEASES=1 commits before best-effort prune and prune failure cannot roll back", { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-post-commit-prune-"));
  const harness = `
    set -euo pipefail
    source "$1"
    TEST_ROOT="$2"
    RELEASES_DIR="$2/releases"
    KEEP_RELEASES=1
    LOG_FILE="$2/update.log"
    transaction_dir="$2/transaction"
    transaction_started=1
    mkdir -p "$RELEASES_DIR/previous" "$RELEASES_DIR/candidate" "$RELEASES_DIR/older" "$transaction_dir"
    : >"$LOG_FILE"
    rollback_deployment_transaction() {
      : >"$TEST_ROOT/rollback-triggered"
      return 0
    }
    prune_releases() {
      [[ "$KEEP_RELEASES" == "1" ]]
      [[ -d "$RELEASES_DIR/previous" && -d "$RELEASES_DIR/older" ]]
      return 1
    }

    [[ -d "$RELEASES_DIR/previous" ]]
    deployment_succeeded=1
    post_commit_prune "$RELEASES_DIR/candidate"
    cleanup_deployment_transaction

    [[ -d "$RELEASES_DIR/previous" ]]
    [[ ! -e "$2/rollback-triggered" ]]
    grep -Fq "Release pruning failed after deployment commit; continuing" "$LOG_FILE"
  `;

  try {
    const result = spawnSync("bash", ["-c", harness, "test", script.pathname, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("schema backup selection distinguishes ordinary, migration, and forced deployments", { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-schema-"));
  const previous = join(root, "previous");
  const candidate = join(root, "candidate");
  const harness = `
    set -euo pipefail
    source "$1"
    previous="$2/previous"
    candidate="$2/candidate"
    mkdir -p "$previous/deploy" "$candidate/deploy"
    printf '1\n' >"$previous/deploy/database-schema-version"
    printf '1\n' >"$candidate/deploy/database-schema-version"
    FORCE_BACKUP=0
    [[ "$(schema_backup_kind "$previous" "$candidate")" == "none" ]]
    printf '2\n' >"$candidate/deploy/database-schema-version"
    [[ "$(schema_backup_kind "$previous" "$candidate")" == "migration" ]]
    rm "$previous/deploy/database-schema-version"
    [[ "$(schema_backup_kind "$previous" "$candidate")" == "migration" ]]
    printf '2\n' >"$previous/deploy/database-schema-version"
    FORCE_BACKUP=1
    [[ "$(schema_backup_kind "$previous" "$candidate")" == "manual" ]]
    printf '3\n' >"$candidate/deploy/database-schema-version"
    [[ "$(schema_backup_kind "$previous" "$candidate")" == "migration" ]]
  `;

  try {
    const result = spawnSync("bash", ["-c", harness, "test", script.pathname, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
