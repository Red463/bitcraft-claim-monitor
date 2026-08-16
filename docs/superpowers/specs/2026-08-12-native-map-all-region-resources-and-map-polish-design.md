# Native Map All-Region Resources and Map Polish Design

Date: 2026-08-12

## Goal

Allow the native map to track multiple selected resources across every Relay-ready region without a global 50,000-node ceiling, while correcting the NPC and watchtower marker presentation and simplifying the Biomes panel.

## Confirmed problems

### Resource row budget

The regional resource session currently rejects a subscription when the combined `resource_state` and `location_state` evidence exceeds 50,000 rows. Both filtered queries describe the same joined resource population, so this double-counts evidence rather than measuring the normalized resource nodes returned to the map. A single dense resource such as Ghost Succulent can therefore be rejected even when its final point set is materially smaller.

The compact resource route also combines all requested region/type pairs into one response. Raising the global limit would postpone the failure while retaining large JSON responses, high peak memory, and all-or-nothing loading.

### Region scope

The current region picker is populated from configured active regions, which contains only Region 19 in the observed smoke environment. Both request parsing and the resource runtime cap requests at four regions. Consequently, `All regions` means at most the first four configured regions rather than all live BitCraft regions.

### Marker presentation

NPC claims reuse the tier badge's fixed crop and overscan. The NPC artwork has different internal margins, so its outer badge edges are clipped. Watchtowers still use a temporary text glyph and are visually too similar in scale to claims.

### Biomes panel

The panel is named `Key`, uses a generic palette icon, places its instructions after the entries, and includes absent catalogue biomes as disabled `Not present` rows. The user only needs the colours that can be found in the selected terrain generation.

## Resource architecture

### Relay-ready region catalogue

The server will project a provider-neutral map-region catalogue from its existing Relay topology and global region metadata. It will expose only regional sources that are currently topology-ready and have a usable schema fingerprint. Each entry contains a decimal-string region ID, the best available region name, and readiness/freshness metadata. Missing names fall back to `Region <id>`.

The browser will use this catalogue for the resource region picker. A specific region selects that one region. `All regions` resolves to the complete, canonically sorted set of Relay-ready region IDs. The set is dynamic rather than hardcoded.

Configured claim/default/additional regions remain relevant to settlement-owned services, but they will no longer be the authorization boundary for public resource locations. Map access continues to be enforced by `page:map`, and only public resource coordinates are broadened to topology-ready regions.

### Partitioned subscriptions and responses

The existing exact filtered Relay joins remain the source of truth:

- `location_state.* JOIN resource_state ... WHERE resource_state.resource_id = <id>`
- `resource_state.* JOIN location_state ... WHERE resource_state.resource_id = <id>`

Runtime state remains partitioned by `{regionId, resourceId}`. A regional connection may share multiple selected resource subscriptions, and equivalent browser scopes share server sessions and the existing idle retention window.

The public resource API will fetch one logical partition at a time instead of serializing the entire Cartesian selection into one payload. A partition identifies one region and one resource type and returns:

- its region ID and resource ID;
- its generation and observation time;
- normalized compact resource points;
- readiness, freshness, and warnings;
- continuation metadata when the partition requires more than one response page.

Pages are generation-bound. A continuation token is valid only for the generation that created it; if the generation changes, the server asks the browser to restart that partition. Tokens remain opaque and contain no coordinates.

The browser derives the Cartesian set of selected resource IDs and selected/all region IDs, loads partitions with bounded concurrency, and merges them into a keyed canvas cache. Completion or failure of one partition does not clear other partitions. Removing a resource or region immediately removes only the associated partitions.

### Limits and budgets

The global 50,000-feature tracking ceiling will not apply to resource selections. Total tracked nodes may exceed 50,000 across types and regions.

Safety controls move to the actual boundaries they protect:

- Subscription normalization measures unique normalized resource nodes, not the sum of both join-table caches.
- Each response page has a bounded feature count and serialized byte budget.
- The browser limits concurrent cold partition requests and canvas update work.
- The server retains cold-start rate limiting and canonical scope sharing.
- Region capacity follows the discovered Relay-ready region count rather than a fixed limit of four.
- Resource-type limits remain a defensive per-region limit and must support the existing picker maximum.

