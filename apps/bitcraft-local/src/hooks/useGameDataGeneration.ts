import React from "react";

type GenerationEvent = {
  generation?: unknown;
  changedDomains?: unknown;
};

function generationNumber(value: unknown): number {
  const generation = Number(value);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : 0;
}

export function useGameDataGeneration(claimId: string, domains: string[]): number {
  const [sequence, setSequence] = React.useState(0);
  const domainKey = [...new Set(domains.map(String).filter(Boolean))].sort().join(",");

  React.useEffect(() => {
    if (!claimId || !domainKey) return;
    const search = new URLSearchParams({ claimId, domains: domainKey });
    const lastGeneration = { current: 0 };
    let closed = false;
    let pollTimer: number | null = null;

    const apply = (event: GenerationEvent) => {
      const generation = generationNumber(event?.generation);
      if (generation <= lastGeneration.current) return;
      lastGeneration.current = generation;
      setSequence((current) => current + 1);
    };
    const poll = async () => {
      try {
        const response = await fetch(`/api/local/game-data/generation?${search}`);
        if (response.ok) apply(await response.json());
      } catch {
        // Keep the last rendered generation; the next bounded poll retries locally.
      }
    };
    const startPolling = () => {
      if (closed || pollTimer != null) return;
      void poll();
      pollTimer = window.setInterval(() => void poll(), 750);
    };
    const events = new EventSource(`/api/local/game-data/events?${search}`);
    events.onmessage = (message) => {
      try {
        apply(JSON.parse(message.data));
      } catch {
        // A malformed generation notification cannot invalidate current data.
      }
    };
    events.onerror = () => {
      events.close();
      startPolling();
    };

    return () => {
      closed = true;
      events.close();
      if (pollTimer != null) window.clearInterval(pollTimer);
    };
  }, [claimId, domainKey]);

  return sequence;
}
