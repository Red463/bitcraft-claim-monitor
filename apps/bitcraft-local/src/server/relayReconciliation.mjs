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

function readRelayCrafts(readSnapshot, claimId) {
  const snapshot = committedRelaySnapshotForReconciliation(readSnapshot, claimId, "crafts");
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

function readRelayMembers(readSnapshot, claimId) {
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

export function readRelayClaimBuildingsForPlanning(readSnapshot, claimId) {
  const configuredClaimId = requiredDecimal(claimId, "configured claim id");
  const snapshot = committedRelaySnapshotForReconciliation(
    readSnapshot,
    configuredClaimId,
    "construction",
  );
  if (!["authoritative", "joined"].includes(snapshot.confidence)) {
    throw new Error("Relay construction input is partial.");
  }
  const payload = snapshot.data;
  if (
    !payload
    || typeof payload !== "object"
    || Array.isArray(payload)
    || !Array.isArray(payload.projects)
    || !Array.isArray(payload.buildings)
  ) {
    throw new Error("Relay construction input is malformed.");
  }
  for (const project of payload.projects) {
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      throw new Error("Relay construction input contains a malformed project.");
    }
    requiredDecimal(project.entityId, "construction project id");
    if (requiredDecimal(project.ownerId, "construction project claim id") !== configuredClaimId) {
      throw new Error("Relay construction input contains a cross-claim project.");
    }
    requiredDecimal(project.constructionRecipeId, "construction project recipe id");
  }
  const seenBuildingIds = new Set();
  for (const building of payload.buildings) {
    if (!building || typeof building !== "object" || Array.isArray(building)) {
      throw new Error("Relay construction input contains a malformed building.");
    }
    const buildingId = requiredDecimal(building.entityId, "construction building id");
    if (seenBuildingIds.has(buildingId)) {
      throw new Error(`Relay construction input contains duplicate building ${buildingId}.`);
    }
    seenBuildingIds.add(buildingId);
    if (
      requiredDecimal(building.claimEntityId, "construction building claim id")
      !== configuredClaimId
    ) {
      throw new Error("Relay construction input contains a cross-claim building.");
    }
    requiredDecimal(
      building.buildingDescriptionId,
      "construction building description id",
    );
    requiredDecimal(
      building.constructedByPlayerEntityId,
      "construction building constructor id",
    );
    if (!Number.isInteger(building.directionIndex)) {
      throw new Error(`Relay construction building ${buildingId} direction is malformed.`);
    }
  }
  return { buildings: payload.buildings };
}

export function readRelayOnlineMembers(readSnapshot, claimId) {
  const members = readRelayMembers(readSnapshot, claimId);
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
  const payload = readRelayCrafts(readSnapshot, claimId);
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

async function capture(run) {
  try {
    return { value: await run(), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runIndependentReconciliation({ runMaintenance, runSupplyReport }) {
  const maintenance = await capture(runMaintenance);
  const supply = await capture(runSupplyReport);
  return {
    maintenanceError: maintenance.error,
    supplyError: supply.error,
  };
}

export function createScheduledRelayReconciler({
  reconcile,
  timeoutMs = 180_000,
  terminate = (error) => {
    console.error(error.message);
    process.exit(1);
  },
  scheduleTimeout = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelTimeout = (timer) => clearTimeout(timer),
}) {
  if (typeof reconcile !== "function") {
    throw new TypeError("Scheduled Relay reconciler requires a reconcile function");
  }
  let inFlight = null;
  return {
    request(reason = "scheduled") {
      if (inFlight) return inFlight;
      const startedAt = new Date().toISOString();
      const timeout = scheduleTimeout(() => {
        terminate(new Error(
          `Relay reconciliation stalled for ${timeoutMs}ms (reason=${reason}, startedAt=${startedAt}); terminating worker for systemd restart`,
        ));
      }, timeoutMs);
      timeout?.unref?.();
      const operation = Promise.resolve(reconcile(reason));
      const tracked = operation.finally(() => {
        cancelTimeout(timeout);
        if (inFlight === tracked) inFlight = null;
      });
      inFlight = tracked;
      return inFlight;
    },
  };
}
