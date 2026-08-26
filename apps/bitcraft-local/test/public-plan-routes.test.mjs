import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { PUBLIC_USER_SESSION_COOKIE_NAME } from "../src/server/public/auth.mjs";
import { createPublicIdentityRepository } from "../src/server/public/identity.mjs";
import { createPublicPlanRepository } from "../src/server/public/publicPlans.mjs";
import { csrfTokenFromSession } from "../src/server/httpCsrf.mjs";
import { sessionTokenHash } from "../src/server/serverSessions.mjs";

let planRouterModule = null;
try {
  planRouterModule = await import("../src/server/public/planRouter.mjs");
} catch {
  // RED: Task 6 owns the public plan HTTP boundary.
}

const legalSnapshot = { version: "2026-08-25", termsDigest: "terms", privacyDigest: "privacy" };

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

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applySchemaBootstrap(db);
  const userId = Number(db.prepare(`
    INSERT INTO public_user_accounts (discord_id, discord_username, settings_json, created_at)
    VALUES ('route-owner', 'Route Owner', '{}', '2026-08-25T00:00:00.000Z') RETURNING id
  `).get().id);
  const token = "route-session-token";
  db.prepare(`INSERT INTO public_user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .run(sessionTokenHash(token), userId, "2026-09-25T00:00:00.000Z", "2026-08-25T00:00:00.000Z");
  let randomValue = 1;
  const repository = createPublicPlanRepository(db, {
    now: () => new Date("2026-08-25T10:00:00.000Z"),
    randomBytes: (size) => Buffer.alloc(size, randomValue++),
    tokenHmacKey: "route-hmac-key",
  });
  const identityRepository = createPublicIdentityRepository(db);
  const router = planRouterModule?.createPublicPlanRouter({
    repository,
    identityRepository,
    legalSnapshot,
    computation: { compute: async (plan) => ({ available: true, role: plan.role }) },
    now: () => new Date("2026-08-25T10:00:00.000Z"),
    readRequestJson: async (req) => req.body ?? {},
  });
  const cookie = `${PUBLIC_USER_SESSION_COOKIE_NAME}=${token}`;
  return { db, userId, token, cookie, repository, router };
}

function request(fixtureValue, { body = null, origin = "https://claim-monitor.com", csrf = true, ifMatch, authorization } = {}) {
  return {
    headers: {
      cookie: fixtureValue.cookie,
      ...(origin == null ? {} : { origin }),
      ...(csrf ? { "x-csrf-token": csrfTokenFromSession(fixtureValue.token) } : {}),
      ...(ifMatch == null ? {} : { "if-match": ifMatch }),
      ...(authorization == null ? {} : { authorization }),
    },
    body,
  };
}

async function call(router, method, path, req) {
  const res = recorder();
  const handled = await router({ req, method, url: new URL(`https://claim-monitor.com${path}`), res });
  assert.equal(handled, true, `${method} ${path} must remain inside the public plan router`);
  return res;
}

function emptyDocument() {
  return { schemaVersion: 1, targets: [], routeOverrides: {}, multipliers: {}, sectionOverrides: {}, rowNameOverrides: {} };
}

