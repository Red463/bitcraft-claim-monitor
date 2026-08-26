# Task 7 report: collaboration, moderation, deletion, and retention

## Status

Complete. Task 7 was implemented on top of commit `4be2898e` without changing dependency versions, package versions, the changelog, service definitions, or database files. The existing public fragment gateway, public ACL/revision/origin/legal/CSRF boundaries, Timbersteel identities, and Timbersteel `discord:` privacy-ledger subject remain intact.

## Implementation and files

### Collaboration workspace

- `apps/bitcraft-local/src/public/PublicPlansPage.tsx` adds My Plans, plan creation/editing, conflict recovery, collaboration access controls, transfer, archive/unarchive, clone, delete, events, invitations, and share links.
- `apps/bitcraft-local/src/public/planApi.ts` adds the focused same-origin client with explicit document/access revision tags and sanitized failures. It never automatically retries a document conflict.
- `apps/bitcraft-local/src/public/PublicAppShell.tsx` routes the signed-in plans workspace while preserving the existing anonymous shared-plan fragment gateway.
- `apps/bitcraft-local/src/styles/public-shell.css` adds only focused dense operational layout rules.

### Public account deletion and retention

- `apps/bitcraft-local/src/server/public/accountDeletion.mjs` reviews owned-plan dispositions and performs transfer/delete, membership/invite/share/session/legal/account removal, and retained-event anonymization in one `BEGIN IMMEDIATE` transaction.
- `apps/bitcraft-local/src/server/public/authRouter.mjs`, `src/public/accountApi.ts`, and `src/public/PublicAccountSettings.tsx` add purpose-bound recent Discord reauthentication, preflight review, explicit per-plan dispositions, and final typed confirmation.
- `apps/bitcraft-local/src/server/privacyDeletionLedger.mjs` adds a separate public-profile subject, coordinator, and replay path without modifying the established Timbersteel `discord:` subject or replay functions.
- `apps/bitcraft-local/src/server/privacyRetention.mjs` narrowly extends the existing privacy job for inactive public accounts; no new game-data scheduler was added.
- `apps/bitcraft-local/src/legal/legalPolicy.mjs` documents the 24-month public-account inactivity boundary.
- `apps/bitcraft-local/src/server/schemaBootstrap.mjs` and `schemaMigrations.mjs` add only the columns needed for deleted-actor markers and reversible moderation state.

### Moderation and Timbersteel Admin

- `apps/bitcraft-local/src/server/public/moderation.mjs` implements sanitized exact lookup, health, suspension/restoration, and exact invite/share revocation. It does not return documents, bearer values, token hashes, or deleted-actor markers.
- `apps/bitcraft-local/src/server/public/adminRouter.mjs` is the narrow public-service route dispatcher.
- `apps/bitcraft-local/server.mjs` mounts it only inside the existing Timbersteel Admin authentication block, reuses exact-origin/CSRF mutation guards, appends `admin_audit_log`, exposes sanitized health sources, and coordinates privacy deletion/replay.
- `apps/bitcraft-local/src/server/adminPermissions.mjs` adds the scoped permissions below.
- `apps/bitcraft-local/src/components/admin/PublicServiceAdminSection.tsx`, `AdminPanel.tsx`, `adminNavigationState.ts`, and `styles/admin.css` add a focused operational panel rather than growing a document editor into the main Admin component.
- Focused tests were added or extended under `apps/bitcraft-local/test/` for every slice and compatibility boundary.

## TDD RED/GREEN record

Work proceeded in focused slices:

1. Collaboration RED: client/workspace tests failed on missing list/create/detail/event actions, conflict recovery, clone navigation, and full-detail access refresh. GREEN: the API client and mounted React workspace now pass all 11 collaboration tests.
2. Deletion RED: tests failed on the missing deletion module, plan-disposition validation, transaction behavior, anonymized event actor, and public-ledger isolation. GREEN: all deletion/auth/client/UI/ledger scenarios pass.
3. Retention RED: tests showed public accounts were absent from the existing retention job. GREEN: the exact 24-month eligibility query and viewer-membership purge pass.
4. Moderation/Admin RED: tests failed on missing public-service permissions/router/UI and capability revocation. GREEN: the role matrix, exact lookups, audit records, suspension behavior, redaction, and privacy route pass.
5. Self-review RED/GREEN: added regressions for clone routing, access-mutation detail reloading, plan-suspension invite/share revocation, and deleted-marker non-disclosure; each failed before its focused fix and passes now.
6. Full-suite diagnosis found only two expected compatibility snapshots (new moderator permissions and additive schema columns). They were updated to the intentional contract and the complete suite then passed.

## UI flows

- `/plans` shows owned/shared roles and supports explicit plan creation.
- The editor saves with its displayed tagged document revision. A `409` retains the unsaved draft and presents both **Reload server copy** and **Copy draft**; it never silently overwrites or retries.
- Collaboration controls use the distinct access revision, reload full detail after mutation, and cover invitations, member roles/removal, owner transfer, share creation/revocation, archive/unarchive, clone, delete, and event history.
- Invitation acceptance remains an explicit user action. One-time invitation/share secrets are cleared after terminal handling and remain in fragment/session mechanisms rather than URLs sent to the server.
- Anonymous shared views still use the fragment bearer gateway and render only the existing redacted projection. Invalid or suspended bearer access remains the generic unavailable/404 path.
- Account deletion requires a recent, same-account, purpose-bound public Discord reauthentication, preflight, one explicit disposition for every owned plan, and final confirmation.

## Admin permission matrix

| Timbersteel Admin role | Public health | Suspend/revoke | Restore | Privacy processing | Public section |
| --- | --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes | Yes |
| Administrator | Yes | Yes | Yes | Yes | Yes |
| Moderator | Yes | Yes | No | No | Yes |
| Viewer | Yes | No | No | No | Yes, read-only health |
| Discord manager | No | No | No | No | No |

The router enforces these permissions independently of UI visibility. Every mutation additionally passes the current Timbersteel Admin session, exact Admin origin, and Admin CSRF checks.

## Privacy transaction and ledger replay isolation

- Deletion validates an exact, non-duplicated disposition set against the current owned plans while holding `BEGIN IMMEDIATE`; unresolved or stale dispositions roll back and block deletion.
- Transfer is allowed only to a currently accepted editor and is quota checked. Permanent-delete removes the selected owned plan.
- The same transaction removes all remaining public memberships, created/accepted invites, created share links, public sessions, legal acceptances, settings held on the public account row, and the public account itself.
- Retained event rows replace `actor_user_id` with a stable HMAC deletion marker. Admin responses expose only `{ deleted: true }`, never that marker.
- The ledger receipt subject is `HMAC(public-profile:discord:<id>)`, distinct from `HMAC(discord:<id>)`. A same-ID public receipt is ignored by Timbersteel replay, while public replay remains idempotent and prevents restored public-profile resurrection.
- Existing Timbersteel coordinator/replay functions and `discord:` subject construction were not changed, so cutover compatibility remains intact. No Timbersteel account, administrator, guild membership, or plan is queried or mutated by the public deletion path.

## Retention boundary

The existing privacy job selects a public account at or beyond 24 months since `last_login_at` (falling back to creation) only when it owns no plan and has no accepted editor membership. Owner and accepted-editor involvement exempt the account. Viewer-only membership does not exempt it and is removed during the same account purge. The dry-run reports eligibility without mutation, and no warning/notification or game-data scheduler was introduced.

## Moderation, redaction, suspension, and audit proof

- Health combines public data/cache status, feature-gate state, OAuth enabled booleans, rate-limit totals, and route telemetry without configuration secrets.
- Account and plan lookup require exact identifiers and return sanitized metadata/events only; plan documents, bearer secrets, raw invitation/share tokens, token hashes, and deleted markers are absent.
- Suspending a public account revokes active public sessions and its invitation/share capabilities and suspends its owned plans. Suspending a plan revokes outstanding invitations and share links. Restoration is bounded to the recorded moderation state and does not resurrect revoked capabilities.
- Signed-in plan members receive `423` for suspended resources. Bearer callers retain the generic `404` behavior.
- Exact invite/share revocation and suspension/privacy operations append `admin_audit_log` entries containing bounded identifiers and results, not secrets.

