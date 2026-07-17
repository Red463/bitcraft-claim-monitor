# Deploying BitCraft Claim Monitor to an Ubuntu VPS

This runbook covers the production Hostworld Ubuntu VPS. Production uses Node.js 24, pnpm, systemd, Caddy, and SQLite. Routine releases are started manually from GitHub and require approval; they do not require an interactive SSH session.

## Production layout

Application releases are immutable Git worktrees:

```text
/opt/bitcraft-claim-monitor/
  source/                    Git checkout used only to fetch commits
  releases/
    <full-commit-sha>/       Detached, built release worktree
  current -> releases/<sha>  Relative symbolic link used by systemd
```

Persistent state and secrets remain outside every release:

```text
/var/lib/bitcraft-claim-monitor/   SQLite, branding and monitoring data
/var/backups/bitcraft-claim-monitor/
/etc/bitcraft-claim-monitor.env   Production secrets
```

The updater keeps the active release and two recent inactive releases. It never copies persistent data or the environment file into a release directory.

## Prerequisites

The VPS needs:

- Ubuntu 22.04 or later.
- Node.js 24 or later with Corepack enabled.
- Git, Caddy, SQLite, `sudo`, `flock`, and systemd.
- Ports 80 and 443 open publicly; the Node application remains bound to `127.0.0.1:18430`.
- An existing `bitcraft` service account and `/etc/bitcraft-claim-monitor.env`.

Install the base packages as root:

```bash
apt update
apt upgrade -y
apt install -y git curl sqlite3 sudo util-linux ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Install Node.js 24 and enable the repository's package manager:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
corepack enable
node --version
```

Install Caddy from its official Debian/Ubuntu repository if it is not already installed. See <https://caddyserver.com/docs/install#debian-ubuntu-raspbian>.

## Fresh VPS source checkout

Skip this section when migrating the existing live checkout. On a new VPS, create the service account, directories, checkout, data directory, and protected environment file first:

```bash
set -euo pipefail
id bitcraft >/dev/null 2>&1 || useradd --system --home /opt/bitcraft-claim-monitor --shell /usr/sbin/nologin bitcraft
install -d -o bitcraft -g bitcraft /opt/bitcraft-claim-monitor
install -d -o bitcraft -g bitcraft /opt/bitcraft-claim-monitor/releases
install -d -o bitcraft -g bitcraft -m 0700 /var/lib/bitcraft-claim-monitor
sudo -u bitcraft git clone https://github.com/Red463/bitcraft-claim-monitor.git \
  /opt/bitcraft-claim-monitor/source
touch /etc/bitcraft-claim-monitor.env
chown root:root /etc/bitcraft-claim-monitor.env
chmod 0600 /etc/bitcraft-claim-monitor.env
```

Continue at **Build the initial staged release** below.

## One-time staged-release migration

The existing production checkout currently occupies `/opt/bitcraft-claim-monitor`. This is the only deployment that requires a supervised maintenance window.

### 1. Create and export recovery backups

Create an online SQLite backup and a protected environment-file backup before stopping services:

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

Copy the files to an encrypted location on the administrator workstation:

```powershell
$VpsHost = Read-Host 'VPS SSH hostname or IP address'
$Stamp = ssh "root@$VpsHost" 'cat /root/bitcraft-migration-backup-stamp'
scp "root@${VpsHost}:/var/backups/bitcraft-claim-monitor/pre-staged-$Stamp.sqlite" .
scp "root@${VpsHost}:/var/backups/bitcraft-claim-monitor/pre-staged-$Stamp.env" .
scp "root@${VpsHost}:/var/backups/bitcraft-claim-monitor/pre-staged-$Stamp.sha256" .
Get-FileHash -Algorithm SHA256 "pre-staged-$Stamp.sqlite", "pre-staged-$Stamp.env"
Get-Content "pre-staged-$Stamp.sha256"
```

The PowerShell hashes must match the checksum file. Treat the `.env` backup as a secret.

### 2. Move the existing checkout into `source`

Run this as root during the announced maintenance window:

