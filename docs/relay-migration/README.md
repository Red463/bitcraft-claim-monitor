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

- subscription-backed domains publish validated changes continuously;
- HTTP-only domains use bounded single-flight refresh loops rather than
  page-triggered upstream fan-out;
- open pages receive local provider-neutral generation notifications;
- scheduled ingestion is a reconciliation mechanism, never something users
  normally wait for;
- legacy tables that only supported BitJita bulk fetching, rate limiting, or
  refresh orchestration are removed after dependency and recovery proofs.

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
