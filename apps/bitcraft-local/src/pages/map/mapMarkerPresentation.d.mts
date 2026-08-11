export type MapMarkerPresentation =
  | Readonly<{ mode: "canvas"; glyph: string }>
  | Readonly<{ mode: "image"; iconUrl: string; glyph: string }>
  | Readonly<{ mode: "glyph"; glyph: string }>;

export const MAP_MARKER_PRESENTATIONS: Readonly<Record<string, MapMarkerPresentation>>;

export function mapMarkerPresentation(kind: string): MapMarkerPresentation;
