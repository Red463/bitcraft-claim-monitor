# VPS Staged Deployments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually approved GitHub production deployment that prepares immutable VPS releases while the current site stays live, cuts over with a brief restart, and automatically restores the previous release when health checks fail.

**Architecture:** Keep a source checkout and detached release worktrees under `/opt/bitcraft-claim-monitor`, with systemd executing through an atomic `current` symlink and persistent data remaining in `/var/lib/bitcraft-claim-monitor`. A manual GitHub Actions workflow verifies `main`, then calls a revision-pinned VPS updater through restricted SSH. Caddy retries safe requests during the short restart and returns an explicit maintenance response if the backend remains unavailable.

**Tech Stack:** Bash, Git worktrees, systemd, Caddy, GitHub Actions, Node.js 24, pnpm, SQLite, Node test runner.

## Global Constraints

- Production remains one Ubuntu VPS; do not introduce containers, an orchestrator, or a second live worker.
- Deployment requires both a manual `workflow_dispatch` run and approval of the GitHub `production` environment.
- Deploy only a full 40-character commit SHA that is reachable from `origin/main`.
- Keep the active release live during fetch, install, build, configuration validation, and database backup.
- Limit normal interruption to the final web-process restart.
- Never retry non-idempotent requests automatically.
- Never copy persistent data or `/etc/bitcraft-claim-monitor.env` into release directories.
- Roll back application code automatically, but never restore SQLite automatically.
- Database changes must remain compatible with the immediately previous release.
- Keep the active release and two recent inactive releases after successful cleanup.

---

### Task 1: Convert the updater to immutable staged releases

**Files:**
- Modify: `deploy/update-bitcraft-monitor`
- Modify: `scripts/test/deploy-update-script.test.mjs`
- Create: `scripts/test/deploy-update-integration.test.mjs`

**Interfaces:**
- Consumes: `--revision <40-char-sha>`, `/opt/bitcraft-claim-monitor/source`, `/opt/bitcraft-claim-monitor/releases`, `/opt/bitcraft-claim-monitor/current`, `/var/lib/bitcraft-claim-monitor`, and existing systemd service names.
- Produces: an atomic `current` symlink switch, an online pre-cutover backup, expected-version health validation, automatic code rollback, deployment locking, and three-release retention.
- Provides sourceable Bash functions `atomic_switch <release-path>`, `rollback_release <previous-path>`, and `prune_releases <active-path>`; execute `main` only when the script is run directly.

- [ ] **Step 1: Add failing staged-release boundary tests**

Extend `scripts/test/deploy-update-script.test.mjs` with:

```js
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
  assert.match(script, /prepare_release "\$release_dir"[\s\S]*validate_release_config "\$release_dir"[\s\S]*create_predeploy_backup[\s\S]*atomic_switch "\$release_dir"/);
  assert.doesNotMatch(script, /log "Stopping services"[\s\S]*Fetching latest code/);
});

test("VPS updater validates cutover and restores the previous release on failure", () => {
  assert.match(script, /expected_version/);
  assert.match(script, /rollback_release\(\)/);
  assert.match(script, /atomic_switch "\$previous_release"/);
  assert.match(script, /sqlite3[^\n]+\.backup/);
  assert.match(script, /restart_service "\$WEB_SERVICE"[\s\S]*wait_for_health "\$expected_version"[\s\S]*restart_service "\$WORKER_SERVICE"/);
});

test("VPS updater retains three releases only after success", () => {
  assert.match(script, /KEEP_RELEASES="\$\{KEEP_RELEASES:-3\}"/);
  assert.match(script, /prune_releases\(\)/);
  assert.match(script, /deployment_succeeded=1[\s\S]*prune_releases "\$release_dir"/);
});
```

Update the existing documentation assertion in this test file so it expects revision-pinned staged deployment language rather than the old in-place update commands.

- [ ] **Step 2: Add a failing Linux integration harness for symlink rollback**

