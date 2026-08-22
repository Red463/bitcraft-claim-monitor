function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function decimalInteger(value, label) {
  const normalized = typeof value === "bigint"
    ? value.toString()
    : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError(`${label} must be a non-negative decimal integer`);
  }
  return normalized;
}

function snapshotListings(snapshot, label) {
  const source = record(snapshot, label);
  if (!Array.isArray(source.listings)) {
    throw new TypeError(`${label}.listings must be an array`);
  }
  return source.listings.map((value, index) => record(value, `${label}.listings[${index}]`));
}

function snapshotClosedListings(snapshot, label) {
  const source = record(snapshot, label);
  if (source.closedListings == null) return [];
  if (!Array.isArray(source.closedListings)) {
    throw new TypeError(`${label}.closedListings must be an array`);
  }
  return source.closedListings.map(
    (value, index) => record(value, `${label}.closedListings[${index}]`),
  );
}

function listingMap(rows, label) {
  const result = new Map();
  for (const [index, row] of rows.entries()) {
    const entityId = decimalInteger(row.entityId, `${label}[${index}].entityId`);
    if (result.has(entityId)) {
      throw new TypeError(`${label} contains duplicate market order ${entityId}`);
    }
    result.set(entityId, row);
  }
  return result;
}

function listingName(row) {
  const explicit = String(row.itemName ?? "").trim();
  if (explicit) return explicit;
  const itemId = decimalInteger(row.itemId, "market order item id");
  return `${String(row.itemType ?? "").toLowerCase() === "cargo" ? "Cargo" : "Item"} #${itemId}`;
}

function transitionListing(row, quantity) {
  const key = decimalInteger(row.entityId, "market order entity id");
  const itemId = decimalInteger(row.itemId, `market order ${key} item id`);
  const normalizedQuantity = decimalInteger(quantity, `market order ${key} transition quantity`);
  const price = decimalInteger(
    row.price ?? row.priceThreshold,
    `market order ${key} price`,
  );
  return {
    key,
    itemName: listingName(row),
    side: String(row.side ?? "sell"),
    owner: String(row.ownerUsername ?? row.ownerName ?? row.owner ?? "").trim() || null,
    ownerEntityId: row.ownerEntityId == null
      ? null
      : decimalInteger(row.ownerEntityId, `market order ${key} owner id`),
    itemId,
    itemType: String(row.itemType ?? "").toLowerCase() === "cargo" ? "cargo" : "item",
    quantity: normalizedQuantity,
    price,
    totalValue: (BigInt(normalizedQuantity) * BigInt(price)).toString(),
    tier: row.itemTier ?? row.tier ?? null,
    rarity: row.itemRarityStr ?? row.rarity ?? null,
    listedAt: row.timestamp ?? row.listedAt ?? null,
    tradeId: null,
    raw: row,
  };
}

function transition({
  eventType,
  activityType,
  row,
  quantity,
  beforeQuantity,
  afterQuantity,
  observedAt,
  summaryPrefix,
}) {
  const listing = transitionListing(row, quantity);
  const edge = `${beforeQuantity}->${afterQuantity}`;
  return {
    eventType,
    activityType,
    occurredAt: observedAt,
    sourceKey: `relay_market_event:${eventType}:${listing.key}:${edge}`,
    activitySourceKey: `relay_market_activity:${eventType}:${listing.key}:${edge}`,
    summary: `${summaryPrefix}: ${listing.itemName} x${BigInt(listing.quantity).toLocaleString("en-US")} at ${BigInt(listing.price).toLocaleString("en-US")}g`,
    listing,
  };
}

function evidenceTimestamp(evidence, fallback) {
  const timestamp = String(evidence.timestamp ?? "");
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : fallback;
}

function optionalDecimalInteger(value, label) {
  if (value == null || String(value).trim() === "") return null;
  return decimalInteger(value, label);
}

