import { Crown } from "lucide-react";

import type { AnyRecord } from "../../main-app-data";
import { toNumber } from "../../main-app-data";
import { isTrackedOwnerName } from "../../utils/ownership";

export function TierBadge({ tier }: { tier: unknown }) {
  const value = toNumber(tier);
  if (value < 1 || value > 10) return <span>-</span>;
  return <span className={`tier-badge tier-${value}`}>T{value}</span>;
}

function getRarityClass(rarity: unknown): string {
  switch (String(rarity ?? "").toLowerCase()) {
    case "legendary":
      return "legendary";
    case "epic":
      return "epic";
    case "rare":
      return "rare";
    case "uncommon":
      return "uncommon";
    default:
      return "";
  }
}

export function RarityBadge({ rarity }: { rarity: unknown }) {
  if (!rarity) return null;
  return <span className={`rarity-badge ${getRarityClass(rarity)}`}>{String(rarity)}</span>;
}

export function TrackedOwnerName({ name, claim }: { name: unknown; claim: AnyRecord }) {
  const label = String(name ?? "").trim();
  if (!label || label === "-") return <span className="muted-line">Unknown</span>;
  const isOwner = isTrackedOwnerName(label, claim);
  return (
    <span className={isOwner ? "tracked-owner-name" : undefined}>
      {label}
      {isOwner ? <Crown size={13} aria-label="Tracked settlement owner" /> : null}
    </span>
  );
}
