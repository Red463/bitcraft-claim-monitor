export const PLANNER_SECTION_ORDER = [
  "Carpentry", "Construction", "Cooking", "Farming", "Fishing", "Foraging", "Forestry", "Hunting",
  "Leatherworking", "Masonry", "Mining", "Scholar", "Smithing", "Tailoring", "Taming", "Others",
];

const ROWS = {
  Carpentry: ["Stripped Wood", "Plank", "Empty Bucket", "Water", "Refined Plank", "Woodworking Sandpaper", "Timber"],
  Construction: [],
  Cooking: [],
  Farming: ["Fertilizer", "Crop Oil", "Filament", "Filament Plant", "Grain Plant", "Straw", "Vegetable Plant"],
  Fishing: ["Baitfish", "Bait", "Crushed Shells", "Lake Fish", "Ocean Fish", "Fish Oil"],
  Foraging: ["Berry", "Citric Berry", "Clay", "Gypsite", "Sand", "Flower", "Plant Fiber", "Plant Roots"],
  Forestry: ["Trunk", "Bark", "Resin", "Wood Log"],
  Hunting: ["Animal", "Animal Hair", "Raw Meat", "Raw Skitch Meat", "Raw Crab Meat", "Oyster Meat", "Raw Pelt"],
  Leatherworking: ["Cleaned Pelt", "Hideworking Salt", "Tannin", "Tanned Pelt", "Leather", "Refined Leather", "Textile"],
  Masonry: ["Potter's Mix", "Unfired Brick", "Brickworking Binding Ash", "Brick", "Refined Brick", "Glass", "Sea Glass", "Vial", "Pitch", "Brick Slab"],
  Mining: ["Chunk", "Braxite", "Pebbles", "Ore Chunk", "Ore"],
  Scholar: ["Ancient Hieroglyphs", "Stone Carvings", "Stone Diagrams", "Firesand", "Leather Solvent", "Metal Solvent", "Parchment", "Pigment", "Ink", "Journal", "Cloth Research", "Leather Research", "Metal Research", "Stone Research", "Wood Research", "Codex", "Wood Polish"],
  Smithing: ["Crushed Ore", "Metalworking Flux", "Ore Concentrate", "Molten Ingot", "Ingot", "Refined Ingot", "Nails"],
  Tailoring: ["Clothmaker's Mordant", "Spool of Thread", "Rope", "Cloth Strip", "Cloth", "Refined Cloth"],
  Taming: [
    "Animal Swill", "Animal Food", "Nubi Goat Food", "Nubi Goat Vitamins", "Sagi Bird Food", "Sagi Bird Vitamins",
    "Tamed Animal", "Captured Nubi Goat", "Captured Sagi Bird", "Domesticated Nubi Goat", "Domesticated Sagi Bird",
    "Domesticated Nubi Goat Breeding", "Domesticated Sagi Bird Breeding", "Animal Trap", "Domesticated Animal Materials",
    "Auric Sagi Bird Egg", "Fertilized Sagi Bird Egg", "Nubi Goat Fur", "Nubi Milk", "Sagi Bird Down Feather", "Sagi Bird Egg",
  ],
  Others: [],
};

const ALIASES = new Map([
  ["wispweave filament", "Filament"], ["filament", "Filament"],
  ["wispweave plant", "Filament Plant"], ["filament plant", "Filament Plant"],
  ["starbulb", "Vegetable Plant"], ["starbulb plant", "Vegetable Plant"],
  ["vegetable", "Vegetable Plant"], ["vegetable plant", "Vegetable Plant"],
  ["oceanfish", "Ocean Fish"], ["ocean fish", "Ocean Fish"], ["lake fish", "Lake Fish"],
  ["roots", "Plant Roots"], ["nail", "Nails"], ["thread", "Spool of Thread"],
]);

const HIDDEN_TAGS = new Set([
  "filament seeds", "wild seeds", "vegetable seeds", "grain seeds", "lake fish filet", "lake fish fillet",
  "oceanfish filet", "ocean fish filet", "ocean fish fillet", "food waste",
]);

