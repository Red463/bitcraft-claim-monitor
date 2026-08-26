import { createHmac, randomUUID as cryptoRandomUUID } from "node:crypto";

export class PublicAccountDeletionError extends Error {
  constructor(message, status = 400, code = "public_account_deletion_invalid") {
    super(message);
    this.name = "PublicAccountDeletionError";
    this.status = status;
    this.code = code;
  }
}

function count(result) {
  return Number(result?.changes ?? 0);
}

export function deletedPublicSubjectMarker(discordId, deletionKey) {
  return `deleted:${createHmac("sha256", String(deletionKey))
    .update(`public-profile:discord:${String(discordId)}`)
    .digest("base64url")
    .slice(0, 22)}`;
}

export function publicAccountDeletionReview(db, userId) {
  const ownedPlans = db.prepare(`
    SELECT id, title, claim_id, status, access_revision
    FROM public_craft_plans
    WHERE owner_user_id = ?
    ORDER BY id
  `).all(userId).map((plan) => ({
    id: String(plan.id),
    title: String(plan.title),
    claimId: String(plan.claim_id),
    status: String(plan.status),
    accessRevision: Number(plan.access_revision),
    acceptedEditors: db.prepare(`
      SELECT member.user_id, account.discord_username, account.discord_global_name
      FROM public_craft_plan_members AS member
      JOIN public_user_accounts AS account ON account.id = member.user_id
      WHERE member.plan_id = ? AND member.role = 'editor'
      ORDER BY member.user_id
    `).all(String(plan.id)).map((member) => ({
      userId: Number(member.user_id),
      username: String(member.discord_username ?? ""),
      globalName: String(member.discord_global_name ?? ""),
    })),
  }));
  return { ownedPlans, canDelete: ownedPlans.length === 0 };
}

function validatedDispositions(review, dispositions) {
  if (!Array.isArray(dispositions)) {
    throw new PublicAccountDeletionError("Choose a disposition for every owned plan.", 409, "plan_disposition_required");
  }
  const expected = new Map(review.ownedPlans.map((plan) => [plan.id, plan]));
  const selected = new Map();
  for (const value of dispositions) {
    const planId = String(value?.planId ?? "");
    if (!expected.has(planId) || selected.has(planId)) {
      throw new PublicAccountDeletionError("Owned plan dispositions do not match the current account.", 409, "plan_disposition_invalid");
    }
    const action = String(value?.action ?? "");
    if (action !== "delete" && action !== "transfer") {
      throw new PublicAccountDeletionError("Each owned plan must be transferred or permanently deleted.", 409, "plan_disposition_invalid");
    }
    const plan = expected.get(planId);
    if (action === "transfer") {
      const userId = Number(value?.userId);
      if (!Number.isSafeInteger(userId) || !plan.acceptedEditors.some((editor) => editor.userId === userId)) {
        throw new PublicAccountDeletionError("Ownership can transfer only to an accepted editor.", 409, "transfer_requires_editor");
      }
      selected.set(planId, { planId, action, userId });
    } else {
      selected.set(planId, { planId, action });
    }
  }
  if (selected.size !== expected.size) {
    throw new PublicAccountDeletionError("Choose a disposition for every owned plan.", 409, "plan_disposition_required");
  }
  return [...selected.values()];
}

export function deletePublicAccount(db, {
  userId,
  discordId,
  deletionKey,
  dispositions,
  now = () => new Date(),
  randomUUID = cryptoRandomUUID,
  manageTransaction = true,
} = {}) {
  const receiptId = randomUUID();
  const deletedAt = now().toISOString();
  const empty = { receiptId, deletedAt, deleted: {}, anonymized: {}, transferredPlans: 0, deletedPlans: 0 };
  try {
    if (manageTransaction) db.exec("BEGIN IMMEDIATE");
    const account = db.prepare("SELECT * FROM public_user_accounts WHERE id = ? AND discord_id = ?").get(userId, String(discordId));
    if (!account) {
      if (manageTransaction) db.exec("COMMIT");
      return empty;
    }
    const review = publicAccountDeletionReview(db, userId);
    const selected = validatedDispositions(review, dispositions);
    let transferredPlans = 0;
    let deletedPlans = 0;
    for (const disposition of selected) {
      if (disposition.action === "delete") {
        deletedPlans += count(db.prepare("DELETE FROM public_craft_plans WHERE id = ? AND owner_user_id = ?").run(disposition.planId, userId));
        continue;
      }
      const source = review.ownedPlans.find((plan) => plan.id === disposition.planId);
      const quota = db.prepare(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
        FROM public_craft_plans WHERE owner_user_id = ?
      `).get(disposition.userId);
      if (Number(quota.total) >= 100 || (source.status === "active" && Number(quota.active ?? 0) >= 20)) {
        throw new PublicAccountDeletionError("The selected editor cannot receive another owned plan.", 409, "transfer_quota");
      }
      db.prepare("DELETE FROM public_craft_plan_members WHERE plan_id = ? AND user_id = ?").run(disposition.planId, disposition.userId);
      const updated = db.prepare(`
        UPDATE public_craft_plans
        SET owner_user_id = ?, access_revision = access_revision + 1, updated_at = ?
        WHERE id = ? AND owner_user_id = ?
      `).run(disposition.userId, deletedAt, disposition.planId, userId);
      if (Number(updated.changes) !== 1) {
        throw new PublicAccountDeletionError("Owned plan dispositions changed during deletion.", 409, "plan_disposition_conflict");
      }
      db.prepare(`
        INSERT INTO public_craft_plan_events (plan_id, actor_user_id, event_type, payload_json, created_at)
        VALUES (?, ?, 'plan.transferred.account_deletion', ?, ?)
      `).run(disposition.planId, userId, JSON.stringify({ ownerUserId: disposition.userId }), deletedAt);
      transferredPlans += 1;
    }

    const marker = deletedPublicSubjectMarker(account.discord_id, deletionKey);
    const anonymizedEvents = count(db.prepare(`
      UPDATE public_craft_plan_events
      SET actor_user_id = NULL, actor_deleted_marker = ?
      WHERE actor_user_id = ?
    `).run(marker, userId));
    const deleted = {};
    deleted.public_craft_plan_members = count(db.prepare("DELETE FROM public_craft_plan_members WHERE user_id = ?").run(userId));
    deleted.public_craft_plan_invites = count(db.prepare("DELETE FROM public_craft_plan_invites WHERE created_by_user_id = ? OR accepted_by_user_id = ?").run(userId, userId));
    deleted.public_craft_plan_share_links = count(db.prepare("DELETE FROM public_craft_plan_share_links WHERE created_by_user_id = ?").run(userId));
    deleted.public_user_sessions = count(db.prepare("DELETE FROM public_user_sessions WHERE user_id = ?").run(userId));
    deleted.public_user_legal_acceptances = count(db.prepare("DELETE FROM public_user_legal_acceptances WHERE user_id = ?").run(userId));
    deleted.public_user_accounts = count(db.prepare("DELETE FROM public_user_accounts WHERE id = ? AND discord_id = ?").run(userId, String(discordId)));
    if (manageTransaction) db.exec("COMMIT");
    return {
      receiptId,
      deletedAt,
      deleted,
      anonymized: { public_craft_plan_events: anonymizedEvents },
      transferredPlans,
      deletedPlans,
    };
  } catch (error) {
    if (manageTransaction) {
      try { db.exec("ROLLBACK"); } catch {}
    }
    throw error;
  }
}
