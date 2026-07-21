# Deployment Backup Policy Design

## Goal

Remove the full SQLite backup from ordinary application deployments while retaining reliable recovery points for routine operations and database schema changes. Make long-running backups visible and prevent an idle SSH connection from falsely reporting that a healthy backup failed.

## Current problem

The production database is approximately 1.2 GB. The staged updater currently runs SQLite's online `.backup` command before every deployment, even when a release changes only frontend or application logic. With up to twenty deployments per day, this consumes excessive time and disk space.

The backup also runs while the worker and telemetry collector continue writing to SQLite. During the July 21 deployment, the backup was still active after twenty-four minutes. It emitted no terminal output, the GitHub Actions SSH connection was dropped after roughly five idle minutes, and the remote updater continued holding the deployment lock. Production remained on the previous release, but GitHub could not report the real remote state.

## Chosen policy

Backups are divided into three explicit classes:

- `daily`: one validated scheduled backup per day, retaining the seven newest completed daily backups.
- `migration`: a mandatory validated backup before deploying a release whose database schema version differs from the active release, retaining the three newest completed migration backups.
- `manual`: a backup requested explicitly from the GitHub deployment workflow, retaining the three newest completed manual backups.

Ordinary deployments create no database backup. Application rollback continues to restore code only and never restores SQLite automatically.

Existing `bitcraft-local-predeploy-*.sqlite` files are treated as legacy deployment backups. Initial cleanup retains the three newest completed legacy files and removes older files only after a dry run lists their exact paths. A file currently open by `sqlite3`, a `.partial` file, or a file newer than the cleanup command's start time is never removed.

## Schema-version contract

Add a plain integer marker at `deploy/database-schema-version`. The initial value is `1`.

Every change that adds, removes, renames, or changes the meaning of a SQLite table, column, index, trigger, or data migration must increment this integer. Application-only and frontend-only changes leave it unchanged.

The updater compares the candidate marker with the marker in the active release:

- Different values require a `migration` backup before cutover.
- A missing marker in either release is treated conservatively as different and requires a migration backup.
- Equal values skip the pre-deploy backup unless the operator selected the manual force-backup workflow input.

The deployment contract tests document this behavior. The marker is intentionally explicit because inferring schema risk from Git file paths or SQL text is unreliable.

## Backup command

Add a root-owned `deploy/backup-bitcraft-monitor` script used by both the daily timer and the staged updater.

The command accepts exactly one backup class: `daily`, `migration`, or `manual`. It also supports `--dry-run-prune` and `--apply-prune` for legacy cleanup. Paths remain fixed under `/var/backups/bitcraft-claim-monitor`; callers cannot supply arbitrary database or backup paths.

For a real backup, the script:

1. Acquires a separate backup lock so scheduled and deployment backups cannot overlap.
2. Records whether the worker, collector timer, and collector service were active.
3. Stops the collector timer, collector service, and worker when active. It never stops the web service.
4. Creates the backup with a `.partial` suffix as the `bitcraft` user.
5. Prints a heartbeat every thirty seconds containing elapsed time and current partial-file size.
6. Waits for SQLite to exit and fails if the backup command fails.
7. Runs `PRAGMA quick_check` against the partial backup and requires the single result `ok`.
8. Atomically renames the validated partial file to its final `.sqlite` filename.
9. Applies retention for that backup class.
10. Restores each background unit to the active/inactive state recorded before the backup, including every error and signal exit path.

The final names are:

```text
bitcraft-local-daily-YYYYMMDD-HHMMSS.sqlite
bitcraft-local-migration-<12-char-revision>-YYYYMMDD-HHMMSS.sqlite
bitcraft-local-manual-<12-char-revision>-YYYYMMDD-HHMMSS.sqlite
```

The command never treats a `.partial` file as a valid recovery point. Failed partial files are retained for diagnosis and excluded from retention counts.

## Scheduled daily backup

Add `bitcraft-claim-monitor-backup.service` and `bitcraft-claim-monitor-backup.timer`.

