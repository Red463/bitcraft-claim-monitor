import React from "react";
import { Star } from "lucide-react";

import { ItemLabel } from "../../components/main/ItemDisplay";
import { useGameDataGeneration } from "../../hooks/useGameDataGeneration";
import type { AnyRecord } from "../../main-app-data";
import { formatGoldAmount, formatNumber } from "../../utils/format";
import { marketFavoriteQuoteRows, marketFavoriteQuotesRequest, type MarketItemKey, type MarketRefreshProps } from "./globalMarket";
import { exactMarketInteger, marketPriceClass } from "./marketUi";

function itemShape(row: AnyRecord) {
  return {
    ...row,
    id: String(row.itemId ?? row.id ?? "0"),
    name: row.itemName ?? row.name,
    itemType: row.itemType === "cargo" ? 1 : row.itemType,
  };
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
    const selectedFavorites = favorites.slice(0, 20);
    const request = marketFavoriteQuotesRequest(regionId || "all", selectedFavorites);
    trackRefresh("global-market-favorites", fetch(request.url, {
      method: "POST",
      headers: {
        ...refreshHeaders,
        "content-type": "application/json",
      },
      body: request.body,
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) throw new Error(`favorite quotes HTTP ${response.status}`);
      return response.json();
    }))
      .then((payload) => {
        if (!controller.signal.aborted) {
          setRows(marketFavoriteQuoteRows(selectedFavorites, payload));
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
        return <button key={`${row.itemType}:${row.itemId}`} onClick={() => onOpenItem(itemShape(row))}><ItemLabel item={itemShape(row)} /><span>Lowest sell <b className={marketPriceClass(row.bestSell == null ? "neutral" : "ask")}>{row.bestSell == null ? "—" : formatGoldAmount(row.bestSell)}</b></span><span>Highest buy <b className={marketPriceClass(row.bestBuy == null ? "neutral" : "bid")}>{row.bestBuy == null ? "—" : formatGoldAmount(row.bestBuy)}</b></span><span>Spread <b className={marketPriceClass("profit", spread)}>{spread == null ? "—" : formatGoldAmount(spread)}</b></span><small>{formatNumber(row.currentOrderCount)} current orders</small></button>;
      })}</div> : !loading && !error ? <div className="empty-state compact"><Star size={22} /><span>Save items in Browse to track live prices here, then configure deal alerts from Saved.</span></div> : null}
    </section>
  );
}
