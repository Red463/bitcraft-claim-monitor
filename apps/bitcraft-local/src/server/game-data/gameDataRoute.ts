import {
  DOMAIN_KEYS,
  type Confidence,
  type CurrentStateReader,
  type DomainEnvelope,
  type DomainKey,
  type EntityId,
} from "./contracts.ts";

export function parseDomainKeys(value: string | null): DomainKey[] {
  if (!value) return [];
  const allowed = new Set<string>(DOMAIN_KEYS);
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter((entry): entry is DomainKey => allowed.has(entry)))];
}

export function gameDataResponse(options: {
  configuredClaimId: EntityId;
  claimId: EntityId;
  domains: DomainKey[];
  repository: CurrentStateReader;
  transformData?: (domain: DomainKey, data: unknown) => unknown;
  transformDomain?: (domain: DomainKey, data: unknown) => {
    data: unknown;
    confidence?: Confidence;
    warnings?: string[];
  };
  now?: Date;
  freshForMs?: number;
}) {
  if (options.claimId !== options.configuredClaimId) {
    return {
      status: 403,
      body: { error: "Requested claim is not the configured monitored claim." },
    };
  }
  const now = options.now ?? new Date();
  const freshForMs = options.freshForMs ?? 90_000;
  const domains: Partial<Record<DomainKey, DomainEnvelope<unknown>>> = {};
  const partialErrors: string[] = [];
  let availableCount = 0;
  let regionId = "";

  for (const domain of options.domains) {
    const snapshot = options.repository.read(options.claimId, domain);
    if (!snapshot) {
      partialErrors.push(`${domain} has not loaded yet.`);
      continue;
    }
    availableCount += 1;
    const observedAt = snapshot.provenance.sourceObservedAt ?? snapshot.provenance.receivedAt;
    const observedMs = Date.parse(observedAt);
    const ageMs = Number.isFinite(observedMs) ? Math.max(0, now.getTime() - observedMs) : null;
    const stale = snapshot.lastError != null || ageMs == null || ageMs > freshForMs;
    const transformed = options.transformDomain
      ? options.transformDomain(domain, snapshot.data)
      : {
          data: options.transformData ? options.transformData(domain, snapshot.data) : snapshot.data,
        };
    const warnings = [
      ...snapshot.warnings,
      ...(Array.isArray(transformed.warnings) ? transformed.warnings : []),
    ];
    const confidence = transformed.confidence ?? snapshot.confidence;
    domains[domain] = {
      data: transformed.data,
      freshness: stale ? "stale" : "fresh",
      confidence,
      ageMs,
      provenance: snapshot.provenance,
      warnings,
    };
    if (snapshot.lastError) partialErrors.push(`${domain}: ${snapshot.lastError}`);
    for (const warning of warnings) {
      partialErrors.push(`${domain}: ${warning}`);
    }
    if (confidence === "partial" && warnings.length === 0) {
      partialErrors.push(`${domain}: data is partial.`);
    }
    if (domain === "claim") {
      regionId = String((snapshot.data as { regionId?: unknown })?.regionId ?? "");
    }
  }

  return {
    status: availableCount ? 200 : 503,
    body: {
      claimId: options.claimId,
      regionId,
      generatedAt: now.toISOString(),
      domains,
      partialErrors,
    },
  };
}
