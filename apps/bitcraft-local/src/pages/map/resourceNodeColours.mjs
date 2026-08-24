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
const TIERLESS_BASE_HUE = 24;
const GOLDEN_ANGLE = 137.508;

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

function compareCanonicalDecimal(left, right) {
  return left.length - right.length || left.localeCompare(right);
}

function tierlessResourceColour(index) {
  const hue = (TIERLESS_BASE_HUE + index * GOLDEN_ANGLE) % 360;
  return `hsla(${hue.toFixed(1)}, 78%, 62%, 0.92)`;
}

export function resourceNodeColour(resourceId, tier) {
  const canonicalId = canonicalDecimal(resourceId);
  const tierNumber = Number(tier);
  const base = Number.isInteger(tierNumber) ? TIER_BASE_COLOURS[tierNumber] : null;
  if (!canonicalId || !base) return RESOURCE_NODE_FALLBACK_COLOUR;
  const offset = VARIATIONS[stableHash(canonicalId) % VARIATIONS.length];
  return `rgba(${base.map((channel) => clamp(channel + offset)).join(", ")}, 0.92)`;
}

export function resourceFeatureColour(feature, resourceColours) {
  const identity = typeof feature?.identity === "string" ? feature.identity : "";
  if (!identity.startsWith("resource:")) return RESOURCE_NODE_FALLBACK_COLOUR;
  const resourceId = canonicalDecimal(identity.slice("resource:".length));
  return resourceId
    ? resourceColours?.[resourceId] ?? RESOURCE_NODE_FALLBACK_COLOUR
    : RESOURCE_NODE_FALLBACK_COLOUR;
}

export function enemyFeatureColour(feature, enemyColours) {
  const identity = typeof feature?.identity === "string" ? feature.identity : "";
  if (!identity.startsWith("enemy:")) return RESOURCE_NODE_FALLBACK_COLOUR;
  const enemyType = canonicalDecimal(identity.slice("enemy:".length));
  return enemyType
    ? enemyColours?.[enemyType] ?? RESOURCE_NODE_FALLBACK_COLOUR
    : RESOURCE_NODE_FALLBACK_COLOUR;
}

export function selectedResourceColourMap(resourceIds, catalogByToken) {
  const tierlessIds = new Set();
  const catalogEntries = typeof catalogByToken?.entries === "function"
    ? catalogByToken.entries()
    : [];
  for (const [token, row] of catalogEntries) {
    if (!String(token).startsWith("resource:")) continue;
    const resourceId = canonicalDecimal(String(token).slice("resource:".length));
    const tier = Number(row?.tier);
    if (resourceId && !(Number.isInteger(tier) && tier >= 1 && tier <= 10)) {
      tierlessIds.add(resourceId);
    }
  }
  const tierlessColours = new Map(
    [...tierlessIds]
      .sort(compareCanonicalDecimal)
      .map((resourceId, index) => [resourceId, tierlessResourceColour(index)]),
  );
  const selectedIds = [...new Set((resourceIds ?? [])
    .map(canonicalDecimal)
    .filter(Boolean))]
    .sort(compareCanonicalDecimal);
  const colours = {};
  for (const resourceId of selectedIds) {
    const row = catalogByToken?.get?.(`resource:${resourceId}`);
    const tier = Number(row?.tier);
    colours[resourceId] = Number.isInteger(tier) && tier >= 1 && tier <= 10
      ? resourceNodeColour(resourceId, tier)
      : tierlessColours.get(resourceId) ?? RESOURCE_NODE_FALLBACK_COLOUR;
  }
  return colours;
}

export function selectedEnemyColourMap(enemyTypes, catalogByToken) {
  const selectedTypes = [...new Set((enemyTypes ?? [])
    .map(canonicalDecimal)
    .filter(Boolean))]
    .sort(compareCanonicalDecimal);
  const colours = {};
  for (const enemyType of selectedTypes) {
    const row = catalogByToken?.get?.(`enemy:${enemyType}`);
    colours[enemyType] = resourceNodeColour(enemyType, row?.tier);
  }
  return colours;
}
