import { decodeResourcePartition } from "../../map/resourcePartitionCodec.mjs";
import {
  applyMapResourceBinaryCommitted,
  applyMapResourceBinaryEvent,
  createMapResourceBinaryState,
  reconcileMapResourceBinaryScope,
} from "./mapResourceBinaryState.mjs";

function eventUrlWithGenerations(url, partitions) {
  const generations = {};
  for (const [key, partition] of partitions) {
    if (partition.generation != null) generations[key] = partition.generation;
  }
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}generations=${encodeURIComponent(JSON.stringify(generations))}`;
}

function isAbort(error) {
  return error?.name === "AbortError";
}

export function createMapResourceBinaryLoader({ fetchBinary, connectEvents, onChange, onError }) {
  if (typeof fetchBinary !== "function" || typeof connectEvents !== "function") {
    throw new TypeError("Resource partition loader dependencies are required");
  }
  let partitions = createMapResourceBinaryState();
  let eventUrl = "";
  let connection = null;
  let paused = false;
  let stopped = false;
  const inflight = new Map();

  const publish = (next) => {
    if (next === partitions) return;
    partitions = next;
    onChange?.(partitions);
  };

  const abortKey = (key) => {
    const request = inflight.get(key);
    if (!request) return;
    inflight.delete(key);
    request.controller.abort();
  };

  const markUnavailable = (key) => {
    const result = applyMapResourceBinaryEvent(partitions, {
      type: "partition-unavailable",
      key,
      warning: "Resource partition could not be loaded",
    });
    publish(result.partitions);
    onError?.("Resource partition could not be loaded");
  };

  const load = async (key, generation, url, recoveryRemaining = 1) => {
    const selected = partitions.get(key);
    if (!selected || paused || stopped) return;
    const normalizedGeneration = String(generation);
    const existing = inflight.get(key);
    if (existing?.generation === normalizedGeneration) return;
    if (selected.generation === normalizedGeneration) return;
    abortKey(key);
    const controller = new AbortController();
    const request = { controller, generation: normalizedGeneration };
    inflight.set(key, request);
    try {
      const response = await fetchBinary(String(url), controller.signal);
      if (inflight.get(key) !== request || stopped || paused || !partitions.has(key)) return;
      if (response && typeof response === "object" && response.status === 409) {
        inflight.delete(key);
        const currentGeneration = String(response.json?.currentGeneration ?? "");
        const recoveryUrl = response.json?.url;
        if (recoveryRemaining > 0 && /^\d+$/.test(currentGeneration) && typeof recoveryUrl === "string") {
          await load(key, currentGeneration, recoveryUrl, recoveryRemaining - 1);
          return;
        }
        throw new TypeError("Resource partition generation expired");
      }
      const current = partitions.get(key);
      if (!current) return;
      const decoded = decodeResourcePartition(response, {
        regionId: current.regionId,
        resourceId: current.resourceId,
        dimension: "1",
        generation: normalizedGeneration,
      });
      publish(applyMapResourceBinaryCommitted(partitions, key, decoded, { freshness: "live" }));
    } catch (error) {
      if (!isAbort(error) && inflight.get(key) === request && partitions.has(key)) markUnavailable(key);
    } finally {
      if (inflight.get(key) === request) inflight.delete(key);
    }
  };

  const handleEvent = (event) => {
    if (paused || stopped || !event || typeof event !== "object") return;
    const key = String(event.key ?? "");
    if (!partitions.has(key)) return;
    try {
      const result = applyMapResourceBinaryEvent(partitions, event);
      publish(result.partitions);
      if (event.type === "partition-ready" && result.requiresFetch && typeof event.url === "string") {
        void load(key, event.generation, event.url);
      } else if (result.requiresFetch) {
        const current = partitions.get(key);
        const generation = String(event.generation ?? "");
        if (current && /^\d+$/.test(generation)) {
          const params = new URLSearchParams({ regionId: current.regionId, resourceId: current.resourceId, generation });
          void load(key, generation, `/api/local/map/resource-partition?${params}`);
        }
      }
    } catch {
      markUnavailable(key);
    }
  };

  const closeConnection = () => {
    const owned = connection;
    connection = null;
    owned?.close();
  };

  const openConnection = () => {
    if (paused || stopped || connection || !eventUrl || partitions.size === 0) return;
    connection = connectEvents(
      eventUrlWithGenerations(eventUrl, partitions),
      handleEvent,
      () => onError?.("Resource event connection was interrupted"),
    );
  };

  return {
    setScope(scope, nextEventUrl) {
      if (stopped) return;
      const wanted = new Set((scope ?? []).map((entry) => String(entry.key)));
      for (const key of inflight.keys()) if (!wanted.has(key)) abortKey(key);
      publish(reconcileMapResourceBinaryScope(partitions, scope));
      const urlChanged = eventUrl !== String(nextEventUrl ?? "");
      eventUrl = String(nextEventUrl ?? "");
      if (urlChanged) closeConnection();
      openConnection();
    },
    pause() {
      if (paused || stopped) return;
      paused = true;
      closeConnection();
      for (const key of [...inflight.keys()]) abortKey(key);
    },
    resume() {
      if (!paused || stopped) return;
      paused = false;
      openConnection();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      closeConnection();
      for (const key of [...inflight.keys()]) abortKey(key);
    },
    state() {
      return partitions;
    },
  };
}
