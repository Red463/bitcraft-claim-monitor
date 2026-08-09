# Task 3 report: privacy-ledger cutover and deletion replay

## Outcome

Implemented the privacy-deletion-ledger cutover seam and integrated it with the guarded canonical migration. The migration now verifies both signing-key generations, installs a deterministic redacted ledger, and replays committed deletions against the post-migration database before commit.

Files added:

- `apps/bitcraft-local/src/server/canonicalCutoverPrivacy.mjs`
- `apps/bitcraft-local/test/canonical-cutover-privacy.test.mjs`

Files changed:

- `apps/bitcraft-local/src/server/privacyDeletionLedger.mjs`
- `apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs`
- `apps/bitcraft-local/src/server/accountDeletion.mjs`
- `apps/bitcraft-local/test/canonical-cutover-migration.test.mjs`
- `scripts/repair-relay-canonical-cutover.mjs`

No signing key was installed, no live/VPS data was read or changed, and the Task 2 selected-table mutation boundary was not expanded.

## Delivered behavior

- Dry-run requires explicit source/target privacy-ledger paths, key paths, config roots, backup roots, and a manifest timestamp. Optional target previous-key paths are explicit and repeatable.
- Every root, ledger, and key candidate is checked for containment, type, and symlink traversal. The source and current target keys must be distinct, non-empty regular files with distinct key IDs.
- Source records are fully verified with the old key. Target records are fully verified with the current key plus configured previous keys. Records fail closed on unknown fields, bad JSON, unsupported version/state, noncanonical timestamps, invalid retention, invalid key ID/subject/signature, wrong signing key, future timestamps, or internal blank lines.
- Expired records are omitted at the frozen manifest time. Exact signed duplicates are deduplicated; colliding identities with different signed content are refused. Operation IDs are isolated by signing-key generation.
- Retained records are ordered deterministically and serialized as canonical JSONL. The manifest contains only hashes, key IDs, paths, counts, expiry metadata, and previous-key configuration metadata; it never contains subjects or key material.
- Dry-run records the exact `PRIVACY_LEDGER_PREVIOUS_KEY_FILES` file-path metadata and the last retained old-key expiry. It does not copy or install a key.
- Apply revalidates the frozen manifest inputs and rechecks database drift before the ledger is changed. A second immediate privacy-input check prevents a ledger/key change between preparation and atomic installation.
- Ledger replacement uses an exclusive mode-0600 temporary file in the destination directory, file fsync, verification/readback, atomic rename, and parent-directory fsync. Pre-rename failures preserve the original ledger and remove the temporary file.
- Committed deletion subjects are replayed only after the Task 2 account merge, inside the same outer SQLite transaction. Replay removes the account and its dependent data, sessions, access rules, watches, and subject-bearing audit/delivery fields without emitting a notification or logging the subject.
- Pending, aborted, expired, and invalid records never delete an account. Replaying the same committed deletion is idempotent; source-imported or source-overwritten accounts cannot resurrect.
- Crash recovery accepts only the exact post-replay recovery fingerprint for the two protected tables intentionally scrubbed by account deletion. Every other Task 2 protected table remains under the original strict fingerprint guard.
- The CLI apply surface still accepts only the frozen manifest. Manifest and command output stay redacted.

## TDD and self-review

Implementation proceeded through focused RED/GREEN cycles for strict two-key verification, expiry/deduplication/conflict behavior, path guards, deterministic/redacted planning, drift refusal, atomic replacement, migration replay, and interrupted-apply recovery.

The self-review checked two axes:

- **Standards:** The change is confined to the active app and existing cutover CLI, adds no dependency/framework/version/changelog work, preserves default account-deletion behavior, and does not touch live paths or secret material.
- **Specification:** Every Task 3 brief item was traced to focused unit or integration coverage: explicit discovery, full verification under both key generations, expiry and merge rules, redacted manifest binding, pre-install drift refusal, durable atomic replacement, post-migration replay, idempotence/no-resurrection, secret-safe output, and previous-key metadata without key installation.

Self-review found and corrected the following before final verification:

