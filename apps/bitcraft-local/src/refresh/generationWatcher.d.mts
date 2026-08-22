import type { ActivePanel } from "../types/app.ts";

export type GameDataGenerationWatcher = { stop: () => void };
export const INTERVAL_PAGE_GENERATION_POLL_MS: number;

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

export function createPageGameDataGenerationWatcher(options: {
  activePanel: ActivePanel;
  claimId: string;
  fetch?: typeof fetch;
  EventSource?: typeof EventSource;
  setInterval?: (callback: () => void, delay: number) => unknown;
  clearInterval?: (timer: unknown) => void;
  isVisible?: () => boolean;
  onGeneration?: (generation: number, event: unknown) => void;
}): GameDataGenerationWatcher | null;
