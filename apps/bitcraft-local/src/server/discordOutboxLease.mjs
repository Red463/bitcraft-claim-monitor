import { randomUUID } from "node:crypto";

const EXPIRED_LEASE_ERROR = "Delivery lease expired before completion; retry may duplicate a Discord request that was already accepted";
const CANONICAL_UNKNOWN_OUTCOME_ERROR = "Canonical announcement delivery outcome is unknown; automatic retry is suppressed";

function timestamp(value, label) {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${label} must be a valid date`);
  return new Date(milliseconds).toISOString();
}

function leasedRow(row) {
  if (!row) return null;
  return {
    ...row,
    leaseToken: String(row.lease_token),
    lockedBy: String(row.locked_by),
    lockedAt: String(row.locked_at),
    leaseExpiresAt: String(row.lease_expires_at),
  };
}

function changed(result) {
  return Number(result.changes) === 1;
}

export function createDiscordOutboxLeaser(db, {
  workerId,
  leaseMs,
  now = () => new Date(),
}) {
  const lockedBy = String(workerId ?? "").trim();
  const leaseDurationMs = Number(leaseMs);
  if (!lockedBy) throw new TypeError("Discord outbox workerId is required");
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new TypeError("Discord outbox leaseMs must be a positive number");
  }
  if (typeof now !== "function") throw new TypeError("Discord outbox now must be a function");

  const selectEligible = db.prepare(`
    SELECT id
    FROM discord_notification_outbox
    WHERE status IN ('pending', 'failed')
      AND attempts < ?
      AND next_attempt_at <= ?
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `);
  const claimEligible = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'sending',
        attempts = attempts + 1,
        locked_at = ?,
        locked_by = ?,
        lease_token = ?,
        lease_expires_at = ?,
        updated_at = ?
    WHERE id = ?
      AND status IN ('pending', 'failed')
      AND attempts < ?
      AND next_attempt_at <= ?
  `);
  const selectClaimed = db.prepare("SELECT * FROM discord_notification_outbox WHERE id = ? AND lease_token = ? AND status = 'sending'");
  const completeSent = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'sent', sent_at = ?, skipped_at = NULL, failed_at = NULL,
        response_json = ?, last_error = NULL, locked_at = NULL,
        locked_by = NULL, lease_token = NULL, lease_expires_at = NULL,
        updated_at = ?
    WHERE id = ? AND lease_token = ? AND status = 'sending'
  `);
  const completeSkipped = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'skipped', skipped_at = ?, last_error = ?,
        locked_at = NULL, locked_by = NULL, lease_token = NULL,
        lease_expires_at = NULL, updated_at = ?
    WHERE id = ? AND lease_token = ? AND status = 'sending'
  `);
  const completeFailed = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'failed', next_attempt_at = ?, failed_at = ?, last_error = ?,
        locked_at = NULL, locked_by = NULL, lease_token = NULL,
        lease_expires_at = NULL, updated_at = ?
    WHERE id = ? AND lease_token = ? AND status = 'sending'
  `);
  const suppressExpiredCanonical = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'skipped', skipped_at = ?, last_error = ?,
        locked_at = NULL, locked_by = NULL, lease_token = NULL,
        lease_expires_at = NULL, updated_at = ?
    WHERE status = 'sending'
      AND event_type = 'canonical_cutover'
      AND (lease_token IS NULL OR lease_expires_at <= ?)
  `);
  const recoverExpired = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'failed', next_attempt_at = ?, failed_at = ?, last_error = ?,
        locked_at = NULL, locked_by = NULL, lease_token = NULL,
        lease_expires_at = NULL, updated_at = ?
    WHERE status = 'sending'
      AND event_type <> 'canonical_cutover'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= ?
  `);

  return {
    claimNext({ maxAttempts }) {
      const attemptLimit = Math.floor(Number(maxAttempts));
      if (!Number.isFinite(attemptLimit) || attemptLimit <= 0) {
        throw new TypeError("Discord outbox maxAttempts must be a positive integer");
      }
      const claimedAt = timestamp(now(), "Discord outbox claim time");
      const expiresAt = new Date(Date.parse(claimedAt) + leaseDurationMs).toISOString();
      const leaseToken = randomUUID();
      let transactionOpen = false;
      try {
        db.exec("BEGIN IMMEDIATE");
        transactionOpen = true;
        const eligible = selectEligible.get(attemptLimit, claimedAt);
        if (!eligible) {
          db.exec("COMMIT");
          transactionOpen = false;
          return null;
        }
        const result = claimEligible.run(
          claimedAt,
          lockedBy,
          leaseToken,
          expiresAt,
          claimedAt,
          eligible.id,
          attemptLimit,
          claimedAt,
        );
        const row = changed(result) ? selectClaimed.get(eligible.id, leaseToken) : null;
        db.exec("COMMIT");
        transactionOpen = false;
        return leasedRow(row);
      } catch (error) {
        if (transactionOpen) db.exec("ROLLBACK");
        throw error;
      }
    },

    markSent({ id, leaseToken, response, finishedAt }) {
      const completedAt = timestamp(finishedAt, "Discord outbox sent time");
      return changed(completeSent.run(
        completedAt,
        JSON.stringify(response ?? null),
        completedAt,
        id,
        String(leaseToken ?? ""),
      ));
    },

    markSkipped({ id, leaseToken, reason, finishedAt }) {
      const completedAt = timestamp(finishedAt, "Discord outbox skipped time");
      return changed(completeSkipped.run(
        completedAt,
        String(reason ?? "Notification skipped"),
        completedAt,
        id,
        String(leaseToken ?? ""),
      ));
    },

    markFailed({ id, leaseToken, error, retryAt, finishedAt }) {
      const completedAt = timestamp(finishedAt, "Discord outbox failed time");
      return changed(completeFailed.run(
        timestamp(retryAt, "Discord outbox retry time"),
        completedAt,
        String(error ?? "Discord delivery failed"),
        completedAt,
        id,
        String(leaseToken ?? ""),
      ));
    },

    recoverExpiredLeases(at) {
      const recoveredAt = timestamp(at, "Discord outbox recovery time");
      let transactionOpen = false;
      try {
        db.exec("BEGIN IMMEDIATE");
        transactionOpen = true;
        const canonicalSuppressed = Number(suppressExpiredCanonical.run(
          recoveredAt,
          CANONICAL_UNKNOWN_OUTCOME_ERROR,
          recoveredAt,
          recoveredAt,
        ).changes);
        const retryable = Number(recoverExpired.run(
          recoveredAt,
          recoveredAt,
          EXPIRED_LEASE_ERROR,
          recoveredAt,
          recoveredAt,
        ).changes);
        db.exec("COMMIT");
        transactionOpen = false;
        const recovered = canonicalSuppressed + retryable;
        return {
          recovered,
          retryable,
          canonicalSuppressed,
          duplicateRisk: recovered,
        };
      } catch (error) {
        if (transactionOpen) db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
