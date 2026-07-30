const REQUIRED_DOMAINS = ["claim", "members", "inventories", "market"];
const RELEVANT_DOMAINS = new Set(REQUIRED_DOMAINS);
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

class SettlementSourceValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SettlementSourceValidationError";
  }
}

function sourceValidationError(message) {
  return new SettlementSourceValidationError(message);
}

function normalizedClaimId(value) {
  return String(value ?? "").trim();
}

function record(value) {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function exactInteger(value, label) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+$/.test(text)) {
    throw sourceValidationError(`Relay settlement ${label} is malformed`);
  }
  return BigInt(text).toString();
}

function validGeneration(value) {
  const generation = Number(value);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : null;
}

function safelyNotify(callback, ...args) {
  try {
    return callback?.(...args);
  } catch {
    return undefined;
  }
}

function readCompleteSettlement(readDomainSnapshot, claimId, event) {
  const snapshots = {};
  for (const domain of REQUIRED_DOMAINS) {
    const snapshot = readDomainSnapshot(claimId, domain);
    if (!snapshot?.data) {
      throw sourceValidationError(`Relay settlement snapshot is unavailable for ${domain}`);
    }
    const generation = validGeneration(snapshot.generation);
    if (generation == null) {
      throw sourceValidationError(`Relay settlement ${domain} snapshot generation is malformed`);
    }
    if (
      snapshot.confidence === "partial"
      || snapshot.confidence === "unknown"
      || (Array.isArray(snapshot.warnings) && snapshot.warnings.length > 0)
    ) {
      throw sourceValidationError(`Relay settlement ${domain} snapshot is incomplete`);
    }
    if (event.changedDomains.includes(domain) && generation < event.generation) {
      throw sourceValidationError(`Relay settlement ${domain} snapshot is stale`);
    }
    snapshots[domain] = snapshot;
  }
  return snapshots;
}

function composeSummary(snapshots, claimId) {
  const claim = record(snapshots.claim.data);
  if (!claim) throw sourceValidationError("Relay settlement claim snapshot is malformed");
  if (normalizedClaimId(claim.entityId) !== claimId) {
    throw sourceValidationError("Relay settlement claim escaped the configured claim");
  }

  const members = snapshots.members.data;
  if (!Array.isArray(members)) {
    throw sourceValidationError("Relay settlement members snapshot is malformed");
  }
  if (members.some((value) => normalizedClaimId(record(value)?.claimEntityId) !== claimId)) {
    throw sourceValidationError("Relay settlement members escaped the configured claim");
  }

  const inventories = record(snapshots.inventories.data);
  const inventoryClaim = record(inventories?.claim);
  if (!inventories || !inventoryClaim || !Array.isArray(inventories.dimensions) || !Array.isArray(inventories.buildings)) {
    throw sourceValidationError("Relay settlement inventories snapshot is malformed");
  }
  if (normalizedClaimId(inventoryClaim.entityId) !== claimId) {
    throw sourceValidationError("Relay settlement inventories escaped the configured claim");
  }

  const market = record(snapshots.market.data);
  if (!market || !Array.isArray(market.listings) || !Array.isArray(market.marketplaces)) {
    throw sourceValidationError("Relay settlement market snapshot is malformed");
  }
  if (normalizedClaimId(market.claimId) !== claimId) {
    throw sourceValidationError("Relay settlement market escaped the configured claim");
  }

  return {
    claimId,
    supplies: exactInteger(claim.supplies, "claim supplies"),
    treasury: exactInteger(claim.treasury, "claim treasury"),
    membersCount: members.length,
    buildingsCount: null,
    marketCount: market.listings.length,
  };
}

function generationVector(snapshots) {
  return REQUIRED_DOMAINS
    .map((domain) => `${domain}:${snapshots[domain].generation}`)
    .join("|");
}

function summaryFingerprint(summary) {
  return JSON.stringify([
    summary.claimId,
    summary.supplies,
    summary.treasury,
    summary.membersCount,
    summary.buildingsCount,
    summary.marketCount,
  ]);
}

