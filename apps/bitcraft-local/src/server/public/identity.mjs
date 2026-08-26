function safeJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function publicAccountView(row) {
  if (!row) return null;
  const discordId = String(row.discord_id ?? "");
  const avatar = String(row.discord_avatar ?? "");
  return {
    id: Number(row.id),
    discordId,
    username: String(row.discord_username ?? ""),
    globalName: String(row.discord_global_name ?? ""),
    avatarUrl: discordId && avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128`
      : null,
    settings: safeJson(row.settings_json),
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

function legalAcceptanceView(row) {
  return {
    version: String(row.legal_version),
    termsDigest: String(row.terms_digest),
    privacyDigest: String(row.privacy_digest),
    ageConfirmed: Number(row.age_confirmed) === 1,
    acceptedAt: String(row.accepted_at),
    source: String(row.source),
  };
}

const SAFE_EXPORT_EVENT_PAYLOAD_KEYS = new Set(["claimId", "expiresAt", "label", "role", "status", "title"]);

function exportEventPayload(value) {
  const source = safeJson(value);
  return Object.fromEntries(Object.entries(source).filter(([key, child]) => (
    SAFE_EXPORT_EVENT_PAYLOAD_KEYS.has(key)
    && (child == null || ["string", "number", "boolean"].includes(typeof child))
  )));
}

function planExportView(row, { includeDocument = false } = {}) {
  return {
    id: String(row.id),
    title: String(row.title),
    claimId: String(row.claim_id),
    status: String(row.status),
    revisions: { document: Number(row.document_revision), access: Number(row.access_revision) },
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(includeDocument ? { document: safeJson(row.document_json) } : {}),
  };
}

export function createPublicIdentityRepository(db) {
  const upsertAccountStatement = db.prepare(`
    INSERT INTO public_user_accounts (
      discord_id, discord_username, discord_global_name, discord_avatar,
      settings_json, created_at, last_login_at
    ) VALUES (?, ?, ?, ?, '{}', ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      discord_username = excluded.discord_username,
      discord_global_name = excluded.discord_global_name,
      discord_avatar = excluded.discord_avatar,
      last_login_at = excluded.last_login_at
  `);
  const userByDiscordId = db.prepare("SELECT * FROM public_user_accounts WHERE discord_id = ?");
  const deleteExpiredSessions = db.prepare("DELETE FROM public_user_sessions WHERE expires_at <= ?");
  const userBySession = db.prepare(`
    SELECT account.*
    FROM public_user_sessions AS session
    JOIN public_user_accounts AS account ON account.id = session.user_id
    WHERE session.token_hash = ? AND session.expires_at > ? AND account.status = 'active'
  `);
  const currentLegalAcceptance = db.prepare(`
    SELECT * FROM public_user_legal_acceptances
    WHERE user_id = ?
    ORDER BY accepted_at DESC, id DESC
    LIMIT 1
  `);

  return Object.freeze({
    upsertAccount(profile, loggedInAt) {
      upsertAccountStatement.run(
        String(profile.discordId),
        String(profile.username ?? ""),
        String(profile.globalName ?? ""),
        String(profile.avatar ?? ""),
        loggedInAt,
        loggedInAt,
      );
      return userByDiscordId.get(String(profile.discordId));
    },
    userByDiscordId(discordId) {
      return userByDiscordId.get(String(discordId)) ?? null;
    },
    insertSession({ tokenHash, userId, expiresAt, createdAt }) {
      db.prepare(`
        INSERT INTO public_user_sessions (token_hash, user_id, expires_at, created_at, reauthenticated_at)
        VALUES (?, ?, ?, ?, NULL)
      `).run(tokenHash, userId, expiresAt, createdAt);
    },
    sessionUser(tokenHash, now) {
      deleteExpiredSessions.run(now);
      return userBySession.get(tokenHash, now) ?? null;
    },
    sessionByToken(tokenHash, userId) {
      return db.prepare("SELECT * FROM public_user_sessions WHERE token_hash = ? AND user_id = ?").get(tokenHash, userId) ?? null;
    },
    markSessionReauthenticated(tokenHash, userId, reauthenticatedAt) {
      return db.prepare(`
        UPDATE public_user_sessions SET reauthenticated_at = ?
        WHERE token_hash = ? AND user_id = ?
      `).run(reauthenticatedAt, tokenHash, userId);
    },
    deleteSession(tokenHash) {
      return db.prepare("DELETE FROM public_user_sessions WHERE token_hash = ?").run(tokenHash);
    },
    deleteSessionsForUser(userId) {
      return db.prepare("DELETE FROM public_user_sessions WHERE user_id = ?").run(userId);
    },
    acceptLegal({ userId, version, termsDigest, privacyDigest, acceptedAt, source }) {
      return db.prepare(`
        INSERT OR IGNORE INTO public_user_legal_acceptances (
          user_id, legal_version, terms_digest, privacy_digest,
          age_confirmed, accepted_at, source
        ) VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(userId, version, termsDigest, privacyDigest, acceptedAt, source);
    },
    currentLegalAcceptance(userId) {
      return currentLegalAcceptance.get(userId) ?? null;
    },
    exportAccount(userId, { legalVersion, exportedAt }) {
      const account = db.prepare("SELECT * FROM public_user_accounts WHERE id = ?").get(userId);
      if (!account) throw new Error("Public user account not found");
      const legalAcceptances = db.prepare(`
        SELECT legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source
        FROM public_user_legal_acceptances
        WHERE user_id = ? ORDER BY accepted_at DESC, id DESC
      `).all(userId).map(legalAcceptanceView);
      const sessions = db.prepare(`
        SELECT created_at, expires_at, reauthenticated_at
        FROM public_user_sessions
        WHERE user_id = ? ORDER BY created_at DESC
      `).all(userId).map((session) => ({
        createdAt: String(session.created_at),
        expiresAt: String(session.expires_at),
        reauthenticatedAt: session.reauthenticated_at ? String(session.reauthenticated_at) : null,
      }));
      const ownedPlans = db.prepare(`
        SELECT * FROM public_craft_plans WHERE owner_user_id = ? ORDER BY created_at, id
      `).all(userId).map((plan) => planExportView(plan, { includeDocument: true }));
      const memberships = db.prepare(`
        SELECT plan.*, member.role, member.created_at AS member_created_at, member.updated_at AS member_updated_at
        FROM public_craft_plan_members AS member
        JOIN public_craft_plans AS plan ON plan.id = member.plan_id
        WHERE member.user_id = ? ORDER BY member.created_at, plan.id
      `).all(userId).map((row) => ({
        planId: String(row.id),
        title: String(row.title),
        claimId: String(row.claim_id),
        status: String(row.status),
        role: String(row.role),
        createdAt: String(row.member_created_at),
        updatedAt: String(row.member_updated_at),
      }));
      const invites = db.prepare(`
        SELECT invite.* FROM public_craft_plan_invites AS invite
        JOIN public_craft_plans AS plan ON plan.id = invite.plan_id
        WHERE plan.owner_user_id = ? OR invite.created_by_user_id = ? OR invite.accepted_by_user_id = ?
        ORDER BY invite.created_at, invite.id
      `).all(userId, userId, userId).map((invite) => ({
        id: String(invite.id),
        planId: String(invite.plan_id),
        role: String(invite.role),
        status: invite.revoked_at ? "revoked" : invite.accepted_at ? "accepted" : String(invite.expires_at) <= exportedAt ? "expired" : "pending",
        expiresAt: String(invite.expires_at),
        createdAt: String(invite.created_at),
        acceptedAt: invite.accepted_at ? String(invite.accepted_at) : null,
        revokedAt: invite.revoked_at ? String(invite.revoked_at) : null,
      }));
      const shareLinks = db.prepare(`
        SELECT link.* FROM public_craft_plan_share_links AS link
        JOIN public_craft_plans AS plan ON plan.id = link.plan_id
        WHERE plan.owner_user_id = ? OR link.created_by_user_id = ?
        ORDER BY link.created_at, link.id
      `).all(userId, userId).map((link) => ({
        id: String(link.id),
        planId: String(link.plan_id),
        label: String(link.label),
        status: link.revoked_at ? "revoked" : "active",
        createdAt: String(link.created_at),
        revokedAt: link.revoked_at ? String(link.revoked_at) : null,
      }));
      const events = db.prepare(`
        SELECT event.* FROM public_craft_plan_events AS event
        WHERE event.plan_id IN (
          SELECT id FROM public_craft_plans WHERE owner_user_id = ?
          UNION SELECT plan_id FROM public_craft_plan_members WHERE user_id = ?
        )
        ORDER BY event.created_at, event.id
      `).all(userId, userId).map((event) => ({
        id: Number(event.id),
        planId: String(event.plan_id),
        type: String(event.event_type),
        createdAt: String(event.created_at),
        actor: event.actor_user_id == null
          ? event.actor_deleted_marker ? { relationship: "deleted" } : { relationship: "system" }
          : { relationship: Number(event.actor_user_id) === Number(userId) ? "self" : "other" },
        payload: exportEventPayload(event.payload_json),
      }));
      return {
        exportedAt,
        legalVersion,
        account: publicAccountView(account),
        settings: safeJson(account.settings_json),
        legalAcceptances,
        sessions,
        collaboration: { ownedPlans, memberships, invites, shareLinks, events },
      };
    },
  });
}
