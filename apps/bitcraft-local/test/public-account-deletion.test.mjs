import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

let deletion = null;
try {
  deletion = await import("../src/server/public/accountDeletion.mjs");
} catch {
  // RED: Task 7 introduces the public-profile deletion transaction.
}

function addPublicUser(db, discordId, username) {
  return Number(db.prepare(`
    INSERT INTO public_user_accounts (discord_id, discord_username, settings_json, created_at, last_login_at)
    VALUES (?, ?, '{"dense":true}', '2026-01-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')
  `).run(discordId, username).lastInsertRowid);
}

function addPlan(db, id, ownerId, status = "active") {
  db.prepare(`
    INSERT INTO public_craft_plans (
      id, owner_user_id, claim_id, title, document_json, status,
      document_revision, access_revision, created_at, updated_at
    ) VALUES (?, ?, '42', ?, '{"schemaVersion":1,"targets":[],"routeOverrides":{},"multipliers":{},"sectionOverrides":{},"rowNameOverrides":{}}', ?, 1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run(id, ownerId, id, status);
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applySchemaBootstrap(db);
  const ownerId = addPublicUser(db, "111111111111111111", "owner-name");
  const editorId = addPublicUser(db, "222222222222222222", "editor-name");
  const viewerId = addPublicUser(db, "333333333333333333", "viewer-name");
  addPlan(db, "plan-transfer", ownerId);
  addPlan(db, "plan-delete", ownerId);
  addPlan(db, "plan-viewed", editorId);
  db.prepare("INSERT INTO public_craft_plan_members (plan_id, user_id, role, created_at, updated_at) VALUES ('plan-transfer', ?, 'editor', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')").run(editorId);
  db.prepare("INSERT INTO public_craft_plan_members (plan_id, user_id, role, created_at, updated_at) VALUES ('plan-viewed', ?, 'viewer', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')").run(ownerId);
  db.prepare("INSERT INTO public_user_sessions (token_hash, user_id, expires_at, created_at) VALUES ('public-token-hash', ?, '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')").run(ownerId);
  db.prepare("INSERT INTO public_user_legal_acceptances (user_id, legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source) VALUES (?, 'v1', 't', 'p', 1, '2026-01-01T00:00:00.000Z', 'oauth')").run(ownerId);
  db.prepare("INSERT INTO public_craft_plan_invites (id, plan_id, created_by_user_id, role, token_hash, expires_at, created_at) VALUES ('invite-owned', 'plan-viewed', ?, 'viewer', 'hash', '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')").run(ownerId);
  db.prepare("INSERT INTO public_craft_plan_events (plan_id, actor_user_id, event_type, payload_json, created_at) VALUES ('plan-transfer', ?, 'document.updated', '{}', '2026-08-01T00:00:00.000Z')").run(ownerId);

  db.prepare(`
    INSERT INTO user_accounts (discord_id, discord_username, character_status, settings_json, created_at)
    VALUES ('111111111111111111', 'timbersteel-owner', 'unlinked', '{}', '2026-01-01T00:00:00.000Z')
  `).run();
  return { db, ownerId, editorId, viewerId };
}

test("public deletion requires one valid disposition for every owned plan before mutating", () => {
  assert.ok(deletion, "public-profile deletion module must exist");
  const { db, ownerId, editorId } = fixture();
  const review = deletion.publicAccountDeletionReview(db, ownerId);
  assert.deepEqual(review.ownedPlans.map((plan) => plan.id), ["plan-delete", "plan-transfer"]);
  assert.deepEqual(review.ownedPlans.find((plan) => plan.id === "plan-transfer").acceptedEditors.map((member) => member.userId), [editorId]);
  assert.equal(review.canDelete, false);

  assert.throws(() => deletion.deletePublicAccount(db, {
    userId: ownerId,
    discordId: "111111111111111111",
    deletionKey: "public-deletion-key",
    dispositions: [{ planId: "plan-transfer", action: "transfer", userId: editorId }],
  }), { name: "PublicAccountDeletionError", code: "plan_disposition_required", status: 409 });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_user_accounts WHERE id = ?").get(ownerId).count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_craft_plans WHERE owner_user_id = ?").get(ownerId).count, 2);
  db.close();
});

test("public deletion transfers only to an accepted editor, deletes selected plans, and anonymizes retained events atomically", () => {
  assert.ok(deletion, "public-profile deletion module must exist");
  const { db, ownerId, editorId } = fixture();
  const receipt = deletion.deletePublicAccount(db, {
    userId: ownerId,
    discordId: "111111111111111111",
    deletionKey: "public-deletion-key",
    dispositions: [
      { planId: "plan-transfer", action: "transfer", userId: editorId },
      { planId: "plan-delete", action: "delete" },
    ],
    now: () => new Date("2026-08-26T12:00:00.000Z"),
    randomUUID: () => "public-operation",
  });

  assert.equal(db.prepare("SELECT owner_user_id FROM public_craft_plans WHERE id = 'plan-transfer'").get().owner_user_id, editorId);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_craft_plans WHERE id = 'plan-delete'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_user_accounts WHERE id = ?").get(ownerId).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_user_sessions WHERE user_id = ?").get(ownerId).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_user_legal_acceptances WHERE user_id = ?").get(ownerId).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_craft_plan_members WHERE user_id = ?").get(ownerId).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_craft_plan_invites WHERE created_by_user_id = ?").get(ownerId).count, 0);
  const event = db.prepare("SELECT actor_user_id, actor_deleted_marker FROM public_craft_plan_events WHERE plan_id = 'plan-transfer' ORDER BY id LIMIT 1").get();
  assert.equal(event.actor_user_id, null);
  assert.match(event.actor_deleted_marker, /^deleted:/);
  assert.doesNotMatch(event.actor_deleted_marker, /111111111111111111/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_accounts WHERE discord_id = '111111111111111111'").get().count, 1, "Timbersteel account must be untouched");
  assert.equal(receipt.receiptId, "public-operation");
  assert.doesNotMatch(JSON.stringify(receipt), /111111111111111111|owner-name|timbersteel-owner/);
  db.close();
});

test("viewer-only memberships are removed by a planless public-account purge", () => {
  assert.ok(deletion, "public-profile deletion module must exist");
  const { db, ownerId } = fixture();
  db.prepare("DELETE FROM public_craft_plans WHERE owner_user_id = ?").run(ownerId);
  const receipt = deletion.deletePublicAccount(db, {
    userId: ownerId,
    discordId: "111111111111111111",
    deletionKey: "public-deletion-key",
    dispositions: [],
  });
  assert.equal(receipt.deleted.public_craft_plan_members, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM public_user_accounts WHERE id = ?").get(ownerId).count, 0);
  db.close();
});
