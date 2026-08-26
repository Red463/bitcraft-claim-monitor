import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { claimMonitorLegalPolicyForEnvironment } from "../src/legal/legalPolicy.mjs";
import { currentLegalSnapshot } from "../src/server/legalAcceptance.mjs";
import { legalPolicyDigests } from "../src/server/legalPolicyDigest.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { createPublicAuthRouter } from "../src/server/public/authRouter.mjs";
import { createPublicIdentityRepository } from "../src/server/public/identity.mjs";
import { deletePublicAccount, publicAccountDeletionReview } from "../src/server/public/accountDeletion.mjs";
import { sessionTokenHash } from "../src/server/serverSessions.mjs";

function recorder() {
  return {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(body = "") { this.body = String(body ?? ""); },
  };
}

function json(res) { return res.body ? JSON.parse(res.body) : null; }
function cookieValues(res) { return Array.isArray(res.headers["set-cookie"]) ? res.headers["set-cookie"] : res.headers["set-cookie"] ? [res.headers["set-cookie"]] : []; }
function cookiePair(res, name) { return cookieValues(res).find((value) => value.startsWith(`${name}=`))?.split(";", 1)[0] ?? ""; }
function request({ cookie = "", origin = "https://claim-monitor.com", csrf = "", body = null } = {}) {
  return { headers: { cookie, host: "claim-monitor.com", ...(origin === null ? {} : { origin }), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body };
}

function fixture({ fetchImpl, deletion } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applySchemaBootstrap(db);
  const repository = createPublicIdentityRepository(db);
  const policy = claimMonitorLegalPolicyForEnvironment({});
  const snapshot = currentLegalSnapshot(policy, legalPolicyDigests(policy));
  let randomIndex = 1;
  const router = createPublicAuthRouter({
    repository,
    legalPolicy: policy,
    legalSnapshot: snapshot,
    stateSecret: "public-state-secret",
    config: {
      clientId: "public-client",
      clientSecret: "public-secret",
      redirectUri: "https://claim-monitor.com/api/public/auth/discord/callback",
      origin: "https://claim-monitor.com",
      enabled: true,
    },
    fetchImpl,
    now: () => new Date("2026-08-25T10:00:00.000Z"),
    randomBytes: (size) => Buffer.alloc(size, randomIndex++),
    readRequestJson: async (req) => req.body ?? {},
    deletion,
  });
  return { db, repository, router, policy, snapshot };
}

async function call(router, method, path, req = request()) {
  const res = recorder();
  const handled = await router({ req, method, url: new URL(`https://claim-monitor.com${path}`), res });
  assert.equal(handled, true, `${method} ${path} must remain inside the public auth router`);
  return { handled, res };
}

async function oauthLogin(f, discordId = "111222333444555666") {
  const start = await call(f.router, "POST", "/api/public/auth/discord/start", request({
    body: { acceptedTerms: true, ageConfirmed: true, returnTo: "/settings" },
  }));
  assert.equal(start.res.status, 200);
  const stateCookie = cookiePair(start.res, "__Host-cm_oauth_state");
  const state = new URL(json(start.res).authorizeUrl).searchParams.get("state");
  const callback = await call(
    f.router,
    "GET",
    `/api/public/auth/discord/callback?code=public-code&state=${encodeURIComponent(state)}`,
    request({ cookie: stateCookie, origin: "" }),
  );
  assert.equal(callback.res.status, 302);
  assert.equal(callback.res.headers.location, "/settings");
  return { start, callback, sessionCookie: cookiePair(callback.res, "__Host-cm_user_session"), discordId };
}

function discordFetch(profileId = "111222333444555666") {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([String(url), init]);
    if (String(url).endsWith("/oauth2/token")) return { ok: true, status: 200, json: async () => ({ access_token: "public-access-token", token_type: "Bearer", expires_in: 604800, scope: "identify" }) };
    return { ok: true, status: 200, json: async () => ({ id: profileId, username: "PublicUser", global_name: "Public User", avatar: "avatar" }) };
  };
  return { calls, fetchImpl };
}

