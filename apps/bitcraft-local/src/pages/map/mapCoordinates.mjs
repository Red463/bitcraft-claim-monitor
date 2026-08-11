export const MAP_WORLD_BOUNDS = Object.freeze({ minX: 0, minZ: 0, maxX: 38_400, maxZ: 38_400 });
export const MAP_OVERWORLD_DIMENSION = "1";
export const MAP_MOBILE_SCALE = 1_000;
export const MAP_DISPLAY_SCALE = 3;
export const MAP_HEX_APOTHEM = 2 / Math.sqrt(3);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function dimension(value) {
  const normalized = String(value ?? MAP_OVERWORLD_DIMENSION).trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError("Map dimension must be a decimal integer");
  return normalized;
}

export function normalizeStaticMapPoint(value) {
  return {
    x: finite(value?.x, "Map x"),
    z: finite(value?.z, "Map z"),
    dimension: dimension(value?.dimension),
    coordinateSpace: "map-xz",
  };
}

export function mapPointFromMobile(value) {
  return {
    x: finite(value?.x, "Mobile x") / MAP_MOBILE_SCALE,
    z: finite(value?.z, "Mobile z") / MAP_MOBILE_SCALE,
    dimension: dimension(value?.dimension),
    coordinateSpace: "map-xz",
    sourceCoordinateSpace: "mobile-fixed-1000",
  };
}

export function leafletPoint(value) {
  return [finite(value?.z, "Map z"), finite(value?.x, "Map x")];
}

export function displayHexPoint(value) {
  return {
    north: Math.round(finite(value?.z, "Map z") / MAP_DISPLAY_SCALE),
    east: Math.round(finite(value?.x, "Map x") / MAP_DISPLAY_SCALE),
  };
}