const FAMILY_QUALIFIERS = /\b(?:basic|rough|simple|sturdy|infused|fine|exquisite|peerless|ornate|pristine|magnificent|flawless|beginner's|novice|essential|proficient|advanced|comprehensive)\b/gi;

const SHARED_TAG_FAMILIES = new Map([
  ["pebbles", new Map([
    ["pebbles", "Pebbles"],
    ["braxite", "Braxite"],
  ])],
  ["glass", new Map([
    ["glass", "Glass"],
    ["sea glass", "Sea Glass"],
  ])],
  ["raw meat", new Map([
    ["raw meat", "Raw Meat"],
    ["raw skitch meat", "Raw Skitch Meat"],
    ["raw crab meat", "Raw Crab Meat"],
    ["oyster meat", "Oyster Meat"],
  ])],
  ["ancient hieroglyphs", new Map([
    ["ancient hieroglyphs", "Ancient Hieroglyphs"],
    ["hieroglyphs", "Ancient Hieroglyphs"],
    ["stone carvings", "Stone Carvings"],
    ["stone diagrams", "Stone Diagrams"],
  ])],
  ["animal food", new Map([
    ["animal food", "Animal Food"],
    ["nubi goat food", "Nubi Goat Food"],
    ["nubi goat vitamins", "Nubi Goat Vitamins"],
    ["sagi bird food", "Sagi Bird Food"],
    ["sagi bird vitamins", "Sagi Bird Vitamins"],
  ])],
  ["domesticated animal materials", new Map([
    ["domesticated animal materials", "Domesticated Animal Materials"],
    ["auric sagi bird egg", "Auric Sagi Bird Egg"],
    ["fertilized sagi bird egg", "Fertilized Sagi Bird Egg"],
    ["fertalized sagi bird egg", "Fertilized Sagi Bird Egg"],
    ["nubi goat fur", "Nubi Goat Fur"],
    ["nubi milk", "Nubi Milk"],
    ["sagi bird down feather", "Sagi Bird Down Feather"],
    ["sagi bird egg", "Sagi Bird Egg"],
  ])],
  ["tamed animal", new Map([
    ["tamed animal", "Tamed Animal"],
    ["captured nubi goat", "Captured Nubi Goat"],
    ["captured sagi bird", "Captured Sagi Bird"],
    ["domesticated nubi goat", "Domesticated Nubi Goat"],
    ["domesticated sagi bird", "Domesticated Sagi Bird"],
    ["domesticated nubi goat breeding", "Domesticated Nubi Goat Breeding"],
    ["domesticated sagi bird breeding", "Domesticated Sagi Bird Breeding"],
  ])],
]);

const ROW_LOOKUP = new Map();
for (const [section, rows] of Object.entries(ROWS)) {
  rows.forEach((row, order) => ROW_LOOKUP.set(row.toLowerCase(), { row, section, order }));
}

const text = (value) => String(value ?? "").trim();

function familyNameFromItemName(value) {
  return text(value)
    .replace(FAMILY_QUALIFIERS, "")
    .replace(/\s+output$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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
  const sharedFamilies = SHARED_TAG_FAMILIES.get(normalized);
  if (sharedFamilies) {
    if (!name) return { hidden: false, row, section: known?.section ?? null, order: known?.order ?? Number.MAX_SAFE_INTEGER, known: false };
    const familyRow = sharedFamilies.get(familyNameFromItemName(name));
    const family = familyRow ? ROW_LOOKUP.get(familyRow.toLowerCase()) : null;
    if (family) return { hidden: false, row: family.row, section: family.section, order: family.order, known: true };
    return { hidden: false, row: name, section: known?.section ?? null, order: Number.MAX_SAFE_INTEGER, known: false };
  }
  if (known && tag && !/^trade\s+good$/i.test(tag) && name) {
    known = moreSpecificKnownRow(known, name);
    row = known.row;
  }
  if (!known && name) row = name;
  return { hidden: false, row, section: known?.section ?? null, order: known?.order ?? Number.MAX_SAFE_INTEGER, known: Boolean(known) };
}

export function plannerOverrideKeyFor(item = {}, fallbackIdentity = "") {
  const tag = text(item.tag ?? item.itemTag ?? item.categoryTag);
  if (!tag || /^trade\s+good$/i.test(tag)) return `item:${fallbackIdentity}`;
  const taxonomy = plannerTaxonomyFor(item);
  if (!taxonomy.known) return `item:${fallbackIdentity}`;
  const taggedFamily = plannerTaxonomyFor({ tag, name: tag }).row;
  const family = taxonomy.row;
  return family === taggedFamily ? `tag:${tag}` : `row:${family}`;
}

export function plannerRowOrder(section, row) {
  const rows = ROWS[section] ?? [];
  const index = rows.findIndex((candidate) => candidate.toLowerCase() === row.toLowerCase());
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
