export type MapMarkerPresentation =
  | Readonly<{ mode: "canvas"; glyph: string }>
  | Readonly<{ mode: "image"; iconUrl: string; glyph: string; badgeCrop?: boolean; variant?: "claim-tier" | "claim-npc" | "watchtower" }>
  | Readonly<{ mode: "glyph"; glyph: string }>;

export const MAP_MARKER_PRESENTATIONS: Readonly<Record<string, MapMarkerPresentation>>;

export function claimDisplayTier(tier: unknown): number | null;
export function claimMarkerPresentation(tier: unknown, npc?: boolean): MapMarkerPresentation;

export function mapMarkerPresentation(kind: string): MapMarkerPresentation;
