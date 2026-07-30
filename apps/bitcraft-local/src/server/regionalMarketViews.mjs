function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function decimal(value) {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) ? normalized : "0";
}

function compareBigInt(left, right) {
  const leftValue = BigInt(decimal(left));
  const rightValue = BigInt(decimal(right));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function multiply(left, right) {
  return (BigInt(decimal(left)) * BigInt(decimal(right))).toString();
}

function regionIds(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map(String)
      .filter((regionId) => /^\d+$/.test(regionId)),
  )];
}

function warningInScope(warning, allowedRegionIds) {
  if (!allowedRegionIds.size) return true;
  const match = String(warning).match(/(?:^Region|region)\s+(\d+)/);
  return !match || allowedRegionIds.has(match[1]);
}

export function regionalMarketStatus(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return {
      freshness: "unavailable",
      confidence: "unknown",
      ageMs: null,
      warnings: ["Relay regional market has not loaded yet."],
    };
  }
  const current = record(snapshot);
  const source = record(current.data);
  const selectedRegion = String(options.regionId ?? "all").trim().toLowerCase() || "all";
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const staleAfterMs = Math.max(1_000, Number(options.staleAfterMs) || 60_000);
  const metadata = (Array.isArray(source.regions) ? source.regions : [])
    .map(record)
    .filter((region) => /^\d+$/.test(String(region.regionId ?? "")));
  const configuredRegionIds = regionIds(options.allowedRegionIds);
  const allowedRegionIds = new Set(configuredRegionIds);
  const activeRegionIds = configuredRegionIds.length
    ? configuredRegionIds
    : regionIds(
      Array.isArray(source.activeRegionIds)
        ? source.activeRegionIds
        : metadata.map((region) => region.regionId),
    );
  const activeRegionSet = new Set(activeRegionIds);
  const targetRegionIds = selectedRegion === "all"
    ? activeRegionIds
    : activeRegionSet.size && !activeRegionSet.has(selectedRegion)
      ? []
      : [selectedRegion];
  const metadataByRegion = new Map(
    metadata
      .filter((region) => !activeRegionSet.size || activeRegionSet.has(String(region.regionId)))
      .map((region) => [String(region.regionId), region]),
  );
  const missingRegionIds = targetRegionIds.filter((regionId) => !metadataByRegion.has(regionId));
  const loadedRegions = targetRegionIds
    .map((regionId) => metadataByRegion.get(regionId))
    .filter(Boolean);
  const warnings = [
    ...(Array.isArray(current.warnings)
      ? current.warnings.map(String).filter((warning) => warningInScope(warning, allowedRegionIds))
      : []),
    ...missingRegionIds.map((regionId) => `Relay regional market has not loaded region ${regionId} yet.`),
  ];
  if (!loadedRegions.length) {
    return {
      freshness: "unavailable",
      confidence: current.confidence === "authoritative" ? "partial" : String(current.confidence ?? "unknown"),
      ageMs: null,
      warnings: [...new Set(warnings)],
    };
  }

  const ages = loadedRegions.map((region) => {
    const receivedAtMs = Date.parse(String(region.receivedAt ?? ""));
    return Number.isFinite(receivedAtMs) ? Math.max(0, nowMs - receivedAtMs) : null;
  });
  const knownAges = ages.filter((age) => age != null);
  const ageMs = knownAges.length ? Math.max(...knownAges) : null;
  let freshness = missingRegionIds.length ? "stale" : "fresh";
  for (const [index, region] of loadedRegions.entries()) {
    const regionId = String(region.regionId);
    const age = ages[index];
    if (age == null) {
      freshness = "stale";
      warnings.push(`Relay regional market region ${regionId} has no valid receive time.`);
    } else if (age > staleAfterMs) {
      freshness = "stale";
      warnings.push(`Relay regional market region ${regionId} is older than ${staleAfterMs}ms.`);
    }
  }
  if (current.lastError) {
    freshness = "stale";
    warnings.push(String(current.lastError));
  }
  const runtime = record(options.runtimeHealth);
  if (runtime.running === true) {
    const pool = record(runtime.pool);
    const sessions = Array.isArray(pool.sessions) ? pool.sessions.map(record) : [];
    for (const regionId of targetRegionIds) {
      const session = sessions.find((entry) => String(entry.regionId ?? "") === regionId);
      if (!session) continue;
      const health = record(session.health);
      if (health.connected === false) {
        freshness = "stale";
        warnings.push(`Relay regional market region ${regionId} is disconnected.`);
      }
      if (health.lastError) {
        freshness = "stale";
        warnings.push(String(health.lastError));
      }
    }
  }
  return {
    freshness,
    confidence: missingRegionIds.length
      ? "partial"
      : String(current.confidence ?? "unknown"),
    ageMs,
    warnings: [...new Set(warnings)],
  };
}

