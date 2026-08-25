# Task 5 report — isolated public OAuth and legal/privacy flows

## Status

Implemented and verified on 2026-08-26. The Claim Monitor legal document version and effective date are both **2026-08-25**, chosen as the Task 5 policy publication date at task start. They are deliberately separate from the Timbersteel document version and produce separate Terms and Privacy digests.

## Implementation and files

- `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
  - Added the append-only bootstrap definitions for `public_user_accounts`, `public_user_sessions`, and `public_user_legal_acceptances` plus the legal-acceptance lookup index.
  - All foreign keys point only to public-prefixed identity tables and use cascade cleanup.
- `apps/bitcraft-local/src/server/public/identity.mjs`
  - Added an isolated public repository for Discord-profile upsert, session lookup/expiry/logout, legal acceptance, reauthentication timestamps, and account export.
  - Every SQL statement is restricted to the three public-prefixed tables.
- `apps/bitcraft-local/src/server/public/auth.mjs`
  - Added the fixed public OAuth/configuration contract, public-profile signed state, exact cookies, public sessions, and signed recent-reauthentication proof.
- `apps/bitcraft-local/src/server/public/authRouter.mjs`
  - Added public login, callback, session, legal acceptance, logout, export, reauthentication, and deletion-preflight routes.
- `apps/bitcraft-local/server.mjs`
  - Composed the public auth router only through the public HostProfile router, public feature/legal gates, the existing bounded auth limiter, a separately named state secret, and the isolated public repository.
- `apps/bitcraft-local/src/server/httpRequests.mjs`
  - Excluded the public Discord callback query string from generic request logging, matching the existing Timbersteel callback protection.
- `apps/bitcraft-local/src/legal/legalPolicy.mjs` and `legalPolicy.d.mts`
  - Added a distinct BitCraft Claim Monitor policy under the same configured controller, fixed privacy contact, separate version/effective date, providers, retention, Terms, and Privacy documents.
- `apps/bitcraft-local/src/public/accountApi.ts`, `PublicAccountSettings.tsx`, `PublicLegalPage.tsx`, and `PublicAppShell.tsx`
  - Added the same-origin public account/settings, sign-in, legal, export, logout, reauthentication, deletion-review, Terms, and Privacy UI.
- `apps/bitcraft-local/src/public/preferences.d.mts` and `visibleRefresh.d.mts`
  - Added declarations for the existing public shell modules so the production TypeScript boundary remains explicit.
- `apps/bitcraft-local/src/styles.css` and `src/styles/public-shell.css`
  - Added compact responsive account/legal styling and moved the existing public stylesheet import to valid CSS import order.
- `docs/relay-migration/table-inventory.md`
  - Recorded all three tables as isolated `keep-user` identity/privacy state.
- Focused tests were added in `claim-monitor-legal-policy.test.mjs`, `public-account-client.test.mjs`, `public-account-ui-boundary.test.mjs`, `public-auth-contract.test.mjs`, `public-auth-routes.test.mjs`, and `public-identity.test.mjs`; the existing schema-bootstrap and request-logging tests were extended.

## TDD RED/GREEN evidence

1. Schema RED: bootstrap/reopen tests failed because `public_user_accounts` did not exist and the bootstrap source did not contain the required public tables. GREEN: 8/8 schema tests after additive table/index definitions.
2. Repository/legal RED: imports failed because the isolated identity repository and Claim Monitor legal export did not exist. GREEN: 6/6 repository/legal tests after implementing the public-only repository and separate documents/digests.
3. OAuth contract RED: the public auth contract module did not exist. GREEN: 5/5 config, callback, identify-scope, exact-cookie, public-state rejection, and recent-proof tests.
4. Route RED: the public auth router did not exist. GREEN: 5/5 login/session/legal/CSRF/logout/export/reauth/preflight/isolation scenarios.
5. Callback logging RED: `/api/public/auth/discord/callback` remained eligible for generic query logging. GREEN: 4/4 request-log policy tests after suppressing generic callback logging.
6. Client/UI RED: public account client and settings component were absent. GREEN: 3/3 client behavior tests plus the UI boundary test.
7. Self-review RED: a new route-ownership assertion showed sent responses could return `undefined`, allowing the public composer to fall through. GREEN: every handled public-auth route now returns `true`.
8. Full-suite inventory RED: `every fresh SQL table has an explicit live-first ownership decision` failed for the new public tables. GREEN: 2/2 inventory tests after the explicit `keep-user` entry.

Focused combined command:

```text
node --test test/server-schema-bootstrap.test.mjs test/public-identity.test.mjs test/claim-monitor-legal-policy.test.mjs test/public-auth-contract.test.mjs test/public-auth-routes.test.mjs test/public-account-client.test.mjs test/public-account-ui-boundary.test.mjs test/public-shell.test.mjs test/server-http-requests.test.mjs test/public-api-router.test.mjs test/public-router.test.mjs
```

Result: **45 passed, 0 failed**.

Inventory regression command:

```text
node --test test/sql-table-inventory-boundary.test.mjs
```

Result: **2 passed, 0 failed**.

## Schema migration safety

- The schema change uses only `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`; it does not rename, rewrite, or delete existing tables or rows.
- Existing Timbersteel `admin_users`, `admin_sessions`, `user_accounts`, `user_sessions`, and `user_legal_acceptances` definitions and repositories are unchanged.
- Public sessions and legal acceptances reference only `public_user_accounts`; deleting a public account later can cascade only through the public identity graph.
- The table inventory explicitly classifies the three additions as public-profile `keep-user` state independent of Relay and Timbersteel identity.

## Exact OAuth, cookie, identity, and route behavior

- Configuration is read only from `PUBLIC_DISCORD_OAUTH_CLIENT_ID`, `PUBLIC_DISCORD_OAUTH_CLIENT_SECRET`, and the exact `PUBLIC_ORIGIN=https://claim-monitor.com` value.
- The callback is fixed in code to `https://claim-monitor.com/api/public/auth/discord/callback`; a configured alternate callback is not accepted.
- The Discord authorization request uses only `scope=identify`.
- Cookies are exactly `__Host-cm_user_session`, `__Host-cm_oauth_state`, and `__Host-cm_privacy_reauth`, with `Secure; HttpOnly; SameSite=Lax; Path=/`, no `Domain`, 30-day session lifetime, and 10-minute state/reauthentication lifetime.
- OAuth state is separately signed, includes `profile: "public"`, is age-limited and purpose-bound, and rejects a correctly signed Timbersteel-shaped state lacking the public profile.
- Public routes are under `/api/public/...` and are reachable only through the public HostProfile boundary. Timbersteel rejects `/api/public`; public rejects `/api/local`, `/api/discord`, `/admin`, and `/bot`.
- Public mutations require both the production same-origin check and a CSRF token derived from the exact public session cookie.
- The public session lookup and export use only the isolated public repository. Export includes the public account/settings, public legal acceptances, and session metadata; it contains no session token or token hash.
- Public auth status always returns `featurebaseJwt: null` and `analyticsEnabled: false`; the public host cannot reach the Timbersteel analytics routes.
- A test seeds the same Discord ID into a Timbersteel administrator and linked Timbersteel user, completes public OAuth, and proves no Admin session is minted, no Timbersteel user row changes, no character link changes, and only the public tables/cookie are populated.
- Recent deletion reauthentication is bound to the current public user ID, Discord ID, session-token hash, stored session timestamp, public profile, and ten-minute signed cookie. A different Discord profile is rejected.
- Task 5 exposes only `POST /api/public/auth/privacy/deletion-preflight`. It returns `canDelete: false` and `planDispositionReviewRequired: true`; there is no final deletion route or public-data deletion mutation in this task.

