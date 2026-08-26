import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  createPublicIdentityRepository,
  publicAccountView,
} from "../src/server/public/identity.mjs";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applySchemaBootstrap(db);
  return db;
}

test("public identity repository never promotes or mutates a matching Timbersteel identity", () => {
  const db = database();
  db.prepare("INSERT INTO admin_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)")
    .run("owner", "hash", "owner", "2026-08-01T00:00:00.000Z");
  db.prepare(`
    INSERT INTO user_accounts (
      discord_id, discord_username, character_player_id, character_name,
      character_status, settings_json, created_at
    ) VALUES ('111222333444555666', 'TimbersteelUser', '42', 'Linked Character', 'approved', '{"theme":"dark"}', ?)
  `).run("2026-08-01T00:00:00.000Z");

  const repository = createPublicIdentityRepository(db);
  const account = repository.upsertAccount({
    discordId: "111222333444555666",
    username: "PublicUser",
    globalName: "Public User",
    avatar: "public-avatar",
  }, "2026-08-25T10:00:00.000Z");

  assert.equal(account.discord_username, "PublicUser");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM admin_sessions").get().count, 0);
  assert.deepEqual({ ...db.prepare(`
    SELECT discord_username, character_player_id, character_name, character_status, settings_json
    FROM user_accounts WHERE discord_id = '111222333444555666'
  `).get() }, {
    discord_username: "TimbersteelUser",
    character_player_id: "42",
    character_name: "Linked Character",
    character_status: "approved",
    settings_json: '{"theme":"dark"}',
  });
  db.close();
});

test("public sessions and legal acceptances use only public-prefixed tables", () => {
  const db = database();
  const repository = createPublicIdentityRepository(db);
  const account = repository.upsertAccount({ discordId: "99", username: "Public" }, "2026-08-25T10:00:00.000Z");
  repository.insertSession({
    tokenHash: "public-session-hash",
    userId: account.id,
    expiresAt: "2026-09-24T10:00:00.000Z",
    createdAt: "2026-08-25T10:00:00.000Z",
  });
  repository.acceptLegal({
    userId: account.id,
    version: "2026-08-25",
    termsDigest: "public-terms",
    privacyDigest: "public-privacy",
    acceptedAt: "2026-08-25T10:00:00.000Z",
    source: "oauth",
  });

  assert.equal(repository.sessionUser("public-session-hash", "2026-08-25T10:01:00.000Z").id, account.id);
  assert.equal(repository.currentLegalAcceptance(account.id).legal_version, "2026-08-25");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_sessions").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_legal_acceptances").get().count, 0);

  repository.markSessionReauthenticated("public-session-hash", account.id, "2026-08-25T10:02:00.000Z");
  assert.equal(repository.sessionByToken("public-session-hash", account.id).reauthenticated_at, "2026-08-25T10:02:00.000Z");
  repository.deleteSession("public-session-hash");
  assert.equal(repository.sessionUser("public-session-hash", "2026-08-25T10:03:00.000Z"), null);
  db.close();
});

