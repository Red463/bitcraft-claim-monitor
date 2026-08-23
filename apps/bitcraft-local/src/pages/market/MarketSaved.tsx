import React from "react";
import { Star } from "lucide-react";

import type { MarketItemKey, MarketRefreshProps } from "./globalMarket";
import { DealWatchlist } from "./DealWatchlist";

export function MarketSaved({
  claimId,
  monitoredRegionId,
  favorites,
  canViewFavorites,
  canViewWatches,
  onDiscordLogin,
  ...refresh
}: MarketRefreshProps & {
  claimId: string;
  monitoredRegionId: string;
  favorites: MarketItemKey[];
  canViewFavorites: boolean;
  canViewWatches: boolean;
  onDiscordLogin: (returnTo?: string) => void;
}) {
  return (
    <section className="global-market-workspace market-saved" id="market-panel-saved" role="tabpanel" aria-labelledby="market-tab-saved">
      {canViewFavorites ? <section className="market-overview-section market-saved-intro"><h3><Star size={16} /> Saved items <small>{favorites.length} browser-local</small></h3><p className="legend">Favorite items are stored in this browser. Their live prices and alert controls are collected here.</p></section> : null}
      {canViewWatches ? <DealWatchlist {...refresh} claimId={claimId} monitoredRegionId={monitoredRegionId} onDiscordLogin={onDiscordLogin} /> : null}
    </section>
  );
}
