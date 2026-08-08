import type { AnyRecord } from "../main-app-data.ts";
import { memberPresenceStatus } from "./memberPresence.ts";

function compareText(left: unknown, right: unknown): number {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function presenceDetails(member: AnyRecord) {
  const player = member.player ?? {};
  const status = memberPresenceStatus({
    ...member,
    ...player,
    lastActiveTimestamps: [player.lastActiveTimestamp, member.lastActiveTimestamp],
    lastLoginTimestamp: player.lastLoginTimestamp ?? member.lastLoginTimestamp,
  });
  return {
    player,
    signedIn: member.player?.signedIn,
    lastSeenMs: status.timestamp ? Date.parse(status.timestamp) : 0,
  };
}

/** Default operational roster order before an operator chooses a table sort. */
export function compareMembersByDefault(left: AnyRecord, right: AnyRecord): number {
  const leftPresence = presenceDetails(left);
  const rightPresence = presenceDetails(right);
  const group = (presence: ReturnType<typeof presenceDetails>) => (
    presence.signedIn === true ? 0 : presence.signedIn === false ? 1 : 2
  );
  const groupDifference = group(leftPresence) - group(rightPresence);
  if (groupDifference) return groupDifference;
  if (group(leftPresence) === 0) {
    const sessionDifference = Number(rightPresence.player.sessionSeconds ?? 0) - Number(leftPresence.player.sessionSeconds ?? 0);
    if (sessionDifference) return sessionDifference;
  } else if (group(leftPresence) === 1) {
    const lastSeenDifference = rightPresence.lastSeenMs - leftPresence.lastSeenMs;
    if (lastSeenDifference) return lastSeenDifference;
  }
  return compareText(left.username, right.username)
    || compareText(left.playerEntityId ?? left.entityId, right.playerEntityId ?? right.entityId);
}

export function orderMembersByDefault(members: AnyRecord[]): AnyRecord[] {
  return [...members].sort(compareMembersByDefault);
}
