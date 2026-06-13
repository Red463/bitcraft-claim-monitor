export type AnyRecord = Record<string, any>;

export function unwrap<T>(payload: any, key: string, fallback: T): T {
  if (Array.isArray(payload)) return payload as T;
  return (payload?.[key] ?? fallback) as T;
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function parseDateValue(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value.trim()))) {
    const text = String(value).trim();
    const numeric = Number(text);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const millis = text.length >= 16 ? numeric / 1000 : text.length <= 10 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function claimSupplyRunOutAt(claim: AnyRecord): unknown {
  return claim.suppliesRunOutAt ?? claim.suppliesRunOut ?? claim.supplyRunOutAt ?? claim.supplyRunOut ?? null;
}

export function claimSupplyCap(claim: AnyRecord): number {
  const direct = toNumber(claim.maxSupplies ?? claim.suppliesMax ?? claim.supplyCap ?? claim.maxSupply);
  if (direct > 0) return direct;
  const maxSupplyTechs = (claim.researchedTechs ?? []).filter((tech: AnyRecord) => tech.techType === "max_supplies");
  return maxSupplyTechs.reduce((max: number, tech: AnyRecord) => {
    const match = String(tech.name ?? "").match(/(\d[\d,]*)\s*max supplies/i);
    const value = match ? toNumber(match[1].replaceAll(",", "")) : 0;
    return Math.max(max, value);
  }, 0);
}

function materialStackId(stack: AnyRecord): unknown {
  return stack.item_id ?? stack.itemId ?? stack.id;
}

function constructionCatalog(construction: AnyRecord, key: "items" | "cargos"): Map<string, AnyRecord> {
  return new Map((construction?.[key] ?? []).map((entry: AnyRecord) => [String(entry.id), entry]));
}

function inventoryStoredTotals(inventories: AnyRecord): Map<string, number> {
  const totals = new Map<string, number>();
  for (const building of inventories?.buildings ?? []) {
    for (const slot of building.inventory ?? []) {
      const contents = slot.contents ?? {};
      const rawType = contents.item_type ?? contents.itemType;
      const type = rawType === "cargo" || rawType === 1 ? "cargo" : "item";
      const itemId = contents.item_id ?? contents.itemId;
      if (itemId == null) continue;
      const key = `${type}:${itemId}`;
      totals.set(key, (totals.get(key) ?? 0) + toNumber(contents.quantity));
    }
  }
  return totals;
}

function addConstructionContributions(totals: Map<string, number>, materials: AnyRecord[] = [], type: "item" | "cargo") {
  for (const material of materials) {
    const itemId = materialStackId(material);
    if (itemId == null) continue;
    const key = `${type}:${itemId}`;
    totals.set(key, (totals.get(key) ?? 0) + toNumber(material.quantity ?? material.amount));
  }
}

function constructionMaterialRows(
  materials: AnyRecord[],
  type: "item" | "cargo",
  contributions: Map<string, number>,
  storedTotals: Map<string, number>,
  itemLookup: Map<string, AnyRecord>,
  cargoLookup: Map<string, AnyRecord>,
): AnyRecord[] {
  return materials.map((material: AnyRecord) => {
    const itemId = materialStackId(material);
    const lookup = type === "cargo" ? cargoLookup.get(String(itemId)) : itemLookup.get(String(itemId));
    const required = toNumber(material.required ?? material.quantityRequired ?? material.quantity ?? material.amount);
    const key = `${type}:${itemId}`;
    return {
      type,
      itemId,
      name: lookup?.name ?? `${type === "cargo" ? "Cargo" : "Item"} #${itemId}`,
      required,
      contributed: contributions.get(key) ?? 0,
      stored: storedTotals.get(key) ?? 0,
      tier: lookup?.tier ?? material.tier,
      rarity: lookup?.rarityStr ?? lookup?.rarity ?? material.rarityStr ?? material.rarity,
      iconAssetName: lookup?.iconAssetName ?? material.iconAssetName,
    };
  }).filter((material: AnyRecord) => material.itemId != null && material.required > 0);
}

export function buildConstructionProjects(construction: AnyRecord, inventories: AnyRecord): AnyRecord[] {
  const itemLookup = constructionCatalog(construction, "items");
  const cargoLookup = constructionCatalog(construction, "cargos");
  const storedTotals = inventoryStoredTotals(inventories);
  return (construction?.projects ?? []).map((project: AnyRecord) => {
    if (Array.isArray(project.materials)) {
      return {
        ...project,
        name: project.name ?? project.recipeName ?? project.buildingName ?? project.structureName ?? project.entityId,
      };
    }
    const contributions = new Map<string, number>();
    addConstructionContributions(contributions, project.items ?? [], "item");
    addConstructionContributions(contributions, project.cargos ?? [], "cargo");

    // BitJita currently exposes full project requirements as consumed*Stacks, while
    // project.items/cargos are the materials already added to that construction site.
    const requiredItems = project.consumedItemStacks?.length ? project.consumedItemStacks : project.items ?? [];
    const requiredCargos = project.consumedCargoStacks?.length ? project.consumedCargoStacks : project.cargos ?? [];

    return {
      ...project,
      name: project.recipeName ?? project.buildingName ?? project.entityId,
      materials: [
        ...constructionMaterialRows(requiredItems, "item", contributions, storedTotals, itemLookup, cargoLookup),
        ...constructionMaterialRows(requiredCargos, "cargo", contributions, storedTotals, itemLookup, cargoLookup),
      ],
    };
  });
}

export function constructionNeededMaterials(projects: AnyRecord[], limit = 10): [string, number][] {
  const totals: Record<string, number> = projects.flatMap((project: AnyRecord) => project.materials ?? []).reduce((acc: Record<string, number>, material: AnyRecord) => {
    acc[material.name] = (acc[material.name] ?? 0) + Math.max(0, toNumber(material.required) - toNumber(material.contributed) - toNumber(material.stored));
    return acc;
  }, {});
  return Object.entries(totals).filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
}
