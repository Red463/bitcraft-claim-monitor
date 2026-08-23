import React from "react";
import { ShoppingBag, TrendingUp } from "lucide-react";

import { usePersistedState } from "../../hooks/usePersistedState";
import type { ActiveRegion } from "../../hooks/useActiveRegions";
import { BuyOrderFinder } from "./BuyOrderFinder";
import { MarketDeals } from "./MarketDeals";
import type { MarketRefreshProps } from "./globalMarket";
import { nextTabIndex } from "./marketUi";

type OpportunityMode = "routes" | "demand";

export function MarketOpportunities({
  claimId,
  regionId,
  activeRegions,
  canViewRoutes,
  canViewDemand,
  locationSearch,
  onQueryStateChange,
  ...refresh
}: MarketRefreshProps & {
  claimId: string;
  regionId: string;
  activeRegions: ActiveRegion[];
  canViewRoutes: boolean;
  canViewDemand: boolean;
  locationSearch: string;
  onQueryStateChange: () => void;
}) {
  const [preferredMode, setPreferredMode] = usePersistedState<OpportunityMode>("globalMarket.opportunityMode", "routes");
  const modes = [
    canViewRoutes ? { id: "routes" as const, label: "Arbitrage routes", icon: TrendingUp } : null,
    canViewDemand ? { id: "demand" as const, label: "High-value demand", icon: ShoppingBag } : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry != null);
  const activeMode = modes.some((entry) => entry.id === preferredMode) ? preferredMode : modes[0]?.id;

  React.useEffect(() => {
    if (activeMode && activeMode !== preferredMode) setPreferredMode(activeMode);
  }, [activeMode, preferredMode, setPreferredMode]);

  function onTabsKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (!buttons.length || current < 0) return;
    event.preventDefault();
    const next = nextTabIndex(current, buttons.length, event.key);
    buttons[next]?.focus();
    buttons[next]?.click();
  }

  if (!activeMode) return null;

  return (
    <section className="global-market-workspace market-opportunities" id="market-panel-opportunities" role="tabpanel" aria-labelledby="market-tab-opportunities">
      {modes.length > 1 ? <div className="market-subnav" role="tablist" aria-label="Opportunity types" onKeyDown={onTabsKeyDown}>
        {modes.map((entry) => {
          const Icon = entry.icon;
          return <button id={`opportunity-tab-${entry.id}`} role="tab" aria-selected={activeMode === entry.id} aria-controls={`opportunity-panel-${entry.id}`} tabIndex={activeMode === entry.id ? 0 : -1} className={activeMode === entry.id ? "active" : ""} key={entry.id} onClick={() => setPreferredMode(entry.id)}><Icon size={15} />{entry.label}</button>;
        })}
      </div> : null}
      <div id={`opportunity-panel-${activeMode}`} role="tabpanel" aria-labelledby={modes.length > 1 ? `opportunity-tab-${activeMode}` : undefined} aria-label={modes.length === 1 ? modes[0]?.label : undefined}>
        {activeMode === "routes" ? <MarketDeals {...refresh} claimId={claimId} sharedRegionId={regionId} activeRegions={activeRegions} /> : null}
        {activeMode === "demand" ? <BuyOrderFinder {...refresh} claimId={claimId} regionId={regionId} locationSearch={locationSearch} onQueryStateChange={onQueryStateChange} /> : null}
      </div>
    </section>
  );
}
