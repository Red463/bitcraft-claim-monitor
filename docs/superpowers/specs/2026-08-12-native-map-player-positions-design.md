# Native Map Player Positions Design

## Goal

Show exact live positions for selected online members of the monitored settlement on the app-owned map. Each visible player must have a stable, distinguishable marker colour. Player positions remain unavailable until live Relay evidence proves identity, dimension, scale, and removal behavior.

## Live verification gate

The regional verifier will use currently online monitored player entity IDs and must prove all of the following before the production gate is enabled:

1. A selected monitored `playerEntityId` directly matches `mobile_entity_state.entity_id`; no inferred identity join is permitted.
2. `mobile_entity_state.dimension` is the overworld dimension `1`.
3. Dividing `location_x` and `location_z` by `1000` produces the app's static map coordinate space and agrees with an independently known current player location.
4. The resulting point is within the verified `0..38400` world bounds and region scope.
5. Deselection removes the entity from the bounded subscription and snapshot.
6. Logout, exclusion, or loss of a current live position removes the player from the public snapshot. Offline last-known coordinates are never returned or persisted.

A missing row, mismatched schema fingerprint, failed independent coordinate comparison, or unproven deletion transition keeps the player layer unavailable. The verifier may print an explicitly selected player's temporary coordinates for operator comparison, but fixtures committed to the repository must not contain private player IDs, usernames, or exact positions.

## Server data flow and privacy

The existing map authorization fence remains authoritative. The browser may request player IDs, but the server intersects them with:

- members of the configured monitored claim;
- players currently reported online;
- the administrator's non-excluded member set; and
- the selected player IDs in the canonical map scope.

Only the resulting IDs enter bounded `mobile_entity_state` equality subscriptions, in batches of at most 100. The normalized generation retains decimal-string IDs and fixed-point integer coordinates. The public map snapshot converts mobile coordinates exactly once using `/1000`, attaches the monitored username, and includes only current, authorized rows. Coordinates and full selections must not enter request logs, durable spatial history, or diagnostic payloads.

The production constant `MAP_PLAYER_MOBILE_IDENTITY_VERIFIED` changes to `true` only after the live evidence gate succeeds and the evidence reference records the non-sensitive result. Resource and enemy verification gates remain independent.

## Marker presentation

Player colours are deterministic rather than stored or random. A small pure helper hashes the lossless decimal player entity ID into an accessible categorical palette. The same player therefore keeps the same colour across reloads, browsers, and servers. Nearby IDs must not simply map by their final digit; the hash mixes the complete string.

Markers use the derived fill colour with a high-contrast light/dark outline and an additional player glyph or ring so colour is not the only distinguishing signal. The tooltip and accessible alternative expose the player's display name and displayed map coordinate. When multiple selected players hash to the same initial palette entry, the renderer deterministically probes the remaining palette within the current visible set so visible players receive unique colours until the palette is exhausted. At palette exhaustion, colours may repeat, but labels and entity-backed marker identities remain distinct.

## Lifecycle and failure behavior

- Selection changes canonicalize the scope and replace the bounded session.
- Current online-state changes immediately change the authorized selection.
- A player absent from the latest complete live generation is absent from the public snapshot.
- A disconnected or schema-incompatible spatial session does not expose an offline last-good player point.
- Static map layers may retain last-good data independently; player positions are explicitly volatile.
- Hidden pages retain the existing paused network/render behavior and fetch the newest authorized generation when visible again.

## Testing and acceptance

Automated tests will cover:

- direct player/mobile identity queries using decimal-string IDs;
- `/1000` X/Z conversion, dimension filtering, bounds, and negative rejection;
- authorization exclusion for offline, excluded, unmonitored, and unselected players;
- deletion/disconnect behavior with no last-known player leakage;
- deterministic colours, stable reload mapping, collision probing, palette exhaustion, and non-colour labels;
- renderer lifecycle, selection changes, cleanup, and accessible player details;
- no coordinate or full-player-selection logging.

Acceptance additionally requires a live monitored-player fixture aligned with an independently known location, a logout or equivalent removal observation, a successful production build and full test suite, and a browser smoke showing distinguishable selected players with no iframe or third-party requests.

## Out of scope

- Tracking unmonitored or offline players.
- Persisting player position history or trails.
- Admin-assigned personal colours.
- Showing private positions to users who fail the configured Map-page access rule.
- Enabling enemy mobile coordinates; that remains a separate verification gate.
