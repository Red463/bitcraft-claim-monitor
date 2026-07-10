function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function recipeCatalogKey(kind, id) {
  const normalizedKind = String(kind ?? "").toLowerCase() === "cargo" ? "cargo" : "items";
  return `${normalizedKind}:${String(id ?? "").trim()}`;
}

export function recipeKindFromItemType(value) {
  return value === 1 || value === "1" || String(value ?? "").toLowerCase() === "cargo" ? "cargo" : "items";
}

function unwrapRecipeCatalogDetail(detail) {
  return detail?.detail && typeof detail.detail === "object" ? detail.detail : detail;
}

export function recipeTargetFromDetail(detail, fallback = {}) {
  const unwrapped = unwrapRecipeCatalogDetail(detail);
  const source = unwrapped?.item ?? unwrapped?.cargo ?? unwrapped ?? {};
  const kind = unwrapped?.cargo ? "cargo" : recipeKindFromItemType(source.itemType ?? source.item_type ?? fallback.itemType ?? fallback.kind);
  return {
    id: String(source.id ?? source.itemId ?? fallback.id ?? ""),
    kind,
    itemType: kind === "cargo" ? 1 : 0,
    name: String(source.name ?? fallback.name ?? "Unknown item"),
    tier: Number.isFinite(Number(source.tier ?? fallback.tier)) ? Number(source.tier ?? fallback.tier) : null,
    rarity: source.rarityStr ?? source.rarity ?? fallback.rarity ?? null,
    tag: source.tag ?? fallback.tag ?? null,
    iconAssetName: source.iconAssetName ?? fallback.iconAssetName ?? null,
  };
}

export function recipeDetailHasPlanningMetadata(detail, fallback = {}) {
  const target = recipeTargetFromDetail(detail, fallback);
  return Boolean(target.id && target.tag && target.tier != null);
}

export function recipeTargetFromRow(row) {
  return {
    id: String(row.target_id),
    kind: String(row.kind) === "cargo" ? "cargo" : "items",
    itemType: toNumber(row.item_type),
    name: row.name ?? "Unknown item",
    tier: row.tier == null ? null : toNumber(row.tier),
    rarity: row.rarity ?? null,
    tag: row.tag ?? null,
    iconAssetName: row.icon_asset_name ?? null,
  };
}
