# Linked Worktree Build ID Design

## Problem

The browser checks `/api/local/health` every minute and compares its current build ID with the server build ID. Active tabs show an update prompt when those IDs differ, while hidden tabs reload automatically.

GitHub deployments run the application from a detached linked Git worktree under `/opt/bitcraft-claim-monitor/releases/<revision>`. In that layout, the release root's `.git` entry is a file containing a `gitdir:` pointer, not a directory. The current build-ID resolver always reads `.git/HEAD`, so it cannot find the detached revision. The systemd service does not provide `GITHUB_SHA`, leaving the health response with an empty build ID and preventing browser update detection.

## Decision

Make the server's existing build-ID resolver understand Git worktree metadata. Do not add generated deployment files, systemd overrides, or another source of release state.

Resolution order remains:

1. Use `SOURCE_VERSION`, `RENDER_GIT_COMMIT`, or `GITHUB_SHA` when supplied.
2. Inspect the release root's `.git` metadata.
3. If `.git` is a directory, preserve the existing normal-checkout behavior.
4. If `.git` is a file beginning with `gitdir:`, resolve its absolute or repository-relative target and read `HEAD` from that Git directory.
5. Return the first 12 characters of a valid 40-character revision. Return an empty string when metadata is missing or invalid.

The production release worktrees are detached, so their pointed-to `HEAD` contains the deployed revision directly. Existing symbolic-ref handling remains available for normal repositories.

## Browser Behaviour

No frontend behavior changes are required. Once `/api/local/health` exposes the deployed revision again:

- the first successful poll remembers the current build ID;
- a later changed build ID shows the existing update banner on an active tab;
- a changed build ID reloads a hidden tab automatically when detected;
- failed or incomplete health checks remain non-disruptive.

## Error Handling

The resolver must treat malformed pointers, unreadable files, missing Git metadata, and invalid revisions as unavailable metadata. These cases continue returning an empty build ID rather than failing server startup or the health endpoint.

## Testing

Add a focused regression test that models the staged deployment layout:

- `<release>/.git` contains a `gitdir:` pointer;
- the pointed-to `HEAD` contains a detached 40-character revision;
- `currentAppBuildId()` returns the expected 12-character build ID.

Cover both absolute and relative pointer targets if the implementation supports both. Preserve the existing normal-checkout, environment-variable, detached-HEAD, and safe-fallback tests. Run the focused release test, production build, and full app test suite.

## Scope

This change is limited to release build-ID resolution and its tests. It does not change the deployment workflow, service environment, health response shape, polling interval, update-banner design, application version, or database.