function assertSnapshotClaimScope(snapshot, label, configuredClaimId) {
  const source = record(snapshot, label);
  const topLevelClaimId = optionalDecimalInteger(source.claimId, `${label} claim id`);
  const observedClaims = [];
  if (topLevelClaimId != null) observedClaims.push([`${label}.claimId`, topLevelClaimId]);
  for (const [index, listing] of snapshotListings(source, label).entries()) {
    const claimId = optionalDecimalInteger(
      listing.claimEntityId,
      `${label}.listings[${index}].claimEntityId`,
    );
    if (claimId != null) observedClaims.push([`${label}.listings[${index}].claimEntityId`, claimId]);
  }
  for (const [index, evidence] of snapshotClosedListings(source, label).entries()) {
    const claimId = optionalDecimalInteger(
      evidence.claimEntityId,
      `${label}.closedListings[${index}].claimEntityId`,
    );
    if (claimId != null) observedClaims.push([`${label}.closedListings[${index}].claimEntityId`, claimId]);
  }
  const foreign = observedClaims.find(([, claimId]) => claimId !== configuredClaimId);
  if (foreign) {
    throw new TypeError(
      `Relay market claim scope rejected foreign ${foreign[0]} ${foreign[1]}; configured claim is ${configuredClaimId}`,
    );
  }
}

