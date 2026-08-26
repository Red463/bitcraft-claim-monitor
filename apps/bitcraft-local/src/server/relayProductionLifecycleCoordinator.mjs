function normalizedClaimId(value) {
  return String(value ?? "").trim();
}

function validCraftPayload(value) {
  return value != null
    && typeof value === "object"
    && !Array.isArray(value)
    && Array.isArray(value.craftResults)
    && value.craftResults.every((craft) => (
      craft != null
      && typeof craft === "object"
      && !Array.isArray(craft)
      && normalizedClaimId(craft.entityId ?? craft.id ?? craft.craftEntityId)
    ));
}

function validGeneration(value) {
  const generation = Number(value);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : null;
}

function safelyNotify(callback, ...args) {
  try {
    return callback?.(...args);
  } catch {
    // Status reporting must not break the serialized lifecycle queue.
    return undefined;
  }
}

export function createRelayProductionLifecycleCoordinator({
  configuredClaimId,
  readCraftSnapshot,
  enrichCrafts,
  applyProductionLifecycle,
  onAttempt,
  onSuccess,
  onFailure,
}) {
  let pendingEvent = null;
  let running = false;
  let scheduled = false;
  const lastAppliedGenerationByClaim = new Map();
  const idleWaiters = new Set();

  function resolveIdle() {
    if (running || scheduled || pendingEvent) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  }

  async function applyPendingEvents() {
    if (running) return;
    running = true;
    scheduled = false;
    try {
      while (pendingEvent) {
        const event = pendingEvent;
        pendingEvent = null;
        const claimId = normalizedClaimId(event.claimId);
        if (normalizedClaimId(configuredClaimId()) !== claimId) continue;
        const lastAppliedGeneration = lastAppliedGenerationByClaim.get(claimId) ?? -1;
        const eventGeneration = validGeneration(event.generation);
        if (eventGeneration != null && eventGeneration <= lastAppliedGeneration) continue;

        const attempt = safelyNotify(onAttempt, event);
        try {
          const snapshot = readCraftSnapshot(claimId);
          if (!snapshot?.data) throw new Error("Relay crafts snapshot is unavailable");
          if (!validCraftPayload(snapshot.data)) throw new Error("Relay crafts snapshot is malformed");
          const snapshotGeneration = validGeneration(snapshot.generation);
          if (snapshotGeneration == null || eventGeneration == null || snapshotGeneration < eventGeneration) {
            throw new Error("Relay crafts snapshot is stale");
          }
          if (snapshotGeneration <= lastAppliedGeneration) continue;

          const enriched = enrichCrafts(snapshot.data);
          await applyProductionLifecycle(claimId, enriched, { event, snapshot });
          lastAppliedGenerationByClaim.set(claimId, snapshotGeneration);
          safelyNotify(onSuccess, event, snapshot, attempt);
        } catch (error) {
          safelyNotify(onFailure, error, event, attempt);
        }
      }
    } finally {
      running = false;
      resolveIdle();
    }
  }

  function schedule() {
    if (scheduled || running) return;
    scheduled = true;
    queueMicrotask(() => {
      void applyPendingEvents();
    });
  }

  return {
    onCommit(event) {
      const claimId = normalizedClaimId(event?.claimId);
      if (!claimId || claimId !== normalizedClaimId(configuredClaimId())) return false;
      if (!Array.isArray(event?.changedDomains) || !event.changedDomains.includes("crafts")) return false;
      const generation = validGeneration(event.generation);
      if (generation == null || generation <= (lastAppliedGenerationByClaim.get(claimId) ?? -1)) return false;
      const pendingClaimId = normalizedClaimId(pendingEvent?.claimId);
      if (
        !pendingEvent
        || pendingClaimId !== claimId
        || generation >= validGeneration(pendingEvent.generation)
      ) {
        pendingEvent = event;
      }
      schedule();
      return true;
    },
    whenIdle() {
      if (!running && !scheduled && !pendingEvent) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.add(resolve));
    },
  };
}
