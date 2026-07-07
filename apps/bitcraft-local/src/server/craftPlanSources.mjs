const DEPLOYABLE_INVENTORY_NAME = /cart|stash|cache|deploy|housing|wagon|chest|container|bank/i;
const PERSONAL_INVENTORY_NAME = /^(?:inventory|toolbelt|wallet)$/i;

export function sourceItemFromContents(contents, lookup = new Map()) {
  const itemId = String(contents?.item_id ?? contents?.itemId ?? "").trim();
  if (!itemId) return null;
  const rawType = contents?.item_type ?? contents?.itemType;
  const kind = rawType === "cargo" || rawType === 1 || rawType === "1" ? "cargo" : "items";
  const item = lookup.get(itemId) ?? {};
  const quantity = Number(contents?.quantity ?? contents?.qty ?? contents?.count ?? 0);
  return {
    id: itemId,
    kind,
    itemType: kind === "cargo" ? 1 : 0,
    quantity,
    name: item.name ?? contents?.name ?? `${kind === "cargo" ? "Cargo" : "Item"} #${itemId}`,
    tier: item.tier ?? contents?.tier ?? null,
    rarityStr: item.rarityStr ?? item.rarity ?? contents?.rarityStr ?? null,
    tag: item.tag ?? contents?.tag ?? null,
    iconAssetName: item.iconAssetName ?? contents?.iconAssetName ?? null,
  };
}

export function sourceItemsFromSlots(slots = [], lookup = new Map()) {
  return (Array.isArray(slots) ? slots : []).map((slot) => sourceItemFromContents(slot?.contents ?? slot, lookup)).filter((item) => item && item.quantity > 0);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function craftPlanCatalogLookup(payload = {}) {
  return new Map([
    ...asArray(payload.items),
    ...asArray(payload.cargos),
    ...asArray(payload.data?.items),
    ...asArray(payload.data?.cargos),
  ].map((item) => [String(item.id ?? item.itemId ?? ""), item]).filter(([id]) => id));
}

export function settlementStorageSourcesFromInventories(inventories = {}, allowedIds = []) {
  const allowed = new Set(allowedIds.map(String));
  const lookup = craftPlanCatalogLookup(inventories);
  const directBuildings = asArray(inventories.buildings);
  const buildings = directBuildings.length ? directBuildings : asArray(inventories.data?.buildings);
  return buildings.map((building) => {
    const sourceId = String(building.entityId ?? building.id ?? building.buildingName ?? "").trim();
    return {
      sourceId,
      label: String(building.buildingNickname ?? building.buildingName ?? (sourceId || "Settlement storage")),
      type: "Settlement storage",
      items: sourceItemsFromSlots(building.inventory, lookup),
    };
  }).filter((source) => source.sourceId && (!allowed.size || allowed.has(source.sourceId)));
}

export function playerInventoryRows(payload = {}) {
  if (Array.isArray(payload.inventories)) return payload.inventories;
  if (Array.isArray(payload.data?.inventories)) return payload.data.inventories;
  if (Array.isArray(payload.inventory)) return payload.inventory;
  if (Array.isArray(payload.data?.inventory)) return payload.data.inventory;
  return [];
}

export function isPlayerDeployableInventory(inventory = {}, inventoryName = "") {
  const name = String(inventoryName || inventory.inventoryName || inventory.name || inventory.type || "Inventory").trim();
  if (PERSONAL_INVENTORY_NAME.test(name)) return false;
  if (DEPLOYABLE_INVENTORY_NAME.test(name)) return true;
  if (inventory.deployable) return true;
  const playerOwnerId = String(inventory.playerOwnerEntityId ?? inventory.playerOwnerId ?? "").trim();
  const entityId = String(inventory.entityId ?? inventory.inventoryId ?? inventory.id ?? "").trim();
  return Boolean(playerOwnerId && entityId && playerOwnerId !== entityId);
}

export function playerInventoryContainerSources(playerId, label, payload = {}, allowedDeployableIds = []) {
  const allowedDeployables = new Set(allowedDeployableIds.map(String));
  const lookup = craftPlanCatalogLookup(payload);
  const personalItems = [];
  const deployables = [];
  for (const inventory of playerInventoryRows(payload)) {
    const inventoryName = String(inventory.inventoryName ?? inventory.name ?? inventory.type ?? "Inventory").trim() || "Inventory";
    const rawId = String(inventory.entityId ?? inventory.inventoryId ?? inventory.id ?? inventoryName).trim();
    const sourceId = `${playerId}:${rawId}`;
    const items = sourceItemsFromSlots([...asArray(inventory.pockets), ...asArray(inventory.inventory)], lookup);
    if (!items.length) continue;
    if (isPlayerDeployableInventory(inventory, inventoryName)) {
      const claimName = String(inventory.claimName ?? "").trim();
      const suffix = claimName ? ` (${claimName})` : "";
      deployables.push({ sourceId, label: `${label} - ${inventoryName}${suffix}`, type: "Player storage", items });
    } else {
      personalItems.push(...items);
    }
  }
  return {
    inventory: { sourceId: playerId, label: `${label} inventory`, type: "Player inventory", items: personalItems },
    deployables: deployables.filter((source) => !allowedDeployables.size || allowedDeployables.has(source.sourceId)),
    deployableOptions: deployables.map((source) => ({ sourceId: source.sourceId, label: source.label, itemCount: source.items.length, items: source.items.slice(0, 12) })),
  };
}
