# Temporary VPS Ledger Recovery Design

Date: 2026-07-25  
Owner: Thomas Bush, operating as Timbersteel Claim Monitor

## Context

The privacy release uses an append-only, HMAC-signed deletion ledger so restoring an older SQLite database does not silently recreate accounts that were deleted later. The preferred recovery design keeps a current copy outside the VPS failure domain.

The owner has confirmed the external release-readiness checks and has accepted a temporary exception: until an off-VPS destination is configured, the ledger will rely on the existing regular full-VPS backups. This is a documented risk acceptance, not an assertion that the copy is independent of HostWorld or the VPS.

## Temporary Decision

- Keep the authoritative live ledger at `/var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl`.
- Keep the ledger outside `/var/lib/bitcraft-claim-monitor`, so an application-database-only restore does not automatically select an older ledger.
- Rely temporarily on the confirmed full-VPS backup schedule to preserve the ledger and its append-only history.
- Retain signed ledger records for 90 days under the application retention policy.
- Do not create a redundant second copy on the same VPS and describe it as independent recovery.

This arrangement protects database-only recovery and ordinary application corruption. It does not protect deletions newer than the most recent VPS backup, simultaneous loss of the VPS and its provider backups, or a provider-level rollback of both database and ledger.

## Production Secrets and Permissions

Provision these files without printing or transmitting their contents:

- `/etc/bitcraft-claim-monitor/privacy-ledger.key`: one cryptographically random 32-byte base64url value, owner `root`, group `bitcraft`, mode `0640`.
- `/etc/bitcraft-claim-monitor/backup-encryption.key`: a different cryptographically random 32-byte base64url value, owner `root`, group `root`, mode `0600`.

The keys must not be placed in Git, SQLite, deployment logs, command arguments, the ledger directory, or an encrypted backup. Existing regular non-symlink key files must be validated and preserved rather than overwritten.

Set `LEGAL_CONFIGURATION_CONFIRMED=true` in `/etc/bitcraft-claim-monitor.env` after creating a protected timestamped backup of that environment file. This records the owner's review of the published identity; it does not represent completion of unrelated legal advice.

## Verification and Deployment

Before retrying production:

1. Validate key ownership, type, permissions, and decoded length without displaying either key.
2. Validate that the ledger directory is owned by `bitcraft`, mode `0700`, and outside the database directory.
3. Use the candidate release helpers and a protected temporary SQLite backup to perform an AES-256-GCM encrypt/decrypt round trip followed by `PRAGMA quick_check`.
4. Verify that the candidate replay helper accepts the current signed ledger and a protected temporary database copy.
5. Remove all plaintext validation files and confirm no plaintext backup was published.

Then rerun the protected `Deploy production` workflow from `main`, approve the production environment, and require:

- all application and deployment tests to pass on Ubuntu;
- local health to report `0.45.0-beta.1`;
- the worker to start only after web health succeeds;
- the public health endpoint and legal pages to respond successfully.

If candidate health fails, retain the updater's automatic rollback to `0.44.0-beta.1` and inspect the journal before another attempt.

## Restore Procedure During the Exception

For a database-only recovery, preserve the live ledger, restore SQLite, verify ledger signatures, and replay committed deletions before starting either service.

For a full-VPS recovery, restore the newest available VPS backup, identify the newest ledger captured by that backup, verify it, and replay it before service start. Record that deletions after the backup timestamp may require manual reconstruction from privacy correspondence or audit receipts.

## Deferred Off-VPS Hardening

The target off-VPS location is:

`Proton Drive/My files/Timbersteel Claim Monitor/Privacy Recovery/Deletion Ledger/`

A later change will use Proton's official Linux Drive CLI to upload uniquely named ledger snapshots after changes and retry on a timer. The signing key will remain separate and will not be uploaded beside the ledger. Once upload and restore verification pass, the temporary same-VPS risk acceptance will be removed from the runbook and release-readiness audit.
