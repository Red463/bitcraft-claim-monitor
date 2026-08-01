import { formatCompactNumber } from "../../utils/format.ts";

type Coverage = { fresh?: number; reused?: number; missing?: number; total?: number };
type DecimalValue = number | string;

type HexiteReserves = {
  status?: string;
  refreshing?: boolean;
  estimatedEnergyEquivalent?: DecimalValue | null;
  calculatedAt?: string | null;
  capsuleEnergyCost?: DecimalValue | null;
  capsuleWatchtowerEnergyValue?: DecimalValue | null;
  energy?: {
    treasury?: DecimalValue | null;
    playerInventories?: DecimalValue | null;
    sharedClaimInventories?: DecimalValue | null;
    total?: DecimalValue | null;
  };
  capsules?: {
    playerInventories?: DecimalValue | null;
    sharedClaimInventories?: DecimalValue | null;
    readyTotal?: DecimalValue | null;
    reserveBuildings?: DecimalValue | null;
    foundry?: DecimalValue | null;
  };
  coverage?: { players?: Coverage; claims?: Coverage; foundry?: string };
  errors?: string[];
};

export type HexiteReserveMetric = "energy" | "capsules" | "watchtower";

export type HexiteReservePresentation = {
  primary: string;
  secondary: string;
  detail: string;
  sortValue: DecimalValue | null;
  tone: "muted" | "warn" | "danger" | "good";
};

