import { craftDisplayName, isCompletedProductionJob, mergeCurrentCraftRows } from "./productionActivity.mjs";

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

function craftOutputKind(value) {
  return value === "cargo" || value === 1 || value === "1" ? "cargo" : "items";
}

function craftOutputKey(kind, id) {
  return `${kind}:${String(id)}`;
}

function detailPayload(detail) {
  return detail?.detail && typeof detail.detail === "object" ? detail.detail : detail;
}

function expectedPossibilityOutputs(detail, directOutputQuantity) {
  const grouped = new Map();
  for (const possibility of asArray(detailPayload(detail)?.itemListPossibilities)) {
    const display = possibility?.targetItem ?? {};
    const id = String(possibility?.targetId ?? display.id ?? possibility?.itemId ?? "").trim();
    if (!id) continue;
    const kind = craftOutputKind(possibility?.isCargo === true ? "cargo" : possibility?.itemType ?? possibility?.item_type);
    const expectedQuantity = directOutputQuantity * Number(possibility?.quantity ?? 0) * Number(possibility?.chance ?? 1);
    if (!Number.isFinite(expectedQuantity) || expectedQuantity <= 0) continue;
    const key = craftOutputKey(kind, id);
    const current = grouped.get(key) ?? {
      itemId: id,
      kind,
      name: display.name ?? possibility?.name ?? `${kind === "cargo" ? "Cargo" : "Item"} #${id}`,
      tier: display.tier ?? possibility?.tier ?? null,
      tag: display.tag ?? possibility?.tag ?? null,
      iconAssetName: display.iconAssetName ?? possibility?.iconAssetName ?? null,
      quantity: 0,
    };
    current.quantity += expectedQuantity;
    grouped.set(key, current);
  }
  return [...grouped.values()].map((output) => ({ ...output, quantity: Math.round(output.quantity * 1_000_000) / 1_000_000 }));
}

export function trackedCraftPlanOutputs(craftPayloads = [], detailsByKey = new Map()) {
  const payloads = Array.isArray(craftPayloads) ? craftPayloads : [craftPayloads];
  const craftsPayload = {
    items: payloads.flatMap((payload) => asArray(payload?.items)),
    cargos: payloads.flatMap((payload) => asArray(payload?.cargos)),
  };
  const catalog = new Map([
    ...craftsPayload.items.map((item) => [craftOutputKey("items", item.id), item]),
    ...craftsPayload.cargos.map((item) => [craftOutputKey("cargo", item.id), item]),
  ]);
  const publicCrafts = asArray(payloads[0]?.craftResults);
  const playerCrafts = payloads.slice(1).flatMap((payload) => asArray(payload?.craftResults));
  const crafts = mergeCurrentCraftRows(publicCrafts, playerCrafts);

  return crafts.flatMap((craft) => {
    const playerId = String(craft.playerEntityId ?? craft.crafterEntityId ?? craft.crafterId ?? craft.ownerEntityId ?? craft.ownerId ?? craft.characterEntityId ?? "").trim();
    const playerName = String(craft.crafterName ?? craft.crafterUsername ?? craft.ownerUsername ?? craft.playerName ?? craft.userName ?? "").trim();
    const buildingName = String(craft.buildingName ?? craft.stationName ?? craft.craftingStationName ?? "").trim();
    const completed = craft.completed === true || isCompletedProductionJob(craft);
    const craftId = String(craft.entityId ?? craft.id ?? craft.craftEntityId ?? "").trim();
    return asArray(craft.craftedItem ?? craft.craftedItems).flatMap((output, index) => {
      const itemId = String(output.item_id ?? output.itemId ?? output.id ?? "").trim();
      if (!itemId) return [];
      const kind = craftOutputKind(output.item_type ?? output.itemType);
      const item = catalog.get(craftOutputKey(kind, itemId)) ?? {};
      const outputPerCraft = Number(output.quantity ?? output.qty ?? 1) || 1;
      const craftCount = Number(craft.craftCount ?? 0);
      const directQuantity = craftCount > 0 ? craftCount * outputPerCraft : outputPerCraft;
      const base = {
        id: craftId || `${itemId}:${index}`,
        craftId: craftId || `${itemId}:${index}`,
        playerId,
        playerName,
        buildingName,
        status: completed ? "Ready to collect" : "In progress",
        completed,
      };
      const directOutput = {
        ...base,
        itemId,
        kind,
        quantity: directQuantity,
        name: item.name ?? craftDisplayName(craft, craftsPayload),
        iconAssetName: item.iconAssetName ?? null,
        tier: item.tier ?? null,
        tag: item.tag ?? null,
      };
      const possibilities = expectedPossibilityOutputs(detailsByKey.get(craftOutputKey(kind, itemId)), directQuantity)
        .map((possibility) => ({ ...base, ...possibility }));
      return [directOutput, ...possibilities];
    });
  }).filter((item) => item.itemId && item.quantity > 0);
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
  if (/handcart/i.test(name)) return "Handcart";
  if (/\bcart\b/i.test(name)) return "Cart";
  if (/boat|ship/i.test(name)) return "Boat";
  if (/sled/i.test(name)) return "Sled";
  if (/mount/i.test(name)) return "Mount";
  if (/housing/i.test(name)) return "Housing Storage";
  if (/deploy/i.test(name)) return "Deployable Storage";
  return name || "Deployable Storage";
}