## Legal/privacy behavior

- The Claim Monitor policy uses the same controller configuration as Timbersteel but fixes the project name to BitCraft Claim Monitor and the privacy contact to `privacy@claim-monitor.com`.
- It accurately describes optional Discord OAuth identity, requested public Relay lookups, plans and bearer-link access, necessary cookies, bounded security logging, retention, exports, recent reauthentication, plan-disposition preflight, deletion, backups, and restore receipts.
- It does not claim Discord bot/services or continuous monitoring. Public feedback and usage measurement are explicitly described as disabled.
- Production public-profile startup requires `PUBLIC_LEGAL_CONFIGURATION_CONFIRMED=true` before publishing the document/auth flow.

## Final verification

```text
corepack pnpm --filter @workspace/bitcraft-local test
```

Result: **2,691 passed, 0 failed, 3 skipped (2,694 total)** in 116.3 seconds. The three skips are the existing environment-specific Windows skips.

```text
corepack pnpm --filter @workspace/bitcraft-local run build
```

Result: **passed**. Server/provider/bindings TypeScript, asset verification (1,462 assets; 9,437 catalog identities), frontend TypeScript, Vite production build, and Relay runtime-boundary verification all completed successfully with no CSS import warning.

```text
git diff --check
```

Result: **passed**; only Git's informational LF-to-CRLF working-copy notices were emitted.

Browser OAuth was not exercised because Task 5 deliberately requires the real fixed production origin and a separately configured Discord application; tests use a mocked Discord exchange and no live Discord request or notification was sent.

## Self-review

