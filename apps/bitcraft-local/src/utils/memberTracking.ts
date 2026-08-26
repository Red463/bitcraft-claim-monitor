import type { AnyRecord } from "../main-app-data";
import { unique } from "./array";
import { normalizeData } from "./normalize";

// "Excluded members" are configured by admins for people who technically belong
// to the claim but should not be shown in settlement operations. Matching uses
// both stable ids and names because historic payloads are not completely
// consistent about which identifier is present in every domain.
export function memberTrackingId(member: AnyRecord | null | undefined): string {
  return String(
    member?.playerEntityId
      ?? member?.player_entity_id
      ?? member?.playerId
      ?? member?.player_id
      ?? member?.entityId
      ?? member?.entity_id
      ?? member?.id
      ?? "",
  ).trim();
}

export function memberDisplayName(member: AnyRecord | null | undefined): string {
  return String((member?.userName ?? member?.username ?? member?.playerUsername ?? member?.name ?? memberTrackingId(member)) || "Unknown member");
}

export function memberTrackingKeys(member: AnyRecord | null | undefined): string[] {
  const id = memberTrackingId(member);
  const name = memberDisplayName(member).trim();
  return unique([id, name].filter(Boolean).map((value) => value.toLowerCase()));
}

export function filterTrackedMemberRows<T extends AnyRecord>(rows: T[], excludedKeys: Set<string>): T[] {
  if (!excludedKeys.size) return rows;
  return rows.filter((row) => !memberTrackingKeys(row).some((key) => excludedKeys.has(key)));
}

export function applyMemberTrackingFilter<T extends ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }>(data: T, excludedMemberIds: string[]): T {
  const excludedKeys = new Set(excludedMemberIds.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean));
  for (const member of data.members) {
    const id = memberTrackingId(member);
    if (id && excludedKeys.has(id.toLowerCase())) {
      for (const key of memberTrackingKeys(member)) excludedKeys.add(key);
    }
  }
  if (!excludedKeys.size) return data;
  return {
    ...data,
    members: filterTrackedMemberRows(data.members, excludedKeys),
    citizens: filterTrackedMemberRows(data.citizens, excludedKeys),
    players: filterTrackedMemberRows(data.players, excludedKeys),
  };
}
