# Relay migration evidence baseline

Captured: 2026-07-29
Upstream repository: `Red463/bitcraft-claim-monitor`
Base commit: `15950d6f7f3464ab32744acd4171c8818787425d`
Base version: `0.49.1-beta.2`

The standalone clone tracks the upstream code internally as
`apps/bitcraft-local` / `@workspace/bitcraft-local`. Deployment resources use
the `bitcraft-claim-monitor-relay` identity and do not share the maintained
application's checkout, database, backups, environment file, services, or port.

## Verified Relay sources

- HTTP health: `https://relay.bitcraftsync.app/health`
- HTTP cache readiness: `https://relay.bitcraftsync.app/cache-health`
- Joined claim route: `/claim/:claimId`
- Joined members route: `/claim/:claimId/members`
- Joined inventory route: `/claim/:claimId/inventory`
- Joined crafts route: `/claim/:claimId/crafts`
- Deposit route: `/deposits?region=:regionId`
- Timbersteel Trade claim: `1369094286777412590`
- Derived primary region: `19`

Topology source names, database names, ports, and schema fingerprints are
discovered at runtime. The values observed during research are fixtures, not
configuration defaults.

## Schema fixtures

The regional and global schemas captured on 2026-07-29 were generated into two
independent binding sets with the pinned SpacetimeDB CLI and are checked against
the committed schema manifest before subscription ingestion starts.

The SDK dependency and CLI toolchain are both pinned to `2.7.0`. The verified
official CLI archive is release tag `v2.7.0-hotfix3`; platform artifact names
and GitHub-published SHA-256 digests are committed in
`apps/bitcraft-local/spacetimedb-toolchain.json`.

Bounded WebSocket handshakes and an end-to-end generated SDK subscription
succeeded against the dynamically discovered global endpoint using
`v2.bsatn.spacetimedb`. The initial live catalog generation contained 8,167
items and 636 cargo descriptions.

The documented 2.7.0 CLI still has no remote-schema generation command. The
binding sets were generated with the pinned official CLI's hidden
`--module-def` path by wrapping each Relay version-9 schema in the CLI's `V9`
`RawModuleDef` container. This is an undocumented, pinned bridge—not a stable
public CLI contract—and is recorded with the exact CLI commit in
`src/server/game-data/bindings/schema-manifest.json`. A hand-written BSATN
codec is not used.

Both schema fingerprints are enabled. Runtime ingestion refuses a fingerprint
mismatch and preserves the last-good generation until bindings are regenerated
and redeployed.

The following semantics remain cutover blockers until diagnostic subscriptions
produce durable fixtures:

- craft contributor identity and contribution amounts;
- completed sale versus removed/cancelled listing;
- global versus regional empire completeness;
- multi-region Hexite reserve calculations.

No unobserved mapping may be filled with invented data.

The legacy claim-layout diagnostic is no longer a cutover blocker. Static
usage proof found that the application had no reader for the fetched layout
payload, so the migration intentionally retires that request and persisted
payload instead of recreating an unused Relay join. Future in-app coordinate
features still require bounded entity-filtered evidence before implementation.

Bounded diagnostics have now proven member-filtered
equipment/preset/buff rows and that global rows are not a complete market
source. Exact observations are recorded in
[diagnostic-findings.md](./diagnostic-findings.md).

The Town Bank
`bank_state.building_entity_id -> inventory_state.owner_entity_id` join is
also proven, and the production primary-region session now owns that
two-stage filtered subscription. The 2026-08-01 live verifier loaded 25
personal Town Bank inventories and 863 occupied stacks with exact player
ownership and zero warnings. The generic `inventory-banks` last-good
generation is composed into the provider-neutral Inventory route without a
dedicated SQL table or scheduled job.

Regional claim rankings now use the region-scoped claim/local/tier tables and
bounded exact-owner username subscriptions. The live Region surface does not
depend on the retired scheduled claim crawl, `regionStatus` or `tradeVolume`
payloads, or a dedicated ranking table. Trade metrics remain intentionally
absent until the completed-trade evidence gate is satisfied.

The live primary-region verifier now exercises those member-filtered equipment,
preset, and buff subscriptions alongside `player_state`. Their normalized
current domain is committed without introducing a new SQL cache table.