- Searched the isolated public server/client modules for Timbersteel identity/admin/character references; production SQL is public-prefixed only.
- Confirmed callback query logging is redacted, cookies contain every required attribute and no Domain, authorize/token requests use the fixed callback and public client configuration, and state/proof payloads include the public profile boundary.
- Confirmed the public HostProfile denies Timbersteel API/admin/bot routes, while Timbersteel denies the new public API.
- Confirmed there is no public Featurebase token, analytics event path, final account deletion, plan disposition mutation, notification behavior, dependency, service, database file, version bump, or changelog edit.

## Concern / Task 7 handoff

Task 5 does not write a deletion receipt, so the existing privacy ledger does not block this preflight-only implementation. Task 7 must not reuse the current `discord:<id>` subject unchanged: the ledger HMAC subject and replay path currently assume Timbersteel `user_accounts`. Final public plan-aware deletion needs a new public-profile-scoped HMAC subject and public-account replay/delete path while preserving the existing Timbersteel `discord:` semantics and cutover compatibility.

## Fix round 1 — mandatory exact public mutation Origin

Security review found that the initial public router used the shared Timbersteel `sameOriginRequest` behavior, which intentionally accepts a missing Origin and compares an otherwise present Origin by host. Public mutations now use a private exact-origin decision instead. It requires a present, parseable Origin whose normalized origin is exactly `https://claim-monitor.com`, including HTTPS and the effective port, and rejects credentials, path, query, or fragment components. The shared helper and every Timbersteel call site remain unchanged.

The authenticated route test uses a valid public session and valid CSRF token. It verifies rejection of a missing Origin, `http://claim-monitor.com`, `https://claim-monitor.com:444`, `https://user@claim-monitor.com`, and `https://other.example`, preserves the session after every rejection, and verifies that exact `https://claim-monitor.com` succeeds. A separate OAuth-start test proves the same mandatory boundary applies to the only public mutation outside the authenticated `requireSession` path.

### RED 1 — authenticated public mutation

Command:

```text
node --test test/public-auth-routes.test.mjs
```

Output:

```text
✖ public mutations require the exact configured HTTPS Origin even with a valid session and CSRF token
AssertionError [ERR_ASSERTION]: Origin null must be rejected
200 !== 403
tests 6
pass 5
fail 1
```

The failure was the expected vulnerable behavior: a missing Origin reached logout and returned 200.

### GREEN 1 — authenticated public mutation

Command:

```text
node --test test/public-auth-routes.test.mjs
```

Output:

```text
✔ public mutations require the exact configured HTTPS Origin even with a valid session and CSRF token
tests 6
pass 6
fail 0
```

### RED 2 — public OAuth start call site

Command:

```text
node --test test/public-auth-routes.test.mjs
```

Output:

```text
✖ public OAuth start applies the same mandatory exact-Origin boundary
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
200 !== 403
tests 7
pass 6
fail 1
```

The failure proved OAuth start still accepted a missing Origin when its public-only guard was deliberately absent.

### GREEN 2 — every public mutation call site

Command:

```text
node --test test/public-auth-routes.test.mjs
```

Output:

```text
✔ public OAuth persists only a public account/session and never promotes a matching Timbersteel administrator
✔ public session, legal acceptance, export, CSRF logout, and disabled integrations stay isolated
✔ public mutations require the exact configured HTTPS Origin even with a valid session and CSRF token
✔ public OAuth start applies the same mandatory exact-Origin boundary
✔ existing public sessions accept only the current Claim Monitor legal snapshot with CSRF
✔ public deletion preflight requires same-account recent reauthentication and never deletes
✔ public reauthentication rejects a different Discord profile without modifying the session
tests 7
pass 7
fail 0
```

### Focused verification

Command:

```text
node --test test/public-auth-contract.test.mjs test/public-auth-routes.test.mjs test/server-http-requests.test.mjs
```

Output:

```text
tests 16
pass 16
fail 0
```

This includes the unchanged shared `sameOriginRequest` tests, confirming the Timbersteel origin contract still passes.

### Build and full suite

Command:

```text
corepack pnpm --filter @workspace/bitcraft-local run build
```

Output: passed server/provider/bindings TypeScript, asset verification, frontend TypeScript, Vite production build, and Relay runtime-boundary verification (`{"ok":true}`).

The first full-suite run completed 2,692 passes but one spawned-server host-profile test ended with `ECONNRESET`. Direct reproduction exposed the environmental cause: the sandbox denied the child server access to `node_modules/.pnpm/jsonwebtoken/.../index.js` with `EPERM`. No source was changed. Running the exact affected file with the required filesystem access produced:

```text
node --test test/host-profile-boundaries.test.mjs
tests 3
pass 3
fail 0
```

Final full-suite command:

```text
corepack pnpm --filter @workspace/bitcraft-local test
```

Final output:

```text
tests 2696
pass 2693
fail 0
skipped 3
duration_ms 138525.2755
```
