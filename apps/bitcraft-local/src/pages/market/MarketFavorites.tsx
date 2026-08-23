import React from "react";
import { Star } from "lucide-react";

import { ItemLabel } from "../../components/main/ItemDisplay";
import { useGameDataGeneration } from "../../hooks/useGameDataGeneration";
import type { AnyRecord } from "../../main-app-data";
import { formatGoldAmount, formatNumber } from "../../utils/format";
import type { MarketItemKey, MarketRefreshProps } from "./globalMarket";
import { exactMarketInteger } from "./marketUi";

function itemShape(row: AnyRecord) {
  return {
    ...row,
    id: String(row.itemId ?? row.id ?? "0"),
    name: row.itemName ?? row.name,
    itemType: row.itemType === "cargo" ? 1 : row.itemType,
  };
}

function bestPrice(rows: AnyRecord[], direction: "low" | "high"): string | null {
  return rows.reduce<string | null>((best, row) => {
    const price = String(row.price ?? row.priceThreshold ?? row.unitPrice ?? "0");
    if (best == null) return price;
    if (direction === "low") return exactMarketInteger(price) < exactMarketInteger(best) ? price : best;
    return exactMarketInteger(price) > exactMarketInteger(best) ? price : best;
  }, null);
}

export function MarketFavorites({
  claimId,
  regionId,
  favorites,
  onOpenItem,
  title = "Saved items",
  refreshSequence,
  refreshHeaders,
  trackRefresh,
}: MarketRefreshProps & {
  claimId: string;
  regionId: string;
  favorites: MarketItemKey[];
  onOpenItem: (item: AnyRecord) => void;
  title?: string;
}) {
  const [rows, setRows] = React.useState<AnyRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const generationSequence = useGameDataGeneration(claimId, ["catalogs", "regional-market"]);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    trackRefresh("global-market-favorites", Promise.all(favorites.slice(0, 20).map(async (favorite) => {
      const search = new URLSearchParams({
        claimId,
        regionId: regionId || "all",
        itemType: favorite.itemType,
        itemId: favorite.itemId,
      });
      const response = await fetch(`/api/local/market/order-book?${search}`, {
        headers: refreshHeaders,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`favorite order book HTTP ${response.status}`);
      const detail = await response.json();
      const sells = Array.isArray(detail.sellOrders) ? detail.sellOrders : [];
      const buys = Array.isArray(detail.buyOrders) ? detail.buyOrders : [];
      return {
        ...favorite,
        ...(detail.item ?? {}),
        itemName: detail.item?.name ?? `Item ${favorite.itemId}`,
        bestSell: bestPrice(sells, "low"),
        bestBuy: bestPrice(buys, "high"),
        currentQuantity: [...sells, ...buys]
          .reduce((total, order) => total + exactMarketInteger(order.quantity), 0n)
          .toString(),
      };
    })))
      .then((nextRows) => {
        if (!controller.signal.aborted) {
          setRows(nextRows);
          setLoading(false);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      });
    return () => controller.abort();
  }, [claimId, favorites, generationSequence, refreshSequence, regionId]);

  return (
    <section className="market-overview-section market-favorites-section">
      <h3><Star size={16} /> {title} <small>Stored only in this browser</small></h3>
      {error ? <div className="error">Saved item prices unavailable: {error}. Last-good prices remain visible.</div> : null}
      {loading && !rows.length ? <div className="market-loading-strip">Loading saved item prices…</div> : null}
      {rows.length ? <div className="market-favorite-strip">{rows.map((row) => {
        const spread = row.bestSell != null && row.bestBuy != null
          ? (exactMarketInteger(row.bestSell) - exactMarketInteger(row.bestBuy)).toString()
          : null;
        return <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>Sell <b>{row.bestSell == null ? "—" : formatGoldAmount(row.bestSell)}</b></span><span>Buy <b>{row.bestBuy == null ? "—" : formatGoldAmount(row.bestBuy)}</b></span><span>Spread <b>{spread == null ? "—" : formatGoldAmount(spread)}</b></span><small>{formatNumber(row.currentQuantity)} units in current orders</small></button>;
      })}</div> : !loading && !error ? <div className="empty-state compact"><Star size={22} /><span>Save items in Browse to track live prices here, then configure deal alerts from Saved.</span></div> : null}
    </section>
  );
}
