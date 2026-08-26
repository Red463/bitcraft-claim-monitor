const UINT64_MAX = 18_446_744_073_709_551_615n;

export type SettlementHint = {
  claimId: string;
  name: string;
  regionId: string;
  tier?: number;
  ownerName?: string;
};

export class RelaySettlementHintsError extends Error {
  readonly code = "RELAY_MALFORMED_SETTLEMENT_HINTS";
  readonly status = 502;

  constructor() {
    super("Relay HTTP returned malformed settlement search results.");
    this.name = "RelaySettlementHintsError";
  }
}

function decimalId(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  try { return BigInt(value) <= UINT64_MAX ? value : null; } catch { return null; }
}

function malformed(): never {
  throw new RelaySettlementHintsError();
}

export function normalizeSettlementHints(value: unknown, query: string): SettlementHint[] {
  if (!Array.isArray(value)) malformed();
  const needle = String(query).normalize("NFKC").toLocaleLowerCase();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) malformed();
    const row = entry as Record<string, unknown>;
    const claimId = decimalId(row.entity_id);
    const regionId = decimalId(row.region);
    const name = typeof row.name === "string" ? row.name.normalize("NFKC").trim() : "";
    if (!claimId || !regionId || !name || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name)) malformed();
    const comparable = name.toLocaleLowerCase();
    const rank = comparable === needle ? 0 : comparable.startsWith(needle) ? 1 : comparable.includes(needle) ? 2 : 3;
    const tier = row.tier;
    if (tier != null && (typeof tier !== "number" || !Number.isInteger(tier) || tier < 0)) malformed();
    if (row.owner_player_username != null && typeof row.owner_player_username !== "string") malformed();
    const ownerName = typeof row.owner_player_username === "string" ? row.owner_player_username.normalize("NFKC").trim() : "";
    if ([...ownerName].length > 80 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ownerName)) malformed();
    return {
      index,
      rank,
      hint: {
        claimId,
        name,
        regionId,
        ...(typeof tier === "number" ? { tier } : {}),
        ...(ownerName ? { ownerName } : {}),
      },
    };
  }).filter(({ rank }) => rank < 3)
    .sort((left, right) => left.rank - right.rank
      || left.hint.name.toLocaleLowerCase().localeCompare(right.hint.name.toLocaleLowerCase())
      || (BigInt(left.hint.claimId) < BigInt(right.hint.claimId) ? -1 : 1)
      || left.index - right.index)
    .slice(0, 20)
    .map(({ hint }) => hint);
}
