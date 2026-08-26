import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { createPublicPlanRepository } from "../src/server/public/publicPlans.mjs";

let moderationModule = null;
try {
  moderationModule = await import("../src/server/public/moderation.mjs");
} catch {
  // RED: Task 7 introduces the public moderation repository.
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applySchemaBootstrap(db);
  const addUser = db.prepare("INSERT INTO public_user_accounts (discord_id, discord_username, discord_global_name, settings_json, created_at, last_login_at) VALUES (?, ?, ?, '{\"secretPreference\":true}', '2026-01-01T00:00:00.000Z', '2026-08-25T00:00:00.000Z')");
  const ownerId = Number(addUser.run("111", "owner", "Owner").lastInsertRowid);
  const editorId = Number(addUser.run("222", "editor", "Editor").lastInsertRowid);
  db.prepare("INSERT INTO public_user_sessions (token_hash, user_id, expires_at, created_at) VALUES ('secret-session-hash', ?, '2026-09-01T00:00:00.000Z', '2026-08-25T00:00:00.000Z')").run(ownerId);
  let byte = 1;
  const plans = createPublicPlanRepository(db, { tokenHmacKey: "public-plan-hmac", now: () => new Date("2026-08-26T12:00:00.000Z"), randomBytes: (size) => Buffer.alloc(size, byte++) });
  const plan = plans.createPlan({ ownerUserId: ownerId, claimId: "42", title: "Moderated plan", document: { schemaVersion: 1, targets: [], routeOverrides: {}, multipliers: {}, sectionOverrides: {}, rowNameOverrides: {} } });
  const invite = plans.createInvite({ planId: plan.id, actorUserId: ownerId, role: "editor", expectedAccessRevision: 1 });
  plans.acceptInvite({ inviteId: invite.id, userId: editorId, token: invite.token, expectedAccessRevision: 2 });
  const share = plans.createShareLink({ planId: plan.id, actorUserId: ownerId, label: "Operations", expectedAccessRevision: 3 });
  const pendingInvite = plans.createInvite({ planId: plan.id, actorUserId: ownerId, role: "viewer", expectedAccessRevision: 4 });
  db.prepare("INSERT INTO public_craft_plan_events (plan_id, actor_user_id, event_type, payload_json, created_at) VALUES (?, ?, 'unsafe.test', '{\"token\":\"raw-secret\",\"token_hash\":\"hash-secret\",\"label\":\"safe label\"}', '2026-08-26T12:00:00.000Z')").run(plan.id, ownerId);
  const moderation = moderationModule?.createPublicModerationRepository(db, { now: () => new Date("2026-08-26T12:05:00.000Z") });
  return { db, ownerId, editorId, plan, invite, pendingInvite, share, plans, moderation };
}

test("public moderation health and exact lookups expose sanitized metadata without documents or secrets", () => {
  assert.ok(moderationModule, "public moderation module must exist");
  const f = fixture();
  assert.deepEqual(f.moderation.health({ cache: { entries: 4 }, gate: { queued: 2 }, oauth: { enabled: true }, rateTotals: { auth: 8 } }), {
    status: "ok",
    cache: { entries: 4 },
    gate: { queued: 2 },
    oauth: { enabled: true },
    rateTotals: { auth: 8 },
    totals: { accounts: 2, plans: 1, suspendedAccounts: 0, suspendedPlans: 0 },
  });
  const account = f.moderation.lookupAccount({ discordId: "111" });
  assert.equal(account.id, f.ownerId);
  assert.equal(account.ownedPlans, 1);
  f.db.prepare("UPDATE public_craft_plan_events SET actor_user_id = NULL, actor_deleted_marker = 'deleted:private-marker' WHERE event_type = 'unsafe.test'").run();
  const plan = f.moderation.lookupPlan(f.plan.id);
  assert.equal(plan.id, f.plan.id);
  assert.equal(plan.events.at(-1).payload.label, "safe label");
  assert.deepEqual(plan.events.at(-1).actor, { deleted: true });
  const serialized = JSON.stringify({ account, plan });
  assert.doesNotMatch(serialized, /document_json|schemaVersion|settings_json|secretPreference|raw-secret|hash-secret|token_hash|secret-session-hash|private-marker/);
  f.db.close();
});

test("account suspension revokes sessions and capabilities, gives members 423, and keeps bearer denial generic", () => {
  assert.ok(moderationModule, "public moderation module must exist");
  const f = fixture();
  const result = f.moderation.setAccountSuspended({ accountId: f.ownerId, suspended: true });
  assert.equal(result.account.status, "suspended");
  assert.equal(result.revoked.sessions, 1);
  assert.ok(result.revoked.invites >= 1);
  assert.ok(result.revoked.shareLinks >= 1);
  assert.throws(() => f.plans.planForUser(f.plan.id, f.editorId), { status: 423, code: "plan_suspended" });
  assert.throws(() => f.plans.planForShare(f.plan.id, f.share.token), { status: 404, code: "plan_not_found" });

  const restored = f.moderation.setAccountSuspended({ accountId: f.ownerId, suspended: false });
  assert.equal(restored.account.status, "active");
  assert.equal(f.plans.planForUser(f.plan.id, f.editorId).status, "active");
  f.db.close();
});

test("plan moderation suspend/restore and exact invite/share revocation never edit plan documents", () => {
  assert.ok(moderationModule, "public moderation module must exist");
  const f = fixture();
  const before = f.db.prepare("SELECT document_json FROM public_craft_plans WHERE id = ?").get(f.plan.id).document_json;
  const suspended = f.moderation.setPlanSuspended({ planId: f.plan.id, suspended: true });
  assert.equal(suspended.plan.status, "suspended");
  assert.equal(suspended.revoked.invites, 1);
  assert.equal(suspended.revoked.shareLinks, 1);
  assert.throws(() => f.plans.planForUser(f.plan.id, f.editorId), { status: 423, code: "plan_suspended" });
  assert.equal(f.moderation.setPlanSuspended({ planId: f.plan.id, suspended: false }).plan.status, "active");
  assert.throws(() => f.plans.planForShare(f.plan.id, f.share.token), { status: 404, code: "plan_not_found" });
  const newInvite = f.plans.createInvite({ planId: f.plan.id, actorUserId: f.ownerId, role: "viewer", expectedAccessRevision: 7 });
  assert.equal(f.moderation.revokeInvite({ planId: f.plan.id, inviteId: newInvite.id }).revoked, true);
  const newShare = f.plans.createShareLink({ planId: f.plan.id, actorUserId: f.ownerId, label: "Second", expectedAccessRevision: 9 });
  assert.equal(f.moderation.revokeShareLink({ planId: f.plan.id, shareId: newShare.id }).revoked, true);
  assert.equal(f.db.prepare("SELECT document_json FROM public_craft_plans WHERE id = ?").get(f.plan.id).document_json, before);
  f.db.close();
});
