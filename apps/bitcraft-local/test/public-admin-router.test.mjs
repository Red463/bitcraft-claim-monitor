import assert from "node:assert/strict";
import test from "node:test";

import { adminHasPermission } from "../src/server/adminPermissions.mjs";

let routerModule = null;
try {
  routerModule = await import("../src/server/public/adminRouter.mjs");
} catch {
  // RED: Task 7 introduces the Timbersteel Admin public-service router.
}

function recorder() {
  return { status: 0, body: "", headers: {}, writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = "") { this.body = String(body); } };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function fixture() {
  let recentlyReauthenticated = false;
  const calls = [];
  const audits = [];
  const repository = {
    health: (runtime) => ({ status: "ok", ...runtime }),
    lookupAccount: (query) => ({ id: Number(query.accountId ?? 7), status: "active" }),
    lookupPlan: (id) => ({ id, title: "Safe metadata", events: [] }),
    setAccountSuspended: (input) => { calls.push(["account", input]); return { account: { id: input.accountId, status: input.suspended ? "suspended" : "active" }, revoked: {} }; },
    setPlanSuspended: (input) => { calls.push(["plan", input]); return { plan: { id: input.planId, status: input.suspended ? "suspended" : "active" } }; },
    revokeInvite: (input) => { calls.push(["invite", input]); return { revoked: true }; },
    revokeShareLink: (input) => { calls.push(["share", input]); return { revoked: true }; },
    privacyReview: (accountId) => ({ account: { id: accountId }, recentlyReauthenticated }),
  };
  const privacy = { deleteAccount: (input) => { calls.push(["privacy", input]); return { receiptId: "public-receipt", deletedAt: "2026-08-26T12:00:00.000Z" }; } };
  const router = routerModule?.createPublicAdminRouter({
    repository,
    privacy,
    healthSnapshot: () => ({ cache: { entries: 4 }, gate: { queued: 0 }, oauth: { enabled: true }, rateTotals: { total: 9 } }),
    hasPermission: adminHasPermission,
    audit: (user, action, details) => audits.push([user.role, action, details]),
    readRequestJson: async (req) => req.body ?? {},
    send,
  });
  return { router, calls, audits, setRecent: (value) => { recentlyReauthenticated = value; } };
}

async function call(router, role, method, path, body = null) {
  const res = recorder();
  const handled = await router({ req: { body }, res, user: { id: 1, username: role, role }, method, url: new URL(`https://app.timbersteeltrade.com${path}`) });
  return { handled, status: res.status, body: res.body ? JSON.parse(res.body) : null };
}

test("public-service Admin router enforces the exact role matrix", async () => {
  assert.ok(routerModule, "public-service Admin router must exist");
  const f = fixture();
  assert.equal((await call(f.router, "viewer", "GET", "/api/local/admin/public-service/health")).status, 200);
  assert.equal((await call(f.router, "viewer", "GET", "/api/local/admin/public-service/account?accountId=7")).status, 403);
  assert.equal((await call(f.router, "discord-manager", "GET", "/api/local/admin/public-service/health")).status, 403);
  assert.equal((await call(f.router, "moderator", "GET", "/api/local/admin/public-service/account?accountId=7")).status, 200);
  assert.equal((await call(f.router, "moderator", "POST", "/api/local/admin/public-service/accounts/status", { accountId: 7, suspended: true })).status, 200);
  assert.equal((await call(f.router, "moderator", "GET", "/api/local/admin/public-service/privacy/review?accountId=7")).status, 403);
  assert.equal((await call(f.router, "admin", "GET", "/api/local/admin/public-service/privacy/review?accountId=7")).status, 200);
});

test("moderation actions audit exact identifiers and privacy processing still requires recent public reauthentication", async () => {
  assert.ok(routerModule, "public-service Admin router must exist");
  const f = fixture();
  const suspended = await call(f.router, "moderator", "POST", "/api/local/admin/public-service/plans/status", { planId: "plan-7", suspended: true });
  assert.equal(suspended.status, 200);
  const invite = await call(f.router, "moderator", "POST", "/api/local/admin/public-service/invites/revoke", { planId: "plan-7", inviteId: "invite-7" });
  assert.equal(invite.status, 200);
  const blocked = await call(f.router, "admin", "POST", "/api/local/admin/public-service/privacy/delete", { accountId: 7, dispositions: [] });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "recent_discord_reauthentication_required");
  f.setRecent(true);
  const deleted = await call(f.router, "admin", "POST", "/api/local/admin/public-service/privacy/delete", { accountId: 7, dispositions: [] });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.receiptId, "public-receipt");
  assert.deepEqual(f.audits.map((entry) => entry[1]), ["public.plan.suspended", "public.invite.revoked", "public.privacy.deleted"]);
  assert.doesNotMatch(JSON.stringify({ calls: f.calls, audits: f.audits }), /token|hash|document/i);
});