function addAcceptedRouteUser(f, name) {
  const userId = Number(f.db.prepare(`
    INSERT INTO public_user_accounts (discord_id, discord_username, settings_json, created_at)
    VALUES (?, ?, '{}', '2026-08-25T00:00:00.000Z') RETURNING id
  `).get(name, name).id);
  const token = `${name}-session-token`;
  f.db.prepare(`INSERT INTO public_user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .run(sessionTokenHash(token), userId, "2026-09-25T00:00:00.000Z", "2026-08-25T00:00:00.000Z");
  f.db.prepare(`
    INSERT INTO public_user_legal_acceptances (
      user_id, legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source
    ) VALUES (?, ?, ?, ?, 1, ?, 'oauth')
  `).run(userId, legalSnapshot.version, legalSnapshot.termsDigest, legalSnapshot.privacyDigest, "2026-08-25T09:00:00.000Z");
  return { ...f, userId, token, cookie: `${PUBLIC_USER_SESSION_COOKIE_NAME}=${token}` };
}

test("public plan creation requires session, current legal, exact origin, CSRF, and If-Match", async () => {
  assert.ok(planRouterModule, "public plan router module must exist");
  const f = fixture();
  const body = { claimId: "42", title: "HTTP plan", document: emptyDocument() };

  const anonymous = await call(f.router, "POST", "/api/public/plans", { headers: {}, body });
  assert.equal(anonymous.status, 401);
  const staleLegal = await call(f.router, "POST", "/api/public/plans", request(f, { body, ifMatch: "*" }));
  assert.equal(staleLegal.status, 428);
  assert.equal(json(staleLegal).code, "legal_acceptance_required");

  f.db.prepare(`
    INSERT INTO public_user_legal_acceptances (
      user_id, legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source
    ) VALUES (?, ?, ?, ?, 1, ?, 'oauth')
  `).run(f.userId, legalSnapshot.version, legalSnapshot.termsDigest, legalSnapshot.privacyDigest, "2026-08-25T09:00:00.000Z");
  assert.equal((await call(f.router, "POST", "/api/public/plans", request(f, { body, origin: "https://other.example", ifMatch: "*" }))).status, 403);
  assert.equal((await call(f.router, "POST", "/api/public/plans", request(f, { body, csrf: false, ifMatch: "*" }))).status, 403);
  assert.equal((await call(f.router, "POST", "/api/public/plans", request(f, { body }))).status, 428);

  const created = await call(f.router, "POST", "/api/public/plans", request(f, { body, ifMatch: "*" }));
  assert.equal(created.status, 201);
  assert.equal(json(created).plan.role, "owner");
  assert.deepEqual(json(created).plan.revisions, { document: 1, access: 1 });
  const listed = await call(f.router, "GET", "/api/public/plans", request(f, { origin: null, csrf: false }));
  assert.equal(listed.status, 200);
  assert.equal(json(listed).plans.length, 1);
  f.db.close();
});

test("invite acceptance discovers its token-authorized access revision without mutating, then accepts one tagged revision", async () => {
  const f = fixture();
  const invited = addAcceptedRouteUser(f, "Revision Probe Invitee");
  const plan = f.repository.createPlan({
    ownerUserId: f.userId,
    claimId: "42",
    title: "Revision probe plan",
    document: emptyDocument(),
  });
  const invite = f.repository.createInvite({
    planId: plan.id,
    actorUserId: f.userId,
    role: "viewer",
    expectedAccessRevision: 1,
  });
  const path = `/api/public/invites/${invite.id}/accept`;

  const unknown = await call(f.router, "POST", path, request(invited, {
    authorization: "Bearer not-the-invitation-token",
  }));
  assert.equal(unknown.status, 404, "an invalid bearer must not reveal a plan revision");
  assert.equal("currentRevisions" in json(unknown), false);

  const probe = await call(f.router, "POST", path, request(invited, {
    authorization: `Bearer ${invite.token}`,
  }));
  assert.equal(probe.status, 428);
  assert.deepEqual(json(probe).currentRevisions, { access: 2 });
  assert.doesNotMatch(probe.body, new RegExp(invite.token));
  assert.equal(f.db.prepare("SELECT accepted_at FROM public_craft_plan_invites WHERE id = ?").get(invite.id).accepted_at, null);
  assert.equal(f.db.prepare("SELECT access_revision FROM public_craft_plans WHERE id = ?").get(plan.id).access_revision, 2);

  const accepted = await call(f.router, "POST", path, request(invited, {
    ifMatch: '"access:2"',
    authorization: `Bearer ${invite.token}`,
  }));
  assert.equal(accepted.status, 200);
  assert.equal(json(accepted).plan.role, "viewer");
  assert.equal(f.db.prepare("SELECT access_revision FROM public_craft_plans WHERE id = ?").get(plan.id).access_revision, 3);
  f.db.close();
});

test("public plan router implements the complete collaboration API with conditional revisions", async () => {
  const f = fixture();
  f.db.prepare(`
    INSERT INTO public_user_legal_acceptances (
      user_id, legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source
    ) VALUES (?, ?, ?, ?, 1, ?, 'oauth')
  `).run(f.userId, legalSnapshot.version, legalSnapshot.termsDigest, legalSnapshot.privacyDigest, "2026-08-25T09:00:00.000Z");
  const editor = addAcceptedRouteUser(f, "Route Editor");
  const created = await call(f.router, "POST", "/api/public/plans", request(f, {
    ifMatch: "*",
    body: { claimId: "42", title: "Workflow plan", document: emptyDocument() },
  }));
  const planId = json(created).plan.id;

  assert.equal((await call(f.router, "GET", `/api/public/plans/${planId}`, request(f, { origin: null, csrf: false }))).status, 200);
  assert.equal(json(await call(f.router, "GET", `/api/public/plans/${planId}/computation`, request(f, { origin: null, csrf: false }))).computation.role, "owner");

  const document = { ...emptyDocument(), targets: [{ catalogKey: "cargo:7", quantity: "3" }] };
  const updated = await call(f.router, "PUT", `/api/public/plans/${planId}/document`, request(f, { ifMatch: '"1"', body: { document } }));
  assert.equal(updated.status, 200);
  assert.deepEqual(json(updated).plan.revisions, { document: 2, access: 1 });
  const conflict = await call(f.router, "PUT", `/api/public/plans/${planId}/document`, request(f, { ifMatch: '"1"', body: { document: emptyDocument() } }));
  assert.equal(conflict.status, 409);
  assert.deepEqual(json(conflict).currentRevisions, { document: 2, access: 1 });

  const clone = await call(f.router, "POST", `/api/public/plans/${planId}/clone`, request(f, { ifMatch: '"1"', body: { title: "Workflow clone" } }));
  assert.equal(clone.status, 201);
  assert.equal(json(clone).plan.document.targets[0].catalogKey, "cargo:7");

  const invite = await call(f.router, "POST", `/api/public/plans/${planId}/invites`, request(f, { ifMatch: '"1"', body: { role: "editor" } }));
  assert.equal(invite.status, 201);
  const inviteBody = json(invite);
  assert.ok(inviteBody.invite.token);
  const accepted = await call(f.router, "POST", `/api/public/invites/${inviteBody.invite.id}/accept`, request(editor, {
    ifMatch: '"2"',
    authorization: `Bearer ${inviteBody.invite.token}`,
  }));
  assert.equal(accepted.status, 200);
  assert.equal(json(accepted).plan.role, "editor");

  assert.equal((await call(f.router, "PATCH", `/api/public/plans/${planId}/members/${editor.userId}`, request(f, { ifMatch: '"3"', body: { role: "viewer" } }))).status, 200);
  assert.equal((await call(f.router, "PATCH", `/api/public/plans/${planId}/members/${editor.userId}`, request(f, { ifMatch: '"4"', body: { role: "editor" } }))).status, 200);
  const disposableInvite = json(await call(f.router, "POST", `/api/public/plans/${planId}/invites`, request(f, { ifMatch: '"5"', body: { role: "viewer" } }))).invite;
  assert.equal((await call(f.router, "DELETE", `/api/public/plans/${planId}/invites/${disposableInvite.id}`, request(f, { ifMatch: '"6"' }))).status, 200);

  const share = json(await call(f.router, "POST", `/api/public/plans/${planId}/share-links`, request(f, { ifMatch: '"7"', body: { label: "Public board" } }))).shareLink;
  const bearerRequest = { headers: { authorization: `Bearer ${share.token}` } };
  const shared = await call(f.router, "GET", `/api/public/shared-plans/${planId}`, bearerRequest);
  assert.equal(shared.status, 200);
  assert.equal(json(shared).plan.role, "bearer");
  assert.equal(json(await call(f.router, "GET", `/api/public/shared-plans/${planId}/computation`, bearerRequest)).computation.role, "bearer");
  const disposableShare = json(await call(f.router, "POST", `/api/public/plans/${planId}/share-links`, request(f, { ifMatch: '"8"', body: { label: "Disposable" } }))).shareLink;
  assert.equal((await call(f.router, "DELETE", `/api/public/plans/${planId}/share-links/${disposableShare.id}`, request(f, { ifMatch: '"9"' }))).status, 200);

  const events = await call(f.router, "GET", `/api/public/plans/${planId}/events`, request(f, { origin: null, csrf: false }));
  assert.equal(events.status, 200);
  assert.ok(json(events).events.length >= 8);
  assert.equal((await call(f.router, "PATCH", `/api/public/plans/${planId}/status`, request(f, { ifMatch: '"10"', body: { status: "archived" } }))).status, 200);
  assert.equal((await call(f.router, "PATCH", `/api/public/plans/${planId}/status`, request(f, { ifMatch: '"11"', body: { status: "active" } }))).status, 200);
  assert.equal((await call(f.router, "POST", `/api/public/plans/${planId}/transfer`, request(f, { ifMatch: '"12"', body: { userId: editor.userId } }))).status, 200);

  const ownerSuspension = await call(f.router, "PATCH", `/api/public/plans/${planId}/status`, request(editor, { ifMatch: '"13"', body: { status: "suspended" } }));
  assert.equal(ownerSuspension.status, 403);
  assert.equal(json(ownerSuspension).code, "moderation_required");
  assert.equal((await call(f.router, "DELETE", `/api/public/plans/${planId}/members/${f.userId}`, request(editor, { ifMatch: '"13"' }))).status, 200);
  assert.equal((await call(f.router, "DELETE", `/api/public/plans/${planId}`, request(editor, { ifMatch: '"14"' }))).status, 200);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM public_craft_plans WHERE id = ?").get(planId).count, 0);
  f.db.close();
});
