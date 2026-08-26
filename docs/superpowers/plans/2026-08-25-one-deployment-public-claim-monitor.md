# One-Deployment Timbersteel and Public Claim Monitor Implementation Plan

## Context

The maintained application is `apps/bitcraft-local`. One existing web process and its existing Timbersteel worker must serve two strictly isolated product profiles:

- `app.timbersteeltrade.com`: the complete existing Timbersteel application.
- `claim-monitor.com`: a new public, on-demand settlement monitor and collaborative craft-planning application.

## Global Constraints

- Preserve every existing Timbersteel page, URL, setting, collector, history table, notification, Discord function, Admin function, craft plan, cookie, browser preference, configured claim fence, background worker, and current deployment topology.
- Keep `currentClaimId()`, the configured Relay runtime, `craft_plan_settings.active`, existing user/admin tables, history, notifications, outbox, Discord, map leases, and generation watchers Timbersteel-only.
- Public settlements are transient selections, never tenants or managed workspaces. Public reads create no durable game-data generation, history, notification, Discord, outbox, market transition, map lease, or settings write.
- Public accounts, sessions, legal acceptance, plans, memberships, invitations, share links, events, caches, cookies, OAuth, and APIs are additive and isolated from Timbersteel.
- Do not add a Node service, worker, database, scheduler, framework, state library, styling system, or heavy dependency.
- Use tests first for production behavior. Run focused tests during each slice and the app build and complete test suite at every backend/schema gate.
- Preserve all 64-bit IDs and large amounts as canonical decimal strings. Preserve `items:<id>` and `cargo:<id>` as distinct identities.
- Feature flags default off: `PUBLIC_PROFILE_ENABLED=false`, `PUBLIC_COLLABORATION_ENABLED=false`, and `PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=false`.
- Do not update version or changelog and do not deploy or push.

## Task 1: Freeze Timbersteel behavior and harden security

Add focused regression/contract tests around the current route families, bootstrap fields, existing cookie names, configured-claim fencing, active craft plan, Admin, bot, worker ownership, history, Discord outbox, and Admin-session creation boundary where existing coverage is insufficient.

Fix these security boundaries without changing correct Timbersteel behavior:

1. Only an active owner can grant or revoke the `owner` role. Never remove, disable, or demote the final active owner. Revoke affected sessions and audit successful role/status changes.
2. Bind all Discord interaction state changes (commands, components, roles, moderation, and API calls) to the configured Timbersteel guild before dispatch.
3. Ensure Admin-session creation is available only through the Timbersteel OAuth flow.

Gate: focused tests, full `build`, and full `test` pass.

## Task 2: Add host profiles and the public router skeleton

Create a focused server-owned HostProfile boundary and public router under `apps/bitcraft-local/src/server/public/`.

Profiles:

```ts
type HostProfile =
  | { id: "timbersteel"; origin: "https://app.timbersteeltrade.com"; allowsAdmin: true; allowsDiscord: true }
  | { id: "public"; origin: "https://claim-monitor.com"; allowsAdmin: false; allowsDiscord: false };
```

Requirements:

- Resolve exact allowlisted hostnames before API routing. Trust forwarded host information only from the loopback Caddy proxy. Reject unknown production hosts with `421`.
- Treat `localhost` and `127.0.0.1` as Timbersteel in development/smoke; permit `public.localhost` only outside production.
- Public hosts may access `/api/public/**` and `GET /api/profile`; deny `/api/local/**`, `/api/discord/**`, `/bot`, and Admin before session lookup. Timbersteel hosts deny `/api/public/**`.
- Add `GET /api/profile`; frontend selection is informational routing, never an authorization decision.
- Split startup into lazy `TimbersteelRoot` and `PublicRoot`. Preserve existing Timbersteel imports and behavior. The empty public root must not import Timbersteel history, Admin, bot, notifications, generation watchers, or configured game-data loaders.
- Preserve all Timbersteel storage keys. Prefix public keys `claim-monitor.public.*`.
- Public routing skeleton supports `/`, `/settlements/<claimId>`, `/plans`, `/plans/new`, `/plans/<id>`, `/shared-plans/<id>`, and `/invites/<id>`; unsupported paths render public not-found.

Gate: host/profile/cross-namespace tests, build, full test, and unchanged Timbersteel smoke behavior.

## Task 3: Implement public settlement discovery and snapshots

Extend the server Relay HTTP seam with case-insensitive substring claim search and implement visitor-driven public services without touching configured runtimes or repositories.

Public APIs:

