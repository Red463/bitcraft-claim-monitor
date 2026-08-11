const presentations = {
  waystone: Object.freeze({
    mode: "image",
    iconUrl: "/game-icons/GeneratedIcons/Other/GeneratedIcons/Items/WaystoneCrystal.webp",
    glyph: "W",
  }),
  market: Object.freeze({
    mode: "image",
    iconUrl: "/game-icons/GeneratedIcons/Items/HexcoinPurse.webp",
    glyph: "M",
  }),
  claim: Object.freeze({ mode: "canvas", glyph: "C" }),
  "empire-settlement": Object.freeze({ mode: "glyph", glyph: "E" }),
  watchtower: Object.freeze({ mode: "glyph", glyph: "T" }),
  player: Object.freeze({ mode: "glyph", glyph: "P" }),
  focus: Object.freeze({ mode: "glyph", glyph: "+" }),
};

export const MAP_MARKER_PRESENTATIONS = Object.freeze(presentations);

const FALLBACK_PRESENTATION = Object.freeze({ mode: "glyph", glyph: "•" });

export function mapMarkerPresentation(kind) {
  return MAP_MARKER_PRESENTATIONS[kind] ?? FALLBACK_PRESENTATION;
}
