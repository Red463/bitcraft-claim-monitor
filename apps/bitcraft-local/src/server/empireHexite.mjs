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
  memberCount,
  claimCount,
  observedAt: sourceObservedAt,
} = {}) {
  const exactTreasury = decimalAmount(treasury);
  const players = count(memberCount);
  const claims = count(claimCount);
  return {
    estimatedEnergyEquivalent: exactTreasury,
    capsuleEnergyCost: null,
    capsuleWatchtowerEnergyValue: HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE,
    energy: {
      treasury: exactTreasury,
      playerInventories: null,
      sharedClaimInventories: null,
      total: exactTreasury,
    },
    capsules: {
      playerInventories: null,
      sharedClaimInventories: null,
      reserveBuildings: null,
      foundry: null,
      readyTotal: null,
    },
    coverage: {
      players: { fresh: 0, reused: 0, missing: players, total: players },
      claims: { fresh: 0, reused: 0, missing: claims, total: claims },
      foundry: "unavailable",
    },
    status: exactTreasury == null ? "error" : "partial",
    sweepStartedAt: null,
    calculatedAt: observedAt(sourceObservedAt),
    refreshing: false,
    errors: [
      ...(exactTreasury == null ? ["Empire treasury amount is unavailable."] : []),
      "Live regional player and claim inventory joins are not available yet.",
      "Completed Foundry output is not available.",
    ],
  };
}