```bash
set -euo pipefail
systemctl stop bitcraft-claim-monitor bitcraft-claim-monitor-worker \
  bitcraft-monitor-collector.timer bitcraft-monitor-collector.service

test -d /opt/bitcraft-claim-monitor/.git
test ! -e /opt/bitcraft-claim-monitor-legacy-source
mv /opt/bitcraft-claim-monitor /opt/bitcraft-claim-monitor-legacy-source
install -d -o bitcraft -g bitcraft /opt/bitcraft-claim-monitor
mv /opt/bitcraft-claim-monitor-legacy-source /opt/bitcraft-claim-monitor/source
install -d -o bitcraft -g bitcraft /opt/bitcraft-claim-monitor/releases
chown -R bitcraft:bitcraft \
  /opt/bitcraft-claim-monitor/source \
  /opt/bitcraft-claim-monitor/releases
```

### 3. Build the initial staged release

Run these commands for either a migrated or fresh checkout:

```bash
set -euo pipefail
sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source fetch --prune origin main
REVISION="$(sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source rev-parse origin/main)"
sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source worktree add --detach \
  "/opt/bitcraft-claim-monitor/releases/$REVISION" "$REVISION"
sudo -u bitcraft bash -lc \
  "cd '/opt/bitcraft-claim-monitor/releases/$REVISION' && corepack pnpm install --frozen-lockfile"
sudo -u bitcraft bash -lc \
  "cd '/opt/bitcraft-claim-monitor/releases/$REVISION' && corepack pnpm --filter @workspace/bitcraft-local run build"
ln -s "releases/$REVISION" /opt/bitcraft-claim-monitor/current
```

### 4. Validate and install runtime configuration

Validate the release before replacing installed configuration:

```bash
set -euo pipefail
RELEASE="/opt/bitcraft-claim-monitor/releases/$REVISION"
systemd-analyze verify \
  "$RELEASE/deploy/bitcraft-claim-monitor.service" \
  "$RELEASE/deploy/bitcraft-claim-monitor-worker.service" \
  "$RELEASE/deploy/bitcraft-monitor-collector.service" \
  "$RELEASE/deploy/bitcraft-monitor-collector.timer"
caddy validate --config "$RELEASE/deploy/Caddyfile.example"

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
curl --fail --silent --show-error https://app.timbersteeltrade.com/
```

## Dedicated deployment account

Generate a deployment-only Ed25519 key on the administrator workstation:

```powershell
ssh-keygen -t ed25519 -f "$HOME/.ssh/bitcraft-production-deploy" -C bitcraft-production-deploy
$VpsHost = Read-Host 'VPS SSH hostname or IP address'
scp "$HOME/.ssh/bitcraft-production-deploy.pub" "root@${VpsHost}:/tmp/bitcraft-production-deploy.pub"
```

On the VPS, create the locked deployment account, restrict its SSH key, and allow only the root-owned updater through passwordless sudo:

```bash
set -euo pipefail
id deploy >/dev/null 2>&1 || useradd --system --create-home \
  --home-dir /var/lib/bitcraft-deploy --shell /bin/bash deploy
install -d -o deploy -g deploy -m 0700 /var/lib/bitcraft-deploy/.ssh
PUBLIC_KEY="$(cat /tmp/bitcraft-production-deploy.pub)"
printf 'restrict %s\n' "$PUBLIC_KEY" \
  >/var/lib/bitcraft-deploy/.ssh/authorized_keys
chown deploy:deploy /var/lib/bitcraft-deploy/.ssh/authorized_keys
chmod 0600 /var/lib/bitcraft-deploy/.ssh/authorized_keys
cat >/etc/sudoers.d/bitcraft-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/local/bin/update-bitcraft-monitor --revision *
EOF
chmod 0440 /etc/sudoers.d/bitcraft-deploy
visudo -cf /etc/sudoers.d/bitcraft-deploy
rm /tmp/bitcraft-production-deploy.pub
```

The updater rejects unknown arguments and accepts only a full lowercase 40-character SHA reachable from `origin/main`. The `deploy` account has no other passwordless sudo command and the restricted key cannot create a PTY or forwarding tunnel.

## GitHub production environment

From authenticated GitHub CLI PowerShell on the administrator workstation, capture the VPS host key. Verify the displayed fingerprints against the VPS console or provider before storing them:

