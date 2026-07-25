# Temporary VPS Ledger Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision and verify the privacy deletion ledger and encrypted-backup controls, document the temporary same-VPS recovery exception, and deploy `0.45.0-beta.1` without exposing secrets or leaving plaintext database backups behind.

**Architecture:** Keep the signed deletion ledger outside the live SQLite data directory at `/var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl`, with its HMAC key and the separate backup-encryption key under `/etc/bitcraft-claim-monitor`. The existing full-VPS backup is a temporary, explicitly accepted recovery dependency until the ledger is copied to Proton Drive. Validate the candidate release against protected disposable database copies before merging the documentation record or retrying the guarded production workflow.

**Tech Stack:** PowerShell 7, OpenSSH, Bash, Node.js 24, `node:sqlite`, SQLite CLI, AES-256-GCM deployment helper, systemd, pnpm, GitHub Actions, GitHub CLI.

## Global Constraints

- Work from `C:\Users\Tom\Documents\Bitcraft_Claim_Monitor_PerformancePass\.worktrees\admin-character-assignment`.
- Use the pinned SSH identity and known-hosts file; never disable host-key checking.
- Do not print, download, transmit, or place either production key in a command argument.
- Treat `/etc/bitcraft-claim-monitor.env`, both key files, the live database, and the ledger as protected production data.
- Preserve existing regular non-symlink key files when valid; abort instead of overwriting unexpected files.
- Keep services available until the existing updater reaches its short cutover window.
- Never operate a replay test against the live database.
- Remove only plaintext backups covered by the documented retention conversion in Task 4.
- If any validation fails, leave `0.44.0-beta.1` active and stop before deployment.

---

### Task 1: Capture the pre-change production state

**Files:**

- Inspect: `/opt/bitcraft-claim-monitor/current` on the VPS
- Inspect: `/var/backups/bitcraft-claim-monitor` on the VPS
- Inspect: `/etc/bitcraft-claim-monitor.env` metadata only

- [ ] **Step 1: Confirm the public application is still on the rolled-back release**

Run locally:

```powershell
curl.exe -fsS https://app.timbersteeltrade.com/api/local/health
```

Expected: JSON reports `"ok":true` and version `0.44.0-beta.1`.

- [ ] **Step 2: Capture non-secret VPS state**

Run over the pinned SSH connection:

```bash
set -euo pipefail
readlink -f /opt/bitcraft-claim-monitor/current
systemctl is-active bitcraft-claim-monitor bitcraft-claim-monitor-worker bitcraft-claim-monitor-backup.timer
stat -c '%n type=%F owner=%U group=%G mode=%a' /etc/bitcraft-claim-monitor.env
find /var/backups/bitcraft-claim-monitor -maxdepth 1 -type f \
  -printf '%f\t%s bytes\t%TY-%Tm-%Td %TH:%TM:%TS UTC\n' | sort
df -h /var/backups/bitcraft-claim-monitor
```

Expected: web, worker, and backup timer are active; current resolves to release `2205f8513ee26bec1290843c5a4981a21a107dc0`; at least one backup-sized working margin remains.

- [ ] **Step 3: Record the exact candidate helper revision**

Run over SSH:

```bash
set -euo pipefail
candidate=/opt/bitcraft-claim-monitor/releases/eeeeca70c3cbc9ad41b772bcbfbfdeb96905b35b
test -f "$candidate/deploy/backup-crypto.mjs"
test -f "$candidate/deploy/replay-privacy-deletions.mjs"
node --check "$candidate/deploy/backup-crypto.mjs"
node --check "$candidate/deploy/replay-privacy-deletions.mjs"
```

Expected: all four commands succeed without changing production.

### Task 2: Provision production configuration without disclosing secrets

**Files:**

- Create or preserve: `/etc/bitcraft-claim-monitor/privacy-ledger.key`
- Create or preserve: `/etc/bitcraft-claim-monitor/backup-encryption.key`
- Modify: `/etc/bitcraft-claim-monitor.env`
- Create: `/root/bitcraft-config-backups/bitcraft-claim-monitor.env.<UTC timestamp>`
- Create or preserve: `/var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl`

