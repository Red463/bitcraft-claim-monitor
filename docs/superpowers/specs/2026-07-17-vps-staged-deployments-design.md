# VPS Staged Deployments

## Goal

Replace the routine SSH-and-run deployment process with a manually approved GitHub deployment that prepares each release while the current site remains live, limits cutover interruption to approximately one to three seconds, validates production health, and rolls back automatically when the new release does not start cleanly.

## Current problem

`deploy/update-bitcraft-monitor` currently stops the web and worker services before fetching code, installing dependencies, and building the frontend. Consequently, the public site is unavailable for the entire preparation phase rather than only for the final process restart.

The application also deploys from a mutable checkout. That makes frontend build replacement and rollback less predictable because the running release, the next release, and the Git working tree share one directory.

## Constraints

- Production remains a single Ubuntu VPS using Caddy, systemd, Node.js 24, pnpm, and SQLite.
- A one-to-three-second web-process restart is acceptable; running two live application versions is unnecessary.
- Deployment must require an explicit manual approval in GitHub after changes reach `main`.
- Persistent data remains under `/var/lib/bitcraft-claim-monitor` and must never live in a release directory.
- Discord, polling, and scheduled worker jobs must never run concurrently in two releases.
- Production secrets remain in `/etc/bitcraft-claim-monitor.env` and must not enter GitHub or a release directory.
- Routine deployment must not require an interactive SSH session.

## Repository and release layout

Use immutable release directories and one atomic `current` symlink:

```text
/opt/bitcraft-claim-monitor/
  source/                    # Git checkout used only to fetch and create worktrees
  releases/
    <full-commit-sha>/       # detached Git worktree with its own node_modules and dist
  current -> releases/<sha>  # release used by systemd
```

The systemd web and worker services will use `/opt/bitcraft-claim-monitor/current/apps/bitcraft-local` as their working directory and executable path. The existing SQLite database, backups, branding, monitoring data, and configuration remain outside this tree.

The updater will keep the active release plus the two most recent inactive releases. Old releases will be removed with Git worktree-aware cleanup only after a successful deployment.

## GitHub deployment workflow

Add `.github/workflows/deploy-production.yml` with these properties:

- Trigger only through `workflow_dispatch`.
- Reject execution unless the selected workflow ref is `main`.
- Use a `production` concurrency group so only one deployment can run at a time.
- Run dependency installation, the full application tests, and the production build before the deployment job receives credentials.
- Put the deployment job in the GitHub `production` environment, configured with a required reviewer.
- Deploy the exact 40-character commit SHA verified by the workflow rather than whatever happens to be latest when the VPS command runs.
- Use the system `ssh` client instead of an unpinned third-party deployment action.

The production environment will hold:

- `VPS_HOST`
- `VPS_DEPLOY_USER`
- `VPS_SSH_PRIVATE_KEY`
- `VPS_KNOWN_HOSTS`

The known-hosts value must be pinned in advance. The workflow must not learn and trust a new host key during each deployment.

## VPS deployment identity

Create a dedicated `deploy` account for GitHub Actions. It must not receive general root shell access. Its SSH key is deployment-specific, and sudo permits only the root-owned `/usr/local/bin/update-bitcraft-monitor` command.

The updater validates that its revision argument is exactly a full hexadecimal Git commit SHA and that the commit exists on `origin/main`. This makes the narrowly scoped sudo rule safe from arbitrary argument injection.

The updater uses `flock` around a root-owned deployment lock so manual and GitHub-triggered deployments cannot overlap.

## Preparation phase

The current web and worker services remain running throughout preparation:

1. Validate the requested commit and acquire the deployment lock.
2. Fetch and prune `origin/main` in the source checkout.
3. Confirm the requested commit is reachable from `origin/main`.
4. Create or reuse the detached release worktree at `releases/<sha>`.
5. Install dependencies with the frozen lockfile as the `bitcraft` user.
6. Run the production build inside the release directory.
7. Validate and stage the release's systemd and Caddy configuration.
8. Record the current symlink target as the rollback release.

Preparation failures stop here. They do not alter `current`, restart services, or interrupt users.

## Cutover and health checks

