import { playerBankOptions } from "./craftPlanSources.mjs";

export async function resolveCraftPlanPlayerBanks({
  playerId,
  members = [],
  trackedBankIds = [],
  loadInventory,
  enrichBanks = (banks) => banks,
} = {}) {
  const cleanPlayerId = String(playerId ?? "").trim();
  if (!cleanPlayerId) return { status: 400, body: { error: "Player ID is required" } };
  const member = (Array.isArray(members) ? members : [])
    .find((entry) => String(entry?.playerEntityId ?? entry?.entityId ?? "") === cleanPlayerId);
  if (!member) return { status: 404, body: { error: "Settlement player not found" } };
  const playerName = String(member.userName ?? member.username ?? member.playerName ?? cleanPlayerId);
  try {
    const envelope = await loadInventory(cleanPlayerId);
    const banks = playerBankOptions(cleanPlayerId, playerName, envelope?.data, trackedBankIds);
    return {
      status: 200,
      body: {
        playerId: cleanPlayerId,
        playerName,
        warnings: Array.isArray(envelope?.warnings) ? envelope.warnings.map(String) : [],
        banks: enrichBanks(banks),
      },
    };
  } catch (error) {
    return {
      status: 502,
      body: { error: error instanceof Error ? error.message : "Unable to load player banks" },
    };
  }
}
