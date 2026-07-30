type CatalogEntity = {
  targetId?: unknown;
  kind?: unknown;
  itemType?: unknown;
  name?: unknown;
  tier?: unknown;
  rarity?: unknown;
  tag?: unknown;
  iconAssetName?: unknown;
};

type Technology = {
  name?: unknown;
  tier?: unknown;
  techType?: unknown;
  inputs?: unknown;
};

type ResearchProjection = {
  technologies?: Technology[];
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError(`${label} must be a non-negative decimal integer`);
  }
  return normalized;
}

function materialKind(value: unknown): "items" | "cargo" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "item" || normalized === "items" || normalized === "0") return "items";
  if (normalized === "cargo" || normalized === "1") return "cargo";
  throw new TypeError(`Unsupported research preset material kind: ${String(value)}`);
}

function presetTier(technology: Technology): number | null {
  const tier = Number(technology.tier);
  if (!Number.isSafeInteger(tier) || tier < 2) return null;
  const type = String(technology.techType ?? "").replace(/[^a-z]/gi, "").toLowerCase();
  const name = String(technology.name ?? "").trim();
  return type === "tierupgrade" || type === "settlement" || /^tier\s*\d+$/i.test(name)
    ? tier
    : null;
}

export function buildResearchTierPresets(
  researchValue: unknown,
  getEntity: (catalogKey: string) => CatalogEntity | null,
) {
  const research = researchValue && typeof researchValue === "object" && !Array.isArray(researchValue)
    ? researchValue as ResearchProjection
    : {};
  const grouped = new Map<number, Map<string, bigint>>();
  for (const technology of Array.isArray(research.technologies) ? research.technologies : []) {
    const tier = presetTier(technology);
    if (tier == null) continue;
    const totals = grouped.get(tier) ?? new Map<string, bigint>();
    for (const inputValue of Array.isArray(technology.inputs) ? technology.inputs : []) {
      if (!inputValue || typeof inputValue !== "object" || Array.isArray(inputValue)) {
        throw new TypeError(`Research tier preset T${tier} input must be an object`);
      }
      const input = inputValue as Record<string, unknown>;
      const kind = materialKind(input.kind ?? input.itemType);
      const id = decimalInteger(input.id ?? input.itemId, `Research tier preset T${tier} material id`);
      const quantity = BigInt(
        decimalInteger(input.quantity, `Research tier preset T${tier} material quantity`),
      );
      const key = `${kind}:${id}`;
      totals.set(key, (totals.get(key) ?? 0n) + quantity);
    }
    grouped.set(tier, totals);
  }
  const warnings: string[] = [];
  const presets = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tier, totals]) => ({
      key: `tier-${tier}`,
      label: `T${tier}`,
      tier,
      source: "relay-research",
      items: [...totals.entries()].map(([key, quantity]) => {
        const separator = key.indexOf(":");
        const kind = key.slice(0, separator) as "items" | "cargo";
        const id = key.slice(separator + 1);
        const entity = getEntity(key);
        if (!entity) {
          warnings.push(`Research tier preset T${tier} is missing local catalog identity ${key}.`);
        }
        return {
          id,
          kind,
          itemType: kind === "cargo" ? 1 : 0,
          quantity: quantity.toString(),
          name: String(entity?.name ?? `${kind === "cargo" ? "Cargo" : "Item"} #${id}`),
          tier: entity?.tier ?? null,
          rarityStr: entity?.rarity ?? null,
          tag: entity?.tag ?? null,
          iconAssetName: entity?.iconAssetName ?? null,
        };
      }),
    }))
    .filter((preset) => preset.items.length > 0);
  return { presets, warnings };
}
