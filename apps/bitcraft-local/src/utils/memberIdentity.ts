import { unique } from "./array.ts";
import type { AnyRecord } from "../main-app-data.ts";

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
  return String(member?.userName ?? member?.username ?? member?.playerUsername ?? member?.name ?? "").trim();
}

export function memberTrackingKeys(member: AnyRecord | null | undefined): string[] {
  const id = memberTrackingId(member);
  const name = memberDisplayName(member);
  return unique([id, name].filter(Boolean).map((value) => value.toLowerCase()));
}
