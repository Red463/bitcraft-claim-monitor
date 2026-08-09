# Task 2 report: guarded canonical data migration

## Outcome

Implemented the reusable canonical cutover migration seam and CLI without touching live or production files.

Files added:

- `apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs`
- `scripts/repair-relay-canonical-cutover.mjs`
- `apps/bitcraft-local/test/canonical-cutover-migration.test.mjs`

`BITCRAFTSYNC_EXPLORER_AUDIT.md` and unrelated files were not changed.

## Delivered behavior

- Dry-run accepts the approved source/target database and branding paths, requires the exact canonical claim, opens both databases read-only, and writes a new mode-0600 manifest.
- Apply accepts only the frozen manifest, opens only the target writable, attaches the source with SQLite `mode=ro`, acquires one `BEGIN IMMEDIATE` transaction, re-queries the complete manifest selection, and refuses any drift.
- Source and target database paths must exist as regular non-symlink files. Branding roots/assets and the manifest receive the equivalent guard. A non-empty WAL or rollback journal is rejected so file hashes describe clean checkpointed inputs.
- Required selected tables and columns are checked directly from SQLite. Selected JSON, claim/region/item/account identifiers, application/Discord IDs, account/watch relationships, administrator roles/active flags, and supported scrypt hashes fail closed when invalid or unmappable.
- The deterministic manifest records normalized schema fingerprints, frozen database file hashes, per-table selected/conflicting/replaced/retained/excluded counts, account/admin/watch/audit mappings, conflict decisions, branding metadata and hashes, a domain-separated bot-token fingerprint/presence flag, Task 3 privacy-key placeholders, and a canonical selection hash.
- Manifest/stdout/stderr never contain raw tokens, password hashes, session material, setting values, audit details, or unredacted sensitive rows. Protected target tables use content fingerprints rather than row content.
- Apply implements all approved merge rules:
  1. revokes ordinary and administrator sessions;
  2. overwrites matching old accounts by exact Discord ID, inserts missing old accounts with deterministic IDs, and retains Relay-only accounts;
  3. unions exact legal acceptances through remapped user IDs;
  4. replaces canonical administrator authorization with old identities/roles/active flags/password hashes and removes Relay-only grants;
  5. changes only the exact approved setting allowlist;
  6. copies only a non-empty `discord_bot_token`, otherwise records the Task 4 environment-token preflight requirement while retaining unrelated target secrets;
  7. overwrites/inserts craft-plan settings by `plan_key` while retaining target-only plans;
  8. updates conflicting market watches in place, inserts missing watches through remapped user IDs, retains target-only watches, and never changes deal alerts;
  9. overlays only target-defined scheduled jobs, preserves target labels/descriptions, resets runtime state, and ignores source-only retired jobs;
  10. replaces the eleven approved durable Discord preview tables in dependency order with exact source rows/IDs without delivering a message;
  11. retains Relay audit history and appends only unique old audit rows, remapping provable admin IDs and using null otherwise, including deduplication within the old source itself;
  12. stages only branding assets referenced by migrated `branding_json`, verifies supported PNG/JPG/WebP content and the 1 MiB limit, swaps the target branding directory after commit, and ignores/counts unreferenced source files. If the source branding setting is absent, target branding remains untouched.
- All non-approved target tables are marked protected in the manifest and re-fingerprinted before commit. This includes the named market/activity/settlement history, every provider/domain payload and game-catalog table, contribution/craft-audit history, deal alerts, analytics/security/GeoIP data, Discord delivery/outbox state, and other Relay-only history.
- `PRAGMA foreign_keys` is asserted enabled. `PRAGMA foreign_key_check` and every `PRAGMA integrity_check` result must be clean or the transaction rolls back.
- Branding installation and an adjacent non-secret `.applied` marker occur only after database commit. An existing marker refuses a repeat apply; a committed database also causes frozen-input drift on any attempted replay.

## TDD and self-review

The implementation began with failing CLI/manifest and full apply integration tests. Additional focused RED/GREEN cycles caught and fixed:

- accepting uncheckpointed WAL input;
- accepting malformed IDs inside durable Discord state;
- removing retained target branding when old production had no branding setting;
- appending duplicate old audit rows more than once.

Self-review checked the diff against `AGENTS.md` and every numbered Task 2 rule. It also compared the selected source columns with live build commit `15950d6f7f34`; the known legacy `market_deal_watches.last_baseline_average` REAL affinity remains compatible because migration validates the required column shape and SQLite safely writes it into the Relay TEXT-affinity target.

No remaining standards or specification findings were identified.

## Verification

Passed:

```text
node --test test/canonical-cutover-migration.test.mjs
13 tests, 13 passed, 0 failed

corepack pnpm --filter @workspace/bitcraft-local test
1762 tests, 1762 passed, 0 failed

corepack pnpm --filter @workspace/bitcraft-local run build
exit 0; server/provider bindings, asset verification, TypeScript, Vite production build,
and Relay runtime-boundary verification passed

node --check apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs
node --check scripts/repair-relay-canonical-cutover.mjs
git diff --check
all exited 0
```

