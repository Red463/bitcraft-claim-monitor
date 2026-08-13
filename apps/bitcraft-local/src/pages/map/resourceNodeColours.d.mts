export const RESOURCE_NODE_FALLBACK_COLOUR: string;

export function resourceNodeColour(resourceId: unknown, tier: unknown): string;
export function resourceFeatureColour(
  feature: { identity?: unknown } | null | undefined,
  resourceTiers: Readonly<Record<string, number | null | undefined>> | null | undefined,
): string;
export function selectedResourceTierMap(
  resourceIds: readonly unknown[],
  catalogByToken: { get(token: string): { tier?: unknown } | undefined } | null | undefined,
): Record<string, number | null>;
