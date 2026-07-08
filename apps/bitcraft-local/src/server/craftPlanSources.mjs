const DEPLOYABLE_INVENTORY_NAME = /cart|stash|cache|deploy|housing|wagon|handcart|boat|ship|sled|mount/i;
const SETTLEMENT_STORAGE_INVENTORY_NAME = /town bank|settlement storage|claim storage|community storage|bank/i;
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

export function isSettlementStorageInventory(inventory = {}, inventoryName = "") {
  const name = String(inventoryName || inventory.inventoryName || inventory.name || inventory.type || "Inventory").trim();
  return SETTLEMENT_STORAGE_INVENTORY_NAME.test(name);
}

export function isPlayerDeployableInventory(inventory = {}, inventoryName = "") {
  const name = String(inventoryName || inventory.inventoryName || inventory.name || inventory.type || "Inventory").trim();
  if (PERSONAL_INVENTORY_NAME.test(name)) return false;
  if (isSettlementStorageInventory(inventory, name)) return false;
  if (DEPLOYABLE_INVENTORY_NAME.test(name)) return true;
  if (inventory.deployable) return true;
  return false;
}

function deployableKind(inventoryName) {
  const name = String(inventoryName ?? "").trim();
  if (/personal\s+(cache|stash)|cache|stash/i.test(name)) return "Personal Cache";
  if (/wagon/i.test(name)) return "Wagon";
  if (/handcart|\bcart\b/i.test(name)) return "Cart";
  if (/boat|ship/i.test(name)) return "Boat";
  if (/sled/i.test(name)) return "Sled";
  if (/mount/i.test(name)) return "Mount";
  if (/housing/i.test(name)) return "Housing Storage";
  if (/deploy/i.test(name)) return "Deployable Storage";
  return name || "Deployable Storage";
}

function deployableLabel(inventoryName, claimName) {
  const kind = deployableKind(inventoryName);
  const roman = String(inventoryName ?? "").match(/\(([^)]+)\)/)?.[1];
  const suffix = roman && !kind.includes(roman) ? ` (${roman})` : "";
  const claim = String(claimName ?? "").trim();
  return `${kind}${suffix}${claim ? ` - ${claim}` : ""}`;
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
    if (isSettlementStorageInventory(inventory, inventoryName)) continue;
    const items = sourceItemsFromSlots([...asArray(inventory.pockets), ...asArray(inventory.inventory)], lookup);
    if (!items.length) continue;
    if (isPlayerDeployableInventory(inventory, inventoryName)) {
      const claimName = String(inventory.claimName ?? "").trim();
      deployables.push({
        sourceId,
        label: deployableLabel(inventoryName, claimName),
        type: "Player deployable",
        playerId: String(playerId),
        playerName: String(label),
        containerName: inventoryName,
        containerKind: deployableKind(inventoryName),
        claimName: claimName || null,
        items,
      });
    } else {
      personalItems.push(...items);
    }
  }
  return {
    inventory: { sourceId: playerId, label: `${label} inventory`, type: "Player inventory", items: personalItems },
    deployables: deployables.filter((source) => !allowedDeployables.size || allowedDeployables.has(source.sourceId)),
    deployableOptions: deployables.map((source) => ({ ...source, itemCount: source.items.length, items: source.items.slice(0, 12) })),
  };
}
