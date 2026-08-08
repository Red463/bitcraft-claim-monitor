export type GameDataGenerationWatcher = { stop: () => void };

export function createGameDataGenerationWatcher(options: {
  claimId: string;
  domains: string[];
  fetch?: typeof fetch;
  EventSource?: typeof EventSource;
  setInterval?: (callback: () => void, delay: number) => unknown;
  clearInterval?: (timer: unknown) => void;
  pollMs?: number;
  isVisible?: () => boolean;
  onGeneration?: (generation: number, event: unknown) => void;
}): GameDataGenerationWatcher;
