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
- claim layout and bounded location joins;
- multi-region Hexite reserve calculations.

No unobserved mapping may be filled with invented data.

Bounded diagnostics have now proven the Town Bank
`bank_state.building_entity_id -> inventory_state.owner_entity_id` join,
member-filtered equipment/preset/buff rows, and that global rows are not a
complete market source. Exact observations are recorded in
[diagnostic-findings.md](./diagnostic-findings.md).

## Runtime BitJita baseline

At the base revision, runtime and presentation references were concentrated in:

- `apps/bitcraft-local/server.mjs` (proxy, collectors, jobs, Discord commands,
  market history, craft planning, empires, and diagnostics);
- `src/api/bitjita.ts` and `src/api/bitjitaEndpoints.ts`;
- page-specific player, market, craft, map, and empire fetches;
- `src/server/bitjitaProxyCache.mjs`;
- icon URL resolution in `src/utils/items.ts`;
- legacy source labels, explanatory copy, and legal acknowledgements.

The first Relay slice replaces claim/member collection and browser reads. The
remaining references are migration inventory, not approved long-term
dependencies. Final acceptance requires the inventory to reach zero in source,
built bundles, routes, CSP, assets, retries, and fallbacks.

## External evidence gates

- The icon files must not be vendored until the written permission artifact or
  stable reference is placed in this repository. User confirmation is recorded,
  but the permission evidence itself is not present yet.
- Relay operator production intent, HTTP/WebSocket limits, multi-region load,
  schema-change channel, and incident expectations have not yet been recorded.
- The seven-day observation period cannot begin until useful parity is deployed
  at `relay.timbersteeltrade.com`.

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
