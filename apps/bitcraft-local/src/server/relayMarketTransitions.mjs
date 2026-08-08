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

  for (const evidence of currentClosed) {
    const evidenceId = decimalInteger(
      evidence.entityId,
      "current Relay closed listing entity id",
    );
    if (previousById.has(evidenceId)) continue;
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
  const insertMarketTrade = db.prepare(`
    INSERT OR IGNORE INTO market_trades (
      trade_id, claim_id, region_id, order_entity_id, seller_entity_id, seller_username,
      purchaser_entity_id, purchaser_username, item_id, item_type, item_name,
      quantity, unit_price, total_price, tier, rarity, occurred_at, imported_at,
      raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    apply({ claimId, previous, current, observedAt }) {
      const normalizedClaimId = decimalInteger(claimId, "Relay market transition claim id");
      if (previous != null) {
        assertSnapshotClaimScope(previous, "previous Relay market snapshot", normalizedClaimId);
      }
      assertSnapshotClaimScope(current, "current Relay market snapshot", normalizedClaimId);
      const transitions = deriveRelayMarketTransitions({
        previous,
        current,
        observedAt,
      });
      let inserted = 0;
      let trades = 0;
      let activities = 0;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const event of transitions) {
          const listing = event.listing;
          const raw = event.evidence == null
            ? listing.raw
            : { listing: listing.raw, evidence: event.evidence };
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
              null,
              null,
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
      return { derived: transitions.length, inserted, trades, activities };
    },
  };
}