test("public data export includes isolated collaboration records without secrets or collaborator identity", () => {
  const db = database();
  const repository = createPublicIdentityRepository(db);
  const account = repository.upsertAccount({ discordId: "77", username: "Exporter" }, "2026-08-25T10:00:00.000Z");
  db.prepare("UPDATE public_user_accounts SET settings_json = ? WHERE id = ?").run('{"compact":true}', account.id);
  repository.insertSession({ tokenHash: "secret-session-hash", userId: account.id, expiresAt: "2026-09-24T10:00:00.000Z", createdAt: "2026-08-25T10:00:00.000Z" });
  repository.acceptLegal({ userId: account.id, version: "2026-08-25", termsDigest: "terms", privacyDigest: "privacy", acceptedAt: "2026-08-25T10:00:00.000Z", source: "oauth" });
  const collaborator = repository.upsertAccount({ discordId: "88", username: "PrivateCollaborator", globalName: "Do not export" }, "2026-08-25T10:00:00.000Z");
  const document = JSON.stringify({ schemaVersion: 1, targets: [{ catalogKey: "items:7", quantity: "3" }], routeOverrides: {}, multipliers: {}, sectionOverrides: {}, rowNameOverrides: {} });
  db.prepare(`INSERT INTO public_craft_plans (id, owner_user_id, claim_id, title, document_json, status, document_revision, access_revision, created_at, updated_at)
    VALUES ('owned-plan', ?, '42', 'Owned plan', ?, 'active', 2, 4, '2026-08-25T10:00:00.000Z', '2026-08-25T10:30:00.000Z')`).run(account.id, document);
  db.prepare(`INSERT INTO public_craft_plans (id, owner_user_id, claim_id, title, document_json, status, document_revision, access_revision, created_at, updated_at)
    VALUES ('member-plan', ?, '99', 'Member plan', ?, 'active', 1, 1, '2026-08-25T10:00:00.000Z', '2026-08-25T10:00:00.000Z')`).run(collaborator.id, document);
  db.prepare("INSERT INTO public_craft_plan_members (plan_id, user_id, role, created_at, updated_at) VALUES ('member-plan', ?, 'editor', '2026-08-25T10:05:00.000Z', '2026-08-25T10:05:00.000Z')").run(account.id);
  db.prepare("INSERT INTO public_craft_plan_invites (id, plan_id, created_by_user_id, role, token_hash, expires_at, accepted_at, accepted_by_user_id, created_at) VALUES ('invite-export', 'owned-plan', ?, 'viewer', 'secret-invite-hmac', '2026-09-01T10:00:00.000Z', '2026-08-25T10:10:00.000Z', ?, '2026-08-25T10:00:00.000Z')").run(account.id, collaborator.id);
  db.prepare("INSERT INTO public_craft_plan_share_links (id, plan_id, created_by_user_id, label, token_hash, created_at) VALUES ('share-export', 'owned-plan', ?, 'Community view', 'secret-share-hmac', '2026-08-25T10:00:00.000Z')").run(account.id);
  db.prepare("INSERT INTO public_craft_plan_events (plan_id, actor_user_id, event_type, payload_json, created_at) VALUES ('owned-plan', ?, 'member.updated', ?, '2026-08-25T10:15:00.000Z')")
    .run(collaborator.id, JSON.stringify({ userId: collaborator.id, role: "viewer", token: "raw-bearer-secret", token_hash: "event-secret-hash", label: "Safe label" }));

  const exported = repository.exportAccount(account.id, {
    legalVersion: "2026-08-25",
    exportedAt: "2026-08-25T11:00:00.000Z",
  });

  assert.equal(exported.account.discordId, "77");
  assert.deepEqual(exported.settings, { compact: true });
  assert.equal(exported.legalAcceptances.length, 1);
  assert.deepEqual(exported.sessions, [{
    createdAt: "2026-08-25T10:00:00.000Z",
    expiresAt: "2026-09-24T10:00:00.000Z",
    reauthenticatedAt: null,
  }]);
  assert.equal(exported.collaboration.ownedPlans[0].id, "owned-plan");
  assert.deepEqual(exported.collaboration.ownedPlans[0].document.targets, [{ catalogKey: "items:7", quantity: "3" }]);
  assert.deepEqual(exported.collaboration.memberships, [{ planId: "member-plan", title: "Member plan", claimId: "99", status: "active", role: "editor", createdAt: "2026-08-25T10:05:00.000Z", updatedAt: "2026-08-25T10:05:00.000Z" }]);
  assert.deepEqual(exported.collaboration.invites[0], { id: "invite-export", planId: "owned-plan", role: "viewer", status: "accepted", expiresAt: "2026-09-01T10:00:00.000Z", createdAt: "2026-08-25T10:00:00.000Z", acceptedAt: "2026-08-25T10:10:00.000Z", revokedAt: null });
  assert.deepEqual(exported.collaboration.shareLinks[0], { id: "share-export", planId: "owned-plan", label: "Community view", status: "active", createdAt: "2026-08-25T10:00:00.000Z", revokedAt: null });
  assert.deepEqual(exported.collaboration.events[0].actor, { relationship: "other" });
  assert.deepEqual(exported.collaboration.events[0].payload, { role: "viewer", label: "Safe label" });
  assert.doesNotMatch(JSON.stringify(exported), /secret-session-hash|secret-invite-hmac|secret-share-hmac|raw-bearer-secret|event-secret-hash|PrivateCollaborator|Do not export|character|admin|csrf/i);
  db.close();
});

test("publicAccountView exposes no Timbersteel character, role, or Featurebase fields", () => {
  assert.deepEqual(publicAccountView({
    id: 1,
    discord_id: "123",
    discord_username: "Public",
    discord_global_name: "Public User",
    discord_avatar: "avatar",
    settings_json: '{"compact":true}',
    created_at: "2026-08-25T10:00:00.000Z",
    last_login_at: "2026-08-25T11:00:00.000Z",
  }), {
    id: 1,
    discordId: "123",
    username: "Public",
    globalName: "Public User",
    avatarUrl: "https://cdn.discordapp.com/avatars/123/avatar.png?size=128",
    settings: { compact: true },
    createdAt: "2026-08-25T10:00:00.000Z",
    lastLoginAt: "2026-08-25T11:00:00.000Z",
  });
});
