type Coverage = { fresh?: number; reused?: number; missing?: number; total?: number };

type HexiteReserves = {
  status?: string;
  refreshing?: boolean;
  estimatedEnergyEquivalent?: number | null;
  calculatedAt?: string | null;
  capsuleEnergyCost?: number | null;
  energy?: { treasury?: number; playerInventories?: number; sharedClaimInventories?: number };
  capsules?: { readyTotal?: number; reserveBuildings?: number };
  coverage?: { players?: Coverage; claims?: Coverage; foundry?: string };
  errors?: string[];
};

export type HexiteReservePresentation = {
  primary: string;
  secondary: string;
  detail: string;
  sortValue: number | null;
  tone: "muted" | "warn" | "danger" | "good";
};

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ageLabel(value: unknown, nowMs: number): string {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "unknown age";
  const minutes = Math.max(0, Math.round((nowMs - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function coveragePercent(value: HexiteReserves): number {
  const groups = [value.coverage?.players, value.coverage?.claims];
  const total = groups.reduce((sum, group) => sum + number(group?.total), 0);
  if (total === 0) return 100;
  const covered = groups.reduce((sum, group) => sum + number(group?.fresh) + number(group?.reused), 0);
  return Math.max(0, Math.min(100, Math.round((covered / total) * 100)));
}

export function presentHexiteReserves(value: HexiteReserves | null | undefined, nowMs = Date.now()): HexiteReservePresentation {
  if (!value || value.status === "pending") {
    return {
      primary: value?.refreshing ? "Scanning" : "Queued",
      secondary: value?.refreshing ? "First sweep in progress" : "Awaiting first sweep",
      detail: "Foundry Capsules unavailable",
      sortValue: null,
      tone: "muted",
    };
  }

  const estimate = value.estimatedEnergyEquivalent == null ? null : Number(value.estimatedEnergyEquivalent);
  if (estimate == null || !Number.isFinite(estimate)) {
    return {
      primary: "Unavailable",
      secondary: "No usable estimate",
      detail: "Foundry Capsules unavailable",
      sortValue: null,
      tone: "danger",
    };
  }

  const capsules = number(value.capsules?.readyTotal);
  const status = value.status === "complete" ? "Complete" : "Partial";
  return {
    primary: `≈ ${estimate.toLocaleString(undefined, { maximumFractionDigits: 0 })} HE`,
    secondary: `(${capsules.toLocaleString(undefined, { maximumFractionDigits: 0 })} capsules ready)`,
    detail: `${status} · ${coveragePercent(value)}% scanned · ${ageLabel(value.calculatedAt, nowMs)}`,
    sortValue: estimate,
    tone: value.status === "complete" ? "good" : "warn",
  };
}

function formatted(value: unknown): string {
  return number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function describeHexiteReserves(value: HexiteReserves | null | undefined): string {
  const lines = value?.estimatedEnergyEquivalent == null
    ? ["The Hexite breakdown is not available until the scan completes."]
    : [
      `Treasury: ${formatted(value.energy?.treasury)} HE`,
      `Player wallets and storage: ${formatted(value.energy?.playerInventories)} HE`,
      `Shared claim storage: ${formatted(value.energy?.sharedClaimInventories)} HE`,
      `Ready Capsules: ${formatted(value.capsules?.readyTotal)} (${formatted(value.capsules?.reserveBuildings)} in Hexite Reserves)`,
      `Capsule conversion: ${value.capsuleEnergyCost == null ? "unavailable" : `${formatted(value.capsuleEnergyCost)} HE each`}`,
      `Player sources: ${formatted(value.coverage?.players?.fresh)} fresh, ${formatted(value.coverage?.players?.reused)} reused, ${formatted(value.coverage?.players?.missing)} missing`,
      `Claim sources: ${formatted(value.coverage?.claims?.fresh)} fresh, ${formatted(value.coverage?.claims?.reused)} reused, ${formatted(value.coverage?.claims?.missing)} missing`,
    ];
  lines.push("Completed Foundry Capsules are unavailable from BitJita and are excluded.");
  if (Array.isArray(value?.errors) && value.errors.length) lines.push(`Scan errors: ${value.errors.slice(0, 3).join("; ")}`);
  return lines.join("\n");
}
