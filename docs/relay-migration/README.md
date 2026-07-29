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
[parity-matrix.md](./parity-matrix.md).