function correlateClosedListingEvidence({
  transitions,
  previousSnapshot,
  currentSnapshot,
  observedAt,
}) {
  const previousClosed = snapshotClosedListings(
    previousSnapshot,
    "previous Relay market snapshot",
  );
  const currentClosed = snapshotClosedListings(
    currentSnapshot,
    "current Relay market snapshot",
  );
  const previousById = listingMap(previousClosed, "previous Relay closed listings");
  const snapshotRegionId = optionalDecimalInteger(
    currentSnapshot.regionId,
    "current Relay market region id",
  );
  const claimedTransitions = new Set();
  const claimedEvidenceIds = new Set();
  const newClosed = currentClosed.filter((evidence) => !previousById.has(
    decimalInteger(evidence.entityId, "current Relay closed listing entity id"),
  ));
  const orderedClosed = [...newClosed].sort((left, right) => {
    const leftIsProceeds = String(left.closureKind ?? "") === "sale_proceeds";
    const rightIsProceeds = String(right.closureKind ?? "") === "sale_proceeds";
    return Number(rightIsProceeds) - Number(leftIsProceeds);
  });

  for (const evidence of orderedClosed) {
    const evidenceId = decimalInteger(
      evidence.entityId,
      "current Relay closed listing entity id",
    );
    if (claimedEvidenceIds.has(evidenceId)) continue;
    const ownerEntityId = decimalInteger(
      evidence.ownerEntityId,
      `closed listing ${evidenceId} owner id`,
    );
    const evidenceItemId = decimalInteger(
      evidence.itemId,
      `closed listing ${evidenceId} item id`,
    );
    const evidenceItemType = String(evidence.itemType ?? "").toLowerCase() === "cargo"
      ? "cargo"
      : "item";
    const evidenceQuantity = decimalInteger(
      evidence.quantity,
      `closed listing ${evidenceId} quantity`,
    );
    const evidenceClaimId = optionalDecimalInteger(
      evidence.claimEntityId,
      `closed listing ${evidenceId} claim id`,
    );
    const evidenceRegionId = optionalDecimalInteger(
      evidence.regionId,
      `closed listing ${evidenceId} region id`,
    ) ?? snapshotRegionId;
    const closureKind = String(evidence.closureKind ?? "");
    const candidates = transitions.filter((candidate) => {
      if (claimedTransitions.has(candidate)) return false;
      const listing = candidate.listing;
      if (listing.side !== "sell" || listing.ownerEntityId !== ownerEntityId) return false;
      const listingClaimId = optionalDecimalInteger(
        listing.raw.claimEntityId,
        `market order ${listing.key} claim id`,
      );
      const listingRegionId = optionalDecimalInteger(
        listing.raw.regionId,
        `market order ${listing.key} region id`,
      ) ?? snapshotRegionId;
      if (
        evidenceClaimId != null
        && listingClaimId != null
        && evidenceClaimId !== listingClaimId
      ) return false;
      if (
        evidenceRegionId != null
        && listingRegionId != null
        && evidenceRegionId !== listingRegionId
      ) return false;
      if (closureKind === "sale_proceeds") {
        return evidenceItemType === "item"
          && evidenceItemId === "1"
          && (
            candidate.eventType === "partial_quantity_drop"
            || candidate.eventType === "removed_or_cancelled"
          )
          && listing.totalValue === evidenceQuantity;
      }
      if (closureKind === "returned_item") {
        return candidate.eventType === "removed_or_cancelled"
          && listing.itemId === evidenceItemId
          && listing.itemType === evidenceItemType
          && listing.quantity === evidenceQuantity;
      }
      return false;
    });
    if (candidates.length !== 1) continue;

    const candidate = candidates[0];
    claimedTransitions.add(candidate);
    let purchaser = null;
    if (closureKind === "sale_proceeds") {
      const proceedsTimestamp = String(evidence.timestamp ?? "").trim();
      const receiptCandidates = newClosed.filter((receipt) => {
        const receiptId = decimalInteger(
          receipt.entityId,
          "current Relay purchase receipt entity id",
        );
        if (claimedEvidenceIds.has(receiptId) || receiptId === evidenceId) return false;
        if (String(receipt.closureKind ?? "") !== "returned_item") return false;
        const receiptOwnerId = decimalInteger(
          receipt.ownerEntityId,
          `closed listing ${receiptId} owner id`,
        );
        if (receiptOwnerId === ownerEntityId) return false;
        const receiptClaimId = optionalDecimalInteger(
          receipt.claimEntityId,
          `closed listing ${receiptId} claim id`,
        );
        const receiptRegionId = optionalDecimalInteger(
          receipt.regionId,
          `closed listing ${receiptId} region id`,
        ) ?? snapshotRegionId;
        const receiptTimestamp = String(receipt.timestamp ?? "").trim();
        return decimalInteger(
          receipt.itemId,
          `closed listing ${receiptId} item id`,
        ) === candidate.listing.itemId
          && (String(receipt.itemType ?? "").toLowerCase() === "cargo" ? "cargo" : "item") === candidate.listing.itemType
          && decimalInteger(
            receipt.quantity,
            `closed listing ${receiptId} quantity`,
          ) === candidate.listing.quantity
          && Boolean(proceedsTimestamp)
          && receiptTimestamp === proceedsTimestamp
          && (evidenceClaimId == null || receiptClaimId == null || receiptClaimId === evidenceClaimId)
          && receiptRegionId === evidenceRegionId;
      });
      if (receiptCandidates.length === 1) {
        const receipt = receiptCandidates[0];
        const receiptId = decimalInteger(
          receipt.entityId,
          "matched Relay purchase receipt entity id",
        );
        const receiptOwnerId = decimalInteger(
          receipt.ownerEntityId,
          `closed listing ${receiptId} purchaser id`,
        );
        const receiptClaimId = optionalDecimalInteger(
          receipt.claimEntityId,
          `closed listing ${receiptId} claim id`,
        );
        const receiptRegionId = optionalDecimalInteger(
          receipt.regionId,
          `closed listing ${receiptId} region id`,
        ) ?? snapshotRegionId;
        const matchingSaleCount = newClosed.filter((proceeds) => {
          if (String(proceeds.closureKind ?? "") !== "sale_proceeds") return false;
          const proceedsId = decimalInteger(
            proceeds.entityId,
            "current Relay sale proceeds entity id",
          );
          const proceedsOwnerId = decimalInteger(
            proceeds.ownerEntityId,
            `closed listing ${proceedsId} owner id`,
          );
          if (proceedsOwnerId === receiptOwnerId) return false;
          const otherTimestamp = String(proceeds.timestamp ?? "").trim();
          if (!otherTimestamp || otherTimestamp !== proceedsTimestamp) return false;
          const proceedsClaimId = optionalDecimalInteger(
            proceeds.claimEntityId,
            `closed listing ${proceedsId} claim id`,
          );
          const proceedsRegionId = optionalDecimalInteger(
            proceeds.regionId,
            `closed listing ${proceedsId} region id`,
          ) ?? snapshotRegionId;
          if (proceedsClaimId != null && receiptClaimId != null && proceedsClaimId !== receiptClaimId) return false;
          if (proceedsRegionId !== receiptRegionId) return false;
          const proceedsValue = decimalInteger(
            proceeds.quantity,
            `closed listing ${proceedsId} quantity`,
          );
          const possibleListings = transitions.filter((entry) => (
            ["partial_quantity_drop", "removed_or_cancelled", "sale_confirmed"].includes(entry.eventType)
            && entry.listing.side === "sell"
            && entry.listing.ownerEntityId === proceedsOwnerId
            && entry.listing.itemId === candidate.listing.itemId
            && entry.listing.itemType === candidate.listing.itemType
            && entry.listing.quantity === candidate.listing.quantity
            && entry.listing.totalValue === proceedsValue
          ));
          return possibleListings.length === 1;
        }).length;
        if (matchingSaleCount === 1) {
          claimedEvidenceIds.add(receiptId);
          purchaser = {
            entityId: receiptOwnerId,
            username: String(receipt.ownerUsername ?? "").trim() || null,
          };
        }
      }
    }
    const listing = {
      ...candidate.listing,
      tradeId: closureKind === "sale_proceeds"
        ? `relay_closed_listing:${evidenceRegionId ?? "unknown"}:${evidenceId}`
        : null,
    };
    const eventType = closureKind === "sale_proceeds"
      ? "sale_confirmed"
      : "listing_returned";
    const activityType = closureKind === "sale_proceeds"
      ? "market_sale_confirmed"
      : "market_listing_returned";
    const prefix = closureKind === "sale_proceeds"
      ? "Confirmed sale"
      : "Listing returned";
    const evidenceAt = evidenceTimestamp(evidence, observedAt);
    const index = transitions.indexOf(candidate);
    transitions[index] = {
      eventType,
      activityType,
      occurredAt: evidenceAt,
      sourceKey: `relay_market_event:${eventType}:${evidenceRegionId ?? "unknown"}:${evidenceId}`,
      activitySourceKey: `relay_market_activity:${eventType}:${evidenceRegionId ?? "unknown"}:${evidenceId}`,
      summary: `${prefix}: ${listing.itemName} x${BigInt(listing.quantity).toLocaleString("en-US")} at ${BigInt(listing.price).toLocaleString("en-US")}g`,
      listing,
      evidence,
      ...(purchaser ? { purchaser } : {}),
    };
  }
  return transitions;
}

