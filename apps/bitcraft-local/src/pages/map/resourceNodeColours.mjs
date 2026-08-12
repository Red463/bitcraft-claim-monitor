export const RESOURCE_NODE_FALLBACK_COLOUR = "rgba(87, 225, 151, 0.9)";

const TIER_BASE_COLOURS = Object.freeze({
  1: [201, 209, 221],
  2: [237, 149, 97],
  3: [86, 255, 118],
  4: [122, 161, 255],
  5: [217, 140, 227],
  6: [252, 113, 128],
  7: [237, 196, 88],
  8: [139, 243, 243],
  9: [199, 199, 199],
  10: [222, 255, 255],
});
const VARIATIONS = Object.freeze([-24, -12, 0, 12, 24]);

function canonicalDecimal(value) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text).toString();
}

function clamp(channel) {
  return Math.max(0, Math.min(255, channel));
}

export function resourceNodeColour(resourceId, tier) {
  const canonicalId = canonicalDecimal(resourceId);
  const tierNumber = Number(tier);
  const base = Number.isInteger(tierNumber) ? TIER_BASE_COLOURS[tierNumber] : null;
  if (!canonicalId || !base) return RESOURCE_NODE_FALLBACK_COLOUR;
  const offset = VARIATIONS[Number(BigInt(canonicalId) % BigInt(VARIATIONS.length))];
  return `rgba(${base.map((channel) => clamp(channel + offset)).join(", ")}, 0.92)`;
}

export function resourceFeatureColour(feature, resourceTiers) {
  const identity = typeof feature?.identity === "string" ? feature.identity : "";
  if (!identity.startsWith("resource:")) return RESOURCE_NODE_FALLBACK_COLOUR;
  const resourceId = canonicalDecimal(identity.slice("resource:".length));
  if (!resourceId) return RESOURCE_NODE_FALLBACK_COLOUR;
  return resourceNodeColour(resourceId, resourceTiers?.[resourceId]);
}
