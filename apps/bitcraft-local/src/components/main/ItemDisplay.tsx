import React from "react";

import { toNumber, type AnyRecord } from "../../main-app-data";
import { gameIconUrl } from "../../utils/items";

export function ItemIcon({ item }: { item: AnyRecord }) {
  const url = gameIconUrl(item);
  const [failed, setFailed] = React.useState(false);
  const fallback = String(item.name ?? "?").trim().slice(0, 2).toUpperCase();

  React.useEffect(() => setFailed(false), [url]);

  return (
    <span className="item-thumb" aria-hidden="true">
      {url && !failed ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span>{fallback}</span>}
    </span>
  );
}

export function ItemLabel({ item, name, meta }: { item: AnyRecord; name?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <span className="item-label">
      <ItemIcon item={item} />
      <span>
        <strong>{name ?? item.name ?? item.itemName ?? "Unknown"}</strong>
        {meta ? <small className="muted-line">{meta}</small> : null}
      </span>
    </span>
  );
}

export function TierMaterialIcon({ item, tier }: { item: AnyRecord; tier: unknown }) {
  const value = toNumber(tier);
  if (value < 1 || value > 10) return <b>Other</b>;
  return (
    <span className={`tier-framed tier-${value}`} title={`Tier ${value}`}>
      <ItemIcon item={item} />
      <b>T{value}</b>
    </span>
  );
}