- [ ] **Step 1: Run one reviewed, fail-closed provisioning script over SSH stdin**

Pipe this exact script to `ssh ... root@5.181.124.240 "bash -s"` without enabling PowerShell interpolation:

```bash
set -euo pipefail
umask 077

config_dir=/etc/bitcraft-claim-monitor
env_file=/etc/bitcraft-claim-monitor.env
privacy_key="$config_dir/privacy-ledger.key"
backup_key="$config_dir/backup-encryption.key"
backup_dir=/var/backups/bitcraft-claim-monitor
ledger="$backup_dir/privacy-deletion-ledger.jsonl"
config_backup_dir=/root/bitcraft-config-backups
temp_key=""
temp_env=""

cleanup() {
  [[ -z "$temp_key" ]] || rm -f -- "$temp_key"
  [[ -z "$temp_env" ]] || rm -f -- "$temp_env"
}
trap cleanup EXIT INT TERM

require_regular() {
  local candidate="$1"
  [[ -f "$candidate" && ! -L "$candidate" ]] || {
    printf 'Refusing unexpected file: %s\n' "$candidate" >&2
    exit 1
  }
}

validate_key_value() {
  node -e '
    const fs = require("node:fs");
    const value = fs.readFileSync(process.argv[1], "utf8").trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, "base64url").length !== 32) {
      process.exit(1);
    }
  ' "$1"
}

provision_key() {
  local destination="$1"
  local expected_group="$2"
  local expected_mode="$3"
  if [[ -e "$destination" ]]; then
    require_regular "$destination"
  else
    temp_key="$(mktemp "$config_dir/.key.XXXXXX")"
    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url") + "\n")' >"$temp_key"
    install -o root -g "$expected_group" -m "$expected_mode" "$temp_key" "$destination"
    rm -f -- "$temp_key"
    temp_key=""
  fi
  [[ "$(stat -c '%U:%G:%a' "$destination")" == "root:$expected_group:$expected_mode" ]]
  validate_key_value "$destination"
  printf 'Validated %s metadata and length\n' "$destination"
}

require_regular "$env_file"
if [[ -e "$config_dir" ]]; then
  [[ -d "$config_dir" && ! -L "$config_dir" ]]
fi
install -d -o root -g bitcraft -m 0750 "$config_dir"
[[ "$(stat -c '%U:%G:%a' "$config_dir")" == "root:bitcraft:750" ]]

provision_key "$privacy_key" bitcraft 640
provision_key "$backup_key" root 600

install -d -o root -g root -m 0700 "$config_backup_dir"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
install -o root -g root -m 0600 "$env_file" \
  "$config_backup_dir/bitcraft-claim-monitor.env.$timestamp"

temp_env="$(mktemp /etc/.bitcraft-claim-monitor.env.XXXXXX)"
awk '!/^LEGAL_CONFIGURATION_CONFIRMED=/' "$env_file" >"$temp_env"
printf '%s\n' 'LEGAL_CONFIGURATION_CONFIRMED=true' >>"$temp_env"
install -o root -g root -m 0600 "$temp_env" /etc/.bitcraft-claim-monitor.env.next
mv -Tf /etc/.bitcraft-claim-monitor.env.next "$env_file"
rm -f -- "$temp_env"
temp_env=""

if [[ -e "$backup_dir" ]]; then
  [[ -d "$backup_dir" && ! -L "$backup_dir" ]]
fi
install -d -o bitcraft -g bitcraft -m 0700 "$backup_dir"
[[ "$(stat -c '%U:%G:%a' "$backup_dir")" == "bitcraft:bitcraft:700" ]]

if [[ -e "$ledger" ]]; then
  require_regular "$ledger"
else
  install -o bitcraft -g bitcraft -m 0600 /dev/null "$ledger"
fi
[[ "$(stat -c '%U:%G:%a' "$ledger")" == "bitcraft:bitcraft:600" ]]
printf 'Privacy release configuration provisioned without displaying secrets\n'
```

