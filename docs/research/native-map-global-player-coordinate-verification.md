# Native Map Global Player Coordinate Verification

Status: **failed evidence gate — global positions disabled**

The native map must not expose global player positions until live Relay evidence proves the complete identity and coordinate contract. The capture must use the global database through server-owned tooling, keep player identifiers and usernames out of logs and this document, and record only a redacted deterministic fixture.

Required evidence:

- `player_username_state.entity_id`, `player_lowercase_username_state.entity_id`, `signed_in_player_state.entity_id`, and `mobile_entity_state.entity_id` identify the same online player.
- Overworld mobile coordinates use dimension `1` and convert to map coordinates with `location_x / 1000` and `location_z / 1000`.
- The converted point is inside the native world bounds and exactly one deterministic `world_region_state` extent.
- A real logout/delete transition removes the live position.
- Explicit deselection and connection loss remove the position immediately.
- Exact-ID subscriptions remain bounded for 1, 20, and 100 selected identities, with row counts and normalized payload sizes recorded.

## Live result

On 13 August 2026, the server-owned verifier connected to the ready `bitcraft-live-global` source using the generated global bindings and matching schema fingerprint. It selected a bounded cohort of 100 current `signed_in_player_state` identities and applied exact-ID subscriptions for 1, 20, and 100 identities.

All 100 selected identities matched both `player_username_state` and `player_lowercase_username_state`. None matched `global.mobile_entity_state`. Therefore the proposed direct global username/entity-to-mobile join is false for the current Relay source, and no coordinate scale, region, logout, or deletion claim can safely be made from that table.

`GLOBAL_MAP_PLAYER_IDENTITY_VERIFIED` remains disabled and the All Players panel must present the position service as unavailable. A revised design may investigate exact-ID regional subscriptions across ready region modules, which is a materially different collection architecture and requires a new evidence gate before implementation.
