export const relayContributionEvidenceWarning = "Craft contributor history is not available from the proven Relay mapping.";

export function requiredDecimal(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`Relay ${label} is missing or malformed.`);
  return normalized;
}

function committedRelaySnapshotForReconciliation(readSnapshot, claimId, domain, { allowedWarnings = [] } = {}) {
  const snapshot = readSnapshot(String(claimId), domain);
  if (!snapshot?.data) throw new Error(`Relay ${domain} input is unavailable.`);
  if (snapshot.provenance?.provider !== "relay") {
    throw new Error(`Relay ${domain} input is not Relay-owned.`);
  }
  if (snapshot.confidence === "partial" || snapshot.confidence === "unknown") {
    throw new Error(`Relay ${domain} input is partial.`);
  }
  const unexpectedWarning = (snapshot.warnings ?? []).map(String).find((warning) => !allowedWarnings.includes(warning));
  if (unexpectedWarning) throw new Error(`Relay ${domain} input is partial: ${unexpectedWarning}`);
  return snapshot;
}

export function readRelayClaimForSupplyReport(readSnapshot, claimId) {
  const snapshot = committedRelaySnapshotForReconciliation(readSnapshot, claimId, "claim");
  const claim = snapshot.data;
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) throw new Error("Relay claim input is malformed.");
  if (requiredDecimal(claim.entityId, "claim entity id") !== String(claimId)) {
    throw new Error("Relay claim input does not match the configured claim.");
  }
  requiredDecimal(claim.supplies, "claim supplies");
  return claim;
}

export function readRelayCraftsForContributionReconciliation(readSnapshot, claimId) {
  const snapshot = committedRelaySnapshotForReconciliation(readSnapshot, claimId, "crafts", {
    allowedWarnings: [relayContributionEvidenceWarning],
  });
  const payload = snapshot.data;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.craftResults)) {
    throw new Error("Relay crafts input is malformed.");
  }
  for (const craft of payload.craftResults) {
    if (!craft || typeof craft !== "object") throw new Error("Relay crafts input contains a malformed craft.");
    requiredDecimal(craft.entityId, "craft entity id");
    if (requiredDecimal(craft.claimEntityId, "craft claim id") !== String(claimId)) {
      throw new Error("Relay crafts input contains a cross-claim craft.");
    }
  }
  return payload;
}

export function readRelayMembersForTradeReconciliation(readSnapshot, claimId) {
  const snapshot = committedRelaySnapshotForReconciliation(readSnapshot, claimId, "members");
  if (!Array.isArray(snapshot.data)) throw new Error("Relay members input is malformed.");
  for (const member of snapshot.data) {
    if (!member || typeof member !== "object") throw new Error("Relay members input contains a malformed member.");
    if (requiredDecimal(member.claimEntityId, "member claim id") !== String(claimId)) {
      throw new Error("Relay members input contains a cross-claim member.");
    }
    requiredDecimal(member.playerEntityId ?? member.entityId, "member player id");
  }
  return snapshot.data;
}

export function readRelayOnlineMembers(readSnapshot, claimId) {
  const members = readRelayMembersForTradeReconciliation(readSnapshot, claimId);
  const playersSnapshot = committedRelaySnapshotForReconciliation(
    readSnapshot,
    claimId,
    "players",
  );
  if (!Array.isArray(playersSnapshot.data)) {
    throw new Error("Relay players input is malformed.");
  }
  const playersById = new Map();
  for (const player of playersSnapshot.data) {
    if (!player || typeof player !== "object") {
      throw new Error("Relay players input contains a malformed player.");
    }
    const playerId = requiredDecimal(
      player.playerEntityId ?? player.entityId,
      "player entity id",
    );
    if (playersById.has(playerId)) {
      throw new Error(`Relay players input contains duplicate player ${playerId}.`);
    }
    if (typeof player.signedIn !== "boolean") {
      throw new Error(`Relay player ${playerId} online state is malformed.`);
    }
    playersById.set(playerId, player);
  }
  return members.map((member) => {
    const playerId = requiredDecimal(
      member.playerEntityId ?? member.entityId,
      "member player id",
    );
    const player = playersById.get(playerId);
    if (!player) {
      throw new Error(`Relay players input is partial: member ${playerId} is unavailable.`);
    }
    return { member, player };
  });
}

export function readRelayCraftsForDiscord(readSnapshot, claimId) {
  const payload = readRelayCraftsForContributionReconciliation(readSnapshot, claimId);
  for (const craft of payload.craftResults) {
    if (typeof craft.completed !== "boolean") {
      throw new Error(`Relay craft ${craft.entityId} completion state is malformed.`);
    }
  }
  return {
    ...payload,
    craftResults: payload.craftResults.filter((craft) => craft.completed === false),
  };
}

export async function fetchCraftContributionEvidence({ craftsPayload, fetchContribution, mapWithConcurrency }) {
  const crafts = Array.isArray(craftsPayload?.craftResults) ? craftsPayload.craftResults : [];
  const entries = await mapWithConcurrency(crafts, 4, async (craft) => {
    const craftId = requiredDecimal(craft?.entityId, "craft entity id");
    const contributions = await fetchContribution(craftId);
    if (!Array.isArray(contributions)) throw new Error(`Craft ${craftId} contribution evidence is malformed.`);
    return [craftId, contributions];
  });
  return Object.fromEntries(entries);
}

export function sideEffectCollectorIsDue({ key, settings, statuses, force = false, now = Date.now() }) {
  if (force) return true;
  const setting = settings?.[key];
  if (!setting || setting.enabled === false) return false;
  const lastSuccessAt = statuses?.[key]?.lastSuccessAt;
  if (!lastSuccessAt) return true;
  return now - new Date(lastSuccessAt).getTime() >= Number(setting.intervalSeconds) * 1000;
}

async function capture(run) {
  try {
    return { value: await run(), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runIndependentReconciliation({ runMaintenance, runSupplyReport, runContributions, runMarketTrades }) {
  const maintenance = await capture(runMaintenance);
  const supply = await capture(runSupplyReport);
  const contributions = await capture(runContributions);
  const marketTrades = await capture(runMarketTrades);
  return {
    maintenanceError: maintenance.error,
    supplyError: supply.error,
    contributionError: contributions.error,
    marketError: marketTrades.error,
    contributions: contributions.value,
    marketTrades: marketTrades.value,
  };
}
