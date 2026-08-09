# Task 4 report: protected production cutover orchestration

## Outcome

Implemented the protected Relay-to-canonical production cutover as a tracked,
root-only prepare/apply/abort helper. It is reachable only through the existing
restricted updater's exact full-SHA modes and is driven by a manual, main-only,
approval-separated GitHub Actions workflow.

Files added:

- `.github/workflows/cutover-relay-production.yml`
- `deploy/Caddyfile.cutover-maintenance`
- `deploy/cutover-relay-production.mjs`
- `scripts/test/deploy-cutover-orchestration.test.mjs`
- `scripts/test/deploy-cutover-system.test.mjs`
- `scripts/test/deploy-cutover-workflow.test.mjs`

Files changed:

- `DEPLOYMENT.md`
- `apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs`
- `apps/bitcraft-local/src/server/contributionProfessionRepair.mjs`
- `apps/bitcraft-local/test/canonical-cutover-migration.test.mjs`
- `deploy/update-bitcraft-claim-monitor-relay`
- `scripts/repair-relay-canonical-cutover.mjs`

No live/VPS path was accessed, no SSH command was executed, and no Caddy,
systemd, database, key, environment, service, or Discord production state was
changed.

## Delivered behavior

### Restricted entry and durable control state

- The updater accepts only the three brief-defined argument shapes. Duplicate,
  mixed, incomplete, short-SHA, non-lowercase, and ordinary-deploy-plus-cutover
  combinations fail before the normal deployment transaction. Ordinary updater
  behavior remains unchanged.
- The helper requires updater provenance and root, then takes cutover, deploy,
  and backup locks in one fixed order. Ordinary invocations are nonblocking;
  watchdog abort waits behind an in-flight apply using that same lock order.
- State, admission evidence, manifests, and full logs are created atomically in
  root-only directories. Public output is restricted to redacted JSON summaries.

### Prepare

- Prepare proves the requested full SHA is the exact current `origin/main`, the
  Relay active-release symlink is the same SHA/version, and the expected claim,
  schemas, unit identities/states, installed paths, backup tooling/key, disk
  reserve, legal/OAuth/Discord/provider configuration, subscriptions, and live
  gateway set are valid.
- Discord checks use the effective Relay token or Task 2's source-database token
  fallback and the migrated `channels.announcements` target. They perform only
  identity/access reads and never send a message or persist/print a token.
- Caddy is adapted to normalized JSON and fails closed on unknown hosts,
  handlers, matcher types, empty OR alternatives, extra terminal behavior,
  wrong ports, non-local canaries, or missing/extraneous redirects. The tracked
  maintenance candidate gives public app/Relay traffic explicit 503 responses
  while retaining a localhost-only canonical canary and both claim redirects.
- Prepare saves and hashes the exact old Caddy file, records every old/Relay unit
  state, stops all writers/timers, proves ports and gateway workers are gone,
  checkpoints both SQLite databases, and creates authenticated encrypted backups
  of both databases/environments, Caddy, referenced branding, ledgers, current
  keys, and configured previous keys. Every artifact is decrypt-verified; SQLite
  copies also pass integrity checks; plaintext stages are removed.
- The repair and Task 2/3 manifests are frozen after writers stop. The summary
  contains only revision, counts/hashes, repair count/hash, encrypted backup
  identifiers, and the deadline of a unique 15-minute systemd abort watchdog.

### Manifest-bound contribution repair seam

Task 4 must run the outstanding contribution repair after Task 2 dry-run has
frozen the target database, but Task 2 correctly treats any later target change
as drift. The narrow seam is therefore necessary to distinguish the one approved
repair transition from arbitrary mutation.

- Dry-run records the exact repair-manifest hash and selection hash, selected
  aggregate/event IDs and count, and exact pre/post whole-database plus repaired-
  table logical fingerprints.
- Task 2 apply accepts only the manifest-bound post-repair state. It still checks
  every other protected table, rejects a changed repair selection or unrelated
  drift, and preserves the ordinary zero-selection/no-repair path.
- A read-only applied-marker verifier exposes Task 2's existing exact recovery
  and protected-table checks to Task 4 without reopening a writable transaction
  or weakening the mutation entry point.

### Apply, admission, and fix-forward

- Apply rechecks the prepared SHA/hash, maintenance identity, writer state,
  watchdog deadline, encrypted artifacts, manifests, current release, and frozen
  files/schema before mutation.
- Contribution repair runs only for a nonzero selection and is verified in both
  cases. The old privacy verification key, exact environment edit, and
  manifest-bound readiness artifact are installed and reread in the required
  order before Task 2/3 apply.
- Key, readiness, and environment recovery intents are persisted before mutation.
  Same-directory staged writes prevent partial destination publication; exact
  staging paths/sizes are state-bound so abort can clean an interrupted stage.
  Exclusive key/artifact publication never overwrites an existing destination.
