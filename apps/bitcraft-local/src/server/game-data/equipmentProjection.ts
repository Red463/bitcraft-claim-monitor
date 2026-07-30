type CatalogRecord = Record<string, unknown>;

type EquipmentItem = CatalogRecord & {
  id?: unknown;
  itemId?: unknown;
  itemType?: unknown;
};

type EquipmentSlot = CatalogRecord & {
  item?: EquipmentItem | null;
};

type EquipmentMember = CatalogRecord & {
  equipment?: { equipmentSlots?: EquipmentSlot[] };
  equipmentPresets?: { presets?: Array<CatalogRecord & { equipmentSlots?: EquipmentSlot[] }> };
  buffs?: { buffs?: CatalogRecord[] };
};

function decimalId(value: unknown, label: string): string {
  const id = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new TypeError(`${label} must be a decimal integer`);
  return id;
}

export function enrichEquipmentWithCatalog(
  snapshot: unknown,
  getEntity: (catalogKey: string) => CatalogRecord | null,
  getDescription: (kind: string, id: string) => CatalogRecord | null,
) {
  const source = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as CatalogRecord
    : {};
  const members = Array.isArray(source.members) ? source.members as EquipmentMember[] : [];
  const itemCache = new Map<string, CatalogRecord | null>();
  const descriptionCache = new Map<string, CatalogRecord | null>();

  const description = (kind: string, id: string) => {
    const key = `${kind}:${id}`;
    if (!descriptionCache.has(key)) descriptionCache.set(key, getDescription(kind, id));
    return descriptionCache.get(key) ?? null;
  };
  const item = (value: EquipmentItem | null | undefined) => {
    if (!value) return null;
    const id = decimalId(value.itemId ?? value.id, "equipment item id");
    const key = `items:${id}`;
    if (!itemCache.has(key)) itemCache.set(key, getEntity(key));
    const entity = itemCache.get(key) ?? {};
    const equipment = description("equipment", id) ?? {};
    const tool = description("tool", id);
    return {
      ...entity,
      ...value,
      id,
      itemId: id,
      ...(Array.isArray(equipment.stats) ? { stats: equipment.stats } : {}),
      ...(tool ? {
        toolType: tool.toolType,
        toolLevel: tool.level,
        toolPower: tool.power,
      } : {}),
    };
  };
  const slots = (values: unknown) => (
    Array.isArray(values)
      ? values.map((slot) => {
        const row = slot && typeof slot === "object" && !Array.isArray(slot)
          ? slot as EquipmentSlot
          : {};
        return { ...row, item: item(row.item) };
      })
      : []
  );

  return {
    ...source,
    members: members.map((member) => ({
      ...member,
      equipment: {
        ...(member.equipment ?? {}),
        equipmentSlots: slots(member.equipment?.equipmentSlots),
      },
      equipmentPresets: {
        ...(member.equipmentPresets ?? {}),
        presets: (Array.isArray(member.equipmentPresets?.presets)
          ? member.equipmentPresets.presets
          : []).map((preset) => ({
          ...preset,
          equipmentSlots: slots(preset.equipmentSlots),
        })),
      },
      buffs: {
        ...(member.buffs ?? {}),
        buffs: (Array.isArray(member.buffs?.buffs) ? member.buffs.buffs : []).map((buff) => {
          const id = decimalId(buff.buffId, "buff id");
          const catalog = description("buff", id) ?? {};
          return { ...buff, ...catalog, buffId: id };
        }),
      },
    })),
  };
}
