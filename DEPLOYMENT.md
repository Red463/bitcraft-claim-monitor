# Relay preview deployment

This runbook installs the standalone
`Red463/bitcraft-claim-monitor-relay` repository as a parallel preview at
`https://relay.timbersteeltrade.com`. It creates an isolated application,
fresh SQLite state, services, locks, backups, keys, and deployment account.
It does not copy production data and does not switch the production domain.

The maintained app remains running and untouched throughout this procedure.
Record the result of this check before and after each supervised bootstrap:

```sh
curl --fail --silent --show-error https://app.timbersteeltrade.com/api/local/health
```

## Locked preview identity

| Purpose | Value |
| --- | --- |
| Repository | `Red463/bitcraft-claim-monitor-relay` |
| GitHub environment and concurrency group | `relay-preview` |
| Updater | `/usr/local/bin/update-bitcraft-claim-monitor-relay` |
| Application | `/opt/bitcraft-claim-monitor-relay` |
| Data | `/var/lib/bitcraft-claim-monitor-relay` |
| Backups | `/var/backups/bitcraft-claim-monitor-relay` |
| Environment file | `/etc/bitcraft-claim-monitor-relay.env` |
| Key directory | `/etc/bitcraft-claim-monitor-relay` |
| Local health | `http://127.0.0.1:19430/api/local/health` |
| Public preview | `https://relay.timbersteeltrade.com` |

The updater keeps immutable releases under
`/opt/bitcraft-claim-monitor-relay/releases/<sha>` and atomically moves the
relative `current` symbolic link. Persistent data, configuration, keys, and
backups never live inside a release.

## Prerequisites

- Ubuntu with Node.js 24, Corepack, Git, Caddy, SQLite, `sudo`, `flock`, and
  systemd.
- A `bitcraft` runtime account.
- DNS for `relay.timbersteeltrade.com` pointing at the VPS.
- Ports 80 and 443 exposed through Caddy. The Relay process stays bound to
  `127.0.0.1:19430`.
- A reviewed full commit SHA reachable from the standalone repository's
  `origin/main`.

## Create isolated directories and keys

Run as root in a supervised session:

```sh
install -d -o bitcraft -g bitcraft -m 0755 /opt/bitcraft-claim-monitor-relay
install -d -o bitcraft -g bitcraft -m 0755 /opt/bitcraft-claim-monitor-relay/releases
install -d -o bitcraft -g bitcraft -m 0700 /var/lib/bitcraft-claim-monitor-relay
install -d -o bitcraft -g bitcraft -m 0700 /var/backups/bitcraft-claim-monitor-relay
install -d -o root -g bitcraft -m 0750 /etc/bitcraft-claim-monitor-relay
install -d -o root -g root -m 0755 /usr/local/lib/bitcraft-claim-monitor-relay

umask 077
openssl rand 32 | basenc --base64url | tr -d '=' \
  > /etc/bitcraft-claim-monitor-relay/backup-encryption.key
openssl rand 32 | basenc --base64url | tr -d '=' \
  > /etc/bitcraft-claim-monitor-relay/privacy-ledger.key
chown root:root /etc/bitcraft-claim-monitor-relay/backup-encryption.key
chmod 0600 /etc/bitcraft-claim-monitor-relay/backup-encryption.key
chown root:bitcraft /etc/bitcraft-claim-monitor-relay/privacy-ledger.key
chmod 0640 /etc/bitcraft-claim-monitor-relay/privacy-ledger.key
```

Use fresh keys. Do not reuse the maintained deployment's key directory.

## Bootstrap a read-only GitHub deploy key

The private standalone repository is fetched by the unprivileged `bitcraft`
account over SSH. Create a dedicated read-only GitHub deploy key; do not put a
personal access token in the remote URL.

```sh
install -d -o bitcraft -g bitcraft -m 0700 /home/bitcraft/.ssh
sudo -u bitcraft sh -c '
  umask 077
  ssh-keygen -q -t ed25519 -N "" \
    -C bitcraft-claim-monitor-relay-readonly \
    -f /home/bitcraft/.ssh/bitcraft-claim-monitor-relay-readonly
'
chmod 0600 /home/bitcraft/.ssh/bitcraft-claim-monitor-relay-readonly
chmod 0644 /home/bitcraft/.ssh/bitcraft-claim-monitor-relay-readonly.pub
```