- `GET /api/public/settlements/search?q=`
- `GET /api/public/settlements/:claimId?domains=claim,members,citizens,inventories,crafts`
- `GET /api/public/catalog/search?q=`
- `GET /api/public/catalog/recipe-detail?kind=<item|cargo>&id=<id>`
- `GET /api/public/game-icon/:itemType/:itemId`

Search accepts 3-64 visible Unicode characters after NFKC, or an exact canonical unsigned-64 claim ID. Return at most 20 hints ranked exact, prefix, substring with only safe display fields; selection revalidates `/claim/<id>`.

Snapshot supports only claim, members, citizens, inventories, crafts. Fetch claim/topology first, verify identity and region, coalesce roster reads, combine current/completed craft projections, preserve exact decimal strings and typed item identities, and never substitute Timbersteel data.

Limits:

- Search cache: 60s fresh, 5m stale-if-error, 256 entries, 2 MiB.
- Snapshot group cache: 20s fresh, 2m stale-if-error, 128 entries, 32 MiB total, 4 MiB/entry.
- Topology cache: 60s.
- Single-flight identical work; four active public Relay requests, twelve queued; two upstream domain reads per snapshot.
- Per-IP search: 6/30s burst and 30/10m sustained. Snapshot: 4/30s burst and 20/10m sustained.
- No background refresh or timers when visitors are absent.

Responses: `400` malformed input; `404` confirmed missing; `429` request limit; `502` malformed/mismatched Relay data; `503` plus `Retry-After` for unavailable source/no stale result or full queue; optional failures return `200` with domain warnings; stale results return `200` with age/warning.

Gate: focused cache, search, normalization, isolation, error, concurrency, and rate-limit tests; database/outbox write spies/fingerprints; build and full test.

## Task 4: Build the isolated public shell

Implement `PublicAppShell` with generic branding, settlement search/exact-ID entry, recent settlements, authoritative claim-ID routing, freshness/partial/unavailable states, manual refresh, and 60-second refresh only while visible (stop hidden, one catch-up on visibility).

Public v1 pages:

- Overview: current state only, no history or alerts.
- Members/Professions: current roster and profession/skill projection.
- Inventory: current shared settlement inventory.
- Craft Monitor: current and Relay-cached completed crafts, no contribution history.
- Craft Calculator: shared global catalog.
- Account/settings placeholders, public Help, Terms, Privacy, Plans placeholders, and public not-found.

Omit Leaderboard, Construction, Research, Local/Global Market, Region, Empires, Map, Activity, Public Craft Finder, Sync, Notifications, Admin, and bot. Direct navigation must never mount a Timbersteel page.

Use existing visual tokens and pure display helpers without refactoring Timbersteel pages solely for reuse. Public preferences use `claim-monitor.public.*`, with settlement filters scoped by claim ID. Disable Featurebase and behavioral analytics.

Gate: frontend behavior/import-boundary tests, build, full test, and browser smoke of the public core and every Timbersteel route.

## Task 5: Add isolated public OAuth and legal/privacy flows

Add additive `public_user_accounts`, `public_user_sessions`, and `public_user_legal_acceptances` tables and isolated repositories/routes.

Configuration:

- `PUBLIC_DISCORD_OAUTH_CLIENT_ID`
- `PUBLIC_DISCORD_OAUTH_CLIENT_SECRET`
- fixed callback `https://claim-monitor.com/api/public/auth/discord/callback`
- identify scope only
- `PUBLIC_ORIGIN=https://claim-monitor.com`
- cookies `__Host-cm_user_session`, `__Host-cm_oauth_state`, and `__Host-cm_privacy_reauth` with Secure, HttpOnly, SameSite=Lax, Path=/, and no Domain.

Public OAuth must never query `admin_users`, mint an Admin session, link a character, mutate Timbersteel `user_accounts`, or accept a Timbersteel profile/state. Add login, callback, session, CSRF, logout, legal acceptance, export, recent reauthentication, deletion preflight, and public account/settings UI.

Publish a separate BitCraft Claim Monitor policy for the same controller with contact `privacy@claim-monitor.com`, separate version/effective date/digests/acceptance, and accurate coverage of Discord OAuth, plans, bearer links, Relay lookups, security logs, retention, exports, and deletion. Do not claim Discord services or continuous monitoring.

Gate: schema/auth/cookie/profile/state/legal/CSRF/export/deletion tests, including proof that a Timbersteel administrator Discord ID cannot gain Admin through public OAuth; build and full test.

## Task 6: Implement collaborative plan persistence and computation

Add additive tables `public_craft_plans`, `public_craft_plan_members`, `public_craft_plan_invites`, `public_craft_plan_share_links`, and `public_craft_plan_events`. Do not alter or migrate Timbersteel craft plan tables.

