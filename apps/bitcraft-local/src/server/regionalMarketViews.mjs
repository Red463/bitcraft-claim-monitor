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

function itemType(value) {
  return value === 1 || value === "1" || String(value ?? "").toLowerCase() === "cargo"
    ? "cargo"
    : "item";
}

function catalogItem(value) {
  const source = record(value);
  const type = itemType(source.itemType ?? source.kind);
  const id = decimal(source.itemId ?? source.targetId ?? source.id);
  const tag = String(source.tag ?? source.category ?? "");
  const rarity = String(source.rarity ?? source.rarityStr ?? "");
  return {
    id,
    itemId: id,
    itemType: type,
    name: String(source.name ?? `${type === "cargo" ? "Cargo" : "Item"} #${id}`),
    category: tag,
    tag,
    tier: source.tier ?? null,
    rarity,
    rarityStr: rarity,
    iconAssetName: source.iconAssetName ?? null,
  };
}

function scopedOrders(snapshot, options = {}) {
  const source = record(snapshot);
  const selectedRegion = String(options.regionId ?? "all").trim().toLowerCase() || "all";
  const allowedRegionIds = new Set(regionIds(options.allowedRegionIds));
  return (Array.isArray(source.orders) ? source.orders : [])
    .map(record)
    .filter((order) => {
      const regionId = decimal(order.regionId);
      return (!allowedRegionIds.size || allowedRegionIds.has(regionId))
        && (selectedRegion === "all" || regionId === selectedRegion);
    });
}

