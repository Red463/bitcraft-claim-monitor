# BitCraft Claim Monitor Relay migration

This directory is the durable implementation record for the standalone Relay
clone. The public product name remains **BitCraft Claim Monitor**.

Locked deployment identity:

- application: `/opt/bitcraft-claim-monitor-relay`
- data: `/var/lib/bitcraft-claim-monitor-relay`
- backups: `/var/backups/bitcraft-claim-monitor-relay`
- environment: `/etc/bitcraft-claim-monitor-relay.env`
- preview: `relay.timbersteeltrade.com`
- development ports: `19428` (Vite) and `19430` (local API)
- production port: `19430`

The maintained application remains unchanged and recoverable. This clone starts
with a fresh database and does not import accounts, settings, secrets, or
history.

Live-first data policy:

- current screens and tools are event-driven and must never depend on a
  scheduled ingestion job becoming due;
- subscription-backed domains publish validated changes continuously;
- HTTP-only domains use bounded single-flight refresh loops rather than
  page-triggered upstream fan-out;
- the committed in-memory provider generation is the healthy current-state
  source, with `domain_payload_current` retained only as the generic durable
  last-good boundary;
- open pages receive local provider-neutral generation notifications;
- scheduled ingestion is a reconciliation mechanism, never something users
  normally wait for;
- new Relay domains add no dedicated current-state SQL table by default;
- a derived-current table is retained only with measured indexed-query,
  cross-process, or restart-recovery value and must update from domain events;
- legacy tables that only supported BitJita bulk fetching, rate limiting, or
  refresh orchestration are removed after dependency and recovery proofs;
- calculation-heavy features such as Craft Planner execute against
  continuously maintained local normalized indexes, so they neither repeat
  large Relay reads nor wait for a scheduled catalog build;
- browser requests and scheduled jobs never own live-data freshness: page
  navigation reads an already committed generation, while subscriptions and
  bounded provider refresh loops keep the next generation ready.

The first cross-region implementation of this policy is Public Craft Finder:
configured regional sessions follow public markers through bounded typed
joins, merge complete generations into the generic current-state repository,
and project catalog labels locally. It adds no feature-specific SQL table and
remains usable from last-good state during a Relay outage.

Local Market follows the same rule for the monitored settlement: typed
claim-scoped order subscriptions and bounded owner joins continuously publish
the generic `market` generation used by Local Market and Dashboard. Existing
market tables are not the current page source; they remain only where durable
transition history, notifications, or measured cross-region indexes still
justify them.

Implementation is dependency-ordered:

1. evidence, isolation, and traffic guardrails;
2. provider contracts, Relay HTTP claim/member slice, and last-good snapshots;
3. pinned SpacetimeDB SDK/CLI and generated catalog/regional bindings;
4. settlement operations;
5. market state and locally observed history;
6. geography, region pool, and empires;
7. collectors, Discord parity, and zero-BitJita closure;
8. seven-day preview soak, operator approval, and controlled cutover.

See [evidence-baseline.md](./evidence-baseline.md),
[diagnostic-findings.md](./diagnostic-findings.md), and
[parity-matrix.md](./parity-matrix.md). The required freshness budgets,
scheduled-job boundary, and table-retirement gates are defined in
[live-first-data-policy.md](./live-first-data-policy.md). Current SQL ownership
and retirement decisions are tracked in
[table-inventory.md](./table-inventory.md).
