# Fast Binary Resource Pipeline Design

Date: 2026-08-14

## Context

Claim Monitor currently loads selected map resources through a server-owned Relay subscription, normalizes a complete resource generation, exposes it as sequential JSON pages of at most 20,000 rows, merges those pages into React state, and converts every row into a map feature before canvas rendering.

Production measurements on `0.55.0-beta.40` showed:

- Ghost Succulent needed about 13.7 seconds to expose the first 20,000 rows and 14.8 seconds to finish 26,305 new rows.
- Bush needed about 15.8 seconds to expose the first page and 28.6 seconds to finish 177,092 new rows.
- Starting Ferns invalidated and re-downloaded already complete partitions.
- A local 120,000-row merge took only 249 ms under a 256 MiB heap, so pure client merging is not the dominant delay.
- A single complete region/resource generation above 250,000 nodes is rejected even when it is valid.

BitCraftMap avoids these boundaries by keeping filtered SpacetimeDB subscription rows in its browser SDK cache and rebuilding only canvas layers. Claim Monitor must retain its server-owned, same-origin, provider-neutral boundary, but can adopt the useful performance properties: filtered upstream subscriptions, incremental first results, compact cached coordinates, and changes scoped to the affected resource partition.

The detailed source comparison and live evidence are recorded in `docs/research/bitcraftmap-resource-loading-architecture.md`.

## Goals

- Show the first coordinates of a representative cold dense resource within three seconds.
- Show a warm cached selection within 500 ms.
- Support at least 400,000 nodes in one region/resource partition without truncation or a node-count rejection.
- Keep additions and removals visible within two seconds while a selection is active.
- Never invalidate, refetch, hide, or republish an unchanged selected partition when another resource is selected or changes.
- Support multiple resource types across every Relay-ready region.
- Keep Relay connections, access control, schema validation, normalized identities, and provider details on the server.
- Keep server memory bounded through encoded-byte admission, active-subscription admission, and idle LRU eviction.
- Keep dense rendering canvas-based and free of DOM marker growth.

## Non-goals

- Browsers will not connect directly to Relay, BitJita, Prism, or another upstream provider.
- Resource entity IDs will not be sent to browsers or retained in browser buffers.
- Resource history will not be stored in SQLite.
- The terrain, roads, claims, players, enemies, and other map layer contracts will not be redesigned.
- Resource node clustering, heat maps, or new resource search behavior are outside this change.
- The initial implementation will not create a public or shared-CDN resource cache.

## Chosen architecture

### Server-owned live partition

One regional Relay connection continues to host filtered subscriptions for the selected resource types in that region. While a resource has at least one live lease, its subscription remains event-driven instead of disconnecting after the initial snapshot and polling every five minutes.

Each active region/resource partition owns these indexes:

- `resourceByEntity: Map<EntityId, ResourceId>`
- `coordinateByEntity: Map<EntityId, PackedCoordinate>`
- `coordinateReferences: Map<PackedCoordinate, number>`
- a sorted, unique packed-coordinate buffer representing the latest accepted generation
- a provisional coordinate set used only during cold hydration
- one dirty/delta accumulator for that resource type

The server attaches resource and location listeners before subscribing. Resource and location rows may arrive in either order, so an entity is exposed only after both its selected resource identity and overworld location are known. A coordinate is visually added on a reference transition from zero to one and removed on a transition from one to zero. Duplicate entities at one coordinate therefore produce one visual point without incorrect early removal.

Resource rows identify the affected resource type directly. Location changes use `resourceByEntity` to identify the affected type in constant time. A row callback never marks every selected resource dirty. Selecting or hydrating Ferns cannot publish a Bush generation.

### Provisional cold stream

Cold subscriptions must not wait for `SubscriptionApplied` before showing useful data. Matching coordinates collected during hydration are coalesced for approximately 300 ms and sent as provisional additions on the existing authenticated resource event stream.

Provisional data has these rules:

- it is explicitly identified as `loading` and is never a committed last-good generation;
- it applies only to the requested region/resource key;
- the browser may render it immediately;
- it is discarded on disconnect, schema failure, incomplete application, or deselection; and
- it is atomically replaced by the complete binary partition after `SubscriptionApplied` validates the full join.

The existing complete-generation safety remains authoritative. A schema fingerprint mismatch or incomplete resource/location join cannot publish a committed binary generation.

### Accepted binary generation

After `SubscriptionApplied`, the session validates the complete selected join, sorts and deduplicates its coordinates, and produces one immutable binary payload. There is no per-partition node-count ceiling.

Version 1 uses little-endian encoding:

