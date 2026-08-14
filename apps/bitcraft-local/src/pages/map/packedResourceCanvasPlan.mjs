function visibleRegions(regionIds) {
  return new Set((regionIds ?? []).map(String).filter((value) => /^(?:0|[1-9]\d*)$/.test(value)));
}

function coordinatesFor(partition) {
  return partition?.generation == null ? partition?.provisional : partition?.committed;
}

export function planPackedResourceDraw(partitions, regionIds = [], budget = 25_000) {
  if (!Number.isSafeInteger(budget) || budget < 1) throw new TypeError("Packed resource draw budget must be positive");
  const selected = visibleRegions(regionIds);
  const planned = [];
  let pointCount = 0;
  for (const partition of partitions?.values?.() ?? []) {
    if (selected.size && !selected.has(String(partition.regionId))) continue;
    const coordinates = coordinatesFor(partition);
    if (!(coordinates instanceof Uint32Array) || coordinates.length === 0) continue;
    planned.push({ partition, coordinates });
    pointCount += coordinates.length;
  }
  return { partitions: planned, pointCount, stride: Math.max(1, Math.ceil(pointCount / budget)) };
}

export function packedResourcePointCount(partitions, regionIds = []) {
  return planPackedResourceDraw(partitions, regionIds, Number.MAX_SAFE_INTEGER).pointCount;
}

export function packedResourceBounds(partitions, regionIds = []) {
  const plan = planPackedResourceDraw(partitions, regionIds, Number.MAX_SAFE_INTEGER);
  if (!plan.pointCount) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const { coordinates } of plan.partitions) {
    for (const packed of coordinates) {
      const x = packed & 0xffff;
      const z = packed >>> 16;
      minX = Math.min(minX, x);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxZ = Math.max(maxZ, z);
    }
  }
  return { minX, minZ, maxX, maxZ };
}

export function packedResourceSamples(partitions, regionIds = [], limit = 250) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError("Packed resource sample limit must be non-negative");
  const samples = [];
  const plan = planPackedResourceDraw(partitions, regionIds, Number.MAX_SAFE_INTEGER);
  for (const { partition, coordinates } of plan.partitions) {
    for (const packed of coordinates) {
      samples.push({
        key: String(partition.key),
        regionId: String(partition.regionId),
        resourceId: String(partition.resourceId),
        x: packed & 0xffff,
        z: packed >>> 16,
      });
      if (samples.length === limit) return samples;
    }
  }
  return samples;
}

export function packedResourceSome(partitions, regionIds = [], predicate) {
  if (typeof predicate !== "function") throw new TypeError("Packed resource predicate is required");
  const plan = planPackedResourceDraw(partitions, regionIds, Number.MAX_SAFE_INTEGER);
  for (const { partition, coordinates } of plan.partitions) {
    for (const packed of coordinates) {
      if (predicate({
        key: String(partition.key),
        regionId: String(partition.regionId),
        resourceId: String(partition.resourceId),
        x: packed & 0xffff,
        z: packed >>> 16,
      })) return true;
    }
  }
  return false;
}
