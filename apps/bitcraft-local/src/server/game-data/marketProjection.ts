type CatalogEntity = {
  name?: unknown;
  tier?: unknown;
  rarity?: unknown;
  iconAssetName?: unknown;
  [key: string]: unknown;
};

type ProjectionDependencies = {
  getEntity(catalogKey: string): CatalogEntity | null;
  claim: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint"
    ? value.toString()
    : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError(`${label} must be a non-negative decimal integer`);
  }
  return normalized;
}

export function enrichMarketWithCatalog(
  snapshot: unknown,
  dependencies: ProjectionDependencies,
) {
  const source = asRecord(snapshot);
  const rows = Array.isArray(source.listings) ? source.listings : [];
  const claim = dependencies.claim ?? {};
  const cache = new Map<string, CatalogEntity | null>();
  const warnings: string[] = [];
  const listings = rows.map((value, index) => {
    const listing = asRecord(value);
    const entityId = decimalInteger(
      listing.entityId,
      `market order ${index} entity id`,
    );
    const itemId = decimalInteger(
      listing.itemId,
      `market order ${entityId} item id`,
    );
    const itemType = String(listing.itemType ?? "").toLowerCase() === "cargo"
      ? "cargo"
      : "item";
    const catalogKey = `${itemType === "cargo" ? "cargo" : "items"}:${itemId}`;
    if (!cache.has(catalogKey)) {
      cache.set(catalogKey, dependencies.getEntity(catalogKey));
    }
    const item = cache.get(catalogKey) ?? null;
    if (!item) {
      warnings.push(
        `Market order ${entityId} references unavailable catalog item ${catalogKey}.`,
      );
    }
    return {
      ...listing,
      entityId,
      itemId,
      itemType,
      itemName: String(
        item?.name ?? `${itemType === "cargo" ? "Cargo" : "Item"} #${itemId}`,
      ),
      itemTier: item?.tier ?? null,
      itemRarityStr: String(item?.rarity ?? ""),
      iconAssetName: item?.iconAssetName ?? null,
      claimName: String(claim.name ?? ""),
      regionName: String(claim.regionName ?? ""),
    };
  });

  return {
    data: {
      ...source,
      listings,
    },
    warnings,
  };
}