The timer runs daily at 03:30 Europe/London with a bounded randomized delay of fifteen minutes. Persistent timer behavior runs one missed daily backup after the VPS returns online. The service invokes the backup command with class `daily` and uses the same production database and backup directory.

The staged updater installs and enables the backup timer with the existing production units. It does not synchronously run a daily backup during deployment.

## Deployment workflow

Add a boolean `force_database_backup` input to the manual GitHub workflow. Its default is `false`.

The workflow passes `--force-backup` to the updater only when selected. The updater maps that request to a `manual` backup unless a schema-version change already requires a `migration` backup; one migration backup satisfies both conditions, so the deployment never creates two backups.

The SSH command uses:

```text
ServerAliveInterval=30
ServerAliveCountMax=10
```

The deploy job timeout increases from twenty to forty-five minutes. Backup heartbeats provide visible application-level traffic as well as useful progress information.

## Retention and cleanup

Retention is non-recursive and restricted to regular files inside `/var/backups/bitcraft-claim-monitor` matching the exact class prefix and `.sqlite` suffix.

- Daily: keep seven.
- Migration: keep three.
- Manual: keep three.
- Legacy pre-deploy files: initial cleanup keeps three.

Files are sorted newest first by modification time. The currently open output path, partial files, unknown filenames, environment backups, checksums, and directories are excluded.

Legacy cleanup is two-stage:

1. `--dry-run-prune` prints the exact legacy files that would be removed and the total bytes recoverable without changing the filesystem.
2. `--apply-prune` recomputes the same validated candidate set and removes only those files.

Before applying cleanup on production, the active deployment and backup locks must both be free and the newest retained backup must pass `PRAGMA quick_check`.

## Failure behavior

- A failed required migration or manual backup aborts deployment before cutover.
- A failed daily backup leaves the current application untouched and is visible through the systemd unit result and journal.
- Background service restoration runs even when SQLite, validation, retention, or the caller fails.
- If a service was inactive before backup, the script does not start it afterward.
- If restoration fails, the command exits non-zero and prints the affected unit names.
- A busy backup lock causes the daily job or deployment to fail clearly rather than run concurrent SQLite copies.
- The deployment lock remains independent from the backup lock; the updater holds both only while invoking the backup command.

## Production rollout and current incident

The currently running legacy backup must finish or be terminated deliberately before installing the new scripts. Its deployment lock prevents a second updater from starting.

After the lock is free:

1. Validate the newest completed legacy backup with `PRAGMA quick_check`.
2. Run legacy cleanup in dry-run mode and record the exact candidate list and recoverable bytes.
3. Apply cleanup only after reviewing that list.
4. Deploy the new release with `force_database_backup=false`; because the active release has no schema marker, the first rollout creates one migration backup.
5. Confirm the daily backup timer is active and scheduled.
6. Confirm the worker and collector timer returned to their prior states.

## Testing

Deployment contract tests cover:

- ordinary deployments skip backups when schema versions match;
- missing or changed schema markers require exactly one migration backup;
- manual force-backup creates exactly one manual backup when no migration is needed;
- schema migration plus manual force creates only the migration backup;
- the workflow exposes the manual input, SSH keepalives, and forty-five-minute timeout;
- backup heartbeats run every thirty seconds;
- the web service is never stopped;
- background units are restored to their exact prior states after success and failure;
- validation occurs before atomic rename;
- class retention counts are seven, three, and three;
- dry-run cleanup never deletes files and apply cleanup excludes active, partial, and unknown files;
- systemd backup units use the active release and the daily Europe/London schedule.

Run the deployment contract tests, the complete application test suite, and the production build before publishing.

## Operational trade-off

The maximum routine recovery-point gap becomes approximately twenty-four hours instead of one deployment. Schema-changing and manually flagged releases still have an immediate recovery point. This is the selected balance between storage usage, deployment speed, and data-loss exposure; point-in-time replication remains out of scope.
