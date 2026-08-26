import assert from "node:assert/strict";
import test from "node:test";

import { capturePublicPlanFragmentSecret, publicPlanAuthorization } from "../src/public/planSecrets.mjs";

let client = null;
try {
  client = await import("../src/public/planApi.ts");
} catch {
  // RED: the public plan production gateway is introduced by this fix round.
}

function storageFor(pathname, fragment) {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const replacements = [];
  assert.equal(capturePublicPlanFragmentSecret({
    location: { pathname, search: "", hash: fragment },
    history: { replaceState: (...args) => replacements.push(args) },
    sessionStorage: storage,
  }), true);
  return { storage, replacements };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("shared-plan gateway reads with stored Authorization and keeps token out of the request URL", async () => {
  assert.ok(client, "public plan production gateway must exist");
  const token = "reusable-share-secret";
  const pathname = "/shared-plans/plan-7";
  const { storage } = storageFor(pathname, `#share=${token}`);
  const calls = [];
  const plan = { id: "plan-7", title: "Public bridge", claimId: "42", document: { targets: [] } };

  const result = await client.loadSharedPublicPlan({
    planId: "plan-7",
    pathname,
    sessionStorage: storage,
    fetchImpl: async (input, init) => { calls.push([input, init]); return response(200, { plan }); },
  });

  assert.deepEqual(result, plan);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/public/shared-plans/plan-7");
  assert.doesNotMatch(calls[0][0], /[?#]|reusable-share-secret/);
  assert.equal(calls[0][1].headers.authorization, `Bearer ${token}`);
  assert.equal(calls[0][1].credentials, "same-origin");
  assert.equal(calls[0][1].cache, "no-store");
  assert.deepEqual(publicPlanAuthorization(pathname, storage), { authorization: `Bearer ${token}` }, "reusable share storage survives reads");
});

test("one explicit invite action discovers a revision, retries once with tagged If-Match, and clears the one-time secret", async () => {
  assert.ok(client, "public plan production gateway must exist");
  const token = "one-time-invite-secret";
  const pathname = "/invites/invite-8";
  const { storage } = storageFor(pathname, `#token=${token}`);
  const calls = [];
  const replies = [
    response(428, { error: "If-Match required", code: "revision_required", currentRevisions: { access: 7 } }),
    response(200, { plan: { id: "plan-8", title: "Accepted plan", claimId: "42", document: { targets: [] } } }),
  ];

  const plan = await client.acceptPublicPlanInvite({
    inviteId: "invite-8",
    pathname,
    csrfToken: "public-csrf",
    sessionStorage: storage,
    fetchImpl: async (input, init) => { calls.push([input, init]); return replies.shift(); },
  });

  assert.equal(plan.id, "plan-8");
  assert.equal(calls.length, 2);
  for (const [input, init] of calls) {
    assert.equal(input, "/api/public/invites/invite-8/accept");
    assert.doesNotMatch(input, /[?#]|one-time-invite-secret/);
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.headers.authorization, `Bearer ${token}`);
    assert.equal(init.headers["x-csrf-token"], "public-csrf");
  }
  assert.equal("if-match" in calls[0][1].headers, false);
  assert.equal(calls[1][1].headers["if-match"], '"access:7"');
  assert.deepEqual(publicPlanAuthorization(pathname, storage), {}, "successful acceptance clears the one-time secret");
});

test("invite gateway never auto-retries a conflict and keeps a retryable secret", async () => {
  assert.ok(client, "public plan production gateway must exist");
  const token = "conflicted-invite-secret";
  const pathname = "/invites/invite-9";
  const { storage } = storageFor(pathname, `#token=${token}`);
  const calls = [];
  const replies = [
    response(428, { code: "revision_required", currentRevisions: { access: 3 } }),
    response(409, { error: `unsafe echo ${token}`, code: "revision_conflict", currentRevisions: { access: 4 } }),
  ];

  await assert.rejects(() => client.acceptPublicPlanInvite({
    inviteId: "invite-9",
    pathname,
    csrfToken: "public-csrf",
    sessionStorage: storage,
    fetchImpl: async (input, init) => { calls.push([input, init]); return replies.shift(); },
  }), (error) => {
    assert.equal(error.status, 409);
    assert.doesNotMatch(error.message, new RegExp(token));
    return true;
  });
  assert.equal(calls.length, 2, "a 409 never triggers another automatic mutation");
  assert.deepEqual(publicPlanAuthorization(pathname, storage), { authorization: `Bearer ${token}` });
});

test("terminal invitation responses clear storage without exposing a server token echo", async () => {
  assert.ok(client, "public plan production gateway must exist");
  const token = "revoked-invite-secret";
  const pathname = "/invites/invite-10";
  const { storage } = storageFor(pathname, `#token=${token}`);

  await assert.rejects(() => client.acceptPublicPlanInvite({
    inviteId: "invite-10",
    pathname,
    csrfToken: "public-csrf",
    sessionStorage: storage,
    fetchImpl: async () => response(404, { error: `revoked ${token}`, code: token }),
  }), (error) => {
    assert.equal(error.status, 404);
    assert.doesNotMatch(error.message, new RegExp(token));
    assert.doesNotMatch(JSON.stringify({ message: error.message, code: error.code, currentRevisions: error.currentRevisions }), new RegExp(token));
    return true;
  });
  assert.deepEqual(publicPlanAuthorization(pathname, storage), {});
});

test("signed-in plan document saves use tagged revisions and expose conflicts without retrying", async () => {
  assert.ok(client, "public plan production gateway must exist");
  const calls = [];
  const draft = {
    schemaVersion: 1,
    targets: [{ catalogKey: "items:7", quantity: "12" }],
    routeOverrides: {},
    multipliers: {},
    sectionOverrides: {},
    rowNameOverrides: {},
  };

  await assert.rejects(() => client.savePublicPlanDocument({
    planId: "plan-7",
    document: draft,
    documentRevision: 4,
    csrfToken: "public-csrf",
    fetchImpl: async (input, init) => {
      calls.push([input, init]);
      return response(409, {
        error: "unsafe server detail",
        code: "revision_conflict",
        currentRevisions: { document: 5, access: 9 },
      });
    },
  }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "revision_conflict");
    assert.deepEqual(error.currentRevisions, { document: 5, access: 9 });
    assert.equal(error.message, "This plan changed on the server. Your unsaved draft has been kept.");
    return true;
  });

  assert.equal(calls.length, 1, "a document conflict must never trigger an automatic overwrite");
  assert.equal(calls[0][0], "/api/public/plans/plan-7/document");
  assert.equal(calls[0][1].method, "PUT");
  assert.equal(calls[0][1].headers["if-match"], '"document:4"');
  assert.equal(calls[0][1].headers["x-csrf-token"], "public-csrf");
  assert.deepEqual(JSON.parse(calls[0][1].body), { document: draft });
});

test("collaboration mutations keep document and access revisions explicitly separated", async () => {
  assert.ok(client, "public plan production gateway must exist");
  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push([input, init]);
    return response(200, { ok: true, revisions: { document: 3, access: 8 } });
  };

  await client.mutatePublicPlanAccess({
    path: "/api/public/plans/plan-8/members/22",
    method: "PATCH",
    body: { role: "viewer" },
    accessRevision: 7,
    csrfToken: "public-csrf",
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].headers["if-match"], '"access:7"');
  assert.equal(calls[0][1].headers["x-csrf-token"], "public-csrf");
  assert.deepEqual(JSON.parse(calls[0][1].body), { role: "viewer" });
});

test("plan workspace gateway lists, loads, creates, and reads events through same-origin JSON", async () => {
  assert.ok(client, "public plan production gateway must exist");
  const calls = [];
  const plan = { id: "plan-9", title: "Keep walls", claimId: "42", document: { targets: [] } };
  const replies = [
    response(200, { plans: [plan] }),
    response(200, { plan }),
    response(201, { plan }),
    response(200, { events: [{ id: 1, type: "plan.created" }] }),
  ];
  const fetchImpl = async (input, init) => { calls.push([input, init]); return replies.shift(); };

  assert.deepEqual(await client.loadPublicPlans(fetchImpl), [plan]);
  assert.deepEqual(await client.loadPublicPlan("plan-9", fetchImpl), plan);
  assert.deepEqual(await client.createPublicPlan({
    claimId: "42",
    title: "Keep walls",
    document: { schemaVersion: 1, targets: [], routeOverrides: {}, multipliers: {}, sectionOverrides: {}, rowNameOverrides: {} },
    csrfToken: "public-csrf",
    fetchImpl,
  }), plan);
  assert.deepEqual(await client.loadPublicPlanEvents("plan-9", fetchImpl), [{ id: 1, type: "plan.created" }]);

  assert.deepEqual(calls.map(([path]) => path), [
    "/api/public/plans",
    "/api/public/plans/plan-9",
    "/api/public/plans",
    "/api/public/plans/plan-9/events",
  ]);
  assert.equal(calls[2][1].headers["if-match"], "*");
  assert.equal(calls[2][1].headers["x-csrf-token"], "public-csrf");
});
