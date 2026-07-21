# Deployment Backup Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-deployment full SQLite copies with validated daily, schema-migration, and manually forced backups, while making long backups observable and safely pruning redundant legacy files.

**Architecture:** A dedicated root-owned backup command owns service pausing, SQLite copy/validation, retention, and legacy cleanup. The staged updater compares an explicit schema marker between active and candidate releases and invokes that command only when required. A systemd timer supplies daily recovery points, while GitHub Actions supplies manual forcing, keepalives, and a longer timeout.

**Tech Stack:** Bash 5, SQLite CLI, systemd services/timers, GitHub Actions YAML, Node.js 24 built-in test runner.

## Global Constraints

- Never stop `bitcraft-claim-monitor.service`; the website remains online during backup.
- Restore worker, collector service, and collector timer to their exact pre-backup active/inactive states on success, failure, and signals.
- Store backups only below `/var/backups/bitcraft-claim-monitor`; callers cannot provide paths.
- Publish a backup only after `PRAGMA quick_check` returns exactly `ok`.
- Retain seven daily, three migration, three manual, and initially three legacy backups.
- Never remove partial files, unknown filenames, directories, open files, or files created after cleanup begins.
- Matching schema versions create no deployment backup; missing or changed markers create exactly one migration backup.
- Node.js remains 24+ and no runtime dependency is added.

---

### Task 1: Add the validated backup command

**Files:**
- Create: `deploy/backup-bitcraft-monitor`
- Create: `scripts/test/deploy-backup-script.test.mjs`
- Create: `scripts/test/deploy-backup-integration.test.mjs`
- Modify: `.gitattributes`

**Interfaces:**
- Consumes: fixed production paths plus test overrides `DATA_DIR`, `BACKUP_DIR`, `BACKUP_LOCK_FILE`, `RUN_USER`, `WORKER_SERVICE`, `COLLECTOR_SERVICE`, `COLLECTOR_TIMER`, and `HEARTBEAT_SECONDS`.
- Produces: `backup-bitcraft-monitor daily`, `backup-bitcraft-monitor migration --revision <sha>`, and `backup-bitcraft-monitor manual --revision <sha>`.

- [ ] **Step 1: Write structural tests for the command contract**

Create `scripts/test/deploy-backup-script.test.mjs` and require these behaviors from the script text:

```js
assert.match(script, /BACKUP_LOCK_FILE=.*bitcraft-claim-monitor-backup\.lock/);
assert.match(script, /daily\|migration\|manual/);
assert.match(script, /bitcraft-local-.*\.partial/);
assert.match(script, /PRAGMA quick_check/);
assert.match(script, /HEARTBEAT_SECONDS="\$\{HEARTBEAT_SECONDS:-30\}"/);
assert.match(script, /systemctl stop "\$COLLECTOR_TIMER"/);
assert.match(script, /systemctl stop "\$COLLECTOR_SERVICE"/);
assert.match(script, /systemctl stop "\$WORKER_SERVICE"/);
assert.doesNotMatch(script, /systemctl stop.*bitcraft-claim-monitor\.service/);
assert.match(script, /DAILY_KEEP="\$\{DAILY_KEEP:-7\}"/);
assert.match(script, /MIGRATION_KEEP="\$\{MIGRATION_KEEP:-3\}"/);
assert.match(script, /MANUAL_KEEP="\$\{MANUAL_KEEP:-3\}"/);
```

- [ ] **Step 2: Write Linux integration tests for success and failure restoration**

In `scripts/test/deploy-backup-integration.test.mjs`, copy the existing `hasBash` and temporary-directory pattern from `scripts/test/deploy-update-integration.test.mjs`. Add `runBackupFixture({ activeUnits, quickCheck, backupDelaySeconds, existingFiles, openFiles, mode })`, returning `{ status, stdout, stderr, actions, backupFiles }`. It must prefix `PATH` with fake `systemctl`, `sudo`, `sqlite3`, `fuser`, and `flock` commands that log calls, then invoke the real script. Cover:

