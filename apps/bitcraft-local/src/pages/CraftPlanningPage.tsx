import React from "react";
import { AlertTriangle, ClipboardList, Factory, LoaderCircle, Package, Route, Search, Target, X } from "lucide-react";
import { createPortal } from "react-dom";

import { TierBadge } from "../components/main/Badges";
import { ItemIcon } from "../components/main/ItemDisplay";
import { usePersistedState } from "../hooks/usePersistedState";
import type { AnyRecord } from "../main-app-data";
import { formatNumber } from "../utils/format";
import { CraftPlanManagerDialog } from "./CraftPlanManagerDialog";
import { applyPersonalFishingView, normalizeFishingRoutePreference, type FishingRoutePreference } from "./craftPlanningFishingView";
import { buildNeedsBoard, filterNeedsBoard, itemKey, itemName, NEED_COLUMNS, NEED_SECTIONS, needsBoardCompletion, type NeedCell, type NeedRow } from "./craftPlanningNeedsBoard";
import { groupNeedCellActiveCrafts, groupNeedCellRecipeUsages, groupNeedCellSources, groupNeedCellSourceRoutes } from "./craftPlanningNeedDetails";

const LOCAL_API = "/api/local";

function itemNode(item: AnyRecord) {
  return (
    <span className="craft-plan-item-label">
      <ItemIcon item={item} />
      <span><strong>{itemName(item)}</strong>{item.tier ? <TierBadge tier={item.tier} /> : null}</span>
    </span>
  );
}

function quantity(value: unknown) {
  return formatNumber(Number(value) || 0, 0);
}

function completionTone(value: number) {
  if (value >= 100) return "is-complete";
  if (value >= 75) return "is-high";
  if (value >= 50) return "is-mid";
  if (value >= 25) return "is-low";
  return "is-critical";
}

function needCellNode(cell: NeedCell | undefined, onSelect: (cell: NeedCell) => void) {
  if (!cell) return <span className="craft-plan-need-empty">-</span>;
  const satisfied = cell.missing <= 0;
  const hasActive = cell.inProgress > 0;
  const supplied = cell.available + cell.inProgress + cell.plannedOutput;
  const blocked = !satisfied && cell.items.some((item) => Array.isArray(item.sourceRoutes) && item.sourceRoutes.length > 0) && supplied <= 0;
  return (
    <button className={`craft-plan-need-cell${satisfied ? " is-satisfied" : " is-shortage"}${hasActive ? " has-active" : ""}${blocked ? " is-blocked" : ""}`} type="button" title={`${cell.name}: ${quantity(cell.missing)} needed, ${quantity(cell.available)} in stock, ${quantity(cell.inProgress)} active, ${quantity(cell.plannedOutput)} from planned secondary outputs, ${quantity(cell.required)} required`} onClick={() => onSelect(cell)}>
      <strong>{quantity(satisfied ? supplied : cell.missing)}</strong>
      <small>{quantity(supplied)} / {quantity(cell.required)}</small>
      {hasActive ? <Factory size={11} aria-label="Actively being crafted" /> : null}
    </button>
  );
}


function recipeOptionLabel(recipe: AnyRecord, output?: AnyRecord) {
  const inputs = Array.isArray(recipe.inputs) ? recipe.inputs.map(itemName).filter(Boolean) : [];
  const label = String(recipe.label ?? recipe.name ?? recipe.id ?? "Recipe");
  const station = String(recipe.buildingName ?? "").trim();
  if (inputs.length && output) return `${inputs.join(" + ")} -> ${itemName(output)}${station ? ` - ${station}` : ""}`;
  return `${label}${station ? ` - ${station}` : ""}`;
}

function summaryStat(icon: React.ReactNode, label: string, value: unknown, detail: string, tone?: string) {
  return (
    <article className={`craft-plan-summary-stat${tone ? ` ${tone}` : ""}`}>
      <span className="metric-icon">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{quantity(value)}</strong>
        <em>{detail}</em>
      </span>
    </article>
  );
}