export type HexiteReserveSummaryPresentation = {
  primary: string;
  secondary: string;
  status: string;
  sortValue: DecimalValue | null;
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

function optionalDecimalValue(value: unknown): DecimalValue | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
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
      primary: value?.refreshing ? "Refreshing" : "Awaiting Relay",
      secondary: "Live Empire data is loading",
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

function metricValue(value: HexiteReserves, metric: HexiteReserveMetric): DecimalValue | null {
  if (metric === "energy") return optionalDecimalValue(value.energy?.total);
  if (metric === "capsules") return optionalDecimalValue(value.capsules?.readyTotal);
  return optionalDecimalValue(value.estimatedEnergyEquivalent);
}

function formatted(value: unknown): string {
  const text = String(value ?? "").trim();
  if (/^\d+$/.test(text)) return BigInt(text).toLocaleString();
  return number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formattedOptional(value: unknown, suffix = ""): string {
  const parsed = optionalDecimalValue(value);
  return parsed == null ? "unavailable" : `${formatted(parsed)}${suffix}`;
}

function watchtowerTotal(energy: DecimalValue, capsules: DecimalValue): DecimalValue {
  const total = BigInt(String(energy)) + BigInt(String(capsules)) * BigInt(WATCHTOWER_ENERGY_PER_CAPSULE);
  if (typeof energy === "number" && typeof capsules === "number" && total <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(total);
  }
  return total.toString();
}

function normalizedCoverage(value: Coverage | null | undefined): Required<Coverage> | null {
  if (!value) return null;
  const normalized = {
    fresh: optionalNumber(value.fresh),
    reused: optionalNumber(value.reused),
    missing: optionalNumber(value.missing),
    total: optionalNumber(value.total),
  };
  const counts = Object.values(normalized);
  if (counts.some((count) => count == null || !Number.isInteger(count) || count < 0)) return null;
  if (number(normalized.fresh) + number(normalized.reused) + number(normalized.missing) !== normalized.total) return null;
  return normalized as Required<Coverage>;
}

function coverageDetails(label: string, value: Coverage | null | undefined): string {
  const normalized = normalizedCoverage(value);
  if (!normalized) return `${label} sources: coverage unavailable`;
  return `${label} sources: ${formatted(normalized.fresh)} fresh, ${formatted(normalized.reused)} reused, ${formatted(normalized.missing)} missing`;
}

export function presentHexiteReserveSummary(
  value: HexiteReserves | null | undefined,
  nowMs = Date.now(),
): HexiteReserveSummaryPresentation {
  if (!value || value.status === "pending") {
    return {
      primary: value?.refreshing ? "Refreshing" : "Awaiting Relay",
      secondary: "Live Empire data is loading",
      status: "Foundry output unavailable",
      sortValue: null,
      tone: "muted",
      details: ["Completed Foundry Capsules are unavailable in the current Relay projection and are excluded."],
    };
  }

  const energy = optionalDecimalValue(value.energy?.total);
  const capsules = optionalDecimalValue(value.capsules?.readyTotal);
  const foundryCapsules = optionalDecimalValue(value.capsules?.foundry);
  if (value.status === "error" || energy == null) {
    const details = [
      "The live Relay treasury amount is unavailable.",
      "Completed Foundry Capsules are unavailable in the current Relay projection and are excluded.",
    ];
    if (Array.isArray(value.errors) && value.errors.length) {
      details.push(`Data limitations: ${value.errors.slice(0, 3).join("; ")}`);
    }
    return {
      primary: "Unavailable",
      secondary: "No usable reserve total",
      status: "Foundry output unavailable",
      sortValue: null,
      tone: "danger",
      details,
    };
  }

  if (capsules == null) {
    const details = [
      `Known Watchtower energy: at least ${formatted(energy)} from the Empire treasury`,
      `Treasury: ${formatted(value.energy?.treasury)} HE`,
      `Player wallets and storage: ${formattedOptional(value.energy?.playerInventories, " HE")}`,
      `Shared claim storage: ${formattedOptional(value.energy?.sharedClaimInventories, " HE")}`,
      `Ready Capsules: ${formattedOptional(value.capsules?.readyTotal)}`,
      coverageDetails("Player", value.coverage?.players),
      coverageDetails("Claim", value.coverage?.claims),
      "Completed Foundry Capsules are unavailable in the current Relay projection and are excluded.",
    ];
    if (Array.isArray(value.errors) && value.errors.length) {
      details.push(`Data limitations: ${value.errors.slice(0, 3).join("; ")}`);
    }
    return {
      primary: `≈ ${formatCompactNumber(energy)} HE known`,
      secondary: "Empire treasury only",
      status: `Inventory joins unavailable · ${ageLabel(value.calculatedAt, nowMs)}`,
      sortValue: energy,
      tone: "warn",
      details,
    };
  }

  const knownTotal = watchtowerTotal(energy, capsules);
  const groups = [normalizedCoverage(value.coverage?.players), normalizedCoverage(value.coverage?.claims)];
  const coverageUnavailable = groups.some((group) => group == null);
  const reused = groups.reduce((sum, group) => sum + number(group?.reused), 0);
  const missing = groups.reduce((sum, group) => sum + number(group?.missing), 0);
  const status = coverageUnavailable || missing > 0
    ? `Inventory coverage incomplete · ${ageLabel(value.calculatedAt, nowMs)}`
    : reused > 0
      ? `Some inventory data reused · ${ageLabel(value.calculatedAt, nowMs)}`
      : `Known inventories included · ${ageLabel(value.calculatedAt, nowMs)}`;
  const tone = coverageUnavailable || missing > 0 || reused > 0 ? "warn" : "muted";
  const cost = value.capsuleEnergyCost == null ? "unavailable" : formatted(value.capsuleEnergyCost);
  const details = [
    `Known Watchtower energy: at least ${formatted(knownTotal)}`,
    `Stored HE: ${formatted(energy)} total`,
    `Treasury: ${formatted(value.energy?.treasury)} HE`,
    `Player wallets and storage: ${formattedOptional(value.energy?.playerInventories, " HE")}`,
    `Shared claim storage: ${formattedOptional(value.energy?.sharedClaimInventories, " HE")}`,
    `Ready Capsule known minimum: ${formatted(capsules)}; ${formattedOptional(value.capsules?.reserveBuildings)} in Hexite Reserve buildings`,
    foundryCapsules == null
      ? "Completed Foundry Capsules are unavailable in the current Relay projection and are excluded."
      : `${formatted(foundryCapsules)} completed in Empire Foundries`,
    `Capsules cost ${cost} HE to craft and provide ${formatted(WATCHTOWER_ENERGY_PER_CAPSULE)} Watchtower energy when deployed.`,
    coverageDetails("Player", value.coverage?.players),
    coverageDetails("Claim", value.coverage?.claims),
  ];
  if (Array.isArray(value.errors) && value.errors.length) {
    details.push(`Data limitations: ${value.errors.slice(0, 3).join("; ")}`);
  }

  return {
    primary: `≈ ${formatCompactNumber(knownTotal)} tower energy`,
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
  const foundryCapsules = optionalNumber(value.capsules?.foundry);
  const watchtowerValue = number(value.capsuleWatchtowerEnergyValue);
  const status = value.status === "complete" ? "Complete" : "Partial";
  const detail = `${status} · ${coveragePercent(value)}% inventory coverage · ${ageLabel(value.calculatedAt, nowMs)}`;
  const tone = value.status === "complete" ? "good" : "warn";

  if (metric === "energy") {
    const treasuryOnly = optionalNumber(value.energy?.playerInventories) == null
      && optionalNumber(value.energy?.sharedClaimInventories) == null;
    return {
      primary: `${formatted(metricTotal)} HE`,
      secondary: treasuryOnly ? "Empire treasury only" : "Loose energy stored",
      detail: treasuryOnly ? `Partial · inventory joins unavailable · ${ageLabel(value.calculatedAt, nowMs)}` : detail,
      sortValue: metricTotal,
      tone,
    };
  }

  if (optionalNumber(value.capsules?.readyTotal) == null) {
    return {
      primary: `≥ ${formatted(metricTotal)} energy`,
      secondary: "Empire treasury only",
      detail: `Partial · inventory joins unavailable · ${ageLabel(value.calculatedAt, nowMs)}`,
      sortValue: metricTotal,
      tone: "warn",
    };
  }

  if (metric === "capsules") {
    return {
      primary: formatted(metricTotal),
      secondary: optionalNumber(value.capsules?.reserveBuildings) == null
        ? `${formatted(foundryCapsules)} completed in Foundries`
        : `${formatted(reserveCapsules)} in Hexite Reserves`,
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
      "The live Relay treasury amount is unavailable.",
      "Completed Foundry Capsules are unavailable in the current Relay projection and are excluded.",
    ].join("\n");
  }

  let lines: string[];
  if (metric === "energy") {
    const inventoryUnavailable = optionalNumber(value.energy?.playerInventories) == null
      && optionalNumber(value.energy?.sharedClaimInventories) == null;
    lines = inventoryUnavailable
      ? [
          `${formatted(value.energy?.total)} HE currently proven from the Empire treasury.`,
          `Treasury: ${formatted(value.energy?.treasury)} HE`,
          "Player wallets and storage: unavailable",
          "Shared claim storage: unavailable",
        ]
      : [
          `${formatted(value.energy?.total)} HE stored across treasury, member, and aligned-claim sources.`,
          `Treasury: ${formatted(value.energy?.treasury)} HE`,
          `Player wallets and storage: ${formatted(value.energy?.playerInventories)} HE`,
          `Shared claim storage: ${formatted(value.energy?.sharedClaimInventories)} HE`,
        ];
  } else if (metric === "capsules") {
    lines = [
      `${formatted(value.capsules?.readyTotal)} ready Capsule known minimum; ${formattedOptional(value.capsules?.reserveBuildings)} in Hexite Reserves.`,
      value.capsules?.foundry == null
        ? "Completed Foundry Capsules are unavailable."
        : `${formatted(value.capsules.foundry)} completed in Empire Foundries.`,
    ];
  } else {
    lines = optionalNumber(value.capsules?.readyTotal) == null
      ? [
          `Watchtower Energy: at least ${formatted(value.estimatedEnergyEquivalent)} from the Empire treasury`,
          `Treasury: ${formatted(value.energy?.treasury)} HE`,
          "Player wallets and storage: unavailable",
          "Shared claim storage: unavailable",
          "Ready Capsules: unavailable",
          `Player sources: ${formatted(value.coverage?.players?.fresh)} fresh, ${formatted(value.coverage?.players?.reused)} reused, ${formatted(value.coverage?.players?.missing)} missing`,
          `Claim sources: ${formatted(value.coverage?.claims?.fresh)} fresh, ${formatted(value.coverage?.claims?.reused)} reused, ${formatted(value.coverage?.claims?.missing)} missing`,
        ]
      : [
          `Watchtower Energy: approximately ${formatted(value.estimatedEnergyEquivalent)} energy`,
          `Loose stored Hexite Energy: ${formatted(value.energy?.total)} HE`,
          `Ready Capsules: ${formatted(value.capsules?.readyTotal)} (${formatted(value.capsules?.reserveBuildings)} in Hexite Reserves)`,
          `Capsules cost ${value.capsuleEnergyCost == null ? "an unavailable amount of" : `${formatted(value.capsuleEnergyCost)}`} HE to craft and provide ${value.capsuleWatchtowerEnergyValue == null ? "an unavailable amount of" : formatted(value.capsuleWatchtowerEnergyValue)} Watchtower energy when deployed.`,
          `Player sources: ${formatted(value.coverage?.players?.fresh)} fresh, ${formatted(value.coverage?.players?.reused)} reused, ${formatted(value.coverage?.players?.missing)} missing`,
          `Claim sources: ${formatted(value.coverage?.claims?.fresh)} fresh, ${formatted(value.coverage?.claims?.reused)} reused, ${formatted(value.coverage?.claims?.missing)} missing`,
        ];
  }

  lines.push(
    value.capsules?.foundry == null
      ? "Completed Foundry Capsules are unavailable in the current Relay projection and are excluded."
      : `${formatted(value.capsules.foundry)} completed in Empire Foundries.`,
  );
  if (Array.isArray(value.errors) && value.errors.length) lines.push(`Data limitations: ${value.errors.slice(0, 3).join("; ")}`);
  return lines.join("\n");
}

export function describeHexiteReserves(value: HexiteReserves | null | undefined): string {
  return describeHexiteReserveMetric(value, "watchtower");
}