Create `scripts/test/deploy-update-integration.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("../../deploy/update-bitcraft-monitor", import.meta.url);
const hasBash = process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;

test("atomic switch and rollback restore the previous release", { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-deploy-"));
  const releases = join(root, "releases");
  const previous = join(releases, "previous");
  const candidate = join(releases, "candidate");
  const current = join(root, "current");

  const harness = `
    set -euo pipefail
    source "$1"
    APP_ROOT="$2"
    CURRENT_LINK="$2/current"
    mkdir -p "$2/releases/previous" "$2/releases/candidate"
    ln -s "releases/previous" "$CURRENT_LINK"
    atomic_switch "$2/releases/candidate"
    [[ "$(readlink -f "$CURRENT_LINK")" == "$2/releases/candidate" ]]
    previous_release="$2/releases/previous"
    install_release_config() { return 0; }
    restart_service() { return 0; }
    wait_for_service() { return 0; }
    wait_for_health() { return 0; }
    rollback_release "$previous_release"
    [[ "$(readlink -f "$CURRENT_LINK")" == "$2/releases/previous" ]]
  `;

  try {
    const result = spawnSync("bash", ["-c", harness, "test", script.pathname, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run the deployment tests and verify RED**

Run:

```powershell
node --test scripts/test/deploy-update-script.test.mjs scripts/test/deploy-update-integration.test.mjs
```

Expected: boundary tests fail because the updater still uses one mutable checkout and stops services before preparation; the Linux integration test fails because `atomic_switch` and the source guard do not exist. On Windows, the integration test is skipped while boundary failures remain red.

- [ ] **Step 4: Implement revision parsing, release preparation, and sourceable helpers**

Replace the updater's directory variables and option parsing with:

```bash
APP_ROOT="${APP_ROOT:-/opt/bitcraft-claim-monitor}"
SOURCE_DIR="${SOURCE_DIR:-$APP_ROOT/source}"
RELEASES_DIR="${RELEASES_DIR:-$APP_ROOT/releases}"
CURRENT_LINK="${CURRENT_LINK:-$APP_ROOT/current}"
DATA_DIR="${DATA_DIR:-/var/lib/bitcraft-claim-monitor}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/bitcraft-claim-monitor}"
LOCK_FILE="${LOCK_FILE:-/run/lock/bitcraft-claim-monitor-deploy.lock}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
REVISION=""

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --revision)
        [[ $# -ge 2 ]] || { echo "--revision requires a value."; exit 2; }
        REVISION="$2"
        shift 2
        ;;
      --verbose) VERBOSE=1; shift ;;
      --no-public-check) SKIP_PUBLIC_CHECK=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) echo "Unknown option: $1"; usage; exit 2 ;;
    esac
  done

  if [[ ! "$REVISION" =~ ^[0-9a-f]{40}$ ]]; then
    echo "--revision must be a full 40-character lowercase Git commit SHA."
    exit 2
  fi
}
```

Update `usage` at the same time so the required revision and optional diagnostics flags are unambiguous:

```bash
usage() {
  cat <<USAGE
Usage: update-bitcraft-monitor --revision <full-sha> [--verbose] [--no-public-check]

  --revision <sha>  Deploy this full lowercase commit SHA from origin/main.
  --verbose         Stream install/build output while also logging it.
  --no-public-check Skip the public HTTPS check after local health passes.
USAGE
}
```

Add these helpers above `main`:

```bash
atomic_switch() {
  local release_path="$1"
  local relative_target="releases/$(basename "$release_path")"
  local pending_link="$APP_ROOT/.current-$$"
  ln -s "$relative_target" "$pending_link"
  mv -Tf "$pending_link" "$CURRENT_LINK"
}

restart_service() {
  systemctl restart "$1"
}

prepare_release() {
  local release_dir="$1"
  install -d -o "$RUN_USER" -g "$RUN_USER" "$RELEASES_DIR"
  if [[ ! -d "$release_dir" ]]; then
    run_logged "Creating release worktree" sudo -u "$RUN_USER" git -C "$SOURCE_DIR" worktree add --detach "$release_dir" "$REVISION"
  fi
  run_logged "Installing dependencies" sudo -u "$RUN_USER" bash -lc "cd '$release_dir' && corepack pnpm install --frozen-lockfile"
  run_logged "Building app" sudo -u "$RUN_USER" bash -lc "cd '$release_dir' && corepack pnpm --filter @workspace/bitcraft-local run build"
}

create_predeploy_backup() {
  local database="$DATA_DIR/bitcraft-local.sqlite"
  [[ -f "$database" ]] || return 0
  install -d -o "$RUN_USER" -g "$RUN_USER" -m 0700 "$BACKUP_DIR"
  local backup="$BACKUP_DIR/bitcraft-local-predeploy-${REVISION:0:12}-$(date +%Y%m%d-%H%M%S).sqlite"
  run_logged "Creating pre-deploy database backup" sudo -u "$RUN_USER" sqlite3 "$database" ".backup '$backup'"
}

rollback_release() {
  local previous_release="$1"
  [[ -n "$previous_release" && -d "$previous_release" ]] || return 1
  local status=0
  log "Rolling back release"
  install_release_config "$previous_release" || status=1
  atomic_switch "$previous_release" || return 1
  restart_service "$WEB_SERVICE" || status=1
  wait_for_service "$WEB_SERVICE" "web service" || status=1
  wait_for_health "" || status=1
  restart_service "$WORKER_SERVICE" || status=1
  wait_for_service "$WORKER_SERVICE" "worker service" || status=1
  return "$status"
}
```

Replace `wait_for_health` and make `public_http_check` fail the deployment on a non-2xx/3xx result:

```bash
wait_for_health() {
  local expected_version="${1:-}"
  local response

  printf "Waiting for web health at %s" "$HEALTH_URL"
  for _ in {1..12}; do
    if response="$(curl -fsS --connect-timeout 1 --max-time 10 "$HEALTH_URL" 2>>"$LOG_FILE")" \
      && node -e '
        const data = JSON.parse(process.argv[1]);
        const expected = process.argv[2];
        const actual = data.version || data.appVersion || data.release?.version || "";
        process.exit(data.ok === true && (!expected || actual === expected) ? 0 : 1);
      ' "$response" "$expected_version"; then
      printf " ok\n"
      HEALTH_SUMMARY="$(health_summary "$response")"
      printf "%s\n" "$HEALTH_SUMMARY"
      log_detail "Health response: $response"
      return 0
    fi
    printf "."
    sleep 2
  done

  printf " failed\n"
  curl -v --max-time 5 "$HEALTH_URL" >>"$LOG_FILE" 2>&1 || true
  print_log_tail
  return 1
}

