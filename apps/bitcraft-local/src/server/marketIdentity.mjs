function decimalIdentity(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : "0";
}

export function normalizeMarketItemType(value) {
  return value === 1 || value === "1" || String(value ?? "").toLowerCase() === "cargo"
    ? "cargo"
    : "item";
}

export function marketIdentityKey(regionId, itemType, itemId) {
  return `${decimalIdentity(regionId)}:${normalizeMarketItemType(itemType)}:${decimalIdentity(itemId)}`;
}

export function parseMarketIdentityKey(value) {
  const match = String(value ?? "").match(/^(\d+):(item|cargo):(\d+)$/);
  return match
    ? { regionId: match[1], itemType: match[2], itemId: match[3] }
    : null;
}