```js
test("backup pauses active writers, validates, publishes, and restores them", { skip: !hasBash }, () => {
  const result = runBackupFixture({
    activeUnits: ["bitcraft-claim-monitor-worker.service", "bitcraft-monitor-collector.timer"],
    quickCheck: "ok",
    mode: ["daily"],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.actions, ["stop:timer", "stop:worker", "backup", "quick_check", "start:worker", "start:timer"]);
  assert.equal(result.backupFiles.filter((path) => path.endsWith(".sqlite")).length, 1);
  assert.equal(result.backupFiles.some((path) => path.endsWith(".partial")), false);
});

test("failed validation keeps the partial file and restores prior states", { skip: !hasBash }, () => {
  const result = runBackupFixture({ activeUnits: ["worker", "timer"], quickCheck: "corrupt", mode: ["daily"] });
  assert.notEqual(result.status, 0);
  assert.equal(result.backupFiles.some((path) => path.endsWith(".sqlite")), false);
  assert.equal(result.backupFiles.some((path) => path.endsWith(".partial")), true);
  assert.deepEqual(result.actions.slice(-2), ["start:worker", "start:timer"]);
});

test("inactive background units remain inactive", { skip: !hasBash }, () => {
  const result = runBackupFixture({ activeUnits: [], quickCheck: "ok", mode: ["daily"] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.actions.some((action) => action.startsWith("stop:") || action.startsWith("start:")), false);
});
```

Set `HEARTBEAT_SECONDS=1` and make the fake copy wait two seconds; assert stdout includes `Backup still running: elapsed=` and `bytes=`.

- [ ] **Step 3: Run tests and verify RED**

```bash
node --test scripts/test/deploy-backup-*.test.mjs
```

Expected: FAIL because `deploy/backup-bitcraft-monitor` does not exist.

- [ ] **Step 4: Implement the command**

Start with:

```bash
#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/bitcraft-claim-monitor}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/bitcraft-claim-monitor}"
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-/run/lock/bitcraft-claim-monitor-backup.lock}"
RUN_USER="${RUN_USER:-bitcraft}"
WORKER_SERVICE="${WORKER_SERVICE:-bitcraft-claim-monitor-worker.service}"
COLLECTOR_SERVICE="${COLLECTOR_SERVICE:-bitcraft-monitor-collector.service}"
COLLECTOR_TIMER="${COLLECTOR_TIMER:-bitcraft-monitor-collector.timer}"
HEARTBEAT_SECONDS="${HEARTBEAT_SECONDS:-30}"
DAILY_KEEP="${DAILY_KEEP:-7}"
MIGRATION_KEEP="${MIGRATION_KEEP:-3}"
MANUAL_KEEP="${MANUAL_KEEP:-3}"
LEGACY_KEEP="${LEGACY_KEEP:-3}"
DATABASE="$DATA_DIR/bitcraft-local.sqlite"
```

Strictly parse the three backup classes. Require a full lowercase SHA for migration/manual and reject revisions for daily. Implement `record_and_pause_services`, `restore_services`, `run_backup_with_heartbeat`, `validate_and_publish`, and `prune_class`.

Record three active-state flags, install an `EXIT INT TERM` restoration trap immediately, and start only units whose recorded flag is `1`. Copy to `"$final.partial"`, poll the SQLite PID, and print elapsed seconds plus `stat -c %s` every `HEARTBEAT_SECONDS`. Validate and publish with:

```bash
check_result="$(sudo -u "$RUN_USER" sqlite3 "$partial" "PRAGMA quick_check;")"
[[ "$check_result" == "ok" ]] || {
  printf "Backup validation failed: %s\n" "$check_result" >&2
  return 1
}
mv -- "$partial" "$final"
```

Add to `.gitattributes`:

```text
deploy/backup-bitcraft-monitor text eol=lf
```

- [ ] **Step 5: Run tests and verify GREEN**

```bash
node --test scripts/test/deploy-backup-*.test.mjs
```

Expected: all backup tests pass; Windows skips only Bash execution tests.

- [ ] **Step 6: Commit**