- same operation IDs under different key generations incorrectly colliding;
- recovery before the operator has installed previous-key configuration;
- recovery fingerprints rejecting intentional privacy scrubbing of protected tables;
- optional rather than mandatory privacy CLI discovery inputs;
- no final privacy drift check immediately before ledger replacement;
- a future-dated record affecting retirement calculation;
- internal blank JSONL lines being accepted;
- post-commit recovery finalizing after the installed ledger had been rolled back to its pre-merge content.

No unresolved standards or specification finding remains.

## Verification

Passed on the final code:

```text
node --test apps/bitcraft-local/test/canonical-cutover-privacy.test.mjs apps/bitcraft-local/test/canonical-cutover-migration.test.mjs apps/bitcraft-local/test/server-privacy-deletion-ledger.test.mjs
42 tests: 41 passed, 0 failed, 1 skipped

corepack pnpm --filter @workspace/bitcraft-local test
1789 tests: 1788 passed, 0 failed, 1 skipped

corepack pnpm --filter @workspace/bitcraft-local run build
exit 0; server/provider bindings, 1191 asset checks, TypeScript/Vite production build,
and Relay runtime-boundary verification passed
```

The single skip is the focused symlink-path regression because this Windows host denied test symlink creation with `EPERM`. The production validation branch is present and the same test executes on symlink-capable hosts.

## Operational concern

Task 4 must supply the frozen production ledger/key/config/backup paths, install the old public verification-key file separately, and configure the exact manifest-recorded previous-key environment value until the recorded retirement time. This task deliberately did not install keys, access production, or run a VPS command.

## Review remediation (2026-08-09)

All six Important review findings were addressed through isolated RED/GREEN cycles.

### Commit and ledger ordering

- Dry-run now freezes an explicit target-installed old-key destination and a non-secret readiness-artifact path in the privacy plan. The previous-key environment value always uses the target destination, never the discovered legacy source path.
- Task 4 must copy the frozen old key to `previousKeyConfiguration.installedOldKeyPath`, install the exact `previousKeyConfiguration.value`, and then write the manifest-bound artifact returned by `createCanonicalCutoverPrivacyReadinessArtifact(plan, selectionHash)` at `readinessArtifact.path`.
- Apply accepts that artifact only through `--privacy-key-ready-artifact`. It verifies the installed file's key ID/hash, the exact environment metadata attested by Task 4, the merged-ledger hash, and the complete manifest selection hash before database mutation and again before ledger installation.
- The merged ledger is fully written, file-fsynced, descriptor-revalidated, parsed, signature-verified, and read back at one reserved same-directory staging path. The original ledger remains in place throughout the database transaction and deletion replay.
- The target database commits behind the durable pending marker before the staged ledger is atomically renamed. A pre-commit failure removes the stage and leaves the original current-key ledger readable. A post-commit install failure leaves the original ledger plus the pending marker; retry detects the committed database, installs the merge once readiness is restored, and finalizes without replaying the database.
- The deterministic reserved stage is reused after interruption. A safely opened single-link stale or partial stage is durably replaced; symlinked or multiply-linked stages fail closed. This prevents undiscoverable UUID-named subject-bearing orphan files.

### File identity, merge, and clock hardening

- Source/current/previous/destination key paths, source/target/stage ledger paths, and the readiness artifact are pairwise disjoint.
- Every existing key, ledger, destination key, readiness artifact, atomic target, and stage must be a regular non-symlink file with exactly one link. Reads and writes revalidate descriptor versus path device/inode/link identity before access.
- Signed-content conflicts are detected across every fully verified record before expiry filtering, so two expired records cannot hide a conflicting identity.
- The workflow no longer accepts `--privacy-manifest-created-at`. Dry-run captures the actual creation time internally and freezes it in the manifest; future-dated records fail the whole operation instead of being silently dropped.
- Replay and `deleteUserAccount` use that same frozen manifest time, including persisted access-control timestamps.

### Final self-review

The Standards axis found two additional safety gaps during review: incomplete pairwise privacy-path disjointness and undiscoverable random stage files. Both received failing regressions and were corrected as described above. The duplicated low-level identity checks in the root-bound cutover reader and injectable atomic writer remain intentionally local to their different trust/injection boundaries.

The Spec axis traced every original Task 3 requirement and all six review findings to direct unit or integration coverage. No remaining Critical or Important standards/specification finding was identified. The Task 2 selected-table mutation boundary remains unchanged.

