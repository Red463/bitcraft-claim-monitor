# Task 3 implementation report

## Status

Implemented the standalone Relay preview deployment path from base
`747577cf6ff6fd63655c99a1024814940493a913`. No GitHub environment, workflow
run, push, VPS command, or public-domain cutover was performed.

Commit: this report and the implementation are in the same commit; the exact
commit hash is returned to the orchestrator after Git creates it.

## Changed and deleted files

Added/renamed:

- `.github/workflows/deploy-relay-preview.yml`
- `deploy/update-bitcraft-claim-monitor-relay`
- `deploy/backup-bitcraft-claim-monitor-relay`
- `scripts/test/deploy-relay-preview-workflow.test.mjs`

Changed:

- `.gitattributes`
- `DEPLOYMENT.md`
- `README.md`
- `deploy/bitcraft-claim-monitor-relay.service`
- `deploy/bitcraft-claim-monitor-relay-worker.service`
- `deploy/bitcraft-claim-monitor-relay-backup.service`
- `deploy/collect-server-health.mjs`
- `deploy/replay-privacy-deletions.mjs`
- `scripts/test/deploy-backup-integration.test.mjs`
- `scripts/test/deploy-backup-script.test.mjs`
- `scripts/test/deploy-runtime-config.test.mjs`
- `scripts/test/deploy-update-integration.test.mjs`
- `scripts/test/deploy-update-script.test.mjs`
- `apps/bitcraft-local/test/relay-deployment-boundary.test.mjs`
- `apps/bitcraft-local/test/server-health-boundary.test.mjs`

Deleted/replaced:

- `.github/workflows/deploy-production.yml`
- `deploy/update-bitcraft-monitor`
- `deploy/backup-bitcraft-monitor`
- `deploy/bitcraft-claim-monitor.service`
- `deploy/bitcraft-claim-monitor-worker.service`
- `deploy/bitcraft-monitor-collector.service`
- `deploy/bitcraft-monitor-collector.timer`
- `deploy/bitcraft-claim-monitor-backup.service`
- `deploy/bitcraft-claim-monitor-backup.timer`
- `scripts/test/deploy-production-workflow.test.mjs`

`deploy/Caddyfile.example` was deliberately not changed. It remains the sole
coexistence example containing both the maintained production route and the
Relay preview route.

## Workflow and updater safety

- The workflow is manual, rejects non-`main` dispatches, serializes on
  `relay-preview`, gates SSH secrets behind the protected `relay-preview`
  environment, pins `known_hosts`, and passes the verified full `GITHUB_SHA`
  to `/usr/local/bin/update-bitcraft-claim-monitor-relay`.
- Raw SSH output and VPS journals are not printed or copied into the GitHub
  step summary; remote diagnostics remain on the VPS for an authorized
  operator.
- Verification tests/builds the app, runs the deployment contracts, validates
  only Relay units, and validates the coexistence Caddy example.
- The updater uses only the locked Relay application, data, backup, config,
  helper, service, timer, lock, log, health, and public-preview identities.
- Routine updates validate `Caddyfile.example` but do not install it, overwrite
  `/etc/caddy/Caddyfile`, or reload/restart Caddy.
- Existing immutable releases, exact `origin/main` ancestry validation,
  schema-aware encrypted backups, atomic symlink cutover, application
  rollback, failed-release retention, and three-release pruning remain in
  place. Failure cleanup now restores the staged backup shell, crypto helper,
  and privacy-replay helper together.
- The Relay web and worker now use `/usr/bin/env` assignments in `ExecStart`,
  after `EnvironmentFile=`, so `DISCORD_DELIVERY_MODE=record` and
  `ENABLE_DISCORD_STARTUP=false` cannot be overridden by the installed
  environment file.
- Negative contracts reject the maintained port, updater, paths, and
  unsuffixed services in the active workflow, updater, and runbook.

## Runbook coverage

`DEPLOYMENT.md` now documents:

- fresh isolated directories, keys, environment, and SQLite state;
- cloning `Red463/bitcraft-claim-monitor-relay` and preparing an exact immutable
  `origin/main` release;
- protected environment/key ownership and permissions;
- Relay-only web, worker, collector, backup units, timers, helpers, and health;
- the one-time supervised Caddy merge, validation, rollback copy, and explicit
  prohibition on routine Caddyfile replacement;
- a restricted `relay-deploy` account and updater-only sudo permission;
- creation of the new repository's protected `relay-preview` environment,
  required reviewer, main restriction, and isolated secrets;
- manual workflow operation, diagnostics, exact-revision break glass,
  encrypted backup retention, guarded cleanup, privacy-deletion-ledger replay,
  supervised restore, and automatic code rollback;
- before/after public checks explicitly confirming the maintained app remains
  running and untouched.

## TDD and verification

RED:

- Focused contracts were changed before deployment implementation.
- `node --test` over the six focused contract files produced 43 tests:
  21 passed and 22 failed for the expected Relay isolation, artifact removal,
  Discord execution override, Caddy immutability, workflow, README, and runbook
  gaps.