```bash
git add deploy/backup-bitcraft-monitor .gitattributes scripts/test/deploy-backup-script.test.mjs scripts/test/deploy-backup-integration.test.mjs
git commit -m "feat: add validated database backup command"
```

---

### Task 2: Add safe retention and legacy cleanup

**Files:**
- Modify: `deploy/backup-bitcraft-monitor`
- Modify: `scripts/test/deploy-backup-integration.test.mjs`

**Interfaces:**
- Consumes: Task 1 filename classes and retention constants.
- Produces: non-mutating `--dry-run-prune` and explicit `--apply-prune` cleanup modes.

- [ ] **Step 1: Add failing cleanup tests**

Use the Task 1 fixture helper to create eight timestamped legacy files plus a directory, partial file, unknown SQLite file, fake open file, and post-start file. `runCleanupFixture({ mode, legacyCount, dailyCount, migrationCount, manualCount, openNames, extraNames, quickCheck })` returns `{ status, stdout, stderr, remainingNames, removedNames }`. Assert:

```js
test("dry run lists only legacy files older than the newest three", { skip: !hasBash }, () => {
  const result = runCleanupFixture({ mode: "--dry-run-prune", legacyCount: 8 });
  assert.equal(result.status, 0);
  assert.equal(result.removedNames.length, 0);
  assert.equal(result.remainingNames.filter((name) => name.startsWith("bitcraft-local-predeploy-")).length, 8);
  assert.equal((result.stdout.match(/Would remove:/g) ?? []).length, 5);
  assert.match(result.stdout, /Recoverable bytes: [1-9][0-9]*/);
});

test("apply removes only the recomputed eligible legacy files", { skip: !hasBash }, () => {
  const result = runCleanupFixture({
    mode: "--apply-prune",
    legacyCount: 8,
    openNames: ["bitcraft-local-predeploy-000000000001-20260701-000001.sqlite"],
    extraNames: ["unknown.sqlite", "bitcraft-local-predeploy-test.partial"],
  });
  assert.equal(result.status, 0);
  assert.equal(result.remainingNames.includes("unknown.sqlite"), true);
  assert.equal(result.remainingNames.includes("bitcraft-local-predeploy-test.partial"), true);
  assert.equal(result.removedNames.includes("unknown.sqlite"), false);
});

test("class retention keeps seven daily and three migration and manual files", { skip: !hasBash }, () => {
  const result = runCleanupFixture({ mode: "retention", dailyCount: 9, migrationCount: 5, manualCount: 5 });
  assert.equal(result.remainingNames.filter((name) => name.includes("-daily-")).length, 7);
  assert.equal(result.remainingNames.filter((name) => name.includes("-migration-")).length, 3);
  assert.equal(result.remainingNames.filter((name) => name.includes("-manual-")).length, 3);
});

test("legacy apply refuses cleanup when the newest retained backup is invalid", { skip: !hasBash }, () => {
  const result = runCleanupFixture({ mode: "--apply-prune", legacyCount: 8, quickCheck: "corrupt" });
  assert.notEqual(result.status, 0);
  assert.equal(result.removedNames.length, 0);
  assert.match(result.stderr, /Newest retained backup failed validation/);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
node --test scripts/test/deploy-backup-integration.test.mjs
```

Expected: FAIL because cleanup modes are missing.

- [ ] **Step 3: Implement exact candidate selection and deletion**

Use `shopt -s nullglob` and exact, non-recursive patterns:

```bash
legacy_files=("$BACKUP_DIR"/bitcraft-local-predeploy-????????????-????????-??????.sqlite)
daily_files=("$BACKUP_DIR"/bitcraft-local-daily-????????-??????.sqlite)
migration_files=("$BACKUP_DIR"/bitcraft-local-migration-????????????-????????-??????.sqlite)
manual_files=("$BACKUP_DIR"/bitcraft-local-manual-????????????-????????-??????.sqlite)
```

Require regular non-symlink files, exclude `fuser -s -- "$path"`, and exclude modification epochs later than the cleanup start epoch. Sort basename timestamps descending, retain the class count, and sum bytes with `stat -c %s`.

