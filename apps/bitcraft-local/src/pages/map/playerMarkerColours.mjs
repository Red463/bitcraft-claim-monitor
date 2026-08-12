export const PLAYER_MARKER_PALETTE = Object.freeze([
  "#38bdf8",
  "#fb7185",
  "#4ade80",
  "#fbbf24",
  "#c084fc",
  "#2dd4bf",
  "#f97316",
  "#a3e635",
  "#e879f9",
  "#60a5fa",
  "#f472b6",
  "#facc15",
]);

function decimalId(value) {
  const id = String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new TypeError("Player marker identity must be a decimal integer");
  return id;
}

function compareDecimalStrings(left, right) {
  return left.length - right.length || left.localeCompare(right);
}

function hashPlayerId(id) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function assignPlayerMarkerColours(playerIds = []) {
  const ids = [...new Set(playerIds.map(decimalId))].sort(compareDecimalStrings);
  const used = new Set();
  const result = {};
  for (const id of ids) {
    const preferred = hashPlayerId(id) % PLAYER_MARKER_PALETTE.length;
    let slot = preferred;
    if (used.size < PLAYER_MARKER_PALETTE.length) {
      while (used.has(slot)) slot = (slot + 1) % PLAYER_MARKER_PALETTE.length;
      used.add(slot);
    }
    result[id] = PLAYER_MARKER_PALETTE[slot];
  }
  return result;
}
