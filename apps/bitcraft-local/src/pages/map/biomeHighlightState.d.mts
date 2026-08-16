export type BiomeHighlightState = { active: number | null; pinned: number | null };
export type BiomeHighlightController = {
  preview(biomeType: number): void;
  leave(): void;
  pin(biomeType: number): void;
  clear(): void;
  dispose(): void;
};

export function createBiomeHighlightController(options: {
  delayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (token: unknown) => void;
  onChange: (state: BiomeHighlightState) => void;
}): BiomeHighlightController;