public_http_check() {
  local status final_url
  if [[ "$SKIP_PUBLIC_CHECK" == "1" ]]; then
    PUBLIC_SUMMARY="Public: skipped (--no-public-check)"
    printf "%s\n" "$PUBLIC_SUMMARY"
    return 0
  fi

  status="$(curl -fsSIL --max-time 10 -o /dev/null -w "%{http_code}" "$PUBLIC_URL" 2>>"$LOG_FILE")" || {
    PUBLIC_SUMMARY="Public: check failed status=none url=$PUBLIC_URL"
    printf "%s\n" "$PUBLIC_SUMMARY"
    return 1
  }
  final_url="$(curl -fsSIL --max-time 10 -o /dev/null -w "%{url_effective}" "$PUBLIC_URL" 2>>"$LOG_FILE")" || {
    PUBLIC_SUMMARY="Public: check failed status=$status url=$PUBLIC_URL"
    printf "%s\n" "$PUBLIC_SUMMARY"
    return 1
  }
  if [[ "$status" =~ ^[23] ]]; then
    PUBLIC_SUMMARY="Public: ok status=$status url=$final_url"
    printf "%s\n" "$PUBLIC_SUMMARY"
    return 0
  fi
  PUBLIC_SUMMARY="Public: check failed status=${status:-none} url=$final_url"
  printf "%s\n" "$PUBLIC_SUMMARY"
  return 1
}
```

- [ ] **Step 5: Implement the cutover, rollback, and retention sequence**

Replace the stop-first main flow with a guarded `main` function using this order:

```bash
main() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "Run this script as root."; exit 1; }
  parse_args "$@"
  exec 9>"$LOCK_FILE"
  flock -n 9 || { echo "Another deployment is already running."; exit 1; }
  : >"$LOG_FILE"
  printf "Full log: %s\n" "$LOG_FILE"
  local deploy_started prepare_finished cutover_started cutover_finished
  deploy_started="$(date +%s)"

  install -d -o "$RUN_USER" -g "$RUN_USER" "$SOURCE_DIR" "$RELEASES_DIR"
  run_logged "Fetching latest code" sudo -u "$RUN_USER" git -C "$SOURCE_DIR" fetch --prune origin main
  sudo -u "$RUN_USER" git -C "$SOURCE_DIR" merge-base --is-ancestor "$REVISION" origin/main || {
    echo "Requested revision is not reachable from origin/main."
    exit 1
  }

  local release_dir="$RELEASES_DIR/$REVISION"
  local previous_release=""
  previous_release="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
  prepare_release "$release_dir"
  local expected_version
  expected_version="$(node -p "require('$release_dir/apps/bitcraft-local/package.json').version")"
  validate_release_config "$release_dir"
  create_predeploy_backup
  install_release_config "$release_dir"
  prepare_finished="$(date +%s)"
  cutover_started="$prepare_finished"
  atomic_switch "$release_dir"

  if ! restart_service "$WEB_SERVICE" \
    || ! wait_for_service "$WEB_SERVICE" "web service" \
    || ! wait_for_health "$expected_version" \
    || ! restart_service "$WORKER_SERVICE" \
    || ! wait_for_service "$WORKER_SERVICE" "worker service" \
    || ! public_http_check; then
    local candidate_health="$HEALTH_SUMMARY"
    local candidate_public="$PUBLIC_SUMMARY"
    local rollback_summary
    if rollback_release "$previous_release"; then
      rollback_summary="restored $(basename "$previous_release") successfully"
    else
      rollback_summary="failed; inspect systemd and $LOG_FILE immediately"
    fi
    cutover_finished="$(date +%s)"
    print_failure_summary "$previous_release" "$release_dir" "$expected_version" \
      "$((prepare_finished - deploy_started))" "$((cutover_finished - cutover_started))" \
      "$candidate_health" "$candidate_public" "$rollback_summary"
    return 1
  fi

  deployment_succeeded=1
  cutover_finished="$(date +%s)"
  install -m 0755 "$release_dir/deploy/update-bitcraft-monitor" /usr/local/bin/update-bitcraft-monitor
  prune_releases "$release_dir"
  print_summary "$previous_release" "$release_dir" "$expected_version" \
    "$((prepare_finished - deploy_started))" "$((cutover_finished - cutover_started))"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
```

Add these helpers above `main`:

```bash
validate_release_config() {
  local release_dir="$1"
  run_logged "Validating systemd units" systemd-analyze verify \
    "$release_dir/deploy/bitcraft-claim-monitor.service" \
    "$release_dir/deploy/bitcraft-claim-monitor-worker.service" \
    "$release_dir/deploy/bitcraft-monitor-collector.service" \
    "$release_dir/deploy/bitcraft-monitor-collector.timer"
  run_logged "Validating Caddy configuration" caddy validate \
    --config "$release_dir/deploy/Caddyfile.example"
}

