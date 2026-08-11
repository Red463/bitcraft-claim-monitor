export type MapMarkerPresentation =
  | Readonly<{ mode: "canvas"; glyph: string }>
  | Readonly<{ mode: "image"; iconUrl: string; glyph: string; badgeCrop?: boolean }>
  | Readonly<{ mode: "glyph"; glyph: string }>;

export const MAP_MARKER_PRESENTATIONS: Readonly<Record<string, MapMarkerPresentation>>;

export function claimMarkerPresentation(tier: unknown): MapMarkerPresentation;

export function mapMarkerPresentation(kind: string): MapMarkerPresentation;
