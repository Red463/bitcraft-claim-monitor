const SENSITIVE_KEY = /token|secret|authorization|cookie|(^|_)ip($|_)|hmac/i;

function safeJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .map(([key, child]) => [key, redact(child)]));
}

function containsExactSubject(value, { userId, discordId }) {
  if (Array.isArray(value)) return value.some((entry) => containsExactSubject(entry, { userId, discordId }));
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => containsExactSubject(entry, { userId, discordId }));
  }
  return String(value ?? "") === String(discordId) || String(value ?? "") === String(userId);
}

function subjectRows(rows, context, jsonColumn) {
  return rows.flatMap((row) => {
    const details = safeJson(row[jsonColumn], null);
    if (!details || !containsExactSubject(details, context)) return [];
    return [redact({ ...row, [jsonColumn]: details })];
  });
}

function mapAccount(row) {
  return {
    id: Number(row.id),
    discordId: String(row.discord_id),
    discordUsername: String(row.discord_username ?? ""),
    discordGlobalName: String(row.discord_global_name ?? ""),
    discordAvatar: String(row.discord_avatar ?? ""),
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

function mapCharacter(row) {
  return {
    characterPlayerId: String(row.character_player_id ?? ""),
    characterName: String(row.character_name ?? ""),
    characterStatus: String(row.character_status ?? "unlinked"),
  };
}

export function createUserDataExport(db, {
  userId,
  discordId,
  legalVersion,
  now = () => new Date(),
} = {}) {
  const accountRow = db.prepare("SELECT * FROM user_accounts WHERE id = ? AND discord_id = ?").get(userId, discordId);
  if (!accountRow) throw new Error("User account not found");
  const context = { userId, discordId };
  const legalAcceptances = db.prepare(`
    SELECT legal_version, terms_digest, privacy_digest, age_confirmed, accepted_at, source
    FROM user_legal_acceptances
    WHERE user_id = ?
    ORDER BY accepted_at DESC, id DESC
  `).all(userId);
  const watches = db.prepare("SELECT * FROM market_deal_watches WHERE user_id = ? ORDER BY created_at DESC, id DESC").all(userId);
  const alerts = db.prepare("SELECT * FROM market_deal_alerts WHERE user_id = ? ORDER BY created_at DESC, id DESC").all(userId);
  const craftWatches = db.prepare("SELECT * FROM discord_craft_watches WHERE user_id = ? ORDER BY updated_at DESC, id DESC").all(discordId);
  const votes = db.prepare("SELECT * FROM discord_component_votes WHERE user_id = ? ORDER BY updated_at DESC").all(discordId);
  const moderation = [
    ...db.prepare("SELECT * FROM discord_mod_cases WHERE user_id = ? ORDER BY occurred_at DESC, id DESC").all(discordId).map((row) => ({ type: "case", ...row, details_json: safeJson(row.details_json, {}) })),
    ...db.prepare("SELECT * FROM discord_warnings WHERE user_id = ? ORDER BY created_at DESC, id DESC").all(discordId).map((row) => ({ type: "warning", ...row })),
    ...db.prepare("SELECT * FROM discord_mod_notes WHERE user_id = ? ORDER BY created_at DESC, id DESC").all(discordId).map((row) => ({ type: "note", ...row })),
    ...db.prepare("SELECT * FROM discord_temp_bans WHERE user_id = ? ORDER BY created_at DESC").all(discordId).map((row) => ({ type: "temporary-ban", ...row })),
  ];
  const adminActions = subjectRows(
    db.prepare("SELECT id, username, action, details_json, occurred_at FROM admin_audit_log ORDER BY occurred_at DESC, id DESC").all(),
    context,
    "details_json",
  );
  const deliveries = subjectRows(
    db.prepare("SELECT id, event_type, status, summary, channel_key, reason, error, metadata_json, response_json, occurred_at FROM discord_delivery_log ORDER BY occurred_at DESC, id DESC").all(),
    context,
    "metadata_json",
  ).map((row) => redact({ ...row, response_json: safeJson(row.response_json, null) }));

  return redact({
    exportedAt: now().toISOString(),
    legalVersion: String(legalVersion),
    account: mapAccount(accountRow),
    characterLink: mapCharacter(accountRow),
    legalAcceptances,
    settings: safeJson(accountRow.settings_json, {}),
    market: { watches, alerts },
    discord: { craftWatches, votes, moderation },
    activity: { adminActions, deliveries },
  });
}

export function unlinkUserCharacter(db, { userId } = {}) {
  const result = db.prepare(`
    UPDATE user_accounts
    SET character_player_id = '', character_name = '', character_status = 'unlinked'
    WHERE id = ?
      AND (
        COALESCE(character_player_id, '') <> ''
        OR COALESCE(character_name, '') <> ''
        OR character_status <> 'unlinked'
      )
  `).run(userId);
  return { userAccounts: Number(result.changes) };
}

export function clearUserSettings(db, { userId } = {}) {
  const result = db.prepare("UPDATE user_accounts SET settings_json = '{}' WHERE id = ? AND settings_json <> '{}'").run(userId);
  return { userAccounts: Number(result.changes) };
}

export function clearUserMarketData(db, { userId } = {}) {
  try {
    db.exec("BEGIN IMMEDIATE");
    const alerts = db.prepare("DELETE FROM market_deal_alerts WHERE user_id = ?").run(userId);
    const watches = db.prepare("DELETE FROM market_deal_watches WHERE user_id = ?").run(userId);
    db.exec("COMMIT");
    return {
      marketDealAlerts: Number(alerts.changes),
      marketDealWatches: Number(watches.changes),
    };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

export function clearCurrentBrowserAnalytics(db, { visitorKey, sessionKey } = {}) {
  const visitor = String(visitorKey ?? "");
  const session = String(sessionKey ?? "");
  if (!visitor && !session) return { analyticsEvents: 0 };
  const result = visitor && session
    ? db.prepare("DELETE FROM analytics_events WHERE visitor_key = ? OR session_key = ?").run(visitor, session)
    : visitor
      ? db.prepare("DELETE FROM analytics_events WHERE visitor_key = ?").run(visitor)
      : db.prepare("DELETE FROM analytics_events WHERE session_key = ?").run(session);
  return { analyticsEvents: Number(result.changes) };
}
