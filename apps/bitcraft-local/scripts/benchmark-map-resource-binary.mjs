import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  decodeResourcePartition,
  encodeResourcePartition,
  mergePackedCoordinateDelta,
  packResourceCoordinate,
} from "../src/map/resourcePartitionCodec.mjs";
import {
  applyMapResourceBinaryCommitted,
  createMapResourceBinaryState,
} from "../src/pages/map/mapResourceBinaryState.mjs";

const DEFAULT_POINT_COUNT = 400_000;
const DEFAULT_ITERATIONS = 3;
const MAX_COORDINATE = 38_400;

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function fixture(pointCount) {
  if (!Number.isSafeInteger(pointCount) || pointCount < 10_000 || pointCount > ((MAX_COORDINATE + 1) ** 2) - 5_000) {
    throw new RangeError("Benchmark point count is outside the bounded world fixture range");
  }
  const coordinates = new Uint32Array(pointCount);
  for (let index = 0; index < pointCount; index += 1) {
    coordinates[index] = packResourceCoordinate(index % (MAX_COORDINATE + 1), Math.floor(index / (MAX_COORDINATE + 1)));
  }
  const removals = coordinates.slice(0, 5_000);
  const additions = new Uint32Array(5_000);
  for (let index = 0; index < additions.length; index += 1) {
    const coordinateIndex = pointCount + index;
    additions[index] = packResourceCoordinate(coordinateIndex % (MAX_COORDINATE + 1), Math.floor(coordinateIndex / (MAX_COORDINATE + 1)));
  }
  return { coordinates, additions, removals };
}

export async function runBinaryResourceBenchmark({ pointCount = DEFAULT_POINT_COUNT, iterations = DEFAULT_ITERATIONS } = {}) {
  if (!Number.isSafeInteger(iterations) || iterations < 1) throw new TypeError("Benchmark iterations must be positive");
  const { coordinates, additions, removals } = fixture(pointCount);
  const codecMs = [];
  const deltaMs = [];
  let encodedBytes = 0;
  let identityLeak = false;
  let maxHeapBytes = process.memoryUsage().heapUsed;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const codecStartedAt = performance.now();
    const encoded = encodeResourcePartition({
      regionId: "19",
      resourceId: "28",
      dimension: "1",
      generation: String(iteration + 1),
      coordinates,
    });
    const decoded = decodeResourcePartition(encoded, {
      regionId: "19",
      resourceId: "28",
      dimension: "1",
      generation: String(iteration + 1),
    });
    let state = createMapResourceBinaryState([{ key: "19|resource:28", regionId: "19", resourceId: "28" }]);
    state = applyMapResourceBinaryCommitted(state, "19|resource:28", decoded);
    codecMs.push(performance.now() - codecStartedAt);
    encodedBytes = encoded.byteLength;
    identityLeak ||= Object.keys(decoded).some((key) => /entity/i.test(key))
      || Object.keys(state.get("19|resource:28") ?? {}).some((key) => /entity/i.test(key));

    const deltaStartedAt = performance.now();
    const merged = mergePackedCoordinateDelta(decoded.coordinates, additions, removals);
    deltaMs.push(performance.now() - deltaStartedAt);
    if (merged.length !== pointCount || merged[0] !== coordinates[5_000] || merged.at(-1) !== additions.at(-1)) {
      throw new Error("Binary resource delta fixture produced an unexpected generation");
    }
    maxHeapBytes = Math.max(maxHeapBytes, process.memoryUsage().heapUsed);
  }

  return {
    pointCount,
    iterations,
    encodedBytes,
    identityLeak,
    maxHeapMiB: maxHeapBytes / (1024 * 1024),
    p95CodecMs: percentile95(codecMs),
    p95DeltaMs: percentile95(deltaMs),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runBinaryResourceBenchmark();
  const passed = result.pointCount === DEFAULT_POINT_COUNT
    && result.encodedBytes === 44 + (DEFAULT_POINT_COUNT * 4)
    && result.identityLeak === false
    && result.maxHeapMiB <= 256
    && result.p95CodecMs <= 5_000
    && result.p95DeltaMs <= 2_000;
  console.log(JSON.stringify({ passed, ...result }));
  if (!passed) process.exitCode = 1;
}
