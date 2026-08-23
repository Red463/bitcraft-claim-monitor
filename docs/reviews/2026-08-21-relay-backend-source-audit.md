# Relay/backend source audit — 2026-08-21

## Scope and method

This is a static, primary-source audit of the maintained `apps/bitcraft-local`
application. It follows the production data path from Relay discovery through
typed subscriptions, normalized persistence, local routes, background work,
and Discord delivery. It does not assess legacy exports, live Relay behaviour,
or the contents of the SQLite database.

> **Implementation reconciliation — 22 August 2026:** The findings below retain
> their 21 August source-audit context. Tasks 1–12 subsequently implemented the
> schema diagnostics/recovery, generation contract, market transition
> dispatcher, Discord leases, browser refresh/cache/bootstrap work, and
> disabled/report-only retention machinery. Each resolved finding has an
> explicit outcome note; unresolved source-contract or rollout limits remain
> open. This reconciliation does not claim production deployment, real Discord
> delivery, rate-profile enforcement, or history deletion.

The linked line ranges record the source positions inspected on the review
date. Later task commits moved code, so those ranges are historical evidence,
not claims about current line numbers; every linked file target still resolves
in the reconciled tree.

## Outcome summary

| Original finding | Reconciled status |
| --- | --- |
| Market snapshot/side-effect crash window | Resolved in Task 6 with atomic generation-plus-transition commit and a leased idempotent dispatcher |
| Discord concurrent claiming | Resolved in Task 4 with renewable token leases; external delivery remains at-least-once |
| Missing multi-domain coherence contract | Resolved in Task 5 with known local application generations and exact dependencies |
| Receipt age versus source age | Still a qualified upstream/provenance limitation where no source-observed timestamp exists |
| HTTP freshness inferred as typed connectivity | Resolved in Task 1 with independent persisted typed runtime state |
| Lost schema-fingerprint failure cause | Resolved in Task 1 with sanitized durable diagnostics and stale-blocker recovery |
| Duplicate initial Relay HTTP work | Not changed; remains a lower-priority startup optimization |
| HTTP-cache schema provenance/version contract | Not changed; remains a separate source-contract gap from typed bindings |

## Verified data path