If one resource/region partition is unusually dense, it is paged rather than rejected solely because the total selection is large. A true server memory or schema failure marks only that partition unavailable and preserves last-good data where safe.

### Events and refresh cadence

Resource locations remain event-driven. The server owns Relay subscriptions; browsers never connect to Relay or third-party providers.

The event stream reports changed partition generations without sending coordinates. The browser refetches only affected partitions. There is no scheduled whole-world resource regeneration and no frequent full-selection polling. Hidden pages pause new partition work and resume from current generations when visible.

### Loading and failure behaviour

The UI shows partition-aware progress such as loaded regions/partitions. Previously loaded points remain visible while new selections load. Warnings identify failed regions or resources without implying that all resource tracking failed.

Stale generations may retain last-good public resource points with an explicit stale state. Schema mismatch or unverified coordinate data remains unavailable. Deleted resource rows disappear from the next complete generation.

## Marker changes

### NPC claims

NPC claims continue to use `/map-icons/claims/claim_npc.png`, but receive a dedicated presentation class and geometry rather than the tier badge crop. The marker must preserve the full outer white and blue badge edges at every supported zoom. It remains smaller than the original oversized claim markers and stays in the claim layer.

### Watchtowers

Copy the supplied `watchtower.png` into the maintained public map icon directory and use it through the marker-presentation seam. Watchtowers use an isolated badge treatment and render smaller than claim markers to reduce clutter. They retain their own toggle, tooltip, keyboard access, and layer ordering.

## Biomes panel changes

- Rename the toolbar control and popover heading from `Key` to `Biomes`.
- Replace the palette glyph with a biome-appropriate Lucide icon, preferably `Trees`.
- Move the hover/click/Escape helper text immediately below the heading.
- Render only biome and water entries whose `present` flag is true for the current terrain generation.
- Preserve live palette-derived colours, hover preview, click-to-pin, Escape-to-clear, focus behaviour, and water-type entries.
- If no present entries are available, show a concise unavailable/empty message rather than disabled catalogue rows.

## API and security

- Both the region catalogue and resource partition routes enforce the existing `page:map` access decision.
- Region IDs and entity IDs remain canonical decimal strings.
- Only topology-ready region IDs are accepted for resource partitions.
- Invalid, stale, or forged continuation tokens return a bounded error and never broaden scope.
- Coordinates, full selections, payload bodies, and continuation contents are not logged.
- Browsers use same-origin endpoints only.

## Test and acceptance criteria

### Server and Relay

- A fixture with more than 50,000 combined join rows but fewer unique normalized nodes succeeds.
- Multiple region/type partitions can collectively exceed 50,000 nodes.
- Dense individual partitions page without loss, duplication, or cross-generation mixing.
- Relay-ready region discovery is canonical, dynamically updated, and excludes unavailable sources.
- All-region scope acquires every ready region and no unready region.
- Inserts, deletes, reconnects, schema mismatch, stale last-good, and partition failure isolation are covered.
- Access, scope validation, opaque cursors, rate limits, and privacy logging are covered.

### Browser

- The picker lists all Relay-ready regions and `All regions` tracks all of them.
- Partition loads merge incrementally; selection removal clears only removed partitions.
- One failed region leaves successful regions visible.
- Resource colours, canvas culling, stable identities, and top-layer ordering remain intact.
- NPC badge edges remain visible.
- Watchtowers use the supplied smaller badge.
- The Biomes control shows only present biome/water types with instructions at the top.

### Final verification

- Run focused tests during development.
- Run the full application test suite and production build.
- Restart the local smoke server at `http://127.0.0.1:18449/` because backend routes/runtime change.
- Browser-smoke Ghost Succulent, multiple resources, a specific region, `All regions`, marker rendering, Biomes interactions, console errors, HTTP failures, and request origin.

## Non-goals

- Direct browser Relay subscriptions.
- Persisting spatial history in SQLite.
- Removing all defensive per-response or per-session budgets.
- Broadening settlement-private player tracking beyond its existing authorization and selection rules.
- Changing terrain or road generation cadence in this work.

