# Versioning Policy

BitCraft Claim Monitor follows Semantic Versioning:

```txt
MAJOR.MINOR.PATCH
```

The app is still in beta, so public beta releases use a pre-release suffix:

```txt
1.0.0-beta.N
```

For the current beta train, increment `N` for each release. Do not increment the patch number for every beta.

## Version Meanings

### MAJOR

Use a major version bump for breaking changes, major architecture rewrites, data migrations that may break existing deployments, changed setup/config behaviour, or incompatible API changes.

Example:

```txt
2.0.0
```

### MINOR

Use a minor version bump for backwards-compatible features or significant improvements.

Example after stable release:

```txt
1.1.0
```

### PATCH

Use a patch version bump for bug fixes, small UI fixes, copy changes, dependency bumps, and minor refactors with no user-facing behaviour change.

Example after stable release:

```txt
1.0.1
```

## Beta Releases

Before stable `1.0.0`, use:

```txt
1.0.0-beta.40
1.0.0-beta.41
1.0.0-beta.42
```

Avoid:

```txt
1.0.40-beta.1
1.0.41-beta.1
1.0.42-beta.1
```

The beta number is the release counter for the current `1.0.0` beta train.

## Stable Release

When the app is ready to leave beta, release:

```txt
1.0.0
```

After that:

```txt
1.0.1 = backwards-compatible bug fix
1.1.0 = backwards-compatible feature
2.0.0 = breaking change
```

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

Do not dump commit logs into the changelog. Write entries from the user's point of view and call out migrations, breaking changes, deployment-impacting changes, and required admin action clearly.
