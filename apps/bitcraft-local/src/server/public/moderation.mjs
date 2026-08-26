export class PublicModerationError extends Error {
  constructor(message, status = 400, code = "public_moderation_invalid") {
    super(message);
    this.name = "PublicModerationError";
    this.status = status;
    this.code = code;
  }
}

function transaction(db, action) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function count(result) {
  return Number(result?.changes ?? 0);
}

const SAFE_EVENT_PAYLOAD_KEYS = new Set([
  "claimId", "expiresAt", "inviteId", "label", "ownerUserId",
  "previousOwnerUserId", "role", "shareId", "sourcePlanId", "status", "title", "userId",
]);

function safeEventPayload(value) {
  let parsed;
  try { parsed = JSON.parse(String(value ?? "{}")); } catch { return {}; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([key, child]) => (
    SAFE_EVENT_PAYLOAD_KEYS.has(key)
    && (child == null || ["string", "number", "boolean"].includes(typeof child))
  )));
}

function accountView(row, counts = {}) {
  if (!row) return null;
  return {
    id: Number(row.id),
    discordId: String(row.discord_id),
    username: String(row.discord_username ?? ""),
    globalName: String(row.discord_global_name ?? ""),
    status: String(row.status ?? "active"),
    suspendedAt: row.suspended_at ? String(row.suspended_at) : null,
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    ownedPlans: Number(counts.owned_plans ?? 0),
    memberPlans: Number(counts.member_plans ?? 0),
  };
}

