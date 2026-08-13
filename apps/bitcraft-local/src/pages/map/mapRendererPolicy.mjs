export function mapRendererPolicy(mode, compatibilityUrl) {
  if (mode === "native") return { native: true, externalHref: null, externalLabel: null };
  if (mode === "native-beta") return { native: true, externalHref: "https://bitcraftmap.com/", externalLabel: "Open external map" };
  return { native: false, externalHref: compatibilityUrl, externalLabel: "Open full map" };
}
