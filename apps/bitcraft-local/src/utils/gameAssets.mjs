const INVALID_ASSET_VALUE = "\uFFEE";

function rawIconAssetName(item) {
  return String(
    item?.iconAssetName
      ?? item?.icon_asset_name
      ?? item?.iconAddress
      ?? item?.icon_address
      ?? "",
  ).trim();
}

export function gameIconUrl(item) {
  const raw = rawIconAssetName(item);
  if (!raw || raw === INVALID_ASSET_VALUE) return null;

  const normalized = raw
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\.webp$/i, "");
  if (
    !normalized
    || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(normalized)
    || /[?#\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }

  const relativePath = normalized.startsWith("Items/")
    ? `GeneratedIcons/${normalized}`
    : normalized;
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }

  return `/game-icons/${segments.map((segment) => encodeURIComponent(segment)).join("/")}.webp`;
}

function itemTypeValue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (value === 0 || normalized === "0" || normalized === "item" || normalized === "items") return "item";
  if (value === 1 || normalized === "1" || normalized === "cargo") return "cargo";
  return null;
}

function gameIconIdentityAtLevel(item) {
  const itemId = String(
    item?.itemId
      ?? item?.item_id
      ?? item?.id
      ?? "",
  ).trim();
  if (!/^\d+$/.test(itemId)) return null;
  const itemType = itemTypeValue(item?.itemType ?? item?.item_type ?? item?.kind ?? item?.type);
  return itemType ? { itemType, itemId } : null;
}

function gameIconIdentity(item) {
  return gameIconIdentityAtLevel(item) ?? gameIconIdentityAtLevel(item?.contents);
}

export function gameIconSources(item) {
  const sources = [];
  const localUrl = gameIconUrl(item);
  if (localUrl) sources.push(localUrl);
  const identity = gameIconIdentity(item);
  if (identity) sources.push(`/api/local/game-icon/${identity.itemType}/${identity.itemId}`);
  return [...new Set(sources)];
}
