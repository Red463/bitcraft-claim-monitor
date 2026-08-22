function decimalInteger(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function instant(value, label) {
  const normalized = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(normalized.getTime())) {
    throw new TypeError(`${label} must be a valid instant`);
  }
  return normalized;
}

function transitionPayload(row) {
  const payload = row?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Provider market transition payload must be an object");
  }
  if (payload.version !== 1) {
    throw new TypeError("Only provider market transition payload version 1 is supported");
  }
  const claimId = decimalInteger(payload.claimId, "Provider market transition claim id");
  if (claimId !== row.claimId) {
    throw new TypeError("Provider market transition payload escaped its claimed settlement");
  }
  const generation = Number(payload.generation);
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new TypeError("Provider market transition generation must be a safe non-negative integer");
  }
  const expectedKey = `claim-market:${claimId}:market:${generation}`;
  if (row.transitionKey !== expectedKey || row.domain !== "market") {
    throw new TypeError("Provider market transition identity is invalid");
  }
  const observedAt = instant(payload.observedAt, "Provider market transition observedAt")
    .toISOString();
  if (observedAt !== row.observedAt) {
    throw new TypeError("Provider market transition observedAt does not match its durable row");
  }
  if (!Array.isArray(payload.events)) {
    throw new TypeError("Provider market transition events must be an array");
  }
  return { claimId, generation, observedAt, events: payload.events };
}

function retryDelay(retryPolicy, attempt) {
  const proposed = typeof retryPolicy === "function"
    ? retryPolicy(attempt)
    : 5_000 * (2 ** Math.max(0, attempt - 1));
  if (!Number.isFinite(proposed) || proposed < 0) {
    throw new TypeError("Provider market transition retry delay must be non-negative");
  }
  return Math.min(5 * 60_000, Math.floor(proposed));
}

export function createMarketTransitionDispatcher({
  repository,
  writer,
  workerId,
  leaseMs = 60_000,
  now = () => new Date(),
  retryPolicy,
}) {
  if (!repository?.claimPendingTransition
    || !repository?.withImmediateTransaction
    || !repository?.ackTransition
    || !repository?.recordTransitionError
    || !repository?.recoverExpiredTransitionLeases) {
    throw new TypeError("Market transition dispatcher requires a leased transition repository");
  }
  if (!writer?.applyDerived) {
    throw new TypeError("Market transition dispatcher requires a derived transition writer");
  }
  const normalizedWorkerId = String(workerId ?? "").trim();
  if (!normalizedWorkerId) throw new TypeError("Market transition dispatcher worker id is required");
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new TypeError("Market transition dispatcher lease duration must be positive");
  }

  return {
    async drain({ claimId, limit = 25 }) {
      const normalizedClaimId = decimalInteger(claimId, "Market transition drain claim id");
      const boundedLimit = Math.max(0, Math.min(25, Math.floor(Number(limit) || 0)));
      let claimed = 0;
      let processed = 0;
      let failed = 0;
      repository.recoverExpiredTransitionLeases(instant(now(), "Market transition recovery time").toISOString());
      for (let index = 0; index < boundedLimit; index += 1) {
        const claimedAt = instant(now(), "Market transition claim time");
        const row = repository.claimPendingTransition({
          claimId: normalizedClaimId,
          domain: "market",
          workerId: normalizedWorkerId,
          leaseMs,
          at: claimedAt.toISOString(),
        });
        if (!row) break;
        claimed += 1;
        try {
          const payload = transitionPayload(row);
          repository.withImmediateTransaction(() => {
            writer.applyDerived({
              claimId: payload.claimId,
              events: payload.events,
              observedAt: payload.observedAt,
              manageTransaction: false,
            });
            const acknowledged = repository.ackTransition({
              transitionKey: row.transitionKey,
              leaseToken: row.leaseToken,
            });
            if (!acknowledged) {
              throw new Error("Provider market transition lease was lost before acknowledgement");
            }
          });
          processed += 1;
        } catch (error) {
          failed += 1;
          const failedAt = instant(now(), "Market transition failure time");
          const attempt = row.attempts + 1;
          const retryAt = new Date(
            failedAt.getTime() + retryDelay(retryPolicy, attempt),
          ).toISOString();
          repository.recordTransitionError({
            transitionKey: row.transitionKey,
            leaseToken: row.leaseToken,
            error: error instanceof Error ? error.message : String(error),
            retryAt,
          });
        }
      }
      return { claimed, processed, failed };
    },
  };
}
