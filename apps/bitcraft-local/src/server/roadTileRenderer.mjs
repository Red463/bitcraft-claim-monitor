import sharp from "sharp";

const APOTHEM = 2 / Math.sqrt(3);

export function groupRoadPointsForZoom(points, { zoom, tileSize = 256 }) {
  if (!Number.isSafeInteger(zoom) || zoom < -5 || zoom > 0) throw new RangeError("Road tile zoom must be between -5 and 0");
  const scale = 2 ** zoom;
  const groups = new Map();
  for (const point of points) {
    const worldX = Number(point.x) * scale;
    const worldY = (-Number(point.z) / APOTHEM) * scale;
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) continue;
    const x = Math.floor(worldX / tileSize);
    const y = Math.floor(worldY / tileSize);
    const localX = Math.max(0, Math.min(tileSize - 1, Math.floor(worldX - x * tileSize)));
    const localY = Math.max(0, Math.min(tileSize - 1, Math.floor(worldY - y * tileSize)));
    const key = `${x}:${y}`;
    const group = groups.get(key) ?? [];
    group.push({ x: localX, y: localY });
    groups.set(key, group);
  }
  return groups;
}

export async function renderRoadTile({ points, tileSize = 256, zoom = 0 }) {
  const pixels = Buffer.alloc(tileSize * tileSize * 4);
  const radius = zoom >= 0 ? 1 : 0;
  for (const point of points) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const x = point.x + offsetX;
      const y = point.y + offsetY;
      if (x < 0 || y < 0 || x >= tileSize || y >= tileSize) continue;
      const index = (y * tileSize + x) * 4;
      pixels[index] = 178;
      pixels[index + 1] = 187;
      pixels[index + 2] = 184;
      pixels[index + 3] = zoom >= -1 ? 230 : 205;
    }
  }
  return sharp(pixels, { raw: { width: tileSize, height: tileSize, channels: 4 } }).webp({ quality: 82, effort: 4 }).toBuffer();
}
