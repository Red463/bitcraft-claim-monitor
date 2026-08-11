import { playerIdFromBankSourceId } from "../craftPlanBankIdentity.mjs";

export function mergeLegacyBankDiscovery(sourceRules = {}, playerId, banks = []) {
  const legacyPlayerIds = Array.isArray(sourceRules.bankPlayerIds) ? sourceRules.bankPlayerIds.map(String) : [];
  if (!legacyPlayerIds.includes(String(playerId))) return sourceRules;
  const discoveredIds = (Array.isArray(banks) ? banks : [])
    .filter((bank) => Number(bank?.itemCount ?? bank?.items?.length ?? 0) > 0)
    .map((bank) => String(bank?.sourceId ?? ""))
    .filter(Boolean);
  return {
    ...sourceRules,
    bankContainerIds: [...new Set([
      ...(Array.isArray(sourceRules.bankContainerIds) ? sourceRules.bankContainerIds.map(String) : []),
      ...discoveredIds,
    ])],
  };
}

export function finalizeLegacyBankMigrations(sourceRules = {}, successfulPlayerIds = []) {
  const successful = new Set((Array.isArray(successfulPlayerIds) ? successfulPlayerIds : []).map(String));
  return {
    ...sourceRules,
    bankPlayerIds: (Array.isArray(sourceRules.bankPlayerIds) ? sourceRules.bankPlayerIds : [])
      .map(String)
      .filter((playerId) => !successful.has(playerId)),
    bankContainerIds: Array.isArray(sourceRules.bankContainerIds) ? sourceRules.bankContainerIds.map(String) : [],
  };
}

export function initiallyExpandedBankPlayerIds(sourceRules = {}) {
  return [...new Set([
    ...(Array.isArray(sourceRules.bankPlayerIds) ? sourceRules.bankPlayerIds.map(String) : []),
    ...(Array.isArray(sourceRules.bankContainerIds) ? sourceRules.bankContainerIds.map(playerIdFromBankSourceId) : []),
  ].filter(Boolean))];
}

export function buildCraftPlanBankGroups({ players = [], bankLoads = {}, trackedBankIds = [], search = "", trackedOnly = false } = {}) {
  const trackedIds = new Set((Array.isArray(trackedBankIds) ? trackedBankIds : []).map(String));
  const normalizedSearch = String(search).trim().toLocaleLowerCase();
  return (Array.isArray(players) ? players : []).map((player) => {
    const playerId = String(player?.playerId ?? "");
    const playerName = String(player?.label ?? playerId);
    const loadState = bankLoads?.[playerId];
    const playerMatches = Boolean(normalizedSearch) && playerName.toLocaleLowerCase().includes(normalizedSearch);
    const allBanks = Array.isArray(loadState?.banks) ? loadState.banks : [];
    const visibleBanks = allBanks.filter((bank) => {
      const tracked = trackedIds.has(String(bank?.sourceId ?? ""));
      const hasItems = Number(bank?.itemCount ?? bank?.items?.length ?? 0) > 0;
      if (!hasItems && !tracked) return false;
      if (trackedOnly && !tracked) return false;
      if (!normalizedSearch || playerMatches) return true;
      return `${bank?.label ?? ""} ${bank?.claimName ?? ""}`.toLocaleLowerCase().includes(normalizedSearch);
    }).sort((left, right) => {
      const trackedDifference = Number(trackedIds.has(String(right?.sourceId ?? ""))) - Number(trackedIds.has(String(left?.sourceId ?? "")));
      return trackedDifference || String(left?.label ?? left?.sourceId).localeCompare(String(right?.label ?? right?.sourceId));
    });
    return {
      playerId,
      playerName,
      loadState,
      visibleBanks,
      trackedCount: allBanks.filter((bank) => trackedIds.has(String(bank?.sourceId ?? ""))).length,
      nonEmptyCount: allBanks.filter((bank) => Number(bank?.itemCount ?? bank?.items?.length ?? 0) > 0).length,
    };
  }).filter((group) => group.loadState?.status !== "loaded" || group.visibleBanks.length > 0)
    .sort((left, right) => Number(right.trackedCount > 0) - Number(left.trackedCount > 0) || left.playerName.localeCompare(right.playerName));
}

export async function runBankDiscoveryQueue(players, worker, concurrency = 3) {
  const values = Array.isArray(players) ? players : [];
  const workerCount = Math.min(Math.max(1, Math.floor(Number(concurrency) || 1)), values.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < values.length) {
      const value = values[nextIndex];
      nextIndex += 1;
      await worker(value);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}
