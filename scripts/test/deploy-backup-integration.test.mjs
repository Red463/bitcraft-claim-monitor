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
  target="\${command:9:-1}"
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

function runCleanupFixture({
  mode = "--dry-run-prune",
  legacyCount = 0,
  dailyCount = 0,
  migrationCount = 0,
  manualCount = 0,
  openNames = [],
  extraNames = [],
  quickCheck = "ok",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-cleanup-"));
  const bin = join(root, "bin");
  const data = join(root, "data");
  const backups = join(root, "backups");
  const openPath = join(root, "open.txt");
  mkdirSync(bin);
  mkdirSync(data);
  mkdirSync(backups);
  writeFileSync(join(data, "bitcraft-local.sqlite"), "database", "utf8");
  writeFileSync(openPath, openNames.join("\n"), "utf8");

  const names = [];
  for (let index = 1; index <= legacyCount; index += 1) {
    names.push(`bitcraft-local-predeploy-${String(index).padStart(12, "0")}-20260701-${String(index).padStart(6, "0")}.sqlite`);
  }
  for (let index = 1; index <= dailyCount; index += 1) {
    names.push(`bitcraft-local-daily-202607${String(index).padStart(2, "0")}-000000.sqlite`);
  }
  for (let index = 1; index <= migrationCount; index += 1) {
    names.push(`bitcraft-local-migration-${String(index).padStart(12, "0")}-202607${String(index).padStart(2, "0")}-000000.sqlite`);
  }
  for (let index = 1; index <= manualCount; index += 1) {
    names.push(`bitcraft-local-manual-${String(index).padStart(12, "0")}-202607${String(index).padStart(2, "0")}-000000.sqlite`);
  }
  for (const name of [...names, ...extraNames]) {
    const path = join(backups, name);
    if (name.endsWith("/")) {
      mkdirSync(path.slice(0, -1));
    } else {
      writeFileSync(path, "backup", "utf8");
    }
  }

  writeExecutable(join(bin, "sudo"), `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "-u" ]]
shift 2
exec "$@"
`);
  writeExecutable(join(bin, "sqlite3"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$2" == "PRAGMA quick_check;" ]]; then
  printf '%s\n' "$FIXTURE_QUICK_CHECK"
elif [[ "$2" == .backup* ]]; then
  target="\${2:9:-1}"
  cp "$1" "$target"
fi
`);
  writeExecutable(join(bin, "fuser"), `#!/usr/bin/env bash
set -euo pipefail
path="\${!#}"
grep -Fxq "$(basename "$path")" "$FIXTURE_OPEN"
`);
  writeExecutable(join(bin, "systemctl"), "#!/usr/bin/env bash\nexit 1\n");

  const before = new Set(readdirSync(backups));
  const args = mode === "retention" ? ["daily"] : [mode];
  const result = spawnSync("bash", [script.pathname, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      DATA_DIR: data,
      BACKUP_DIR: backups,
      BACKUP_LOCK_FILE: join(root, "backup.lock"),
      DEPLOY_LOCK_FILE: join(root, "deploy.lock"),
      RUN_USER: process.env.USER ?? process.env.LOGNAME ?? "root",
      ALLOW_NON_ROOT_FOR_TESTS: "1",
      FIXTURE_OPEN: openPath,
      FIXTURE_QUICK_CHECK: quickCheck,
    },
  });
  const remainingNames = readdirSync(backups);
  const remaining = new Set(remainingNames);
  const fixture = {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    remainingNames,
    removedNames: [...before].filter((name) => !remaining.has(name)),
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

test("dry run lists only legacy files older than the newest three", { skip: !hasBash }, () => {
  const result = runCleanupFixture({ mode: "--dry-run-prune", legacyCount: 8 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.removedNames.length, 0);
  assert.equal(result.remainingNames.filter((name) => name.startsWith("bitcraft-local-predeploy-")).length, 8);
  assert.equal((result.stdout.match(/Would remove:/g) ?? []).length, 5);
  assert.match(result.stdout, /Recoverable bytes: [1-9][0-9]*/);
});

test("apply removes only recomputed eligible legacy files", { skip: !hasBash }, () => {
  const result = runCleanupFixture({
    mode: "--apply-prune",
    legacyCount: 8,
    openNames: ["bitcraft-local-predeploy-000000000001-20260701-000001.sqlite"],
    extraNames: ["unknown.sqlite", "bitcraft-local-predeploy-test.partial", "bitcraft-local-predeploy-000000000009-20260701-000009.sqlite/"],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.remainingNames.includes("unknown.sqlite"), true);
  assert.equal(result.remainingNames.includes("bitcraft-local-predeploy-test.partial"), true);
  assert.equal(result.removedNames.includes("unknown.sqlite"), false);
  assert.equal(result.removedNames.includes("bitcraft-local-predeploy-000000000001-20260701-000001.sqlite"), false);
});

test("class retention keeps seven daily and three migration and manual files", { skip: !hasBash }, () => {
  const result = runCleanupFixture({ mode: "retention", dailyCount: 9, migrationCount: 5, manualCount: 5 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.remainingNames.filter((name) => name.includes("-daily-")).length, 7);
  assert.equal(result.remainingNames.filter((name) => name.includes("-migration-")).length, 3);
  assert.equal(result.remainingNames.filter((name) => name.includes("-manual-")).length, 3);
});

test("retention uses timestamps rather than revision text", { skip: !hasBash }, () => {
  const result = runCleanupFixture({
    mode: "retention",
    extraNames: [
      "bitcraft-local-migration-ffffffffffff-20260701-000000.sqlite",
      "bitcraft-local-migration-eeeeeeeeeeee-20260702-000000.sqlite",
      "bitcraft-local-migration-dddddddddddd-20260703-000000.sqlite",
      "bitcraft-local-migration-000000000001-20260704-000000.sqlite",
      "bitcraft-local-migration-000000000002-20260705-000000.sqlite",
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.remainingNames.includes("bitcraft-local-migration-ffffffffffff-20260701-000000.sqlite"), false);
  assert.equal(result.remainingNames.includes("bitcraft-local-migration-000000000002-20260705-000000.sqlite"), true);
  assert.equal(result.remainingNames.filter((name) => name.includes("-migration-")).length, 3);
});

test("legacy apply refuses cleanup when the newest retained backup is invalid", { skip: !hasBash }, () => {
  const result = runCleanupFixture({ mode: "--apply-prune", legacyCount: 8, quickCheck: "corrupt" });
  assert.notEqual(result.status, 0);
  assert.equal(result.removedNames.length, 0);
  assert.match(result.stderr, /Newest retained backup failed validation/);
});