install_release_config() {
  local release_dir="$1"
  install -m 0644 "$release_dir/deploy/bitcraft-claim-monitor.service" \
    /etc/systemd/system/bitcraft-claim-monitor.service
  install -m 0644 "$release_dir/deploy/bitcraft-claim-monitor-worker.service" \
    /etc/systemd/system/bitcraft-claim-monitor-worker.service
  install -m 0644 "$release_dir/deploy/bitcraft-monitor-collector.service" \
    /etc/systemd/system/bitcraft-monitor-collector.service
  install -m 0644 "$release_dir/deploy/bitcraft-monitor-collector.timer" \
    /etc/systemd/system/bitcraft-monitor-collector.timer
  install -m 0644 "$release_dir/deploy/Caddyfile.example" /etc/caddy/Caddyfile
  systemctl daemon-reload
  systemctl enable "$WEB_SERVICE" "$WORKER_SERVICE" bitcraft-monitor-collector.timer >>"$LOG_FILE" 2>&1
  systemctl reload caddy
}

prune_releases() {
  local active_path
  active_path="$(readlink -f "$1")"
  local keep_inactive=$((KEEP_RELEASES - 1))
  local kept=0
  local entry path
  local -a candidates=()

  while IFS= read -r entry; do
    candidates+=("${entry#* }")
  done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr)

  for path in "${candidates[@]}"; do
    [[ "$(readlink -f "$path")" == "$active_path" ]] && continue
    if (( kept < keep_inactive )); then
      ((kept += 1))
      continue
    fi
    run_logged "Removing old release $(basename "$path")" \
      git -C "$SOURCE_DIR" worktree remove --force "$path"
  done
  git -C "$SOURCE_DIR" worktree prune
}

print_summary() {
  local previous_release="$1"
  local release_dir="$2"
  local expected_version="$3"
  local preparation_seconds="$4"
  local cutover_seconds="$5"
  printf 'Deployment complete.\n'
  printf 'Version: %s\n' "$expected_version"
  printf 'Requested revision: %s\n' "$REVISION"
  printf 'Previous revision: %s\n' "$(basename "${previous_release:-none}")"
  printf 'Preparation: %ss\n' "$preparation_seconds"
  printf 'Cutover: %ss\n' "$cutover_seconds"
  service_summary "$WEB_SERVICE" "Web service"
  service_summary "$WORKER_SERVICE" "Worker service"
  printf '%s\n' "$HEALTH_SUMMARY"
  printf '%s\n' "$PUBLIC_SUMMARY"
  printf 'Rollback: not needed\n'
  printf 'Active release: %s\n' "$release_dir"
  printf 'Database backup directory: %s\n' "$BACKUP_DIR"
  printf 'Full log: %s\n' "$LOG_FILE"
}

