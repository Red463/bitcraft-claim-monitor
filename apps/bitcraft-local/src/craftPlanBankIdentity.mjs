export function playerIdFromBankSourceId(sourceId) {
  const value = String(sourceId ?? "");
  const separator = value.indexOf(":");
  return separator > 0 ? value.slice(0, separator) : "";
}

export function bankSourceBelongsToPlayer(sourceId, playerId) {
  return playerIdFromBankSourceId(sourceId) === String(playerId ?? "");
}
