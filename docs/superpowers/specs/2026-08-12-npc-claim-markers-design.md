# NPC and Tier-Zero Claim Markers Design

## Goal

Improve native-map claim presentation by slightly reducing badge size, presenting tier-zero player claims as Tier 1, and displaying Relay-backed NPC/starter towns with the supplied NPC badge.

## Data classification

The existing regional `claim_state` subscription is authoritative for both player and neutral claims. A claim is an NPC/starter town when either:

- `neutral === true`; or
- `owner_player_entity_id` normalizes to decimal string `"0"`.

Neutral claims must no longer be discarded during regional-claim normalization. They are emitted with `npc: true`. Ordinary claims are emitted with `npc: false`. Missing owner usernames are not warnings for NPC claims.

No manual town list, direct browser Relay access, or new subscription is introduced. Existing region, dimension, generation, schema, and claim-count safeguards continue to apply.

## Provider-neutral map contract

The regional claim projection carries the boolean `npc` field into claim map features. The feature retains the underlying Relay tier unchanged.

Tier-zero conversion is presentation-only:

- player claim tier `0` displays as Tier 1;
- its badge is `/map-icons/claims/claim_t1.png`;
- its glyph is `I`;
- its accessible label and tooltip say `Tier 1`.

NPC claims use `/map-icons/claims/claim_npc.png` and their accessible label and tooltip say `NPC town`. NPC presentation takes precedence over tier presentation.

## Rendering

The supplied `claim_npc.png` is copied into `apps/bitcraft-local/public/map-icons/claims/claim_npc.png` unchanged.

Claim badge geometry is reduced from 40px to 36px. The image crop is adjusted proportionally while retaining transparent presentation with no marker padding, border, background, or shadow. Claim zoom scaling and centre anchoring remain intact.

NPC towns remain part of the existing Claims layer and count. No separate layer toggle is added.

## Testing

- Normalizer tests prove neutral and owner-zero claims are retained and classified without false missing-owner warnings.
- Snapshot tests prove `npc` reaches the provider-neutral claim feature.
- Marker presentation tests prove NPC precedence and T0-to-T1 mapping.
- Map boundary/CSS tests lock the 36px badge size and proportional crop.
- Production build and full tests verify the backend/frontend contract.
- Browser smoke checks confirm ordinary, T0, and NPC claim markers remain centred and visually unclipped when fixtures are available.

## Scope

This change does not alter claim territory, claim ownership, claim tier storage, map toggles, region scope, or any non-claim marker.