export function deriveRelayMarketTransitions({
  previous,
  current,
  observedAt,
}) {
  const currentSnapshot = record(current, "current Relay market snapshot");
  const currentRows = snapshotListings(currentSnapshot, "current Relay market snapshot");
  if (previous == null) return [];
  const previousSnapshot = record(previous, "previous Relay market snapshot");
  const previousClaimId = decimalInteger(
    previousSnapshot.claimId,
    "previous Relay market claim id",
  );
  const currentClaimId = decimalInteger(
    currentSnapshot.claimId,
    "current Relay market claim id",
  );
  if (previousClaimId !== currentClaimId) {
    throw new TypeError("Relay market snapshots belong to different claims");
  }
  if (!Number.isFinite(Date.parse(String(observedAt)))) {
    throw new TypeError("Relay market transition observedAt must be an ISO timestamp");
  }

  const previousRows = snapshotListings(previousSnapshot, "previous Relay market snapshot");
  const previousById = listingMap(previousRows, "previous Relay market listings");
  const currentById = listingMap(currentRows, "current Relay market listings");
  const transitions = [];

  for (const row of currentRows) {
    const entityId = decimalInteger(row.entityId, "current market order entity id");
    const currentQuantity = decimalInteger(
      row.quantity,
      `current market order ${entityId} quantity`,
    );
    const previousRow = previousById.get(entityId);
    if (!previousRow) {
      transitions.push(transition({
        eventType: "new_listing",
        activityType: "market_new_listing",
        row,
        quantity: currentQuantity,
        beforeQuantity: "0",
        afterQuantity: currentQuantity,
        observedAt,
        summaryPrefix: "New market listing",
      }));
      continue;
    }
    const previousQuantity = decimalInteger(
      previousRow.quantity,
      `previous market order ${entityId} quantity`,
    );
    if (BigInt(currentQuantity) < BigInt(previousQuantity)) {
      const dropped = (BigInt(previousQuantity) - BigInt(currentQuantity)).toString();
      transitions.push(transition({
        eventType: "partial_quantity_drop",
        activityType: "market_quantity_drop",
        row,
        quantity: dropped,
        beforeQuantity: previousQuantity,
        afterQuantity: currentQuantity,
        observedAt,
        summaryPrefix: "Quantity dropped",
      }));
    }
  }

  for (const row of previousRows) {
    const entityId = decimalInteger(row.entityId, "previous market order entity id");
    if (currentById.has(entityId)) continue;
    const previousQuantity = decimalInteger(
      row.quantity,
      `previous market order ${entityId} quantity`,
    );
    transitions.push(transition({
      eventType: "removed_or_cancelled",
      activityType: "market_removed_or_cancelled",
      row,
      quantity: previousQuantity,
      beforeQuantity: previousQuantity,
      afterQuantity: "0",
      observedAt,
      summaryPrefix: "Removed/cancelled",
    }));
  }

  return correlateClosedListingEvidence({
    transitions,
    previousSnapshot,
    currentSnapshot,
    observedAt,
  });
}