function isCartLikeDeployableKind(kind) {
  return kind === "Cart" || kind === "Wagon" || kind === "Handcart";
}

function deployableSourceId(playerId, rawId, kind) {
  return isCartLikeDeployableKind(kind) ? `${playerId}:cart` : `${playerId}:${rawId}`;
}

function deployableLabel(inventoryName, claimName) {
  const kind = deployableKind(inventoryName);
  if (isCartLikeDeployableKind(kind)) return "Cart";
  const roman = String(inventoryName ?? "").match(/\(([^)]+)\)/)?.[1];
  const suffix = roman && !kind.includes(roman) ? ` (${roman})` : "";
  const claim = String(claimName ?? "").trim();
  return `${kind}${suffix}${claim ? ` - ${claim}` : ""}`;
}

function emptyCartDeployableSource(playerId, label) {
  return {
    sourceId: `${playerId}:cart`,
    legacySourceIds: [],
    label: "Cart",
    type: "Player deployable",
    playerId: String(playerId),
    playerName: String(label),
    containerName: "Cart",
    containerKind: "Cart",
    claimName: null,
    items: [],
  };
}

export function playerInventoryContainerSources(playerId, label, payload = {}, allowedDeployableIds = []) {
  const allowedDeployables = new Set(allowedDeployableIds.map(String));
  const lookup = craftPlanCatalogLookup(payload);
  const personalItems = [];
  const deployables = [];
  for (const inventory of playerInventoryRows(payload)) {
    const inventoryName = String(inventory.inventoryName ?? inventory.name ?? inventory.type ?? "Inventory").trim() || "Inventory";
    const rawId = String(inventory.entityId ?? inventory.inventoryId ?? inventory.id ?? inventoryName).trim();
    const rawSourceId = `${playerId}:${rawId}`;
    if (isSettlementStorageInventory(inventory, inventoryName)) continue;
    const items = sourceItemsFromSlots([...asArray(inventory.pockets), ...asArray(inventory.inventory)], lookup);
    if (isPlayerDeployableInventory(inventory, inventoryName)) {
      const claimName = String(inventory.claimName ?? "").trim();
      const containerKind = deployableKind(inventoryName);
      const sourceId = deployableSourceId(playerId, rawId, containerKind);
      deployables.push({
        sourceId,
        legacySourceIds: sourceId === rawSourceId ? [] : [rawSourceId],
        label: deployableLabel(inventoryName, claimName),
        type: "Player deployable",
        playerId: String(playerId),
        playerName: String(label),
        containerName: inventoryName,
        containerKind,
        claimName: claimName || null,
        items,
      });
    } else {
      personalItems.push(...items);
    }
  }
  if (!deployables.some((source) => source.sourceId === `${playerId}:cart`)) {
    deployables.unshift(emptyCartDeployableSource(playerId, label));
  }
  return {
    inventory: { sourceId: playerId, label: `${label} inventory`, type: "Player inventory", items: personalItems },
    deployables: deployables.filter((source) => !allowedDeployables.size || allowedDeployables.has(source.sourceId) || source.legacySourceIds?.some((id) => allowedDeployables.has(id))),
    deployableOptions: deployables.map((source) => ({ ...source, itemCount: source.items.length, items: source.items.slice(0, 12) })),
  };
}
