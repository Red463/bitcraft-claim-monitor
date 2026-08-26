# Task 8 report: deployment configuration, documentation, and final validation

## Status

Complete at baseline `06fb5869`. Task 8 changes prepare the existing deployment
for the public host without deploying, pushing, creating services or external
resources, changing the package version, or editing the changelog.

## Files changed

- `deploy/Caddyfile.example`: added the exact public apex on the existing
  `127.0.0.1:19430` web process, the `www`-to-apex redirect, and explicit
  forwarding-header overwrites for both application profiles.
- `deploy/Caddyfile.cutover-maintenance`: retained the existing Timbersteel
  canary topology, made its trusted headers explicit, and added an unproxied
  public `503` plus the unchanged `www` canonical redirect.
- `deploy/bitcraft-claim-monitor-relay.env.example`: documented all public
  settings with the three feature/legal gates disabled, blank separate OAuth
  credentials, and a blank persistent plan-token HMAC key.
- `deploy/cutover-relay-production.mjs`: expanded semantic Caddy topology
  validation to the two exact public hosts and enforced the one-process,
  canonical-redirect, and maintenance behavior.
- `scripts/test/deploy-cutover-system.test.mjs`: added acceptance and rejection
  coverage for the public host topology.
- `scripts/test/deploy-runtime-config.test.mjs`: added executable assertions for
  the public proxy, redirect, trusted forwarding headers, and disabled defaults.
- `DEPLOYMENT.md`: connected the public runbook to the existing production
  topology and described the supervised Caddy merge and operator prerequisites.
- `docs/public-claim-monitor-operations.md`: added the complete preflight,
  staged rollout, smoke, privacy/moderation, and non-destructive rollback
  runbook.
- `docs/privacy-operations-runbook.md`: added the public contact, data boundary,
  account-deletion disposition, anonymisation, and retention controls.

## RED / GREEN validator evidence

RED was recorded before the implementation edits:

- `node --test --test-name-pattern="semantic Caddy validation" scripts/test/deploy-cutover-system.test.mjs`
  exited 1 because the old validator rejected the newly required host set.
- `node --test scripts/test/deploy-runtime-config.test.mjs` exited 1 with 8
  passing and 2 failing tests because the public Caddy block and public-disabled
  environment defaults were absent.

GREEN after the smallest configuration/validator implementation:

- The focused semantic Caddy validator passed 1/1.
- The runtime deployment configuration tests passed 10/10.
- Negative fixtures reject a missing public apex, a separate `20430` public
  service, and a `www` redirect to Timbersteel.

## Topology, configuration, and rollback proof

- The tracked Caddy reference contains one Caddy configuration and sends both
  `app.timbersteeltrade.com` and `claim-monitor.com` to exactly
  `127.0.0.1:19430`. The deployment assets add no service, worker, timer,
  database, data directory, or backup schedule.
- `www.claim-monitor.com` redirects permanently and only to
  `https://claim-monitor.com{uri}`. Public traffic is never redirected to
  Timbersteel.
- Caddy overwrites `Host`, `X-Forwarded-For`, `X-Forwarded-Host`, and
  `X-Forwarded-Proto` at the loopback trust boundary for both apex profiles.
- `PUBLIC_PROFILE_ENABLED`, `PUBLIC_COLLABORATION_ENABLED`, and
  `PUBLIC_LEGAL_CONFIGURATION_CONFIRMED` all default to `false`.
- The runbook requires additive schema with flags off, then read-only enablement
  and 24 continuous hours of observation, separate OAuth preparation, and only
  then collaboration enablement.
- Rollback sets only the three public flags to `false` and, if necessary,
  replaces only the public apex proxy with an explicit `503`. It expressly
  forbids redirecting public traffic, deleting public rows, reverting schema,
  restoring an old database, rotating the HMAC key, modifying outboxes, or
  stopping the Timbersteel worker/collector/timers.
- The preflight includes an encrypted manual backup and independent decrypt
  verification, SQLite integrity and foreign-key checks, signed privacy replay
  on the verification copy, and bounded Timbersteel history/outbox fingerprints.
- Required operator actions are explicit: DNS `A`/conditional `AAAA`, tested
  `privacy@claim-monitor.com` receipt, and a separate Discord application with
  the exact public callback and `identify` scope. None was performed here.
- Architecture documentation covers public exclusions, privacy/retention and
  moderation, HMAC-key persistence and rotation invalidation, and the
  single-replica cache/limiter/single-flight constraint.

## Verification commands and results

Focused deployment/configuration:

