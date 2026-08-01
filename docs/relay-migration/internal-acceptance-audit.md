# Relay migration internal acceptance audit

Date: 2026-08-01  
Audited base commit: `8467b0c`  
Audit changes: recorded by the commit containing this document  
Environment: Windows development worktree, Node.js 24.15.0, pnpm 11.1.3

## Verdict

The standalone Relay clone is **internally eligible for preview deployment**.
It is **not eligible for production cutover**. Preview deployment, Linux
validation, operator confirmation, measured soak latency, market observation,
Discord production approval, and cutover rehearsal remain external gates.

This verdict means the checked-in application and its provider-neutral
boundaries passed the strongest internal gates available in this environment.
It does not claim that the public preview has been deployed or soaked.

## Internal gate results

| Gate | Result | Evidence |
|---|---|---|
| Full application tests | Pass | `corepack pnpm --filter @workspace/bitcraft-local test`: 1,589 passed, 0 failed, 0 skipped. |
| Production build | Pass | `corepack pnpm --filter @workspace/bitcraft-local run build`; provider and generated bindings compiled, client bundle built, and asset verification passed. |
| Root typecheck | Pass | `corepack pnpm run typecheck`; workspace libraries, application, and scripts typechecked. |
| Zero-provider runtime/source/build scan | Pass | Case-insensitive scan of active browser source, server, worker, development server, public files, built browser bundle, built provider bundle, Vite config, and application package found zero retired-provider names, routes, or environment keys. |
| Immutable asset provenance exception | Pass | The asset manifest contains 1,671 original source URLs solely as required build-time provenance. Runtime source and bundles contain none. |
| Route and CSP boundary | Pass | Focused tests prove no retired proxy/helper routes and enforce `connect-src 'self'` plus `img-src 'self' data:`. |
| Local assets | Pass | 1,191 local icon files verified across 8,695 catalog identities; 480 unavailable source assets remain explicit text fallbacks. Digests, duplicates, missing files, and traversal are checked. |
| SQL ownership | Pass | Every fresh table has a recorded live-first owner; explicitly retired tables are absent from bootstrap. |
| Retired-table runtime guard | Pass | The full server suite enables the SQLite authorizer guard. Focused migration tests prove retained tables remain usable and retired identifiers, including case variants, are rejected. |
| Scheduler-off ownership | Pass | Focused tests prove construction, storage, rankings, global catalog, Empire current state, membership, completed sales, production contributions, listings, regional buy orders, and planner catalog are not owned by scheduled acquisition jobs. |
| No-browser live verifier | Pass, observed 2026-08-01 | A fresh temporary SQLite database with server polling and scheduled jobs disabled, Discord startup disabled, record delivery, and no browser published fresh Relay HTTP and typed subscription generations. This audit did not contact Relay again. |
| Browser page/tab smoke | Pass, observed 2026-08-01 | The built application visited every main page and market tab listed below. Provider-disabled first loads showed the expected `503`/automatic-recovery UI, lazy routes rendered, and the browser console had zero errors. Link and refresh-copy fixes from that smoke have focused source and bundle boundary coverage. |
| Deployment contracts | Pass with platform skips | 46 passed. Fourteen updater/backup integration cases were skipped because they require Linux shell, systemd, and filesystem semantics unavailable on Windows. Static workflow, unit, Caddy, isolation, rollback, backup, and runbook contracts passed. |
| Discord record/sandbox safety | Pass | Full suite and focused boundaries prove record mode by default, no real automatic delivery, and real manual tests only to the exact configured sandbox channel. A direct isolated subprocess rerun was blocked by the managed Windows child-process sandbox; the same integration test passed in the full pnpm suite. No Discord request was made by this audit. |
| Current docs/config | Pass | Current README, environment example, application overview, and developer guide use the Relay contract, isolated paths/ports, preview record mode, and sandbox-only manual-test rules. Historical evidence and changelog references remain historical. |

Focused internal groups also passed:

- provider-neutral routes, current documentation, deployment boundaries,
  standalone repository links, refresh wording, CSP, assets, SQL inventory,
  scheduled-job ownership, and Discord sandbox boundaries: 82 passed;
- deployment and backup contracts: 46 passed, 14 Linux-only integration skips;
- contribution migration/projection and primary-region availability behavior:
  29 passed;
- standalone repository, refresh-copy, and emitted-bundle boundaries: 8 passed.

## Live verifier evidence

The 2026-08-01 live verifier published:

- fresh joined HTTP generations for claim, members, citizens, crafts, deposits,
  and inventories;
