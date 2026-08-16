export const RESOURCE_NODE_FALLBACK_COLOUR: string;

export function resourceNodeColour(resourceId: unknown, tier: unknown): string;
export function resourceFeatureColour(
  feature: { identity?: unknown } | null | undefined,
  resourceColours: Readonly<Record<string, string | undefined>> | null | undefined,
): string;
export function selectedResourceColourMap(
  resourceIds: readonly unknown[],
  catalogByToken: {
    entries(): IterableIterator<[string, { tier?: unknown }]>;
    get(token: string): { tier?: unknown } | undefined;
  } | null | undefined,
): Record<string, string>;
