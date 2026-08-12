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
const VARIATIONS = Object.freeze([-48, -24, 0, 24, 48]);

function canonicalDecimal(value) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text).toString();
}

function clamp(channel) {
  return Math.max(0, Math.min(255, channel));
}

function stableHash(value) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

export function resourceNodeColour(resourceId, tier) {
  const canonicalId = canonicalDecimal(resourceId);
  const tierNumber = Number(tier);
  const base = Number.isInteger(tierNumber) ? TIER_BASE_COLOURS[tierNumber] : null;
  if (!canonicalId || !base) return RESOURCE_NODE_FALLBACK_COLOUR;
  const offset = VARIATIONS[stableHash(canonicalId) % VARIATIONS.length];
  return `rgba(${base.map((channel) => clamp(channel + offset)).join(", ")}, 0.92)`;
}

export function resourceFeatureColour(feature, resourceTiers) {
  const identity = typeof feature?.identity === "string" ? feature.identity : "";
  if (!identity.startsWith("resource:")) return RESOURCE_NODE_FALLBACK_COLOUR;
  const resourceId = canonicalDecimal(identity.slice("resource:".length));
  if (!resourceId) return RESOURCE_NODE_FALLBACK_COLOUR;
  return resourceNodeColour(resourceId, resourceTiers?.[resourceId]);
}

export function selectedResourceTierMap(resourceIds, catalogByToken) {
  const tiers = {};
  for (const rawResourceId of resourceIds ?? []) {
    const resourceId = canonicalDecimal(rawResourceId);
    if (!resourceId) continue;
    const tier = Number(catalogByToken?.get?.(`resource:${resourceId}`)?.tier);
    tiers[resourceId] = Number.isInteger(tier) && tier >= 1 && tier <= 10 ? tier : null;
  }
  return tiers;
}