- fresh authoritative global catalogs, skills, and region state;
- fresh authoritative region-19 construction, equipment, Town Bank inventory,
  players, recruitment, research, and market state;
- a fresh partial regional-market generation.

Recorded measurements that remain valid:

- the Region 19 market base generation contained 4,057 current orders with
  coordinates for every order and 6,593 closed rows;
- the full base apply completed in 75 ms;
- identity enrichment followed 656 ms after the first base generation;
- the Town Bank generation contained 25 personal inventories and 863 occupied
  stacks with zero normalization warnings;
- the public-craft verifier published 560 usable region-19 crafts;
- the regional-claim reconnect drill published 1,115 claims before and after
  one simulated failure without scope leakage;
- the Empire verifier scoped 24 Region 19 Empires, read 5,106 notifications,
  and reproduced 22 paired starts, nine attacker wins, 14 defender wins, and
  92 unmatched terminal groups.

No p95 or p99 publication, route, or browser-paint latency has been measured.
Those budgets remain pending preview instrumentation and the seven-day soak.

## SpacetimeDB diagnostic classification

The live verifier emitted SpacetimeDB 2.7.0 client diagnostics including:

- `Updating a row that was not present in the cache`;
- `Deleting a row that was not present in the cache`;
- `Received SubscribeApplied for unknown querySetId`.

These occurred while bounded detail/owner/bank/notification query sets were
being replaced or cancelled. They were not delivered through the
application's subscription error callbacks and did not set provider health
`lastError`.

Application correctness is fenced independently of the SDK cache:

- detail subscriptions compare their current scope epoch before applying;
- global notification scopes compare scope generation and reject late
  callbacks;
- runtime sessions compare `sessionEpoch` before committing a snapshot or
  appending an event;
- current-state swaps accept complete numbered generations only.

Existing focused tests exercise cancelled scopes, late `onApplied` callbacks,
retired-session callbacks, reconnect, resubscribe, queued changes during
staging, and no mixed publication. They remained green in the full suite.
Accordingly the current evidence classifies the messages as SDK bookkeeping
diagnostics during intentional dynamic subscription replacement, not committed
generation failures. They are not suppressed: a future SDK change or preview
observation that correlates them with incomplete committed data must reopen
this classification.

The craft-contribution availability warning is separate. Invalid
experience-per-progress metadata is application input, not SDK bookkeeping.
Invalid targets are now excluded individually, their exact warnings flow
through the primary regional generation, and the `contributions` envelope is
committed with `confidence: partial`. No XP value is invented and the
condition is no longer console-only or silently healthy.

## Browser smoke scope

The documented built-app smoke visited Dashboard, Leaderboard, Members,
Professions, Craft Monitor, Planning, Inventory, Construction, Research,
Local Market, Market Overview, Browse, Deals, Buy Orders, Deal Watch, Region,
Empires, Map, Activity, Public Craft Finder, Craft Calculator, Sync, and
`/bot`.

The provider was intentionally disabled for that local smoke, so it validates
delivery, lazy-route rendering, recovery UI, and browser-console cleanliness;
it is not a live-data latency measurement. The runtime link and refresh-copy
changes are string/bundle-boundary changes and did not require a second visual
smoke.

## Known semantic reductions

- Empire cancellation is unavailable. Terminal rows remain
  `removed_or_unknown`; parity stays in progress pending authoritative evidence
  or explicit owner approval to retire cancellation parity.
- Purchaser identity is unavailable and is not inferred.
- Region trade-volume cards were removed because Relay does not provide
  authoritative equivalent evidence.
- Historical market windows are locally observed and mature progressively.

## External preview and cutover gates

The following are not satisfied by internal tests:

1. Relay operator confirmation covering intended production use, HTTP and
   WebSocket limits, adaptive multi-region load, schema/change notification,
   and incident/support expectations.
2. GitHub `relay-preview` environment and its deploy secrets.
3. Linux validation of systemd units, Caddy coexistence routing, updater
   rollback, encrypted backup integration, permissions, and service startup.
4. Deployment of `relay.timbersteeltrade.com` beside the maintained app.
5. Seven continuous days of preview soak and locally observed market history,
   with measured publication/route/browser latency, reconnects, memory growth,
   stale detection, and schema compatibility.
6. Production Discord delivery approval and a controlled channel test.
7. Cutover and rollback rehearsal, including maintained-app Discord disable,
   Caddy switch, old-service recovery, and preservation of clone data/logs.

Production approval must not be inferred from this document.