export function createRelaySettlementTransitionCoordinator({
  configuredClaimId,
  readDomainSnapshot,
  applySettlementTransition,
  onAttempt,
  onSuccess,
  onFailure,
  onRecovery,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
}) {
  let pendingEvent = null;
  let running = false;
  let scheduled = false;
  let retryEvent = null;
  let retryTimer = null;
  let retryAttempt = 0;
  let retryClaimId = null;
  const lastAppliedFingerprintByClaim = new Map();
  const failedClaimIds = new Set();
  const idleWaiters = new Set();
  const boundedRetryDelays = Array.isArray(retryDelaysMs)
    ? retryDelaysMs
      .map((delay) => Number(delay))
      .filter((delay) => Number.isFinite(delay) && delay >= 0)
    : DEFAULT_RETRY_DELAYS_MS;

  function resolveIdle() {
    if (running || scheduled || pendingEvent || retryEvent || retryTimer) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  }

  function cancelRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    retryEvent = null;
    retryAttempt = 0;
    retryClaimId = null;
  }

  function scheduleRetry(event) {
    const eventClaimId = normalizedClaimId(event.claimId);
    if (retryClaimId !== eventClaimId) {
      retryAttempt = 0;
      retryClaimId = eventClaimId;
    }
    if (retryAttempt >= boundedRetryDelays.length) {
      retryAttempt = 0;
      retryClaimId = null;
      retryEvent = null;
      return;
    }
    const delay = boundedRetryDelays[retryAttempt];
    retryAttempt += 1;
    retryEvent = event;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      const eventToRetry = retryEvent;
      retryEvent = null;
      if (
        eventToRetry
        && normalizedClaimId(configuredClaimId()) === normalizedClaimId(eventToRetry.claimId)
      ) {
        const pendingGeneration = validGeneration(pendingEvent?.generation);
        if (pendingGeneration == null || eventToRetry.generation >= pendingGeneration) {
          pendingEvent = eventToRetry;
        }
        schedule();
      } else {
        retryAttempt = 0;
        retryClaimId = null;
        resolveIdle();
      }
    }, delay);
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

        let attempt;
        try {
          const snapshots = readCompleteSettlement(readDomainSnapshot, claimId, event);
          const summary = composeSummary(snapshots, claimId);
          const fingerprint = summaryFingerprint(summary);
          const context = {
            event,
            snapshots,
            generationVector: generationVector(snapshots),
            fingerprint,
          };
          if (lastAppliedFingerprintByClaim.get(claimId) === fingerprint) {
            if (failedClaimIds.delete(claimId)) {
              retryAttempt = 0;
              retryClaimId = null;
              safelyNotify(onRecovery, event, context);
            }
            continue;
          }
          attempt = safelyNotify(onAttempt, event, context);
          await applySettlementTransition(claimId, summary, context);
          lastAppliedFingerprintByClaim.set(claimId, fingerprint);
          failedClaimIds.delete(claimId);
          retryAttempt = 0;
          retryClaimId = null;
          safelyNotify(onSuccess, event, context, attempt);
        } catch (error) {
          failedClaimIds.add(claimId);
          safelyNotify(onFailure, error, event, attempt);
          const pendingGeneration = validGeneration(pendingEvent?.generation);
          const pendingClaimId = normalizedClaimId(pendingEvent?.claimId);
          const configuredClaimIdAtFailure = normalizedClaimId(configuredClaimId());
          if (
            !(error instanceof SettlementSourceValidationError)
            && configuredClaimIdAtFailure === claimId
            && (!pendingEvent || pendingClaimId === claimId)
            && (pendingGeneration == null || pendingGeneration < event.generation)
          ) {
            scheduleRetry(event);
          } else {
            retryAttempt = 0;
            retryClaimId = null;
          }
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
    setImmediate(() => {
      void applyPendingEvents();
    });
  }

  return {
    onCommit(event) {
      const claimId = normalizedClaimId(event?.claimId);
      if (!claimId || claimId !== normalizedClaimId(configuredClaimId())) return false;
      const changedDomains = Array.isArray(event?.changedDomains)
        ? event.changedDomains.filter((domain) => RELEVANT_DOMAINS.has(domain))
        : [];
      if (!changedDomains.length) return false;
      const generation = validGeneration(event.generation);
      if (generation == null) return false;
      const normalizedEvent = { ...event, claimId, generation, changedDomains };
      const waitingRetryClaimId = normalizedClaimId(retryEvent?.claimId);
      const retryGeneration = validGeneration(retryEvent?.generation);
      if (
        retryClaimId
        && (
          retryClaimId !== claimId
          || (
            waitingRetryClaimId === claimId
            && retryGeneration != null
            && generation >= retryGeneration
          )
        )
      ) {
        cancelRetry();
      }
      const pendingClaimId = normalizedClaimId(pendingEvent?.claimId);
      if (
        !pendingEvent
        || pendingClaimId !== claimId
        || generation >= validGeneration(pendingEvent.generation)
      ) {
        pendingEvent = normalizedEvent;
      }
      schedule();
      return true;
    },
    whenIdle() {
      if (!running && !scheduled && !pendingEvent && !retryEvent && !retryTimer) {
        return Promise.resolve();
      }
      return new Promise((resolve) => idleWaiters.add(resolve));
    },
  };
}