- Migration verification covers Task 2's applied marker, foreign keys/integrity,
  exact table counts, exact decimal contribution/market totals without IEEE-754
  loss, privacy deletion non-resurrection, and branding/ledger state.
- Apply seeds the ordinary release-announcement marker, captures the Discord
  outbox, starts only Relay web/worker/collector/backup units, and verifies exact
  version/build/mode, generation advancement, required subscriptions, OAuth,
  one Relay gateway/no old gateway, no outbox delta, and the local HTTPS canary.
- The irreversible admission marker is written immediately before final Caddy
  install/reload. Final Caddy retry always reloads and re-adapts even when the
  candidate bytes are already installed, covering a crash after write but before
  reload.
- Every post-admission phase has a persisted checkpoint. Re-running the same
  revision/hash apply resumes only unfinished final-Caddy, public verification,
  old-unit masking, watchdog cancellation, or retention work. Completed apply is
  a no-op; abort always refuses after admission.
- Public verification covers health, pages/assets, security headers, Relay's
  permanent path/query-preserving redirect, and generation. Old units are
  stopped, disabled, and runtime-masked while files/data remain for the 14-day
  forensic window. Cutover backups retain the migration-class three-point/
  90-day policy.

### Abort and workflow

- Pre-admission abort cancels the watchdog, quiesces captured units, restores the
  exact environment bytes/metadata, removes only identity- or intent-proven key/
  readiness artifacts and their stages, restores exact Caddy and recorded unit
  states, reloads/validates Caddy, checks old public health, removes plaintext
  stages, and retains encrypted evidence/manifests/logs.
- Restoration attempts every surface after a partial failure, persists all
  failures, is safely retryable, and is idempotent once complete.
- The manual workflow is main-only and serialized. Verify runs the full app,
  build, deployment contracts, native systemd verification, and Caddy syntax
  validation. Prepare uses `relay-preview`; apply alone uses the separately
  protected `relay-cutover` environment; an always-running abort job uses
  `relay-preview` after apply failure/cancellation. All SSH jobs use the pinned
  identity/known-host pattern and publish no raw remote log.
- `DEPLOYMENT.md` documents the protected environment/reviewer setup, lock and
  recovery boundaries, fix-forward retry, retention, redaction, watchdog, and
  the reason the exact repair-transition seam is required.

## TDD and review

Implementation used isolated RED/GREEN cycles for updater delegation and normal
compatibility, argument validation, locks, all prepare/apply/abort phases,
repair/no-repair transitions, Caddy semantics, encrypted backups, privacy intent
recovery, watchdog behavior, post-admission resume, workflow protection, and
redacted output.

Two-axis review was completed:

- **Standards:** the reviewer found precision loss in operational totals. A
  failing regression covering integers beyond `Number.MAX_SAFE_INTEGER` and
  exact decimal addition led to a streaming BigInt coefficient/scale accumulator.
  Unused helper state was removed; no dependency, framework, changelog, or
  unrelated refactor was introduced.
- **Specification:** repeated review/remediation closed post-admission retry,
  watchdog lock waiting, source-token/announcement-channel discovery,
  pre-mutation recovery intent, interrupted staging cleanup, final-Caddy reload,
  unknown/extra Caddy behavior, and empty OR-matcher alternatives. The final
  reviewer result was clean with no remaining Critical or Important finding.

## Verification

Passed on the final code:

```text
node --test scripts/test/deploy-*.test.mjs
100 tests: 85 passed, 0 failed, 15 skipped

corepack pnpm --filter @workspace/bitcraft-local test
1806 tests: 1805 passed, 0 failed, 1 skipped

corepack pnpm --filter @workspace/bitcraft-local run build
exit 0; server/provider bindings, 1191 asset checks, TypeScript/Vite production
build, and Relay runtime-boundary verification passed

node --check deploy/cutover-relay-production.mjs
node --check apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs
node --check apps/bitcraft-local/src/server/contributionProfessionRepair.mjs
node --check scripts/repair-relay-canonical-cutover.mjs
git diff --check
all exited 0
```

The 15 deploy-contract skips are Linux shell/system integration cases on this
Windows host; their static contracts passed and the protected workflow runs them
on Ubuntu. The one application-suite skip is the existing Windows symlink test.
Native local `systemd-analyze verify` and `caddy validate` were unavailable on
Windows; the workflow installs/runs them before any remote prepare job.

## Operational concerns

- Do not run a cutover from this worktree. Merge the reviewed commit to `main`,
  deploy that exact full SHA successfully to Relay preview so both the active
  release and installed updater contain these modes, configure `relay-cutover`
  with main-only deployment protection and a non-initiating required reviewer,
  then invoke the manual workflow with the exact hostname confirmation.
- Task 5's custom exactly-once announcement is intentionally not implemented or
  sent here. Task 4 only suppresses the ordinary beta announcement marker.
- Production rollback is permitted only before the admission marker. A failure
  after admission must be handled by rerunning exact apply for fix-forward.
