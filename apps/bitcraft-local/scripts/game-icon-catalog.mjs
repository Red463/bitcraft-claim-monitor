import { gameIconUrl } from "../src/utils/gameAssets.mjs";

function catalogKey(row) {
  const kind = String(row?.kind ?? "").trim();
  const id = String(row?.id ?? "").trim();
  return kind && /^\d+$/.test(id) ? `${kind}:${BigInt(id).toString()}` : null;
}

export function collectGameIconEntries(snapshot) {
  const rows = [
    ...(Array.isArray(snapshot?.entities) ? snapshot.entities : []),
    ...(Array.isArray(snapshot?.descriptions?.resource) ? snapshot.descriptions.resource : []),
    ...(Array.isArray(snapshot?.descriptions?.enemy) ? snapshot.descriptions.enemy : []),
  ];
  const identitiesByIconUrl = new Map();
  for (const row of rows) {
    const browserPath = gameIconUrl(row);
    const key = catalogKey(row);
    if (!browserPath || !key) continue;
    const keys = identitiesByIconUrl.get(browserPath) ?? new Set();
    keys.add(key);
    identitiesByIconUrl.set(browserPath, keys);
  }
  return [...identitiesByIconUrl.entries()]
    .map(([browserPath, keys]) => [browserPath, [...keys].sort()])
    .sort(([left], [right]) => left.localeCompare(right));
}
