# Task 4 report: atomic Discord outbox leases

## Status

Implemented and verified on `codex/app-performance-reliability`.

Discord outbox correctness now comes from durable SQLite leases. The existing process-local running boolean remains only as a cheap same-process optimization.

## RED evidence

Production code was unchanged when the first concurrency/recovery test file was run:

```text
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-discord-outbox-lease.test.mjs

ERR_MODULE_NOT_FOUND: src/server/discordOutboxLease.mjs
tests 1, pass 0, fail 1
```

This was the expected initial RED: the requested leaser did not exist.

Additional focused RED observations before their matching production edits:

- Re-enqueuing a currently leased row changed it back to `pending` and reset attempts while leaving the lease token attached. The storage assertion caught the invalid mixed state before `enqueueDiscordNotification` was changed to preserve active leases.
- A pre-migration canonical `sending` row with no token was not recovered by the first lease implementation (`canonicalSuppressed: 0`, expected `1`). The recovery predicate was then extended to treat that row as an interrupted unknown outcome.
- The dedicated lease-migration test failed because `applyDiscordOutboxLeaseMigration` was not yet exported. The additive migration seam was then implemented.
- Duplicate-risk diagnostics reported zero for a canonical unknown outcome. The diagnostic query was then changed to include lease-expiry and canonical unknown-outcome rows.

## GREEN implementation

### Schema and migration

- Added nullable `locked_by`, `lease_token`, and `lease_expires_at` columns while reusing `locked_at`.
- Added a dedicated additive migration which preserves existing rows and installs `idx_discord_notification_outbox_lease` over `status`, `next_attempt_at`, `lease_expires_at`, and `id`.
- Verified pre-migration pending and failed rows remain intact and immediately claimable when already due.

### Lease protocol

`createDiscordOutboxLeaser(db, { workerId, leaseMs, now })` now provides:

- `claimNext({ maxAttempts })`
- `markSent({ id, leaseToken, response, finishedAt })`
- `markSkipped({ id, leaseToken, reason, finishedAt })`
- `markFailed({ id, leaseToken, error, retryAt, finishedAt })`
- `recoverExpiredLeases(at)`

Claims use a short `BEGIN IMMEDIATE` transaction, select the oldest due pending/failed row below the attempt limit, conditionally update it to `sending` with a random UUID lease token, increment attempts exactly once, read the leased row, and commit before returning it to the network path.

Every completion write requires all three predicates:

```text
id = ? AND lease_token = ? AND status = 'sending'
```

Stale tokens therefore cannot complete a row reclaimed by another worker. Sent rows are outside both claim and recovery predicates and are never reclaimed.

### Recovery and canonical cutover

- Ordinary expired leases become `failed`, are due immediately, retain their attempt count, and carry an explicit possible-duplicate warning.
- Expired canonical cutover leases become terminal `skipped` because the delivery outcome is unknown and automatic retry remains suppressed.
- Pre-migration canonical `sending` rows without tokens use the same generic recovery entry point and are also suppressed.
- Re-enqueue does not invalidate an active `sending` lease.

### Server integration and diagnostics

- `processDiscordNotificationOutbox` claims one leased row at a time and performs network delivery only after the claim transaction commits.
- Two server processes sharing one database were exercised in record mode; the automatic notification finished with one attempt and cleared lease ownership.
- Discord requests are time-bounded. The configured lease is clamped above the request timeout plus completion-write margin (strictly greater by one millisecond); defaults are 10 seconds request timeout, 5 seconds completion margin, and 60 seconds lease.
- Admin server health explicitly reports `semantics: "at-least-once"`, the timeout/margin/lease values, active leases, expired-lease rows, canonical unknown outcomes, and potentially duplicate rows.

No test sent a real Discord request. Server integration used record mode and the local fake Discord origin only.

## Verification evidence

Required focused gate:

```text
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-discord-outbox-lease.test.mjs test/server-discord-outbox-storage.test.mjs test/server-discord-sandbox-integration.test.mjs

tests 11, pass 11, fail 0
```

Production build:

```text
corepack pnpm --filter @workspace/bitcraft-local run build

exit 0
```

Fresh full suite:

```text
corepack pnpm --filter @workspace/bitcraft-local test

tests 2411, pass 2408, fail 0, skipped 3
```

The three skips are the existing Windows/environment skips. The first full-suite run exposed three stale source-contract expectations for the retired process-local statements/helpers. The two directly relevant boundary tests were updated to assert the lease seam, and the lease index was kept in its dedicated migration so the release-sensitive global index list remained stable. A focused 27-test rerun passed before the final full-suite run above.

## Self-review

- Confirmed no Relay wire records, current-state publication, schema-fingerprint gates, or unrelated server cleanup were touched.
- Confirmed claim transactions contain no network work and always commit or roll back.
- Confirmed attempts are incremented only in the conditional claim update, not on failure completion or recovery.
- Confirmed all ownership fields are cleared on sent/skipped/failed completion and recovery.
- Confirmed completion SQL contains id, token, and sending-status conditions.
- Confirmed the old unrestricted pending selection and completion prepared statements were removed.
- Confirmed enqueue conflict handling cannot reset an active leased row.
- Confirmed tests use two separate SQLite connections and two server processes against the same database.
- Confirmed maintenance hold still leaves pending and interrupted rows untouched and sends no Discord traffic.
- Confirmed no changelog, version, controller document, database, or generated build output is staged.

## Delivery semantics caveat

This is deliberately **at-least-once**, not exactly-once. SQLite leasing guarantees one active claimant, but it cannot atomically include Discord's external acknowledgement. If Discord accepts a request and the worker stops before `markSent`, expiry recovery may retry that notification and create a duplicate. Diagnostics expose this risk; canonical cutover announcements retain their stricter unknown-outcome suppression instead of retrying.

The configured lease currently exceeds the bounded Discord request timeout and completion-write margin. Any future delivery path intentionally allowed to run beyond its configured lease must add conditional renewal by the current lease token before expiry; increasing network duration without that protection would reopen concurrent-delivery risk.
