export const HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE = 1_000;

function decimalAmount(value) {
  const amount = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  return /^\d+$/.test(amount) ? amount : null;
}

function count(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function observedAt(value) {
  const timestamp = String(value ?? "").trim();
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

export function liveEmpireHexiteProjection({
  treasury,
  foundryCapsules,
  playerInventoryEnergy,
  sharedClaimInventoryEnergy,
  playerInventoryCapsules,
  sharedClaimInventoryCapsules,
  reserveBuildingCapsules,
  inventoryCoverage,
  inventoryComplete = false,
  memberCount,
  claimCount,
  observedAt: sourceObservedAt,
} = {}) {
  const exactTreasury = decimalAmount(treasury);
  const exactFoundryCapsules = decimalAmount(foundryCapsules);
  const exactPlayerEnergy = decimalAmount(playerInventoryEnergy);
  const exactSharedEnergy = decimalAmount(sharedClaimInventoryEnergy);
  const exactPlayerCapsules = decimalAmount(playerInventoryCapsules);
  const exactSharedCapsules = decimalAmount(sharedClaimInventoryCapsules);
  const exactReserveCapsules = decimalAmount(reserveBuildingCapsules);
  const hasInventoryProjection = [
    exactPlayerEnergy,
    exactSharedEnergy,
    exactPlayerCapsules,
    exactSharedCapsules,
    exactReserveCapsules,
  ].every((value) => value != null);
  const players = count(memberCount);
  const claims = count(claimCount);
  const knownEnergy = exactTreasury == null
    ? null
    : (
        BigInt(exactTreasury)
        + BigInt(exactPlayerEnergy ?? "0")
        + BigInt(exactSharedEnergy ?? "0")
      ).toString();
  const knownCapsules = (
    BigInt(exactPlayerCapsules ?? "0")
    + BigInt(exactSharedCapsules ?? "0")
    + BigInt(exactFoundryCapsules ?? "0")
  ).toString();
  const estimatedEnergyEquivalent = knownEnergy == null
    ? null
    : (
        BigInt(knownEnergy)
        + (BigInt(knownCapsules) * BigInt(HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE))
      ).toString();
  const playerCoverage = inventoryCoverage?.players ?? {
    fresh: 0,
    reused: 0,
    missing: players,
    total: players,
  };
  const claimCoverage = inventoryCoverage?.claims ?? {
    fresh: 0,
    reused: 0,
    missing: claims,
    total: claims,
  };
  return {
    estimatedEnergyEquivalent,
    capsuleEnergyCost: null,
    capsuleWatchtowerEnergyValue: HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE,
    energy: {
      treasury: exactTreasury,
      playerInventories: exactPlayerEnergy,
      sharedClaimInventories: exactSharedEnergy,
      total: knownEnergy,
    },
    capsules: {
      playerInventories: exactPlayerCapsules,
      sharedClaimInventories: exactSharedCapsules,
      reserveBuildings: exactReserveCapsules,
      foundry: exactFoundryCapsules,
      readyTotal: hasInventoryProjection || exactFoundryCapsules != null ? knownCapsules : null,
    },
    coverage: {
      players: playerCoverage,
      claims: claimCoverage,
      foundry: exactFoundryCapsules == null ? "unavailable" : "complete",
    },
    status: exactTreasury == null
      ? "error"
      : inventoryComplete && exactFoundryCapsules != null
        ? "complete"
        : "partial",
    sweepStartedAt: null,
    calculatedAt: observedAt(sourceObservedAt),
    refreshing: false,
    errors: [
      ...(exactTreasury == null ? ["Empire treasury amount is unavailable."] : []),
      ...(!hasInventoryProjection
        ? ["Live regional player and claim inventory joins are not available yet."]
        : !inventoryComplete
          ? ["Live regional inventory coverage is incomplete; displayed values are a known minimum."]
          : []),
      ...(exactFoundryCapsules == null ? ["Completed Foundry output is not available."] : []),
    ],
  };
}
