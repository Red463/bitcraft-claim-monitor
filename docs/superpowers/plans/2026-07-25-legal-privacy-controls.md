# Legal Documents and Privacy Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish comprehensive, versioned Terms of Service and Privacy Policy documents, require informed 18+ acceptance around Discord OAuth, protect administrator character assignment with direct user notice, and give signed-in users working export, unlink, clearing, and account-deletion controls.

**Architecture:** Keep the approved legal text and deployment-specific controller configuration in one shared `.mjs` policy module that both the Node server and Vite frontend can consume. Add explicit legal-acceptance and privacy-service modules around the existing SQLite/auth seams, then expose a small set of user-private endpoints guarded by same-origin checks, user-session CSRF, current legal acceptance, and recent Discord reauthentication where appropriate. Coordinate deletion with a separate HMAC-protected tombstone ledger so restoring an older database cannot restore a deleted account, and encrypt every application-created production backup before publication.

**Tech Stack:** React 19, TypeScript, Vite, plain CSS, Node 24 HTTP server, `node:sqlite`, Node test runner, Bash deployment scripts, Discord OAuth/API.

**Approved design:** `docs/superpowers/specs/2026-07-25-legal-privacy-controls-design.md`

## Global constraints

- The public controller is **Thomas Bush**, an individual developer and operator of **Timbersteel Claim Monitor**, which is described as a free, unofficial community project and not a company or separate legal entity.
- The public privacy contact is `privacy@timbersteeltrade.com`; this release does not publish a postal address.
- The service is 18+ and available worldwide under England and Wales law.
- Use is free. A Buy Me a Coffee donation is optional, creates no paid entitlement, and is handled by Buy Me a Coffee.
- The legal documents disclose HostWorld UK, Namecheap, Discord, BitJita, Proton, Buy Me a Coffee, and GitHub accurately and without implying that every provider stores the application database.
- Legal configuration is deployment-specific. Self-hosters must not silently publish Thomas Bush as their controller.
- Terms acceptance and age confirmation are required before a new Discord OAuth flow begins. Existing signed-in users must accept the current version on their next visit.
- Analytics consent remains separate and optional.
- Administrator character assignment sends the affected Discord user a DM before the database change. A failed DM blocks assignment and leaves the account unchanged.
- User/admin unassignment and full account deletion commit even if a confirmation DM fails.
- Tests must never send real Discord messages.
- No new framework or heavyweight dependency is introduced.
- No changelog or version bump is made during ordinary implementation. Update release metadata only when the user later requests a push, deployment, or release.

---

### Task 1: Create the canonical legal policy and expanded legal pages

**Files:**

- Create: `apps/bitcraft-local/src/legal/legalPolicy.mjs`
- Create: `apps/bitcraft-local/src/legal/legalPolicy.d.mts`
- Create: `apps/bitcraft-local/src/server/legalPolicyDigest.mjs`
- Create: `apps/bitcraft-local/test/legal-policy.test.mjs`
- Modify: `apps/bitcraft-local/src/components/main/LegalDialogs.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Create: `apps/bitcraft-local/test/legal-dialogs-boundary.test.mjs`
- Create: `docs/legal/legitimate-interests-character-linking.md`
- Create: `docs/legal/legitimate-interests-security-and-moderation.md`

**Interfaces:**

- Produces: browser-safe `LEGAL_VERSION`, `LEGAL_EFFECTIVE_DATE`, `defaultLegalOperator`, `legalPolicyForEnvironment(env)`
- Produces: server-only `legalPolicyDigests(policy)`
- Produces: structured `terms.sections`, `privacy.sections`, `retention`, and `providers`
- Consumes: `LEGAL_CONTROLLER_NAME`, `LEGAL_PROJECT_NAME`, `LEGAL_PRIVACY_EMAIL`, `LEGAL_CONTROLLER_COUNTRY`, `LEGAL_GOVERNING_LAW`, `LEGAL_MINIMUM_AGE`, `LEGAL_CONFIGURATION_CONFIRMED`

- [ ] **Step 1: Write failing policy tests**

Create `apps/bitcraft-local/test/legal-policy.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  legalPolicyForEnvironment,
} from "../src/legal/legalPolicy.mjs";
import { legalPolicyDigests } from "../src/server/legalPolicyDigest.mjs";

test("default policy identifies the individual operator without inventing a company", () => {
  const policy = legalPolicyForEnvironment({});
  assert.equal(policy.version, LEGAL_VERSION);
  assert.equal(policy.effectiveDate, LEGAL_EFFECTIVE_DATE);
  assert.equal(policy.operator.controllerName, "Thomas Bush");
  assert.equal(policy.operator.projectName, "Timbersteel Claim Monitor");
  assert.equal(policy.operator.privacyEmail, "privacy@timbersteeltrade.com");
  assert.equal(policy.operator.minimumAge, 18);
  assert.match(policy.operator.status, /individual developer and operator/i);
  assert.match(policy.operator.status, /not a company or separate legal entity/i);
  assert.equal("postalAddress" in policy.operator, false);
});

test("policy contains every approved provider, right, and retention category", () => {
  const policy = legalPolicyForEnvironment({});
  for (const sectionId of [
    "operator", "eligibility", "accounts-and-sessions", "character-linking",
    "discord-and-app-features", "acceptable-use", "suspension-and-termination",
    "intellectual-property", "third-party-services", "donations", "availability",
    "liability", "complaints", "changes", "general-terms", "governing-law",
  ]) {
    assert.ok(policy.terms.sections.some(({ id }) => id === sectionId), sectionId);
  }
  assert.deepEqual(
    policy.providers.map(({ key }) => key),
    ["hostworld", "namecheap", "discord", "bitjita", "proton", "buy-me-a-coffee", "github"],
  );
  for (const sectionId of [
    "controller", "data-we-process", "lawful-bases", "character-linking",
    "discord-administration", "analytics", "sharing", "international-transfers",
    "retention", "rights", "deletion-and-backups", "security", "complaints", "contact",
  ]) {
    assert.ok(policy.privacy.sections.some(({ id }) => id === sectionId), sectionId);
  }
  assert.ok(policy.retention.some(({ key, days }) => key === "full-ip" && days === 7));
  assert.ok(policy.retention.some(({ key, days }) => key === "analytics-events" && days === 90));
  assert.ok(policy.retention.some(({ key, days }) => key === "deletion-ledger" && days === 90));
});

test("deployment overrides affect the published policy and stable digest", () => {
  const overrides = {
    LEGAL_CONTROLLER_NAME: "Example Operator",
    LEGAL_PROJECT_NAME: "Example Monitor",
    LEGAL_PRIVACY_EMAIL: "privacy@example.test",
    LEGAL_CONTROLLER_COUNTRY: "France",
    LEGAL_GOVERNING_LAW: "France",
    LEGAL_MINIMUM_AGE: "19",
  };
  const first = legalPolicyForEnvironment(overrides);
  const second = legalPolicyForEnvironment(overrides);
  assert.equal(first.operator.controllerName, "Example Operator");
  assert.equal(first.operator.minimumAge, 19);
  assert.deepEqual(legalPolicyDigests(first), legalPolicyDigests(second));
  assert.notDeepEqual(legalPolicyDigests(first), legalPolicyDigests(legalPolicyForEnvironment({})));
});