### Final review-remediation verification

```text
node --test apps/bitcraft-local/test/canonical-cutover-privacy.test.mjs apps/bitcraft-local/test/canonical-cutover-migration.test.mjs apps/bitcraft-local/test/server-privacy-deletion-ledger.test.mjs
52 tests: 51 passed, 0 failed, 1 skipped

corepack pnpm --filter @workspace/bitcraft-local test
1799 tests: 1798 passed, 0 failed, 1 skipped

corepack pnpm --filter @workspace/bitcraft-local run build
exit 0; server/provider bindings, 1191 asset checks, TypeScript/Vite production build,
and Relay runtime-boundary verification passed

node --check apps/bitcraft-local/src/server/privacyDeletionLedger.mjs
node --check apps/bitcraft-local/src/server/canonicalCutoverPrivacy.mjs
node --check apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs
node --check scripts/repair-relay-canonical-cutover.mjs
git diff --check
all exited 0
```

The one skip remains the Windows-host symlink regression (`EPERM` while creating the test symlink); all real hard-link and descriptor-identity tests executed. No key was installed, no VPS/live path was accessed, and no production configuration was changed.

## Second review remediation (2026-08-09)

The three follow-up Important findings were addressed with focused RED/GREEN regressions.

### Cutover-wide namespace safety

- The migration-level disjointness guard now includes every privacy source/current/previous/installed key, source/target/staged ledger, and readiness-artifact path.
- Those privacy files must be pairwise disjoint from the source and target databases, manifest, `.applying` and `.applied` markers, source/target branding roots, the branding backup root, and every path inside a generated `.canonical-cutover-branding-stage-*` destructive namespace.
- Direct regressions cover a target ledger equal to either marker. A matrix covers eight privacy path roles against ten migration/destructive path classes (80 combinations), including a file nested inside a branding-stage namespace.
- The same complete invariant executes at dry-run and apply/recovery entry, before mutation.

### Reusable-stage permissions

- An exact valid deterministic stage is no longer returned through the read-only fast path. It is opened read/write, descriptor-versus-path device/inode/link identity is checked, its contents and signatures are verified, and descriptor-level `fchmod(0600)` plus file fsync are performed.
- Device/inode/link identity is revalidated after the permission change and immediately before return. The regression begins with valid mode-0644 content and observes descriptor-level repair before installation.

### Task 4 handoff ordering

The ignored authoritative `task-4-brief.md` scratch brief was updated but deliberately not added to this Task 3 commit. Its Apply order now requires Task 4 to:

1. install the old ledger key only at the manifest-approved destination using the current key's ownership/service-readable mode;
2. atomically edit and reread the exact canonical Relay environment values, including `PRIVACY_LEDGER_PREVIOUS_KEY_FILES` from the frozen plan;
3. create the manifest-bound readiness artifact only after both the key and environment edit verify;
4. revalidate that complete handshake immediately before invoking Task 2/3 apply.

Before admission, abort must restore the exact saved environment bytes and metadata and remove only the installed key/readiness artifact whose recorded identities prove this cutover created them. It must attempt those restorations even if another abort action fails. Prepare records the approved destinations and exact value in the frozen manifest but does not install or configure keys.

### Second remediation verification

```text
node --test apps/bitcraft-local/test/canonical-cutover-privacy.test.mjs apps/bitcraft-local/test/canonical-cutover-migration.test.mjs apps/bitcraft-local/test/server-privacy-deletion-ledger.test.mjs
55 tests: 54 passed, 0 failed, 1 skipped

corepack pnpm --filter @workspace/bitcraft-local test
1802 tests: 1801 passed, 0 failed, 1 skipped

corepack pnpm --filter @workspace/bitcraft-local run build
exit 0; server/provider bindings, 1191 asset checks, TypeScript/Vite production build,
and Relay runtime-boundary verification passed
```

The full suite and build were run outside the file sandbox after investigation showed the sandbox denied reads of the pinned `exceljs` package files. The isolated affected server integration tests then passed 5/5, and the full rerun passed. The sole skip remains Windows symlink creation denied with `EPERM`; hard-link, descriptor-identity, permission-repair, and namespace tests all executed. No key was installed, no live/VPS path was accessed, and the Task 2 selected-data mutation boundary remains unchanged.