Dry run prints `Would remove: <absolute-path>` and `Recoverable bytes: <integer>` without mutation. Apply recomputes the candidate set, validates the newest retained completed legacy backup with `PRAGMA quick_check`, requires `ok`, and uses `rm -- "$path"` one file at a time. Cleanup refuses to run while another process holds either the deployment or backup lock.

- [ ] **Step 4: Run tests and verify GREEN**

```bash
node --test scripts/test/deploy-backup-*.test.mjs
```

Expected: cleanup, retention, validation, heartbeat, and restoration tests pass.

- [ ] **Step 5: Commit**

```bash
git add deploy/backup-bitcraft-monitor scripts/test/deploy-backup-integration.test.mjs
git commit -m "feat: add safe backup retention cleanup"
```

---

### Task 3: Add schema-aware deployment backups and daily scheduling

**Files:**
- Create: `deploy/database-schema-version`
- Create: `deploy/bitcraft-claim-monitor-backup.service`
- Create: `deploy/bitcraft-claim-monitor-backup.timer`
- Modify: `deploy/update-bitcraft-monitor`
- Modify: `scripts/test/deploy-update-script.test.mjs`
- Modify: `scripts/test/deploy-update-integration.test.mjs`
- Modify: `scripts/test/deploy-runtime-config.test.mjs`

**Interfaces:**
- Consumes: active/candidate schema markers and `/usr/local/bin/backup-bitcraft-monitor` from Tasks 1–2.
- Produces: updater `--force-backup`, `schema_backup_kind`, and persistent daily timer.

- [ ] **Step 1: Add failing updater tests**

Require marker value `1`, remove the unconditional `.backup` contract, and assert:

```js
assert.match(script, /--force-backup/);
assert.match(script, /database-schema-version/);
assert.match(script, /backup-bitcraft-monitor.*migration.*--revision/);
assert.match(script, /backup-bitcraft-monitor.*manual.*--revision/);
assert.doesNotMatch(script, /create_predeploy_backup/);
assert.doesNotMatch(script, /sqlite3[^\n]+\.backup/);
```

Add sourced Bash cases: equal markers return `none`; changed or missing markers return `migration`; equal plus force returns `manual`; changed plus force remains `migration`.

Require the two new systemd units to contain:

```js
assert.match(backupService, /ExecStart=\/usr\/local\/bin\/backup-bitcraft-monitor daily/);
assert.match(backupTimer, /OnCalendar=\*-\*-\* 03:30:00 Europe\/London/);
assert.match(backupTimer, /RandomizedDelaySec=15m/);
assert.match(backupTimer, /Persistent=true/);
```

- [ ] **Step 2: Run tests and verify RED**

```bash
node --test scripts/test/deploy-update-*.test.mjs scripts/test/deploy-runtime-config.test.mjs
```

Expected: FAIL because marker, conditional backup logic, and units are absent.

- [ ] **Step 3: Implement marker comparison**

Create `deploy/database-schema-version` with exactly `1`. Add `FORCE_BACKUP=0`, parse `--force-backup`, and implement:

```bash
read_schema_version() {
  local marker="$1/deploy/database-schema-version" value
  [[ -f "$marker" ]] || return 1
  value="$(tr -d '[:space:]' <"$marker")"
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || return 1
  printf "%s\n" "$value"
}

schema_backup_kind() {
  local previous_version candidate_version
  previous_version="$(read_schema_version "$1" 2>/dev/null || true)"
  candidate_version="$(read_schema_version "$2" 2>/dev/null || true)"
  if [[ -z "$previous_version" || -z "$candidate_version" || "$previous_version" != "$candidate_version" ]]; then
    printf "migration\n"
  elif [[ "$FORCE_BACKUP" == "1" ]]; then
    printf "manual\n"
  else
    printf "none\n"
  fi
}
```

Calculate once after release/config validation. Invoke `/usr/local/bin/backup-bitcraft-monitor "$kind" --revision "$REVISION"` unless `none`. Install both commands into `/usr/local/bin` after successful cutover.