export function compactRelayMarketTransitionEvents(events) {
  if (!Array.isArray(events)) {
    throw new TypeError("Relay market transition events must be an array");
  }
  return events.map((event, index) => {
    const source = record(event, `Relay market transition event ${index}`);
    const listing = record(source.listing, `Relay market transition event ${index} listing`);
    const compact = {
      eventType: String(source.eventType ?? ""),
      activityType: String(source.activityType ?? ""),
      occurredAt: String(source.occurredAt ?? ""),
      sourceKey: String(source.sourceKey ?? ""),
      activitySourceKey: String(source.activitySourceKey ?? ""),
      summary: String(source.summary ?? ""),
      listing: {
        key: String(listing.key ?? ""),
        itemName: String(listing.itemName ?? ""),
        side: String(listing.side ?? ""),
        owner: String(listing.owner ?? ""),
        ownerEntityId: String(listing.ownerEntityId ?? ""),
        itemId: String(listing.itemId ?? ""),
        itemType: String(listing.itemType ?? ""),
        quantity: String(listing.quantity ?? ""),
        price: String(listing.price ?? ""),
        totalValue: String(listing.totalValue ?? ""),
        tier: listing.tier == null ? null : String(listing.tier),
        rarity: listing.rarity == null ? null : String(listing.rarity),
        listedAt: listing.listedAt == null ? null : String(listing.listedAt),
        tradeId: listing.tradeId == null ? null : String(listing.tradeId),
      },
    };
    if (source.evidence != null) {
      const evidence = record(source.evidence, `Relay market transition event ${index} evidence`);
      const tradeRegionId = String(listing.tradeId ?? "").match(
        /^relay_closed_listing:(\d+):/,
      )?.[1] ?? null;
      compact.evidence = {
        kind: "closed_listing",
        closureKind: String(evidence.closureKind ?? ""),
        entityId: String(evidence.entityId ?? ""),
        regionId: evidence.regionId == null ? tradeRegionId : String(evidence.regionId),
      };
    }
    return compact;
  });
}

function validatedCompactTransitionEvents(events) {
  return compactRelayMarketTransitionEvents(events).map((event, index) => {
    const label = `Compact Relay market transition event ${index}`;
    if (!event.eventType || !event.activityType || !event.sourceKey
      || !event.activitySourceKey || !event.summary) {
      throw new TypeError(`${label} is incomplete`);
    }
    if (!Number.isFinite(Date.parse(event.occurredAt))) {
      throw new TypeError(`${label} occurredAt must be an ISO timestamp`);
    }
    const listing = event.listing;
    for (const [key, value] of [
      ["listing key", listing.key],
      ["owner entity id", listing.ownerEntityId],
      ["item id", listing.itemId],
      ["quantity", listing.quantity],
      ["price", listing.price],
      ["total value", listing.totalValue],
    ]) {
      decimalInteger(value, `${label} ${key}`);
    }
    if (!listing.itemName || !listing.owner || !["buy", "sell"].includes(listing.side)) {
      throw new TypeError(`${label} listing identity is incomplete`);
    }
    if (!["item", "cargo"].includes(listing.itemType)) {
      throw new TypeError(`${label} item type must be item or cargo`);
    }
    if (event.eventType === "sale_confirmed") {
      const tradeMatch = String(listing.tradeId ?? "").match(
        /^relay_closed_listing:(\d+):(\d+)$/,
      );
      if (!tradeMatch || event.evidence?.kind !== "closed_listing"
        || event.evidence.closureKind !== "sale_proceeds"
        || decimalInteger(event.evidence.entityId, `${label} evidence id`) !== tradeMatch[2]
        || decimalInteger(event.evidence.regionId, `${label} evidence region id`) !== tradeMatch[1]) {
        throw new TypeError(`${label} cannot confirm a sale without matching closed-listing evidence`);
      }
    }
    return event;
  });
}

