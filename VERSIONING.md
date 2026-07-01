# Versioning Policy

BitCraft Claim Monitor uses Semantic Versioning, with a pre-1.0 beta convention while the app is still moving quickly:

```txt
0.MINOR.PATCH-beta.N
```

This keeps familiar version numbers while avoiding one endless beta counter such as `1.0.0-beta.123`.

## Current Beta Format

Use this format for every beta release before stable `1.0.0`:

```txt
0.MINOR.PATCH-beta.N
```

Examples:

```txt
0.25.0-beta.1
0.25.0-beta.2
0.25.1-beta.1
0.26.0-beta.1
```

### MINOR

Increment `MINOR` when starting a new release line for a feature area, milestone, or meaningful batch of work.

Examples:

```txt
0.25.0-beta.1 = admin popup and admin console polish line
0.26.0-beta.1 = next feature or release theme
```

For ordinary rapid iteration on the same feature area, keep the same `MINOR` and increment only `N`.

### PATCH

Increment `PATCH` when starting a fix-only line for an already released beta line.

Examples:

```txt
0.25.0-beta.4 = fourth beta while building or polishing the 0.25 feature line
0.25.1-beta.1 = first fix-only beta after the 0.25.0 line
```

Do not increment `PATCH` for every small fix during active same-line iteration. Use the beta counter for rapid repeated updates.

### Beta Counter

`N` is the counter for the current `0.MINOR.PATCH` line.

Increment `N` for each release on the same line:

```txt
0.25.0-beta.1
0.25.0-beta.2
0.25.0-beta.3
```

Reset `N` to `1` whenever `MINOR` or `PATCH` changes:

```txt
0.25.0-beta.8
0.25.1-beta.1
0.26.0-beta.1
```

This supports many same-day updates without producing meaningless product versions.

## Stable Release

When the app is ready to leave beta, release:

```txt
1.0.0
```

After stable release, use normal SemVer:

```txt
1.0.1 = backwards-compatible bug fix
1.1.0 = backwards-compatible feature
2.0.0 = breaking change
```

## Historical Changelog Migration

Historical changelog entries were migrated to this policy by preserving every entry and date, assigning each historical calendar day to a pre-1.0 release line, and incrementing `beta.N` within that day from oldest to newest.

This was a documentation cleanup only. It did not change the behavior or release content of old versions.

## Changelog Rules

Keep `CHANGELOG.md` in Keep a Changelog style, using these sections where relevant:

```txt
Added
Changed
Deprecated
Removed
Fixed
Security
```

Use changelog entries for user-visible or operator-visible changes. Do not dump commit logs into the changelog.

Write entries from the user's point of view:

```txt
- Added Discord colour-role management.
- Fixed market history filtering for the selected settlement.
- Improved mobile spacing on the bot dashboard.
```

Avoid entries like:

```txt
- Updates.
- Refactored files.
- Changed main.tsx.
- Fixed stuff.
```

Call out breaking changes, removals, migrations, deployment-impacting changes, required admin action, and VPS action clearly.
