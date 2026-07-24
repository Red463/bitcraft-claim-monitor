export const EMPIRE_MEMBERSHIP_RETENTION_DAYS = 365;
export const EMPIRE_MEMBERSHIP_CLEANUP_INTERVAL_DAYS = 7;

function text(value) {
  return String(value ?? "").trim();
}

function transaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function normalizeEmpireMembershipRoster(payload, expectedEmpireId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Empire member roster response is invalid");
  }
  if (payload.partial === true || (Array.isArray(payload.errors) && payload.errors.length)) {
    throw new Error("Empire member roster response is partial");
  }
  if (!Array.isArray(payload.members)) {
    throw new Error("Empire member roster is missing");
  }
  if (payload.members.length === 0) {
    throw new Error("Empire member roster is unexpectedly empty");
  }

  const empire = payload.empire && typeof payload.empire === "object" ? payload.empire : {};
  const empireId = text(empire.entityId ?? empire.id ?? expectedEmpireId);
  if (!empireId || empireId !== text(expectedEmpireId)) {
    throw new Error("Empire member roster does not match the configured empire");
  }

  const members = new Map();
  for (const member of payload.members) {
    const playerEntityId = text(member?.entityId ?? member?.playerEntityId ?? member?.id);
    const playerName = text(member?.playerName ?? member?.username ?? member?.userName);
    if (!playerEntityId || !playerName) {
      throw new Error("Empire member roster contains an invalid member");
    }
    members.set(playerEntityId, { playerEntityId, playerName });
  }

  return {
    empireId,
    empireName: text(empire.name) || "Unknown empire",
    members: [...members.values()].sort((a, b) => a.playerEntityId.localeCompare(b.playerEntityId)),
  };
}

export function createEmpireMembershipRepository(db) {
  const statements = {
    activeSession: db.prepare(`
      SELECT *
      FROM empire_membership_tracking
      WHERE tracking_ended_at IS NULL
      LIMIT 1
    `),
    insertSession: db.prepare(`
      INSERT INTO empire_membership_tracking (
        empire_id,
        empire_name,
        tracking_started_at,
        last_success_at,
        initial_roster_complete,
        updated_at
      )
      VALUES (?, ?, ?, ?, 0, ?)
    `),
    markSessionComplete: db.prepare(`
      UPDATE empire_membership_tracking
      SET empire_name = ?,
          last_success_at = ?,
          initial_roster_complete = 1,
          updated_at = ?
      WHERE id = ?
    `),
    openPeriods: db.prepare(`
      SELECT *
      FROM empire_membership_periods
      WHERE tracking_session_id = ?
        AND period_ended_at IS NULL
      ORDER BY id
    `),
    insertPeriod: db.prepare(`
      INSERT INTO empire_membership_periods (
        tracking_session_id,
        empire_id,
        player_entity_id,
        player_name,
        observed_joined_at,
        first_seen_at,
        last_seen_at,
        initial_roster,
        rejoin,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    markSeen: db.prepare(`
      UPDATE empire_membership_periods
      SET player_name = ?,
          last_seen_at = ?,
          first_missing_at = NULL,
          missing_checks = 0,
          updated_at = ?
      WHERE id = ?
    `),
  };

  function createBaseline({ empireId, empireName, members, observedAt }) {
    const insert = statements.insertSession.run(empireId, empireName, observedAt, observedAt, observedAt);
    const sessionId = Number(insert.lastInsertRowid);
    for (const member of members) {
      statements.insertPeriod.run(
        sessionId,
        empireId,
        member.playerEntityId,
        member.playerName,
        null,
        observedAt,
        observedAt,
        1,
        0,
        observedAt,
        observedAt,
      );
    }
    statements.markSessionComplete.run(empireName, observedAt, observedAt, sessionId);
    return {
      sessionId,
      initialRoster: true,
      created: members.length,
      updated: 0,
      suspected: 0,
      closed: 0,
      pruned: 0,
      currentMembers: members.length,
    };
  }

  function syncRoster({ empireId, empireName, members, observedAt }) {
    return transaction(db, () => {
      const activeSession = statements.activeSession.get();
      if (!activeSession) {
        return createBaseline({ empireId, empireName, members, observedAt });
      }
      if (activeSession.empire_id !== empireId) {
        throw new Error("Cannot synchronize a different empire while tracking is active");
      }

      const membersById = new Map(members.map((member) => [member.playerEntityId, member]));
      let updated = 0;
      for (const period of statements.openPeriods.all(activeSession.id)) {
        const member = membersById.get(period.player_entity_id);
        if (!member) continue;
        statements.markSeen.run(member.playerName, observedAt, observedAt, period.id);
        updated += 1;
      }
      statements.markSessionComplete.run(empireName, observedAt, observedAt, activeSession.id);

      return {
        sessionId: activeSession.id,
        initialRoster: false,
        created: 0,
        updated,
        suspected: 0,
        closed: 0,
        pruned: 0,
        currentMembers: Number(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM empire_membership_periods WHERE tracking_session_id = ? AND period_ended_at IS NULL",
            )
            .get(activeSession.id).count,
        ),
      };
    });
  }

  return {
    syncRoster,
    stopTracking() {
      return { stopped: false, endedPeriods: 0 };
    },
    adminView({ now }) {
      return {
        tracking: null,
        summary: {
          currentMembers: 0,
          joinedLast30Days: 0,
          departedLast30Days: 0,
          rejoinsLast30Days: 0,
        },
        currentMembers: [],
        departedMembers: [],
        retentionDays: EMPIRE_MEMBERSHIP_RETENTION_DAYS,
        generatedAt: now,
      };
    },
  };
}