Expected: the script succeeds once, remains safe to rerun, and prints only file paths plus validation labels.

- [ ] **Step 2: Validate metadata and configuration state**

Run over SSH:

```bash
set -euo pipefail
stat -c '%n type=%F owner=%U group=%G mode=%a' \
  /etc/bitcraft-claim-monitor/privacy-ledger.key \
  /etc/bitcraft-claim-monitor/backup-encryption.key \
  /var/backups/bitcraft-claim-monitor \
  /var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl
test "$(grep -c '^LEGAL_CONFIGURATION_CONFIRMED=true$' /etc/bitcraft-claim-monitor.env)" -eq 1
test "$(grep -c '^LEGAL_CONFIGURATION_CONFIRMED=' /etc/bitcraft-claim-monitor.env)" -eq 1
find /root/bitcraft-config-backups -maxdepth 1 -type f \
  -name 'bitcraft-claim-monitor.env.*' -printf '%f owner=%u group=%g mode=%m\n' | sort
```

Expected: key and ledger metadata exactly match the design; one legal-confirmation line exists; no secret values are displayed.

### Task 3: Validate encryption and deletion replay against disposable data

**Files:**

- Read: `/var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite`
- Read: `/var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl`
- Temporary only: `/var/lib/bitcraft-claim-monitor/.privacy-preflight.*`

- [ ] **Step 1: Create a protected SQLite backup**

Run over SSH as root:

```bash
set -euo pipefail
work_dir="$(mktemp -d -p /var/lib/bitcraft-claim-monitor .privacy-preflight.XXXXXX)"
trap 'rm -rf -- "$work_dir"' EXIT INT TERM
chown bitcraft:bitcraft "$work_dir"
chmod 0700 "$work_dir"
sudo -u bitcraft sqlite3 /var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite \
  ".backup '$work_dir/source.sqlite'"
test "$(sqlite3 "$work_dir/source.sqlite" 'PRAGMA quick_check;')" = "ok"
```

Expected: a consistent disposable database exists and passes `quick_check`.

- [ ] **Step 2: Prove the AES-256-GCM round trip**

In the same protected SSH script:

```bash
candidate=/opt/bitcraft-claim-monitor/releases/eeeeca70c3cbc9ad41b772bcbfbfdeb96905b35b
node "$candidate/deploy/backup-crypto.mjs" encrypt \
  "$work_dir/source.sqlite" "$work_dir/source.sqlite.enc" \
  /etc/bitcraft-claim-monitor/backup-encryption.key
node "$candidate/deploy/backup-crypto.mjs" decrypt \
  "$work_dir/source.sqlite.enc" "$work_dir/decrypted.sqlite" \
  /etc/bitcraft-claim-monitor/backup-encryption.key
test "$(sqlite3 "$work_dir/decrypted.sqlite" 'PRAGMA quick_check;')" = "ok"
```

Expected: encryption, authenticated decryption, and the second `quick_check` pass.

- [ ] **Step 3: Prove deletion-ledger verification and replay**

In the same protected SSH script:

```bash
install -m 0600 "$work_dir/decrypted.sqlite" "$work_dir/replay.sqlite"
DATA_DIR="$work_dir" \
BACKUP_DIR=/var/backups/bitcraft-claim-monitor \
CONFIG_DIR=/etc/bitcraft-claim-monitor \
node "$candidate/deploy/replay-privacy-deletions.mjs" \
  "$work_dir/replay.sqlite" \
  /var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl \
  /etc/bitcraft-claim-monitor/privacy-ledger.key
test "$(sqlite3 "$work_dir/replay.sqlite" 'PRAGMA quick_check;')" = "ok"
```

Expected: the helper emits only a non-sensitive JSON result and the replayed copy remains valid.