test("production refuses an unconfirmed legal identity", () => {
  assert.throws(
    () => legalPolicyForEnvironment({ NODE_ENV: "production" }),
    /LEGAL_CONFIGURATION_CONFIRMED/,
  );
  assert.doesNotThrow(() => legalPolicyForEnvironment({
    NODE_ENV: "production",
    LEGAL_CONFIGURATION_CONFIRMED: "true",
  }));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test apps/bitcraft-local/test/legal-policy.test.mjs
```

Expected: FAIL because `src/legal/legalPolicy.mjs` does not exist.

- [ ] **Step 3: Implement the shared policy**

Create a frozen policy object with this public shape:

```js
export const LEGAL_VERSION = "2026-07-25";
export const LEGAL_EFFECTIVE_DATE = "2026-07-25";

export const defaultLegalOperator = Object.freeze({
  controllerName: "Thomas Bush",
  projectName: "Timbersteel Claim Monitor",
  privacyEmail: "privacy@timbersteeltrade.com",
  controllerCountry: "United Kingdom",
  governingLaw: "England and Wales",
  minimumAge: 18,
  status: "Thomas Bush is the individual developer and operator of Timbersteel Claim Monitor, a free, unofficial community project. Timbersteel Claim Monitor is not a company or separate legal entity.",
});
```

`legalPolicyForEnvironment(env)` must:

1. apply the six documented `LEGAL_*` overrides;
2. reject a blank name, project name, invalid email, age below 18, or missing country/law;
3. reject production startup unless `LEGAL_CONFIGURATION_CONFIRMED=true`, forcing each operator to review or override the published identity;
4. return complete structured Terms and Privacy documents;
5. include the exact retention schedule approved in the design;
6. state that optional donations create no entitlement, subscription, service level, ownership interest, or priority support;
7. use balanced liability language that does not exclude liability that cannot lawfully be excluded;
8. explain admin linking, user notice, user unlinking, deletion, backup tombstones, and Discord/BitJita public data;
9. state that the project is unofficial and is not affiliated with Clockwork Labs, BitCraft, BitJita, Discord, HostWorld, Namecheap, Proton, GitHub, or Buy Me a Coffee;
10. state that special-category data is not intentionally requested and no solely automated decision has legal or similarly significant effects;
11. mark legal text as service information, not legal advice.

Keep `legalPolicy.mjs` browser-safe: it must not import `node:crypto`, `node:fs`, or other Node-only modules.

Implement `legalPolicyDigests` in `src/server/legalPolicyDigest.mjs` as separate SHA-256 digests over stable JSON representations of the Terms and Privacy documents, including the version, effective date, operator, applicable providers, and relevant retention content. Do not include transient runtime fields.

Create `legalPolicy.d.mts` with concrete `LegalPolicy`, `LegalSection`, `LegalProvider`, and `RetentionRule` types so React imports do not fall back to `any`.

- [ ] **Step 4: Replace the short legal copy with structured rendering**

Update `LegalDialogs.tsx` so `TermsContent`, `PrivacyContent`, and `DedicatedLegalPage` render the same structured policy. Preserve the existing dialogs and dedicated `/terms` and `/privacy` routes, but add:

- version and effective date;
- controller status/contact block;
- section navigation;
- accessible headings and lists;
- retention table;
- provider disclosures;
- a prominent explanation of admin character assignment and user controls;
- optional Buy Me a Coffee wording and the existing `https://buymeacoffee.com/tom.bush` link;
- links between Terms and Privacy.

Do not use `dangerouslySetInnerHTML`.

Add a compact responsive table treatment and viewport-bounded dialog scrolling in `app-chrome.css`.

- [ ] **Step 5: Add source-boundary tests for the legal UI**

Create `apps/bitcraft-local/test/legal-dialogs-boundary.test.mjs` that asserts:

```js
assert.match(source, /legalPolicyForEnvironment|defaultLegalPolicy/);
assert.match(source, /terms\.sections/);
assert.match(source, /privacy\.sections/);
assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
assert.match(css, /\.legal-retention-table/);
assert.match(css, /max-height:\s*calc\(100vh/);
assert.match(css, /overflow-y:\s*auto/);
```

- [ ] **Step 6: Write the legitimate-interests assessments**

Create two dated records under `docs/legal/`:

- character linking: purpose, necessity, privacy impact, direct-DM safeguard, duplicate blocking, unlink/deletion rights, balancing conclusion, review date;
- security/moderation: fraud/abuse prevention purpose, data minimisation, retention, access controls, anonymisation, objections, balancing conclusion, review date.

Use the controller wording above and mark both records for solicitor review before production launch.

- [ ] **Step 7: Run focused tests and inspect the rendered copy**

Run:

```powershell
node --test apps/bitcraft-local/test/legal-policy.test.mjs apps/bitcraft-local/test/legal-dialogs-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests and build PASS.

- [ ] **Step 8: Commit the canonical legal content**

```powershell
git add apps/bitcraft-local/src/legal apps/bitcraft-local/src/server/legalPolicyDigest.mjs apps/bitcraft-local/src/components/main/LegalDialogs.tsx apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/test/legal-policy.test.mjs apps/bitcraft-local/test/legal-dialogs-boundary.test.mjs docs/legal
git commit -m "feat: publish comprehensive legal documents"
```

---

### Task 2: Add legal acceptance persistence and user-session CSRF

**Files:**

- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
- Modify: `apps/bitcraft-local/src/server/schemaMigrations.mjs`
- Modify: `apps/bitcraft-local/src/server/preparedStatements.mjs`
- Create: `apps/bitcraft-local/src/server/legalAcceptance.mjs`
- Create: `apps/bitcraft-local/test/server-legal-acceptance.test.mjs`
- Modify: `apps/bitcraft-local/src/server/httpCsrf.mjs`
- Modify: `apps/bitcraft-local/test/server-http-csrf.test.mjs`
- Modify: `apps/bitcraft-local/test/server-schema-bootstrap.test.mjs`
- Modify: `apps/bitcraft-local/test/server-prepared-statements.test.mjs`

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS user_legal_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  legal_version TEXT NOT NULL,
  terms_digest TEXT NOT NULL,
  privacy_digest TEXT NOT NULL,
  age_confirmed INTEGER NOT NULL CHECK (age_confirmed IN (0, 1)),
  accepted_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('oauth', 'existing-session')),
  FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
  UNIQUE (user_id, legal_version, terms_digest, privacy_digest)
);
CREATE INDEX IF NOT EXISTS idx_user_legal_acceptances_user_time
  ON user_legal_acceptances (user_id, accepted_at DESC);
```

Add `reauthenticated_at TEXT` to `user_sessions` through the additive migration list. New sessions set both `created_at` and `reauthenticated_at`; later privacy reauthentication only updates `reauthenticated_at`.

- [ ] **Step 1: Write failing schema and policy tests**

Extend the schema and prepared-statement tests to require:

```js
assert.match(schemaBootstrapSql, /CREATE TABLE IF NOT EXISTS user_legal_acceptances/);
assert.match(schemaBootstrapSql, /UNIQUE \(user_id, legal_version, terms_digest, privacy_digest\)/);
assert.ok(statements.currentUserLegalAcceptance);
assert.ok(statements.insertUserLegalAcceptance);
assert.ok(statements.updateUserSessionReauthenticatedAt);
assert.ok(statements.deleteExpiredUserSessions);
```

Create `server-legal-acceptance.test.mjs` around pure functions:

```js
test("acceptance is current only when version and both digests match", () => {
  const expected = { version: "2026-07-25", termsDigest: "terms", privacyDigest: "privacy" };
  assert.equal(isCurrentLegalAcceptance({ legal_version: "2026-07-25", terms_digest: "terms", privacy_digest: "privacy" }, expected), true);
  assert.equal(isCurrentLegalAcceptance({ legal_version: "2026-07-24", terms_digest: "terms", privacy_digest: "privacy" }, expected), false);
});

test("legal gate preserves only legal, export, deletion, logout, and public routes", () => {
  assert.equal(routeAllowedWithoutCurrentAcceptance("POST", "/api/local/auth/legal/accept"), true);
  assert.equal(routeAllowedWithoutCurrentAcceptance("GET", "/api/local/auth/privacy/export"), true);
  assert.equal(routeAllowedWithoutCurrentAcceptance("POST", "/api/local/auth/privacy/reauth/start"), true);
  assert.equal(routeAllowedWithoutCurrentAcceptance("DELETE", "/api/local/auth/privacy/account"), true);
  assert.equal(routeAllowedWithoutCurrentAcceptance("PUT", "/api/local/auth/settings"), false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --test apps/bitcraft-local/test/server-schema-bootstrap.test.mjs apps/bitcraft-local/test/server-prepared-statements.test.mjs apps/bitcraft-local/test/server-legal-acceptance.test.mjs apps/bitcraft-local/test/server-http-csrf.test.mjs
```

Expected: FAIL on the missing table, statements, module, and user CSRF helper.

- [ ] **Step 3: Implement schema and acceptance helpers**

Add the table/index, `reauthenticated_at` migration, and prepared statements. In `legalAcceptance.mjs`, export:

```js
export function currentLegalSnapshot(policy) {
  return {
    version: policy.version,
    ...legalPolicyDigests(policy),
  };
}

export function isCurrentLegalAcceptance(row, expected) {
  return Boolean(row)
    && row.legal_version === expected.version
    && row.terms_digest === expected.termsDigest
    && row.privacy_digest === expected.privacyDigest
    && Number(row.age_confirmed) === 1;
}

export function publicLegalStatus(row, expected) {
  return {
    version: expected.version,
    termsDigest: expected.termsDigest,
    privacyDigest: expected.privacyDigest,
    acceptedAt: isCurrentLegalAcceptance(row, expected) ? row.accepted_at : null,
    requiresAcceptance: !isCurrentLegalAcceptance(row, expected),
  };
}
```

Keep route allowance as an explicit allowlist, not a substring or prefix that could accidentally expose future endpoints.

- [ ] **Step 4: Generalise CSRF derivation without changing admin tokens**

In `httpCsrf.mjs`, retain `csrfToken(req)` as the admin-compatible export and add:

```js
export function csrfTokenForCookie(req, cookieName) {
  return csrfTokenFromSession(cookieValue(req, cookieName));
}

export function appUserCsrfToken(req) {
  return csrfTokenForCookie(req, "bitcraft_user_session");
}
```

Test that admin tokens remain byte-for-byte unchanged, user tokens derive from only the user cookie, and swapping admin/user tokens fails exact comparison.

- [ ] **Step 5: Run focused tests and verify GREEN**

```powershell
node --test apps/bitcraft-local/test/server-schema-bootstrap.test.mjs apps/bitcraft-local/test/server-prepared-statements.test.mjs apps/bitcraft-local/test/server-legal-acceptance.test.mjs apps/bitcraft-local/test/server-http-csrf.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the persistence and CSRF foundation**

```powershell
git add apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/src/server/schemaMigrations.mjs apps/bitcraft-local/src/server/preparedStatements.mjs apps/bitcraft-local/src/server/legalAcceptance.mjs apps/bitcraft-local/test/server-legal-acceptance.test.mjs apps/bitcraft-local/src/server/httpCsrf.mjs apps/bitcraft-local/test/server-http-csrf.test.mjs apps/bitcraft-local/test/server-schema-bootstrap.test.mjs apps/bitcraft-local/test/server-prepared-statements.test.mjs
git commit -m "feat: persist legal acceptance securely"
```

---

### Task 3: Require acceptance before OAuth and gate stale sessions

**Files:**

- Modify: `apps/bitcraft-local/src/server/oauthState.mjs`
- Modify: `apps/bitcraft-local/test/server-oauth-state.test.mjs`
- Modify: `apps/bitcraft-local/src/server/discordOAuthFlow.mjs`
- Modify: `apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs`
- Modify: `apps/bitcraft-local/src/types/settings.ts`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server.test.mjs`

**API contract:**

- `GET /api/local/legal` → current public policy plus Terms/Privacy digests
- `POST /api/local/auth/discord/start` with `{ returnTo, acceptedTerms: true, ageConfirmed: true }` → `{ authorizeUrl }` plus signed HttpOnly OAuth state cookie
- legacy `GET /api/local/auth/discord/start` → local legal-required redirect, never Discord
- `GET /api/local/auth/me` → `{ user, csrfToken, discordLoginEnabled, legal }`
- `POST /api/local/auth/legal/accept` with current user CSRF → current auth payload

- [ ] **Step 1: Write failing OAuth-state tests**

Extend `server-oauth-state.test.mjs` so the signed payload round-trips:

```js
const legal = {
  version: "2026-07-25",
  termsDigest: "terms",
  privacyDigest: "privacy",
  ageConfirmed: true,
  acceptedAt: "2026-07-25T12:00:00.000Z",
};
const cookie = createDiscordOAuthStateCookie(db, {
  state: "state-value",
  returnTo: "/?page=members",
  legal,
  purpose: "login",
});
assert.deepEqual(readDiscordOAuthStateCookie(db, cookie).legal, legal);
```

Add rejection cases for missing/false age confirmation, stale version/digest, expired state, tampered state, and replay without the cookie.

- [ ] **Step 2: Add failing server integration cases**

In `server.test.mjs`, replace the anonymous GET-start success expectation with:

1. GET start redirects to `/?legal=required&returnTo=%2F`;
2. POST start rejects cross-origin, missing acceptance, and false age confirmation;
3. valid POST returns a Discord authorize URL and signed HttpOnly state cookie;
4. callback rejects a signed state whose version/digests are no longer current, and otherwise persists the exact signed acceptance rather than callback query data;
5. `/auth/me` includes a user CSRF token and `legal.requiresAcceptance`;
6. stale users receive `428 { error, code: "legal_acceptance_required", legal }` from settings, character, watches, and other signed-in feature mutations;
7. stale users can still fetch legal documents, export, delete, accept, and logout;
8. `POST /auth/legal/accept` requires same-origin plus the user CSRF token.

- [ ] **Step 3: Run OAuth and integration tests and verify RED**

```powershell
node --test apps/bitcraft-local/test/server-oauth-state.test.mjs apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: FAIL because the state payload and routes still use the old direct-GET flow.

- [ ] **Step 4: Implement the public policy route and POST OAuth start**

At startup, build one policy snapshot and its two server-side digests once. Return only public legal data.

The POST handler must:

```js
if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin sign-in rejected" });
const body = await readJson(req, BODY_LIMITS.auth);
if (body.acceptedTerms !== true || body.ageConfirmed !== true) {
  return send(res, 400, { error: "Terms acceptance and age confirmation are required" });
}
const legal = {
  ...currentLegalSnapshot(policy),
  ageConfirmed: true,
  acceptedAt: new Date().toISOString(),
};
```

Generate OAuth state only after these checks, put the legal snapshot inside the signed HttpOnly state cookie, and return the authorize URL. Do not accept a client-provided version or digest.

- [ ] **Step 5: Persist callback acceptance and expose the current gate**

On a successful callback:

1. validate and consume the signed state cookie;
2. upsert the Discord user;
3. insert the signed legal acceptance using source `oauth`;
4. create sessions with `reauthenticated_at`;
5. clear the OAuth state cookie;
6. redirect to the clamped local return path.

Refactor `requireAppUser` to:

```js
function requireAppUser(req, res, { allowStaleLegal = false } = {}) {
  const user = getAppUser(req);
  if (!user) { send(res, 401, { error: "Discord sign-in required" }); return null; }
  if (!sameOriginRequest(req)) { send(res, 403, { error: "Cross-origin request rejected" }); return null; }
  if (!validCsrfHeader(req.headers["x-csrf-token"], appUserCsrfToken(req))) {
    send(res, 403, { error: "Invalid CSRF token" }); return null;
  }
  if (!allowStaleLegal && !userHasCurrentLegalAcceptance(user.id)) {
    send(res, 428, { code: "legal_acceptance_required", legal: currentPublicLegalStatus() });
    return null;
  }
  return user;
}
```

For safe GET export/status routes, split authentication from mutation CSRF so GET does not require a custom header but still checks the session and legal exception explicitly.

`POST /auth/legal/accept` inserts source `existing-session` using the server’s current snapshot and returns refreshed `/auth/me` data.

- [ ] **Step 6: Extend frontend auth types**

Update `UserAuthState` with:

```ts
csrfToken: string | null;
legal: {
  version: string;
  termsDigest: string;
  privacyDigest: string;
  acceptedAt: string | null;
  requiresAcceptance: boolean;
};
```

Use an explicit anonymous default object in `AppShell`; do not make downstream code guess whether `legal` exists.

- [ ] **Step 7: Run focused backend tests and verify GREEN**

```powershell
node --test apps/bitcraft-local/test/server-oauth-state.test.mjs apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: all focused tests PASS and no test reaches Discord’s real API.

- [ ] **Step 8: Commit the acceptance gate**

```powershell
git add apps/bitcraft-local/src/server/oauthState.mjs apps/bitcraft-local/test/server-oauth-state.test.mjs apps/bitcraft-local/src/server/discordOAuthFlow.mjs apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs apps/bitcraft-local/src/types/settings.ts apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: require legal acceptance for Discord login"
```

---

### Task 4: Add the pre-login and next-visit acceptance experience

**Files:**

- Create: `apps/bitcraft-local/src/components/main/LegalAcceptanceDialog.tsx`
- Modify: `apps/bitcraft-local/src/components/main/LegalDialogs.tsx`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/components/main/UserSettingsDialog.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs`
- Create: `apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs`

- [ ] **Step 1: Write failing UI boundary tests**

Require:

```js
assert.match(dialog, /I confirm I am at least 18/);
assert.match(dialog, /I agree to the Terms of Service/);
assert.match(dialog, /Privacy Policy/);
assert.match(dialog, /acceptedTerms && ageConfirmed/);
assert.match(appShell, /method:\s*"POST"[\s\S]*\/api\/local\/auth\/discord\/start/);
assert.match(appShell, /x-csrf-token/);
assert.doesNotMatch(legalDialogs, /<a[^>]+href=\{authHref\}/);
```

Also assert the acceptance dialog is a fixed viewport overlay with bounded height and internal scrolling.

- [ ] **Step 2: Run boundary tests and verify RED**

```powershell
node --test apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs
```

Expected: FAIL because sign-in still uses a direct link and no acceptance dialog exists.

- [ ] **Step 3: Implement the acceptance dialog**

The dialog must:

- show controller/project identity and current effective date;
- link to the full Terms and Privacy documents without losing entered state;
- require two unchecked checkboxes: 18+ confirmation and Terms agreement;
- explain that Discord identity data is received during sign-in;
- disable **Continue with Discord** until both boxes are checked;
- POST to the server and navigate only to the returned `authorizeUrl`;
- show a local error and remain open if start preparation fails.

Do not combine analytics consent with legal acceptance.

- [ ] **Step 4: Gate every application Discord-login entry point**

Replace direct `window.location.href = discordAuthHref` and raw sign-in anchors with one `beginDiscordLogin(returnTo)` action that opens `LegalAcceptanceDialog`. Handle `?legal=required` by opening the same dialog after loading the public legal policy.

For an existing signed-in stale user, show a non-dismissible next-visit acceptance dialog. Require the same unchecked 18+ and Terms confirmations before its **Accept and continue** action POSTs `/auth/legal/accept` with the user CSRF token and refreshes auth state. Keep export, deletion, legal pages, and logout reachable from this blocked state.

Add `x-csrf-token` to every existing user mutation (`/auth/character`, `/auth/settings`, deal watches, and future privacy mutations).

- [ ] **Step 5: Run build and UI tests**

```powershell
node --test apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests and build PASS.

- [ ] **Step 6: Browser-check both acceptance states**

Build and run the smoke server:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

At `http://127.0.0.1:18449/`, verify:

- Discord sign-in opens the legal dialog before leaving the app;
- the continue action is disabled until both checkboxes are selected;
- Terms and Privacy links are readable at desktop and narrow widths;
- no blank page, hook-order error, or console error occurs;
- no real OAuth completion is attempted with production credentials.

- [ ] **Step 7: Commit the acceptance UI**

```powershell
git add apps/bitcraft-local/src/components/main/LegalAcceptanceDialog.tsx apps/bitcraft-local/src/components/main/LegalDialogs.tsx apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/components/main/UserSettingsDialog.tsx apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs
git commit -m "feat: add legal acceptance experience"
```

---

### Task 5: Enforce direct user notice for administrator character changes

**Files:**

- Create: `apps/bitcraft-local/src/server/characterLinkNotifications.mjs`
- Create: `apps/bitcraft-local/test/server-character-link-notifications.test.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server.test.mjs`

**Assignment order:**

```text
validate admin + target + current acceptance + duplicate
→ send affected-user DM
→ BEGIN IMMEDIATE
→ re-read target and duplicate
→ assign approved character + audit
→ COMMIT
→ send admin mod-log notification
```

**Unassignment order:**

```text
validate admin + target
→ BEGIN IMMEDIATE
→ clear link + audit
→ COMMIT
→ attempt affected-user DM
→ send admin mod-log notification
```

- [ ] **Step 1: Write failing payload and flow tests**

The pure module must produce DM payloads with:

- project name;
- administrator display name;
- character name/player ID;
- whether the link was assigned or removed;
- a statement that the user can unlink/delete from **Settings → Privacy & Data**;
- `allowed_mentions: { parse: [] }`.

Extend integration tests to prove:

1. target without current legal acceptance receives 409 and no DM;
2. assignment DM failure returns 502 and leaves link/audit unchanged;
3. duplicate detected before DM sends no DM;
4. duplicate introduced between DM and transaction returns 409 and sends a corrective DM;
5. successful assignment commits once, then logs the admin-channel event;
6. unassignment commits even when the user DM fails;
7. failed unassignment DM is recorded but does not restore the link.

Use the existing fake Discord HTTP path; do not enable real Discord startup.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --test apps/bitcraft-local/test/server-character-link-notifications.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: FAIL because assignment currently writes before any affected-user DM.

- [ ] **Step 3: Implement direct-message helpers**

Export:

```js
characterLinkAssignedDm({ projectName, administrator, characterName, characterPlayerId })
characterLinkUnassignedDm({ projectName, administrator, characterName, characterPlayerId })
characterLinkAssignmentCorrectiveDm({ projectName, characterName, characterPlayerId })
```

Keep sending in `server.mjs` through the existing `sendDiscordDirectMessage`; keep payload construction independently testable.

- [ ] **Step 4: Make assignment DM-first and race-safe**

Require a current acceptance row for the target. Send the affected-user DM before opening the write transaction. Then use `BEGIN IMMEDIATE`, repeat target and duplicate checks, update, audit, and commit. Roll back on every database error.

If the final recheck fails after a successful DM, do not assign. Best-effort send the corrective DM stating that the attempted assignment did not complete; record both delivery outcomes.

Admin mod-log failure after commit remains non-transactional and visible in delivery diagnostics.

- [ ] **Step 5: Make removals commit-first**

For both administrator and self-service unlinking, clear the link in a transaction, then attempt the user/admin notifications. Return success plus notification status; never roll the link back because a DM failed.

- [ ] **Step 6: Run focused backend tests**

```powershell
node --test apps/bitcraft-local/test/server-character-link-notifications.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the linking safeguards**

```powershell
git add apps/bitcraft-local/src/server/characterLinkNotifications.mjs apps/bitcraft-local/test/server-character-link-notifications.test.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: notify users before admin character assignment"
```

---

### Task 6: Add export and granular self-service privacy controls

**Files:**

- Create: `apps/bitcraft-local/src/server/userPrivacy.mjs`
- Create: `apps/bitcraft-local/test/server-user-privacy.test.mjs`
- Modify: `apps/bitcraft-local/src/server/preparedStatements.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Create: `apps/bitcraft-local/src/components/main/PrivacyDataSection.tsx`
- Modify: `apps/bitcraft-local/src/components/main/UserSettingsDialog.tsx`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles/user-settings.css`
- Modify: `apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs`

**Endpoints:**

- `GET /api/local/auth/privacy/export`
- `DELETE /api/local/auth/privacy/character`
- `DELETE /api/local/auth/privacy/settings`
- `DELETE /api/local/auth/privacy/market-data`
- `DELETE /api/local/auth/privacy/analytics`

- [ ] **Step 1: Write failing privacy-service tests**

Use an in-memory database with the real schema. Seed two users and assert:

- export returns only the requesting user’s account, settings, acceptance history, link, watches, alerts, craft watches, component votes, moderation records, and relevant sanitized delivery/audit entries;
- secrets, raw bot tokens, other users, unrelated public BitJita data, full IPs, session token hashes, and internal HMAC values are absent;
- unlink clears only character fields;
- clearing preferences resets `settings_json` to `{}`;
- market clearing deletes alerts before watches for only that user;
- analytics clearing deletes only reliably matched current-browser visitor/session keys and returns counts;
- every action is idempotent.

Expected export envelope:

```js
{
  exportedAt: "ISO timestamp",
  legalVersion: "2026-07-25",
  account: {},
  characterLink: {},
  legalAcceptances: [],
  settings: {},
  market: { watches: [], alerts: [] },
  discord: { craftWatches: [], votes: [], moderation: [] },
  activity: { adminActions: [], deliveries: [] },
}
```

- [ ] **Step 2: Run the service test and verify RED**

```powershell
node --test apps/bitcraft-local/test/server-user-privacy.test.mjs
```

Expected: FAIL because `userPrivacy.mjs` does not exist.

- [ ] **Step 3: Implement the privacy service**

Export dependency-injected functions:

```js
createUserDataExport(db, { userId, discordId, visitorKey, sessionKey, legalVersion, now })
unlinkUserCharacter(db, { userId })
clearUserSettings(db, { userId })
clearUserMarketData(db, { userId })
clearCurrentBrowserAnalytics(db, { visitorKey, sessionKey })
```

Use parameterized SQL only. Parse stored JSON defensively and redact keys matching token, secret, authorization, cookie, IP, and HMAC patterns before returning the export.

- [ ] **Step 4: Add authenticated routes**

All DELETE routes require:

- current user session;
- same origin;
- current user CSRF;
- current legal acceptance, except export remains available to stale users.

Return `{ ok: true, deleted: { tableName: count } }`. Character unlink attempts its confirmation DM after commit and includes `{ notification: { ok, error? } }` without changing the HTTP success status.

The analytics-clearing response must expire the current analytics consent, visitor, and analytics-session cookies. `AppShell` must also reset its in-memory/local analytics-consent state so no new optional event is sent unless the user makes a fresh choice.

Return the export as `application/json` with:

```http
Content-Disposition: attachment; filename="timbersteel-claim-monitor-data-YYYY-MM-DD.json"
Cache-Control: no-store
```

- [ ] **Step 5: Build the Privacy & Data settings section**

Add a fourth settings tab, **Privacy & Data**, implemented in the focused component. It must show:

- current legal version/acceptance date;
- **Download my data**;
- **Unlink my character**;
- **Clear saved preferences**;
- **Delete market watches and alerts**;
- **Clear this browser’s analytics data and withdraw consent**;
- **Delete my account and personal data** (wired in Task 7);
- explanatory copy about Discord DMs and backup-safe deletion.

Every destructive granular action uses an in-app confirmation and reports returned deletion counts. Do not use browser `confirm()`.

- [ ] **Step 6: Run focused tests and build**

```powershell
node --test apps/bitcraft-local/test/server-user-privacy.test.mjs apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs apps/bitcraft-local/test/server.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests and build PASS.

- [ ] **Step 7: Commit granular privacy controls**

```powershell
git add apps/bitcraft-local/src/server/userPrivacy.mjs apps/bitcraft-local/test/server-user-privacy.test.mjs apps/bitcraft-local/src/server/preparedStatements.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/src/components/main/PrivacyDataSection.tsx apps/bitcraft-local/src/components/main/UserSettingsDialog.tsx apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles/user-settings.css apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs
git commit -m "feat: add self-service privacy controls"
```

---

### Task 7: Implement recent reauthentication and full account deletion

**Files:**

- Create: `apps/bitcraft-local/src/server/accountDeletion.mjs`
- Create: `apps/bitcraft-local/test/server-account-deletion.test.mjs`
- Modify: `apps/bitcraft-local/src/server/oauthState.mjs`
- Modify: `apps/bitcraft-local/src/server/discordOAuthFlow.mjs`
- Modify: `apps/bitcraft-local/src/server/preparedStatements.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/components/main/PrivacyDataSection.tsx`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/test/server.test.mjs`

**Endpoints:**

- `POST /api/local/auth/privacy/reauth/start` → `{ authorizeUrl }`
- OAuth callback with `purpose: "privacy-delete"` → refreshes only the matching current session
- `DELETE /api/local/auth/privacy/account` with `{ confirmation: "DELETE" }`

**Recent-auth policy:** reauthentication must be no older than 10 minutes.

- [ ] **Step 1: Write failing deletion tests**

Seed one ordinary account and one account that is also the sole active owner. Require:

1. wrong/missing typed confirmation → 400;
2. missing/stale reauth → 403 with `code: "recent_discord_reauthentication_required"`;
3. reauth callback with a different Discord ID → 403, session unchanged;
4. valid deletion removes user sessions, account, settings, acceptance, link, watches, alerts, craft watches, votes, RSVP/poll/temp records, warnings, notes, and bans;
5. moderation rows that must be retained are anonymized to a stable non-reversible subject marker;
6. admin audit and Discord delivery JSON/summary fields are scrubbed of Discord ID, username, character ID, and character name;
7. other users and public game data remain unchanged;
8. sole-owner `admin_users` identity remains active while the ordinary `user_accounts` identity is deleted;
9. repeat deletion returns a non-sensitive idempotent receipt;
10. deletion commits even when the goodbye DM fails.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --test apps/bitcraft-local/test/server-account-deletion.test.mjs apps/bitcraft-local/test/server-oauth-state.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: FAIL because reauthentication purpose and deletion service are absent.

- [ ] **Step 3: Add purpose-bound reauthentication**

Extend the signed OAuth state with `purpose: "login" | "privacy-delete"` and, for privacy deletion, the current user/session identity. The callback must:

- require the existing app-user session;
- require the returned Discord profile ID to equal that session’s Discord ID;
- update only that session’s `reauthenticated_at`;
- create no new account and change no admin identity;
- clear the OAuth state cookie;
- redirect to `/?privacy=delete-ready`.

- [ ] **Step 4: Implement the deletion transaction**

`deleteUserAccount(db, context)` must start `BEGIN IMMEDIATE`, re-read the target, and apply an explicit deletion manifest. Do not discover tables dynamically.

Delete child data before `user_accounts`. For records retained for security/moderation, replace identifiers with:

```js
const anonymizedSubject = `deleted:${createHmac("sha256", deletionKey)
  .update(`discord:${discordId}`)
  .digest("base64url")
  .slice(0, 22)}`;
```

Recursively scrub JSON string values and free-text summaries that exactly contain the known Discord ID, username/global name, character player ID, or character name. Do not run broad replacements against unrelated values.

Return:

```js
{
  receiptId,
  deletedAt,
  deleted: {
    user_accounts: 1,
    user_sessions: 1,
    user_legal_acceptances: 1,
    market_deal_watches: 2,
    market_deal_alerts: 4,
  },
  anonymized: { discord_mod_cases: 2, admin_audit_log: 1, discord_delivery_log: 3 },
}
```

The receipt contains no raw identifier.

- [ ] **Step 5: Add the deletion route and UI**

The route requires current session, same-origin, user CSRF, typed `DELETE`, and recent reauth. It is allowed even when legal acceptance is stale.

After commit:

1. attempt a final Discord DM;
2. clear app-user and analytics/consent cookies;
3. return the non-sensitive receipt and DM status;
4. never restore data because the DM failed.

The UI is a viewport-fixed destructive-action dialog. It explains scope, owner/admin separation, backup tombstones, and irreversible effects; launches reauth; then requires the exact word `DELETE`.

- [ ] **Step 6: Run focused tests and build**

```powershell
node --test apps/bitcraft-local/test/server-account-deletion.test.mjs apps/bitcraft-local/test/server-oauth-state.test.mjs apps/bitcraft-local/test/server-discord-oauth-flow.test.mjs apps/bitcraft-local/test/server.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests and build PASS.

- [ ] **Step 7: Commit deletion and reauthentication**

```powershell
git add apps/bitcraft-local/src/server/accountDeletion.mjs apps/bitcraft-local/test/server-account-deletion.test.mjs apps/bitcraft-local/src/server/oauthState.mjs apps/bitcraft-local/src/server/discordOAuthFlow.mjs apps/bitcraft-local/src/server/preparedStatements.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/src/components/main/PrivacyDataSection.tsx apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: add verified account deletion"
```

---

### Task 8: Make deletion survive restores and encrypt production backups

**Files:**

- Create: `apps/bitcraft-local/src/server/privacyDeletionLedger.mjs`
- Create: `apps/bitcraft-local/test/server-privacy-deletion-ledger.test.mjs`
- Modify: `apps/bitcraft-local/src/server/accountDeletion.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Create: `deploy/backup-crypto.mjs`
- Create: `scripts/test/deploy-backup-crypto.test.mjs`
- Modify: `deploy/backup-bitcraft-monitor`
- Modify: `scripts/test/deploy-backup-script.test.mjs`
- Modify: `scripts/test/deploy-backup-integration.test.mjs`
- Create: `deploy/replay-privacy-deletions`
- Create: `scripts/test/deploy-privacy-replay.test.mjs`
- Modify: `deploy/update-bitcraft-monitor`
- Modify: `scripts/test/deploy-update-script.test.mjs`
- Modify: `deploy/bitcraft-claim-monitor-backup.service`

**Runtime files:**

- `/var/backups/bitcraft-claim-monitor/privacy-deletion-ledger.jsonl`
- `/etc/bitcraft-claim-monitor/privacy-ledger.key`
- `/etc/bitcraft-claim-monitor/backup-encryption.key`
- encrypted backups ending in `.sqlite.enc`

- [ ] **Step 1: Write failing ledger tests**

Test:

- HMAC verification rejects tampering;
- records contain only the version, operation/receipt ID, state, subject HMAC, timestamps, key ID, and signature;
- raw Discord/user/character identifiers never appear;
- pending records are ignored during replay;
- committed records delete matching restored users and dependent rows;
- expired records prune after 90 days;
- replay is idempotent;
- a simulated old database backup does not resurrect a committed deletion.

Use a temporary directory and fixed 32-byte test key. Include a `keyId` derived from the verification key so the current key and retained previous keys can verify records during the 90-day rotation window.

- [ ] **Step 2: Run the ledger test and verify RED**

```powershell
node --test apps/bitcraft-local/test/server-privacy-deletion-ledger.test.mjs
```

Expected: FAIL because the ledger module does not exist.

- [ ] **Step 3: Implement the coordinated deletion ledger**

Use newline-delimited signed records:

```js
{
  version: 1,
  operationId: "random UUID",
  state: "pending" | "committed" | "aborted",
  subject: "HMAC(discord ID)",
  occurredAt: "ISO",
  expiresAt: "ISO",
  keyId: "first 16 hex characters of SHA-256(key)",
  signature: "HMAC(canonical preceding fields)"
}
```

Deletion coordination:

1. append and fsync a signed `pending` record;
2. execute/commit the database deletion;
3. append and fsync the matching signed `committed` record;
4. if database deletion fails, append `aborted`;
5. if the committed marker cannot be finalized after the database commit, enter a privacy-integrity error state, keep retrying finalization, alert the owner through existing health diagnostics, and do not report a failed deletion that invites the user to recreate the account;
6. replay only operations with a valid committed marker and no later aborted marker.

Store the live ledger outside the database data directory so selecting an older SQLite recovery point does not also select an older ledger. Set it to service-owner read/write only. Read the HMAC key from `PRIVACY_LEDGER_KEY_FILE`, defaulting to `/etc/bitcraft-claim-monitor/privacy-ledger.key`; never write it into SQLite, a database backup, the ledger, or an export. Support an explicit list of previous key files during rotation and retain an old verification key until every record bearing its `keyId` has expired.

The ledger is a current append-only recovery artifact, not a point-in-time member of each SQLite backup. Provision a restricted recovery copy on storage that is not rolled back with the database volume. A production restore must use the newest ledger, regardless of which database recovery point is selected. Treat the absence of that independent current ledger as a release blocker.

- [ ] **Step 4: Write failing encrypted-backup tests**

Update script/integration tests to require:

- `BACKUP_ENCRYPTION_KEY_FILE`;
- refusal to create a production backup if the key is absent, not a regular file, symlinked, or group/world-readable;
- plaintext `.partial` created with mode 600;
- SQLite `quick_check` before encryption;
- Node AES-256-GCM encryption into `.enc.partial`, using a fresh 96-bit nonce and authentication tag for every file;
- decryption to a protected temporary file and a second `quick_check`;
- atomic publish only as `.sqlite.enc`;
- plaintext partial removal on success and failure;
- retention matching only encrypted completed files;
- the backup command does not snapshot, truncate, replace, or roll back the live deletion ledger;
- no key contents in stdout/stderr.

- [ ] **Step 5: Run deployment tests and verify RED**

```powershell
node --test scripts/test/deploy-backup-crypto.test.mjs scripts/test/deploy-backup-script.test.mjs scripts/test/deploy-backup-integration.test.mjs scripts/test/deploy-privacy-replay.test.mjs scripts/test/deploy-update-script.test.mjs
```

Expected: static tests FAIL; Bash execution tests may skip on Windows.

- [ ] **Step 6: Encrypt and validate backups**

Create `deploy/backup-crypto.mjs` as a small Node CLI with explicit `encrypt` and `decrypt` modes. Use `createCipheriv("aes-256-gcm", key, randomBytes(12))`, a versioned binary header authenticated through `setAAD`, and the final authentication tag. The key file contains one base64url-encoded 32-byte key; reject every other length or format. Write only to a caller-supplied protected partial path and never print the key.

Update `backup-bitcraft-monitor` to:

1. validate a root-readable `0600` key outside the data/backup directories;
2. create the SQLite backup as a protected plaintext partial;
3. quick-check it;
4. encrypt it through the authenticated Node helper with a fresh nonce;
5. decrypt to a protected validation temporary file;
6. quick-check the decrypted copy;
7. atomically publish the `.sqlite.enc`;
8. remove plaintext temporary files in an EXIT trap;
9. retain 7 daily, 3 migration, and 3 manual encrypted backups with a maximum age of 90 days for migration/manual artifacts;
10. keep legacy cleanup as a separately reviewed path until encrypted recovery is verified.

Do not place the recovery key in Git, systemd environment output, the SQLite database, or the backup directory.

- [ ] **Step 7: Replay deletion tombstones before service start**

Create `deploy/replay-privacy-deletions` that takes explicit database and ledger paths, validates both are regular non-symlink files beneath the configured directories, verifies all ledger HMACs, and applies committed unexpired deletions transactionally.

Update `deploy/update-bitcraft-monitor` so candidate/rollback database restoration decrypts to a protected temporary file, validates it, installs it with mode 600, and runs replay before any web/worker service starts. Also install the crypto and replay helpers beside the backup helper.

Add a server-start safety check that replays the current ledger before accepting requests, covering manual restores outside the updater.

- [ ] **Step 8: Run ledger, deployment, and backend tests**

```powershell
node --test apps/bitcraft-local/test/server-privacy-deletion-ledger.test.mjs apps/bitcraft-local/test/server-account-deletion.test.mjs scripts/test/deploy-backup-crypto.test.mjs scripts/test/deploy-backup-script.test.mjs scripts/test/deploy-backup-integration.test.mjs scripts/test/deploy-privacy-replay.test.mjs scripts/test/deploy-update-script.test.mjs
```

Expected: Node/static tests PASS. Record Windows Bash skips; execute the same command on Linux before production.

- [ ] **Step 9: Commit recovery-safe deletion**

```powershell
git add apps/bitcraft-local/src/server/privacyDeletionLedger.mjs apps/bitcraft-local/test/server-privacy-deletion-ledger.test.mjs apps/bitcraft-local/src/server/accountDeletion.mjs apps/bitcraft-local/server.mjs deploy/backup-crypto.mjs scripts/test/deploy-backup-crypto.test.mjs deploy/backup-bitcraft-monitor scripts/test/deploy-backup-script.test.mjs scripts/test/deploy-backup-integration.test.mjs deploy/replay-privacy-deletions scripts/test/deploy-privacy-replay.test.mjs deploy/update-bitcraft-monitor scripts/test/deploy-update-script.test.mjs deploy/bitcraft-claim-monitor-backup.service
git commit -m "feat: make privacy deletion recovery-safe"
```

---

### Task 9: Enforce retention and inactive-account deletion

**Files:**

- Create: `apps/bitcraft-local/src/server/privacyRetention.mjs`
- Create: `apps/bitcraft-local/test/server-privacy-retention.test.mjs`
- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
- Modify: `apps/bitcraft-local/src/server/schemaMigrations.mjs`
- Modify: `apps/bitcraft-local/src/server/preparedStatements.mjs`
- Modify: `apps/bitcraft-local/src/server/scheduledJobs.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server-schema-bootstrap.test.mjs`
- Modify: `apps/bitcraft-local/test/server.test.mjs`

**Job:** daily `privacy-retention`

- [ ] **Step 1: Write failing retention tests**

With a fixed clock, assert exact cutoffs:

```js
assert.equal(RETENTION.userSessionsDays, 30);
assert.equal(RETENTION.adminSessionsDays, 7);
assert.equal(RETENTION.fullIpDays, 7);
assert.equal(RETENTION.analyticsDays, 90);
assert.equal(RETENTION.discordDeliveryDays, 90);
assert.equal(RETENTION.discordDeliveryMaximumRows, 250);
assert.equal(RETENTION.assignmentAuditDays, 365);
assert.equal(RETENTION.inactiveAccountMonths, 24);
assert.equal(RETENTION.inactiveWarningDays, 30);
assert.equal(RETENTION.deletionLedgerDays, 90);
```

Test boundary timestamps, current-vs-expired rows, 250-row delivery cap, dependency order, dry-run counts, and idempotence.

For inactivity:

- warn 30 days before the calendar date that is 24 months after `last_login_at`/`created_at`;
- delete at 24 calendar months even if warning DM fails;
- do not repeatedly warn within the same inactivity window;
- route deletion through the same account-deletion coordinator and ledger;
- preserve the separate sole-owner admin identity.

Require an additive `user_accounts.inactivity_warning_sent_at TEXT` column. A successful Discord login clears it; the retention job sets it after the warning attempt, including an undeliverable attempt, so a closed DM cannot cause daily retries.

- [ ] **Step 2: Run the retention test and verify RED**

```powershell
node --test apps/bitcraft-local/test/server-privacy-retention.test.mjs
```

Expected: FAIL because the retention module and job do not exist.

- [ ] **Step 3: Implement explicit retention policy**

Export a frozen `RETENTION` object matching the approved design and:

```js
privacyRetentionPlan(now)
runPrivacyRetention(db, { now, dryRun, deleteInactiveAccount, sendInactiveWarning })
```

Use explicit per-table statements. Do not infer a timestamp column. Prune:

- user/admin sessions;
- market alerts after 180 days while watches remain user-controlled;
- assignment/admin audit after 12 months, with deletion-time scrubbing still immediate;
- closed moderation after 12 months where no active safety need remains;
- Discord delivery by 90 days and newest 250;
- component/poll/RSVP/temp interaction records 90 days after event;
- analytics 90 days and browser consent identifiers 180 days;
- full IP 7 days and anonymized security 180 days;
- craft audit 14 days;
- empire membership 365 days;
- server health 7 days;
- deletion ledger 90 days.

Where a current table lacks data needed for safe age-based pruning, add the smallest timestamp/status migration and focused test rather than guessing from an unrelated timestamp.

- [ ] **Step 4: Register and expose the daily job**

Add `privacy-retention` to the existing scheduled-job registry. The job records counts, failures, and last success without storing affected raw identifiers. Provide admin diagnostics/dry-run output; do not add a public trigger.

Inactive warning and deletion DMs are best effort. Delivery failure is recorded and never extends retention.

- [ ] **Step 5: Run focused tests**

```powershell
node --test apps/bitcraft-local/test/server-privacy-retention.test.mjs apps/bitcraft-local/test/server-schema-bootstrap.test.mjs apps/bitcraft-local/test/server-prepared-statements.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit retention enforcement**

```powershell
git add apps/bitcraft-local/src/server/privacyRetention.mjs apps/bitcraft-local/test/server-privacy-retention.test.mjs apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/src/server/schemaMigrations.mjs apps/bitcraft-local/src/server/preparedStatements.mjs apps/bitcraft-local/src/server/scheduledJobs.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server-schema-bootstrap.test.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: enforce privacy retention rules"
```

---

### Task 10: Document deployment obligations and complete release verification

**Files:**

- Modify: `README.md`
- Modify: `docs/application-overview.md`
- Modify: `docs/developer-guide.md`
- Create: `docs/privacy-operations-runbook.md`
- Modify: `docs/release-readiness-audit.md`
- Modify: `deploy/bitcraft-claim-monitor.service`
- Modify: `deploy/bitcraft-claim-monitor-worker.service`
- Modify: `scripts/test/deploy-runtime-config.test.mjs`

- [ ] **Step 1: Document operator and self-host configuration**

Document all `LEGAL_*` variables, the default Thomas Bush configuration, and the requirement that other operators override it. Explain that Timbersteel Claim Monitor is not a company or separate legal entity.

Document:

- Terms `/terms` and Privacy `/privacy` URLs;
- Discord Developer Portal privacy-policy and terms URL fields;
- OAuth redirect URI;
- user export/unlink/delete paths;
- legal-version bump procedure;
- analytics consent separation;
- provider/subprocessor list;
- 18+ and worldwide scope;
- optional Buy Me a Coffee link.

- [ ] **Step 2: Create the privacy operations runbook**

Include exact procedures for:

- responding to access, correction, objection, restriction, portability, and erasure requests;
- users unable to sign in;
- verifying a requester without collecting excessive new data;
- exporting and deleting data;
- reviewing deletion/retention job failures;
- rotating the ledger HMAC key without invalidating existing records;
- creating/restoring encrypted backups;
- replaying tombstones after restore;
- testing restore quarterly;
- incident/breach triage and ICO assessment;
- reviewing provider or legal-document changes;
- deleting privacy-correspondence mail from Proton after the published 24-month period unless a legal dispute or obligation requires longer retention.

Use `privacy@timbersteeltrade.com` as the contact and do not publish a postal address.

- [ ] **Step 3: Add explicit production release gates**

Update release readiness with unchecked owner actions:

1. complete the ICO data-protection fee self-assessment;
2. obtain solicitor review of Terms, Privacy, both LIAs, England/Wales law wording, international transfers, 18+ approach, and missing public address;
3. confirm and document HostWorld volume and provider-snapshot encryption at rest;
4. provision `/etc/bitcraft-claim-monitor/backup-encryption.key` with root ownership and mode 600, and `/etc/bitcraft-claim-monitor/privacy-ledger.key` with root ownership, `bitcraft` group, and mode 640;
5. run encrypted backup restore plus deletion-ledger replay on Linux;
6. update Discord Developer Portal Terms/Privacy URLs;
7. verify Namecheap, Proton, GitHub, Buy Me a Coffee, Discord, BitJita, and HostWorld disclosures against the production arrangement.
8. inventory every legacy plaintext backup and either re-encrypt a still-required recovery point or remove it through the guarded cleanup flow after encrypted restore verification;
9. provision an independently preserved current deletion ledger that will not roll back with a selected database or provider snapshot.

If HostWorld volume/snapshot encryption cannot be confirmed, production is blocked until host/filesystem or application-layer database encryption is deployed.

- [ ] **Step 4: Verify service hardening**

Ensure systemd units:

- do not expose legal/ledger/backup keys through command lines;
- use restrictive `UMask=0077`;
- grant the web process only the ledger/data access it needs;
- keep the backup recovery key root-only;
- fail startup if deletion-ledger verification fails.

Update static deployment tests for these requirements.

- [ ] **Step 5: Run the complete local verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
node --test scripts/test/*.test.mjs
git diff --check
git status --short
```

Expected:

- build PASS;
- full app suite PASS;
- deployment/static tests PASS;
- Windows may skip Bash execution cases only;
- no whitespace errors;
- only planned files changed.

- [ ] **Step 6: Browser-check the complete user journey**

Use the stable smoke server:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Verify at desktop and narrow widths:

1. `/terms` and `/privacy` are readable and cross-linked;
2. new Discord login requires both confirmations before OAuth preparation;
3. stale existing account sees the next-visit acceptance block;
4. Privacy & Data actions have clear scope and confirmation;
5. export downloads valid JSON;
6. account deletion requires recent reauth and typed `DELETE`;
7. dialogs stay within the viewport and underlying pages do not need scrolling;
8. no blank screen, hook-order error, or console error.

Use only local/mock Discord paths. Do not send a real DM or delete a real account during smoke verification.

- [ ] **Step 7: Perform implementation self-review**

Compare the finished code and tests against every heading in:

```text
docs/superpowers/specs/2026-07-25-legal-privacy-controls-design.md
```

Specifically confirm:

- every approved retention row is either enforced or explicitly release-blocked;
- stale acceptance cannot use signed-in features;
- export/deletion remain available to stale users;
- assignment DM happens before commit and blocks on failure;
- unassignment/deletion do not roll back on DM failure;
- deletion covers every table that stores user-linked data;
- logs/exports contain no tokens, secrets, raw HMAC keys, or unrelated users;
- restore replay prevents resurrection;
- controller wording never presents Timbersteel Claim Monitor as a company.

- [ ] **Step 8: Commit documentation and hardening**

```powershell
git add README.md docs/application-overview.md docs/developer-guide.md docs/privacy-operations-runbook.md docs/release-readiness-audit.md deploy/bitcraft-claim-monitor.service deploy/bitcraft-claim-monitor-worker.service scripts/test/deploy-runtime-config.test.mjs
git commit -m "docs: add privacy operations and release gates"
```

- [ ] **Step 9: Stop before release metadata or deployment**

Report:

- verification results and any Windows-only skipped Bash tests;
- whether HostWorld encryption confirmation, ICO assessment, solicitor review, Discord Portal updates, or Linux restore testing remain open;
- exact VPS commands needed for key provisioning and restore verification.

Do not update `CHANGELOG.md`, bump `apps/bitcraft-local/package.json`, push, merge, or deploy until the user explicitly requests the next release action.