export function CraftPlanningPage({ claimId, refreshToken }: { claimId: string; refreshToken: number }) {
  const [plan, setPlan] = React.useState<AnyRecord | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [adminAuth, setAdminAuth] = React.useState<AnyRecord | null>(null);
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [managerRefreshToken, setManagerRefreshToken] = React.useState(0);
  const [selectedSections, setSelectedSections] = React.useState<string[]>([]);
  const [shortagesOnly, setShortagesOnly] = React.useState(false);
  const [needsSearch, setNeedsSearch] = React.useState("");
  const [fishingRoute, setFishingRoute] = usePersistedState<FishingRoutePreference>("planning.fishingRoute", "ocean");
  const [selectedNeed, setSelectedNeed] = React.useState<NeedCell | null>(null);
  const [routeStatus, setRouteStatus] = React.useState<string | null>(null);
  const [routeError, setRouteError] = React.useState<string | null>(null);
  const [bufferPercent, setBufferPercent] = React.useState("0");
  const [selectedSectionOverride, setSelectedSectionOverride] = React.useState<{ row: NeedRow; section: string; name: string } | null>(null);

  React.useEffect(() => {
    fetch(`${LOCAL_API}/admin/me`)
      .then((response) => response.ok ? response.json() : { authenticated: false })
      .then(setAdminAuth)
      .catch(() => setAdminAuth({ authenticated: false }));
  }, []);

  React.useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${LOCAL_API}/craft-plan?claimId=${encodeURIComponent(claimId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        if (!stale) setPlan(body);
      })
      .catch((err) => {
        if (!stale && err.name !== "AbortError") setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [claimId, refreshToken, managerRefreshToken]);

  const config = plan?.config ?? {};
  const totals = plan?.totals ?? {};
  const targets = Array.isArray(plan?.targets) ? plan.targets : [];
  const materials = Array.isArray(plan?.materials) ? plan.materials : [];
  const warnings = Array.isArray(plan?.warnings) ? plan.warnings : [];
  const unavailableSources = Array.isArray(plan?.unavailableSources) ? plan.unavailableSources : [];
  const needsBoard = React.useMemo(() => buildNeedsBoard(materials, targets), [materials, targets]);
  const normalizedFishingRoute = normalizeFishingRoutePreference(fishingRoute);
  const personalBoard = React.useMemo(
    () => applyPersonalFishingView(needsBoard, plan?.personalViews?.fishing, normalizedFishingRoute),
    [needsBoard, plan?.personalViews?.fishing, normalizedFishingRoute],
  );
  const needsBoardRowCount = React.useMemo(() => personalBoard.board.reduce((total, group) => total + group.rows.length, 0), [personalBoard.board]);
  const needsBoardSections = React.useMemo(() => personalBoard.board.map((group) => group.section), [personalBoard.board]);
  const overallCompletion = React.useMemo(() => needsBoardCompletion(personalBoard.board), [personalBoard.board]);
  const filteredNeedsBoard = React.useMemo(
    () => filterNeedsBoard(personalBoard.board, selectedSections, shortagesOnly, needsSearch),
    [personalBoard.board, selectedSections, shortagesOnly, needsSearch],
  );
  const canManage = Boolean(adminAuth?.authenticated && adminAuth?.csrfToken);
  const currentSectionOverrides = config.sectionOverrides ?? {};
  const currentRowNameOverrides = config.rowNameOverrides ?? {};
  const planSteps = Array.isArray(plan?.steps) ? plan.steps : [];
  const selectedNeedSources = selectedNeed ? groupNeedCellSources(selectedNeed) : [];
  const selectedNeedCrafts = selectedNeed ? groupNeedCellActiveCrafts(selectedNeed) : [];
  const selectedNeedSourceRoutes = selectedNeed ? groupNeedCellSourceRoutes(selectedNeed, planSteps) : [];
  const selectedNeedUsages = selectedNeed ? groupNeedCellRecipeUsages(selectedNeed) : [];
  const selectedNeedKey = selectedNeed?.items?.[0]?.key ?? (selectedNeed ? itemKey(selectedNeed.item) : "");
  const selectedMultiplier = Number(config.multipliers?.[selectedNeedKey]?.multiplier) || 1;
  React.useEffect(() => {
    setBufferPercent(String(Math.max(0, Math.round((selectedMultiplier - 1) * 1000) / 10)));
  }, [selectedNeedKey, selectedMultiplier]);
  const sectionOverrideDialog = selectedSectionOverride ? (
    <div className="modal-backdrop craft-plan-section-override-backdrop" role="presentation">
      <section className="modal craft-plan-section-override" role="dialog" aria-modal="true" aria-label="Override needs board row">
        <header className="modal-header">
          <div>
            <h2>Edit {selectedSectionOverride.row.name}</h2>
            <p>API default: {selectedSectionOverride.row.apiName} in {selectedSectionOverride.row.apiSection}. Overrides apply to the same row across craft goals.</p>
          </div>
          <button className="icon-button" type="button" onClick={() => setSelectedSectionOverride(null)} aria-label="Close row override"><X size={18} /></button>
        </header>
        <div className="craft-plan-section-override-body">
          <label className="field">
            <span>Row display name</span>
            <input value={selectedSectionOverride.name} placeholder={selectedSectionOverride.row.apiName} onChange={(event) => setSelectedSectionOverride((current) => current ? { ...current, name: event.target.value } : current)} />
          </label>
          <label className="field">
            <span>Needs board section</span>
            <select value={selectedSectionOverride.section} onChange={(event) => setSelectedSectionOverride((current) => current ? { ...current, section: event.target.value } : current)}>
              {NEED_SECTIONS.map((section) => <option value={section} key={section}>{section}</option>)}
            </select>
          </label>
          <div className="modal-actions">
            <button className="toolbar-button" type="button" onClick={() => void saveRowOverride(selectedSectionOverride.row, null, null)}>Use API defaults</button>
            <button className="toolbar-button primary" type="button" onClick={() => void saveRowOverride(selectedSectionOverride.row, selectedSectionOverride.section, selectedSectionOverride.name)}>Save row</button>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  const needDetailDialog = selectedNeed ? (
    <div className="modal-backdrop craft-plan-need-detail-backdrop" role="presentation">
      <section className="modal craft-plan-need-detail" role="dialog" aria-modal="true" aria-label="Craft plan item details">
        <header className="modal-header">
          <div>
            <h2>{itemNode(selectedNeed.item)}</h2>
            <p>{quantity(selectedNeed.missing)} still needed, {quantity(selectedNeed.available)} available, {quantity(selectedNeed.inProgress)} in tracked crafts.</p>
          </div>
          <button className="icon-button" type="button" onClick={() => setSelectedNeed(null)} aria-label="Close item details"><X size={18} /></button>
        </header>
        <div className="craft-plan-need-detail-grid">
          <section className="form-card nested-card craft-plan-stock-card">
            <h3><Package size={16} /> Stock locations</h3>
            {selectedNeedSources.length ? selectedNeedSources.map((source) => (
              <details className="craft-plan-detail-group" key={source.key} open={source.entries.length === 1 ? undefined : false}>
                <summary className="craft-plan-detail-row">
                  <span>{source.label}</span>
                  <strong>{quantity(source.quantity)}</strong>
                </summary>
                {source.entries.length > 1 ? (
                  <div className="craft-plan-detail-breakdown">
                    {source.entries.map((entry: AnyRecord, index: number) => (
                      <div className="craft-plan-detail-row subtle" key={String(entry.sourceId ?? entry.label ?? index) + "-" + index}>
                        <span>{[entry.playerName, entry.type ?? "Source stack"].filter(Boolean).join(" — ")}</span>
                        <strong>{quantity(entry.quantity)}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </details>
            )) : <p className="legend">{Number(selectedNeed.available) > 0 ? "Counted stock exists, but source details are unavailable." : "No counted stock found for this item."}</p>}
            {selectedNeedCrafts.length ? <div className="craft-plan-tracked-crafts">
              <h3><Factory size={16} /> Tracked crafts</h3>
              {selectedNeedCrafts.map((craft, index) => <div className="craft-plan-detail-row" key={String(craft.craftId ?? index)}>
                <span><strong>{craft.buildingName ?? "Crafting station"}</strong><small>{craft.playerName ?? "Unknown player"} - {craft.status ?? (craft.completed ? "Ready to collect" : "In progress")}</small></span>
                <strong>{quantity(craft.quantity)}</strong>
              </div>)}
            </div> : null}
          </section>
          <div className="craft-plan-need-detail-side">
            <section className="form-card nested-card">
              <h3><Factory size={16} /> How to get this</h3>
              {selectedNeedSourceRoutes.length ? selectedNeedSourceRoutes.map((route, index) => {
                const alternatives = Array.isArray(route.alternatives) ? route.alternatives : [];
                const gatheringByproduct = route.routeType === "gathering-byproduct";
                const baseActions = Number(route.unbufferedCraftCount) || Math.ceil(Number(selectedNeed.required) / Math.max(Number(route.expectedYield), 0.0001));
                const bufferedActions = Number(route.craftCount) || baseActions;
                const routeMultiplier = Number(route.multiplier) || selectedMultiplier;
                const producerInputs = Array.isArray(route.inputs) ? route.inputs.filter((input: AnyRecord) => Number(input.quantity) > 0) : [];
                return (
                  <div className={`craft-plan-route-detail${gatheringByproduct ? " is-gathering-byproduct" : ""}`} key={String(route.selectedRecipeId ?? route.id ?? route.key ?? index) + "-" + index}>
                    <div className="craft-plan-route-heading">
                      {gatheringByproduct ? <span className="craft-plan-route-kind">Gathering byproduct</span> : null}
                      <strong>{gatheringByproduct && Array.isArray(route.gatheringSources) && route.gatheringSources.length > 1 ? route.recipeName : gatheringByproduct ? route.producerRecipe?.name ?? route.recipeName : route.recipeName ?? "Selected recipe"}</strong>
                      <p className="legend">{gatheringByproduct
                        ? [route.gatheringSkill, route.producer?.name ? `received with ${route.producer.name}` : null].filter(Boolean).join(" - ")
                        : route.buildingName ? "At " + route.buildingName : "Selected plan route"}</p>
                    </div>
                    {gatheringByproduct ? (
                      <>
                        {Array.isArray(route.gatheringSources) && route.gatheringSources.length > 1 ? <div className="craft-plan-gathering-sources">{route.gatheringSources.map((source: AnyRecord) => <span key={String(source.tag ?? source.label)}><strong>{source.label}</strong><small>{formatNumber(Number(source.expectedYield) || 0, Number(source.expectedYield) < 1 ? 2 : 1)} expected per action</small></span>)}</div> : null}
                        <p className="craft-plan-byproduct-note">Expected yield: {formatNumber(Number(route.expectedYield) || 0, Number(route.expectedYield) < 1 ? 2 : 1)} {itemName(route.output)} per gathering action{route.dropChance != null ? ` (${formatNumber(Number(route.dropChance) * 100, 1)}% chance for ${formatNumber(Number(route.dropQuantity) || 0, 1)})` : ""}.</p>
                        {route.isProbabilistic ? <div className="craft-plan-chance-summary">
                          <div className="craft-plan-action-summary"><span>Estimated processing actions <strong>{quantity(baseActions)}</strong></span>{routeMultiplier > 1 ? <span>With {formatNumber((routeMultiplier - 1) * 100, 1)}% extra <strong>{quantity(bufferedActions)} actions</strong></span> : null}</div>
                          {producerInputs.length ? <div className="craft-plan-producer-requirements"><small>Gather/process</small>{producerInputs.map((input: AnyRecord, inputIndex: number) => <span key={itemKey(input) + "-producer-" + inputIndex}>{itemNode(input)}<strong>{quantity(input.quantity)}</strong></span>)}</div> : null}
                          {canManage ? <div className="craft-plan-buffer-settings"><label htmlFor={`craft-plan-buffer-${index}`}>Safety buffer (% extra)</label><div className="craft-plan-buffer-control"><input id={`craft-plan-buffer-${index}`} type="number" min="0" max="1900" step="5" value={bufferPercent} onChange={(event) => setBufferPercent(event.target.value)} /><button className="toolbar-button primary" type="button" onClick={() => void saveMultiplier(selectedNeedKey, Number(bufferPercent))}>Save</button>{selectedMultiplier > 1 ? <button className="toolbar-button" type="button" onClick={() => void saveMultiplier(selectedNeedKey, 0)}>Reset</button> : null}</div><small>This adds producer actions and source-item requirements. It does not increase the item goal, change the API drop rate, or modify counted stock.</small></div> : null}
                        </div> : null}
                      </>
                    ) : Array.isArray(route.inputs) && route.inputs.length ? (
                      <div className="craft-plan-route-inputs">
                        {route.inputs.map((input: AnyRecord, inputIndex: number) => (
                          <span key={itemKey(input) + "-" + inputIndex}>{itemNode(input)} <strong>x{quantity(input.quantity)}</strong></span>
                        ))}
                      </div>
                    ) : null}
                    {canManage && alternatives.length > 1 ? (
                      <label className="field compact-field">
                        <span>Recipe route</span>
                        <select value={route.selectedRecipeId ?? ""} onChange={(event) => void saveRouteOverride(String(route.key ?? itemKey(route.output ?? {})), event.target.value)}>
                          {alternatives.map((recipe: AnyRecord) => <option value={recipe.id} key={recipe.id}>{recipeOptionLabel(recipe, route.output)}</option>)}
                        </select>
                      </label>
                    ) : alternatives.length > 1 ? <p className="legend">{alternatives.length} routes available.</p> : null}
                  </div>
                );
              }) : <p className="legend">The current plan does not need to craft this item. Stock locations show where it is counted from, or the item is treated as a raw gathered/vendor input.</p>}
            </section>
            <section className="form-card nested-card">
              <h3><Route size={16} /> Used for</h3>
              {selectedNeedUsages.length ? selectedNeedUsages.map((usage) => {
                const alternatives = Array.isArray(usage.alternatives) ? usage.alternatives : [];
                const selectedRecipe = alternatives.find((recipe: AnyRecord) => String(recipe.id) === String(usage.selectedRecipeId));
                return (
                  <div className="craft-plan-route-detail" key={usage.key}>
                    <div className="split-header">
                      <div>
                        <strong>Needed for {quantity(usage.output?.quantity)} {usage.output?.name ?? "planned output"}</strong>
                        <p className="legend">Uses {quantity(usage.requiredQuantity)} total from this cell</p>
                      </div>
                    </div>
                    {selectedRecipe && Array.isArray(selectedRecipe.inputs) && selectedRecipe.inputs.length ? (
                      <div className="craft-plan-route-inputs">
                        {selectedRecipe.inputs.map((input: AnyRecord, inputIndex: number) => (
                          <span key={itemKey(input) + "-" + inputIndex}>{itemNode(input)} <strong>x{quantity(input.quantityPerCraft ?? input.quantity)}</strong></span>
                        ))}
                      </div>
                    ) : null}
                    {usage.entries.length > 1 ? (
                      <details className="craft-plan-usage-breakdown">
                        <summary>Show {usage.entries.length} recipe demands</summary>
                        <div className="craft-plan-detail-breakdown">
                          {usage.entries.map((entry: AnyRecord, entryIndex: number) => (
                            <div className="craft-plan-detail-row subtle" key={String(entry.outputKey ?? entryIndex) + "-" + entryIndex}>
                              <span>{quantity(entry.output?.quantity)} via {entry.recipeName ?? "selected recipe"}{entry.buildingName ? " - " + entry.buildingName : ""}</span>
                              <strong>{quantity(entry.requiredQuantity)}</strong>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {canManage && alternatives.length > 1 ? (
                      <label className="field compact-field">
                        <span>Recipe route</span>
                        <select value={usage.selectedRecipeId ?? ""} onChange={(event) => void saveRouteOverride(String(usage.key ?? ""), event.target.value)}>
                          {alternatives.map((recipe: AnyRecord) => <option value={recipe.id} key={recipe.id}>{recipeOptionLabel(recipe, usage.output)}</option>)}
                        </select>
                      </label>
                    ) : alternatives.length > 1 ? <p className="legend">{alternatives.length} routes available.</p> : null}
                  </div>
                );
              }) : <p className="legend">No downstream recipe context was found. This is likely a final target, base gathered item, or vendor material.</p>}
              {routeStatus ? <p className="alert success">{routeStatus}</p> : null}
              {routeError ? <p className="alert error">{routeError}</p> : null}
            </section>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  React.useEffect(() => {
    setSelectedSections((current) => {
      const available = current.filter((section) => needsBoardSections.includes(section));
      return available.length === current.length ? current : available;
    });
  }, [needsBoardSections]);

  function toggleSection(section: string) {
    setSelectedSections((current) => current.includes(section)
      ? current.filter((selected) => selected !== section)
      : [...current, section]);
  }


  async function saveRowOverride(row: NeedRow, section: string | null, name: string | null) {
    if (!canManage || !adminAuth?.csrfToken || !row.overrideKey) return;
    setRouteStatus(null);
    setRouteError(null);
    try {
      const nextSectionOverrides = { ...currentSectionOverrides };
      if (!section || section === row.apiSection) delete nextSectionOverrides[row.overrideKey];
      else nextSectionOverrides[row.overrideKey] = section;
      const nextRowNameOverrides = { ...currentRowNameOverrides };
      const cleanName = String(name ?? "").trim();
      if (!cleanName || cleanName === row.apiName) delete nextRowNameOverrides[row.overrideKey];
      else nextRowNameOverrides[row.overrideKey] = cleanName;
      const nextConfig = {
        ...config,
        sectionOverrides: nextSectionOverrides,
        rowNameOverrides: nextRowNameOverrides,
      };
      const response = await fetch(LOCAL_API + "/admin/craft-plan", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": String(adminAuth.csrfToken),
        },
        body: JSON.stringify(nextConfig),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "HTTP " + response.status);
      setRouteStatus(section || cleanName ? "Needs board row updated." : "Needs board row reset to API defaults.");
      setSelectedSectionOverride(null);
      setManagerRefreshToken((value) => value + 1);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : String(err));
    }
  }
  async function saveRouteOverride(outputKey: string, recipeId: string) {
    if (!canManage || !adminAuth?.csrfToken || !outputKey || !recipeId) return;
    setRouteStatus(null);
    setRouteError(null);
    try {
      const nextConfig = {
        ...config,
        routeOverrides: {
          ...(config.routeOverrides ?? {}),
          [outputKey]: recipeId,
        },
      };
      const response = await fetch(LOCAL_API + "/admin/craft-plan", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": String(adminAuth.csrfToken),
        },
        body: JSON.stringify(nextConfig),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "HTTP " + response.status);
      setRouteStatus("Recipe route updated.");
      setManagerRefreshToken((value) => value + 1);
      setSelectedNeed(null);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : String(err));
    }
  }
  async function saveMultiplier(outputKey: string, percent: number) {
    if (!canManage || !adminAuth?.csrfToken || !outputKey) return;
    setRouteStatus(null);
    setRouteError(null);
    try {
      const multipliers = { ...(config.multipliers ?? {}) };
      const safePercent = Math.max(0, Math.min(1900, Number.isFinite(percent) ? percent : 0));
      if (safePercent > 0) multipliers[outputKey] = { multiplier: 1 + safePercent / 100, note: `${safePercent}% gathering safety buffer` };
      else delete multipliers[outputKey];
      const response = await fetch(LOCAL_API + "/admin/craft-plan", { method: "PUT", headers: { "content-type": "application/json", "x-csrf-token": String(adminAuth.csrfToken) }, body: JSON.stringify({ ...config, multipliers }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "HTTP " + response.status);
      setRouteStatus(safePercent > 0 ? `Safety buffer saved at ${safePercent}%.` : "Safety buffer removed.");
      setManagerRefreshToken((value) => value + 1);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading && !plan) {
    return <div className="panel craft-planning-page" aria-busy="true"><section className="craft-plan-loading" role="status" aria-live="polite">
      <header><span className="craft-plan-loading-icon"><ClipboardList size={24} /><LoaderCircle className="is-spinning" size={15} /></span><span><strong>Loading craft plan</strong><small>Checking targets, stock sources, active crafts, and materials.</small></span></header>
      <div className="craft-plan-loading-skeleton" aria-hidden="true">
        <div className="craft-plan-loading-stats">{Array.from({ length: 4 }, (_, index) => <span key={index}><i /><b /><em /></span>)}</div>
        <div className="craft-plan-loading-strip"><i /><span /></div>
        <div className="craft-plan-loading-board"><i />{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
      </div>
    </section></div>;
  }

  if (error) {
    return <div className="panel craft-planning-page"><div className="empty-state"><AlertTriangle size={36} /><strong>Craft plan unavailable</strong><span>{error}</span></div></div>;
  }

  const hasPlan = Boolean(plan?.enabled && targets.length);

  return (
    <div className="panel craft-planning-page">
      <header className="page-header split-header craft-plan-page-header">
        <div>
          <h2><ClipboardList size={24} /> Craft Planning</h2>
          <p>{hasPlan ? String(config.name ?? "Settlement craft plan") : "Admin-controlled procurement board for settlement crafting goals."}</p>
        </div>
        <div className="dashboard-top-meta">
          {canManage ? <button className="toolbar-button primary" type="button" onClick={() => setManagerOpen(true)}>Manage Plan</button> : null}
          <span>{quantity(totals.missingItems)} missing items</span>
          <span>{quantity(totals.activeCraftQuantity)} in tracked crafts</span>
        </div>
      </header>

      {!hasPlan ? (
        <div className="empty-state">
          <Target size={36} />
          <strong>No craft plan configured</strong>
          <span>{canManage ? "Use Manage Plan to add targets, inventory sources, route overrides, and uncertain-drop multipliers." : "An admin can add targets, inventory sources, route overrides, and uncertain-drop multipliers."}</span>
        </div>
      ) : (
        <>
          <section className="craft-plan-summary-band" aria-label="Craft plan summary">
            {summaryStat(<Target />, "Active targets", totals.targets, `${quantity(totals.missingQuantity)} total still needed`)}
            {summaryStat(<Package />, "Materials missing", totals.missingItems, "after stock and tracked crafts", "gold")}
            {summaryStat(<Factory />, "Craft outputs counted", totals.activeCraftQuantity, "in progress or ready to collect", "green")}
            {summaryStat(<AlertTriangle />, "Unavailable sources", unavailableSources.length, "excluded from stock totals", unavailableSources.length ? "warn" : "green")}
          </section>

          <section className="form-card craft-plan-section craft-plan-targets-strip">
            <div className="split-header"><h3><Target size={17} /> Targets</h3><p className="legend">Configured goals and current progress against counted sources.</p></div>
            <div className="craft-plan-target-list">
              {targets.map((target: AnyRecord) => {
                const buildingTarget = String(target.kind) === "building";
                const covered = Math.max(0, Number(target.quantity) - Number(target.missing));
                return (
                <article className={`craft-plan-target${Number(target.missing) <= 0 ? " is-complete" : ""}`} key={target.key ?? `${target.kind}:${target.id}`}>
                  {itemNode(target)}
                  <div className="craft-plan-target-progress"><span><i style={{ width: `${Math.min(100, Math.max(0, (covered / Math.max(1, Number(target.quantity))) * 100))}%` }} /></span><small>{quantity(covered)} / {quantity(target.quantity)} {buildingTarget ? "newly built" : "covered"}</small><em>{buildingTarget ? target.progressInitialized ? `${quantity(target.available)} completed stations detected` : "Tracking pending until claim buildings are available" : `${quantity(target.available)} available${Number(target.inProgress) > 0 ? ` · ${quantity(target.inProgress)} in progress` : ""}`}</em></div>
                  <div className="craft-plan-target-status"><strong>{quantity(target.missing)}</strong><span>{Number(target.missing) <= 0 ? "Complete" : "Still needed"}</span></div>
                </article>
              );
              })}
            </div>
          </section>

          <section className="form-card craft-plan-section craft-plan-needs-board" data-tour="craft-planning-gather-next">
            <div className="craft-plan-needs-header"><div className="craft-plan-needs-heading-content"><div><h3><Target size={17} /> Needs Board</h3><p className="legend">Missing items grouped by activity. Crafted intermediates stay under their profession; gathered inputs stay under their source activity.</p></div><div className={`craft-plan-overall-progress ${completionTone(overallCompletion.completion)}`}><span><strong>{overallCompletion.completion}%</strong><small>Overall complete</small></span><div><i style={{ width: `${overallCompletion.completion}%` }} /></div><em>{quantity(overallCompletion.covered)} / {quantity(overallCompletion.required)} covered</em></div></div></div>
            {personalBoard.board.length ? <div className="craft-plan-section-filters" aria-label="Filter needs board by activity">
              <label className="craft-plan-needs-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Search Needs Board items" value={needsSearch} onChange={(event) => setNeedsSearch(event.target.value)} placeholder="Search items" /></label>
              <button className={selectedSections.length === 0 ? "active" : ""} type="button" aria-pressed={selectedSections.length === 0} onClick={() => setSelectedSections([])}>All <span>{needsBoardRowCount}</span></button>
              {personalBoard.board.map((group) => {
                const selected = selectedSections.includes(group.section);
                return <button className={selected ? "active" : ""} type="button" aria-pressed={selected} key={group.section} onClick={() => toggleSection(group.section)}>{group.section} <span>{group.rows.length}</span></button>;
              })}
              <label className="craft-plan-list-only"><input type="checkbox" checked={shortagesOnly} onChange={(event) => setShortagesOnly(event.target.checked)} /> Shortages only</label>
            </div> : null}
            <div className="craft-plan-needs-legend" aria-label="Needs board legend"><span className="covered">Covered</span><span className="short">More needed</span><span className="active">Active craft counted</span><span className="blocked">Recipe cannot start from counted stock</span></div>
            {filteredNeedsBoard.length ? <div className="craft-plan-needs-scroll">
              <div className="craft-plan-needs-table-wrap craft-plan-needs-matrix">
                <table className="craft-plan-needs-table">
                  <colgroup>
                    <col className="craft-plan-needs-row-column" />
                    {NEED_COLUMNS.map((column) => <col className="craft-plan-needs-data-column" key={column} />)}
                  </colgroup>
                  {filteredNeedsBoard.map((group) => (
                    <tbody key={group.section}>
                      <tr className="craft-plan-needs-section-row"><th><div className="craft-plan-needs-section-heading"><span className="craft-plan-needs-section-label">{group.section} <span className={completionTone(group.completion)}>{group.completion}%</span></span>{group.section === "Fishing" ? <div className="craft-plan-fishing-route" role="group" aria-label="Preferred fishing route">
                        <button type="button" className={normalizedFishingRoute === "ocean" ? "active" : ""} aria-pressed={normalizedFishingRoute === "ocean"} onClick={() => setFishingRoute("ocean")}>Ocean</button>
                        <button type="button" className={normalizedFishingRoute === "lake" ? "active" : ""} aria-pressed={normalizedFishingRoute === "lake"} onClick={() => setFishingRoute("lake")}>Lake</button>
                        {!personalBoard.available && personalBoard.reason ? <small role="status" aria-live="polite">{personalBoard.reason}</small> : null}
                      </div> : null}</div></th>{NEED_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr>
                        {group.rows.map((row) => (
                          <tr key={row.name}>
                            <th>{canManage ? <button className="craft-plan-row-section-button" type="button" title={`Edit ${row.name} row display`} onClick={() => setSelectedSectionOverride({ row, section: row.sectionOverride ?? row.apiSection, name: row.rowNameOverride ?? row.apiName })}>{row.name}</button> : row.name}</th>
                            {NEED_COLUMNS.map((column) => <td key={column}>{needCellNode(row.cells.get(column), setSelectedNeed)}</td>)}
                          </tr>
                        ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </div> : <p className="legend">{needsSearch.trim() ? "No matching items in the selected Needs Board filters." : "All planned materials are covered by selected stock sources and tracked crafts."}</p>}
          </section>

          {canManage && warnings.length ? (
            <details className="form-card craft-plan-section warning-card craft-plan-catalog-diagnostics">
              <summary><span><AlertTriangle size={17} /> Catalog diagnostics</span><small>{warnings.length} item{warnings.length === 1 ? "" : "s"} need review</small></summary>
              <div className="craft-plan-catalog-diagnostic-list">
                {warnings.map((warning: string) => <p className="legend" key={warning}>{warning}</p>)}
              </div>
            </details>
          ) : null}
          {unavailableSources.length ? (
            <section className="form-card craft-plan-section warning-card">
              <h3><AlertTriangle size={17} /> Unavailable stock sources</h3>
              {unavailableSources.map((source: AnyRecord) => <p className="legend" key={`${source.type}-${source.sourceId}`}>{source.label}: {source.error}</p>)}
            </section>
          ) : null}
        </>
      )}
      {needDetailDialog ? createPortal(needDetailDialog, document.body) : null}
      {sectionOverrideDialog ? createPortal(sectionOverrideDialog, document.body) : null}
      {canManage ? <CraftPlanManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} csrfToken={String(adminAuth?.csrfToken)} onSaved={() => setManagerRefreshToken((value) => value + 1)} /> : null}
    </div>
  );
}
