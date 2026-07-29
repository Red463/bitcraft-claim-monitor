import type { AnyRecord } from "../main-app-data.ts";
import { loadGameData } from "./gameData.ts";

export async function loadSettlementMembers(
  claimId: string,
  fetcher: typeof fetch = fetch,
): Promise<AnyRecord[]> {
  if (!claimId.trim()) return [];
  const body = await loadGameData(claimId, ["members"], fetcher);
  return Array.isArray(body.members) ? body.members : [];
}

export async function resolveUserSettingsMembers(
  currentMembers: AnyRecord[],
  claimId: string,
  fetcher: typeof fetch = fetch,
): Promise<AnyRecord[]> {
  return currentMembers.length ? currentMembers : loadSettlementMembers(claimId, fetcher);
}