In `Red463/bitcraft-claim-monitor-relay`, open **Settings → Deploy keys**, add
the contents of the `.pub` file, and leave **Allow write access** unchecked.

Pin GitHub's Ed25519 host key before the first Git operation. Capture the key
to a private temporary file, print its fingerprint, and compare that
fingerprint through a trusted channel with GitHub's currently published SSH
key fingerprints. Do not install it if the fingerprint differs.

```sh
umask 077
GITHUB_HOST_KEYS="$(mktemp)"
ssh-keyscan -t ed25519 github.com >"$GITHUB_HOST_KEYS"
ssh-keygen -lf "$GITHUB_HOST_KEYS"
# Stop here and compare the displayed fingerprint with GitHub's published value.
install -o bitcraft -g bitcraft -m 0600 \
  "$GITHUB_HOST_KEYS" /home/bitcraft/.ssh/known_hosts
rm -f "$GITHUB_HOST_KEYS"

install -o bitcraft -g bitcraft -m 0600 /dev/null /home/bitcraft/.ssh/config
sudo -u bitcraft sh -c 'cat > /home/bitcraft/.ssh/config <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile /home/bitcraft/.ssh/bitcraft-claim-monitor-relay-readonly
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  UserKnownHostsFile /home/bitcraft/.ssh/known_hosts
EOF'
```

## Clone and prepare the initial immutable release

```sh
sudo -u bitcraft git clone \
  git@github.com:Red463/bitcraft-claim-monitor-relay.git \
  /opt/bitcraft-claim-monitor-relay/source
sudo -u bitcraft git -C /opt/bitcraft-claim-monitor-relay/source fetch --prune origin main

REVISION="$(sudo -u bitcraft git -C /opt/bitcraft-claim-monitor-relay/source rev-parse origin/main)"
printf '%s\n' "$REVISION" | grep -Eq '^[0-9a-f]{40}$'
sudo -u bitcraft git -C /opt/bitcraft-claim-monitor-relay/source \
  merge-base --is-ancestor "$REVISION" origin/main
sudo -u bitcraft git -C /opt/bitcraft-claim-monitor-relay/source \
  worktree add --detach "/opt/bitcraft-claim-monitor-relay/releases/$REVISION" "$REVISION"

RELEASE="/opt/bitcraft-claim-monitor-relay/releases/$REVISION"
sudo -u bitcraft bash -lc \
  "cd '$RELEASE' && corepack pnpm install --frozen-lockfile"
sudo -u bitcraft bash -lc \
  "cd '$RELEASE' && corepack pnpm --filter @workspace/bitcraft-local test"
sudo -u bitcraft bash -lc \
  "cd '$RELEASE' && corepack pnpm --filter @workspace/bitcraft-local run build"
node --test "$RELEASE"/scripts/test/deploy-*.test.mjs
ln -s "releases/$REVISION" /opt/bitcraft-claim-monitor-relay/current
```

The preview starts with fresh SQLite state. Do not copy an existing database,
accounts, settings, secrets, notification history, or activity history into
`/var/lib/bitcraft-claim-monitor-relay`. The application creates its own
database on first start.

## Protected environment

Copy the non-secret template, then edit the installed file as root:

```sh
install -o root -g root -m 0600 \
  "$RELEASE/deploy/bitcraft-claim-monitor-relay.env.example" \
  /etc/bitcraft-claim-monitor-relay.env
sudoedit /etc/bitcraft-claim-monitor-relay.env
```

Keep Relay enabled and the preview in shadow mode. The web and worker units
also force `DISCORD_DELIVERY_MODE=record` and
`ENABLE_DISCORD_STARTUP=false` in `ExecStart`, after the environment file is
loaded. Conflicting environment-file values therefore cannot enable real
Discord delivery or startup messages.

Do not place private keys, bot tokens, OAuth secrets, or setup keys in Git,
release directories, workflow output, or shell history.

## Install the first updater, helpers, units, and timers

Validate only the Relay units:

