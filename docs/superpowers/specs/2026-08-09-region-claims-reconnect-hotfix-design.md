# Regional Claims Reconnect Hotfix Design

## Problem

The Region 19 regional-claims projection subscribes to each claim owner's username with a separate Relay subscription. With 1,121 current claims, reconnecting creates more than a thousand query-set handles. Relay reconnects the socket, but the owner subscriptions do not finish applying, so the last authoritative regional-claims snapshot retains a disconnect error and Dashboard refresh cycles remain stale.

Production evidence on 2026-08-09 confirmed that the worker and other domains stayed healthy, while regional claims stopped at 00:10:43 UTC. A read-only live Relay probe confirmed that the existing three-table base query applied in 370 ms and a single subscription containing those tables plus `player_username_state` applied in 614 ms, returning 1,121 claims and 5,414 usernames. The combined 7,718 rows fit the existing 12,000-row apply guard.

## Design

- Replace the dynamic per-owner subscription fan-out with one regional subscription containing `claim_state`, `claim_local_state`, `building_claim_desc`, and `player_username_state`.
- Treat that subscription as authoritative only after its initial snapshot has normalized and committed successfully.
- Listen to changes on all four tables and coalesce them through the existing snapshot queue.
- Remove owner-query lifecycle state that is no longer needed.
- Persist the repository-global generation assigned to `domain_payload_current`, not the session-local event generation, in `provider_subscription_health`. This keeps the game-data route's heartbeat generation comparable with the stored snapshot generation.
- A disconnect continues to mark the snapshot stale. A successful re-apply commits a full snapshot, clears the stored error through the existing upsert, and records a connected heartbeat at the same global generation.

## Failure Handling

- Connection, subscription, normalization, row-budget, and persistence errors remain actionable failures.
- Socket connection alone must not clear a prior error.
- Last-good regional claim data remains available while reconnect is incomplete.
- The existing 12,000-row limit remains unchanged and prevents an unexpectedly large regional projection from being persisted.

## Tests

- Prove the session creates one subscription with the four confirmed queries and publishes only after that subscription applies.
- Prove username changes produce a new normalized snapshot without rebuilding subscriptions.
- Prove a reconnect replaces the session and the first successful post-reconnect snapshot records a clean heartbeat.
- Prove subscription heartbeat generation equals the repository-global stored generation.
- Run regional-claims focused tests, the complete backend suite, and the production build.

## Scope

No database migration, history repair, Discord delivery, HTTP interface change, or production deployment is part of implementation. Release and VPS restart require separate authorization.