- [ ] **Step 4: Add and install systemd units**

Service:

```ini
[Unit]
Description=Create the daily BitCraft Claim Monitor database backup
After=network-online.target

[Service]
Type=oneshot
User=root
ExecStart=/usr/local/bin/backup-bitcraft-monitor daily
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
```

Timer:

```ini
[Unit]
Description=Create a daily BitCraft Claim Monitor database backup

[Timer]
OnCalendar=*-*-* 03:30:00 Europe/London
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
```

Validate both candidate units. Install them conditionally in `install_release_config` so rollback to the immediately previous release remains valid when that release predates these files. Do not start the timer during preparation or cutover.

After candidate web/worker/public health succeeds, install the new backup helper into `/usr/local/bin`, then run `systemctl enable --now bitcraft-claim-monitor-backup.timer`. Never start the oneshot service directly. A failed cutover therefore leaves the previous timer and helper state unchanged.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
node --test scripts/test/deploy-*.test.mjs
```

Expected: all deployment tests pass.

- [ ] **Step 6: Commit**

```bash
git add deploy/database-schema-version deploy/bitcraft-claim-monitor-backup.service deploy/bitcraft-claim-monitor-backup.timer deploy/update-bitcraft-monitor scripts/test/deploy-update-script.test.mjs scripts/test/deploy-update-integration.test.mjs scripts/test/deploy-runtime-config.test.mjs
git commit -m "feat: schedule schema-aware database backups"
```

---

### Task 4: Harden GitHub Actions and document operations

**Files:**
- Modify: `.github/workflows/deploy-production.yml`
- Modify: `scripts/test/deploy-production-workflow.test.mjs`
- Modify: `DEPLOYMENT.md`
- Modify: `scripts/test/deploy-update-script.test.mjs`

**Interfaces:**
- Consumes: updater `--force-backup` and installed backup command.
- Produces: workflow manual input, keepalives, 45-minute timeout, and exact production cleanup runbook.

- [ ] **Step 1: Add failing workflow and documentation tests**

```js
assert.match(workflow, /force_database_backup:[\s\S]*type: boolean[\s\S]*default: false/);
assert.match(workflow, /deploy:[\s\S]*timeout-minutes: 45/);
assert.match(workflow, /ServerAliveInterval=30/);
assert.match(workflow, /ServerAliveCountMax=10/);
assert.match(workflow, /FORCE_DATABASE_BACKUP/);
assert.match(deployment, /database-schema-version/);
assert.match(deployment, /backup-bitcraft-monitor --dry-run-prune/);
assert.match(deployment, /backup-bitcraft-monitor --apply-prune/);
assert.match(deployment, /bitcraft-claim-monitor-backup\.timer/);
assert.match(deployment, /force_database_backup/);
```

- [ ] **Step 2: Run tests and verify RED**

```bash
node --test scripts/test/deploy-production-workflow.test.mjs scripts/test/deploy-update-script.test.mjs
```

Expected: FAIL because workflow hardening and runbook copy are absent.

- [ ] **Step 3: Implement workflow inputs and keepalives**

Define the boolean input:

```yaml
on:
  workflow_dispatch:
    inputs:
      force_database_backup:
        description: Create a manual database backup even when the schema is unchanged
        required: false
        type: boolean
        default: false
```

Set `deploy.timeout-minutes: 45`, expose `FORCE_DATABASE_BACKUP: ${{ inputs.force_database_backup }}`, append `--force-backup` only when true, and add:

```text
-o ServerAliveInterval=30
-o ServerAliveCountMax=10
```

Preserve exact verified-SHA quoting and pinned known-host behavior.

- [ ] **Step 4: Update the runbook**

Document schema-marker bumps, seven daily/three migration/three manual retention, the workflow checkbox, backup timer/journal inspection, lock checks, `PRAGMA quick_check`, dry-run review, explicit apply, and first rollout behavior when the active release lacks a marker.

Include a one-time bootstrap section using these exact operations. It stops if either lock is held, derives the exact merged revision from `origin/main`, saves the old updater, syntax-checks both new helpers, and never modifies the active release or database:

```bash
set -euo pipefail
sudo fuser -s /run/lock/bitcraft-claim-monitor-deploy.lock && { echo "Deployment lock is active."; exit 1; }
sudo fuser -s /run/lock/bitcraft-claim-monitor-backup.lock && { echo "Backup lock is active."; exit 1; }

sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source fetch --prune origin main
REVISION="$(sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source rev-parse origin/main)"
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]]
sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source merge-base --is-ancestor "$REVISION" origin/main

STAMP="$(date +%Y%m%d-%H%M%S)"
install -m 0700 /usr/local/bin/update-bitcraft-monitor "/root/update-bitcraft-monitor-pre-backup-policy-$STAMP"
BOOTSTRAP_DIR="$(mktemp -d /tmp/bitcraft-backup-bootstrap.XXXXXX)"
cleanup_bootstrap() {
  find "$BOOTSTRAP_DIR" -mindepth 1 -maxdepth 1 -type f -delete
  rmdir "$BOOTSTRAP_DIR"
}
trap cleanup_bootstrap EXIT

sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source show "$REVISION:deploy/update-bitcraft-monitor" >"$BOOTSTRAP_DIR/update-bitcraft-monitor"
sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source show "$REVISION:deploy/backup-bitcraft-monitor" >"$BOOTSTRAP_DIR/backup-bitcraft-monitor"
bash -n "$BOOTSTRAP_DIR/update-bitcraft-monitor"
bash -n "$BOOTSTRAP_DIR/backup-bitcraft-monitor"
install -m 0755 "$BOOTSTRAP_DIR/update-bitcraft-monitor" /usr/local/bin/update-bitcraft-monitor
install -m 0755 "$BOOTSTRAP_DIR/backup-bitcraft-monitor" /usr/local/bin/backup-bitcraft-monitor
```

- [ ] **Step 5: Run tests and verify GREEN**

```bash
node --test scripts/test/deploy-*.test.mjs
```

Expected: all deployment contracts pass.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy-production.yml scripts/test/deploy-production-workflow.test.mjs DEPLOYMENT.md scripts/test/deploy-update-script.test.mjs
git commit -m "fix: keep long database backups connected"
```

---

### Task 5: Verify and prepare the production cleanup handoff

**Files:**
- Modify only if verification exposes a defect in Tasks 1–4.

**Interfaces:**
- Consumes: complete implementation.
- Produces: verified branch and exact read-only cleanup inventory; no local command deletes production data.

- [ ] **Step 1: Run deployment tests**

```bash
node --test scripts/test/deploy-*.test.mjs
```

Expected: all deployment tests pass with no unexpected Linux skips.

- [ ] **Step 2: Run full application tests**

```bash
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: at least 950 tests pass and zero fail.

- [ ] **Step 3: Run production build**

```bash
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript checking and Vite build succeed.

- [ ] **Step 4: Check patch hygiene**

```bash
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted implementation files, and only focused backup-policy commits.

- [ ] **Step 5: Run implementation review**

Compare code and tests against every section of `docs/superpowers/specs/2026-07-22-deployment-backup-policy-design.md`. Confirm backup classes, counts, marker rules, workflow input, locks, heartbeat, validation, service restoration, exclusions, exact-revision bootstrap, and rollout instructions.

- [ ] **Step 6: Prepare production cleanup inventory**

Require these read-only checks before deletion:

```bash
sudo fuser -v /run/lock/bitcraft-claim-monitor-deploy.lock
sudo fuser -v /run/lock/bitcraft-claim-monitor-backup.lock
sudo find /var/backups/bitcraft-claim-monitor -maxdepth 1 -type f -printf '%TY-%Tm-%Td %TH:%TM:%TS %s %p\n' | sort
```

After bootstrapping the new cleanup command, run `/usr/local/bin/backup-bitcraft-monitor --dry-run-prune` and review its exact paths and byte total before `/usr/local/bin/backup-bitcraft-monitor --apply-prune`. Never substitute wildcard deletion.