- [ ] **Step 4: Prove plaintext test cleanup**

At the end of the same SSH script, validate the generated path before removing it:

```bash
case "$work_dir" in
  /var/lib/bitcraft-claim-monitor/.privacy-preflight.*) ;;
  *) printf 'Unexpected work directory: %s\n' "$work_dir" >&2; exit 1 ;;
esac
rm -rf -- "$work_dir"
trap - EXIT INT TERM
test ! -e "$work_dir"
find /var/backups/bitcraft-claim-monitor -maxdepth 1 \
  -type f -name '*.partial' -print -quit | grep -q . && exit 1 || true
```

Expected: no disposable plaintext database or partial backup remains.

### Task 4: Convert retained recovery points and remove legacy plaintext backups

**Files:**

- Convert: three existing `bitcraft-local-daily-*.sqlite` files
- Convert: the newest three `bitcraft-local-predeploy-*.sqlite` files
- Remove after validation: older plaintext predeploy backups
- Remove after checksum/integrity validation: the obsolete `pre-staged-20260717-215819.{sqlite,env,sha256}` bundle

- [ ] **Step 1: Identify the exact retained and removable sets**

Run a read-only inventory over SSH. Apply the deployment policy already encoded in `deploy/backup-bitcraft-monitor`: retain all three current daily recovery points and the newest three predeploy recovery points.

Expected retained predeploy set from the 2026-07-25 inventory:

```text
bitcraft-local-predeploy-3481b09f2da4-20260722-003042.sqlite
bitcraft-local-predeploy-d61564bcbadb-20260721-234306.sqlite
bitcraft-local-predeploy-d61564bcbadb-20260721-225250.sqlite
```

- [ ] **Step 2: Dry-run the guarded legacy prune**

Run over SSH with the candidate backup helper explicitly selected:

```bash
BACKUP_CRYPTO_HELPER=/opt/bitcraft-claim-monitor/releases/eeeeca70c3cbc9ad41b772bcbfbfdeb96905b35b/deploy/backup-crypto.mjs \
bash /opt/bitcraft-claim-monitor/releases/eeeeca70c3cbc9ad41b772bcbfbfdeb96905b35b/deploy/backup-bitcraft-monitor \
  --dry-run-prune
```

Expected: only predeploy backups older than the newest three are listed. Save the filenames and recovered-byte total in the release evidence; do not apply if the set differs.

- [ ] **Step 3: Apply the guarded prune**

Run:

```bash
BACKUP_CRYPTO_HELPER=/opt/bitcraft-claim-monitor/releases/eeeeca70c3cbc9ad41b772bcbfbfdeb96905b35b/deploy/backup-crypto.mjs \
bash /opt/bitcraft-claim-monitor/releases/eeeeca70c3cbc9ad41b772bcbfbfdeb96905b35b/deploy/backup-bitcraft-monitor \
  --apply-prune
```

Expected: it validates the newest retained legacy backup before removing only the dry-run candidates. Services remain healthy after the helper restores their prior states.

- [ ] **Step 4: Validate and remove the obsolete pre-staged bundle**

Without displaying the environment file, run:

```bash
set -euo pipefail
cd /var/backups/bitcraft-claim-monitor
sha256sum --check pre-staged-20260717-215819.sha256
test "$(sqlite3 pre-staged-20260717-215819.sqlite 'PRAGMA quick_check;')" = "ok"
test "$(sqlite3 bitcraft-local-predeploy-3481b09f2da4-20260722-003042.sqlite 'PRAGMA quick_check;')" = "ok"
rm -- \
  /var/backups/bitcraft-claim-monitor/pre-staged-20260717-215819.env \
  /var/backups/bitcraft-claim-monitor/pre-staged-20260717-215819.sha256 \
  /var/backups/bitcraft-claim-monitor/pre-staged-20260717-215819.sqlite
```

The removal targets are exactly:

