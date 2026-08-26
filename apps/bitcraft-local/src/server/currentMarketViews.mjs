function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function listings(snapshot) {
  return Array.isArray(snapshot?.listings) ? snapshot.listings : [];
}

function normalizedOwner(value) {
  return String(value ?? "").trim();
}

export function currentMarketListings(snapshot, {
  owner = "",
  observedAt = null,
} = {}) {
  const selectedOwner = normalizedOwner(owner).toLowerCase();
  return listings(snapshot)
    .filter((row) => {
      if (!selectedOwner) return true;
      return normalizedOwner(
        row.ownerUsername ?? row.ownerName ?? row.owner,
      ).toLowerCase() === selectedOwner;
    })
    .map((row) => {
      const quantity = toNumber(row.quantity);
      const price = toNumber(row.price ?? row.priceThreshold);
      const listedAt = row.timestamp ?? row.listedAt ?? observedAt;
      return {
        listing_key: String(row.entityId ?? ""),
        item_name: String(row.itemName ?? row.name ?? "Unknown item"),
        quantity,
        price,
        total_value: quantity * price,
        owner: normalizedOwner(
          row.ownerUsername ?? row.ownerName ?? row.owner,
        ) || null,
        owner_entity_id: row.ownerEntityId == null
          ? null
          : String(row.ownerEntityId),
        item_id: row.itemId == null ? null : String(row.itemId),
        item_type: String(row.itemType ?? "").toLowerCase() === "cargo"
          ? "cargo"
          : "item",
        tier: row.itemTier ?? row.tier ?? null,
        rarity: row.itemRarityStr ?? row.rarity ?? null,
        side: String(row.side ?? "sell"),
        first_seen: listedAt,
        last_seen: observedAt ?? listedAt,
        raw_json: JSON.stringify(row),
      };
    });
}

export function marketLeaderboardFromCurrent({
  snapshot,
  trades = [],
  observedAt = null,
}) {
  const activeListings = currentMarketListings(snapshot, { observedAt });
  const members = new Map();
  const getMember = (name, id = "") => {
    const memberName = normalizedOwner(name);
    if (!memberName) return null;
    const memberId = String(id ?? "").trim();
    const key = (memberId || memberName).toLowerCase();
    const current = members.get(key) ?? {
      memberId: memberId || null,
      name: memberName,
      activeListings: 0,
      activeListingValue: 0,
      confirmedSales: 0,
      confirmedSaleValue: 0,
      unitsSold: 0,
      lastSaleAt: null,
    };
    if (!current.memberId && memberId) current.memberId = memberId;
    members.set(key, current);
    return current;
  };

  for (const listing of activeListings) {
    const member = getMember(listing.owner, listing.owner_entity_id);
    if (!member) continue;
    member.activeListings += 1;
    member.activeListingValue += toNumber(listing.total_value);
  }
  for (const trade of trades) {
    const member = getMember(trade.seller_username, trade.seller_entity_id);
    if (!member) continue;
    member.confirmedSales += 1;
    member.confirmedSaleValue += toNumber(trade.total_price);
    member.unitsSold += toNumber(trade.quantity);
    const occurredAt = trade.occurred_at == null ? null : String(trade.occurred_at);
    if (occurredAt && (!member.lastSaleAt || occurredAt > member.lastSaleAt)) {
      member.lastSaleAt = occurredAt;
    }
  }

  const memberList = [...members.values()].sort((a, b) => (
    b.confirmedSaleValue - a.confirmedSaleValue
    || b.activeListingValue - a.activeListingValue
    || a.name.localeCompare(b.name)
  ));
  const lastSaleAt = trades.reduce((latest, trade) => {
    const occurredAt = trade.occurred_at == null ? null : String(trade.occurred_at);
    return occurredAt && (!latest || occurredAt > latest) ? occurredAt : latest;
  }, null);
  return {
    summary: {
      memberCount: memberList.length,
      activeListings: activeListings.length,
      activeListingValue: memberList.reduce(
        (sum, row) => sum + toNumber(row.activeListingValue),
        0,
      ),
      confirmedSales: trades.length,
      confirmedSaleValue: memberList.reduce(
        (sum, row) => sum + toNumber(row.confirmedSaleValue),
        0,
      ),
      unitsSold: memberList.reduce(
        (sum, row) => sum + toNumber(row.unitsSold),
        0,
      ),
      lastSaleAt,
    },
    members: memberList,
  };
}
