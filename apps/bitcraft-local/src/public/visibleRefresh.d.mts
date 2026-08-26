export type VisibleRefreshController = {
  start(): void;
  stop(): void;
  visibilityChanged(): void;
};

export function createVisibleRefreshController(options: {
  intervalMs?: number;
  isVisible(): boolean;
  refresh(): void | Promise<void>;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}): VisibleRefreshController;