export function regionalBuyOrdersView(snapshot, options = {}) {
  const source = record(snapshot);
  const selectedRegion = String(options.regionId ?? "all").trim().toLowerCase();
  const allowedRegionIds = new Set(regionIds(options.allowedRegionIds));
  const query = String(options.search ?? options.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const requestedPageSize = Number(options.pageSize);
  const pageSize = [25, 50, 100].includes(requestedPageSize) ? requestedPageSize : 50;
  const direction = String(options.direction ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const sort = String(options.sort ?? "unitPrice");
  const observedAt = options.observedAt == null ? null : String(options.observedAt);
  const getEntity = typeof options.getEntity === "function" ? options.getEntity : () => null;
  const receivedAtByRegion = new Map(
    (Array.isArray(source.regions) ? source.regions : [])
      .map(record)
      .filter((region) => /^\d+$/.test(String(region.regionId ?? "")))
      .map((region) => [String(region.regionId), String(region.receivedAt ?? "") || null]),
  );

  const rows = (Array.isArray(source.orders) ? source.orders : []).map((value) => {
    const order = record(value);
    const itemType = String(order.itemType ?? "").toLowerCase() === "cargo" ? "cargo" : "item";
    const itemId = decimal(order.itemId);
    const item = record(getEntity(`${itemType === "cargo" ? "cargo" : "items"}:${itemId}`));
    const quantity = decimal(order.quantity);
    const unitPrice = decimal(order.price ?? order.priceThreshold);
    const listedAt = order.timestamp == null ? null : String(order.timestamp);
    return {
      orderKey: decimal(order.entityId),
      regionId: decimal(order.regionId),
      regionName: String(order.regionName ?? `R${decimal(order.regionId)}`),
      marketClaimId: decimal(order.claimEntityId),
      marketClaimName: String(order.claimName ?? ""),
      buyerEntityId: decimal(order.ownerEntityId),
      buyerName: String(order.ownerUsername ?? ""),
      itemId,
      itemType,
      itemName: String(item.name ?? `${itemType === "cargo" ? "Cargo" : "Item"} #${itemId}`),
      tier: item.tier ?? null,
      rarity: String(item.rarity ?? ""),
      rarityStr: String(item.rarity ?? ""),
      iconAssetName: item.iconAssetName ?? null,
      quantity,
      unitPrice,
      totalValue: multiply(quantity, unitPrice),
      storedCoins: decimal(order.storedCoins),
      listedAt,
      firstSeen: listedAt,
      lastSeen: receivedAtByRegion.get(decimal(order.regionId)) ?? observedAt ?? listedAt,
      averageUnitPrice: null,
      salesCount: 0,
      premiumPercent: null,
      opportunityEligible: false,
    };
  });
  const regionalRows = rows.filter((row) => (
    (!allowedRegionIds.size || allowedRegionIds.has(row.regionId))
    && (selectedRegion === "all" || row.regionId === selectedRegion)
  ));
  const unfilteredRegionRows = regionalRows.length;
  const filteredRows = regionalRows.filter((row) => (
    !query || [
      row.itemName,
      row.buyerName,
      row.marketClaimName,
      row.regionName,
      row.rarity,
    ].some((value) => String(value).toLowerCase().includes(query))
  ));

  const sorters = {
    item: (row) => row.itemName,
    tier: (row) => String(row.tier ?? ""),
    rarity: (row) => row.rarity,
    region: (row) => row.regionId,
    buyer: (row) => row.buyerName,
    settlement: (row) => row.marketClaimName,
    quantity: (row) => row.quantity,
    unitPrice: (row) => row.unitPrice,
    totalValue: (row) => row.totalValue,
    premium: () => "0",
    lastSeen: (row) => row.lastSeen ?? "",
  };
  const numericSorts = new Set(["tier", "region", "quantity", "unitPrice", "totalValue", "premium"]);
  const sorter = sorters[sort] ?? sorters.unitPrice;
  filteredRows.sort((left, right) => {
    const result = numericSorts.has(sort)
      ? compareBigInt(sorter(left), sorter(right))
      : compareText(sorter(left), sorter(right));
    return direction === "asc" ? result : -result;
  });
  const total = filteredRows.length;
  const offset = (page - 1) * pageSize;
  return {
    rows: filteredRows.slice(offset, offset + pageSize),
    opportunities: [],
    total,
    unfilteredRegionRows,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    sort,
    direction,
    regionId: selectedRegion || "all",
    sortableFields: Object.keys(sorters),
  };
}
