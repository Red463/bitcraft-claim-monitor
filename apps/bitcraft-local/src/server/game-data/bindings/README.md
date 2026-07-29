# Relay generated bindings

This directory is the boundary for the two independent generated TypeScript
binding sets:

- `global/` for the database and fingerprint discovered as the global source;
- `regional/` for the shared regional schema fingerprint discovered from the
  monitored claim's region.

Both generated sets are present. The documented SpacetimeDB 2.7.0 CLI still
has no remote-schema generation command, so the pinned official CLI's hidden
`--module-def` path was used. Each Relay version-9 schema response was wrapped
in the CLI's `V9` `RawModuleDef` container before generation.

This is an undocumented pinned bridge, not a portable public CLI contract. It
avoids a hand-written BSATN decoder and produces ordinary official generated
TypeScript, but it must not be silently upgraded. Regeneration requires the
exact CLI pin, fresh fingerprint validation, compilation, and a live
subscription check.

The 2.7.0 generator omitted the named `PlayerVoteAnswer` enum while emitting
references to it. Both generated `types.ts` files contain one documented repair
copied exactly from schema type `PlayerVoteAnswer`: the unit variants `None`,
`No`, and `Yes`. Binding verification must fail if this repair disappears or
the schema definition changes.
