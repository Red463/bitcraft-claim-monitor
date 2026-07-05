import type { AnyRecord } from "../main-app-data";

export function getOwnerName(row: AnyRecord): string {
  return String(row.ownerPlayerUsername ?? row.ownerUsername ?? row.ownerName ?? row.owner ?? row.empireName ?? "-");
}

export function getTrackedOwnerName(claim: AnyRecord): string {
  return String(claim.ownerPlayerUsername ?? claim.ownerUsername ?? claim.ownerName ?? claim.owner ?? "").trim();
}

function memberDisplayName(member: AnyRecord): string {
  return String(member.userName ?? member.username ?? member.ownerUsername ?? member.ownerName ?? member.name ?? "").trim();
}

function sameName(left: unknown, right: unknown): boolean {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function isTrackedOwnerName(name: unknown, claim: AnyRecord): boolean {
  return sameName(name, getTrackedOwnerName(claim));
}

export function isTrackedCoOwnerName(name: unknown, claim: AnyRecord, members: AnyRecord[] = []): boolean {
  if (isTrackedOwnerName(name, claim)) return false;
  const roster = members.length ? members : Array.isArray(claim.members) ? claim.members : [];
  return roster.some((member) => sameName(name, memberDisplayName(member)) && Boolean(member.coOwnerPermission));
}

export function memberClaimRole(member: AnyRecord, claim: AnyRecord): "Owner" | "Co-owner" | "Officer" | "Member" {
  if (isTrackedOwnerName(memberDisplayName(member), claim)) return "Owner";
  if (member.coOwnerPermission) return "Co-owner";
  if (member.officerPermission) return "Officer";
  return "Member";
}

