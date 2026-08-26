const MAGIC = Uint8Array.of(0x42, 0x43, 0x52, 0x50);
const VERSION = 1;
const HEADER_BYTES = 44;
const MAX_COORDINATE = 38_400;
const MAX_UINT32 = 0xffff_ffff;
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;

function requireCoordinate(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_COORDINATE) {
    throw new RangeError(`${name} coordinate must be an integer from 0 through ${MAX_COORDINATE}`);
  }
  return value;
}

function requirePackedCoordinate(value) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError("Packed coordinate must be an unsigned 32-bit integer");
  }
  const unsigned = value >>> 0;
  requireCoordinate(unsigned & 0xffff, "X");
  requireCoordinate(unsigned >>> 16, "Z");
  return unsigned;
}

function requireDecimalBigInt(value, name, { positive = false } = {}) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(`${name} must be a canonical decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_UINT64 || (positive && parsed === 0n)) {
    throw new RangeError(`${name} is outside the unsigned 64-bit range`);
  }
  return parsed;
}

function requireResourceId(value) {
  const parsed = requireDecimalBigInt(value, "Resource ID", { positive: true });
  if (parsed > BigInt(MAX_UINT32)) {
    throw new RangeError("Resource ID is outside the unsigned 32-bit range");
  }
  return Number(parsed);
}

function requireDimension(value) {
  if (value !== "1") {
    throw new RangeError('Resource partition dimension must be "1"');
  }
  return 1;
}

function requireSortedUnique(values, name) {
  if (!(values instanceof Uint32Array)) {
    throw new TypeError(`${name} must be a Uint32Array`);
  }
  let previous = -1;
  for (let index = 0; index < values.length; index += 1) {
    const value = requirePackedCoordinate(values[index]);
    if (value <= previous) {
      throw new RangeError(`${name} must contain sorted unique coordinates`);
    }
    previous = value;
  }
  return values;
}

function bytesFrom(input) {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("Resource partition must be an ArrayBuffer or ArrayBuffer view");
}

export function packResourceCoordinate(x, z) {
  return ((requireCoordinate(z, "Z") << 16) | requireCoordinate(x, "X")) >>> 0;
}

export function unpackResourceCoordinate(value) {
  const unsigned = requirePackedCoordinate(value);
  return { x: unsigned & 0xffff, z: unsigned >>> 16 };
}

export function normalizePackedCoordinates(values) {
  if (values == null || typeof values[Symbol.iterator] !== "function") {
    throw new TypeError("Packed coordinates must be iterable");
  }
  const normalized = [];
  for (const value of values) {
    normalized.push(requirePackedCoordinate(value));
  }
  normalized.sort((left, right) => left - right);
  if (normalized.length === 0) {
    return new Uint32Array();
  }
  let outputLength = 1;
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] !== normalized[outputLength - 1]) {
      normalized[outputLength] = normalized[index];
      outputLength += 1;
    }
  }
  return Uint32Array.from(normalized.slice(0, outputLength));
}

export function mergePackedCoordinateDelta(current, additions, removals) {
  requireSortedUnique(current, "Current coordinates");
  requireSortedUnique(additions, "Added coordinates");
  requireSortedUnique(removals, "Removed coordinates");

  const output = new Uint32Array(current.length + additions.length);
  let currentIndex = 0;
  let additionIndex = 0;
  let removalIndex = 0;
  let outputIndex = 0;

  while (currentIndex < current.length || additionIndex < additions.length) {
    const currentValue = currentIndex < current.length ? current[currentIndex] : Infinity;
    const additionValue = additionIndex < additions.length ? additions[additionIndex] : Infinity;
    const candidate = Math.min(currentValue, additionValue);
    const isAddition = candidate === additionValue;

    if (candidate === currentValue) currentIndex += 1;
    if (candidate === additionValue) additionIndex += 1;
    while (removalIndex < removals.length && removals[removalIndex] < candidate) removalIndex += 1;

    const removed = removalIndex < removals.length && removals[removalIndex] === candidate;
    if (!removed || isAddition) {
      output[outputIndex] = candidate;
      outputIndex += 1;
    }
  }

  return output.slice(0, outputIndex);
}

export function encodeResourcePartition(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("Resource partition input is required");
  }
  const regionId = requireDecimalBigInt(input.regionId, "Region ID", { positive: true });
  const generation = requireDecimalBigInt(input.generation, "Generation");
  const resourceId = requireResourceId(input.resourceId);
  const dimension = requireDimension(input.dimension);
  const coordinates = requireSortedUnique(input.coordinates, "Coordinates");

  const bytes = new Uint8Array(HEADER_BYTES + (coordinates.length * 4));
  bytes.set(MAGIC, 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, 0, true);
  view.setBigUint64(8, regionId, true);
  view.setBigUint64(16, generation, true);
  view.setUint32(24, resourceId, true);
  view.setUint32(28, dimension, true);
  view.setUint32(32, coordinates.length, true);
  view.setUint32(36, 0, true);
  view.setUint32(40, 0, true);
  for (let index = 0; index < coordinates.length; index += 1) {
    view.setUint32(HEADER_BYTES + (index * 4), coordinates[index], true);
  }
  return bytes;
}

export function decodeResourcePartition(input, expected = {}) {
  const bytes = bytesFrom(input);
  if (bytes.byteLength < HEADER_BYTES) {
    throw new RangeError("Resource partition length is shorter than the V1 header");
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (bytes[index] !== MAGIC[index]) throw new TypeError("Invalid resource partition magic");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(4, true) !== VERSION) throw new RangeError("Unsupported resource partition version");
  if (view.getUint16(6, true) !== 0) throw new RangeError("Unsupported resource partition flags");
  if (view.getUint32(36, true) !== 0 || view.getUint32(40, true) !== 0) {
    throw new RangeError("Resource partition reserved fields must be zero");
  }

  const regionId = view.getBigUint64(8, true).toString();
  const generation = view.getBigUint64(16, true).toString();
  const resourceId = view.getUint32(24, true).toString();
  const dimensionValue = view.getUint32(28, true);
  const dimension = dimensionValue.toString();
  requireDimension(dimension);
  const pointCount = view.getUint32(32, true);
  const expectedLength = HEADER_BYTES + (pointCount * 4);
  if (bytes.byteLength !== expectedLength) {
    throw new RangeError(`Resource partition length must be exactly ${expectedLength} bytes`);
  }

  const identity = { regionId, resourceId, dimension, generation };
  for (const [name, value] of Object.entries(expected)) {
    if (value !== undefined && identity[name] !== value) {
      throw new RangeError(`Resource partition ${name} mismatch`);
    }
  }

  const coordinates = new Uint32Array(pointCount);
  let previous = -1;
  for (let index = 0; index < pointCount; index += 1) {
    const value = requirePackedCoordinate(view.getUint32(HEADER_BYTES + (index * 4), true));
    if (value <= previous) {
      throw new RangeError("Resource partition coordinates must be sorted unique values");
    }
    coordinates[index] = value;
    previous = value;
  }
  return { ...identity, coordinates, pointCount };
}

export const RESOURCE_PARTITION_HEADER_BYTES = HEADER_BYTES;
export const RESOURCE_PARTITION_VERSION = VERSION;