function scopedStalls(snapshot, options = {}) {
  const source = record(snapshot);
  const selectedRegion = String(options.regionId ?? "all").trim().toLowerCase() || "all";
  const allowedRegionIds = new Set(regionIds(options.allowedRegionIds));
  return (Array.isArray(source.stalls) ? source.stalls : [])
    .map(record)
    .filter((stall) => {
      const regionId = decimal(stall.regionId);
      return (!allowedRegionIds.size || allowedRegionIds.has(regionId))
        && (selectedRegion === "all" || regionId === selectedRegion);
    });
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

export function combinedMarketStatus(orderStatus, catalogSource, options = {}) {
  const orders = record(orderStatus);
  if (!catalogSource || typeof catalogSource !== "object" || Array.isArray(catalogSource)) {
    return {
      freshness: "unavailable",
      confidence: "unknown",
      ageMs: null,
      warnings: ["Relay global catalog has not loaded yet."],
    };
  }
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const staleAfterMs = Math.max(1_000, Number(options.staleAfterMs) || 60_000);
  const receivedAtMs = Date.parse(String(catalogSource.receivedAt ?? ""));
  const catalogAgeMs = Number.isFinite(receivedAtMs) ? Math.max(0, nowMs - receivedAtMs) : null;
  const subscription = record(options.runtimeHealth?.subscription);
  const runtimeKnown = Object.keys(subscription).length > 0;
  const runtimeHealthy = runtimeKnown
    && subscription.connected === true
    && subscription.applied === true
    && !subscription.lastError;
  const catalogStale = runtimeKnown
    ? !runtimeHealthy
    : catalogAgeMs == null || catalogAgeMs > staleAfterMs;
  const warnings = Array.isArray(orders.warnings) ? orders.warnings.map(String) : [];
  if (catalogStale) {
    if (subscription.lastError) {
      warnings.push(`Relay global catalog error: ${String(subscription.lastError)}`);
    } else if (runtimeKnown && subscription.connected !== true) {
      warnings.push("Relay global catalog subscription is disconnected.");
    } else if (catalogAgeMs == null) {
      warnings.push("Relay global catalog has no valid receive time.");
    } else {
      warnings.push(`Relay global catalog is older than ${Math.round(staleAfterMs / 1_000)} seconds.`);
    }
  }
  const orderAgeMs = Number.isFinite(Number(orders.ageMs)) ? Number(orders.ageMs) : null;
  const ageMs = [orderAgeMs, catalogAgeMs].filter((age) => age != null);
  return {
    freshness: orders.freshness === "unavailable"
      ? "unavailable"
      : catalogStale || orders.freshness === "stale"
        ? "stale"
        : "fresh",
    confidence: catalogStale || orders.confidence !== "authoritative"
      ? (orders.freshness === "unavailable" ? "unknown" : "partial")
      : "authoritative",
    ageMs: ageMs.length ? Math.max(...ageMs) : null,
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

  const rows = (Array.isArray(source.orders) ? source.orders : [])
    .map(record)
    .filter((order) => String(order.side ?? "buy").toLowerCase() !== "sell")
    .map((order) => {
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

export function regionalMarketCatalogView(snapshot, catalogRows, options = {}) {
  const counts = new Map();
  for (const order of scopedOrders(snapshot, options)) {
    const key = `${itemType(order.itemType)}:${decimal(order.itemId)}`;
    const current = counts.get(key) ?? { sell: 0, buy: 0 };
    if (String(order.side ?? "buy").toLowerCase() === "sell") current.sell += 1;
    else current.buy += 1;
    counts.set(key, current);
  }

  const query = String(options.query ?? options.q ?? "").trim().toLowerCase();
  const category = String(options.category ?? "").trim();
  const availableOnly = options.availableOnly === true || options.availableOnly === "true";
  const hasSell = options.hasSell === true || options.hasSell === "true";
  const hasBuy = options.hasBuy === true || options.hasBuy === "true";
  const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit) || 12)));
  const items = (Array.isArray(catalogRows) ? catalogRows : []).flatMap((value) => {
    const item = catalogItem(value);
    if (query && !item.name.toLowerCase().includes(query)) return [];
    if (category && item.category !== category) return [];
    const orderCounts = counts.get(`${item.itemType}:${item.itemId}`) ?? { sell: 0, buy: 0 };
    if (availableOnly && orderCounts.sell + orderCounts.buy === 0) return [];
    if (hasSell && orderCounts.sell === 0) return [];
    if (hasBuy && orderCounts.buy === 0) return [];
    return [{
      ...item,
      sellOrders: orderCounts.sell,
      buyOrders: orderCounts.buy,
      orderCount: orderCounts.sell + orderCounts.buy,
      hasSellOrders: orderCounts.sell > 0,
      hasBuyOrders: orderCounts.buy > 0,
    }];
  });
  const sort = String(options.sort ?? "relevance").toLowerCase();
  if (sort === "name") {
    items.sort((left, right) => left.name.localeCompare(right.name));
  } else if (sort === "orders") {
    items.sort((left, right) => (
      right.orderCount - left.orderCount || left.name.localeCompare(right.name)
    ));
  }
  return {
    items: items.slice(0, limit),
    categories: [...new Set(items.map((item) => item.category).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right)),
  };
}

export function regionalMarketOrderBookView(snapshot, catalogRow, options = {}) {
  const requestedType = itemType(options.itemType);
  const requestedId = decimal(options.itemId);
  const orders = scopedOrders(snapshot, options)
    .filter((order) => (
      itemType(order.itemType) === requestedType
      && decimal(order.itemId) === requestedId
    ))
    .map((order) => ({
      ...order,
      entityId: decimal(order.entityId),
      claimEntityId: decimal(order.claimEntityId),
      regionId: decimal(order.regionId),
      ownerEntityId: decimal(order.ownerEntityId),
      itemId: requestedId,
      itemType: requestedType,
      price: decimal(order.price ?? order.priceThreshold),
      priceThreshold: decimal(order.priceThreshold ?? order.price),
      quantity: decimal(order.quantity),
      storedCoins: decimal(order.storedCoins),
    }));
  return {
    item: catalogItem(catalogRow ?? {
      itemType: requestedType,
      targetId: requestedId,
    }),
    sellOrders: orders.filter((order) => String(order.side).toLowerCase() === "sell"),
    buyOrders: orders.filter((order) => String(order.side).toLowerCase() !== "sell"),
  };
}

function exactMedian(values) {
  const sorted = values
    .map(decimal)
    .sort(compareBigInt);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  const numerator = BigInt(sorted[middle - 1]) + BigInt(sorted[middle]);
  const whole = numerator / 2n;
  return numerator % 2n === 0n ? whole.toString() : `${whole}.5`;
}

function sumDecimal(values) {
  return values.reduce((total, value) => total + BigInt(decimal(value)), 0n).toString();
}

export function regionalMarketPriceQuote(snapshot, catalogRow, options = {}) {
  const orderBook = regionalMarketOrderBookView(snapshot, catalogRow, options);
  const sellPrices = orderBook.sellOrders.map((order) => order.price);
  const buyPrices = orderBook.buyOrders.map((order) => order.price);
  const sortedSellPrices = [...sellPrices].sort(compareBigInt);
  const sortedBuyPrices = [...buyPrices].sort(compareBigInt);
  return {
    item: orderBook.item,
    regionId: String(options.regionId ?? "all").trim().toLowerCase() || "all",
    sell: {
      orderCount: orderBook.sellOrders.length,
      totalQuantity: sumDecimal(orderBook.sellOrders.map((order) => order.quantity)),
      lowestUnitPrice: sortedSellPrices[0] ?? null,
      medianUnitPrice: exactMedian(sellPrices),
    },
    buy: {
      orderCount: orderBook.buyOrders.length,
      totalQuantity: sumDecimal(orderBook.buyOrders.map((order) => order.quantity)),
      highestUnitPrice: sortedBuyPrices.at(-1) ?? null,
    },
  };
}

export function regionalMarketStallsView(snapshot, options = {}) {
  const getEntity = typeof options.getEntity === "function" ? options.getEntity : () => null;
  const query = String(options.query ?? options.search ?? "").trim().toLowerCase();
  const activeOnly = options.activeOnly === true
    || options.activeOnly === "true"
    || options.hideEmpty === true
    || options.hideEmpty === "true";
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(options.pageSize) || 20)));
  const requestedPage = Math.max(1, Math.floor(Number(options.page) || 1));
  const enrichStack = (value) => {
    const stack = record(value);
    const type = itemType(stack.itemType);
    const id = decimal(stack.itemId);
    const entity = record(getEntity(`${type === "cargo" ? "cargo" : "items"}:${id}`));
    return {
      itemId: id,
      itemType: type,
      quantity: decimal(stack.quantity),
      itemName: String(entity.name ?? `${type === "cargo" ? "Cargo" : "Item"} #${id}`),
      iconAssetName: entity.iconAssetName ?? null,
    };
  };
  const stalls = scopedStalls(snapshot, options).flatMap((value) => {
    const stall = record(value);
    const orders = (Array.isArray(stall.orders) ? stall.orders : [])
      .map((orderValue) => {
        const order = record(orderValue);
        return {
          entityId: decimal(order.entityId),
          remainingStock: decimal(order.remainingStock),
          offers: (Array.isArray(order.offers) ? order.offers : []).map(enrichStack),
          requires: (Array.isArray(order.requires) ? order.requires : []).map(enrichStack),
        };
      })
      .filter((order) => !activeOnly || BigInt(order.remainingStock) > 0n);
    if (activeOnly && !orders.length) return [];
    const normalized = {
      ...stall,
      entityId: decimal(stall.entityId),
      regionId: decimal(stall.regionId),
      regionName: `R${decimal(stall.regionId)}`,
      claimEntityId: stall.claimEntityId == null ? null : decimal(stall.claimEntityId),
      ownerEntityId: stall.ownerEntityId == null ? null : decimal(stall.ownerEntityId),
      orders,
      orderCount: orders.length,
    };
    if (query) {
      const values = [
        normalized.entityId,
        normalized.nickname,
        normalized.claimName,
        normalized.ownerName,
        ...orders.flatMap((order) => [
          ...order.offers.map((stack) => stack.itemName),
          ...order.requires.map((stack) => stack.itemName),
        ]),
      ];
      if (!values.some((entry) => String(entry ?? "").toLowerCase().includes(query))) {
        return [];
      }
    }
    return [normalized];
  });
  stalls.sort((left, right) => (
    compareText(left.nickname || left.ownerName, right.nickname || right.ownerName)
    || compareBigInt(left.entityId, right.entityId)
  ));
  const totalStalls = stalls.length;
  const totalOrders = stalls.reduce((total, stall) => total + stall.orders.length, 0);
  const totalPages = Math.max(1, Math.ceil(totalStalls / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  return {
    stalls: stalls.slice(offset, offset + pageSize),
    totalStalls,
    totalOrders,
    page,
    totalPages,
    limit: pageSize,
  };
}

function minimumDecimal(left, right) {
  return compareBigInt(left, right) <= 0 ? decimal(left) : decimal(right);
}

function marketItemForOrder(order, getEntity) {
  const type = itemType(order.itemType);
  const id = decimal(order.itemId);
  const entity = record(getEntity?.(`${type === "cargo" ? "cargo" : "items"}:${id}`));
  return {
    itemId: id,
    itemType: type,
    itemName: String(entity.name ?? `${type === "cargo" ? "Cargo" : "Item"} #${id}`),
    itemIconAssetName: entity.iconAssetName ?? null,
  };
}

export function regionalMarketDealsView(snapshot, options = {}) {
  const getEntity = typeof options.getEntity === "function" ? options.getEntity : () => null;
  const limit = Math.max(1, Math.min(500, Math.floor(Number(options.limit) || 250)));
  const byItem = new Map();
  for (const order of scopedOrders(snapshot, options)) {
    const key = `${itemType(order.itemType)}:${decimal(order.itemId)}`;
    const current = byItem.get(key) ?? { sells: [], buys: [] };
    current[String(order.side).toLowerCase() === "sell" ? "sells" : "buys"].push(order);
    byItem.set(key, current);
  }
  const deals = [];
  for (const { sells, buys } of byItem.values()) {
    sells.sort((left, right) => compareBigInt(left.price, right.price));
    buys.sort((left, right) => compareBigInt(right.price, left.price));
    for (const sell of sells.slice(0, 25)) {
      for (const buy of buys.slice(0, 25)) {
        const buyPrice = BigInt(decimal(sell.price));
        const sellPrice = BigInt(decimal(buy.price));
        if (sellPrice <= buyPrice) break;
        const profit = sellPrice - buyPrice;
        const maxQuantity = minimumDecimal(sell.quantity, buy.quantity);
        const item = marketItemForOrder(sell, getEntity);
        const basisPoints = buyPrice > 0n ? (profit * 10_000n) / buyPrice : 0n;
        deals.push({
          routeKey: `${decimal(sell.entityId)}:${decimal(buy.entityId)}`,
          ...item,
          buyOrderId: decimal(sell.entityId),
          sellOrderId: decimal(buy.entityId),
          buyPrice: buyPrice.toString(),
          sellPrice: sellPrice.toString(),
          buyQuantity: decimal(sell.quantity),
          sellQuantity: decimal(buy.quantity),
          maxQuantity,
          profit: profit.toString(),
          totalPotential: (profit * BigInt(maxQuantity)).toString(),
          profitPercent: Number(basisPoints) / 100,
          buyClaimId: decimal(sell.claimEntityId),
          buyLocation: String(sell.claimName ?? ""),
          buyRegionId: decimal(sell.regionId),
          sellClaimId: decimal(buy.claimEntityId),
          sellLocation: String(buy.claimName ?? ""),
          sellRegionId: decimal(buy.regionId),
          distance: null,
        });
      }
    }
  }
  deals.sort((left, right) => (
    compareBigInt(right.profit, left.profit)
    || compareBigInt(right.totalPotential, left.totalPotential)
    || compareText(left.itemName, right.itemName)
  ));
  return {
    deals: deals.slice(0, limit),
    coverage: "current-orders",
    historyUnavailable: ["movers", "trade-volume", "completed-sales"],
  };
}

export function regionalMarketOverviewView(snapshot, options = {}) {
  const getEntity = typeof options.getEntity === "function" ? options.getEntity : () => null;
  const orders = scopedOrders(snapshot, options);
  const liquidity = new Map();
  const hubs = new Map();
  for (const order of orders) {
    const item = marketItemForOrder(order, getEntity);
    const itemKey = `${item.itemType}:${item.itemId}`;
    const currentItem = liquidity.get(itemKey) ?? {
      ...item,
      iconAssetName: item.itemIconAssetName,
      orderCount: 0,
      offeredQuantity: 0n,
      wantedQuantity: 0n,
      currentNotional: 0n,
    };
    const quantity = BigInt(decimal(order.quantity));
    const price = BigInt(decimal(order.price));
    currentItem.orderCount += 1;
    currentItem[String(order.side).toLowerCase() === "sell" ? "offeredQuantity" : "wantedQuantity"] += quantity;
    currentItem.currentNotional += price * quantity;
    liquidity.set(itemKey, currentItem);

    const claimId = decimal(order.claimEntityId);
    const currentHub = hubs.get(claimId) ?? {
      claimId,
      claimName: String(order.claimName ?? ""),
      regionId: decimal(order.regionId),
      regionName: `R${decimal(order.regionId)}`,
      orderCount: 0,
      sellers: new Set(),
      buyers: new Set(),
    };
    currentHub.orderCount += 1;
    currentHub[String(order.side).toLowerCase() === "sell" ? "sellers" : "buyers"]
      .add(decimal(order.ownerEntityId));
    hubs.set(claimId, currentHub);
  }
  const deals = regionalMarketDealsView(snapshot, {
    ...options,
    getEntity,
    limit: 50,
  });
  return {
    topDeals: deals.deals,
    movers: [],
    moverBaseline: "unavailable",
    mostLiquid: [...liquidity.values()]
      .sort((left, right) => (
        right.orderCount - left.orderCount
        || compareBigInt(right.currentNotional, left.currentNotional)
      ))
      .slice(0, 20)
      .map(({ itemIconAssetName, ...row }) => ({
        ...row,
        offeredQuantity: row.offeredQuantity.toString(),
        wantedQuantity: row.wantedQuantity.toString(),
        currentNotional: row.currentNotional.toString(),
      })),
    hubs: [...hubs.values()]
      .sort((left, right) => right.orderCount - left.orderCount || compareText(left.claimName, right.claimName))
      .slice(0, 20)
      .map(({ sellers, buyers, ...hub }) => ({
        ...hub,
        sellerCount: sellers.size,
        buyerCount: buyers.size,
      })),
    recentActivity: orders
      .map((order) => ({
        id: decimal(order.entityId),
        ...marketItemForOrder(order, getEntity),
        side: String(order.side).toLowerCase() === "sell" ? "sell" : "buy",
        quantity: decimal(order.quantity),
        unitPrice: decimal(order.price),
        claimId: decimal(order.claimEntityId),
        claimName: String(order.claimName ?? ""),
        regionId: decimal(order.regionId),
        regionName: `R${decimal(order.regionId)}`,
        ownerName: String(order.ownerUsername ?? ""),
        createdAt: String(order.timestamp ?? ""),
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 20),
    coverage: deals.coverage,
    historyUnavailable: deals.historyUnavailable,
  };
}