| Field | Type | Meaning |
| --- | --- | --- |
| Magic | 4 bytes | ASCII `BCRP` |
| Version | `uint16` | `1` |
| Header bytes | `uint16` | Total header length |
| Flags | `uint32` | Reserved; must be zero in V1 |
| Region ID | `uint64` | Lossless regional identity |
| Resource ID | `uint32` | Generated `resource_state.resource_id` |
| Dimension | `uint32` | Overworld dimension `1` |
| Generation | `uint64` | Monotonic partition generation |
| Point count | `uint32` | Number of coordinate entries |
| Reserved | `uint32` | Must be zero |

The header is followed by `pointCount` coordinate entries. Each entry is exactly four bytes: `x:uint16`, then `z:uint16`. Verified world coordinates `0...38,400` fit losslessly. Coordinates are sorted by X then Z and are unique.

The browser validates magic, version, header length, requested region/resource, dimension, generation, exact body length, coordinate bounds, and sorted uniqueness before accepting a payload. Entity IDs never cross this boundary.

At 400,000 unique coordinates, the coordinate body is about 1.6 MiB. The server encodes a generation once and reuses those bytes for every authorized client requesting that generation.

### HTTP and event contracts

The existing JSON resource page endpoint remains temporarily available as an internal rollback seam, but the native client stops using it.

The new binary route is conceptually:

```text
GET /api/local/map/resource-partition
  ?region=<decimal region id>
  &resourceId=<decimal resource id>
  &generation=<decimal generation>
```

Successful responses use:

```text
Content-Type: application/vnd.timbersteel.map-resource-partition+octet-stream; version=1
Cache-Control: private, max-age=31536000, immutable
ETag: "<region>-<resource>-<generation>-v1"
```

The route enforces the existing Map-page access decision, current Relay-ready region catalogue, resource catalogue, dimension contract, and generation ownership. Query strings and coordinates are not logged. A generation-specific payload is immutable. The server retains the latest generation and a short previous-generation grace entry so in-flight clients can finish; a client that requests an evicted generation receives the current generation metadata and refetches once.

`/api/local/map/resource-events` remains the selected-scope lease and notification channel. It acquires partitions concurrently through a bounded internal semaphore and emits results independently, so one slow region cannot block all selected regions.

V1 event shapes are provider-neutral:

```ts
type ResourceEvent =
  | { type: "partition-loading"; key: string }
  | { type: "partition-provisional"; key: string; additions: number[] }
  | { type: "partition-ready"; key: string; generation: string; pointCount: number; encodedBytes: number; url: string; freshness: string }
  | { type: "partition-delta"; key: string; baseGeneration: string; generation: string; additions: number[]; removals: number[] }
  | { type: "partition-stale"; key: string; generation: string; warning: string }
  | { type: "partition-unavailable"; key: string; warning: string; retryAfterSeconds?: number };
```

Packed event coordinates are unsigned 32-bit values containing X in the high 16 bits and Z in the low 16 bits. Provisional and live changes are normally small; they remain JSON SSE metadata rather than creating a second binary streaming protocol.

Each accepted live delta is coalesced for about 300 ms, applied to the server's sorted coordinate buffer, and assigned the next generation. The server produces the next reusable binary bytes and emits a delta referencing the previous generation. The browser applies a delta only when `baseGeneration` matches its current committed buffer. On a missed, reordered, malformed, or oversized delta, it fetches the complete referenced binary generation instead.

### Browser partition store

React no longer stores dense resource rows or creates one `MapFeature` object per node. A focused resource partition store owns:

- current committed `Uint32Array` or equivalent packed coordinate buffer by partition key;
- provisional packed coordinates by partition key;
- generation, freshness, loading state, warnings, and selected resource presentation metadata; and
- abort controllers for binary fetches.

The binary decoder returns a typed coordinate view without constructing nested arrays. The store atomically replaces a provisional or older committed buffer only after complete validation.

Live deltas are sorted and merged into a new typed buffer. Rendering receives partition buffers directly. The existing canvas renderer performs viewport culling, deterministic level of detail, reusable sprite drawing, accessible point summaries, and animation-frame batching without converting the entire partition to feature objects.

Selection removal immediately deletes its provisional and committed browser buffers and cancels in-flight fetches. Adding a selection leaves all existing buffers untouched.

## Cache and admission

The server separates live subscription state from encoded last-good cache state:

- Active leases keep the filtered upstream subscription live for near-live updates.
- After the final lease is released, the upstream subscription follows a short idle shutdown window.
- The accepted encoded partition remains in a byte-accounted LRU cache for warm reselection.
- A warm selection displays the cached binary generation immediately and rehydrates live state in the background.

The default aggregate encoded cache budget is 512 MiB and is configurable through a server environment setting. This is not a node-count correctness limit. Idle entries are evicted least-recently-used before a cold admission is refused. Active selected entries are never truncated or silently evicted.

Admission also considers active regional connections, active resource subscriptions, cold-start rate, and process memory headroom. If genuine capacity is exhausted, the server rejects a new cold partition before starting its hydration, returns a bounded retry delay, and keeps all existing last-good and active partitions usable. The public health projection exposes aggregate bytes, entry counts, eviction counts, cold readiness latency, delta counts, fallback fetches, and capacity rejections without resource IDs or coordinates.

