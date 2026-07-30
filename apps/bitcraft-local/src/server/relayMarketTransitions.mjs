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

  return transitions;
}

export function createRelayMarketTransitionWriter(db, {
  addActivity,
  processOutbox = () => {},
}) {
  if (!db?.prepare || !db?.exec) {
    throw new TypeError("Relay market transition writer requires a SQLite database");
  }
  if (typeof addActivity !== "function") {
    throw new TypeError("Relay market transition writer requires addActivity");
  }
  const insertMarketEvent = db.prepare(`
    INSERT OR IGNORE INTO market_events (
      claim_id, event_type, listing_key, item_name, side, owner,
      owner_entity_id, item_id, item_type, quantity, price, total_value,
      tier, rarity, occurred_at, trade_id, source_key, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    apply({ claimId, previous, current, observedAt }) {
      const normalizedClaimId = decimalInteger(claimId, "Relay market transition claim id");
      const transitions = deriveRelayMarketTransitions({
        previous,
        current,
        observedAt,
      });
      let inserted = 0;
      let activities = 0;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const event of transitions) {
          const listing = event.listing;
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
            null,
            event.sourceKey,
            JSON.stringify(listing.raw),
          );
          if (Number(result.changes) === 0) continue;
          inserted += 1;
          if (addActivity(
            normalizedClaimId,
            event.activityType,
            event.summary,
            event.occurredAt,
            listing,
            event.activitySourceKey,
            { processDiscordImmediately: false },
          )) {
            activities += 1;
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      if (activities > 0) processOutbox();
      return { derived: transitions.length, inserted, activities };
    },
  };
}
