import type { AnyRecord } from "../../main-app-data";

export function activeSiegeParticipants(tower: AnyRecord): AnyRecord[] {
  const rows = Array.isArray(tower.activeSiegeParticipants)
    ? tower.activeSiegeParticipants
    : Array.isArray(tower.siege)
      ? tower.siege
      : [];
  return rows.filter((entry) => entry?.active === true);
}

export function groupSiegeParticipants(tower: AnyRecord) {
  const participants = activeSiegeParticipants(tower);
  const starts = participants
    .map((entry) => {
      const raw = entry.startTimestamp ?? entry.startedAt ?? null;
      return { raw, time: Date.parse(String(raw ?? "")) };
    })
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);
  return {
    attackers: participants.filter((entry) => entry.attacker === true),
    defenders: participants.filter((entry) => entry.attacker !== true),
    startedAt: starts[0]?.raw ?? null,
  };
}

export function siegeDurationLabel(startedAt: unknown, now = Date.now()): string {
  const started = Date.parse(String(startedAt ?? ""));
  if (!Number.isFinite(started) || started > now) return "Unavailable";
  const totalMinutes = Math.floor((now - started) / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return [
    days ? `${days}d` : "",
    hours || days ? `${hours}h` : "",
    `${minutes}m`,
  ].filter(Boolean).join(" ");
}
