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
