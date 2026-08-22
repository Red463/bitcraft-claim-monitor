import type { AnyRecord } from "../main-app-data.ts";
import type {
  DomainEnvelope,
  DomainKey,
  DomainStatus,
  GameDataResponseMeta,
} from "../server/game-data/contracts.ts";
export { pageDomains, usesProviderNeutralGameData } from "./pageDomains.ts";

type GameDataResponse = {
  claimId: string;
  regionId: string;
  generatedAt: string;
  domains: Partial<Record<DomainKey, DomainEnvelope<unknown>>>;
  domainStatus: Partial<Record<DomainKey, DomainStatus>>;
  meta: GameDataResponseMeta;
  partialErrors: string[];
};

export async function loadGameData(
  claimId: string,
  domains: DomainKey[],
  fetcher: typeof fetch = fetch,
  init: RequestInit = {},
): Promise<AnyRecord> {
  return (await loadGameDataWithPayloadBytes(claimId, domains, fetcher, init)).data;
}

export async function loadGameDataWithPayloadBytes(
  claimId: string,
  domains: DomainKey[],
  fetcher: typeof fetch = fetch,
  init: RequestInit = {},
): Promise<{ data: AnyRecord; payloadBytes: number }> {
  const query = new URLSearchParams({
    claimId,
    domains: domains.join(","),
  });
  const response = await fetcher(`/api/local/game-data?${query.toString()}`, init);
  if (!response.ok) {
    throw new Error(`Unable to load game data (HTTP ${response.status}).`);
  }
  const text = await response.text();
  const declaredLength = response.headers.get("content-length");
  const declaredPayloadBytes = declaredLength == null ? Number.NaN : Number(declaredLength);
  const payloadBytes = Number.isFinite(declaredPayloadBytes) && declaredPayloadBytes >= 0
    ? Math.floor(declaredPayloadBytes)
    : new TextEncoder().encode(text).byteLength;
  const payload = JSON.parse(text) as GameDataResponse;
  const flattened: AnyRecord = {
    claimId: payload.claimId,
    regionId: payload.regionId,
    partialErrors: payload.partialErrors,
    domainStatus: payload.domainStatus ?? {},
    responseMeta: payload.meta ?? null,
  };
  const requestedStatuses = domains.flatMap((domain) => {
    const status = payload.domainStatus?.[domain];
    return status ? [status] : [];
  });
  let stale = requestedStatuses.some((status) => (
    status.generation != null && status.freshness === "stale"
  ));
  let oldestReceivedAt = payload.generatedAt;
  for (const [domain, envelope] of Object.entries(payload.domains)) {
    if (!envelope) continue;
    flattened[domain] = envelope.data;
    if (!requestedStatuses.length) stale ||= envelope.freshness === "stale";
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
  return { data: flattened, payloadBytes };
}
