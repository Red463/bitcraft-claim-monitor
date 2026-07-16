export const PLANNER_SECTION_ORDER = [
  "Carpentry", "Construction", "Cooking", "Farming", "Fishing", "Foraging", "Forestry", "Hunting",
  "Leatherworking", "Masonry", "Mining", "Scholar", "Smithing", "Tailoring", "Taming", "Others",
];

const ROWS = {
  Carpentry: ["Stripped Wood", "Plank", "Empty Bucket", "Water", "Refined Plank", "Woodworking Sandpaper"],
  Construction: [],
  Cooking: [],
  Farming: ["Fertilizer", "Crop Oil", "Filament", "Filament Plant", "Grain Plant", "Straw", "Vegetable Plant"],
  Fishing: ["Baitfish", "Bait", "Crushed Shells", "Lake Fish", "Ocean Fish", "Fish Oil"],
  Foraging: ["Berry", "Citric Berry", "Clay", "Gypsite", "Sand", "Flower", "Plant Fiber"],
  Forestry: ["Trunk", "Bark", "Resin", "Wood Log"],
  Hunting: ["Animal", "Animal Hair", "Raw Meat", "Raw Pelt"],
  Leatherworking: ["Cleaned Pelt", "Hideworking Salt", "Tannin", "Tanned Pelt", "Leather", "Refined Leather", "Textile"],
  Masonry: ["Potter's Mix", "Unfired Brick", "Brickworking Binding Ash", "Brick", "Refined Brick", "Glass", "Vial", "Pitch"],
  Mining: ["Chunk", "Braxite", "Pebbles", "Ore Chunk", "Ore"],
  Scholar: ["Ancient Hieroglyphs", "Firesand", "Leather Solvent", "Metal Solvent", "Parchment", "Pigment", "Ink", "Journal", "Cloth Research", "Leather Research", "Metal Research", "Stone Research", "Wood Research", "Codex", "Wood Polish"],
  Smithing: ["Crushed Ore", "Metalworking Flux", "Ore Concentrate", "Molten Ingot", "Ingot", "Refined Ingot"],
  Tailoring: ["Clothmaker's Mordant", "Spool of Thread", "Cloth Strip", "Cloth", "Refined Cloth"],
  Taming: ["Animal Swill", "Animal Food", "Tamed Animal", "Animal Trap", "Domesticated Animal Materials"],
  Others: [],
};

const ALIASES = new Map([
  ["wispweave filament", "Filament"], ["filament", "Filament"],
  ["wispweave plant", "Filament Plant"], ["filament plant", "Filament Plant"],
  ["starbulb", "Vegetable Plant"], ["starbulb plant", "Vegetable Plant"],
  ["vegetable", "Vegetable Plant"], ["vegetable plant", "Vegetable Plant"],
  ["oceanfish", "Ocean Fish"], ["ocean fish", "Ocean Fish"], ["lake fish", "Lake Fish"],
]);

const HIDDEN_TAGS = new Set([
  "filament seeds", "wild seeds", "vegetable seeds", "grain seeds", "lake fish filet", "lake fish fillet",
  "oceanfish filet", "ocean fish filet", "ocean fish fillet", "food waste",
]);

const ROW_LOOKUP = new Map();
for (const [section, rows] of Object.entries(ROWS)) {
  rows.forEach((row, order) => ROW_LOOKUP.set(row.toLowerCase(), { row, section, order }));
}

const text = (value) => String(value ?? "").trim();

const words = (value) => text(value).toLowerCase().match(/[a-z0-9]+/g) ?? [];

function wordsAppearInOrder(needles, haystack) {
  let index = 0;
  for (const word of haystack) {
    if (word === needles[index]) index += 1;
    if (index === needles.length) return true;
  }
  return needles.length === 0;
}

function moreSpecificKnownRow(base, name) {
  const baseWords = words(base.row);
  const nameWords = words(name);
  let best = base;
  let bestLength = baseWords.length;
  for (const candidate of ROW_LOOKUP.values()) {
    const candidateWords = words(candidate.row);
    if (candidate.section !== base.section || candidateWords.length <= bestLength) continue;
    if (!baseWords.every((word) => candidateWords.includes(word))) continue;
    if (!wordsAppearInOrder(candidateWords, nameWords)) continue;
    best = candidate;
    bestLength = candidateWords.length;
  }
  return best;
}

export function plannerTaxonomyFor(item = {}) {
  const tag = text(item.tag ?? item.itemTag ?? item.categoryTag);
  const name = text(item.name ?? item.label ?? item.itemName);
  const rawIdentity = /^trade\s+good$/i.test(tag) || !tag ? name : tag;
  const normalized = rawIdentity.toLowerCase();
  if (HIDDEN_TAGS.has(normalized)) return { hidden: true, row: rawIdentity, section: null, order: Number.MAX_SAFE_INTEGER, known: true };
  let row = ALIASES.get(normalized) ?? rawIdentity;
  let known = ROW_LOOKUP.get(row.toLowerCase());
  if (known && tag && !/^trade\s+good$/i.test(tag) && name) {
    known = moreSpecificKnownRow(known, name);
    row = known.row;
  }
  return { hidden: false, row, section: known?.section ?? null, order: known?.order ?? Number.MAX_SAFE_INTEGER, known: Boolean(known) };
}

export function plannerOverrideKeyFor(item = {}, fallbackIdentity = "") {
  const tag = text(item.tag ?? item.itemTag ?? item.categoryTag);
  if (!tag || /^trade\s+good$/i.test(tag)) return `item:${fallbackIdentity}`;
  const taggedFamily = plannerTaxonomyFor({ tag, name: tag }).row;
  const family = plannerTaxonomyFor(item).row;
  return family === taggedFamily ? `tag:${tag}` : `row:${family}`;
}

export function plannerRowOrder(section, row) {
  const rows = ROWS[section] ?? [];
  const index = rows.findIndex((candidate) => candidate.toLowerCase() === row.toLowerCase());
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
