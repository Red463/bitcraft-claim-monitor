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

const CLAIM_TIER_GLYPHS = Object.freeze(["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]);

export function claimMarkerPresentation(tier) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 10) return presentations.claim;
  return Object.freeze({
    mode: "image",
    iconUrl: `/map-icons/claims/claim_t${tier}.png`,
    glyph: CLAIM_TIER_GLYPHS[tier],
    badgeCrop: true,
  });
}

const FALLBACK_PRESENTATION = Object.freeze({ mode: "glyph", glyph: "•" });

export function mapMarkerPresentation(kind) {
  return MAP_MARKER_PRESENTATIONS[kind] ?? FALLBACK_PRESENTATION;
}
