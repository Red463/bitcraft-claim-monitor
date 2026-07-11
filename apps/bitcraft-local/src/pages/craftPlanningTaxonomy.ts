import type { AnyRecord } from "../main-app-data";

export const PLANNER_SECTION_ORDER = [
  "Carpentry",
  "Construction",
  "Cooking",
  "Farming",
  "Fishing",
  "Foraging",
  "Forestry",
  "Hunting",
  "Leatherwork",
  "Masonry",
  "Mining",
  "Scholar",
  "Smithing",
  "Tailor",
  "Taming",
  "Others",
] as const;

const ROWS: Record<string, string[]> = {
  Carpentry: ["Stripped Wood", "Plank", "Empty Bucket", "Water", "Refined Plank", "Woodworking Sandpaper"],
  Construction: [],
  Cooking: [],
  Farming: ["Fertilizer", "Crop Oil", "Filament", "Filament Plant", "Grain Plant", "Straw", "Vegetable Plant"],
  Fishing: ["Baitfish", "Bait", "Crushed Shells", "Lake Fish", "Ocean Fish", "Fish Oil"],
  Foraging: ["Berry", "Citric Berry", "Clay", "Gypsite", "Sand", "Flower", "Plant Fiber"],
  Forestry: ["Trunk", "Bark", "Resin", "Wood Log"],
  Hunting: ["Animal", "Animal Hair", "Raw Meat", "Raw Pelt"],
  Leatherwork: ["Cleaned Pelt", "Hideworking Salt", "Tannin", "Tanned Pelt", "Leather", "Refined Leather", "Textile"],
  Masonry: ["Potter's Mix", "Unfired Brick", "Brickworking Binding Ash", "Brick", "Refined Brick", "Glass", "Vial", "Pitch"],
  Mining: ["Chunk", "Braxite", "Pebbles", "Ore Chunk", "Ore"],
  Scholar: ["Ancient Hieroglyphs", "Firesand", "Leather Solvent", "Metal Solvent", "Parchment", "Pigment", "Ink", "Journal", "Cloth Research", "Leather Research", "Metal Research", "Stone Research", "Wood Research", "Codex", "Wood Polish"],
  Smithing: ["Crushed Ore", "Metalworking Flux", "Ore Concentrate", "Molten Ingot", "Ingot", "Refined Ingot"],
  Tailor: ["Clothmaker's Mordant", "Spool of Thread", "Cloth Strip", "Cloth", "Refined Cloth"],
  Taming: ["Animal Swill", "Animal Food", "Tamed Animal", "Animal Trap", "Domesticated Animal Materials"],
  Others: [],
};

const ALIASES = new Map<string, string>([
  ["wispweave filament", "Filament"],
  ["filament", "Filament"],
  ["wispweave plant", "Filament Plant"],
  ["filament plant", "Filament Plant"],
  ["starbulb", "Vegetable Plant"],
  ["starbulb plant", "Vegetable Plant"],
  ["vegetable", "Vegetable Plant"],
  ["vegetable plant", "Vegetable Plant"],
  ["oceanfish", "Ocean Fish"],
  ["ocean fish", "Ocean Fish"],
  ["lake fish", "Lake Fish"],
]);

const HIDDEN_TAGS = new Set([
  "filament seeds",
  "wild seeds",
  "vegetable seeds",
  "grain seeds",
  "lake fish filet",
  "lake fish fillet",
  "oceanfish filet",
  "ocean fish filet",
  "ocean fish fillet",
  "food waste",
]);

const ROW_LOOKUP = new Map<string, { row: string; section: string; order: number }>();
for (const [section, rows] of Object.entries(ROWS)) {
  rows.forEach((row, order) => ROW_LOOKUP.set(row.toLowerCase(), { row, section, order }));
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export type PlannerTaxonomy = {
  hidden: boolean;
  row: string;
  section: string | null;
  order: number;
  known: boolean;
};

export function plannerTaxonomyFor(item: AnyRecord): PlannerTaxonomy {
  const tag = text(item.tag ?? item.itemTag ?? item.categoryTag);
  const name = text(item.name ?? item.label ?? item.itemName);
  const rawIdentity = /^trade\s+good$/i.test(tag) || !tag ? name : tag;
  const normalized = rawIdentity.toLowerCase();
  if (HIDDEN_TAGS.has(normalized)) return { hidden: true, row: rawIdentity, section: null, order: Number.MAX_SAFE_INTEGER, known: true };
  const row = ALIASES.get(normalized) ?? rawIdentity;
  const known = ROW_LOOKUP.get(row.toLowerCase());
  return {
    hidden: false,
    row,
    section: known?.section ?? null,
    order: known?.order ?? Number.MAX_SAFE_INTEGER,
    known: Boolean(known),
  };
}

export function plannerRowOrder(section: string, row: string) {
  const rows = ROWS[section] ?? [];
  const index = rows.findIndex((candidate) => candidate.toLowerCase() === row.toLowerCase());
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
