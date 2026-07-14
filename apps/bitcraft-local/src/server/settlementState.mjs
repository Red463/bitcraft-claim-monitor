function toNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function unwrap(payload, key, fallback) {
  if (Array.isArray(payload)) return payload;
  return payload?.[key] ?? fallback;
}

function signedChange(after, before, suffix = "") {
  const diff = toNumber(after) - toNumber(before);
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toLocaleString()}${suffix}`;
}

export function settlementStateSummary(payload = {}) {
  const claim = payload.claim ?? {};
  const market = unwrap(payload.market, "listings", []);
  return {
    claimId: String(payload.claimId ?? claim.entityId ?? ""),
    supplies: toNumber(claim.supplies),
    treasury: toNumber(claim.treasury),
    membersCount: toNumber(payload.membersCount),
    buildingsCount: toNumber(payload.buildingsCount),
    marketCount: market.length,
  };
}

export function settlementStateActivityChanges(previous, summary, { supplyMetadata = {} } = {}) {
  if (!previous) return [];
  const checks = [
    ["supplies", toNumber(previous.supplies), summary.supplies, `${signedChange(summary.supplies, previous.supplies)} supplies`, supplyMetadata],
    ["treasury", toNumber(previous.treasury), summary.treasury, `${signedChange(summary.treasury, previous.treasury, "g")} to treasury`, null],
    ["members", toNumber(previous.members_count), summary.membersCount, `${signedChange(summary.membersCount, previous.members_count)} members`, null],
    ["buildings", toNumber(previous.buildings_count), summary.buildingsCount, `${signedChange(summary.buildingsCount, previous.buildings_count)} buildings`, null],
    ["market", toNumber(previous.market_count), summary.marketCount, `${signedChange(summary.marketCount, previous.market_count)} market listings`, null],
  ];
  return checks
    .filter(([, before, after]) => before !== after)
    .map(([type, before, after, eventSummary, extraMetadata]) => ({
      type,
      summary: eventSummary,
      metadata: extraMetadata ? { before, after, ...extraMetadata } : { before, after },
    }));
}
