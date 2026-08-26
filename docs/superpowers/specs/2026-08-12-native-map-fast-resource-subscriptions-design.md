# Native Map Fast Resource Subscriptions

## Outcome

Selected resources appear with BitCraftMap-like responsiveness while the Claim Monitor browser remains same-origin and provider-neutral. The server keeps configured regional Relay connections warm, manages each resource type as an independent subscription and cache, and composes selected cached types into the existing map snapshot contract.

Terrain and roads remain pre-generated artifacts. Resource positions remain live, event-driven data because the source changes as resource entities are inserted, updated, and deleted.

## Evidence

The current BitCraftMap implementation does not pre-generate resource positions. It opens regional SpacetimeDB connections, installs filtered `resource_state` and `location_state` join subscriptions for selected resource IDs, bulk-populates a client SDK cache when each subscription applies, and applies live row changes to per-type canvas layers. Its generated catalog and static map artifacts are separate from live resource positions.

Claim Monitor currently starts a server session keyed by the complete combination of claim, region, players, resources, and enemies. Changing one resource selection creates a cold combination, repeats unchanged resource work, and may exceed the snapshot route's two-second initial wait. The browser then temporarily receives zero resources marked unavailable even though the new subscription later completes successfully.

The detailed comparison is recorded in `docs/research/bitcraftmap-resource-loading-architecture.md`.

## Architecture

### Regional connection ownership

The server owns one reusable Relay connection context per configured active region. The primary monitored region stays warm while the map service is enabled. Additional configured regions are opened on demand and released after a bounded idle period.

Browser code never receives Relay topology, credentials, SDK records, or direct upstream URLs. Existing schema-fingerprint validation, topology discovery, reconnect/backoff behavior, and health reporting remain mandatory.

### Independent resource subscriptions

Resource subscriptions are keyed by the typed identity `(regionId, resourceId)`, not by the complete browser selection combination. Each key owns:

- two bounded join queries for `resource_state` and `location_state` filtered by the selected resource ID;
- one complete normalized point generation;
- readiness, health, observation time, row count, and warning state;
- a lease count and idle-expiry timer; and
- an independent generation counter used for event notification.

Adding resource B while resource A is already selected starts or leases only B. It does not reconnect A, discard A's cache, or repeat A's initial population. Removing B releases its lease but retains its cache for a bounded reuse window. A later B selection can therefore return immediately when its cached generation is still usable.

Player and enemy collection remain separately keyed and retain their privacy and verification rules. This change does not broaden those scopes.

### Complete-generation commits

Each resource-type subscription builds a complete normalized generation only after its filtered Relay subscription has applied. Resource and location rows are joined losslessly by decimal-string entity ID, restricted to overworld dimension `1`, and checked against verified world bounds.

Insert, update, and delete bursts are coalesced before rebuilding the affected `(regionId, resourceId)` generation. An incomplete join is never exposed as a valid generation. Schema mismatch or source failure retains the last usable resource generation but marks its freshness accurately.

No volatile resource-position history is written to SQLite. The cache is server memory owned by the regional resource service.

## Snapshot and event contracts

`GET /api/local/map/snapshot` keeps its current public shape. For the selected resource IDs, the route leases the corresponding per-region/type caches, waits only for missing first generations up to the bounded initial wait, and composes all usable cached generations into `layers.resources`.

Per-layer availability distinguishes:

- `loading`: a valid cold subscription is awaiting its first complete generation;
- `live`, `partial`, or `stale`: at least one usable selected generation exists, with warnings for missing types or regions; and
- `unavailable`: schema verification, access, scope, or source health makes the requested layer unusable.

An empty but successfully applied subscription is a usable zero-result generation, not an unavailable layer.

`GET /api/local/map/events` keeps a lease for every selected `(regionId, resourceId)` key. Resource generation notifications include enough typed scope metadata for the server to deliver events only to listeners whose selection contains the changed key. The browser continues to refetch the bounded provider-neutral snapshot; raw row changes are never streamed.

Equivalent resource selections share subscriptions regardless of player or enemy selections. Canonical resource ordering cannot create duplicate caches.

## Browser behavior

The current resource picker, URL state, canvas renderer, viewport framing, and layer controls remain in place.

When a newly selected type is cold, the legend displays `loading` and retains already available selected resource points. When its first generation arrives, the existing event stream triggers a coalesced snapshot refresh and the points appear. A valid empty generation displays zero results without implying a failure.

The one-time framing rule applies after the snapshot contains the complete current resource selection. Stale snapshots from a previous selection cannot consume the framing decision.

No polling loop is added. Browser snapshot requests remain single-flight, event-driven, visibility-aware, and rate-coalesced.

## Capacity and lifecycle

The service retains the existing public limits of four regions, sixteen resource types, 50,000 returned features, and 8 MiB of uncompressed JSON.

Internal limits apply independently:

- a bounded count of warm regional connections;
- a bounded count of resource-type subscriptions per region;
- the existing normalized row budget per public snapshot;
- an idle resource-cache lifetime long enough to absorb ordinary picker changes and reselection; and
- rate limiting for genuinely cold subscription creation.

The primary configured region connection remains warm, but it does not subscribe to all resource types. Resource rows remain selection-driven.

Health diagnostics expose connection count, active and idle resource subscription counts, first-generation latency, rows per type, cache age, restart attempts, and capacity rejections without logging coordinates or full user selections.

## Failure handling

- Connection failure restarts the affected regional connection with bounded backoff and recreates active resource subscriptions.
- Schema mismatch makes that region's affected resource subscriptions unavailable and retains prior usable generations as stale where safe.
- A cold subscription exceeding the initial HTTP wait remains `loading`; its SSE lease stays active and completes asynchronously.
- A failed resource type does not clear other selected types.
- Row or response budget failures return the existing bounded error contract and do not publish partial generations.
- Deselecting a resource prevents it from appearing in later snapshots even while its internal cache remains idle.

## Testing and acceptance

Focused service tests cover:

- one regional connection shared by multiple resource IDs;
- adding B without restarting or resubscribing A;
- canonical selection ordering and lease sharing;
- cold readiness, successful empty generations, and idle-cache reuse;
- insert, update, delete, reconnect, and schema mismatch behavior;
- complete-generation publication and decimal-string entity IDs;
- cache expiry and capacity enforcement; and
- scoped event delivery without cross-selection leakage.

API tests cover mixed warm/cold resource selections, partial freshness, zero-result success, public limits, and response budgets. Browser tests cover `loading` to populated transitions, preservation of already visible types, one-time framing, selection removal, visibility pause/resume, and the absence of polling or third-party requests.

Smoke acceptance uses at least two real configured-region resource types, including a cold selection such as Large Fallen Tree and a warm reselection. Targets are:

- already cached selections returned within the existing 500 ms server-boundary budget;
- adding one type does not temporarily remove previously rendered types;
- cold selections become visible through the existing event stream without manual refresh;
- warm reselection is immediate from the retained cache;
- no `429`, repeated reconnect, or failed-fetch churn occurs; and
- the browser makes no Relay or third-party map-data request.

## Out of scope

- Direct browser connections to Relay, BitJita, Prism, or BitCraftMap.
- Pre-generating or periodically snapshotting live resource positions.
- Subscribing every resource type in every region.
- Changing terrain or road generation cadence.
- Enabling unverified enemy or broader player tracking.
- Persisting volatile resource positions or history in SQLite.
