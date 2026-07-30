function exactInteger(value, label) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+$/.test(text)) throw new TypeError(`${label} must be an exact integer`);
  return text;
}

function boundedCount(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return number;
}

function unwrap(payload, key, fallback) {
  if (Array.isArray(payload)) return payload;
  return payload?.[key] ?? fallback;
}

function signedExactChange(after, before, suffix = "") {
  const diff = BigInt(after) - BigInt(before);
  const sign = diff > 0n ? "+" : "";
  return `${sign}${diff.toLocaleString()}${suffix}`;
}

export function settlementStateSummary(payload = {}) {
  const claim = payload.claim ?? {};
  const market = unwrap(payload.market, "listings", []);
  if (!Array.isArray(market)) throw new TypeError("market listings must be an array");
  return {
    claimId: String(payload.claimId ?? claim.entityId ?? ""),
    supplies: exactInteger(claim.supplies, "claim supplies"),
    treasury: exactInteger(claim.treasury, "claim treasury"),
    membersCount: boundedCount(payload.membersCount, "member count"),
    buildingsCount: null,
    marketCount: market.length,
  };
}

export function settlementStateActivityChanges(previous, summary, { supplyMetadata = {} } = {}) {
  if (!previous) return [];
  const previousSupplies = previous.supplies == null
    ? null
    : exactInteger(previous.supplies, "previous supplies");
  const currentSupplies = summary.supplies == null
    ? null
    : exactInteger(summary.supplies, "current supplies");
  const previousTreasury = previous.treasury == null
    ? null
    : exactInteger(previous.treasury, "previous treasury");
  const currentTreasury = summary.treasury == null
    ? null
    : exactInteger(summary.treasury, "current treasury");
  const checks = [
    [
      "supplies",
      previousSupplies,
      currentSupplies,
      previousSupplies == null || currentSupplies == null
        ? null
        : `${signedExactChange(currentSupplies, previousSupplies)} supplies`,
      supplyMetadata,
    ],
    [
      "treasury",
      previousTreasury,
      currentTreasury,
      previousTreasury == null || currentTreasury == null
        ? null
        : `${signedExactChange(currentTreasury, previousTreasury, "g")} to treasury`,
      null,
    ],
    [
      "members",
      previous.members_count,
      summary.membersCount,
      previous.members_count == null || summary.membersCount == null
        ? null
        : `${signedExactChange(summary.membersCount, previous.members_count)} members`,
      null,
    ],
    [
      "buildings",
      previous.buildings_count,
      summary.buildingsCount,
      previous.buildings_count == null || summary.buildingsCount == null
        ? null
        : `${signedExactChange(summary.buildingsCount, previous.buildings_count)} buildings`,
      null,
    ],
    [
      "market",
      previous.market_count,
      summary.marketCount,
      previous.market_count == null || summary.marketCount == null
        ? null
        : `${signedExactChange(summary.marketCount, previous.market_count)} market listings`,
      null,
    ],
  ];
  return checks
    .filter(([, before, after, eventSummary]) => (
      before != null
      && after != null
      && String(before) !== String(after)
      && eventSummary != null
    ))
    .map(([type, before, after, eventSummary, extraMetadata]) => ({
      type,
      summary: eventSummary,
      metadata: extraMetadata
        ? { before: String(before), after: String(after), ...extraMetadata }
        : type === "supplies" || type === "treasury"
          ? { before: String(before), after: String(after) }
          : { before, after },
    }));
}

export function runSettlementStateTransaction({
  db,
  readPrevious,
  activityChanges,
  insertActivity,
  upsertState,
  processOutbox,
}) {
  let shouldProcessOutbox = false;
  db.exec("BEGIN");
  try {
    const previous = readPrevious();
    if (previous) {
      for (const change of activityChanges(previous)) {
        if (insertActivity(change)) shouldProcessOutbox = true;
      }
    }
    upsertState();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (shouldProcessOutbox) processOutbox();
}
