const REQUIRED_DOMAINS = ["claim", "members", "inventories", "market"];
const RELEVANT_DOMAINS = new Set(REQUIRED_DOMAINS);

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
  if (!/^-?\d+$/.test(text)) throw new Error(`Relay settlement ${label} is malformed`);
  return text;
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
    if (!snapshot?.data) throw new Error(`Relay settlement snapshot is unavailable for ${domain}`);
    const generation = validGeneration(snapshot.generation);
    if (generation == null) throw new Error(`Relay settlement ${domain} snapshot generation is malformed`);
    if (
      snapshot.confidence === "partial"
      || snapshot.confidence === "unknown"
      || (Array.isArray(snapshot.warnings) && snapshot.warnings.length > 0)
    ) {
      throw new Error(`Relay settlement ${domain} snapshot is incomplete`);
    }
    if (event.changedDomains.includes(domain) && generation < event.generation) {
      throw new Error(`Relay settlement ${domain} snapshot is stale`);
    }
    snapshots[domain] = snapshot;
  }
  return snapshots;
}

function composeSummary(snapshots, claimId) {
  const claim = record(snapshots.claim.data);
  if (!claim) throw new Error("Relay settlement claim snapshot is malformed");
  if (normalizedClaimId(claim.entityId) !== claimId) {
    throw new Error("Relay settlement claim escaped the configured claim");
  }

  const members = snapshots.members.data;
  if (!Array.isArray(members)) throw new Error("Relay settlement members snapshot is malformed");
  if (members.some((value) => normalizedClaimId(record(value)?.claimEntityId) !== claimId)) {
    throw new Error("Relay settlement members escaped the configured claim");
  }

  const inventories = record(snapshots.inventories.data);
  const inventoryClaim = record(inventories?.claim);
  if (!inventories || !inventoryClaim || !Array.isArray(inventories.dimensions) || !Array.isArray(inventories.buildings)) {
    throw new Error("Relay settlement inventories snapshot is malformed");
  }
  if (normalizedClaimId(inventoryClaim.entityId) !== claimId) {
    throw new Error("Relay settlement inventories escaped the configured claim");
  }

  const market = record(snapshots.market.data);
  if (!market || !Array.isArray(market.listings) || !Array.isArray(market.marketplaces)) {
    throw new Error("Relay settlement market snapshot is malformed");
  }
  if (normalizedClaimId(market.claimId) !== claimId) {
    throw new Error("Relay settlement market escaped the configured claim");
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
}) {
  let pendingEvent = null;
  let running = false;
  let scheduled = false;
  const lastAppliedFingerprintByClaim = new Map();
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

        let attempt;
        try {
          const snapshots = readCompleteSettlement(readDomainSnapshot, claimId, event);
          const summary = composeSummary(snapshots, claimId);
          const fingerprint = summaryFingerprint(summary);
          if (lastAppliedFingerprintByClaim.get(claimId) === fingerprint) continue;
          const context = {
            event,
            snapshots,
            generationVector: generationVector(snapshots),
            fingerprint,
          };
          attempt = safelyNotify(onAttempt, event, context);
          await applySettlementTransition(claimId, summary, context);
          lastAppliedFingerprintByClaim.set(claimId, fingerprint);
          safelyNotify(onSuccess, event, context, attempt);
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
      const changedDomains = Array.isArray(event?.changedDomains)
        ? event.changedDomains.filter((domain) => RELEVANT_DOMAINS.has(domain))
        : [];
      if (!changedDomains.length) return false;
      const generation = validGeneration(event.generation);
      if (generation == null) return false;
      const normalizedEvent = { ...event, claimId, generation, changedDomains };
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
      if (!running && !scheduled && !pendingEvent) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.add(resolve));
    },
  };
}
