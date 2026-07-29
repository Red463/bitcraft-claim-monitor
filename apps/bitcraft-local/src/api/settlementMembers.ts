import type { AnyRecord } from "../main-app-data.ts";

export async function loadSettlementMembers(
  claimId: string,
  fetcher: typeof fetch = fetch,
): Promise<AnyRecord[]> {
  if (!claimId.trim()) return [];

  const response = await fetcher(`/api/bitjita/claims/${encodeURIComponent(claimId)}/members`);
  if (!response.ok) {
    throw new Error(`Unable to load settlement characters (HTTP ${response.status}).`);
  }

  const body: unknown = await response.json();
  if (Array.isArray(body)) return body as AnyRecord[];
  if (body && typeof body === "object" && Array.isArray((body as { members?: unknown }).members)) {
    return (body as { members: AnyRecord[] }).members;
  }
  return [];
}

export async function resolveUserSettingsMembers(
  currentMembers: AnyRecord[],
  claimId: string,
  fetcher: typeof fetch = fetch,
): Promise<AnyRecord[]> {
  return currentMembers.length ? currentMembers : loadSettlementMembers(claimId, fetcher);
}
