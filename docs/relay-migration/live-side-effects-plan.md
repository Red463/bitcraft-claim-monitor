# Live Relay side-effect migration

This execution slice applies the live-first policy to history and notification
side effects. Current browser data already comes from committed Relay
generations; this slice removes the remaining dependency on a periodic
BitJita-backed collector before production lifecycle and settlement events can
be observed.

## Global constraints

- A committed Relay generation is the only current game-state input.
- Current-generation publication must not wait for history, analytics, or
  Discord delivery.
- Side effects run without a browser and are serialized/idempotent.
- Last-good generations remain readable during Relay outages.
- Missing or malformed source data must not be converted to zero or used to
  close production jobs.
- SQLite remains for genuine lifecycle/history, deduplication, outbox, and the
  minimal restart-safe transition checkpoint.
- Craft contributor and authoritative completed-sale mappings remain explicit
  evidence blockers; this slice must not invent them.

## Task 1 — Production lifecycle from committed Relay crafts

- Add an event-driven server-side coordinator that receives current-state
  commit notifications and reacts only when `crafts` changed for the configured
  claim.
- Coalesce overlapping craft generations and process them sequentially.
- Read the just-committed `crafts` snapshot from `currentStateRepository`,
  enrich it from the live local catalog, and feed the existing production
  lifecycle/history/Discord path.
- Do not run the lifecycle path for a stale claim, missing snapshot, or
  malformed craft payload. Preserve existing production rows rather than
  interpreting missing data as completion.
- The repository commit returns before production history or Discord delivery
  completes. Failures are recorded in collector health but do not roll back the
  current generation.
- Remove production lifecycle execution from the periodic settlement snapshot
  loop so a craft generation is processed exactly once by one freshness owner.
- Keep the separate contribution collector untouched until contributor
  semantics are proven.
- Add focused tests that fail without the event-driven behavior, including
  coalescing, configured-claim fencing, non-blocking commit notification, and
  failure recovery.

## Task 2 — Settlement transitions from committed Relay domains

- Compose the settlement transition input from committed Relay `claim`,
  `members`, `inventories`, and `market` generations.
- Trigger transition evaluation after relevant complete generations commit;
  never wait for the periodic BitJita collector.
- Preserve exact treasury/supply values until the existing activity formatter
  intentionally formats them.
- Do not invent a building count from storage-only inventory buildings. Keep
  the last proven value or mark that metric unavailable until a complete typed
  building projection is connected.
- Retain `settlement_state_current` only as the minimal restart-safe transition
  checkpoint and document its measured independent ownership.
- Add focused restart, missing-domain, exact-value, and no-duplicate-event
  tests.

## Task 3 — Retire migrated current-data collector ownership

- Retire periodic current-state acquisition for `claim`, `members`,
  `citizens`, `players`, `inventories`, `crafts`, `market`, and catalog skills.
  A provider commit now publishes each of those domains immediately; no page or
  live side effect waits for the reconciliation cadence.
- Remove obsolete current-data collector settings, status controls, prepared
  statements, and writers. `domain_payload_current` remains the provider-owned
  normalized, atomic last-good boundary: a reconciliation task cannot overwrite
  its Relay provenance or freshness.
- Keep only the two evidence reconcilers: craft contributions and completed
  member-sale imports. Each has its own enabled/due/force decision and failure
  status, reads a complete claim-fenced committed Relay `crafts` or `members`
  input first, and cannot prevent the other reconciler, reports, maintenance,
  or current-state publication from running.
- Until the Relay contributor and authoritative sale-close mappings are proven,
  these two reconcilers make only their narrow existing BitJita evidence calls.
  This is not a claim/member/catalog/current-state fallback and does not make a
  zero-BitJita claim for this stage.
- Admin describes the remaining cadence as evidence reconciliation, not live
  data collection. The parity matrix and SQL inventory record the split, and
  focused tests prove current features remain usable with scheduled ingestion
  disabled.
