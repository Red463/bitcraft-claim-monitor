function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function decimal(value) {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) ? normalized : "0";
}

function itemType(value) {
  return value === 1 || value === "1" || String(value ?? "").toLowerCase() === "cargo"
    ? "cargo"
    : "item";
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function thresholdBasisPoints(value) {
  const percent = Number(value);
  const normalized = Number.isFinite(percent) && percent > 0 ? percent : 30;
  return Math.round(Math.min(Math.max(normalized, 1), 95) * 100);
}

function compareDecimal(left, right) {
  const leftValue = BigInt(decimal(left));
  const rightValue = BigInt(decimal(right));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function medianPrice(orders) {
  const prices = orders.map((order) => decimal(order.price ?? order.priceThreshold)).sort(compareDecimal);
  if (!prices.length) return { unitPrice: "0", numerator: 0n, denominator: 1n };
  if (prices.length % 2 === 1) {
    const unitPrice = prices[Math.floor(prices.length / 2)];
    return { unitPrice, numerator: BigInt(unitPrice), denominator: 1n };
  }
  const upper = BigInt(prices[prices.length / 2]);
  const lower = BigInt(prices[(prices.length / 2) - 1]);
  const numerator = lower + upper;
  const whole = numerator / 2n;
  return {
    unitPrice: numerator % 2n === 0n ? whole.toString() : `${whole}.5`,
    numerator,
    denominator: 2n,
  };
}

export function sameEnabledDealWatchRevision(expected, current) {
  const expectedWatch = record(expected);
  const currentWatch = record(current);
  return Boolean(
    Object.keys(currentWatch).length
    && (currentWatch.enabled === true || currentWatch.enabled === 1 || currentWatch.enabled === "1")
    && Number(currentWatch.threshold_percent ?? currentWatch.thresholdPercent)
      === Number(expectedWatch.threshold_percent ?? expectedWatch.thresholdPercent),
  );
}

export function evaluateLiveDealWatches(snapshot, watches, options = {}) {
  const source = record(snapshot);
  const regionRows = Array.isArray(source.regions) ? source.regions.map(record) : [];
  const orders = (Array.isArray(source.orders) ? source.orders : [])
    .map(record)
    .filter((order) => (
      String(order.side ?? "").toLowerCase() === "sell"
      && BigInt(decimal(order.price ?? order.priceThreshold)) > 0n
      && BigInt(decimal(order.quantity)) > 0n
    ));
  const minActiveListings = positiveInteger(options.minActiveListings, 3);
  const maxRegionAgeMs = positiveInteger(options.maxRegionAgeMs, Number.MAX_SAFE_INTEGER);
  const requestedNowMs = Number(options.nowMs);
  const nowMs = Number.isFinite(requestedNowMs) ? requestedNowMs : Date.now();
  const observedAt = String(options.observedAt ?? new Date(nowMs).toISOString());
  const checks = [];
  const opportunities = [];

  for (const value of Array.isArray(watches) ? watches : []) {
    const watch = record(value);
    const watchId = watch.id ?? null;
    const regionId = decimal(watch.region_id ?? watch.regionId);
    const watchedItemId = decimal(watch.item_id ?? watch.itemId);
    const watchedItemType = itemType(watch.item_type ?? watch.itemType);
    let regionObservedAt = observedAt;
    if (regionRows.length) {
      const region = regionRows.find((row) => decimal(row.regionId) === regionId);
      const receivedAtMs = Date.parse(String(region?.receivedAt ?? ""));
      const ageMs = Number.isFinite(receivedAtMs) ? Math.max(0, nowMs - receivedAtMs) : null;
      if (!region || ageMs == null || ageMs > maxRegionAgeMs) {
        checks.push({
          watchId,
          baseline: null,
          error: region
            ? `Regional sell-order snapshot is stale (${ageMs == null ? "unknown age" : `${ageMs}ms old`})`
            : `Regional sell-order snapshot has not loaded region ${regionId}`,
        });
        continue;
      }
      regionObservedAt = String(region.receivedAt);
    }
    const matching = orders.filter((order) => (
      decimal(order.regionId) === regionId
      && decimal(order.itemId) === watchedItemId
      && itemType(order.itemType) === watchedItemType
    ));
    if (matching.length < minActiveListings) {
      checks.push({
        watchId,
        baseline: null,
        error: `Not enough active regional sell listings (${minActiveListings}+ required; found ${matching.length})`,
      });
      continue;
    }

    const baselinePrice = medianPrice(matching);
    const thresholdBps = thresholdBasisPoints(watch.threshold_percent ?? watch.thresholdPercent);
    const baseline = {
      kind: "current-sell-median",
      unitPrice: baselinePrice.unitPrice,
      sampleCount: matching.length,
      observedAt: regionObservedAt,
    };
    checks.push({ watchId, baseline, error: null });

    for (const order of matching) {
      const unitPrice = BigInt(decimal(order.price ?? order.priceThreshold));
      if (
        unitPrice * baselinePrice.denominator * 10_000n
        > baselinePrice.numerator * BigInt(10_000 - thresholdBps)
      ) continue;
      const quantity = BigInt(decimal(order.quantity));
      const listingNumerator = unitPrice * baselinePrice.denominator;
      const discountBasisPoints = baselinePrice.numerator > 0n
        ? ((baselinePrice.numerator - listingNumerator) * 10_000n) / baselinePrice.numerator
        : 0n;
      opportunities.push({
        watchId,
        watch,
        listingKey: `relay:${regionId}:${decimal(order.entityId)}`,
        regionId,
        itemId: watchedItemId,
        itemType: watchedItemType,
        marketClaimId: decimal(order.claimEntityId),
        marketClaimName: String(order.claimName ?? ""),
        sellerEntityId: decimal(order.ownerEntityId),
        sellerName: String(order.ownerUsername ?? ""),
        quantity: quantity.toString(),
        unitPrice: unitPrice.toString(),
        totalValue: (quantity * unitPrice).toString(),
        baseline,
        discountPercent: Number(discountBasisPoints) / 100,
        raw: order,
      });
    }
  }

  return { checks, opportunities };
}
