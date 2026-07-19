import { formatCompactNumber } from "../../utils/format.ts";

type Coverage = { fresh?: number; reused?: number; missing?: number; total?: number };

type HexiteReserves = {
  status?: string;
  refreshing?: boolean;
  estimatedEnergyEquivalent?: number | null;
  calculatedAt?: string | null;
  capsuleEnergyCost?: number | null;
  capsuleWatchtowerEnergyValue?: number | null;
  energy?: {
    treasury?: number;
    playerInventories?: number;
    sharedClaimInventories?: number;
    total?: number;
  };
  capsules?: { readyTotal?: number; reserveBuildings?: number };
  coverage?: { players?: Coverage; claims?: Coverage; foundry?: string };
  errors?: string[];
};

export type HexiteReserveMetric = "energy" | "capsules" | "watchtower";

export type HexiteReservePresentation = {
  primary: string;
  secondary: string;
  detail: string;
  sortValue: number | null;
  tone: "muted" | "warn" | "danger" | "good";
};

export type HexiteReserveSummaryPresentation = {
  primary: string;
  secondary: string;
  status: string;
  sortValue: number | null;
  tone: "muted" | "warn" | "danger";
  details: string[];
};

const WATCHTOWER_ENERGY_PER_CAPSULE = 1_000;

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function unavailablePresentation(value: HexiteReserves | null | undefined): HexiteReservePresentation {
  if (!value || value.status === "pending") {
    return {
      primary: value?.refreshing ? "Scanning" : "Queued",
      secondary: value?.refreshing ? "First sweep in progress" : "Awaiting first sweep",
      detail: "Foundry Capsules unavailable",
      sortValue: null,
      tone: "muted",
    };
  }

  return {
    primary: "Unavailable",
    secondary: "No usable estimate",
    detail: "Foundry Capsules unavailable",
    sortValue: null,
    tone: "danger",
  };
}

function metricValue(value: HexiteReserves, metric: HexiteReserveMetric): number | null {
  if (metric === "energy") return optionalNumber(value.energy?.total);
  if (metric === "capsules") return optionalNumber(value.capsules?.readyTotal);
  return optionalNumber(value.estimatedEnergyEquivalent);
}

