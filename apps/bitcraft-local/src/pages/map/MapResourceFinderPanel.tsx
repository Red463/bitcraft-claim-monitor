import { X } from "lucide-react";

import { TierBadge } from "../../components/main/Badges";
import { ItemIcon } from "../../components/main/ItemDisplay";
import { SearchBox } from "../../components/main/SearchBox";
import type { AnyRecord } from "../../main-app-data";
import { mapResourceCategory, mapResourceToken } from "./mapUtils";

type RegionOption = { id: string; label: string };

export function MapResourceFinderPanel({
  search,
  tier,
  category,
  regionValue,
  regionOptions,
  tiers,
  categories,
  selectedTokens,
  resourceByToken,
  resources,
  visibleCount,
  catalogCount,
  catalogLoaded,
  error,
  notice,
  onSearchChange,
  onTierChange,
  onCategoryChange,
  onRegionChange,
  onToggle,
  onRemove,
  onClear,
  onShowMore,
}: {
  search: string;
  tier: string;
  category: string;
  regionValue: string;
  regionOptions: RegionOption[];
  tiers: string[];
  categories: string[];
  selectedTokens: string[];
  resourceByToken: ReadonlyMap<string, AnyRecord>;
  resources: AnyRecord[];
  visibleCount: number;
  catalogCount: number;
  catalogLoaded: boolean;
  error: string;
  notice: string;
  onSearchChange: (value: string) => void;
  onTierChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onToggle: (token: string) => void;
  onRemove: (token: string) => void;
  onClear: () => void;
  onShowMore: () => void;
}) {
  return (
    <section className="map-resource-finder" aria-label="Resource finder">
      <div className="map-resource-finder-search">
        <SearchBox label="Find map resources" value={search} onChange={onSearchChange} placeholder="Search resources and creatures" />
      </div>
      <div className="map-resource-filters">
        <label className="field"><span>Region</span><select className="select-control map-region-select" value={regionValue} onChange={(event) => onRegionChange(event.target.value)}><option value="All">All regions</option>{regionOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label className="field"><span>Tier</span><select className="select-control" value={tier} onChange={(event) => onTierChange(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="field"><span>Category</span><select className="select-control" value={category} onChange={(event) => onCategoryChange(event.target.value)}><option>All</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      {selectedTokens.length ? (
        <div className="map-selected-resources" aria-label="Tracked resources">
          <div className="map-selected-resources-heading"><strong>{selectedTokens.length} tracked</strong><button type="button" className="mini-action" onClick={onClear}>Clear</button></div>
          <div className="map-selected-resource-chips">
            {selectedTokens.map((token) => {
              const resource = resourceByToken.get(token);
              const label = String(resource?.name ?? token);
              return <button type="button" key={token} onClick={() => onRemove(token)} aria-label={`Stop tracking ${label}`}>{label}<X size={12} aria-hidden="true" /></button>;
            })}
          </div>
        </div>
      ) : null}
      {error ? <div className="error">Resources unavailable: {error}</div> : null}
      {notice ? <p className="legend">{notice}</p> : null}
      <div className="map-resource-list">
        {resources.map((resource) => {
          const token = mapResourceToken(resource);
          const active = selectedTokens.includes(token);
          const resourceIcon = {
            itemType: resource.itemType,
            itemId: resource.itemId,
            iconAssetName: resource.iconAssetName,
            name: resource.name,
          };
          return <button type="button" key={token} className={active ? "active" : ""} aria-pressed={active} onClick={() => onToggle(token)}>
            <span className="map-resource-icon"><ItemIcon item={resourceIcon} /></span>
            <span className="map-resource-copy"><strong title={String(resource.name ?? "")}>{resource.name}</strong><small>{resource.mapKind === "enemy" ? "Animal" : mapResourceCategory(resource) || resource.tag || "Resource"}</small></span>
            {resource.tier != null ? <TierBadge tier={resource.tier} /> : null}
          </button>;
        })}
        {!visibleCount ? <p className="legend">{catalogCount ? "No resources match these filters." : catalogLoaded ? "No map resources are available from Relay." : "Loading live Relay resources..."}</p> : null}
      </div>
      {visibleCount ? <div className="map-resource-list-footer">
        <span aria-live="polite">Showing {resources.length} of {visibleCount}</span>
        {resources.length < visibleCount ? <button type="button" className="toolbar-button" onClick={onShowMore}>Show more</button> : null}
      </div> : null}
    </section>
  );
}