print_failure_summary() {
  local previous_release="$1"
  local release_dir="$2"
  local expected_version="$3"
  local preparation_seconds="$4"
  local cutover_seconds="$5"
  local candidate_health="$6"
  local candidate_public="$7"
  local rollback_summary="$8"
  printf 'Deployment failed.\n'
  printf 'Version: %s\n' "$expected_version"
  printf 'Requested revision: %s\n' "$REVISION"
  printf 'Previous revision: %s\n' "$(basename "${previous_release:-none}")"
  printf 'Preparation: %ss\n' "$preparation_seconds"
  printf 'Cutover and rollback: %ss\n' "$cutover_seconds"
  service_summary "$WEB_SERVICE" "Web service"
  service_summary "$WORKER_SERVICE" "Worker service"
  printf 'Candidate %s\n' "$candidate_health"
  printf 'Candidate %s\n' "$candidate_public"
  printf 'Rollback: %s\n' "$rollback_summary"
  printf 'Active release: %s\n' "$(readlink -f "$CURRENT_LINK" 2>/dev/null || printf unknown)"
  printf 'Failed release retained: %s\n' "$release_dir"
  printf 'Full log: %s\n' "$LOG_FILE"
}
```

Do not call `prune_releases` from a failure path. This keeps a failed candidate available for diagnosis and preserves the previous release for rollback.

- [ ] **Step 6: Run the deployment tests and verify GREEN**

Run:

```powershell
node --test scripts/test/deploy-update-script.test.mjs scripts/test/deploy-update-integration.test.mjs
```

Expected: all boundary tests pass; the integration test passes on Linux and reports one intentional skip on Windows.

- [ ] **Step 7: Commit the staged updater**

```powershell
git add -- deploy/update-bitcraft-monitor scripts/test/deploy-update-script.test.mjs scripts/test/deploy-update-integration.test.mjs
git commit -m "feat: stage VPS releases before cutover"
```

---

### Task 2: Point runtime services at `current` and mask brief restarts

**Files:**
- Modify: `deploy/bitcraft-claim-monitor.service`
- Modify: `deploy/bitcraft-claim-monitor-worker.service`
- Modify: `deploy/bitcraft-monitor-collector.service`
- Modify: `deploy/Caddyfile.example`
- Create: `scripts/test/deploy-runtime-config.test.mjs`

**Interfaces:**
- Consumes: `/opt/bitcraft-claim-monitor/current` created by Task 1.
- Produces: systemd units that follow the active release, five-second Caddy retry behaviour for safe requests, and explicit browser/API maintenance responses after retry exhaustion.

- [ ] **Step 1: Add failing runtime-configuration tests**

Create `scripts/test/deploy-runtime-config.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const web = readFileSync(new URL("../../deploy/bitcraft-claim-monitor.service", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../deploy/bitcraft-claim-monitor-worker.service", import.meta.url), "utf8");
const collector = readFileSync(new URL("../../deploy/bitcraft-monitor-collector.service", import.meta.url), "utf8");
const caddy = readFileSync(new URL("../../deploy/Caddyfile.example", import.meta.url), "utf8");

test("production services execute through the active release symlink", () => {
  for (const unit of [web, worker, collector]) {
    assert.match(unit, /\/opt\/bitcraft-claim-monitor\/current\//);
    assert.doesNotMatch(unit, /\/opt\/bitcraft-claim-monitor\/apps\//);
  }
});

test("Caddy waits through brief safe-request restarts", () => {
  assert.match(caddy, /lb_try_duration 5s/);
  assert.match(caddy, /lb_try_interval 250ms/);
  assert.match(caddy, /lb_retry_match[\s\S]*method GET HEAD/);
  assert.doesNotMatch(caddy, /lb_retry_match[\s\S]*(POST|PUT|PATCH|DELETE)/);
});

test("Caddy returns explicit browser and API maintenance responses", () => {
  assert.match(caddy, /handle_errors/);
  assert.match(caddy, /@api path \/api\/\*/);
  assert.match(caddy, /application\/json/);
  assert.match(caddy, /Claim Monitor is updating/);
  assert.match(caddy, /503/);
});
```

- [ ] **Step 2: Run the runtime tests and verify RED**

Run:

```powershell
node --test scripts/test/deploy-runtime-config.test.mjs
```

Expected: FAIL because units use the mutable checkout and Caddy has no retry or maintenance handling.

- [ ] **Step 3: Update systemd paths and Caddy handling**

Apply these exact path changes:

```ini
# deploy/bitcraft-claim-monitor.service
WorkingDirectory=/opt/bitcraft-claim-monitor/current/apps/bitcraft-local
ExecStart=/usr/bin/node /opt/bitcraft-claim-monitor/current/apps/bitcraft-local/server.mjs

# deploy/bitcraft-claim-monitor-worker.service
WorkingDirectory=/opt/bitcraft-claim-monitor/current/apps/bitcraft-local
ExecStart=/usr/bin/node /opt/bitcraft-claim-monitor/current/apps/bitcraft-local/worker.mjs

# deploy/bitcraft-monitor-collector.service
ExecStart=/usr/bin/node /opt/bitcraft-claim-monitor/current/deploy/collect-server-health.mjs
```

Change the canonical Caddy site to:

```caddyfile
app.timbersteeltrade.com {
	encode zstd gzip
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		X-Frame-Options SAMEORIGIN
	}
	reverse_proxy 127.0.0.1:18430 {
		lb_try_duration 5s
		lb_try_interval 250ms
		lb_retry_match {
			method GET HEAD
		}
	}
	handle_errors {
		@api path /api/*
		handle @api {
			header Content-Type application/json
			respond `{"error":"Claim Monitor is updating. Retry in a few seconds."}` 503
		}
		respond "Claim Monitor is updating. Please retry in a few seconds." 503
	}
}
```

Keep the existing legacy-host redirects unchanged.

- [ ] **Step 4: Run the runtime tests and verify GREEN**

Run:

```powershell
node --test scripts/test/deploy-runtime-config.test.mjs
```

Expected: all runtime configuration tests pass.

- [ ] **Step 5: Commit runtime cutover configuration**

```powershell
git add -- deploy/bitcraft-claim-monitor.service deploy/bitcraft-claim-monitor-worker.service deploy/bitcraft-monitor-collector.service deploy/Caddyfile.example scripts/test/deploy-runtime-config.test.mjs
git commit -m "feat: route production through active releases"
```

---

### Task 3: Add the manually approved GitHub deployment workflow

**Files:**
- Create: `.github/workflows/deploy-production.yml`
- Create: `scripts/test/deploy-production-workflow.test.mjs`

**Interfaces:**
- Consumes: GitHub `production` environment secrets `VPS_HOST`, `VPS_DEPLOY_USER`, `VPS_SSH_PRIVATE_KEY`, and `VPS_KNOWN_HOSTS`.
- Produces: a manual, serialized deployment of the verified `github.sha` through `/usr/local/bin/update-bitcraft-monitor --revision <sha>`.

- [ ] **Step 1: Add a failing workflow contract test**

Create `scripts/test/deploy-production-workflow.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/deploy-production.yml", import.meta.url), "utf8");

test("production deployment is manual, main-only, and serialized", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /concurrency:[\s\S]*group: production/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("deployment credentials are gated behind verification and production approval", () => {
  assert.match(workflow, /verify:/);
  assert.match(workflow, /pnpm --filter @workspace\/bitcraft-local test/);
  assert.match(workflow, /pnpm --filter @workspace\/bitcraft-local run build/);
  assert.match(workflow, /deploy:[\s\S]*needs: verify/);
  assert.match(workflow, /environment: production/);
});

test("workflow pins host identity and deploys the verified commit with system SSH", () => {
  assert.match(workflow, /VPS_KNOWN_HOSTS/);
  assert.match(workflow, /chmod 600.*known_hosts/);
  assert.match(workflow, /update-bitcraft-monitor --revision.*GITHUB_SHA/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(workflow, /appleboy|ssh-action/);
});
```

- [ ] **Step 2: Run the workflow test and verify RED**

Run:

```powershell
node --test scripts/test/deploy-production-workflow.test.mjs
```

Expected: FAIL with `ENOENT` because the workflow does not exist.

- [ ] **Step 3: Create the production workflow**

Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy production

on:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: production
  cancel-in-progress: false

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Require main
        run: test "$GITHUB_REF" = "refs/heads/main"
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Enable Corepack
        run: corepack enable
      - name: Install dependencies
        run: corepack pnpm install --frozen-lockfile
      - name: Test application
        run: corepack pnpm --filter @workspace/bitcraft-local test
      - name: Build application
        run: corepack pnpm --filter @workspace/bitcraft-local run build
      - name: Test deployment contracts
        run: node --test scripts/test/deploy-*.test.mjs

  deploy:
    needs: verify
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Configure pinned SSH identity
        env:
          VPS_SSH_PRIVATE_KEY: ${{ secrets.VPS_SSH_PRIVATE_KEY }}
          VPS_KNOWN_HOSTS: ${{ secrets.VPS_KNOWN_HOSTS }}
        run: |
          install -m 700 -d "$HOME/.ssh"
          printf '%s\n' "$VPS_SSH_PRIVATE_KEY" > "$HOME/.ssh/id_ed25519"
          chmod 600 "$HOME/.ssh/id_ed25519"
          printf '%s\n' "$VPS_KNOWN_HOSTS" > "$HOME/.ssh/known_hosts"
          chmod 600 "$HOME/.ssh/known_hosts"
      - name: Deploy verified revision
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_DEPLOY_USER: ${{ secrets.VPS_DEPLOY_USER }}
        run: |
          DEPLOY_OUTPUT="$(ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -- \
            "$VPS_DEPLOY_USER@$VPS_HOST" \
            "sudo /usr/local/bin/update-bitcraft-monitor --revision '$GITHUB_SHA'")"
          printf '%s\n' "$DEPLOY_OUTPUT"
          {
            printf '## Production deployment\n\n'
            printf 'Deployed `%s` to `%s`.\n\n' "$GITHUB_SHA" "$VPS_HOST"
            printf '```text\n%s\n```\n' "$DEPLOY_OUTPUT"
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 4: Run the workflow test and verify GREEN**

Run:

```powershell
node --test scripts/test/deploy-production-workflow.test.mjs
```

Expected: all workflow contract tests pass.

- [ ] **Step 5: Commit the workflow**

```powershell
git add -- .github/workflows/deploy-production.yml scripts/test/deploy-production-workflow.test.mjs
git commit -m "feat: add approved production deployments"
```

---

### Task 4: Document bootstrap, approval, rollback, and routine operation

**Files:**
- Modify: `DEPLOYMENT.md`
- Modify: `README.md:405-426`
- Modify: `scripts/test/deploy-update-script.test.mjs`

**Interfaces:**
- Consumes: the updater, runtime configuration, and workflow from Tasks 1–3.
- Produces: exact one-time VPS migration commands, GitHub environment setup, routine deployment instructions, rollback diagnostics, and database-compatibility guidance.

- [ ] **Step 1: Add failing documentation assertions**

Add to `scripts/test/deploy-update-script.test.mjs`:

```js
test("deployment docs describe the staged layout and manual GitHub release path", () => {
  assert.match(deployment, /\/opt\/bitcraft-claim-monitor\/source/);
  assert.match(deployment, /\/opt\/bitcraft-claim-monitor\/releases/);
  assert.match(deployment, /current.*symbolic link/i);
  assert.match(deployment, /Deploy production/);
  assert.match(deployment, /production environment/);
  assert.match(deployment, /required reviewer/);
  assert.match(deployment, /VPS_KNOWN_HOSTS/);
  assert.match(deployment, /automatic rollback/i);
  assert.match(deployment, /backward compatible/i);
  assert.doesNotMatch(readme, /cd \/opt\/bitcraft-claim-monitor[\s\S]*update-bitcraft-monitor\n/);
});
```

- [ ] **Step 2: Run the documentation boundary test and verify RED**

Run:

```powershell
node --test scripts/test/deploy-update-script.test.mjs
```

Expected: FAIL because the documentation still instructs users to SSH and run the in-place updater.

- [ ] **Step 3: Rewrite the deployment bootstrap and update sections**

Update `DEPLOYMENT.md` with these exact operational sections:

```markdown
## One-time staged-release migration

1. Create and verify an off-server SQLite backup.
2. Stop the web and worker for this one supervised migration only.
3. Move the existing checkout aside, create `/opt/bitcraft-claim-monitor/{source,releases}`, and move the checkout into `source`.
4. Fetch `origin/main`, create a detached worktree in `releases/<full-sha>`, install dependencies, and build it as `bitcraft`.
5. Create `current` as a relative symbolic link to that release.
6. Install the updated units, updater, Caddyfile, deployment account, SSH key, and restricted sudo rule.
7. Validate Caddy and systemd before starting services.
8. Run a supervised forward deployment and rollback test.

## Routine production deployment

1. Merge the reviewed pull request into `main`.
2. Open GitHub Actions and run **Deploy production** from `main`.
3. Review and approve the pending `production` environment deployment.
4. Follow the GitHub summary until health checks complete.

Routine deployment does not require an interactive SSH session.
```

Immediately after that outline, add the supervised migration commands below. Run them from an existing root SSH session only after copying the dated SQLite backup off the VPS:

```bash
set -euo pipefail
BACKUP_STAMP="$(date +%Y%m%d-%H%M%S)"
install -d -o bitcraft -g bitcraft -m 0700 /var/backups/bitcraft-claim-monitor
sudo -u bitcraft sqlite3 /var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite \
  ".backup '/var/backups/bitcraft-claim-monitor/pre-staged-$BACKUP_STAMP.sqlite'"
install -m 0600 /etc/bitcraft-claim-monitor.env \
  "/var/backups/bitcraft-claim-monitor/pre-staged-$BACKUP_STAMP.env"
sha256sum \
  "/var/backups/bitcraft-claim-monitor/pre-staged-$BACKUP_STAMP.sqlite" \
  "/var/backups/bitcraft-claim-monitor/pre-staged-$BACKUP_STAMP.env" \
  | tee "/var/backups/bitcraft-claim-monitor/pre-staged-$BACKUP_STAMP.sha256"
printf '%s\n' "$BACKUP_STAMP" >/root/bitcraft-migration-backup-stamp
```

From the administrator workstation, copy all three files into an encrypted local backup location and verify the checksum before proceeding:

```powershell
$VpsHost = Read-Host 'VPS SSH hostname or IP address'
$Stamp = ssh "root@$VpsHost" 'cat /root/bitcraft-migration-backup-stamp'
scp "root@${VpsHost}:/var/backups/bitcraft-claim-monitor/pre-staged-$Stamp.sqlite" .
scp "root@${VpsHost}:/var/backups/bitcraft-claim-monitor/pre-staged-$Stamp.env" .
scp "root@${VpsHost}:/var/backups/bitcraft-claim-monitor/pre-staged-$Stamp.sha256" .
Get-FileHash -Algorithm SHA256 "pre-staged-$Stamp.sqlite", "pre-staged-$Stamp.env"
Get-Content "pre-staged-$Stamp.sha256"
```

The two PowerShell hash values must match the corresponding values in the checksum file. Treat the `.env` copy as a secret and keep it encrypted.

Then perform the layout migration on the VPS:

```bash
set -euo pipefail
systemctl stop bitcraft-claim-monitor bitcraft-claim-monitor-worker bitcraft-monitor-collector.timer

test -d /opt/bitcraft-claim-monitor/.git
test ! -e /opt/bitcraft-claim-monitor-legacy-source
mv /opt/bitcraft-claim-monitor /opt/bitcraft-claim-monitor-legacy-source
install -d -o bitcraft -g bitcraft /opt/bitcraft-claim-monitor
mv /opt/bitcraft-claim-monitor-legacy-source /opt/bitcraft-claim-monitor/source
install -d -o bitcraft -g bitcraft /opt/bitcraft-claim-monitor/releases
chown -R bitcraft:bitcraft /opt/bitcraft-claim-monitor/source /opt/bitcraft-claim-monitor/releases

sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source fetch --prune origin main
REVISION="$(sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source rev-parse origin/main)"
sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source worktree add --detach \
  "/opt/bitcraft-claim-monitor/releases/$REVISION" "$REVISION"
sudo -u bitcraft bash -lc \
  "cd '/opt/bitcraft-claim-monitor/releases/$REVISION' && corepack pnpm install --frozen-lockfile"
sudo -u bitcraft bash -lc \
  "cd '/opt/bitcraft-claim-monitor/releases/$REVISION' && corepack pnpm --filter @workspace/bitcraft-local run build"
ln -s "releases/$REVISION" /opt/bitcraft-claim-monitor/current

RELEASE="/opt/bitcraft-claim-monitor/releases/$REVISION"
install -m 0644 "$RELEASE/deploy/bitcraft-claim-monitor.service" /etc/systemd/system/
install -m 0644 "$RELEASE/deploy/bitcraft-claim-monitor-worker.service" /etc/systemd/system/
install -m 0644 "$RELEASE/deploy/bitcraft-monitor-collector.service" /etc/systemd/system/
install -m 0644 "$RELEASE/deploy/bitcraft-monitor-collector.timer" /etc/systemd/system/
install -m 0755 "$RELEASE/deploy/update-bitcraft-monitor" /usr/local/bin/update-bitcraft-monitor
install -m 0644 "$RELEASE/deploy/Caddyfile.example" /etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable bitcraft-claim-monitor bitcraft-claim-monitor-worker bitcraft-monitor-collector.timer
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl start bitcraft-claim-monitor
curl --fail --silent --show-error http://127.0.0.1:18430/api/local/health
systemctl start bitcraft-claim-monitor-worker bitcraft-monitor-collector.timer
systemctl is-active --quiet bitcraft-claim-monitor bitcraft-claim-monitor-worker bitcraft-monitor-collector.timer
```

Add a separate deployment-account section. Generate a dedicated Ed25519 key on the administrator workstation with `ssh-keygen -t ed25519 -f ~/.ssh/bitcraft-production-deploy -C bitcraft-production-deploy`, copy only its `.pub` file to `/tmp/bitcraft-production-deploy.pub`, then run on the VPS:

```bash
set -euo pipefail
id deploy >/dev/null 2>&1 || useradd --system --create-home \
  --home-dir /var/lib/bitcraft-deploy --shell /bin/bash deploy
install -d -o deploy -g deploy -m 0700 /var/lib/bitcraft-deploy/.ssh
install -o deploy -g deploy -m 0600 /tmp/bitcraft-production-deploy.pub \
  /var/lib/bitcraft-deploy/.ssh/authorized_keys
cat >/etc/sudoers.d/bitcraft-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/local/bin/update-bitcraft-monitor --revision *
EOF
chmod 0440 /etc/sudoers.d/bitcraft-deploy
visudo -cf /etc/sudoers.d/bitcraft-deploy
rm /tmp/bitcraft-production-deploy.pub
```

State that the updater rejects extra arguments and accepts only a full lowercase 40-character SHA reachable from `origin/main`; the deploy account has no other passwordless sudo command. Recommend limiting SSH ingress to the administrator's and GitHub-hosted runner's reachable addresses where operationally practical.

Add exact repository setup commands from authenticated GitHub CLI PowerShell on the administrator workstation. First verify the VPS host-key fingerprints out of band, then save the verified `ssh-keyscan` output rather than accepting a new key during deployment:

```powershell
$VpsHost = Read-Host 'VPS SSH hostname or IP address'
ssh-keyscan -H $VpsHost | Set-Content -Encoding ascii bitcraft-production-known-hosts
ssh-keygen -lf bitcraft-production-known-hosts
gh api --method PUT repos/Red463/bitcraft-claim-monitor/environments/production
gh secret set VPS_HOST --env production --body $VpsHost
gh secret set VPS_DEPLOY_USER --env production --body 'deploy'
Get-Content -Raw "$HOME/.ssh/bitcraft-production-deploy" | gh secret set VPS_SSH_PRIVATE_KEY --env production
Get-Content -Raw bitcraft-production-known-hosts | gh secret set VPS_KNOWN_HOSTS --env production
Remove-Item bitcraft-production-known-hosts
```

Then document these GitHub UI steps exactly: open **Settings → Environments → production → Deployment protection rules**, enable **Required reviewers**, select the production approver, disable self-approval when another maintainer is available, and save. Open **Deployment branches and tags**, choose **Selected branches and tags**, and allow only `main`.

Document the supervised rollback drill after migration:

```bash
PREVIOUS="$(readlink -f /opt/bitcraft-claim-monitor/current)"
/usr/local/bin/update-bitcraft-monitor --revision "$(git -C /opt/bitcraft-claim-monitor/source rev-parse origin/main)"
test "$(readlink -f /opt/bitcraft-claim-monitor/current)" = "$PREVIOUS"
```

Explain that when `origin/main` already equals the bootstrapped release this validates an idempotent deployment, while automatic rollback is exercised by the integration test and should be observed during the first real subsequent release. Document `sudo /usr/local/bin/update-bitcraft-monitor --revision "$FULL_SHA"` as a break-glass administrator command only, with `FULL_SHA` obtained from `git -C /opt/bitcraft-claim-monitor/source rev-parse origin/main`.

Replace the README's current SSH update block with a concise link to the manual GitHub workflow and staged-release runbook.

- [ ] **Step 4: Run the documentation test and verify GREEN**

Run:

```powershell
node --test scripts/test/deploy-update-script.test.mjs
```

Expected: all deployment documentation tests pass.

- [ ] **Step 5: Commit the runbook**

```powershell
git add -- DEPLOYMENT.md README.md scripts/test/deploy-update-script.test.mjs
git commit -m "docs: add staged deployment runbook"
```

---

### Task 5: Complete repository and production-readiness verification

**Files:**
- Verify only; no production file changes expected.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4.
- Produces: local verification evidence and a precise list of one-time VPS/GitHub actions that remain external.

- [ ] **Step 1: Run all deployment contract tests**

Run:

```powershell
node --test scripts/test/deploy-*.test.mjs
```

Expected: all deployment boundary tests pass; the Bash integration test is skipped only on Windows.

- [ ] **Step 2: Run the full application test suite**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failures.

- [ ] **Step 3: Run the production build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 4: Inspect final repository state**

Run:

```powershell
git diff --check
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted implementation files, and only the staged-deployment commits appear above `origin/main`.

- [ ] **Step 5: Record external verification still required**

The handoff must state that these cannot be completed locally and remain required before routine production use:

```text
- Create the GitHub production environment, required reviewer, and four environment secrets.
- Perform the one-time supervised VPS directory migration.
- Run caddy validate against /etc/caddy/Caddyfile.
- Run systemd-analyze verify against the installed units.
- Perform one successful deployment and one forced-failure rollback test.
- Confirm the public site returns normally during a one-to-three-second web restart.
```
