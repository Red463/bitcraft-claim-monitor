import { toNumber, type AnyRecord } from "../main-app-data.ts";
export { gameIconSources, gameIconUrl } from "./gameAssets.mjs";

export function catalogEntries(catalog: unknown): AnyRecord[] {
  if (Array.isArray(catalog)) return catalog;
  return Object.entries(catalog ?? {}).map(([id, item]) => ({ id, ...(item as AnyRecord) }));
}

export function playerInventoryItems(payload: AnyRecord | null | undefined, inventoryName?: string): AnyRecord[] {
  const lookup = new Map(catalogEntries(payload?.items).map((item) => [String(item.id), item]));
  return (payload?.inventories ?? [])
    .filter((inventory: AnyRecord) => !inventoryName || inventory.inventoryName === inventoryName)
    .flatMap((inventory: AnyRecord) => (inventory.pockets ?? inventory.inventory ?? []).flatMap((slot: AnyRecord) => {
      const contents = slot.contents ?? {};
      const itemId = contents.itemId ?? contents.item_id;
      const itemType = contents.itemType ?? contents.item_type;
      if (itemId == null || itemType === 1 || itemType === "cargo") return [];
      const item = lookup.get(String(itemId));
      return item ? [{
        ...item,
        quantity: typeof contents.quantity === "bigint"
          ? contents.quantity.toString()
          : contents.quantity ?? "0",
        inventoryName: inventory.inventoryName ?? "Inventory",
      }] : [];
    }));
}

export function playerToolbeltTools(payload: AnyRecord | null | undefined): AnyRecord[] {
  return playerInventoryItems(payload, "Toolbelt").filter((item) => (
    item.toolType != null || String(item.tag ?? item.tags ?? "").includes("Tool")
  ));
}

export function isMarketableItem(item: AnyRecord): boolean {
  const name = String(item.name ?? "");
  const hasOrders = item.hasSellOrders === true || item.hasBuyOrders === true || toNumber(item.sellOrders) > 0 || toNumber(item.buyOrders) > 0;
  return Boolean(item.id && name) && !/\b(Output|Input)\b/i.test(name) && hasOrders;
}

export function equipmentSlots(payload: AnyRecord | null | undefined): AnyRecord[] {
  if (Array.isArray(payload?.equipmentSlots)) return payload.equipmentSlots;
  if (Array.isArray(payload?.equipment)) return payload.equipment;
  return [];
}

const VISIBLE_EQUIPMENT_SLOTS = [
  "head_clothing",
  "torso_clothing",
  "hand_clothing",
  "belt_clothing",
  "leg_clothing",
  "feet_clothing",
  "head_artifact",
  "hand_artifact",
] as const;

function slotKey(slot: AnyRecord): string {
  return String(slot.primary ?? slot.secondary ?? "").toLowerCase();
}

export function visibleEquipmentSlots(slots: AnyRecord[]): AnyRecord[] {
  const bySlot = new Map(slots.map((slot) => [slotKey(slot), slot]));
  const visible = VISIBLE_EQUIPMENT_SLOTS.map((key) => ({ primary: key, ...(bySlot.get(key) ?? {}) }));
  const unexpectedEquipped = slots.filter((slot) => slot.item && !VISIBLE_EQUIPMENT_SLOTS.includes(slotKey(slot) as typeof VISIBLE_EQUIPMENT_SLOTS[number]));
  return [...visible, ...unexpectedEquipped];
}

export function equipmentPresets(payload: AnyRecord | null | undefined, fallbackSlots: AnyRecord[]): AnyRecord[] {
  const presets = (Array.isArray(payload?.presets) ? payload.presets : [])
    .slice()
    .sort((left: AnyRecord, right: AnyRecord) => toNumber(left.index) - toNumber(right.index));
  const currentSlots = fallbackSlots.length
    ? fallbackSlots
    : equipmentSlots(presets.find((preset: AnyRecord) => preset.active) ?? {});
  return [
    {
      id: "current-equipment",
      label: "Current Gear",
      active: true,
      reported: currentSlots.length > 0,
      slots: currentSlots,
    },
    ...presets.map((preset: AnyRecord, index: number) => ({
      id: String(preset.entityId ?? preset.id ?? `preset-${index + 1}`),
      label: `Preset ${index + 1}`,
      active: false,
      reported: true,
      slots: equipmentSlots(preset),
    })),
  ];
}

export function equippedCount(slots: AnyRecord[]): number {
  return slots.filter((slot) => slot.item).length;
}
