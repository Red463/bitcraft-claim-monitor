import React from "react";
import type { AnyRecord } from "../../main-app-data";
import type { MarketItemKey, MarketRefreshProps } from "./globalMarket";
import { DealWatchlist } from "./DealWatchlist";
import { MarketFavorites } from "./MarketFavorites";

export function MarketSaved({
  claimId,
  monitoredRegionId,
  favorites,
  canViewFavorites,
  canViewWatches,
  initialWatchItem,
  onWatchItemConsumed,
  onOpenItem,
  onDiscordLogin,
  ...refresh
}: MarketRefreshProps & {
  claimId: string;
  monitoredRegionId: string;
  favorites: MarketItemKey[];
  canViewFavorites: boolean;
  canViewWatches: boolean;
  initialWatchItem: AnyRecord | null;
  onWatchItemConsumed: () => void;
  onOpenItem: (item: AnyRecord) => void;
  onDiscordLogin: (returnTo?: string) => void;
}) {
  return (
    <section className="global-market-workspace market-saved" id="market-panel-saved" role="tabpanel" aria-labelledby="market-tab-saved">
      {canViewFavorites ? <MarketFavorites {...refresh} claimId={claimId} regionId={monitoredRegionId} favorites={favorites} onOpenItem={onOpenItem} /> : null}
      {canViewWatches ? <DealWatchlist {...refresh} claimId={claimId} monitoredRegionId={monitoredRegionId} initialItem={initialWatchItem} onInitialItemConsumed={onWatchItemConsumed} onDiscordLogin={onDiscordLogin} /> : null}
    </section>
  );
}
