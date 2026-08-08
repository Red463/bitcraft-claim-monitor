# Relay Migration Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Relay migration data scoping, freshness, member presence, craft attribution/presentation, images, and research behavior without guessing missing data.

**Architecture:** Correct data at source boundaries before persistence, centralize migrated data presentation in provider-neutral projections, and repair only historical records whose stored evidence proves they are foreign or attributable. Ship as four staged beta releases with tests and live verification at each boundary.

**Tech Stack:** Node.js 24+, React, TypeScript, Vite, plain CSS, `node:sqlite`, pnpm.

## Global Constraints

- Work only in `apps/bitcraft-local` and focused deployment/scripts/docs files required by this plan.
- Preserve `itemType` semantics: `0`/`item` and `1`/`cargo` are separate catalogs even when IDs match.
- Monitored claim is `1369094286777412590`; never infer or silently substitute another claim.
- Historical records may only be changed when stored evidence proves the claim or player identity.
- No real Discord deliveries during tests, repair, or Relay-preview verification.
- Use TDD at each behavior seam; run build and the full test suite for every phase.
- Preserve the user-owned untracked `BITCRAFTSYNC_EXPLORER_AUDIT.md` in the original checkout.

---

### Task 1: Runtime Reliability, Market Integrity, and Guarded Repair (`0.51.0-beta.2`)

- [ ] Capture production worker status, journal, and persisted health before production mutation.
- [ ] Make Relay reconciliation non-overlapping and time-bounded; detect a 180-second worker stall and exit so systemd recovers it.
- [ ] Add bounded reconnect supervision to primary-region and claim-market subscriptions, restarting only on disconnected/error health.
- [ ] Set the worker service to `Restart=always`, keep `RestartSec=5`, and add a bounded start limit.
- [ ] Remove settlement-history writes from regional market; claim-market becomes the sole settlement writer.
- [ ] Reject mixed/foreign claim snapshots transactionally in the transition writer.
- [ ] Preserve item ID/type through market history and make Dashboard income, Revenue by Day, and Best Sellers use one claim-scoped selected-period trade source.
- [ ] Add `scripts/repair-relay-market-claim-scope.mjs` with evidence-only `--dry-run` manifest and hash-guarded `--apply`; cover market events/trades, market activities, and linked undelivered outbox rows.
- [ ] Add focused tests, run build/full tests, update changelog/version, commit, deploy, and verify a 15-minute worker/market soak before cleanup.
- [ ] Back up production SQLite, review dry-run counts, apply atomically, run integrity check, and reconcile UI totals to SQL.

### Task 2: Members, Presence, and Warning Accuracy (`0.51.0-beta.3`)

- [ ] Enrich only primary-region-omitted members through Relay `/player/{entityId}`, with 60-second cache and concurrency four.
- [ ] Preserve returned region, signed-in state, and last-active timestamp; never infer offline state on failure.
- [ ] Add `presenceRegionId` and `presenceSource: "regional" | "relay-player" | "unavailable"` to the player projection.
- [ ] Render status as Online now, newest last-active, last-login, then Never.
- [ ] Replace omitted-member global warnings with per-member presence metadata.
- [ ] Move missing regional owner usernames to `coverage.missingOwnerUsernameCount` and keep the notice local to Region diagnostics.
- [ ] Make cached-data copy distinguish active refresh from unavailable live refresh.
- [ ] Add focused tests, run build/full tests, update changelog/version, commit, deploy, and live-verify Allusion/member timestamps/warnings.

### Task 3: Craft Projection and Contribution Attribution (`0.51.0-beta.4`)

- [ ] Add a shared Dashboard/Craft Monitor projection resolving compound `(itemType,itemId)` catalog identities and `{0}` output names/icons.
- [ ] Group passive crafts by member, output identity, structure, and status; sum quantities/counts and retain latest timestamp.
- [ ] Attribute contribution precedence as reducer caller (`authoritative`), unique player action (`matched_action`), then exact craft owner (`owner_fallback`).
- [ ] Resolve owner names through claim members then Relay player lookup; display exact `Player <entityId>` when no name is available.
- [ ] Safely migrate contribution confidence constraints, converting `joined` to `matched_action` while retaining historical `unknown`.
- [ ] Rebuild aggregates only from durable exact evidence; exclude remaining unknown records from player totals and expose only an admin diagnostic count.
- [ ] Add focused tests, run build/full tests, update changelog/version, commit, deploy, and perform a monitored live contribution test.

### Task 4: Images and Research UI (`0.51.0-beta.5`)

- [ ] Standardize item images as Relay catalog -> verified local asset -> same-origin BitJita fallback -> text placeholder.
- [ ] Make missing `/game-icons/*` return 404.
- [ ] Add `GET /api/local/game-icon/:itemType/:itemId`, accepting only item/cargo and decimal IDs, using approved BitJita hosts, image content/size/time validation, cache headers, and no arbitrary URL input.
- [ ] Narrowly update the no-BitJita-fetch policy test for this fallback.
- [ ] Add only `https://cdn.discordapp.com` to CSP `img-src`.
- [ ] Restore two Research lanes: Completed Technology and Available Research, with locked/prerequisite badges inside Available; remove Current Research.
- [ ] Add focused tests, run build/full tests and browser smoke checks, update changelog/version, commit, deploy, and verify all acceptance criteria.

## Acceptance Criteria

- No Timbersteel market event/trade contains a different embedded claim ID.
- Dashboard income, Revenue by Day, and Best Sellers reconcile exactly with selected-period claim-scoped trades.
- Members with Relay timestamps show Last Seen and cross-region presence is not reported as data loss.
- Every new contribution has an exact player ID and non-unknown confidence.
- `Craft {0}` and `Smelt {0}` do not reach the UI; passive crafts group at the specified boundaries.
- Research has no Current Research lane.
- Relay/local images render first, BitJita is only a validated fallback, and Discord avatars pass CSP.
- Worker-owned snapshots remain healthy during soak and stale copy reports refresh state accurately.
