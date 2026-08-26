type DepositRow = {
  status?: unknown;
  respawnAt?: unknown;
};

export type DepositStatusPresentation = {
  label: "Active" | "Respawning" | "Respawn overdue" | "Unknown";
  tone: "good" | "warn" | "muted";
  harvestable: boolean;
};

export function presentDepositStatus(
  row: DepositRow,
  nowMs = Date.now(),
): DepositStatusPresentation {
  if (row.status === "active") {
    return { label: "Active", tone: "good", harvestable: true };
  }
  if (row.status === "respawning") {
    const respawnMs = Date.parse(String(row.respawnAt ?? ""));
    if (Number.isFinite(respawnMs) && respawnMs <= nowMs) {
      return { label: "Respawn overdue", tone: "warn", harvestable: false };
    }
    return { label: "Respawning", tone: "warn", harvestable: false };
  }
  return { label: "Unknown", tone: "muted", harvestable: false };
}

export function summarizeDeposits(rows: DepositRow[], nowMs = Date.now()) {
  let active = 0;
  let respawning = 0;
  let unknown = 0;
  let nextRespawnAt: string | null = null;
  let nextRespawnMs = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    if (row.status === "active") active += 1;
    else if (row.status === "respawning") respawning += 1;
    else unknown += 1;

    if (row.status !== "respawning") continue;
    const value = String(row.respawnAt ?? "");
    const respawnMs = Date.parse(value);
    if (Number.isFinite(respawnMs) && respawnMs > nowMs && respawnMs < nextRespawnMs) {
      nextRespawnAt = new Date(respawnMs).toISOString();
      nextRespawnMs = respawnMs;
    }
  }

  return {
    total: rows.length,
    active,
    respawning,
    unknown,
    nextRespawnAt,
  };
}