Plan document schema version 1 contains targets (`items:<id>` or `cargo:<id>` plus decimal-string quantity), route overrides, numeric multipliers with optional plain note, section overrides, and row-name overrides. Reject player, bank, deployable, container, Discord, raw Relay, or cross-settlement sources; unsafe numeric conversion; more than 100 targets; more than 256 KiB; and titles/labels over 80 plain-text characters.

Plan computation uses only the saved public document, current public settlement inventory/crafts, and global catalog/recipe graph. Never use Timbersteel active plan/source rules, player inventories, banks, deployables, construction baselines, progress audit, or Discord reports. Viewer/bearer projections are aggregate/redacted; owners/editors may see settlement storage/craft breakdown.

Permissions and limits:

- Owner: full access; editor: read/edit/compute/clone; viewer and anonymous link: redacted read/compute.
- Exactly one owner; transfers only to an accepted editor. Archived plans are immutable until owner unarchives. Suspended plans return `423` to members and generic `404` to bearer viewers.
- 20 active/100 total owned plans; 10 accepted collaborators; 10 outstanding invites; 5 active share links.
- Invite/share tokens are 32 random bytes, returned once, and stored only as `HMAC-SHA-256(PUBLIC_PLAN_TOKEN_HMAC_KEY, token)`. Invitations expire after seven days. Key replacement invalidates tokens.
- Browser fragment secrets move to per-tab `sessionStorage`, are removed from the address bar, and are sent via Authorization; never log/store plaintext tokens.

Implement every plan API from the approved design. Mutations require public session, accepted public policy, exact public origin, CSRF, and `If-Match`; missing conditions return `428`, conflicts `409` with current revisions. Document/access revisions increment once per corresponding successful mutation. Computation caches key on plan ID, document revision, source snapshot revision, and view class. Unavailable computation returns saved document plus explicit unavailable warning, never invented data.

Gate: schema/document/token/ACL/quota/revision/transfer/archive/clone/delete/suspension/redaction/cache-isolation tests across two settlements and plans; build and full test.

## Task 7: Build collaboration UI, moderation, deletion, and retention

Add My Plans, creation, plan editor, conflict recovery preserving unsaved drafts, invite acceptance, member/role management, share-link management, transfer, archive/unarchive, clone, delete, and anonymous shared-view pages.

Account deletion requires recent public Discord reauthentication and an explicit transfer-to-accepted-editor or permanent-delete disposition for every owned plan. Remove memberships/invites, anonymize retained event actors, delete sessions/legal/settings/account transactionally, and add a profile-specific privacy ledger receipt. Never touch Timbersteel identities or plans.

Retention: planless accounts with no owned or accepted membership become purge-eligible after 24 months without login; owners and accepted editors of retained plans are exempt; viewer-only membership does not exempt. Document the rule.

Add a narrow Public service section to the Timbersteel Admin host only: health/cache/gate/OAuth/rate totals, exact account/plan lookup, sanitized metadata/events, suspend/restore, token/link/invite revocation, and privacy deletion processing. Never edit documents or expose tokens. Owner/admin get health/moderation/privacy; moderator gets health+suspend/revoke; viewer gets health only; Discord manager gets none. Use existing Admin CSRF/origin checks and `admin_audit_log`.

Gate: complete UI/permission/moderation/privacy/retention tests, build, full test, and collaboration browser smoke.

## Task 8: Deployment configuration, documentation, and final validation

Update existing deployment assets without creating a service, worker, database, scheduler, or timer:

- Add `claim-monitor.com` to the existing Caddy config on the same `127.0.0.1:19430` web service and redirect `www.claim-monitor.com` to apex.
- Update validators that assume a Timbersteel-only host set.
- Document additive schema, environment variables, DNS A/AAAA, `privacy@claim-monitor.com`, separate Discord application/callback, backup/integrity/outbox/history fingerprint preflight, staged read-only/OAuth/collaboration enablement, 24-hour observation, and flag-based maintenance rollback.
- Deploy defaults remain public-disabled. Never redirect public traffic to Timbersteel, delete public rows, revert additive schema, or stop the Timbersteel worker during rollback.
- Document public architecture, operator procedures, legal/privacy behavior, exclusions, and later multi-replica cache/limiter requirement.
- Do not deploy, push, bump version, or edit changelog.

Final verification:

1. Run build and full tests.
2. Browser-smoke every existing Timbersteel route and the public search/core/collaboration/unsupported-route flows.
3. Confirm cookies/preferences, configured claim, active plan, worker/history/notifications/Discord/Admin/bot/outbox behavior are unchanged.
4. Confirm cross-profile denial and zero public writes to Timbersteel repositories/outbox.
5. Confirm disabling public flags restores Timbersteel-only behavior without schema rollback.