```text
/var/backups/bitcraft-claim-monitor/pre-staged-20260717-215819.env
/var/backups/bitcraft-claim-monitor/pre-staged-20260717-215819.sha256
/var/backups/bitcraft-claim-monitor/pre-staged-20260717-215819.sqlite
```

This removes an obsolete plaintext database plus a plaintext environment backup from the backup directory. Do not use a wildcard and do not remove the protected current environment backup created in Task 2.

- [ ] **Step 5: Encrypt each retained plaintext backup one at a time**

Run this exact fail-closed conversion script:

```bash
set -euo pipefail
umask 077

backup_dir=/var/backups/bitcraft-claim-monitor
crypto=/opt/bitcraft-claim-monitor/releases/eeeeca70c3cbc9ad41b772bcbfbfdeb96905b35b/deploy/backup-crypto.mjs
key=/etc/bitcraft-claim-monitor/backup-encryption.key
encrypted_partial=""
validation_partial=""

cleanup() {
  [[ -z "$encrypted_partial" ]] || rm -f -- "$encrypted_partial"
  [[ -z "$validation_partial" ]] || rm -f -- "$validation_partial"
}
trap cleanup EXIT INT TERM

sources=(
  bitcraft-local-daily-20260723-023234.sqlite
  bitcraft-local-daily-20260724-023937.sqlite
  bitcraft-local-daily-20260725-023758.sqlite
  bitcraft-local-predeploy-3481b09f2da4-20260722-003042.sqlite
  bitcraft-local-predeploy-d61564bcbadb-20260721-234306.sqlite
  bitcraft-local-predeploy-d61564bcbadb-20260721-225250.sqlite
)

for name in "${sources[@]}"; do
  source_path="$backup_dir/$name"
  [[ -f "$source_path" && ! -L "$source_path" ]]
  if [[ "$name" =~ ^bitcraft-local-daily-([0-9]{8}-[0-9]{6})\.sqlite$ ]]; then
    target="$source_path.enc"
  elif [[ "$name" =~ ^bitcraft-local-predeploy-([0-9a-f]{12})-([0-9]{8}-[0-9]{6})\.sqlite$ ]]; then
    target="$backup_dir/bitcraft-local-migration-${BASH_REMATCH[1]}-${BASH_REMATCH[2]}.sqlite.enc"
  else
    printf 'Unexpected retained backup name: %s\n' "$name" >&2
    exit 1
  fi

  [[ ! -e "$target" ]]
  test "$(sqlite3 "$source_path" 'PRAGMA quick_check;')" = "ok"
  encrypted_partial="$target.partial"
  validation_partial="$backup_dir/.validation-${name}.$$"
  node "$crypto" encrypt "$source_path" "$encrypted_partial" "$key"
  node "$crypto" decrypt "$encrypted_partial" "$validation_partial" "$key"
  test "$(sqlite3 "$validation_partial" 'PRAGMA quick_check;')" = "ok"
  mv -- "$encrypted_partial" "$target"
  encrypted_partial=""
  rm -f -- "$validation_partial"
  validation_partial=""
  rm -- "$source_path"
  printf 'Converted and validated %s\n' "$name"
  df -h "$backup_dir"
done
```

Expected: each plaintext source is removed only after its encrypted replacement passes authenticated decryption and SQLite integrity validation. The trap removes incomplete outputs on failure.

- [ ] **Step 6: Re-inventory and verify production availability**

Run:

```bash
find /var/backups/bitcraft-claim-monitor -maxdepth 1 -type f \
  -printf '%f\t%s bytes\n' | sort
find /var/backups/bitcraft-claim-monitor -maxdepth 1 -type f \
  \( -name 'bitcraft-local-daily-*.sqlite' -o -name 'bitcraft-local-predeploy-*.sqlite' \) \
  -print -quit | grep -q . && exit 1 || true
systemctl is-active bitcraft-claim-monitor bitcraft-claim-monitor-worker
curl -fsS http://127.0.0.1:18430/api/local/health
```