```sh
systemd-analyze verify \
  "$RELEASE/deploy/bitcraft-claim-monitor-relay.service" \
  "$RELEASE/deploy/bitcraft-claim-monitor-relay-worker.service" \
  "$RELEASE/deploy/bitcraft-claim-monitor-relay-collector.service" \
  "$RELEASE/deploy/bitcraft-claim-monitor-relay-collector.timer" \
  "$RELEASE/deploy/bitcraft-claim-monitor-relay-backup.service" \
  "$RELEASE/deploy/bitcraft-claim-monitor-relay-backup.timer"
caddy validate --config "$RELEASE/deploy/Caddyfile.example"
bash -n "$RELEASE/deploy/update-bitcraft-claim-monitor-relay"
bash -n "$RELEASE/deploy/backup-bitcraft-claim-monitor-relay"
node --check "$RELEASE/deploy/backup-crypto.mjs"
node --check "$RELEASE/deploy/replay-privacy-deletions.mjs"
```

Install only Relay-named artifacts:

```sh
install -m 0755 "$RELEASE/deploy/update-bitcraft-claim-monitor-relay" /usr/local/bin/update-bitcraft-claim-monitor-relay
install -m 0755 "$RELEASE/deploy/backup-bitcraft-claim-monitor-relay" /usr/local/bin/backup-bitcraft-claim-monitor-relay
install -m 0755 "$RELEASE/deploy/backup-crypto.mjs" /usr/local/lib/bitcraft-claim-monitor-relay/backup-crypto.mjs
install -m 0755 "$RELEASE/deploy/replay-privacy-deletions.mjs" /usr/local/lib/bitcraft-claim-monitor-relay/replay-privacy-deletions.mjs
install -m 0644 "$RELEASE/deploy/bitcraft-claim-monitor-relay.service" /etc/systemd/system/
install -m 0644 "$RELEASE/deploy/bitcraft-claim-monitor-relay-worker.service" /etc/systemd/system/
install -m 0644 "$RELEASE/deploy/bitcraft-claim-monitor-relay-collector.service" /etc/systemd/system/
install -m 0644 "$RELEASE/deploy/bitcraft-claim-monitor-relay-collector.timer" /etc/systemd/system/
install -m 0644 "$RELEASE/deploy/bitcraft-claim-monitor-relay-backup.service" /etc/systemd/system/
install -m 0644 "$RELEASE/deploy/bitcraft-claim-monitor-relay-backup.timer" /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now \
  bitcraft-claim-monitor-relay.service \
  bitcraft-claim-monitor-relay-worker.service \
  bitcraft-claim-monitor-relay-collector.timer \
  bitcraft-claim-monitor-relay-backup.timer
curl --fail --silent --show-error http://127.0.0.1:19430/api/local/health
```

## One-time supervised Caddy bootstrap

`deploy/Caddyfile.example` deliberately contains both the maintained route and
the Relay preview route so an operator can merge the preview beside production.
It is a validation/reference file, not a replacement for the live
configuration.

Routine deployment must not copy `Caddyfile.example` to
`/etc/caddy/Caddyfile`. The updater validates the tracked example but never
installs it or reloads Caddy.

For the one-time supervised Caddy bootstrap:

1. Save a root-only copy of the live configuration.
2. Manually merge only the `relay.timbersteeltrade.com` site block from the
   reviewed release into the live file.
3. Inspect the diff and confirm the maintained site block is unchanged.
4. Validate before reloading.

```sh
install -o root -g root -m 0600 \
  /etc/caddy/Caddyfile \
  /root/Caddyfile.before-relay-preview
sudoedit /etc/caddy/Caddyfile
caddy fmt --diff /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
curl --fail --silent --show-error https://relay.timbersteeltrade.com/api/local/health
curl --fail --silent --show-error https://app.timbersteeltrade.com/api/local/health
```

If validation or either health check fails, restore the saved Caddy file,
validate it, and reload Caddy. This is the only step that changes the shared
proxy configuration.

## Restricted deployment account

Create a password-locked account used only by the workflow:

```sh
adduser --disabled-password --gecos "" --shell /bin/bash relay-deploy
passwd --lock relay-deploy
install -d -o relay-deploy -g relay-deploy -m 0700 /home/relay-deploy/.ssh
install -o relay-deploy -g relay-deploy -m 0600 /dev/null /home/relay-deploy/.ssh/authorized_keys
```

Add the deployment public key to `authorized_keys` with OpenSSH's `restrict`
option:

```txt
restrict ssh-ed25519 REPLACE_WITH_DEPLOYMENT_PUBLIC_KEY relay-preview
```