- The untouched baseline deployment set also exposed one stale assertion:
  `database-schema-version` was already `3` while its test expected `2`.
- Review then added two more RED safety contracts: 24 scoped workflow/updater
  tests produced 22 passes and 2 expected failures for raw GitHub output and
  incomplete helper restoration.

GREEN/final:

- `node --test scripts/test/deploy-*.test.mjs`
  - 50 tests; 39 passed, 0 failed, 11 skipped on Windows because Bash is not
    available.
- Focused deployment plus Relay/server-health boundaries
  - 57 tests; 46 passed, 0 failed, 11 skipped.
- `corepack pnpm --filter @workspace/bitcraft-local test`
  - 1,572 tests passed, 0 failed, 0 skipped.
- `corepack pnpm --filter @workspace/bitcraft-local run build`
  - production server/bindings build, asset verification, TypeScript check,
    and client build completed successfully.
- `node --check` passed for `backup-crypto.mjs`,
  `collect-server-health.mjs`, `replay-privacy-deletions.mjs`, and
  `monitoring-history.mjs`.
- `git diff --check` passed; Git emitted only expected Windows
  LF/CRLF-conversion notices.

Validation limits:

- This Windows environment has no Bash, `systemd-analyze`, or Caddy executable,
  so Bash integration tests, real unit validation, and real Caddy validation
  could not run locally.
- The GitHub verification job explicitly runs `systemd-analyze verify` for all
  six Relay units and `caddy validate --config deploy/Caddyfile.example` before
  deployment.

## Self-review

- Re-read all twelve requirements and global constraints against the diff.
- Searched active deployment artifacts and documentation for maintained paths,
  port, updater, and unsuffixed unit names. The only retained maintained port is
  the required coexistence route in `deploy/Caddyfile.example`.
- Confirmed no task changed SQLite data, secrets, changelog, package version,
  application runtime logic, production domain routing, GitHub/VPS state, or
  the maintained checkout.
- Confirmed updater failure paths still retain the candidate, restore the prior
  application release and all previously installed backup/privacy helpers, and
  never restore SQLite automatically.
- The standards review identified raw GitHub journal publication and partial
  staged-helper rollback; both were covered by RED contracts and corrected
  before commit. Its duplicated-test-blacklist observation was left explicit
  because readable, independent boundary contracts are preferable in this
  high-risk deployment task.

## Concerns and follow-up gates

- Linux-only Bash integration, systemd, and Caddy validation must pass in the
  workflow before creating or approving the preview deployment.
- The `relay-preview` GitHub environment/secrets, deployment account, fresh
  directories/keys/database, and supervised Caddy merge intentionally remain
  external follow-up work.
- The first successful preview deployment and a forced-failure rollback must be
  observed in a supervised window before beginning the soak.

## Follow-up review fixes

A separate follow-up commit on top of `026e2bb404c4c883dd31f81b37ebc608633868e1`
addresses all five deployment-review findings:

1. The private repository bootstrap now uses a dedicated read-only GitHub
   deploy key owned by `bitcraft`, an SSH remote, an explicitly verified and
   pinned `known_hosts` file, and strict host-key checking. The runbook
   explicitly leaves deploy-key write access unchecked and never embeds a PAT
   in a GitHub URL.
2. The updater now takes a private transaction snapshot of the current
   symlink, updater, all three helper paths, and all six live Relay unit paths
   before its first live mutation. Any later failure restores exact prior
   presence/content, reloads systemd, and restores the prior web, worker, and
   backup-timer runtime state.
3. `deployment_succeeded=1` is now set only after the candidate updater is
   installed, the backup timer is enabled/started, and release pruning
   completes.
4. Updater logs now use root-owned mode-`0700`
   `/var/log/bitcraft-claim-monitor-relay` and an unpredictable `mktemp` name;
   logs are mode `0600`. A test override must name a path that does not already
   exist and is created with shell noclobber semantics.
5. The runbook sets `umask 077` before the first key write and documents final
   `0600`/`0640` key modes.

Follow-up TDD:

- RED: `node --test scripts/test/deploy-update-script.test.mjs` produced
  20 tests, with 14 passing and 6 expected failures covering the five findings.
- GREEN: the focused updater contracts passed 21/21, including a guard proving
  help and pre-snapshot exits cannot trigger rollback.
- Targeted deployment and boundary verification passed 56/56 runnable tests;
  12 Bash integration tests were skipped because Bash is unavailable on this
  Windows host. The Linux-only set now includes explicit failures immediately
  after unit installation and immediately after backup-timer enablement.
- `git diff --check` passed with only expected Windows LF/CRLF notices.

The full application suite and production build were not repeated for this
follow-up because it changes only the deployment shell script, its focused
tests, and the runbook; no application runtime or TypeScript code changed.
Linux-only Bash, systemd, and Caddy checks remain mandatory workflow gates.
