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

export function relayEmpireMembershipObservation(currentData, claimId) {
  const data = currentData && typeof currentData === "object" && !Array.isArray(currentData)
    ? currentData
    : {};
  const primaryRegionId = text(data.primaryRegionId);
  const regions = Array.isArray(data.regions) ? data.regions : [];
  const primaryLoaded = primaryRegionId
    && regions.some((region) => text(region?.regionId) === primaryRegionId);
  if (!primaryLoaded) return { state: "waiting", primaryRegionId };
  const settlements = Array.isArray(data.settlements) ? data.settlements : [];
  const settlement = settlements.find((row) => text(row?.claimEntityId) === text(claimId));
  const empireId = text(settlement?.empireEntityId);
  if (!settlement || !empireId) return { state: "none", primaryRegionId };
  const regionId = text(settlement.regionId);
  const empires = Array.isArray(data.empires) ? data.empires : [];
  const empire = empires.find((row) => (
    text(row?.regionId) === regionId && text(row?.entityId) === empireId
  ));
  if (!empire) throw new Error("Relay Empire generation is missing the monitored claim's empire row");
  const members = (Array.isArray(data.members) ? data.members : []).filter((row) => (
    text(row?.regionId) === regionId && text(row?.empireEntityId) === empireId
  ));
  return {
    state: "roster",
    primaryRegionId,
    regionId,
    roster: normalizeEmpireMembershipRoster({ empire, members }, empireId),
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
    endSession: db.prepare(`
      UPDATE empire_membership_tracking
      SET tracking_ended_at = ?,
          updated_at = ?
      WHERE id = ?
        AND tracking_ended_at IS NULL
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
    markFirstMissing: db.prepare(`
      UPDATE empire_membership_periods
      SET first_missing_at = ?,
          missing_checks = 1,
          updated_at = ?
      WHERE id = ?
    `),
    confirmDeparture: db.prepare(`
      UPDATE empire_membership_periods
      SET observed_left_at = ?,
          departure_confirmed_at = ?,
          period_ended_at = ?,
          end_reason = 'departure',
          updated_at = ?
      WHERE id = ?
    `),
    endOpenPeriods: db.prepare(`
      UPDATE empire_membership_periods
      SET period_ended_at = ?,
          end_reason = 'tracking_ended',
          observed_left_at = NULL,
          departure_confirmed_at = NULL,
          updated_at = ?
      WHERE tracking_session_id = ?
        AND period_ended_at IS NULL
    `),
    previousPeriod: db.prepare(`
      SELECT id
      FROM empire_membership_periods
      WHERE empire_id = ?
        AND player_entity_id = ?
      LIMIT 1
    `),
    latestCleanup: db.prepare(`
      SELECT MAX(last_cleanup_at) AS last_cleanup_at
      FROM empire_membership_tracking
    `),
    pruneEndedPeriods: db.prepare(`
      DELETE FROM empire_membership_periods
      WHERE period_ended_at IS NOT NULL
        AND period_ended_at < ?
    `),
    markCleanup: db.prepare(`
      UPDATE empire_membership_tracking
      SET last_cleanup_at = ?,
          updated_at = ?
      WHERE id = ?
    `),
    currentPeriods: db.prepare(`
      SELECT *
      FROM empire_membership_periods
      WHERE tracking_session_id = ?
        AND period_ended_at IS NULL
    `),
    departedPeriods: db.prepare(`
      SELECT *
      FROM empire_membership_periods
      WHERE empire_id = ?
        AND end_reason = 'departure'
        AND observed_left_at IS NOT NULL
      ORDER BY observed_left_at DESC, id DESC
    `),
  };

  function cleanupIfDue(sessionId, observedAt) {
    const lastCleanupAt = statements.latestCleanup.get()?.last_cleanup_at;
    const observedMs = Date.parse(observedAt);
    const cleanupIntervalMs = EMPIRE_MEMBERSHIP_CLEANUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    if (
      lastCleanupAt &&
      Number.isFinite(observedMs) &&
      observedMs - Date.parse(lastCleanupAt) < cleanupIntervalMs
    ) {
      return 0;
    }
    const cutoff = new Date(
      observedMs - EMPIRE_MEMBERSHIP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const pruned = Number(statements.pruneEndedPeriods.run(cutoff).changes);
    statements.markCleanup.run(observedAt, observedAt, sessionId);
    return pruned;
  }

  function endSession(sessionId, observedAt) {
    const endedPeriods = Number(statements.endOpenPeriods.run(observedAt, observedAt, sessionId).changes);
    statements.endSession.run(observedAt, observedAt, sessionId);
    return endedPeriods;
  }

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
    const pruned = cleanupIfDue(sessionId, observedAt);
    return {
      sessionId,
      initialRoster: true,
      created: members.length,
      updated: 0,
      suspected: 0,
      closed: 0,
      pruned,
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
        endSession(activeSession.id, observedAt);
        return createBaseline({ empireId, empireName, members, observedAt });
      }

      const membersById = new Map(members.map((member) => [member.playerEntityId, member]));
      let updated = 0;
      let suspected = 0;
      let closed = 0;
      let created = 0;
      for (const period of statements.openPeriods.all(activeSession.id)) {
        const member = membersById.get(period.player_entity_id);
        if (member) {
          statements.markSeen.run(member.playerName, observedAt, observedAt, period.id);
          membersById.delete(period.player_entity_id);
          updated += 1;
          continue;
        }
        if (Number(period.missing_checks) < 1) {
          statements.markFirstMissing.run(observedAt, observedAt, period.id);
          suspected += 1;
          continue;
        }
        const leftAt = period.first_missing_at || observedAt;
        statements.confirmDeparture.run(leftAt, observedAt, leftAt, observedAt, period.id);
        closed += 1;
      }

      for (const member of membersById.values()) {
        const rejoin = statements.previousPeriod.get(empireId, member.playerEntityId) ? 1 : 0;
        statements.insertPeriod.run(
          activeSession.id,
          empireId,
          member.playerEntityId,
          member.playerName,
          observedAt,
          observedAt,
          observedAt,
          0,
          rejoin,
          observedAt,
          observedAt,
        );
        created += 1;
      }
      statements.markSessionComplete.run(empireName, observedAt, observedAt, activeSession.id);
      const pruned = cleanupIfDue(activeSession.id, observedAt);

      return {
        sessionId: activeSession.id,
        initialRoster: false,
        created,
        updated,
        suspected,
        closed,
        pruned,
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
    stopTracking({ observedAt }) {
      return transaction(db, () => {
        const activeSession = statements.activeSession.get();
        if (!activeSession) return { stopped: false, endedPeriods: 0 };
        return {
          stopped: true,
          endedPeriods: endSession(activeSession.id, observedAt),
        };
      });
    },
    adminView({ now }) {
      const activeSession = statements.activeSession.get();
      if (!activeSession) {
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
      }

      const currentRows = statements.currentPeriods.all(activeSession.id);
      const currentIds = new Set(currentRows.map((row) => row.player_entity_id));
      const currentMembers = currentRows
        .map((row) => ({
          id: Number(row.id),
          playerEntityId: row.player_entity_id,
          playerName: row.player_name,
          membershipStatus: row.initial_roster ? "initial" : row.rejoin ? "rejoined" : "joined",
          observedJoinedAt: row.observed_joined_at,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
        }))
        .sort((a, b) => {
          if (a.observedJoinedAt && b.observedJoinedAt) {
            return b.observedJoinedAt.localeCompare(a.observedJoinedAt) || a.playerName.localeCompare(b.playerName);
          }
          if (a.observedJoinedAt) return -1;
          if (b.observedJoinedAt) return 1;
          return a.playerName.localeCompare(b.playerName);
        });

      const latestDepartures = new Map();
      for (const row of statements.departedPeriods.all(activeSession.empire_id)) {
        if (currentIds.has(row.player_entity_id) || latestDepartures.has(row.player_entity_id)) continue;
        latestDepartures.set(row.player_entity_id, {
          id: Number(row.id),
          playerEntityId: row.player_entity_id,
          playerName: row.player_name,
          observedLeftAt: row.observed_left_at,
          departureConfirmedAt: row.departure_confirmed_at,
          previousStatus: row.rejoin ? "rejoined" : "joined",
        });
      }
      const departedMembers = [...latestDepartures.values()];
      const thirtyDaysAgo = new Date(Date.parse(now) - 30 * 24 * 60 * 60 * 1000).toISOString();

      return {
        tracking: {
          sessionId: Number(activeSession.id),
          empireId: activeSession.empire_id,
          empireName: activeSession.empire_name,
          trackingStartedAt: activeSession.tracking_started_at,
          lastSuccessAt: activeSession.last_success_at,
        },
        summary: {
          currentMembers: currentMembers.length,
          joinedLast30Days: currentMembers.filter(
            (member) =>
              member.membershipStatus === "joined" &&
              member.observedJoinedAt &&
              member.observedJoinedAt >= thirtyDaysAgo,
          ).length,
          departedLast30Days: departedMembers.filter(
            (member) => member.observedLeftAt >= thirtyDaysAgo,
          ).length,
          rejoinsLast30Days: currentMembers.filter(
            (member) =>
              member.membershipStatus === "rejoined" &&
              member.observedJoinedAt &&
              member.observedJoinedAt >= thirtyDaysAgo,
          ).length,
        },
        currentMembers,
        departedMembers,
        retentionDays: EMPIRE_MEMBERSHIP_RETENTION_DAYS,
        generatedAt: now,
      };
    },
  };
}
