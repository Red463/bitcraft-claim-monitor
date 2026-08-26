# Task 6 report: collaborative public plan persistence and computation

Date: 2026-08-26

## Status

Implemented the complete Task 6 server API, persistence, access control, capability-token, revision, lifecycle, projection, and public-input computation boundary. The implementation is additive and remains isolated from Timbersteel plan state, accounts, audit/history, Discord, and outbox behavior.

## Implementation and files

- `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
  - Added only the five required tables: `public_craft_plans`, `public_craft_plan_members`, `public_craft_plan_invites`, `public_craft_plan_share_links`, and `public_craft_plan_events`, plus focused indexes.
- `apps/bitcraft-local/src/server/public/publicPlans.mjs`
  - Added the exact version-1 document normalizer, transactional repository, ACL projections, quotas, revisions, lifecycle operations, HMAC capability tokens, redacted events, and public computation/cache service.
- `apps/bitcraft-local/src/server/public/planRouter.mjs`
  - Added all 19 required API method/path combinations with public session, current legal acceptance, exact public Origin, CSRF, and conditional revision enforcement.
- `apps/bitcraft-local/src/public/planSecrets.mjs` and `planSecrets.d.mts`
  - Added the fragment-to-`sessionStorage` helper, address-bar cleanup, Authorization projection, and explicit clearing helper.
- `apps/bitcraft-local/src/server/craftPlanning.mjs`
  - Added one optional explicit prepared-config input at the pure compute boundary. Existing Timbersteel callers still use the unchanged normalizer and 50-target limit; only the public adapter supplies its already validated 100-target document.
- `apps/bitcraft-local/src/server/public/authRouter.mjs`
  - Exported the existing exact-public-Origin predicate for reuse without weakening it.
- `apps/bitcraft-local/server.mjs`
  - Wired the isolated public repository/router and public snapshot/catalog seams. Collaboration routes fail closed unless the collaboration/legal gates and `PUBLIC_PLAN_TOKEN_HMAC_KEY` are present.
- `docs/relay-migration/table-inventory.md`
  - Recorded the five user-owned tables and their on-demand live-data computation ownership.
- `apps/bitcraft-local/test/public-plans.test.mjs`, `public-plan-routes.test.mjs`, and `public-plan-secrets.test.mjs`
  - Added 17 Task 6 tests covering document/schema constraints, transactions, ACLs, quotas, tokens, revisions, lifecycle, all APIs, secret handling, source restrictions, fail-closed computation, redaction, and cache isolation.

## TDD RED/GREEN evidence

The implementation was built in focused RED/GREEN slices:

- Missing document normalizer failed import, then exact typed decimal normalization passed.
- Target/byte/schema/plain-text limits first failed, then passed after bounded validation.
- Missing five-table bootstrap failed, then passed with additive schema; the test also proved an existing `craft_plan_settings` row survives repeated bootstrap.
- Missing repository, invite, share, lifecycle, projection, computation, router, and fragment-helper APIs each failed before their focused implementation and passed afterward.
- The public 100-target test first returned the Timbersteel limit of 50; the explicit prepared public-input seam made it pass at 100 while the existing planner regression suite retained Timbersteel behavior.
- Recursive viewer redaction and recipient transfer-quota tests failed before the focused projection/quota changes and passed afterward.
- Self-review added a catalog-404 fail-closed test; it first returned `available: true`, then passed after treating every unavailable required catalog node as computation-unavailable.
- The first full suite run exposed the SQL ownership inventory guard (`public_craft_plans` absent); the focused boundary reproduced it, the five-table ownership row was added, and the guard passed 2/2 before the final full rerun.

One quota test began GREEN because the transaction-safe quota checks were already present from the immediately preceding invitation slice; no RED result is claimed for that individual assertion.

## Schema and transaction safety

- Schema changes are `CREATE TABLE/INDEX IF NOT EXISTS` only. No table is altered, migrated, renamed, dropped, or reused.
- The owner is a single `owner_user_id` column on `public_craft_plans`; collaborator rows can contain only `editor` or `viewer`, so a second owner cannot be represented.
- Foreign keys keep public identity and plan ownership explicit; plan children cascade only with their public plan.
- Every quota-check-plus-write and multi-row lifecycle operation executes inside `BEGIN IMMEDIATE` / `COMMIT`, with rollback on every thrown error.
- Active/total owner quotas are checked in the same write transaction for create, clone, reactivation, and ownership transfer. Collaborator, outstanding-invite, and active-share quotas are checked in their mutation transactions.
- Transfer deletes the accepted editor membership, installs the previous owner as editor, and changes the one owner in one transaction.
- The additive schema and host-boundary regressions prove existing Timbersteel settings, repositories, history, and outboxes remain unchanged.

## Token and log-redaction proof

- Invite and share tokens use 32 random bytes and are returned only by their creation response.
- SQLite stores only 64-character `HMAC-SHA-256(PUBLIC_PLAN_TOKEN_HMAC_KEY, token)` hex values. Verification uses constant-time comparison.
- Key replacement invalidation, seven-day invite expiry, revocation, replay rejection, and share revocation are exercised by focused tests.
- Owner metadata projections select IDs/roles/labels/timestamps only; tokens and `token_hash` never enter API projections.
- Event payloads contain only non-secret IDs, roles, labels, and lifecycle metadata. Focused tests search persisted hashes/events and prove plaintext capability values are absent.
- The plan modules contain no logging calls. Bearers are accepted only from Authorization, never query/path input. The browser helper moves fragment secrets to per-tab `sessionStorage` and calls `history.replaceState` before normal requests.

## Permissions, quotas, and revisions

- Owner: document/access/lifecycle/member/invite/share/transfer/delete/clone/read/compute.
- Editor: read, document edit, computation, events with actor/payload, and clone.
- Viewer: read, redacted computation, and redacted events without actor/payload.
- Anonymous bearer: generic share-plan read and redacted computation only; it receives generic `404` for missing/revoked/suspended capability access.
- Suspended member reads return `423`; archived plans remain readable but reject mutation until the owner reactivates them.
- Limits covered: 20 active and 100 total owned plans, 10 accepted collaborators, 10 unexpired outstanding invites, and 5 active share links.
- Missing `If-Match` returns `428`; stale document/access revisions return `409` with both current revisions. Each successful document mutation increments document revision once; each successful access mutation increments access revision once.
- Every mutation route first requires the isolated public session, current Claim Monitor legal snapshot, exact configured HTTPS public Origin, and matching CSRF token.

## Computation source and isolation proof

- The adapter requests exactly `snapshot(claimId, "inventories,crafts")`; Task 3's snapshot composes only the requested claim's shared settlement buildings and the current/completed craft endpoints.
- Player inventory, bank, and deployable source arrays are explicitly empty. No construction baseline, Timbersteel `craft_plan_settings`, progress audit/history, Discord report, or outbox input is referenced.
- Typed `items:<u64>` and `cargo:<u64>` keys remain distinct, and saved quantities/IDs remain canonical decimal strings. Values unsafe for the numeric planner return the untouched document plus `public_plan_computation_unavailable`.
- Missing/malformed settlement domains, a claim mismatch, absent source revision, or any unavailable required catalog node also fail closed with the saved document and explicit unavailable warning.
- Owners/editors retain settlement storage and craft breakdowns. Viewer/bearer projections recursively remove `sources` and `activeCraftSources` and use the compact aggregate plan.
- Cache keys include plan ID, claim ID (additional isolation), document revision, source snapshot revision, and detailed/redacted view class. Tests exercise two claims, two plans, a changed source revision, and both view classes.

## Verification

- `node --experimental-strip-types --test test/public-plans.test.mjs test/public-plan-routes.test.mjs test/public-plan-secrets.test.mjs test/craft-planning.test.mjs test/server-schema-bootstrap.test.mjs test/public-auth-routes.test.mjs test/public-api-router.test.mjs test/host-profile-boundaries.test.mjs test/sql-table-inventory-boundary.test.mjs`
  - PASS: 143 tests, 0 failed (17 Task 6 tests plus focused regressions).
- `corepack pnpm --filter @workspace/bitcraft-local run build`
  - PASS: server/provider/bindings TypeScript, asset verification, frontend TypeScript, Vite production client, and Relay runtime boundary verification.
- `corepack pnpm --filter @workspace/bitcraft-local test`
  - PASS: 2,713 tests; 2,710 passed, 0 failed, 3 expected environment skips.
- `git diff --cached --check`
  - PASS before the final report; rerun after staging the report.

The host-profile test initially could not spawn its server in the restricted sandbox because Node received `EPERM` reading the installed `jsonwebtoken` package. The identical test rerun outside that sandbox passed 3/3, and both final focused and full suites ran outside that restriction successfully.

## Self-review

- Reconciled every required API method/path against the Task 6 brief.
- Confirmed no dependency, version, changelog, service, Discord, account, audit/history, outbox, or UI feature changes were introduced.
- Confirmed `craft_plan_settings` and the existing Timbersteel planner normalizer/source behavior are untouched; the only planner change is the explicit, optional pure-input seam.
- Confirmed the schema inventory declares the new tables as user-owned state rather than a game-data cache.
- Searched changed server modules for token/log/audit/outbox/source references and inspected the staged diff for unintended files or whitespace errors.

## Concerns and deployment note

- Collaboration intentionally fails closed when `PUBLIC_PLAN_TOKEN_HMAC_KEY` is absent. Deployment must provide a strong persistent value before enabling public collaboration. Rotating it intentionally invalidates every outstanding invite and share token.
- No database backfill or destructive migration is required.
