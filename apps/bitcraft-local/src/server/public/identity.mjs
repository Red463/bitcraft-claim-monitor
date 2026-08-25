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
    WHERE session.token_hash = ? AND session.expires_at > ?
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
      return {
        exportedAt,
        legalVersion,
        account: publicAccountView(account),
        settings: safeJson(account.settings_json),
        legalAcceptances,
        sessions,
      };
    },
  });
}