Focused coverage includes all twelve merge rules, every excluded-table class, deterministic/redacted manifests, source/target/mapping/count/branding drift, already-applied refusal, unsupported source schemas, duplicate/invalid IDs, target-only users, admin revocation, all required ID remaps, absent/present token behavior, branding hash drift, exact claim enforcement, symlink/root/file guards, unmappable rows, foreign-key rollback, and a real CHECK-constraint `integrity_check` rollback.

## Operational concern

No VPS or live command was run. Task 4 must stop writers, checkpoint/freeze both databases, and supply the final files/branding roots before invoking dry-run or apply. The clean-WAL guard intentionally refuses an online/unfrozen database.

## Review remediation (2026-08-09)

The rejected Task 2 review was addressed with focused RED/GREEN regressions and a second complete verification pass.
This section supersedes the earlier selected-schema and replay descriptions: complete `.applied` markers still refuse replay, while an incomplete `.applying` phase is deliberately recoverable.

### Filesystem disjointness and recoverable finalization

- Dry-run now canonicalizes existing files/directories with `realpath`, canonicalizes planned manifest/marker/backup paths through guarded real parents, and proves mutual disjointness between the source database, target database, manifest, `.applied` marker, `.applying` recovery marker, source branding root, target branding root, and deterministic target-branding backup root.
- A database or marker nested under either branding root, nested branding roots, symlink traversal, path equality, or an unexpected pre-existing backup fails before either database is opened for selection. The reproduced case where the target database lived under the target branding root now fails before manifest creation, so the later directory swap cannot remove the database.
- Apply writes a non-secret phase-bearing `.applying` marker before `COMMIT`. It records deterministic pre/post database-state fingerprints covering the full schema and every mutated table's row count/content hash; protected tables remain verified against their manifest hashes.
- A retry with a pending marker distinguishes an uncommitted pre-state from a committed post-state. Pre-state can restart normally; post-state resumes or verifies branding installation and writes the final `.applied` marker without replaying account, audit, or other database merges. Branding backup cleanup happens only after final-marker creation and only for a branding migration.
- The recovery regression recreates a committed database with an incomplete branding/final-marker phase, reruns the same manifest, verifies the canonical logo is installed, verifies the final marker is written, and proves the audit log was not appended twice.

### Explicit selected-schema compatibility

- Every selected table is compared with an explicitly supported per-table fingerprint corresponding to live source build `15950d6f7f34` and target schema `0.52.0-beta.1`.
- Each fingerprint includes ordered columns, declared types, computed SQLite affinities, nullability, defaults, primary-key positions, foreign keys, unique and ordinary indexes (including indexed columns/order/collation/partial predicates), normalized CHECK-bearing table SQL, and triggers.
- Missing or extra selected columns, changed constraints/indexes/triggers, and all other selected-shape drift fail closed. The regression adding `user_accounts.shadow_profile` to the source is rejected.
- The only compatibility exception is documented and tested: source `market_deal_watches.last_baseline_average` may have the live build's `REAL` affinity or the current `TEXT` affinity. The target must have `TEXT`; a target with `REAL` is rejected.
- The real supported `idx_admin_users_discord_id` unique index is included in the fixture and fingerprint, making duplicate non-empty administrator Discord IDs unrepresentable at the SQLite boundary.

### Canonical IDs and branding metadata

- Decimal identifiers must now already be strings matching `0|[1-9][0-9]*`. No trimming, signs, leading-zero aliases, whitespace, or JavaScript numeric coercion is accepted. Mapping keys therefore use only previously validated canonical strings.
- Regressions reject a source account Discord ID of `' 111 '` against target `'111'` and reject an unsafe numeric Discord snowflake in JSON before JavaScript rounding can become migration input.
- `branding_json` accepts only `logo`/`favicon` entries with the server-supported exact keys, supported filename/content-type pairing, canonical ISO timestamp, and fixed same-origin `/api/local/branding/{type}` URL. External URLs and unsupported metadata fail closed.
- Apply does not copy raw branding JSON. It reconstructs the setting from the validated manifest description with the fixed same-origin URL, while filesystem staging still verifies content magic, size, and SHA-256.

### Follow-up verification

Passed on the final review-remediation code:

```text
node --test test/canonical-cutover-migration.test.mjs
22 tests, 22 passed, 0 failed

corepack pnpm --filter @workspace/bitcraft-local test
1771 tests, 1771 passed, 0 failed

corepack pnpm --filter @workspace/bitcraft-local run build
exit 0; server/provider bindings, 1191 asset checks, TypeScript, Vite production build,
and Relay runtime-boundary verification passed

node --check apps/bitcraft-local/src/server/canonicalCutoverMigration.mjs
node --check scripts/repair-relay-canonical-cutover.mjs
all exited 0
```

No production/live path was read or written, no VPS command was run, and `BITCRAFTSYNC_EXPLORER_AUDIT.md` remains untouched.
