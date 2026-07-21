import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("../../deploy/backup-bitcraft-monitor", import.meta.url);
const hasBash = process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;

function writeExecutable(path, contents) {
  writeFileSync(path, contents, "utf8");
  chmodSync(path, 0o755);
}

function runBackupFixture({ activeUnits = [], quickCheck = "ok", backupDelaySeconds = 0, mode = ["daily"] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-backup-"));
  const bin = join(root, "bin");
  const data = join(root, "data");
  const backups = join(root, "backups");
  const actionsPath = join(root, "actions.log");
  const activePath = join(root, "active.txt");
  mkdirSync(bin);
  mkdirSync(data);
  mkdirSync(backups);
  writeFileSync(join(data, "bitcraft-local.sqlite"), "database", "utf8");
  writeFileSync(activePath, activeUnits.join("\n"), "utf8");

  writeExecutable(join(bin, "systemctl"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "is-active" ]]; then
  grep -Fxq "\${3:-}" "$FIXTURE_ACTIVE"
elif [[ "$1" == "stop" || "$1" == "start" ]]; then
  unit="$2"
  case "$unit" in
    *collector.timer) label=timer ;;
    *collector.service) label=collector ;;
    *worker.service) label=worker ;;
    *) label="$unit" ;;
  esac
  printf '%s:%s\n' "$1" "$label" >>"$FIXTURE_ACTIONS"
fi
`);
  writeExecutable(join(bin, "sudo"), `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "-u" ]]
shift 2
exec "$@"
`);
  writeExecutable(join(bin, "sqlite3"), `#!/usr/bin/env bash
set -euo pipefail
database="$1"
command="$2"
if [[ "$command" == .backup* ]]; then
  printf 'backup\n' >>"$FIXTURE_ACTIONS"
  sleep "$FIXTURE_BACKUP_DELAY"
  target="\${command#.backup \' }"
  target="\${target%\'}"
  cp "$database" "$target"
elif [[ "$command" == "PRAGMA quick_check;" ]]; then
  printf 'quick_check\n' >>"$FIXTURE_ACTIONS"
  printf '%s\n' "$FIXTURE_QUICK_CHECK"
fi
`);

  const result = spawnSync("bash", [script.pathname, ...mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      DATA_DIR: data,
      BACKUP_DIR: backups,
      BACKUP_LOCK_FILE: join(root, "backup.lock"),
      RUN_USER: process.env.USER ?? process.env.LOGNAME ?? "root",
      ALLOW_NON_ROOT_FOR_TESTS: "1",
      HEARTBEAT_SECONDS: "1",
      FIXTURE_ACTIONS: actionsPath,
      FIXTURE_ACTIVE: activePath,
      FIXTURE_BACKUP_DELAY: String(backupDelaySeconds),
      FIXTURE_QUICK_CHECK: quickCheck,
    },
  });

  const fixture = {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    actions: existsSync(actionsPath) ? readFileSync(actionsPath, "utf8").trim().split(/\r?\n/).filter(Boolean) : [],
    backupFiles: readdirSync(backups),
  };
  rmSync(root, { recursive: true, force: true });
  return fixture;
}

test("backup pauses active writers, validates, publishes, and restores them", { skip: !hasBash }, () => {
  const result = runBackupFixture({
    activeUnits: ["bitcraft-claim-monitor-worker.service", "bitcraft-monitor-collector.timer"],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.actions, ["stop:timer", "stop:worker", "backup", "quick_check", "start:worker", "start:timer"]);
  assert.equal(result.backupFiles.filter((path) => path.endsWith(".sqlite")).length, 1);
  assert.equal(result.backupFiles.some((path) => path.endsWith(".partial")), false);
});

test("failed validation keeps the partial file and restores prior states", { skip: !hasBash }, () => {
  const result = runBackupFixture({
    activeUnits: ["bitcraft-claim-monitor-worker.service", "bitcraft-monitor-collector.timer"],
    quickCheck: "corrupt",
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.backupFiles.some((path) => path.endsWith(".sqlite")), false);
  assert.equal(result.backupFiles.some((path) => path.endsWith(".partial")), true);
  assert.deepEqual(result.actions.slice(-2), ["start:worker", "start:timer"]);
});

test("inactive background units remain inactive", { skip: !hasBash }, () => {
  const result = runBackupFixture();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.actions.some((action) => action.startsWith("stop:") || action.startsWith("start:")), false);
});

test("long backups emit heartbeat progress", { skip: !hasBash }, () => {
  const result = runBackupFixture({ backupDelaySeconds: 2 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Backup still running: elapsed=[1-9][0-9]*s bytes=[0-9]+/);
});
