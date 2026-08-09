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