Expected: retained daily/migration recovery points are encrypted; no `.env`, `.sha256`, ordinary daily/predeploy plaintext, or `pre-staged` files remain in the backup directory; and `0.44.0-beta.1` remains healthy.

### Task 5: Record verified readiness and the temporary exception

**Files:**

- Modify: `docs/release-readiness-audit.md`
- Modify: `docs/privacy-operations-runbook.md`
- Existing decision record: `docs/superpowers/specs/2026-07-25-temporary-vps-ledger-recovery-design.md`

- [ ] **Step 1: Update the release-readiness checklist from evidence**

In `docs/release-readiness-audit.md`:

- update the status date to `2026-07-25`;
- mark the user-confirmed ICO, solicitor, HostWorld encryption, Discord URL, and provider-disclosure checks complete;
- mark key provisioning and the Linux encrypted restore/replay proof complete only after Tasks 2 and 3 pass;
- replace the impossible claim of an independent current copy with a checked, explicitly temporary same-VPS full-backup risk acceptance linked to the design;
- record the exact remaining Proton Drive hardening action;
- record the plaintext-backup conversion and obsolete pre-staged-bundle removal results accurately.

- [ ] **Step 2: Update the privacy operations runbook**

In `docs/privacy-operations-runbook.md`:

- state that full-VPS backups are the temporary recovery copy and are not independent of the VPS/HostWorld failure domain;
- add the database-only and full-VPS restore distinctions from the design;
- state that off-VPS snapshots are deferred to the documented Proton Drive path;
- require removal of the temporary exception only after upload and restore verification pass;
- fix the mojibake in `Admin → Linked Accounts → Delete account data`.

- [ ] **Step 3: Inspect documentation changes only**

Run:

```powershell
git diff --check
git diff -- docs/release-readiness-audit.md docs/privacy-operations-runbook.md docs/superpowers/specs/2026-07-25-temporary-vps-ledger-recovery-design.md
git status --short
```

Expected: no code changes, no secret material, and no claim that the temporary VPS copy is independent.

- [ ] **Step 4: Commit the evidence-backed documentation**

```powershell
git add docs/release-readiness-audit.md docs/privacy-operations-runbook.md
git commit -m "docs: record privacy recovery readiness"
```

Expected: commit includes only the two evidence documents.

### Task 6: Push, open, review, and merge the recovery PR

**Files:**

- Branch: `codex/temporary-vps-ledger-recovery`
- Commits include: approved design, implementation plan, and evidence-backed documentation

- [ ] **Step 1: Rebase or merge the latest `origin/main` safely**

```powershell
git fetch origin main
git status --short
git merge --no-edit origin/main
```

Expected: no unresolved conflicts and no unrelated files.

- [ ] **Step 2: Push the branch**

```powershell
git push -u origin codex/temporary-vps-ledger-recovery
```

- [ ] **Step 3: Open a ready PR**

Create a PR titled:

```text
Document temporary VPS privacy recovery
```

The body must summarize the accepted limitation, completed key/restore evidence, plaintext-backup status, and deferred Proton Drive target. It must not contain secrets or private data.

- [ ] **Step 4: Review checks and merge**

Confirm required checks pass and the PR diff is documentation-only. Merge using the repository's normal merge method, then record the merge SHA.

### Task 7: Deploy the merged release through GitHub Actions

**Files:**

- Workflow: `.github/workflows/deploy-production.yml`
- Production updater: `/usr/local/bin/update-bitcraft-monitor`

- [ ] **Step 1: Verify `main` contains the expected release metadata**

```powershell
git fetch origin main
git show origin/main:apps/bitcraft-local/package.json
git show origin/main:CHANGELOG.md
```

Expected: version `0.45.0-beta.1` and the privacy release notes are present.

- [ ] **Step 2: Dispatch the protected workflow**

```powershell
gh workflow run deploy-production.yml `
  --repo Red463/bitcraft-claim-monitor `
  --ref main `
  -f force_database_backup=false