```powershell
$VpsHost = Read-Host 'VPS SSH hostname or IP address'
ssh-keyscan -H $VpsHost | Set-Content -Encoding ascii bitcraft-production-known-hosts
ssh-keygen -lf bitcraft-production-known-hosts
```

After verifying the fingerprints, create the production environment and its four secrets:

```powershell
gh api --method PUT repos/Red463/bitcraft-claim-monitor/environments/production
gh secret set VPS_HOST --env production --body $VpsHost
gh secret set VPS_DEPLOY_USER --env production --body 'deploy'
Get-Content -Raw "$HOME/.ssh/bitcraft-production-deploy" | gh secret set VPS_SSH_PRIVATE_KEY --env production
Get-Content -Raw bitcraft-production-known-hosts | gh secret set VPS_KNOWN_HOSTS --env production
Remove-Item bitcraft-production-known-hosts
```

In GitHub:

1. Open **Settings → Environments → production → Deployment protection rules**.
2. Enable **Required reviewers**, select the production approver, and save. Disable self-approval when another maintainer is available.
3. Under **Deployment branches and tags**, select **Selected branches and tags** and allow only `main`.

The workflow cannot access the SSH secrets until the verification job passes and the production environment deployment is approved.

## Routine production deployment

1. Merge the reviewed pull request into `main`.
2. Open GitHub **Actions** and run **Deploy production** from `main`.
3. Review and approve the pending `production` environment deployment.
4. Follow the GitHub job summary until local and public health checks complete.

Merging does not deploy automatically. Routine deployment does not require an interactive SSH session.

The updater:

1. Acquires an exclusive `flock` deployment lock.
2. Verifies the exact requested SHA is reachable from `origin/main`.
3. Builds an immutable release while the current web and worker remain live.
4. Validates systemd and Caddy configuration and creates an online SQLite backup.
5. Atomically switches `current`, restarts web, and checks the expected version.
6. Restarts the single worker only after web health succeeds.
7. Checks the public site and removes old inactive releases after success.

Caddy waits up to five seconds for GET and HEAD requests during the normal one-to-three-second web restart. It never retries POST, PUT, PATCH, or DELETE requests. If the restart takes longer, users receive an explicit `503 Service Unavailable` maintenance response.

Successful output includes a concise summary; detailed command output remains in the full VPS log shown by the updater.

## Automatic rollback and database compatibility

If web startup, expected-version health, worker startup, or the public check fails, automatic rollback restores the previous `current` symbolic link and runtime configuration, restarts the previous web and worker, verifies local health, keeps the failed release for diagnosis, and exits non-zero.

Rollback changes application code only. It never restores SQLite automatically because that could discard writes accepted during deployment. Database migrations must remain backward compatible with the immediately previous release. Destructive schema changes require a separate reviewed maintenance plan.

Before relying on routine deployment, perform one successful deployment and observe one forced-failure rollback in a supervised window.

## Break-glass administrator deployment

Use direct SSH only when GitHub Actions is unavailable. Obtain the exact current `main` SHA and run the root-owned updater:

```bash
FULL_SHA="$(sudo -u bitcraft git -C /opt/bitcraft-claim-monitor/source rev-parse origin/main)"
sudo /usr/local/bin/update-bitcraft-monitor --revision "$FULL_SHA"
```

Use `--verbose` to stream the detailed log. Use `--no-public-check` only when Caddy or public DNS is intentionally unavailable and an administrator is independently checking the local service.

## Useful checks

```bash
readlink -f /opt/bitcraft-claim-monitor/current
systemctl status bitcraft-claim-monitor --no-pager -l
systemctl status bitcraft-claim-monitor-worker --no-pager -l
systemctl status bitcraft-monitor-collector.timer --no-pager -l
journalctl -u bitcraft-claim-monitor -n 100 --no-pager
journalctl -u bitcraft-claim-monitor-worker -n 100 --no-pager
caddy validate --config /etc/caddy/Caddyfile
curl --fail --silent --show-error http://127.0.0.1:18430/api/local/health
curl --fail --silent --show-error https://app.timbersteeltrade.com/
```

Only Caddy should be exposed publicly. Production secrets remain in `/etc/bitcraft-claim-monitor.env`; never paste them into GitHub secrets, deployment logs, or release directories.
