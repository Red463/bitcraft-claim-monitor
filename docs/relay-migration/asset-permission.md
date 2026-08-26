# Game icon permission record

Recorded: 2026-07-29

The repository owner confirmed in the Relay migration implementation task that
written permission exists to vendor the current game icon files and instructed
the implementation to rely on that confirmation.

This record is the permission reference used by
`apps/bitcraft-local/assets/game-icons-manifest.json`.

The 2026-08-01 Relay catalog observation resolved 1,671 distinct icon paths:

- 1,191 source-available WebP files are vendored under
  `apps/bitcraft-local/public/game-icons/` and protected by recorded SHA-256
  digests;
- 480 paths returned HTTP 404 from the approved source and are recorded as
  `source-not-found` rather than replaced with invented imagery;
- 108 catalog identities had no usable icon path and continue to use the
  existing text fallback.

The build verifies every available manifest entry, rejects missing or
unmanifested files, rejects duplicate catalog identities/paths, and rejects
digest mismatches. Runtime UI requests remain local even for unavailable
assets; no remote icon fallback exists.