```

- [ ] **Step 3: Bind the run to the merge SHA**

Query the newest workflow run and confirm its `headSha` equals the merge SHA from Task 6. Cancel and stop if it targets another revision.

- [ ] **Step 4: Approve the production environment**

After the verify job passes, use the pending-deployment API to approve only the identified run and the `production` environment.

- [ ] **Step 5: Monitor with bounded polling**

Poll status every 15–30 seconds and report progress at least once per minute. Do not use a single long blocking watch. On failure, capture the workflow job and updater summary; do not immediately retry.

Expected: application tests, build, all deployment contract tests, systemd validation, and production deployment succeed.

### Task 8: Verify the production release and recovery controls

**Files:**

- Inspect: live health endpoints and legal pages
- Inspect: production service/key/ledger metadata
- Inspect: encrypted backup timer

- [ ] **Step 1: Verify public health**

```powershell
curl.exe -fsS https://app.timbersteeltrade.com/api/local/health
```

Expected: `"ok":true`, version `0.45.0-beta.1`, and a build ID matching the deployed merge SHA prefix.

- [ ] **Step 2: Verify public legal pages**

```powershell
curl.exe -fsSIL https://app.timbersteeltrade.com/terms
curl.exe -fsSIL https://app.timbersteeltrade.com/privacy
```

Expected: final HTTP status is `200` for both pages.

- [ ] **Step 3: Verify production services and metadata without secrets**

Run over SSH:

```bash
set -euo pipefail
readlink -f /opt/bitcraft-claim-monitor/current
systemctl is-active \
  bitcraft-claim-monitor \
  bitcraft-claim-monitor-worker \
  bitcraft-monitor-collector.timer \
  bitcraft-claim-monitor-backup.timer
systemctl is-enabled bitcraft-claim-monitor-backup.timer
stat -c '%n type=%F owner=%U group=%G mode=%a' \
  /etc/bitcraft-claim-monitor/privacy-ledger.key \
  /etc/bitcraft-claim-monitor/backup-encryption.key \
  /var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl
curl -fsS http://127.0.0.1:18430/api/local/health
```

Expected: the merged SHA is active; all units are active; the timer is enabled; metadata remains correct; local health reports `0.45.0-beta.1`.

- [ ] **Step 4: Create and validate one encrypted manual recovery point**

Run:

```bash
/usr/local/bin/backup-bitcraft-monitor manual --revision <MERGE_SHA>
```

Expected: the helper pauses only the worker/collector services, validates the source and decrypted backup with `quick_check`, publishes one `.sqlite.enc`, removes all plaintext partials, and restores prior service states.

- [ ] **Step 5: Final plaintext and secret-output audit**

Run:

```bash
find /var/backups/bitcraft-claim-monitor -maxdepth 1 -type f -name '*.partial' -print
find /var/backups/bitcraft-claim-monitor -maxdepth 1 -type f \
  \( -name 'bitcraft-local-daily-*.sqlite' -o -name 'bitcraft-local-predeploy-*.sqlite' \) -print
journalctl -u bitcraft-claim-monitor -u bitcraft-claim-monitor-worker \
  --since '15 minutes ago' --no-pager -p warning
```

Expected: no partials, no ordinary plaintext daily/predeploy backups, and no new service warnings. Do not display or search for the key contents.

- [ ] **Step 6: Record completion and the remaining hardening item**

Report:

- merged PR URL and merge SHA;
- successful workflow URL;
- deployed version/build ID;
- key and ledger metadata validation, without values;
- restore/replay and manual encrypted-backup evidence;
- exact plaintext-backup disposition, including removal of the obsolete pre-staged bundle;
- the accepted temporary same-VPS recovery limitation;
- Proton Drive off-VPS copying as the remaining hardening task.

If any deployment verification fails, report that release status accurately. The updater should leave or restore `0.44.0-beta.1`; do not claim deployment success until both local and public health prove `0.45.0-beta.1`.