function formatted(value: unknown): string {
  return number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function presentHexiteReserveSummary(
  value: HexiteReserves | null | undefined,
  nowMs = Date.now(),
): HexiteReserveSummaryPresentation {
  if (!value || value.status === "pending") {
    return {
      primary: value?.refreshing ? "Scanning" : "Queued",
      secondary: value?.refreshing ? "First sweep in progress" : "Awaiting first sweep",
      status: "Foundry output unavailable",
      sortValue: null,
      tone: "muted",
      details: ["Completed Foundry Capsules are unavailable from BitJita and excluded."],
    };
  }

  const energy = optionalNumber(value.energy?.total);
  const capsules = optionalNumber(value.capsules?.readyTotal);
  if (value.status === "error" || energy == null || capsules == null) {
    return {
      primary: "Unavailable",
      secondary: "No usable reserve total",
      status: "Foundry output unavailable",
      sortValue: null,
      tone: "danger",
      details: ["The Hexite breakdown is not available until the scan completes."],
    };
  }

  const knownTotal = energy + capsules * WATCHTOWER_ENERGY_PER_CAPSULE;
  const groups = [value.coverage?.players, value.coverage?.claims];
  const reused = groups.reduce((sum, group) => sum + number(group?.reused), 0);
  const missing = groups.reduce((sum, group) => sum + number(group?.missing), 0);
  const status = missing > 0
    ? `Inventory scan incomplete · ${ageLabel(value.calculatedAt, nowMs)}`
    : reused > 0
      ? `Some inventory data reused · ${ageLabel(value.calculatedAt, nowMs)}`
      : `Known inventories scanned · ${ageLabel(value.calculatedAt, nowMs)}`;
  const tone = missing > 0 || reused > 0 ? "warn" : "muted";
  const cost = value.capsuleEnergyCost == null ? "unavailable" : formatted(value.capsuleEnergyCost);
  const details = [
    `Known Watchtower energy: at least ${formatted(knownTotal)}`,
    `Stored HE: ${formatted(energy)} total`,
    `Treasury: ${formatted(value.energy?.treasury)} HE`,
    `Player wallets and storage: ${formatted(value.energy?.playerInventories)} HE`,
    `Shared claim storage: ${formatted(value.energy?.sharedClaimInventories)} HE`,
    `Ready Capsules: ${formatted(capsules)}; ${formatted(value.capsules?.reserveBuildings)} in Hexite Reserve buildings`,
    `Capsules cost ${cost} HE to craft and provide ${formatted(WATCHTOWER_ENERGY_PER_CAPSULE)} Watchtower energy when deployed.`,
    `Player sources: ${formatted(value.coverage?.players?.fresh)} fresh, ${formatted(value.coverage?.players?.reused)} reused, ${formatted(value.coverage?.players?.missing)} missing`,
    `Claim sources: ${formatted(value.coverage?.claims?.fresh)} fresh, ${formatted(value.coverage?.claims?.reused)} reused, ${formatted(value.coverage?.claims?.missing)} missing`,
    "Completed Foundry Capsules are unavailable from BitJita and excluded.",
  ];
  if (Array.isArray(value.errors) && value.errors.length) {
    details.push(`Scan errors: ${value.errors.slice(0, 3).join("; ")}`);
  }

  return {
    primary: `≥ ${formatCompactNumber(knownTotal)} tower energy`,
    secondary: `${formatCompactNumber(energy)} HE + ${formatted(capsules)} Capsules`,
    status,
    sortValue: knownTotal,
    tone,
    details,
  };
}

export function presentHexiteReserveMetric(
  value: HexiteReserves | null | undefined,
  metric: HexiteReserveMetric,
  nowMs = Date.now(),
): HexiteReservePresentation {
  if (!value || value.status === "pending") return unavailablePresentation(value);

  const metricTotal = metricValue(value, metric);
  if (metricTotal == null) return unavailablePresentation(value);

  const capsules = number(value.capsules?.readyTotal);
  const reserveCapsules = number(value.capsules?.reserveBuildings);
  const watchtowerValue = number(value.capsuleWatchtowerEnergyValue);
  const status = value.status === "complete" ? "Complete" : "Partial";
  const detail = `${status} · ${coveragePercent(value)}% scanned · ${ageLabel(value.calculatedAt, nowMs)}`;
  const tone = value.status === "complete" ? "good" : "warn";

  if (metric === "energy") {
    return {
      primary: `${formatted(metricTotal)} HE`,
      secondary: "Loose energy stored",
      detail,
      sortValue: metricTotal,
      tone,
    };
  }

  if (metric === "capsules") {
    return {
      primary: formatted(metricTotal),
      secondary: `${formatted(reserveCapsules)} in Hexite Reserves`,
      detail,
      sortValue: metricTotal,
      tone,
    };
  }

  return {
    primary: `≈ ${formatted(metricTotal)} energy`,
    secondary: `${formatted(capsules)} capsules × ${formatted(watchtowerValue)}`,
    detail,
    sortValue: metricTotal,
    tone,
  };
}

export function presentHexiteReserves(
  value: HexiteReserves | null | undefined,
  nowMs = Date.now(),
): HexiteReservePresentation {
  return presentHexiteReserveMetric(value, "watchtower", nowMs);
}

export function describeHexiteReserveMetric(
  value: HexiteReserves | null | undefined,
  metric: HexiteReserveMetric,
): string {
  if (!value || metricValue(value, metric) == null) {
    return [
      "The Hexite breakdown is not available until the scan completes.",
      "Completed Foundry Capsules are unavailable from BitJita and are excluded.",
    ].join("\n");
  }

  let lines: string[];
  if (metric === "energy") {
    lines = [
      `${formatted(value.energy?.total)} HE stored across treasury, member, and aligned-claim sources.`,
      `Treasury: ${formatted(value.energy?.treasury)} HE`,
      `Player wallets and storage: ${formatted(value.energy?.playerInventories)} HE`,
      `Shared claim storage: ${formatted(value.energy?.sharedClaimInventories)} HE`,
    ];
  } else if (metric === "capsules") {
    lines = [
      `${formatted(value.capsules?.readyTotal)} ready Capsules; ${formatted(value.capsules?.reserveBuildings)} in Hexite Reserves.`,
      "Hexite Reserve Capsules are included in the ready total, not added again.",
    ];
  } else {
    lines = [
      `Watchtower Energy: approximately ${formatted(value.estimatedEnergyEquivalent)} energy`,
      `Loose stored Hexite Energy: ${formatted(value.energy?.total)} HE`,
      `Ready Capsules: ${formatted(value.capsules?.readyTotal)} (${formatted(value.capsules?.reserveBuildings)} in Hexite Reserves)`,
      `Capsules cost ${value.capsuleEnergyCost == null ? "an unavailable amount of" : `${formatted(value.capsuleEnergyCost)}`} HE to craft and provide ${value.capsuleWatchtowerEnergyValue == null ? "an unavailable amount of" : formatted(value.capsuleWatchtowerEnergyValue)} Watchtower energy when deployed.`,
      `Player sources: ${formatted(value.coverage?.players?.fresh)} fresh, ${formatted(value.coverage?.players?.reused)} reused, ${formatted(value.coverage?.players?.missing)} missing`,
      `Claim sources: ${formatted(value.coverage?.claims?.fresh)} fresh, ${formatted(value.coverage?.claims?.reused)} reused, ${formatted(value.coverage?.claims?.missing)} missing`,
    ];
  }

  lines.push("Completed Foundry Capsules are unavailable from BitJita and are excluded.");
  if (Array.isArray(value.errors) && value.errors.length) lines.push(`Scan errors: ${value.errors.slice(0, 3).join("; ")}`);
  return lines.join("\n");
}

export function describeHexiteReserves(value: HexiteReserves | null | undefined): string {
  return describeHexiteReserveMetric(value, "watchtower");
}
