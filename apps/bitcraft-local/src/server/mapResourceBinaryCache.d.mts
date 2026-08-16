export type CachedBinaryPartition = {
  key: string;
  regionId: string;
  resourceId: string;
  generation: string;
  coordinates: Uint32Array;
  encoded: Uint8Array;
  encodedBytes: number;
  pointCount: number;
  receivedAt: string;
  freshness: "live" | "stale";
  warning: string | null;
};

export type MapResourceBinaryCacheHealth = {
  bytes: number;
  entries: number;
  activeEntries: number;
  evictions: number;
  rejections: number;
};

export class MapResourceAdmissionError extends Error {
  readonly statusCode: 429;
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds?: number);
}

export class MapResourceBinaryCache {
  constructor(input: { maxBytes: number; previousGenerationGraceMs: number; now?: () => number });
  put(partition: CachedBinaryPartition): void;
  get(key: string, generation?: string): CachedBinaryPartition | null;
  latest(key: string): CachedBinaryPartition | null;
  retain(key: string): () => void;
  remove(key: string): void;
  health(): MapResourceBinaryCacheHealth;
}
