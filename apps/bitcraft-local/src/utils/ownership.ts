import type { AnyRecord } from "../main-app-data";

export function getOwnerName(row: AnyRecord): string {
  return String(row.ownerPlayerUsername ?? row.ownerUsername ?? row.ownerName ?? row.owner ?? row.empireName ?? "-");
}

export function getTrackedOwnerName(claim: AnyRecord): string {
  return String(claim.ownerPlayerUsername ?? claim.ownerUsername ?? claim.ownerName ?? claim.owner ?? "").trim();
}

export function isTrackedOwnerName(name: unknown, claim: AnyRecord): boolean {
  const label = String(name ?? "").trim();
  const owner = getTrackedOwnerName(claim);
  return Boolean(label && owner && label.toLowerCase() === owner.toLowerCase());
}
