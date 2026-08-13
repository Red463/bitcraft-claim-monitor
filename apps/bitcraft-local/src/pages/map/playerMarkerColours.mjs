function decimalId(value) {
  const id = String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new TypeError("Player marker identity must be a decimal integer");
  const canonical = BigInt(id);
  if (canonical > 0xffffffffffffffffn) throw new TypeError("Player marker identity must fit an unsigned 64-bit integer");
  return canonical.toString();
}

function compareDecimalStrings(left, right) {
  return left.length - right.length || left.localeCompare(right);
}

function mixPlayerId(id) {
  const mask = 0xffffffffffffffffn;
  let mixed = (BigInt(id) + 0x9e3779b97f4a7c15n) & mask;
  mixed = ((mixed ^ (mixed >> 30n)) * 0xbf58476d1ce4e5b9n) & mask;
  mixed = ((mixed ^ (mixed >> 27n)) * 0x94d049bb133111ebn) & mask;
  return mixed ^ (mixed >> 31n);
}

export function assignPlayerMarkerColours(playerIds = []) {
  const ids = [...new Set(playerIds.map(decimalId))].sort(compareDecimalStrings);
  const result = {};
  for (const id of ids) {
    const mixed = mixPlayerId(id);
    const hue = (Number(mixed & 0xffffffn) * 360 / 0x1000000).toFixed(6);
    const saturation = (70 + Number((mixed >> 24n) & 0xfffffn) * 14 / 0xfffff).toFixed(6);
    const lightness = (56 + Number((mixed >> 44n) & 0xfffffn) * 12 / 0xfffff).toFixed(6);
    result[id] = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
  return result;
}