function planMetadata(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: String(row.title),
    claimId: String(row.claim_id),
    status: String(row.status),
    owner: {
      userId: Number(row.owner_user_id),
      username: String(row.discord_username ?? ""),
      globalName: String(row.discord_global_name ?? ""),
    },
    revisions: { document: Number(row.document_revision), access: Number(row.access_revision) },
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createPublicModerationRepository(db, { now = () => new Date() } = {}) {
  function requireAccount(accountId) {
    const row = db.prepare("SELECT * FROM public_user_accounts WHERE id = ?").get(accountId);
    if (!row) throw new PublicModerationError("Public account was not found.", 404, "public_account_not_found");
    return row;
  }

  function requirePlan(planId) {
    const row = db.prepare("SELECT * FROM public_craft_plans WHERE id = ?").get(String(planId));
    if (!row) throw new PublicModerationError("Public plan was not found.", 404, "public_plan_not_found");
    return row;
  }

  function lookupAccount({ accountId = null, discordId = null } = {}) {
    const hasAccountId = Number.isSafeInteger(Number(accountId)) && Number(accountId) > 0;
    const hasDiscordId = typeof discordId === "string" && /^\d+$/.test(discordId);
    if (hasAccountId === hasDiscordId) {
      throw new PublicModerationError("Use exactly one exact public account identifier.", 400, "public_account_lookup_invalid");
    }
    const row = hasAccountId
      ? db.prepare("SELECT * FROM public_user_accounts WHERE id = ?").get(Number(accountId))
      : db.prepare("SELECT * FROM public_user_accounts WHERE discord_id = ?").get(discordId);
    if (!row) return null;
    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM public_craft_plans WHERE owner_user_id = ?) AS owned_plans,
        (SELECT COUNT(*) FROM public_craft_plan_members WHERE user_id = ?) AS member_plans
    `).get(row.id, row.id);
    return accountView(row, counts);
  }

  function lookupPlan(planId) {
    const row = db.prepare(`
      SELECT plan.*, account.discord_username, account.discord_global_name
      FROM public_craft_plans AS plan
      JOIN public_user_accounts AS account ON account.id = plan.owner_user_id
      WHERE plan.id = ?
    `).get(String(planId));
    if (!row) return null;
    const events = db.prepare(`
      SELECT event.id, event.event_type, event.payload_json, event.created_at,
        event.actor_deleted_marker IS NOT NULL AS actor_deleted, account.id AS actor_user_id,
        account.discord_username, account.discord_global_name
      FROM public_craft_plan_events AS event
      LEFT JOIN public_user_accounts AS account ON account.id = event.actor_user_id
      WHERE event.plan_id = ? ORDER BY event.created_at, event.id LIMIT 200
    `).all(String(planId)).map((event) => ({
      id: Number(event.id),
      type: String(event.event_type),
      createdAt: String(event.created_at),
      actor: event.actor_user_id == null
        ? Number(event.actor_deleted) === 1 ? { deleted: true } : null
        : { userId: Number(event.actor_user_id), username: String(event.discord_username ?? ""), globalName: String(event.discord_global_name ?? "") },
      payload: safeEventPayload(event.payload_json),
    }));
    const totals = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM public_craft_plan_members WHERE plan_id = ?) AS members,
        (SELECT COUNT(*) FROM public_craft_plan_invites WHERE plan_id = ? AND accepted_at IS NULL AND revoked_at IS NULL) AS active_invites,
        (SELECT COUNT(*) FROM public_craft_plan_share_links WHERE plan_id = ? AND revoked_at IS NULL) AS active_share_links
    `).get(String(planId), String(planId), String(planId));
    return { ...planMetadata(row), totals: { members: Number(totals.members), activeInvites: Number(totals.active_invites), activeShareLinks: Number(totals.active_share_links) }, events };
  }

  return Object.freeze({
    health(runtime = {}) {
      const totals = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM public_user_accounts) AS accounts,
          (SELECT COUNT(*) FROM public_craft_plans) AS plans,
          (SELECT COUNT(*) FROM public_user_accounts WHERE status = 'suspended') AS suspended_accounts,
          (SELECT COUNT(*) FROM public_craft_plans WHERE status = 'suspended') AS suspended_plans
      `).get();
      return {
        status: "ok",
        cache: runtime.cache ?? {},
        gate: runtime.gate ?? {},
        oauth: runtime.oauth ?? {},
        rateTotals: runtime.rateTotals ?? {},
        totals: {
          accounts: Number(totals.accounts),
          plans: Number(totals.plans),
          suspendedAccounts: Number(totals.suspended_accounts),
          suspendedPlans: Number(totals.suspended_plans),
        },
      };
    },
    lookupAccount,
    lookupPlan,
    setAccountSuspended({ accountId, suspended }) {
      return transaction(db, () => {
        const account = requireAccount(Number(accountId));
        const suspendedAt = now().toISOString();
        const revoked = { sessions: 0, invites: 0, shareLinks: 0 };
        if (suspended) {
          db.prepare("UPDATE public_user_accounts SET status = 'suspended', suspended_at = ? WHERE id = ?").run(suspendedAt, account.id);
          revoked.sessions = count(db.prepare("DELETE FROM public_user_sessions WHERE user_id = ?").run(account.id));
          db.prepare(`
            UPDATE public_craft_plans
            SET moderation_previous_status = status,
                moderation_suspended_account_id = ?,
                status = 'suspended', access_revision = access_revision + 1, updated_at = ?
            WHERE owner_user_id = ? AND status <> 'suspended'
          `).run(account.id, suspendedAt, account.id);
        } else {
          db.prepare("UPDATE public_user_accounts SET status = 'active', suspended_at = NULL WHERE id = ?").run(account.id);
          db.prepare(`
            UPDATE public_craft_plans
            SET status = moderation_previous_status,
                moderation_previous_status = NULL,
                moderation_suspended_account_id = NULL,
                access_revision = access_revision + 1, updated_at = ?
            WHERE owner_user_id = ? AND status = 'suspended'
              AND moderation_suspended_account_id = ?
              AND moderation_previous_status IN ('active', 'archived')
          `).run(suspendedAt, account.id, account.id);
        }
        return { account: lookupAccount({ accountId: account.id }), revoked };
      });
    },
    setPlanSuspended({ planId, suspended }) {
      return transaction(db, () => {
        const plan = requirePlan(planId);
        const updatedAt = now().toISOString();
        const revoked = { invites: 0, shareLinks: 0 };
        if (suspended && String(plan.status) !== "suspended") {
          db.prepare(`
            UPDATE public_craft_plans
            SET moderation_previous_status = status, moderation_suspended_account_id = NULL,
                status = 'suspended', access_revision = access_revision + 1, updated_at = ?
            WHERE id = ?
          `).run(updatedAt, String(planId));
        } else if (!suspended && String(plan.status) === "suspended") {
          if (plan.moderation_suspended_account_id != null) {
            throw new PublicModerationError("Restore the suspended owner account before restoring this plan.", 409, "owner_suspended");
          }
          db.prepare(`
            UPDATE public_craft_plans
            SET status = COALESCE(moderation_previous_status, 'active'),
                moderation_previous_status = NULL, access_revision = access_revision + 1, updated_at = ?
            WHERE id = ?
          `).run(updatedAt, String(planId));
        }
        return { plan: lookupPlan(planId), revoked };
      });
    },
    revokeInvite({ planId, inviteId }) {
      requirePlan(planId);
      return transaction(db, () => {
        const revokedAt = now().toISOString();
        const result = db.prepare(`
          UPDATE public_craft_plan_invites SET revoked_at = ?
          WHERE id = ? AND plan_id = ? AND accepted_at IS NULL AND revoked_at IS NULL
        `).run(revokedAt, String(inviteId), String(planId));
        if (Number(result.changes) !== 1) throw new PublicModerationError("Public invitation was not found.", 404, "public_invite_not_found");
        db.prepare("UPDATE public_craft_plans SET access_revision = access_revision + 1, updated_at = ? WHERE id = ?").run(revokedAt, String(planId));
        return { revoked: true };
      });
    },
    revokeShareLink({ planId, shareId }) {
      requirePlan(planId);
      return transaction(db, () => {
        const revokedAt = now().toISOString();
        const result = db.prepare(`
          UPDATE public_craft_plan_share_links SET revoked_at = ?
          WHERE id = ? AND plan_id = ? AND revoked_at IS NULL
        `).run(revokedAt, String(shareId), String(planId));
        if (Number(result.changes) !== 1) throw new PublicModerationError("Public share link was not found.", 404, "public_share_not_found");
        db.prepare("UPDATE public_craft_plans SET access_revision = access_revision + 1, updated_at = ? WHERE id = ?").run(revokedAt, String(planId));
        return { revoked: true };
      });
    },
    privacyReview(accountId) {
      const account = requireAccount(Number(accountId));
      const recentCutoff = new Date(now().getTime() - 10 * 60 * 1000).toISOString();
      const recent = db.prepare(`
        SELECT 1 FROM public_user_sessions
        WHERE user_id = ? AND reauthenticated_at >= ? AND expires_at > ? LIMIT 1
      `).get(account.id, recentCutoff, now().toISOString());
      return { account: lookupAccount({ accountId: account.id }), recentlyReauthenticated: Boolean(recent) };
    },
  });
}
