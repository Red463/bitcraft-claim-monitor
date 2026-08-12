function decimal(value, label) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) throw new TypeError(`${label} must be a decimal integer`);
  return BigInt(text).toString();
}

function decimalSort(values, label) {
  return [...new Set((values ?? []).map((value) => decimal(value, label)))]
    .sort((left, right) => left.length - right.length || left.localeCompare(right));
}

export function resourcePartitionKey(regionId, resourceId) {
  return `${decimal(regionId, "Resource partition region id")}|resource:${decimal(resourceId, "Resource partition type id")}`;
}

function partitionIdentity(key) {
  const match = /^(\d+)\|resource:(\d+)$/.exec(String(key ?? ""));
  if (!match) throw new TypeError("Resource partition key is invalid");
  return { regionId: decimal(match[1], "Resource partition region id"), resourceId: decimal(match[2], "Resource partition type id") };
}

export function resourcePartitionPlan(regionIds = [], resourceIds = []) {
  return decimalSort(regionIds, "Resource partition region id").flatMap((regionId) => (
    decimalSort(resourceIds, "Resource partition type id").map((resourceId) => ({
      key: resourcePartitionKey(regionId, resourceId), regionId, resourceId,
    }))
  ));
}

function normalizedRows(rows, identity) {
  const entities = new Set();
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    if (!Array.isArray(row) || row.length !== 5) return [];
    try {
      const entityId = decimal(row[0], "Resource entity id");
      const regionId = decimal(row[1], "Resource row region id");
      const resourceId = decimal(row[2], "Resource row type id");
      const x = Number(row[3]);
      const z = Number(row[4]);
      if (regionId !== identity.regionId || resourceId !== identity.resourceId || entities.has(entityId)) return [];
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) return [];
      entities.add(entityId);
      return [[entityId, regionId, resourceId, x, z]];
    } catch {
      return [];
    }
  }).sort((left, right) => left[0].length - right[0].length || left[0].localeCompare(right[0]));
}

export function replaceResourcePartition(state, partition) {
  const identity = partitionIdentity(partition?.key);
  const generation = decimal(partition?.generation, "Resource partition generation");
  const next = new Map(state ?? []);
  next.set(resourcePartitionKey(identity.regionId, identity.resourceId), Object.freeze({
    key: resourcePartitionKey(identity.regionId, identity.resourceId),
    regionId: identity.regionId,
    resourceId: identity.resourceId,
    generation,
    rows: Object.freeze(normalizedRows(partition?.rows, identity)),
    warnings: Object.freeze([...(partition?.warnings ?? [])].map(String)),
    freshness: String(partition?.freshness ?? "live"),
  }));
  return next;
}

export function retainResourcePartitions(state, wantedKeys = []) {
  const wanted = new Set(wantedKeys.map((key) => {
    const identity = partitionIdentity(key);
    return resourcePartitionKey(identity.regionId, identity.resourceId);
  }));
  return new Map([...new Map(state ?? [])].filter(([key]) => wanted.has(key)));
}

export function resourceRowsFromPartitions(state) {
  return [...new Map(state ?? []).values()]
    .sort((left, right) => left.key.localeCompare(right.key, undefined, { numeric: true }))
    .flatMap((partition) => partition.rows);
}