Members now consumes that normalized `equipment` domain directly, and its
passive-craft panel consumes the normalized `crafts` domain. The selected
member's Toolbelt is the only on-demand player-inventory read: the local
provider-neutral route enforces claim membership, uses the bounded Relay HTTP
lookup, enriches tools from the typed global catalog, coalesces concurrent
requests, and keeps only a 15-second memory last-good entry. Production uses
the same local route for skill/tool eligibility. No dedicated equipment,
buff, preset, or player-inventory SQL table was introduced.

## Runtime BitJita baseline

At the base revision, runtime and presentation references were concentrated in:

- `apps/bitcraft-local/server.mjs` (proxy, collectors, jobs, Discord commands,
  market history, craft planning, empires, and diagnostics);
- `src/api/bitjita.ts` and `src/api/bitjitaEndpoints.ts`;
- page-specific player, market, craft, map, and empire fetches;
- `src/server/bitjitaProxyCache.mjs`;
- icon URL resolution in `src/utils/items.ts`;
- legacy source labels, explanatory copy, and legal acknowledgements.

The migration has removed the runtime dependency inventory. Automated source,
built-bundle, route, CSP, asset, retry, and fallback checks now reject runtime
BitJita traffic. Historical migration notes and test descriptions may retain
the provider name as evidence, but they are not executable dependencies.

## External evidence gates

- The repository owner's confirmation in
  [`asset-permission.md`](./asset-permission.md) satisfies the permission gate.
  The local manifest now verifies 1,191 vendored source-available icons and
  records 480 upstream-unavailable assets with text fallback.
- Relay operator production intent, HTTP/WebSocket limits, multi-region load,
  schema-change channel, and incident expectations have not yet been recorded.
- The seven-day observation period cannot begin until useful parity is deployed
  at `relay.timbersteeltrade.com`.

## Current completion-audit evidence

- Every fresh SQLite table has an explicit live-first ownership decision in
  [`table-inventory.md`](./table-inventory.md). Every table declared retired is
  absent from bootstrap and present in the idempotent cleanup migration; an
  automated boundary test enforces both directions.
- Relay preview web, worker, collector, backup, environment, data, and Caddy
  configuration use the isolated relay service identity and port `19430`.
  Preview Discord delivery is record-only.
- The latest full production build passed, including server/provider
  compilation and the local-asset digest check. The complete suite passed
  1,504 tests before the SQL ownership boundary added two further passing
  tests.
- The remaining functional evidence gates are explicit approval and
  implementation of the proposed Buy Order Finder presentation, authoritative
  siege completion semantics, production Relay operator confirmation, and the
  seven-day preview soak/cutover drill. Same-region confirmed local sale
  history now makes the finder technically implementable without restoring a
  scheduled price cache, but presentation approval has not yet been recorded.

## Implemented foundation evidence

- Relay topology and cache readiness are discovered rather than configured.
- Claim/member HTTP adapters use bounded timeout, retry, and circuit-breaker
  behavior.
- Claim, member, inventory, active-craft, and deposit snapshots use numbered
  atomic generations; a valid subset can still commit when another HTTP domain
  is temporarily unavailable.
- The Inventory page reads the provider-neutral inventory domain, resolves only
  referenced item/cargo keys from the local typed catalog, preserves exact
  decimal quantities, and loads item detail from normalized Relay catalog
  descriptions without a browser or server BitJita detail request.
- The Craft Monitor reads one provider-neutral claim craft snapshot. The
  provider merges Relay's incomplete and completed current-state filters, then
  the local typed recipe catalog separates progressive and passive rows without
  member-by-member browser or server BitJita craft requests.
- The local route enforces the configured claim, returns last-good stale
  envelopes, and returns `503` only when no requested domain has ever loaded.
- Discord defaults to `record` mode. Message/DM sends return auditable synthetic
  metadata without contacting Discord, command registration is rejected, and
  the gateway remains disconnected unless delivery mode is explicitly `live`.
- Browser CSP defaults are `connect-src 'self'` and `img-src 'self' data:`.
- An isolated live worker run loaded all five implemented HTTP domains as
  generation 2 in a fresh SQLite database and persisted global plus regional
  topology health for the separate web process.
- The focused build and complete automated suite are required again before
  handoff; earlier checkpoints passed without failures.