test("public OAuth persists only a public account/session and never promotes a matching Timbersteel administrator", async () => {
  const discord = discordFetch();
  const f = fixture({ fetchImpl: discord.fetchImpl });
  f.db.exec("ALTER TABLE admin_users ADD COLUMN discord_id TEXT");
  f.db.prepare("INSERT INTO admin_users (username, password_hash, role, created_at, discord_id) VALUES (?, ?, ?, ?, ?)")
    .run("owner", "hash", "owner", "2026-08-01T00:00:00.000Z", "111222333444555666");
  f.db.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, character_player_id, character_name, character_status, settings_json, created_at)
    VALUES (?, 'TimbersteelUser', '42', 'Character', 'approved', '{}', ?)
  `).run("111222333444555666", "2026-08-01T00:00:00.000Z");

  const login = await oauthLogin(f);
  assert.match(login.sessionCookie, /^__Host-cm_user_session=/);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_accounts").get().count, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_sessions").get().count, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_legal_acceptances").get().count, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM admin_sessions").get().count, 0);
  assert.deepEqual({ ...f.db.prepare("SELECT discord_username, character_player_id, character_status FROM user_accounts WHERE discord_id = ?").get("111222333444555666") }, {
    discord_username: "TimbersteelUser",
    character_player_id: "42",
    character_status: "approved",
  });
  assert.equal(cookieValues(login.callback.res).some((value) => /bitcraft_admin_session|bitcraft_user_session/.test(value)), false);

  const tokenRequest = discord.calls[0];
  assert.equal(tokenRequest[0], "https://discord.com/api/v10/oauth2/token");
  const tokenBody = tokenRequest[1].body;
  assert.equal(tokenBody.get("client_id"), "public-client");
  assert.equal(tokenBody.get("client_secret"), "public-secret");
  assert.equal(tokenBody.get("redirect_uri"), "https://claim-monitor.com/api/public/auth/discord/callback");
  assert.equal(discord.calls[1][1].headers.authorization, "Bearer public-access-token");
  f.db.close();
});

test("public session, legal acceptance, export, CSRF logout, and disabled integrations stay isolated", async () => {
  const f = fixture({ fetchImpl: discordFetch().fetchImpl });
  const login = await oauthLogin(f, "111222333444555666");
  const me = await call(f.router, "GET", "/api/public/auth/session", request({ cookie: login.sessionCookie, origin: "" }));
  assert.equal(me.res.status, 200);
  assert.equal(json(me.res).user.discordId, "111222333444555666");
  assert.equal(json(me.res).featurebaseJwt, null);
  assert.equal(json(me.res).analyticsEnabled, false);
  assert.equal(json(me.res).legal.requiresAcceptance, false);
  const csrfToken = json(me.res).csrfToken;

  const exported = await call(f.router, "GET", "/api/public/auth/privacy/export", request({ cookie: login.sessionCookie, origin: "" }));
  assert.equal(exported.res.status, 200);
  assert.match(exported.res.headers["content-disposition"], /^attachment; filename="bitcraft-claim-monitor-data-2026-08-25\.json"$/);
  assert.doesNotMatch(exported.res.body, /character|role|admin|Featurebase/i);

  const rejectedLogout = await call(f.router, "POST", "/api/public/auth/logout", request({ cookie: login.sessionCookie }));
  assert.equal(rejectedLogout.res.status, 403);
  const loggedOut = await call(f.router, "POST", "/api/public/auth/logout", request({ cookie: login.sessionCookie, csrf: csrfToken }));
  assert.equal(loggedOut.res.status, 200);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_sessions").get().count, 0);
  assert.match(cookiePair(loggedOut.res, "__Host-cm_user_session"), /^__Host-cm_user_session=$/);
  f.db.close();
});

test("public mutations require the exact configured HTTPS Origin even with a valid session and CSRF token", async () => {
  const f = fixture({ fetchImpl: discordFetch().fetchImpl });
  const login = await oauthLogin(f);
  const me = await call(f.router, "GET", "/api/public/auth/session", request({ cookie: login.sessionCookie, origin: null }));
  const csrfToken = json(me.res).csrfToken;

  for (const origin of [
    null,
    "http://claim-monitor.com",
    "https://claim-monitor.com:444",
    "https://user@claim-monitor.com",
    "https://other.example",
  ]) {
    const rejected = await call(f.router, "POST", "/api/public/auth/logout", request({
      cookie: login.sessionCookie,
      csrf: csrfToken,
      origin,
    }));
    assert.equal(rejected.res.status, 403, `Origin ${String(origin)} must be rejected`);
    assert.equal(json(rejected.res).error, "Cross-origin public account request rejected");
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_sessions").get().count, 1);
  }

  const accepted = await call(f.router, "POST", "/api/public/auth/logout", request({
    cookie: login.sessionCookie,
    csrf: csrfToken,
    origin: "https://claim-monitor.com",
  }));
  assert.equal(accepted.res.status, 200);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_sessions").get().count, 0);
  f.db.close();
});

test("public OAuth start applies the same mandatory exact-Origin boundary", async () => {
  const f = fixture({ fetchImpl: discordFetch().fetchImpl });
  const body = { acceptedTerms: true, ageConfirmed: true, returnTo: "/settings" };

  const rejected = await call(f.router, "POST", "/api/public/auth/discord/start", request({ origin: null, body }));
  assert.equal(rejected.res.status, 403);
  assert.equal(json(rejected.res).error, "Cross-origin Discord sign-in rejected");

  const accepted = await call(f.router, "POST", "/api/public/auth/discord/start", request({
    origin: "https://claim-monitor.com",
    body,
  }));
  assert.equal(accepted.res.status, 200);
  assert.equal(new URL(json(accepted.res).authorizeUrl).origin, "https://discord.com");
  f.db.close();
});

test("existing public sessions accept only the current Claim Monitor legal snapshot with CSRF", async () => {
  const f = fixture();
  const account = f.repository.upsertAccount({ discordId: "77", username: "Existing" }, "2026-08-25T09:00:00.000Z");
  const token = "existing-public-token";
  f.repository.insertSession({ tokenHash: sessionTokenHash(token), userId: account.id, expiresAt: "2026-09-24T09:00:00.000Z", createdAt: "2026-08-25T09:00:00.000Z" });
  const cookie = `__Host-cm_user_session=${token}`;
  const me = await call(f.router, "GET", "/api/public/auth/session", request({ cookie, origin: "" }));
  assert.equal(json(me.res).legal.requiresAcceptance, true);
  const csrfToken = json(me.res).csrfToken;

  const rejected = await call(f.router, "POST", "/api/public/auth/legal/accept", request({ cookie, body: { acceptedTerms: true, ageConfirmed: true } }));
  assert.equal(rejected.res.status, 403);
  const accepted = await call(f.router, "POST", "/api/public/auth/legal/accept", request({ cookie, csrf: csrfToken, body: { acceptedTerms: true, ageConfirmed: true } }));
  assert.equal(accepted.res.status, 200);
  assert.equal(json(accepted.res).legal.requiresAcceptance, false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_legal_acceptances").get().count, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM user_legal_acceptances").get().count, 0);
  f.db.close();
});

test("public deletion preflight requires same-account recent reauthentication and never deletes", async () => {
  const discord = discordFetch("222333444555666777");
  const f = fixture({ fetchImpl: discord.fetchImpl });
  const login = await oauthLogin(f, "222333444555666777");
  const me = await call(f.router, "GET", "/api/public/auth/session", request({ cookie: login.sessionCookie, origin: "" }));
  const csrfToken = json(me.res).csrfToken;

  const tooSoon = await call(f.router, "POST", "/api/public/auth/privacy/deletion-preflight", request({ cookie: login.sessionCookie, csrf: csrfToken }));
  assert.equal(tooSoon.res.status, 403);
  assert.equal(json(tooSoon.res).code, "recent_discord_reauthentication_required");

  const reauthStart = await call(f.router, "POST", "/api/public/auth/privacy/reauth/start", request({ cookie: login.sessionCookie, csrf: csrfToken }));
  assert.equal(reauthStart.res.status, 200);
  const reauthStateCookie = cookiePair(reauthStart.res, "__Host-cm_oauth_state");
  const reauthState = new URL(json(reauthStart.res).authorizeUrl).searchParams.get("state");
  const reauth = await call(f.router, "GET", `/api/public/auth/discord/callback?code=reauth-code&state=${encodeURIComponent(reauthState)}`, request({
    cookie: `${login.sessionCookie}; ${reauthStateCookie}`,
    origin: "",
  }));
  assert.equal(reauth.res.status, 302);
  assert.equal(reauth.res.headers.location, "/settings?privacy=delete-ready");
  const proofCookie = cookiePair(reauth.res, "__Host-cm_privacy_reauth");

  const preflight = await call(f.router, "POST", "/api/public/auth/privacy/deletion-preflight", request({
    cookie: `${login.sessionCookie}; ${proofCookie}`,
    csrf: csrfToken,
  }));
  assert.equal(preflight.res.status, 200);
  assert.deepEqual(json(preflight.res), {
    ok: true,
    recentlyReauthenticated: true,
    canDelete: false,
    planDispositionReviewRequired: true,
  });
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_accounts").get().count, 1);
  assert.equal(await f.router({ req: request({ cookie: login.sessionCookie, csrf: csrfToken }), method: "DELETE", url: new URL("https://claim-monitor.com/api/public/auth/privacy/account"), res: recorder() }), false);
  f.db.close();
});

test("public deletion preflight lists owned dispositions and deletion clears the public session only", async () => {
  let dbRef;
  const deletion = {
    review: (userId) => publicAccountDeletionReview(dbRef, userId),
    deleteAccount: ({ userId, discordId, dispositions }) => deletePublicAccount(dbRef, {
      userId,
      discordId,
      dispositions,
      deletionKey: "public-deletion-key",
      now: () => new Date("2026-08-25T10:00:00.000Z"),
      randomUUID: () => "public-delete-receipt",
    }),
  };
  const discord = discordFetch("444555666777888999");
  const f = fixture({ fetchImpl: discord.fetchImpl, deletion });
  dbRef = f.db;
  const login = await oauthLogin(f, "444555666777888999");
  const owner = f.db.prepare("SELECT * FROM public_user_accounts WHERE discord_id = '444555666777888999'").get();
  const editor = f.repository.upsertAccount({ discordId: "555666777888999000", username: "Editor" }, "2026-08-25T09:00:00.000Z");
  f.db.prepare(`
    INSERT INTO public_craft_plans (id, owner_user_id, claim_id, title, document_json, status, document_revision, access_revision, created_at, updated_at)
    VALUES ('plan-delete-flow', ?, '42', 'Delete flow', '{"schemaVersion":1,"targets":[],"routeOverrides":{},"multipliers":{},"sectionOverrides":{},"rowNameOverrides":{}}', 'active', 1, 1, '2026-08-25T09:00:00.000Z', '2026-08-25T09:00:00.000Z')
  `).run(owner.id);
  f.db.prepare("INSERT INTO public_craft_plan_members (plan_id, user_id, role, created_at, updated_at) VALUES ('plan-delete-flow', ?, 'editor', '2026-08-25T09:00:00.000Z', '2026-08-25T09:00:00.000Z')").run(editor.id);
  f.db.prepare("INSERT INTO user_accounts (discord_id, discord_username, character_status, settings_json, created_at) VALUES ('444555666777888999', 'Timbersteel', 'unlinked', '{}', '2026-01-01T00:00:00.000Z')").run();
  const me = await call(f.router, "GET", "/api/public/auth/session", request({ cookie: login.sessionCookie, origin: "" }));
  const csrfToken = json(me.res).csrfToken;
  const start = await call(f.router, "POST", "/api/public/auth/privacy/reauth/start", request({ cookie: login.sessionCookie, csrf: csrfToken }));
  const stateCookie = cookiePair(start.res, "__Host-cm_oauth_state");
  const state = new URL(json(start.res).authorizeUrl).searchParams.get("state");
  const callback = await call(f.router, "GET", `/api/public/auth/discord/callback?code=reauth-code&state=${encodeURIComponent(state)}`, request({ cookie: `${login.sessionCookie}; ${stateCookie}`, origin: "" }));
  const proofCookie = cookiePair(callback.res, "__Host-cm_privacy_reauth");
  const deletionCookie = `${login.sessionCookie}; ${proofCookie}`;

  const preflight = await call(f.router, "POST", "/api/public/auth/privacy/deletion-preflight", request({ cookie: deletionCookie, csrf: csrfToken }));
  assert.equal(preflight.res.status, 200);
  assert.equal(json(preflight.res).ownedPlans[0].id, "plan-delete-flow");
  assert.equal(json(preflight.res).ownedPlans[0].acceptedEditors[0].userId, editor.id);
  assert.equal(json(preflight.res).canDelete, false);

  const removed = await call(f.router, "POST", "/api/public/auth/privacy/delete", request({
    cookie: deletionCookie,
    csrf: csrfToken,
    body: { dispositions: [{ planId: "plan-delete-flow", action: "transfer", userId: editor.id }] },
  }));
  assert.equal(removed.res.status, 200);
  assert.equal(json(removed.res).receiptId, "public-delete-receipt");
  assert.match(cookiePair(removed.res, "__Host-cm_user_session"), /^__Host-cm_user_session=$/);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_user_accounts WHERE id = ?").get(owner.id).count, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM user_accounts WHERE discord_id = '444555666777888999'").get().count, 1);
  f.db.close();
});

test("public reauthentication rejects a different Discord profile without modifying the session", async () => {
  const discord = discordFetch("333444555666777888");
  const f = fixture({ fetchImpl: discord.fetchImpl });
  const login = await oauthLogin(f, "333444555666777888");
  const me = await call(f.router, "GET", "/api/public/auth/session", request({ cookie: login.sessionCookie, origin: "" }));
  const csrfToken = json(me.res).csrfToken;
  const start = await call(f.router, "POST", "/api/public/auth/privacy/reauth/start", request({ cookie: login.sessionCookie, csrf: csrfToken }));

  discord.fetchImpl = discordFetch("999999999999999999").fetchImpl;
  const stateCookie = cookiePair(start.res, "__Host-cm_oauth_state");
  const state = new URL(json(start.res).authorizeUrl).searchParams.get("state");
  const mismatchFixture = { ...f };
  const mismatchRouter = createPublicAuthRouter({
    repository: f.repository,
    legalPolicy: f.policy,
    legalSnapshot: f.snapshot,
    stateSecret: "public-state-secret",
    config: { clientId: "public-client", clientSecret: "public-secret", redirectUri: "https://claim-monitor.com/api/public/auth/discord/callback", origin: "https://claim-monitor.com", enabled: true },
    fetchImpl: discordFetch("999999999999999999").fetchImpl,
    now: () => new Date("2026-08-25T10:00:00.000Z"),
    randomBytes: (size) => Buffer.alloc(size, 9),
    readRequestJson: async (req) => req.body ?? {},
  });
  const mismatch = await call(mismatchRouter, "GET", `/api/public/auth/discord/callback?code=reauth-code&state=${encodeURIComponent(state)}`, request({ cookie: `${login.sessionCookie}; ${stateCookie}`, origin: "" }));
  assert.equal(mismatch.res.status, 403);
  assert.equal(json(mismatch.res).code, "privacy_reauthentication_account_mismatch");
  const userId = f.db.prepare("SELECT id FROM public_user_accounts WHERE discord_id = ?").get("333444555666777888").id;
  assert.equal(f.db.prepare("SELECT reauthenticated_at FROM public_user_sessions WHERE user_id = ?").get(userId).reauthenticated_at, null);
  void mismatchFixture;
  f.db.close();
});