## Verification

- Focused Task 7 tests:
  - `node --experimental-strip-types --test test/admin-navigation-state.test.mjs test/admin-sections-boundary.test.mjs test/claim-monitor-legal-policy.test.mjs test/public-account-client.test.mjs test/public-account-deletion.test.mjs test/public-account-ui-boundary.test.mjs test/public-admin-router.test.mjs test/public-admin-server-boundary.test.mjs test/public-auth-routes.test.mjs test/public-moderation.test.mjs test/public-plan-client.test.mjs test/public-plan-workspace-ui.test.mjs test/server-admin-permissions.test.mjs test/server-privacy-deletion-ledger.test.mjs test/server-privacy-retention.test.mjs`
  - Result: 58 passed, 0 failed, 0 skipped.
- Production build:
  - `corepack pnpm --filter @workspace/bitcraft-local run build`
  - Result: passed, including server/provider/bindings builds, 1,462-asset verification, TypeScript, Vite, and Relay boundary audit.
- Full suite:
  - `corepack pnpm --filter @workspace/bitcraft-local test`
  - Result: 2,748 total; 2,745 passed, 0 failed, 3 skipped because Windows symlink creation is unavailable; duration 117.8 seconds.
- Diff hygiene:
  - `git diff --check`
  - Result: passed; Git emitted only the repository's Windows LF/CRLF notices.

## Practical collaboration smoke

Built assets were served with the repository smoke launcher at `http://127.0.0.1:18449` and exercised through the in-app browser using the public hostname:

- `/plans` rendered the My Plans shell and correct anonymous sign-in gate.
- Account settings rendered Discord authentication disabled when OAuth is intentionally unconfigured.
- A fabricated shared-plan fragment rendered the same generic unavailable state.
- Browser console inspection showed no errors or warnings.
- No real Discord login, network notification, bot delivery, or user notification was sent. Authenticated collaboration interactions were exercised by the mounted React smoke tests instead.

## Self-review

- Confirmed no automatic conflict overwrite, document/access revision mixing, or invitation auto-acceptance.
- Confirmed the fragment bearer is not placed in a request URL or normal persisted plan state.
- Confirmed public deletion and replay never call Timbersteel identity/plan deletion paths.
- Confirmed public Admin routes are nested under current Admin auth and mutation guards, and UI visibility is not the authorization boundary.
- Confirmed suspension revokes capabilities without restoring revoked secrets later.
- Confirmed no dependencies, versions, changelog, service definitions, database artifacts, logs, or generated build files are included.

## Concerns and operational notes

- Public-ledger replay deliberately uses deletion dispositions of permanent delete for any restored owned public plans. The signed privacy ledger stores no raw identifiers or plan-disposition detail, so it cannot reconstruct an earlier transfer; deleting prevents account/plan resurrection and preserves ledger privacy.
- Live Discord OAuth was intentionally not exercised. The local smoke environment has OAuth disabled, while same-account reauthentication, purpose binding, origin, CSRF, and deletion behavior are covered by integration tests.
- The three full-suite skips are existing Windows filesystem/symlink environment skips, not Task 7 failures.

## Fix round 1/5 — 2026-08-26

### Findings addressed