Allow only the root-owned Relay updater through passwordless sudo:

```sh
visudo -f /etc/sudoers.d/bitcraft-claim-monitor-relay
```

```sudoers
relay-deploy ALL=(root) NOPASSWD: /usr/local/bin/update-bitcraft-claim-monitor-relay *
```

Validate with `visudo -cf /etc/sudoers.d/bitcraft-claim-monitor-relay`.
The updater rejects unknown arguments, requires a full lowercase 40-character
SHA reachable from `origin/main`, and holds the Relay-only deployment lock.
The account receives no other passwordless command.

## GitHub environment and secrets

In the standalone repository, create the protected `relay-preview` environment
with a required reviewer and restrict deployment branches to `main`. Add:

- `RELAY_VPS_HOST`
- `RELAY_VPS_DEPLOY_USER` (`relay-deploy`)
- `RELAY_VPS_SSH_PRIVATE_KEY`
- `RELAY_VPS_KNOWN_HOSTS`

Generate `RELAY_VPS_KNOWN_HOSTS` from the VPS host key and verify its
fingerprint through an independent trusted channel before saving it. Do not use
an unverified `ssh-keyscan` result.

The **Deploy Relay preview** workflow is manual, main-only, serialized by the
`relay-preview` concurrency group, and cannot access these secrets until
verification succeeds and the protected environment is approved. Merging does
not deploy.

To deploy:

1. Merge a reviewed change to `main`.
2. Open Actions and manually run **Deploy Relay preview** from `main`.
3. Select `force_database_backup` only when an extra manual recovery point is
   required.
4. Approve the pending `relay-preview` environment deployment.
5. Check the exact revision and concise summary of status. The full VPS log
   remains on the host for an authorized operator and is not copied into
   GitHub output.

Break-glass use of the same exact revision:

```sh
sudo /usr/local/bin/update-bitcraft-claim-monitor-relay \
  --revision 0123456789abcdef0123456789abcdef01234567
```

Add `--verbose` to stream build details. Use `--no-public-check` only while DNS
or Caddy is deliberately unavailable and an administrator is independently
checking local health.

## Deployment behavior and automatic rollback

For every requested revision the updater:

1. Acquires `/run/lock/bitcraft-claim-monitor-relay-deploy.lock`.
2. Fetches `origin/main` and verifies the full SHA is reachable.
3. Creates and builds an immutable detached worktree.
4. Validates only Relay systemd units and the tracked Caddy example.
5. Snapshots the current symlink, updater, helpers, and every live Relay unit,
   then syntax-checks and stages the encrypted-backup helpers.
6. Creates a migration backup when the schema marker changes, or a manual
   backup when requested.
7. Installs only Relay units, atomically switches `current`, and restarts only
   the Relay web and worker.
8. Checks the local release version and public preview.
9. Installs the candidate updater, enables/starts the backup timer, and commits
   the deployment transaction.
10. Prunes old releases as best-effort post-commit maintenance.

Any failure after the live snapshot and before commit—including updater
installation or backup-timer enablement—restores the exact prior symlink,
updater, helpers, and unit files, reloads systemd, and restores the prior web,
worker, and backup-timer runtime state. The previous active release cannot be
pruned before this commit. Post-commit pruning is best effort: a pruning error
is logged as a warning and does not fail or roll back the deployed release.

If any individual restore or systemd reload operation fails, rollback continues
attempting every remaining restore and retains its private transaction snapshot.
The failure summary and full log print the exact recovery snapshot path for
supervised repair. Do not delete that directory until the live installation has
been recovered and checked.

Failed releases are retained for diagnosis. Rollback never restores SQLite
automatically because that could discard writes accepted during deployment.
Database migrations must stay backward compatible with the immediately
previous release.

Before relying on unattended preview deployments, perform one successful
deployment and one forced-failure rollback in a supervised window.

## Diagnostics