1. **Discovery and HTTP cache.** `RelayHttpClient` calls Relay health,
   cache-health, claim, member, inventory, craft, deposit, player, and storage
   routes, with an 8-second timeout, one retry for transport/429/5xx failures,
   and an instance-local five-failures-per-minute circuit breaker
   ([`http.ts:11-138`](../../apps/bitcraft-local/src/server/game-data/http.ts#L11-L138)).
   Topology combines `/health` and `/cache-health`, derives global/region source
   keys and readiness, and obtains an absent publisher fingerprint by hashing
   the source schema endpoint; that derived value is cached for 45 seconds
   ([`topology.ts:7-17`](../../apps/bitcraft-local/src/server/game-data/topology.ts#L7-L17),
   [`topology.ts:68-120`](../../apps/bitcraft-local/src/server/game-data/topology.ts#L68-L120),
   [`topology.ts:174-265`](../../apps/bitcraft-local/src/server/game-data/topology.ts#L174-L265)).

2. **HTTP normalized domains.** `RelayBitCraftProvider` refreshes claim,
   members, citizens, inventories, crafts, and deposits. It verifies returned
   claim/region scope before committing available domains, marks errors per
   failed domain, and keeps the prior row when a later refresh fails
   ([`relayProvider.ts:29-36`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L29-L36),
   [`relayProvider.ts:152-361`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L152-L361)).

3. **Typed SpacetimeDB path.** A representative regional market session first
   requires a matching regional schema fingerprint and generated bindings,
   opens a typed `DbConnection`, subscribes to claim-scoped tables, then adds
   bounded username subscriptions and normalizes the rows on `onApplied`
   ([`schemaManifest.ts:16-34`](../../apps/bitcraft-local/src/server/game-data/schemaManifest.ts#L16-L34),
   [`claimMarketRegionSession.ts:159-210`](../../apps/bitcraft-local/src/server/game-data/claimMarketRegionSession.ts#L159-L210),
   [`claimMarketRegionSession.ts:213-314`](../../apps/bitcraft-local/src/server/game-data/claimMarketRegionSession.ts#L213-L314)).
   The server wires equivalent focused runtimes for catalog, primary region,
   market, crafts, claims, empires, terrain, map spatial data, and map resources
   ([`server.mjs:597-741`](../../apps/bitcraft-local/server.mjs#L597-L741)).

4. **Durability and fan-out.** Current domain envelopes live in
   `domain_payload_current`; provider and subscription health and a provider
   transition outbox have separate tables
   ([`schemaBootstrap.mjs:109-175`](../../apps/bitcraft-local/src/server/schemaBootstrap.mjs#L109-L175)).
   A commit is a `BEGIN IMMEDIATE` transaction that upserts all supplied
   domains, only replaces a row with an equal-or-newer generation, and emits a
   post-commit event ([`currentStateRepository.ts:86-112`](../../apps/bitcraft-local/src/server/game-data/currentStateRepository.ts#L86-L112),
   [`currentStateRepository.ts:217-285`](../../apps/bitcraft-local/src/server/game-data/currentStateRepository.ts#L217-L285)).
   Durable storage activity and contribution events are separately validated
   and written transactionally ([`currentStateRepository.ts:313-427`](../../apps/bitcraft-local/src/server/game-data/currentStateRepository.ts#L313-L427)).

5. **Serving and background ownership.** `/api/local/game-data` optionally
   requests a manual refresh but deliberately serves last-good envelopes after
   refresh failures; it also offers a generation endpoint and SSE notifications
   ([`server.mjs:7497-7532`](../../apps/bitcraft-local/server.mjs#L7497-L7532),
   [`server.mjs:7534-7604`](../../apps/bitcraft-local/server.mjs#L7534-L7604)).
   The worker starts periodic HTTP reconciliation, starts/reconciles typed
   runtimes, performs storage-log collection, runs the Discord outbox, and
   evaluates server-health incidents ([`server.mjs:9964-10259`](../../apps/bitcraft-local/server.mjs#L9964-L10259)).
   Production roles separate web from background jobs (`web` has no background
   jobs and `worker` has no HTTP server) ([`processRole.mjs:1-12`](../../apps/bitcraft-local/src/server/processRole.mjs#L1-L12)).

## Findings

### Original P1 — Market commits had a history/notification crash window

`RelayClaimMarketRuntime` first commits the new market snapshot, then queues
its transition callback on a separate in-memory promise chain
([`claimMarketRuntime.ts:191-247`](../../apps/bitcraft-local/src/server/game-data/claimMarketRuntime.ts#L191-L247)).
The server supplies that callback to calculate market transitions and kick the
Discord outbox ([`server.mjs:668-685`](../../apps/bitcraft-local/server.mjs#L668-L685)).
Consequently, a process exit after the snapshot commit and before the callback
runs leaves the current state advanced without the corresponding market
history/activity/notification side effects. The repository already provides
`commitGenerationWithTransition`, which inserts a provider transition outbox in
the same transaction, but this market runtime calls `commitGeneration` instead
([`currentStateRepository.ts:156-176`](../../apps/bitcraft-local/src/server/game-data/currentStateRepository.ts#L156-L176),
[`currentStateRepository.ts:217-293`](../../apps/bitcraft-local/src/server/game-data/currentStateRepository.ts#L217-L293)).

**Recommendation:** make market transition calculation a durable
post-commit consumer: write a deterministic transition payload with the market
generation using `commitGenerationWithTransition`, replay pending transitions
at worker start, and acknowledge only after history and Discord enqueue commit.
That makes the state/side-effect boundary recoverable rather than process-local.

**Implemented outcome (Task 6):** A winning market generation and compact
version-1 transition now commit together. A worker-owned dispatcher claims the
transition with a SQLite lease, applies idempotent market history, authoritative
trades, activity, and durable Discord enqueue in one transaction, and
acknowledges only with the active token. File-backed close/reopen tests prove
restart recovery and exactly-once durable effects under replay. Network delivery
remains outside this transaction and was not exercised against real Discord.

### Original P1 — Discord outbox delivery lacked an atomic cross-process claim

The generic outbox query selects `pending`/`failed` rows but does not update a
row to a leased/processing state before the network send; the subsequent status
updates identify a row only by `id`
([`preparedStatements.mjs:327-345`](../../apps/bitcraft-local/src/server/preparedStatements.mjs#L327-L345)).
The runtime protection is only the `discordNotificationOutboxRunning` boolean,
which is process-local, and the row is sent before it is marked `sent`
([`server.mjs:4012-4077`](../../apps/bitcraft-local/server.mjs#L4012-L4077)).
Thus any two processes that invoke the generic consumer can read and deliver the
same row; the schema's `locked_at` column exists but this generic path does not
use it ([`schemaBootstrap.mjs:637-654`](../../apps/bitcraft-local/src/server/schemaBootstrap.mjs#L637-L654)).

**Recommendation:** claim rows in a short SQLite transaction (`pending` →
`processing`, owner and expiry), send only claimed rows, and recover expired
leases on worker startup. Retain the source-key uniqueness for enqueue
deduplication, but do not treat it as a delivery lease.

**Implemented outcome (Task 4):** The outbox now uses short `BEGIN IMMEDIATE`
claims, unique lease tokens, post-lock clock sampling, conditional renewal
before each outbound request, token-conditioned completion, and expired-lease
recovery. Two-connection and loopback fake-origin tests cover concurrent claims,
writer-lock timing, lost ownership, and fan-out. External delivery remains
at-least-once because Discord acknowledgement cannot join the SQLite
transaction; canonical unknown outcomes retain stricter suppression.

### Original P1 — Multi-domain responses did not declare snapshot coherence

The repository makes each domain current independently and permits a batch
where only successfully fetched domains advance ([`currentStateRepository.ts:225-252`](../../apps/bitcraft-local/src/server/game-data/currentStateRepository.ts#L225-L252),
[`relayProvider.ts:252-350`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L252-L350)).
`gameDataResponse` then reads requested domains one at a time, returns only a
request-time `generatedAt`, and omits the stored generation from each public
domain envelope ([`gameDataRoute.ts:275-339`](../../apps/bitcraft-local/src/server/game-data/gameDataRoute.ts#L275-L339)).
The route separately exposes generation and SSE events
([`server.mjs:7497-7532`](../../apps/bitcraft-local/server.mjs#L7497-L7532)).

This means a page that combines, for example, claim, members, inventories, and
crafts can receive a valid but mixed-time view and cannot determine that fact
from the body. Partial errors communicate failure, but not cross-domain
consistency.

**Recommendation:** define an explicit read contract: either publish and
return a complete generation pointer for a declared domain set, or include
`generation`, `receivedAt`, and a `coherent`/`mixedGenerations` indicator in
every response. This would turn the existing per-domain cache into a clear
deep module instead of making callers infer atomicity.

**Implemented outcome (Task 5):** The response now exposes `meta.coherence`,
known available generations, and a `domainStatus` entry for every requested
domain. Exact catalog, inventory-bank, and public-craft application-generation
dependencies participate. Unknown dependencies fail closed as mixed without
inventing a generation. React preserves and bounds status/provenance/warning
presentation. Coherence means only known local application publications, not
simultaneous upstream observation.

### Remaining P2 — Some freshness still measures local receipt time

The HTTP provider sets `sourceObservedAt: null` and uses `receivedAt` in its
provenance ([`relayProvider.ts:191-207`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L191-L207),
[`relayProvider.ts:269-339`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L269-L339)).
The typed market runtime does the same ([`claimMarketRuntime.ts:200-217`](../../apps/bitcraft-local/src/server/game-data/claimMarketRuntime.ts#L200-L217)).
The public envelope computes age from `sourceObservedAt ?? receivedAt`
([`gameDataRoute.ts:282-317`](../../apps/bitcraft-local/src/server/game-data/gameDataRoute.ts#L282-L317)).

Therefore a newly received Relay cache response can be reported fresh even when
the upstream snapshot it represents is old; the API cannot distinguish source
lag from delivery lag. This is particularly important during a Relay upstream
stall that still serves cached JSON.

**Recommendation:** carry a Relay source-observed timestamp/revision through
the topology/session/HTTP adapters when the source supplies one, and expose
both `sourceAgeMs` and `receivedAgeMs`. If the source has no timestamp, label
the metric explicitly as receipt age rather than freshness.

**Current status:** This remains a qualified limitation. Contracts preserve
`sourceObservedAt` and `receivedAt`, but domains without source evidence still
fall back to local receipt age. Documentation does not relabel receipt time as
upstream observation.

### Original P2 — Web health could infer typed connectivity from HTTP polling

When a runtime is absent locally but a persisted snapshot exists,
`runtimeHealthWithPersistedSnapshot` marks its subscription connected if the
provider's last refresh is recent ([`persistedRuntimeHealth.ts:26-57`](../../apps/bitcraft-local/src/server/game-data/persistedRuntimeHealth.ts#L26-L57)).
The health assembler uses that helper for global catalog, primary region,
public crafts, claim market, regional market, claims, and empires
([`server.mjs:809-857`](../../apps/bitcraft-local/server.mjs#L809-L857)).
However the provider's refresh path is HTTP cache domains
([`relayProvider.ts:29-36`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L29-L36)),
while typed subscription health is stored separately
([`currentStateRepository.ts:137-155`](../../apps/bitcraft-local/src/server/game-data/currentStateRepository.ts#L137-L155)).

In a separate web/worker deployment, this can present a typed subscription as
connected merely because the worker's HTTP cache polling is recent, even if
that specific typed subscription has stopped updating.

**Recommendation:** hydrate each runtime's persisted health from
`provider_subscription_health` and apply a per-domain heartbeat freshness
threshold. Keep HTTP-provider liveness as a separate field, not a proxy for
SpacetimeDB subscription liveness.

**Implemented outcome (Task 1):** Typed runtime state is persisted separately
as connected, disconnected, or blocked-by-schema and web health projects that
heartbeat rather than HTTP poll freshness. Matching publisher evidence also
clears a previously persisted schema blocker without downloading the schema
again.

### Original P2 — Schema-fingerprint acquisition failures lost their cause

Topology discovery catches schema endpoint failures and leaves a source
topology-ready with a null fingerprint ([`topology.ts:243-265`](../../apps/bitcraft-local/src/server/game-data/topology.ts#L243-L265)).
A typed runtime subsequently reports only that the region is not ready *or* has
no fingerprint ([`claimMarketRuntime.ts:140-150`](../../apps/bitcraft-local/src/server/game-data/claimMarketRuntime.ts#L140-L150)); the schema validator itself gives a useful mismatch error only once an
observed value is supplied ([`schemaManifest.ts:16-26`](../../apps/bitcraft-local/src/server/game-data/schemaManifest.ts#L16-L26)).

This preserves last-good data, but loses the fetch status/HTTP error needed to
diagnose whether the remediation is Relay recovery, a networking issue, or a
bindings deployment.

**Recommendation:** preserve `schemaFingerprintError`, attempt timestamp,
schema URL/source key, and expected fingerprint in topology health; surface
them in `/api/local` diagnostics without exposing credentials.

**Implemented outcome (Task 1):** Topology/runtime health now persists a
sanitized diagnostic with source key, operational schema URL, expected and
observed fingerprints, attempt time, status, and bounded error. Credentials,
schema bodies, and arbitrary upstream response text are redacted. Fresh global
and regional schemas were captured and verified; live typed verification passed
for both, and the six-domain built smoke included buildings.

### Remaining P3 — Initial worker startup duplicates core Relay HTTP work

Provider startup refreshes `claim`, `members`, and `citizens`
([`relayProvider.ts:69-96`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L69-L96)).
The worker's first scheduled reconciliation then asks the same provider to
refresh those domains again along with inventories, crafts, and deposits
([`server.mjs:10169-10225`](../../apps/bitcraft-local/server.mjs#L10169-L10225)).
The first worker cycle therefore repeats the claim and member endpoints before
the normal interval has elapsed.

**Recommendation:** either let `start()` perform the complete initial domain
set or make the scheduler's first request omit domains already loaded in the
startup generation. This reduces initial Relay/cache load and startup churn.

**Current status:** Not changed by Tasks 1–12. It remains a lower-priority
startup optimization; the public bootstrap work in Task 11 addressed browser
auth/config duplication, not this provider-internal HTTP overlap.

### Remaining P3 — HTTP-cache domains lack an explicit schema/version contract

Discovery records a schema fingerprint for ready sources
([`topology.ts:190-219`](../../apps/bitcraft-local/src/server/game-data/topology.ts#L190-L219)),
and typed sessions enforce it before loading bindings
([`claimMarketRegionSession.ts:159-184`](../../apps/bitcraft-local/src/server/game-data/claimMarketRegionSession.ts#L159-L184)).
The HTTP provider only requires that the claim region is ready
([`relayProvider.ts:165-189`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L165-L189))
and persists `database: null`, `schemaFingerprint: null`, and no source-observed
time for its normalized records ([`relayProvider.ts:191-207`](../../apps/bitcraft-local/src/server/game-data/relayProvider.ts#L191-L207)).

This is a reasonable separation if Relay HTTP has an independently versioned
contract, but the code does not record or validate such a contract. A cache
payload shape change can therefore evade the typed-binding fingerprint gate and
become a normalizer failure or a partial mixed generation.

**Recommendation:** make the HTTP cache contract explicit: persist a cache
schema/version fingerprint when Relay exposes one, validate it at the adapter
boundary, and include it in provenance. Keep this separate from the
SpacetimeDB binding fingerprint rather than applying typed bindings to HTTP.

**Current status:** Still open. HTTP-cache DTO validation and typed
SpacetimeDB fingerprint validation remain intentionally separate contracts.

## Recommended seam shape

The existing files point toward a small set of durable boundaries rather than a
large refactor:

* **Relay source adapter:** own topology, HTTP cache contract, source revision,
  fingerprint acquisition, and error evidence.
* **Generation store:** own atomic complete-generation publication and
  per-domain last-good reads; expose a response-ready coherence descriptor.
* **Transition dispatcher:** consume `provider_transition_outbox` idempotently
  for market/production/settlement side effects.
* **Delivery worker:** claim and lease Discord outbox rows in SQLite, so
  process-role deployment cannot change delivery semantics.
* **Health projector:** project stored source/subscription heartbeats to web
  processes without inferring typed connectivity from unrelated HTTP polling.

These seams follow responsibilities already present in the topology client,
current-state repository, provider-transition outbox schema, process-role
model, and health projector rather than requiring a new framework
([`topology.ts:230-279`](../../apps/bitcraft-local/src/server/game-data/topology.ts#L230-L279),
[`currentStateRepository.ts:37-85`](../../apps/bitcraft-local/src/server/game-data/currentStateRepository.ts#L37-L85),
[`schemaBootstrap.mjs:136-175`](../../apps/bitcraft-local/src/server/schemaBootstrap.mjs#L136-L175),
[`processRole.mjs:9-12`](../../apps/bitcraft-local/src/server/processRole.mjs#L9-L12),
[`persistedRuntimeHealth.ts:26-57`](../../apps/bitcraft-local/src/server/game-data/persistedRuntimeHealth.ts#L26-L57)).

The reconciliation followed that seam shape rather than introducing a new
framework: Task 1 deepened the source/health projector, Task 5 the generation
read contract, Task 6 the transition dispatcher, and Task 4 the delivery
worker. The provider-internal duplicate startup fetch and explicit HTTP-cache
version contract remain open.

## Verification

For the original 21 August audit, only documentation was added: it was
source-inspected and ran no build, tests, server, Relay request, or SQLite
mutation. The post-review outcomes above are reconciled from the Task 1–12
implementation reports, which record focused tests, production builds, live
global/regional Relay verification, local HTTP/mounted-DOM smokes where
available, and temporary/in-memory SQLite tests. This reconciliation itself is
documentation-only and did not run production, Discord, or destructive paths.
