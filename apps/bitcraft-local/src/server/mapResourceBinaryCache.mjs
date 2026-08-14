export class MapResourceAdmissionError extends Error {
  constructor(message, retryAfterSeconds = 60) {
    super(message);
    this.name = "MapResourceAdmissionError";
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function positiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return normalized;
}

function nonNegativeInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return normalized;
}

function partitionBytes(partition) {
  if (!partition || typeof partition !== "object") throw new TypeError("Binary resource partition is required");
  if (!(partition.encoded instanceof Uint8Array)) throw new TypeError("Binary resource partition encoded bytes must be Uint8Array");
  if (!(partition.coordinates instanceof Uint32Array)) throw new TypeError("Binary resource partition coordinates must be Uint32Array");
  const encodedBytes = nonNegativeInteger(partition.encodedBytes, "Binary resource partition encoded bytes");
  if (encodedBytes !== partition.encoded.byteLength) {
    throw new RangeError("Binary resource partition encoded byte count must match its buffer");
  }
  return encodedBytes;
}

function entryBytes(entry) {
  return partitionBytes(entry.latest) + (entry.previous ? partitionBytes(entry.previous) : 0);
}

export class MapResourceBinaryCache {
  #maxBytes;
  #previousGenerationGraceMs;
  #now;
  #entries = new Map();
  #retains = new Map();
  #bytes = 0;
  #evictions = 0;
  #rejections = 0;

  constructor({ maxBytes, previousGenerationGraceMs, now = Date.now }) {
    this.#maxBytes = positiveInteger(maxBytes, "Binary resource cache byte capacity");
    this.#previousGenerationGraceMs = nonNegativeInteger(
      previousGenerationGraceMs,
      "Binary resource previous-generation grace",
    );
    this.#now = now;
  }

  put(partition) {
    const newBytes = partitionBytes(partition);
    const key = String(partition.key ?? "");
    if (!key) throw new TypeError("Binary resource partition key is required");
    if (newBytes > this.#maxBytes) return this.#reject(key, newBytes);
    this.#expirePrevious();

    const entries = new Map(this.#entries);
    const current = entries.get(key);
    let next;
    if (!current) {
      next = { latest: partition, previous: null, previousExpiresAt: null };
    } else if (current.latest.generation === partition.generation) {
      next = { ...current, latest: partition };
    } else {
      next = {
        latest: partition,
        previous: current.latest,
        previousExpiresAt: this.#now() + this.#previousGenerationGraceMs,
      };
    }
    if (entries.has(key)) entries.delete(key);
    entries.set(key, next);

    let bytes = 0;
    for (const entry of entries.values()) bytes += entryBytes(entry);
    let evictions = 0;
    if (bytes > this.#maxBytes) {
      for (const [candidateKey, candidate] of [...entries]) {
        if (candidateKey === key || (this.#retains.get(candidateKey) ?? 0) > 0) continue;
        entries.delete(candidateKey);
        bytes -= entryBytes(candidate);
        evictions += 1;
        if (bytes <= this.#maxBytes) break;
      }
    }
    if (bytes > this.#maxBytes) return this.#reject(key, newBytes);

    this.#entries = entries;
    this.#bytes = bytes;
    this.#evictions += evictions;
  }

  get(key, generation) {
    this.#expirePrevious();
    const entry = this.#entries.get(key);
    if (!entry) return null;
    let partition;
    if (generation === undefined || entry.latest.generation === generation) partition = entry.latest;
    else if (entry.previous?.generation === generation) partition = entry.previous;
    else return null;
    this.#touch(key, entry);
    return partition;
  }

  latest(key) {
    return this.get(key);
  }

  retain(key) {
    const current = this.#retains.get(key) ?? 0;
    this.#retains.set(key, current + 1);
    const entry = this.#entries.get(key);
    if (entry) this.#touch(key, entry);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = this.#retains.get(key) ?? 0;
      if (count <= 1) this.#retains.delete(key);
      else this.#retains.set(key, count - 1);
    };
  }

  remove(key) {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    this.#bytes -= entryBytes(entry);
  }

  health() {
    this.#expirePrevious();
    let activeEntries = 0;
    for (const key of this.#entries.keys()) {
      if ((this.#retains.get(key) ?? 0) > 0) activeEntries += 1;
    }
    return {
      bytes: this.#bytes,
      entries: this.#entries.size,
      activeEntries,
      evictions: this.#evictions,
      rejections: this.#rejections,
    };
  }

  #touch(key, entry) {
    this.#entries.delete(key);
    this.#entries.set(key, entry);
  }

  #expirePrevious() {
    const now = this.#now();
    for (const [key, entry] of this.#entries) {
      if (!entry.previous || entry.previousExpiresAt === null || entry.previousExpiresAt > now) continue;
      this.#bytes -= partitionBytes(entry.previous);
      this.#entries.set(key, { latest: entry.latest, previous: null, previousExpiresAt: null });
    }
  }

  #reject(key, encodedBytes) {
    this.#rejections += 1;
    throw new MapResourceAdmissionError(
      `Binary resource cache cannot admit ${encodedBytes} bytes for ${key}`,
    );
  }
}