- `node --test --test-name-pattern="semantic Caddy validation" scripts/test/deploy-cutover-system.test.mjs` — 1 passed, 0 failed.
- `node --test scripts/test/deploy-runtime-config.test.mjs` — 10 passed, 0 failed.
- All `scripts/test/deploy-*.test.mjs` through `node --test` — 176 total,
  161 passed, 0 failed, 15 skipped by documented Windows/bash platform guards;
  37.7 seconds.

Build and complete test suite:

- `corepack pnpm --filter @workspace/bitcraft-local run build` — passed;
  server and client builds completed, 1,462 assets verified, runtime boundary
  returned `{ok:true}`.
- `corepack pnpm --filter @workspace/bitcraft-local test` — 2,752 total,
  2,749 passed, 0 failed, 3 skipped for Windows symlink limitations; 109.3
  seconds.

Focused safe public/host smoke:

- `node --test` over the host-profile, host-boundary, public-router,
  public-API-router, public-auth contract/routes, plan routes/domain,
  moderation, public shell, and workspace UI test files — 58 passed, 0 failed;
  26.1 seconds. These fixtures disable live delivery and prove public reads do
  not write Timbersteel repositories, history, transition outbox, or Discord
  outbox.

No real Discord notification, OAuth request, Relay notification, deployment,
DNS change, mailbox operation, or other external mutation was made.

## Smoke matrix

An isolated production-profile server using safe local data and external
polling/Discord disabled produced the following exact-host results:

| Profile | Targets | Result |
| --- | --- | --- |
| Timbersteel | All 19 current navigation pages, `/bot`, `/api/local/health` | 21/21 returned `200` |
| Public | `/`, plans/new/not-found, shared-plan and invite not-found, unsupported, privacy, terms, settings | 10/10 returned `200` |
| Public boundary | `/api/profile`, `/api/local/health`, `/api/discord/interactions`, `/bot`, Admin query | `200`, `404`, `404`, `404`, `404` |
| Timbersteel boundary | `/api/public/legal` | `404` |
| Unknown production host | `/api/profile` | `421` |

The focused 58-test fixture additionally exercised public search/core and
collaboration contracts, role/redaction and moderation behavior, cross-profile
denials, and zero Timbersteel history/outbox writes.

An independent flags-off production-profile fixture confirmed:

- `/api/profile` reported all three public gates `false`;
- public `/api/public/legal` returned `404`;
- Timbersteel health and dashboard returned `200`;
- the disabled public shell remained only an inert HTML entry point;
- all eight additive public tables remained present; and
- protected history/outbox counts stayed zero in the isolated database.

This demonstrates Timbersteel-only operational behavior without destructive
schema rollback.

## Checks skipped and exact reasons

- Native `caddy validate` was not run because `Get-Command caddy` found no Caddy
  binary in this Windows environment. The focused text assertions and semantic
  adapted-JSON topology validator passed instead. The runbook requires the
  operator to run native validation before a supervised Caddy reload.
- Visual browser/console and persisted cookie/preference smoke could not be
  completed because the in-app browser first found the stale smoke endpoint
  unavailable and then blocked the safe local fixture URL with
  `ERR_BLOCKED_BY_CLIENT`. The protected existing smoke PID could not be
  restarted (`Access denied`). No process was forcibly killed. Exact-host HTTP
  smoke and the browser-independent host/public suites passed, but production
  cookie values were intentionally not accessed.
- Fifteen deployment tests were skipped by their existing Windows/bash guards;
  three full-suite tests were skipped for existing Windows symlink limitations.
  There were no test failures.

## Self-review

- `git diff --check` is clean.
- The diff is limited to existing deployment assets, their focused validators,
  deployment/privacy documentation, and this report.
- Existing Timbersteel site behavior, process port, worker/timer/database
  topology, security headers, retry semantics, canonical legacy redirects, and
  production identities are preserved.
- No version, changelog, generated asset, database, log, secret, or local smoke
  artifact is included.
- The implementation does not create or start a new production service and does
  not perform any operator-owned external action.

## Concerns

- Native Caddy syntax validation remains an operator preflight requirement
  because Caddy is not installed locally.
- Visual browser console and real persisted cookie/preference continuity need
  confirmation in an approved browser/VPS preflight because the local in-app
  browser blocked the fixture URL.
- DNS, mailbox receipt, policy/legal approval, separate Discord OAuth callback,
  persistent HMAC-key generation/backup, encrypted production backup replay,
  and the 24-hour read-only observation are intentionally outstanding operator
  actions, not repository tasks.