```sh
systemctl status bitcraft-claim-monitor-relay.service --no-pager -l
systemctl status bitcraft-claim-monitor-relay-worker.service --no-pager -l
systemctl status bitcraft-claim-monitor-relay-collector.timer --no-pager -l
systemctl status bitcraft-claim-monitor-relay-backup.timer --no-pager -l
systemctl list-timers 'bitcraft-claim-monitor-relay-*' --all
journalctl -u bitcraft-claim-monitor-relay.service -n 100 --no-pager -l
journalctl -u bitcraft-claim-monitor-relay-worker.service -n 100 --no-pager -l
journalctl -u bitcraft-claim-monitor-relay-backup.service -n 100 --no-pager -l
readlink -f /opt/bitcraft-claim-monitor-relay/current
curl --fail --silent --show-error http://127.0.0.1:19430/api/local/health
curl --fail --silent --show-error https://relay.timbersteeltrade.com/api/local/health
caddy validate --config /etc/caddy/Caddyfile
```

Deployment logs use unpredictable names such as
`/var/log/bitcraft-claim-monitor-relay/update.A1b2C3.log`. The root-owned
directory is mode `0700` and each log is mode `0600`. Logs may contain
operational metadata but must not contain secrets.

## Backups, privacy ledger, and restore

The persistent `bitcraft-claim-monitor-relay-backup.timer` creates encrypted
daily backups at 03:30 Europe/London with a randomized delay of up to 15
minutes. Retention keeps seven daily backups, three migration backups, and
three manual backups. The helper pauses only the Relay worker and collector
while SQLite creates and validates the copy; the Relay web remains available.

```sh
sudo /usr/local/bin/backup-bitcraft-claim-monitor-relay daily
sudo /usr/local/bin/backup-bitcraft-claim-monitor-relay manual \
  --revision 0123456789abcdef0123456789abcdef01234567
sudo /usr/local/bin/backup-bitcraft-claim-monitor-relay --dry-run-prune
sudo /usr/local/bin/backup-bitcraft-claim-monitor-relay --apply-prune
```

Cleanup is confined to `/var/backups/bitcraft-claim-monitor-relay`, takes the
Relay deployment and backup locks, ignores partial/open/new files, and
validates the newest retained legacy-format backup before removing older
legacy-format files.

The privacy deletion ledger is outside SQLite at
`/var/backups/bitcraft-claim-monitor-relay/privacy-deletion-ledger.jsonl`.
Keep it and `/etc/bitcraft-claim-monitor-relay/privacy-ledger.key` with the
encrypted backups. A database restore must replay the privacy deletion ledger
before the restored database can serve traffic, so deleted accounts cannot
reappear.

Supervised restore outline:

```sh
BACKUP="/var/backups/bitcraft-claim-monitor-relay/REPLACE.sqlite.enc"
RESTORE="/var/backups/bitcraft-claim-monitor-relay/restore.sqlite.partial"
node /usr/local/lib/bitcraft-claim-monitor-relay/backup-crypto.mjs \
  decrypt "$BACKUP" "$RESTORE" \
  /etc/bitcraft-claim-monitor-relay/backup-encryption.key
sqlite3 "$RESTORE" 'PRAGMA quick_check;'

DATA_DIR=/var/lib/bitcraft-claim-monitor-relay \
BACKUP_DIR=/var/backups/bitcraft-claim-monitor-relay \
CONFIG_DIR=/etc/bitcraft-claim-monitor-relay \
node /opt/bitcraft-claim-monitor-relay/current/deploy/replay-privacy-deletions.mjs \
  "$RESTORE" \
  /var/backups/bitcraft-claim-monitor-relay/privacy-deletion-ledger.jsonl \
  /etc/bitcraft-claim-monitor-relay/privacy-ledger.key
sqlite3 "$RESTORE" 'PRAGMA quick_check;'

systemctl stop \
  bitcraft-claim-monitor-relay-collector.timer \
  bitcraft-claim-monitor-relay-collector.service \
  bitcraft-claim-monitor-relay-worker.service \
  bitcraft-claim-monitor-relay.service
install -o bitcraft -g bitcraft -m 0600 \
  "$RESTORE" /var/lib/bitcraft-claim-monitor-relay/bitcraft-local.sqlite
rm -f "$RESTORE"
systemctl start \
  bitcraft-claim-monitor-relay.service \
  bitcraft-claim-monitor-relay-worker.service \
  bitcraft-claim-monitor-relay-collector.timer
curl --fail --silent --show-error http://127.0.0.1:19430/api/local/health
```

Never restore or copy preview data into the maintained application. Finish by
checking both public health endpoints and recording that the maintained app
remains running and untouched.