export function createRelayMarketTransitionWriter(db, {
  addActivity,
  enqueueDiscordActivity = null,
  processOutbox = () => {},
}) {
  if (!db?.prepare || !db?.exec) {
    throw new TypeError("Relay market transition writer requires a SQLite database");
  }
  if (typeof addActivity !== "function") {
    throw new TypeError("Relay market transition writer requires addActivity");
  }
  if (enqueueDiscordActivity != null && typeof enqueueDiscordActivity !== "function") {
    throw new TypeError("Relay market transition Discord enqueue must be a function");
  }
  const insertMarketEvent = db.prepare(`
    INSERT OR IGNORE INTO market_events (
      claim_id, event_type, listing_key, item_name, side, owner,
      owner_entity_id, item_id, item_type, quantity, price, total_value,
      tier, rarity, occurred_at, trade_id, source_key, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMarketTrade = db.prepare(`
    INSERT OR IGNORE INTO market_trades (
      trade_id, claim_id, region_id, order_entity_id, seller_entity_id, seller_username,
      purchaser_entity_id, purchaser_username, item_id, item_type, item_name,
      quantity, unit_price, total_price, tier, rarity, occurred_at, imported_at,
      raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const writeDerived = ({
    claimId,
    events,
    observedAt,
    manageTransaction,
    allowEvidenceDerivedPurchaser,
  }) => {
      const normalizedClaimId = decimalInteger(claimId, "Relay market transition claim id");
      if (!Number.isFinite(Date.parse(String(observedAt)))) {
        throw new TypeError("Relay market transition observedAt must be an ISO timestamp");
      }
      const transitions = allowEvidenceDerivedPurchaser
        ? events
        : validatedCompactTransitionEvents(events);
      let inserted = 0;
      let trades = 0;
      let activities = 0;
      if (manageTransaction) db.exec("BEGIN IMMEDIATE");
      try {
        for (const event of transitions) {
          const listing = event.listing;
          const raw = event.evidence == null
            ? (listing.raw ?? listing)
            : { listing: listing.raw ?? listing, evidence: event.evidence };
          const result = insertMarketEvent.run(
            normalizedClaimId,
            event.eventType,
            listing.key,
            listing.itemName,
            listing.side,
            listing.owner,
            listing.ownerEntityId,
            listing.itemId,
            listing.itemType,
            listing.quantity,
            listing.price,
            listing.totalValue,
            listing.tier == null ? null : String(listing.tier),
            listing.rarity,
            event.occurredAt,
            listing.tradeId,
            event.sourceKey,
            JSON.stringify(raw),
          );
          if (Number(result.changes) === 0) continue;
          inserted += 1;
          if (event.eventType === "sale_confirmed" && listing.tradeId) {
            const regionId = listing.tradeId.match(/^relay_closed_listing:(\d+):/)?.[1];
            if (!regionId) {
              throw new TypeError(`Confirmed Relay trade ${listing.tradeId} has no numeric region id`);
            }
            trades += Number(insertMarketTrade.run(
              listing.tradeId,
              normalizedClaimId,
              regionId,
              listing.key,
              listing.ownerEntityId,
              listing.owner,
              event.purchaser?.entityId ?? null,
              event.purchaser?.username ?? null,
              listing.itemId,
              listing.itemType,
              listing.itemName,
              listing.quantity,
              listing.price,
              listing.totalValue,
              listing.tier == null ? null : String(listing.tier),
              listing.rarity,
              event.occurredAt,
              observedAt,
              JSON.stringify(raw),
            ).changes);
          }
          if (addActivity(
            normalizedClaimId,
            event.activityType,
            event.summary,
            event.occurredAt,
            listing,
            event.activitySourceKey,
            {
              processDiscordImmediately: false,
              enqueueDiscord: enqueueDiscordActivity == null,
            },
          )) {
            activities += 1;
            enqueueDiscordActivity?.(
              normalizedClaimId,
              event.activityType,
              event.summary,
              event.occurredAt,
              listing,
              event.activitySourceKey,
            );
          }
        }
        if (manageTransaction) db.exec("COMMIT");
      } catch (error) {
        if (manageTransaction) db.exec("ROLLBACK");
        throw error;
      }
      if (manageTransaction && activities > 0) processOutbox();
      return { derived: transitions.length, inserted, trades, activities };
  };

  return {
    apply({ claimId, previous, current, observedAt }) {
      const normalizedClaimId = decimalInteger(claimId, "Relay market transition claim id");
      if (previous != null) {
        assertSnapshotClaimScope(previous, "previous Relay market snapshot", normalizedClaimId);
      }
      assertSnapshotClaimScope(current, "current Relay market snapshot", normalizedClaimId);
      return writeDerived({
        claimId: normalizedClaimId,
        events: deriveRelayMarketTransitions({ previous, current, observedAt }),
        observedAt,
        manageTransaction: true,
        allowEvidenceDerivedPurchaser: true,
      });
    },
    applyDerived({ claimId, events, observedAt, manageTransaction = true }) {
      return writeDerived({
        claimId,
        events,
        observedAt,
        manageTransaction,
        allowEvidenceDerivedPurchaser: false,
      });
    },
    kickOutbox() {
      processOutbox();
    },
  };
}
