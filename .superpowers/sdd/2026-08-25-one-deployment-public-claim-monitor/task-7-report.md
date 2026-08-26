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
