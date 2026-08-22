# Task 6 report: restart-safe local-market transitions

## Outcome

Implemented a durable, leased provider-transition pipeline for claim-market generations. A winning market generation and its compact version-1 transition now commit in one SQLite transaction. A worker-owned dispatcher later claims at most 25 rows, writes idempotent market history, authoritative trades, activity, and the Discord durable outbox in one transaction, and acknowledges only with the active lease token.

Current market publication is independent of side-effect dispatch. The runtime only schedules a non-blocking kick after the atomic generation commit succeeds, and the worker loop remains the recovery path after crashes or failed kicks.

## RED evidence

Production code was not changed until the crash/concurrency contracts had failed:

- The required crash-window command failed because `marketTransitionDispatcher.mjs` did not exist; the pre-existing claim-market runtime tests still passed, proving the new contract was the missing behavior.
- Repository atomic-publication tests failed because `commitGenerationWithTransition` did not return the required publication result and did not suppress stale/equal transition rows.
- Compact-payload tests failed because `compactRelayMarketTransitionEvents` was absent.
- Bootstrap and migration tests failed because the transition lease columns, index, and additive migration exports were absent.
- A post-lock clock test then failed because claim/recovery used the caller's stale pre-lock instant. Claim, renewal, and recovery were hardened to choose the later of the injected post-lock clock and requested instant.
- A dispatch test failed because the transition writer could still kick Discord processing during the transaction. The dispatcher path now performs durable enqueue only and leaves delivery to Task 4's leased worker.
- A rollback test failed when the separately injected Discord enqueue seam did not participate in the transaction. The synchronous enqueue seam now joins the dispatch transaction and is covered by rollback evidence.

## Implementation

### Atomic generation edge

- `RelayClaimMarketRuntime` derives transition events before commit, compacts them, and commits a market `DomainSnapshotBatch` plus one transition with the exact key `claim-market:{claimId}:market:{generation}`.
- `commitGenerationWithTransition` returns `{ published, changedDomains, generation }`.
- The current-state upsert now advances only on a strictly greater generation. A stale or equal generation creates no transition row and triggers no kick.
- The durable payload contains only `version`, `claimId`, `generation`, `observedAt`, and compact derived events. It excludes full snapshots, raw provider rows, secrets, and purchaser fields.
- A `sale_confirmed` compact event is accepted only when its trade ID and exact region/entity identity match closed-listing `sale_proceeds` evidence. Ambiguous closures remain non-sales.

### Leases and recovery

- Added `locked_by`, `lease_token`, `locked_at`, and `lease_expires_at` additively to `provider_transition_outbox`, plus a lease-selection index.
- Claim, renewal, and expired-lease recovery acquire `BEGIN IMMEDIATE` before inspecting or mutating lease state.
- Acknowledgement and error recording require the active lease token. Stale workers cannot delete a recovered row or overwrite its current lease/error state.
- Errors clear the lease, increment attempts, preserve a bounded error message, and make the row eligible after exponential delay. Default delays are 5, 10, 20, 40, 80, 160, then 300 seconds, capped at five minutes.

### Transactional dispatch and Discord safety

- `createMarketTransitionDispatcher` validates version-1 transition identity and processes a maximum of 25 claims per drain.
- `applyDerived(..., manageTransaction: false)`, idempotent market history/trade/activity writes, durable Discord enqueue, and token-conditional acknowledgement share one outer SQLite transaction.
- Any derived-effect, activity, Discord-enqueue, or acknowledgement failure rolls back all effects. Error/retry metadata is recorded only after rollback.
- No Discord network work occurs during provider commit or transition dispatch. Existing Task 4 leased outbox processing performs delivery later.
- The worker role starts the bounded recovery loop. Runtime kicks call the same dispatcher and therefore the same SQLite lease rules; the in-process running flag is only a local optimization.

## Crash, concurrency, and idempotency evidence

- A file-backed temporary SQLite test commits generation 2, closes the process database before dispatch, reopens it with a new repository/dispatcher, writes all four effect classes, acknowledges the edge, and proves a second drain writes nothing.
- Two repositories over one SQLite file prove mutual exclusion. After expiry, a second worker recovers the row; the first worker's stale token can neither acknowledge nor record an error.
- A forced activity failure proves market events, trades, activity, Discord enqueue, and acknowledgement all roll back together; the transition remains pending and later succeeds once.
- Exact decimal strings above `Number.MAX_SAFE_INTEGER` survive the restart path, and `item`/`cargo` identity remains distinct.
- Existing source keys and trade IDs remain the idempotency boundaries for history effects.

## Verification

Final verification after all hardening changes:

- Required six-file focused gate: **89 passed, 0 failed**.
- Server collector/wiring contract: **14 passed, 0 failed**.
- Production build: **passed**, including server/provider TypeScript, asset verification, Vite build, and Relay runtime-boundary verification.
- Final full app suite: **2,442 tests; 2,439 passed, 0 failed, 3 skipped**. The skips are existing Windows environment constraints.
- Bounded record-only restart smoke with `DISCORD_DELIVERY_MODE=record` and `ENABLE_DISCORD_NETWORK=false`: **1 passed, 0 failed**, using a temporary SQLite database and a fresh repository/dispatcher after close/reopen.
- `git diff --check`: **passed**.

An earlier full-suite run had one stale source-contract assertion that still expected direct in-memory `writer.apply` wiring. That test was updated to assert compact derivation plus the leased dispatcher kick; the required focused gate and the final full suite were rerun after that change and passed.

## Self-review

- Confirmed transition insertion is conditional on the market upsert actually changing current state.
- Confirmed exact transition key construction and payload version validation.
- Confirmed compact payloads contain no previous/current snapshots, raw rows, purchaser object, bot token, or secret field.
- Confirmed sale persistence requires exact closed-listing evidence and does not cross claim, region, or item/cargo identity.
- Confirmed the dispatcher neither invokes `processOutbox` nor performs Discord network work.
- Confirmed Discord enqueue occurs synchronously inside the side-effect transaction and duplicate source keys remain harmless.
- Confirmed claim/recover/renew clocks are sampled after acquiring the SQLite write lock.
- Confirmed unrelated `docs/reviews/` and the untracked controller plan are excluded from Task 6 staging.

## Caveats

- Discord network delivery was intentionally not exercised. Verification used record-only/no-network mode; delivery behavior remains owned by Task 4's durable leased outbox.
- The dispatcher exposes lease renewal, but current derived batches are synchronous and bounded, so it does not run a renewal heartbeat mid-batch. Crash recovery and token-conditional completion protect correctness.
- Unsupported pre-cutover/non-version-1 rows are never replayed as arbitrary snapshots. They remain pending with bounded retry/error metadata for operator visibility.
- No controller documentation, changelog, version bump, or unrelated review artifact was changed.