After preparation succeeds:

1. Atomically replace the `current` symlink with the new release.
2. Reload systemd configuration when unit files changed.
3. Restart only the web service.
4. Wait for the web systemd unit to become active and for `http://127.0.0.1:18430/api/local/health` to return valid JSON containing `"ok": true` and the expected release version.
5. Restart the worker service only after web health succeeds.
6. Wait for the worker to become active.
7. Run the public HTTPS check.
8. Mark the deployment successful and prune older inactive releases.

The worker is never started twice. During web validation, the old worker continues running its already-loaded code. Its restart happens only after the new web release is accepted.

## Caddy behaviour during restart

Configure the existing reverse proxy with a short retry window, for example five seconds with a small retry interval. Safe page and asset requests can wait through the one-to-three-second web restart instead of immediately receiving a connection error.

If Caddy still cannot reach the application after the retry window, return an explicit `503 Service Unavailable` response:

- Browser response: `Claim Monitor is updating. Please retry in a few seconds.`
- API response: JSON stating that deployment is in progress and the request should be retried.

Non-idempotent mutations must not be automatically replayed, because retrying them could duplicate an admin action.

## Automatic rollback

If the new web service, worker service, local health check, expected-version check, or public check fails:

1. Atomically restore `current` to the recorded previous release.
2. Restart the previous web and worker services.
3. Verify local health for the restored release.
4. Keep the failed release and its logs for diagnosis.
5. Exit non-zero so GitHub records a failed production deployment.

The rollback changes application code only. It must not automatically restore SQLite, because doing so could discard writes accepted during deployment.

Database migrations must therefore remain backward compatible with the immediately previous release. Destructive schema changes require a separately reviewed migration and maintenance plan. The deployment process will create an online SQLite backup before cutover as recovery evidence, but restoration remains an explicit administrator action.

## Deployment reporting

Both the VPS log and GitHub job summary will report:

- requested and previous commit SHAs;
- application version;
- preparation and cutover durations;
- web, worker, local-health, and public-health results;
- whether rollback ran and whether restoration succeeded;
- active release path;
- path to the full VPS deployment log.

Successful deployment output remains concise. Failures print the relevant command tail and recent systemd journal entries without exposing environment secrets.

## One-time migration

The first rollout requires a deliberate bootstrap:

1. Back up `/var/lib/bitcraft-claim-monitor` and the existing environment file.
2. Move or recreate the existing Git checkout as `/opt/bitcraft-claim-monitor/source`.
3. Create `releases` and build the current production commit as the first release.
4. Create the `current` symlink.
5. Install the updated systemd units, Caddy configuration, deployment script, deploy account, SSH key, and sudo rule.
6. Validate configuration before restarting either service.
7. Perform one supervised deployment and one supervised rollback test.

This bootstrap remains an explicit VPS administrator procedure. The GitHub workflow must not attempt to restructure an unknown existing installation automatically.

## Testing

- Extend the existing deployment-script boundary tests for revision validation, lock acquisition, build-before-cutover ordering, atomic symlink switching, health validation, rollback, and retention.
- Add workflow boundary tests for manual triggering, `main` restriction, production environment use, concurrency, verification dependencies, and pinned host-key handling.
- Add service and Caddy boundary tests for `current` paths, the retry window, and explicit maintenance responses.
- Exercise the updater against temporary fake releases and stubbed system commands so failure paths are deterministic and do not touch real services.
- Run the full application test suite and production build.
- Complete the one-time supervised VPS deployment and rollback check before relying on the workflow for routine releases.

## Acceptance criteria

- Merging a PR does not deploy automatically.
- A user must manually run and approve the production workflow.
- The current site remains live while code is fetched, dependencies are installed, and the new release is built.
- Normal cutover interruption is limited to the web-process restart and is masked for safe requests by Caddy's short retry window.
- Users receive an explicit maintenance response if the restart exceeds that window.
- Failed preparation never affects the active release.
- Failed cutover automatically restores the previous application release and reports failure in GitHub.
- The worker never runs concurrently in two releases.
- Persistent data and secrets are not copied into or removed with a release.
- Routine deployments require no interactive SSH session.