## Freshness and failure behavior

- A Relay disconnect, schema mismatch, or incomplete generation retains the last accepted encoded partition and marks it stale.
- Provisional coordinates from a failed cold attempt are discarded.
- If no last-good generation exists, that partition becomes unavailable without affecting other selected partitions.
- Stale data may be displayed with its observation time and warning, consistent with existing map freshness semantics.
- Deselecting always removes the browser layer immediately, regardless of server lease shutdown timing.
- A generation change for one key never changes another key's generation, readiness, warning, or rendered points.
- The event connection reconnects with its current generation map. The server emits deltas only when the client base is usable; otherwise it emits `partition-ready` for one full fetch.
- A binary decode failure never publishes partial committed data. The client keeps last-good and requests one clean generation.

## Security and privacy

- Both binary and event routes enforce `page:map` server-side.
- Requested regions must be Relay-ready and resource types must exist in the current normalized catalogue.
- Browsers receive only resource type, region, generation, freshness, counts, and coordinates.
- Resource entity IDs and Relay records remain server-only.
- Responses are private browser-cache entries and are never exposed through a shared CDN.
- Coordinates, full selected scopes, binary bodies, and event delta bodies are excluded from logs.
- Existing rate limiting is changed from per-20k-page pressure to bounded partition-generation requests and event connections.

## Rollout

1. Add the codec, partition cache, precise dirty tracking, binary route, event contract, and browser partition store behind the native map implementation.
2. Keep the JSON resource page route server-side for one beta release, but stop calling it from the browser.
3. Run focused memory-capped local verification only. This PC must not run the full suite, full build, world generation, or dense benchmark because previous Node processes exceeded 21 GiB and crashed the machine.
4. Run the production build, full suite, 400,000-point benchmark, and browser matrix in GitHub Actions.
5. Deploy through the protected PR/CI workflow.
6. Verify production health, cache metrics, cold and warm selections, all-region selection, near-live deltas, and unrelated-partition stability.
7. Remove the legacy JSON resource page route after one successful beta release unless it was needed for rollback.

## Tests and acceptance

### Codec and state

- Round-trip empty, small, 400,000-point, negative-invalid, maximum-bound, and malformed buffers.
- Reject wrong magic/version/header, unsafe identities, wrong dimension, body-length mismatch, unsorted/duplicate coordinates, and generation mismatch.
- Preserve 64-bit region and generation identities.
- Prove entity IDs are absent from browser payloads.
- Prove duplicate entities at one coordinate remain visible until the final reference is removed.
- Prove delta merge, missed-base recovery, deselection cleanup, and provisional-to-committed atomic replacement.

### Relay session and server

- Subscribe with the verified filtered resource/location joins.
- Pair rows correctly regardless of arrival order.
- Dirty only the resource owning the changed entity.
- Never emit another resource's snapshot during hydration or updates.
- Discard provisional state on disconnect or incomplete application.
- Retain last-good on schema mismatch and reconnect.
- Accept a complete 400,000-node fixture.
- Exercise byte admission, idle LRU eviction, active-entry protection, cold-start backpressure, and previous-generation grace.
- Verify binary access control, scope validation, cache headers, ETag behavior, bodyless failures, and redacted telemetry.

### Browser and renderer

- First provisional points appear without waiting for complete hydration.
- Independent partitions load concurrently and publish independently.
- Adding Ferns does not refetch, hide, or change Bush.
- A 400,000-point fixture creates no DOM markers and remains interactively pannable.
- Warm reselect reuses the immutable cached payload.
- Live add/remove batches appear within two seconds.
- Hidden-page pause/resume fetches only missing generations.
- Canvas tooltips, tier colours, region filtering, layer ordering, resource clearing, URL state, and accessibility summaries remain correct.

### Production gates

- Representative cold selection: first visible points within 3 seconds.
- Warm selection: visible within 500 ms.
- 400,000-point partition: no truncation, no node-budget warning, and complete usable result.
- Unchanged selected partition: zero refetches when another partition hydrates or updates.
- Near-live change: visible within 2 seconds.
- All Relay-ready regions with multiple selected types: independent progress and no cross-partition loss.
- Server: bounded cache bytes, no event-loop stall that affects health or tile delivery, and no process crash.
- No third-party browser requests for resource positions.

## Design decisions

- Server-owned Relay is retained; browser-direct Relay is rejected.
- Binary typed coordinates replace dense JSON pages.
- Entity IDs are intentionally omitted from browser data.
- Cold provisional coordinates are allowed for responsiveness but cannot become authoritative until full validation.
- Near-live changes target one to two seconds.
- Capacity is measured in encoded bytes and active work, not node counts.
- The JSON route survives for one beta as a rollback seam, not as an automatic browser fallback.