1. **Draft-base revision safety.** `PlanEditor` now tracks the document revision on which the editable draft is based separately from the latest plan/access projection. Access-only refreshes may advance displayed access and server metadata but cannot rebase a retained draft. Explicit reload/replacement and a successful document save are the only operations that advance the draft-base revision.
2. **Moderator authority split.** Public-service permissions are now independently scoped as `public.health`, `public.lookup`, `public.moderate`, `public.restore`, and `public.privacy`. Owner/administrator retain all five; moderator receives health plus suspend/revoke only; viewer receives health only; Discord manager receives none. Lookup and restore use distinct routes and are enforced server-side. Moderator UI accepts exact account/plan/invite/share identifiers and shows bounded action confirmations without fetching metadata.
3. **Suspended OAuth denial.** After Discord profile exchange and before account upsert, legal acceptance, login timestamp, or session creation, the callback checks the existing public profile. A suspended profile has every public session removed, receives cleared OAuth/session/reauth cookies, and is redirected with the suspended outcome. Restoration does not revive an old cookie; a complete fresh OAuth login is required.
4. **Deleted event-reference privacy.** In the existing deletion transaction, retained event payload fields ending in `userId` are recursively replaced with the literal deletion marker when they reference the deleted public user. Transfer-before-deletion events therefore retain the new owner but expose `previousOwnerUserId: "deleted"`. Actor rows use `{ deleted: true }` in both owner/editor and Admin projections; the private HMAC marker and stable deleted ID are never returned. Forced account-delete failure rolls back ownership, inserted transfer event, actor anonymization, and payload scrubbing together.

### Permission matrix after correction

| Timbersteel Admin role | Health | Exact lookup metadata/events | Suspend/revoke by exact ID | Restore | Privacy |
| --- | --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes | Yes |
| Administrator | Yes | Yes | Yes | Yes | Yes |
| Moderator | Yes | No | Yes, bounded result only | No | No |
| Viewer | Yes | No | No | No | No |
| Discord manager | No | No | No | No | No |

### TDD RED/GREEN evidence

- Draft RED: the mounted revision-4 draft / revision-5 server / access mutation / save sequence sent `If-Match: "document:5"`; the test expected `"document:4"` and failed. GREEN: all 5 workspace tests passed with the local draft preserved and the server returning the expected conflict.
- Authority RED: the router returned `200` for moderator account lookup, the split suspend/restore routes were absent, the mounted moderator UI rendered lookup metadata controls, and the new permission assertions failed (4 expected failures). GREEN: the Admin permission/router/UI/session compatibility run passed 17/17.
- OAuth RED: a suspended callback redirected normally to `/settings` and would have created a session. GREEN: the 9-test auth route file passed, including suspended denial, no new legal/session state, cleared cookie, restored old-cookie rejection, and fresh-login success; the auth plus public-user compatibility run passed 12/12.
- Event privacy RED: retained payloads still contained numeric `userId`, `previousOwnerUserId`, and nested `userId` values. GREEN: deletion/moderation tests passed 7/7, including transfer-before-delete projections and the forced SQLite rollback test.
- Build RED: TypeScript correctly rejected two draft-base assignments because the API plan contract left `revisions` as `unknown`. The public plan response type was narrowed to its existing `{ document, access }` contract; the complete production build then passed.

### Fix-round verification

- Consolidated Task 7 matrix (collaboration, account/auth/deletion, public plans, moderation, Admin, ledger, retention): 78 passed, 0 failed, 0 skipped in 26.5 seconds.
- Production build: passed server/provider/bindings compilation, 1,462-asset verification, TypeScript, Vite, and Relay runtime boundaries.
- Complete suite: 2,752 total; 2,749 passed, 0 failed, 3 existing Windows symlink skips in 113.3 seconds.
- During verification, two initial all-file runs exposed an unrelated asynchronous Discord sandbox assertion in `server.test.mjs` (`555…` observed after expecting `666…`). The unchanged server file passed 4/4 in isolation. The new mounted Admin UI matrix was moved into the existing sequential Vite test file to avoid a second concurrent Vite process; the same UI assertions remain in the focused matrix, and the final full suite passed without editing the unrelated server test.
- `git diff --check`: passed with only the repository's Windows LF/CRLF notices.

### Scope notes

- The requested typed-confirmation and stale-link minor findings remain deliberately deferred and were not changed in this round.
- No dependency, version, changelog, service definition, database artifact, real Discord login, or notification delivery was added.
