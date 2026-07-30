import type { AnyRecord } from "../main-app-data.ts";
import type {
  DomainEnvelope,
  DomainKey,
} from "../server/game-data/contracts.ts";
export { pageDomains, usesProviderNeutralGameData } from "./pageDomains.ts";

type GameDataResponse = {
  claimId: string;
  regionId: string;
  generatedAt: string;
  domains: Partial<Record<DomainKey, DomainEnvelope<unknown>>>;
  partialErrors: string[];
};

export async function loadGameData(
  claimId: string,
  domains: DomainKey[],
  fetcher: typeof fetch = fetch,
  init: RequestInit = {},
): Promise<AnyRecord> {
  const query = new URLSearchParams({
    claimId,
    domains: domains.join(","),
  });
  const response = await fetcher(`/api/local/game-data?${query.toString()}`, init);
  if (!response.ok) {
    throw new Error(`Unable to load game data (HTTP ${response.status}).`);
  }
  const payload = await response.json() as GameDataResponse;
  const flattened: AnyRecord = {
    claimId: payload.claimId,
    regionId: payload.regionId,
    partialErrors: payload.partialErrors,
  };
  let stale = false;
  let oldestReceivedAt = payload.generatedAt;
  for (const [domain, envelope] of Object.entries(payload.domains)) {
    if (!envelope) continue;
    flattened[domain] = envelope.data;
    stale ||= envelope.freshness === "stale" || envelope.freshness === "unavailable";
    const receivedAt = envelope.provenance?.receivedAt;
    if (receivedAt && Date.parse(receivedAt) < Date.parse(oldestReceivedAt)) oldestReceivedAt = receivedAt;
  }
  flattened.stale = stale;
  flattened.serverFreshness = {
    cacheState: stale ? "last-good" : "provider-current",
    stale,
    collectedAt: oldestReceivedAt,
    lastSuccessAt: oldestReceivedAt,
  };
  return flattened;
}
