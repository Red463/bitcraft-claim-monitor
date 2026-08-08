import { PAGE_REFRESH_POLL_MS } from "./pageRefresh.mjs";

function generationNumber(value) {
  const generation = Number(value);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : 0;
}

export function createGameDataGenerationWatcher(options) {
  const domainKey = [...new Set((options.domains ?? []).map(String).filter(Boolean))].sort().join(",");
  const search = new URLSearchParams({ claimId: String(options.claimId ?? ""), domains: domainKey });
  const fetcher = options.fetch ?? globalThis.fetch;
  const EventSourceClass = options.EventSource ?? globalThis.EventSource;
  const setIntervalFn = options.setInterval ?? globalThis.setInterval;
  const clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
  const onGeneration = options.onGeneration ?? (() => {});
  let lastGeneration = 0;
  let closed = false;
  let pollInFlight = false;

  function apply(event) {
    const generation = generationNumber(event?.generation);
    if (closed || generation <= lastGeneration) return;
    lastGeneration = generation;
    onGeneration(generation, event);
  }

  async function poll() {
    if (closed || pollInFlight || (options.isVisible && !options.isVisible())) return;
    pollInFlight = true;
    try {
      const response = await fetcher(`/api/local/game-data/generation?${search}`);
      if (response.ok) apply(await response.json());
    } catch {
      // The last rendered generation stays authoritative until a later poll succeeds.
    } finally {
      pollInFlight = false;
    }
  }

  const events = new EventSourceClass(`/api/local/game-data/events?${search}`);
  events.onmessage = (message) => {
    try {
      apply(JSON.parse(message.data));
    } catch {
      // Ignore malformed invalidations; the generation poll remains active.
    }
  };
  void poll();
  const pollTimer = setIntervalFn(() => void poll(), options.pollMs ?? PAGE_REFRESH_POLL_MS);

  return {
    stop() {
      if (closed) return;
      closed = true;
      events.close();
      clearIntervalFn(pollTimer);
    },
  };
}
