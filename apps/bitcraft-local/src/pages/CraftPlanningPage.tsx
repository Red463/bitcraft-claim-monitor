import React from "react";
import "../styles/craft-planning.css";
import { AlertTriangle, ChevronDown, ClipboardList, EqualApproximately, Factory, LoaderCircle, MapPin, Package, Route, Search, Target, X } from "lucide-react";

import { TierBadge } from "../components/main/Badges";
import { Dialog } from "../components/main/Dialog";
import { ItemIcon } from "../components/main/ItemDisplay";
import { usePersistedState } from "../hooks/usePersistedState";
import type { AnyRecord } from "../main-app-data";
import { formatNumber } from "../utils/format";
import { CraftPlanManagerDialog } from "./CraftPlanManagerDialog";
import { cellItemKeys, gatheredCellState, setCellGathered } from "./craftPlanningGatheredOverrides";
import { applyPersonalFishingView, normalizeFishingRoutePreference, type FishingRoutePreference } from "./craftPlanningFishingView";
import { selectCraftPlanningEffortView } from "./craftPlanningEffortView";
import { buildNeedsBoard, filterNeedsBoard, itemKey, itemName, NEED_COLUMNS, NEED_SECTIONS, type NeedCell, type NeedRow } from "./craftPlanningNeedsBoard";
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
  const hasGuaranteedActive = cell.guaranteedInProgress > 0;
  const hasEstimatedActive = cell.estimatedInProgress > 0;
  const hasApproximateRequirement = cell.items.some((item) => item.estimatedRequirement === true);
  const hasIndicators = hasGuaranteedActive || hasEstimatedActive || hasApproximateRequirement;
  const planningSupplied = cell.available + cell.guaranteedInProgress + cell.estimatedInProgress;
  const blocked = !satisfied && cell.items.some((item) => item.hasSourceRoutes || (Array.isArray(item.sourceRoutes) && item.sourceRoutes.length > 0)) && planningSupplied <= 0;
  return (
    <button className={`craft-plan-need-cell${satisfied ? " is-satisfied" : " is-shortage"}${hasGuaranteedActive ? " has-active" : ""}${hasIndicators ? " has-indicators" : ""}${blocked ? " is-blocked" : ""}`} type="button" title={`${cell.name}: ${quantity(cell.missing)} needed, ${quantity(cell.available)} in stock, ${quantity(cell.guaranteedInProgress)} guaranteed active output${hasEstimatedActive ? `, ${quantity(cell.estimatedInProgress)} estimated craft output (counted for material planning only)` : ""}, ${quantity(cell.required)} required${hasApproximateRequirement ? "; requirement estimated from expected processing yield" : ""}`} onClick={() => onSelect(cell)}>
      <strong>{quantity(satisfied ? planningSupplied : cell.missing)}</strong>
      <small>{quantity(planningSupplied)} / {quantity(cell.required)}</small>
      {hasIndicators ? <span className="craft-plan-cell-indicators">
        {hasGuaranteedActive ? <Factory className="is-guaranteed" size={11} role="img" aria-label="Actively being crafted" /> : null}
        {hasEstimatedActive ? <Factory className="is-estimated" size={11} role="img" aria-label="Estimated craft output; counted for material planning" /> : null}
        {hasApproximateRequirement ? <EqualApproximately className="is-approximate" size={12} role="img" aria-label="Approximate requirement" /> : null}
      </span> : null}
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
  const [targetsCollapsed, setTargetsCollapsed] = usePersistedState<boolean>("planning.targetsCollapsed", true);
  const targetsAreCollapsed = targetsCollapsed !== false;
  const [selectedNeed, setSelectedNeed] = React.useState<NeedCell | null>(null);
  const [detailSteps, setDetailSteps] = React.useState<AnyRecord[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const detailRequestRef = React.useRef(0);
  const [routeStatus, setRouteStatus] = React.useState<string | null>(null);
  const [routeError, setRouteError] = React.useState<string | null>(null);
  const [gatheredSavePending, setGatheredSavePending] = React.useState(false);
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

  async function openNeedDetail(cell: NeedCell) {
    const requestId = ++detailRequestRef.current;
    setSelectedNeed(cell);
    setDetailSteps([]);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const keys = [...new Set(cell.items.map(itemKey).filter(Boolean))];
      const response = await fetch(`${LOCAL_API}/craft-plan/detail?claimId=${encodeURIComponent(claimId)}&keys=${encodeURIComponent(keys.join(","))}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      if (requestId !== detailRequestRef.current) return;
      const detailedItems = new Map((Array.isArray(body.materials) ? body.materials : []).map((item: AnyRecord) => [itemKey(item), item]));
      const items = cell.items.map((item) => detailedItems.get(itemKey(item)) ?? item);
      setSelectedNeed({ ...cell, item: items[0] ?? cell.item, items });
      setDetailSteps(Array.isArray(body.steps) ? body.steps : []);
    } catch (detailFetchError) {
      if (requestId === detailRequestRef.current) setDetailError(detailFetchError instanceof Error ? detailFetchError.message : String(detailFetchError));
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }

  function closeNeedDetail() {
    detailRequestRef.current += 1;
    setSelectedNeed(null);
    setDetailSteps([]);
    setDetailError(null);
    setDetailLoading(false);
  }

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
  const effortView = React.useMemo(
    () => selectCraftPlanningEffortView(plan?.effortProgress, normalizedFishingRoute),
    [plan?.effortProgress, normalizedFishingRoute],
  );
  const filteredNeedsBoard = React.useMemo(
    () => filterNeedsBoard(personalBoard.board, selectedSections, shortagesOnly, needsSearch),
    [personalBoard.board, selectedSections, shortagesOnly, needsSearch],
  );
  const canManage = Boolean(adminAuth?.authenticated && adminAuth?.csrfToken);
  const currentSectionOverrides = config.sectionOverrides ?? {};
  const currentRowNameOverrides = config.rowNameOverrides ?? {};
  const selectedNeedSources = selectedNeed ? groupNeedCellSources(selectedNeed) : [];
  const selectedNeedCrafts = selectedNeed ? groupNeedCellActiveCrafts(selectedNeed) : [];
  const selectedNeedSourceRoutes = selectedNeed ? groupNeedCellSourceRoutes(selectedNeed, detailSteps) : [];
  const selectedNeedUsages = selectedNeed ? groupNeedCellRecipeUsages(selectedNeed) : [];
  const selectedNeedKey = selectedNeed?.items?.[0]?.key ?? (selectedNeed ? itemKey(selectedNeed.item) : "");
  const selectedNeedKeys = selectedNeed ? cellItemKeys(selectedNeed.items) : [];
  const selectedGatheredState = gatheredCellState(selectedNeedKeys, config.gatheredItemKeys ?? []);
  const selectedNeedGathered = selectedGatheredState === "all";
  const selectedMultiplier = Number(config.multipliers?.[selectedNeedKey]?.multiplier) || 1;
  React.useEffect(() => {
    setBufferPercent(String(Math.max(0, Math.round((selectedMultiplier - 1) * 1000) / 10)));
  }, [selectedNeedKey, selectedMultiplier]);
  const sectionOverrideDialog = selectedSectionOverride ? (
    <Dialog open title="Override needs board row" closeOnBackdrop={false} onClose={() => setSelectedSectionOverride(null)} className="modal craft-plan-section-override" backdropClassName="modal-backdrop craft-plan-section-override-backdrop">
        <header className="modal-header">
          <div>
            <h2>Edit {selectedSectionOverride.row.name}</h2>
            <p>Planner default: {selectedSectionOverride.row.apiName} in {selectedSectionOverride.row.plannerSection}. Overrides apply to the same row across craft goals.</p>
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
            <button className="toolbar-button" type="button" onClick={() => void saveRowOverride(selectedSectionOverride.row, null, null)}>Use planner defaults</button>
            <button className="toolbar-button primary" type="button" onClick={() => void saveRowOverride(selectedSectionOverride.row, selectedSectionOverride.section, selectedSectionOverride.name)}>Save row</button>
          </div>
        </div>
    </Dialog>
  ) : null;

  const needDetailDialog = selectedNeed ? (
    <Dialog open title="Craft plan item details" onClose={closeNeedDetail} className="modal craft-plan-need-detail" backdropClassName="modal-backdrop craft-plan-need-detail-backdrop">
        <header className="modal-header">
          <div>
            <h2>{itemNode(selectedNeed.item)}</h2>
            <p>{quantity(selectedNeed.missing)} still needed, {quantity(selectedNeed.available)} available, {quantity(selectedNeed.guaranteedInProgress)} guaranteed active output, {quantity(selectedNeed.estimatedInProgress)} estimated craft output counted for material planning.</p>
          </div>
          <button className="icon-button" type="button" onClick={closeNeedDetail} aria-label="Close item details"><X size={18} /></button>
        </header>
        {detailLoading ? <p className="craft-plan-detail-loading" role="status"><LoaderCircle size={16} className="spin" /> Loading current item details...</p> : null}
        {detailError ? <p className="alert error" role="alert">Item details could not be loaded: {detailError}</p> : null}
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
                <span><strong>{quantity(craft.expectedQuantity ?? craft.quantity)} expected</strong><small>{quantity(craft.guaranteedQuantity)} guaranteed</small></span>
              </div>)}
            </div> : null}
          </section>
          <div className="craft-plan-need-detail-side">
            <section className="form-card nested-card">
              <h3><Factory size={16} /> How to get this</h3>
              {canManage ? (
                <div className="craft-plan-gathered-control" data-state={selectedGatheredState}>
                  <label className="compact-toggle">
                    <input
                      type="checkbox"
                      checked={selectedNeedGathered}
                      aria-checked={selectedGatheredState === "mixed" ? "mixed" : selectedNeedGathered}
                      disabled={gatheredSavePending || detailLoading}
                      onChange={(event) => void saveGatheredOverride(event.target.checked)}
                    />
                    <span>Treat this cell as gathered</span>
                  </label>
                  <small>Stops producer-recipe expansion for this exact cell. The item remains required and counted stock still applies.</small>
                  {selectedGatheredState === "mixed" ? <small className="craft-plan-gathered-mixed">Some underlying items are already marked. Changing this toggle applies one state to the whole displayed cell.</small> : null}
                </div>
              ) : null}
              {selectedNeedGathered ? (
                <div className="craft-plan-gathered-state">
                  <strong>This item is treated as gathered.</strong>
                  <p>The remaining amount must be gathered or supplied from counted stock. Producer recipes and package routes are ignored.</p>
                  <a className="toolbar-button" href="/?page=map"><MapPin size={15} /> Open Map resource finder</a>
                </div>
              ) : selectedNeedSourceRoutes.length ? selectedNeedSourceRoutes.map((route, index) => {
                const alternatives = Array.isArray(route.alternatives) ? route.alternatives : [];
                const routeType = String(route.routeType ?? "craft");
                const gatheringRoute = routeType.startsWith("gathering");
                const byproductRoute = routeType.endsWith("-byproduct");
                const routeKindLabel = gatheringRoute
                  ? byproductRoute ? "Gathering byproduct" : "Gathering output"
                  : byproductRoute ? "Craft byproduct" : "Craft output";
                const yieldUnit = gatheringRoute ? "per gathering action" : "per craft";
                const itemListRoute = route.expectedYield != null;
                const expectedYield = Number(route.expectedYield) || 0;
                const guaranteedYield = Number(route.guaranteedYield) || 0;
                const guaranteedOutput = !byproductRoute && guaranteedYield > 0 && guaranteedYield + 1e-9 >= expectedYield;
                const baseActions = Number(route.unbufferedCraftCount) || Math.ceil(Number(selectedNeed.required) / Math.max(Number(route.expectedYield), 0.0001));
                const bufferedActions = Number(route.craftCount) || baseActions;
                const routeMultiplier = Number(route.multiplier) || selectedMultiplier;
                const producerInputs = Array.isArray(route.inputs) ? route.inputs.filter((input: AnyRecord) => Number(input.quantity) > 0) : [];
                const displayedRecipeName = route.producerRecipe?.name ?? route.recipeName ?? "Selected recipe";
                const actionLabel = gatheringRoute ? "Estimated gathering actions" : byproductRoute ? "Estimated crafts" : "Crafts required";
                return (
                  <div className={`craft-plan-route-detail is-${gatheringRoute ? "gathering" : "craft"}`} key={String(route.selectedRecipeId ?? route.id ?? route.key ?? index) + "-" + index}>
                    <div className="craft-plan-route-heading">
                      <span className={`craft-plan-route-kind is-${gatheringRoute ? "gathering" : "craft"}`}>{routeKindLabel}</span>
                      <strong>{gatheringRoute && Array.isArray(route.gatheringSources) && route.gatheringSources.length > 1 ? route.recipeName : displayedRecipeName}</strong>
                      <p className="legend">{gatheringRoute
                        ? [route.gatheringSkill, byproductRoute && route.producer?.name ? `received with ${route.producer.name}` : null].filter(Boolean).join(" - ")
                        : route.buildingName ? "At " + route.buildingName : "Selected plan route"}</p>
                    </div>
                    {itemListRoute ? (
                      <>
                        {gatheringRoute && Array.isArray(route.gatheringSources) && route.gatheringSources.length > 1 ? <div className="craft-plan-gathering-sources">{route.gatheringSources.map((source: AnyRecord) => <span key={String(source.tag ?? source.label)}><strong>{source.label}</strong><small>{formatNumber(Number(source.expectedYield) || 0, Number(source.expectedYield) < 1 ? 2 : 1)} expected per action</small></span>)}</div> : null}
                        <p className="craft-plan-byproduct-note">{guaranteedOutput
                          ? <>Guaranteed output: {formatNumber(guaranteedYield, guaranteedYield < 1 ? 2 : 1)} {itemName(route.output)} {yieldUnit}.</>
                          : <>Expected yield: {formatNumber(expectedYield, expectedYield < 1 ? 2 : 1)} {itemName(route.output)} {yieldUnit}{route.dropChance != null ? ` (${formatNumber(Number(route.dropChance) * 100, 1)}% chance for ${formatNumber(Number(route.dropQuantity) || 0, 1)})` : ""}.</>}</p>
                        <div className="craft-plan-chance-summary">
                          <div className="craft-plan-action-summary"><span>{actionLabel} <strong>{quantity(baseActions)}</strong></span>{routeMultiplier > 1 ? <span>With {formatNumber((routeMultiplier - 1) * 100, 1)}% extra <strong>{quantity(bufferedActions)} actions</strong></span> : null}</div>
                          {producerInputs.length ? <div className="craft-plan-producer-requirements"><small>{gatheringRoute ? "Gather/process" : "Craft inputs"}</small>{producerInputs.map((input: AnyRecord, inputIndex: number) => <span key={itemKey(input) + "-producer-" + inputIndex}>{itemNode(input)}<strong>{quantity(input.quantity)}</strong></span>)}</div> : null}
                          {route.isProbabilistic && canManage ? <div className="craft-plan-buffer-settings"><label htmlFor={`craft-plan-buffer-${index}`}>Safety buffer (% extra)</label><div className="craft-plan-buffer-control"><input id={`craft-plan-buffer-${index}`} type="number" min="0" max="1900" step="5" value={bufferPercent} onChange={(event) => setBufferPercent(event.target.value)} /><button className="toolbar-button primary" type="button" onClick={() => void saveMultiplier(selectedNeedKey, Number(bufferPercent))}>Save</button>{selectedMultiplier > 1 ? <button className="toolbar-button" type="button" onClick={() => void saveMultiplier(selectedNeedKey, 0)}>Reset</button> : null}</div><small>This adds producer actions and source-item requirements. It does not increase the item goal, change the API drop rate, or modify counted stock.</small></div> : null}
                        </div>
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
    </Dialog>
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
  async function saveGatheredOverride(enabled: boolean) {
    if (!canManage || !adminAuth?.csrfToken || !selectedNeed || !selectedNeedKeys.length) return;
    const openCell = selectedNeed;
    setRouteStatus(null);
    setRouteError(null);
    setGatheredSavePending(true);
    try {
      const gatheredItemKeys = setCellGathered(config.gatheredItemKeys ?? [], selectedNeedKeys, enabled);
      const response = await fetch(LOCAL_API + "/admin/craft-plan", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": String(adminAuth.csrfToken),
        },
        body: JSON.stringify({ ...config, gatheredItemKeys }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "HTTP " + response.status);
      const refreshedPlan = body.plan;
      if (refreshedPlan && Array.isArray(refreshedPlan.materials)) {
        setPlan(refreshedPlan);
        const byKey = new Map<string, AnyRecord>(refreshedPlan.materials.map((item: AnyRecord): [string, AnyRecord] => [itemKey(item), item]));
        const items = openCell.items.map((item) => byKey.get(itemKey(item)) ?? item);
        setSelectedNeed({ ...openCell, item: items[0] ?? openCell.item, items });
        const keys = new Set(selectedNeedKeys);
        setDetailSteps((Array.isArray(refreshedPlan.steps) ? refreshedPlan.steps : []).filter((step: AnyRecord) => keys.has(itemKey(step.output ?? {}))));
      }
      setRouteStatus(enabled ? "This cell is now treated as gathered." : "Recipe expansion restored for this cell.");
      setManagerRefreshToken((value) => value + 1);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : String(err));
    } finally {
      setGatheredSavePending(false);
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
            <div className="split-header craft-plan-targets-header">
              <h3>
                <button
                  className="craft-plan-targets-toggle"
                  type="button"
                  aria-expanded={!targetsAreCollapsed}
                  aria-controls="craft-plan-target-list"
                  onClick={() => setTargetsCollapsed((current) => current === false)}
                >
                  <Target size={17} />
                  <span>Targets</span>
                  <ChevronDown className="craft-plan-targets-chevron" size={16} aria-hidden="true" />
                </button>
              </h3>
              <p className="legend">Configured goals and current progress against counted sources.</p>
            </div>
            <div id="craft-plan-target-list" className="craft-plan-target-list" hidden={targetsAreCollapsed}>
              {targets.map((target: AnyRecord) => {
                const buildingTarget = String(target.kind) === "building";
                const covered = Math.max(0, Number(target.quantity) - Number(target.missing));
                const estimatedActive = Math.max(0, Number(target.estimatedInProgress) || 0);
                return (
                <article className={`craft-plan-target${Number(target.missing) <= 0 ? " is-complete" : ""}`} key={target.key ?? `${target.kind}:${target.id}`}>
                  {itemNode(target)}
                  <div className="craft-plan-target-progress"><span><i style={{ width: `${Math.min(100, Math.max(0, (covered / Math.max(1, Number(target.quantity))) * 100))}%` }} /></span><small>{quantity(covered)} / {quantity(target.quantity)} {buildingTarget ? "newly built" : "covered"}</small><em>{buildingTarget ? target.progressInitialized ? `${quantity(target.available)} completed stations detected` : "Tracking pending until claim buildings are available" : `${quantity(target.available)} available${Number(target.inProgress) > 0 ? ` · ${quantity(target.inProgress)} active output${estimatedActive > 0 ? ` (${quantity(estimatedActive)} estimated)` : ""}` : ""}`}</em></div>
                  <div className="craft-plan-target-status"><strong>{quantity(target.missing)}</strong><span>{Number(target.missing) <= 0 ? "Complete" : "Still needed"}</span></div>
                </article>
              );
              })}
            </div>
          </section>

          <section className="form-card craft-plan-section craft-plan-needs-board" data-tour="craft-planning-gather-next">
            <div className="craft-plan-needs-header"><div className="craft-plan-needs-heading-content"><div><h3><Target size={17} /> Needs Board</h3><p className="legend">Missing items grouped by activity. Crafted intermediates stay under their profession; gathered inputs stay under their source activity.</p></div><div className={`craft-plan-overall-progress ${effortView.overall.completion == null ? "is-unavailable" : completionTone(effortView.overall.completion)}`}><span><strong>{effortView.overall.completion == null ? "—" : `${effortView.overall.completion}%`}</strong><small>{effortView.overall.completion == null ? "Effort progress unavailable" : "Effort complete"}</small></span><div><i style={{ width: `${effortView.overall.completion ?? 0}%` }} /></div><em className="craft-plan-effort-note">Confirmed stock and guaranteed active crafts.</em></div></div></div>
            {personalBoard.board.length ? <div className="craft-plan-section-filters" aria-label="Filter needs board by activity">
              <label className="craft-plan-needs-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Search Needs Board items" value={needsSearch} onChange={(event) => setNeedsSearch(event.target.value)} placeholder="Search items" /></label>
              <label className="craft-plan-list-only"><input type="checkbox" checked={shortagesOnly} onChange={(event) => setShortagesOnly(event.target.checked)} /> Shortages only</label>
              <button className={selectedSections.length === 0 ? "active" : ""} type="button" aria-pressed={selectedSections.length === 0} onClick={() => setSelectedSections([])}>All <span>{needsBoardRowCount}</span></button>
              {personalBoard.board.map((group) => {
                const selected = selectedSections.includes(group.section);
                return <button className={selected ? "active" : ""} type="button" aria-pressed={selected} key={group.section} onClick={() => toggleSection(group.section)}>{group.section} <span>{group.rows.length}</span></button>;
              })}
            </div> : null}
            <div className="craft-plan-needs-legend" aria-label="Needs board legend"><span className="covered">Covered for material planning</span><span className="short">More needed</span><span className="active icon-state"><Factory size={11} aria-hidden="true" />Guaranteed craft counted</span><span className="approximate icon-state"><EqualApproximately size={12} aria-hidden="true" />Approximate requirement</span><span className="estimated-output icon-state"><Factory size={11} aria-hidden="true" />Estimated craft output; counted for material planning</span><span className="blocked">Recipe cannot start from counted stock</span></div>
            {filteredNeedsBoard.length ? <div className="craft-plan-needs-scroll" tabIndex={0} aria-label="Craft plan needs board">
              <div className="craft-plan-needs-table-wrap craft-plan-needs-matrix">
                <table className="craft-plan-needs-table">
                  <colgroup>
                    <col className="craft-plan-needs-row-column" />
                    {NEED_COLUMNS.map((column) => <col className="craft-plan-needs-data-column" key={column} />)}
                  </colgroup>
                  {filteredNeedsBoard.map((group) => {
                    const sectionCompletion = effortView.sections[group.section]?.completion ?? null;
                    return (
                    <tbody key={group.section}>
                      <tr className="craft-plan-needs-section-row"><th><div className="craft-plan-needs-section-heading"><span className="craft-plan-needs-section-label">{group.section} <span className={sectionCompletion == null ? "is-unavailable" : completionTone(sectionCompletion)}>{sectionCompletion == null ? "Effort unavailable" : `${sectionCompletion}%`}</span></span>{group.section === "Fishing" ? <div className="craft-plan-fishing-route" role="group" aria-label="Preferred fishing route">
                        <button type="button" className={normalizedFishingRoute === "ocean" ? "active" : ""} aria-pressed={normalizedFishingRoute === "ocean"} onClick={() => setFishingRoute("ocean")}>Ocean</button>
                        <button type="button" className={normalizedFishingRoute === "lake" ? "active" : ""} aria-pressed={normalizedFishingRoute === "lake"} onClick={() => setFishingRoute("lake")}>Lake</button>
                        {!personalBoard.available && personalBoard.reason ? <small role="status" aria-live="polite">{personalBoard.reason}</small> : null}
                      </div> : null}</div></th>{NEED_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr>
                        {group.rows.map((row) => (
                          <tr key={row.name}>
                            <th>{canManage ? <button className="craft-plan-row-section-button" type="button" title={`Edit ${row.name} row display`} onClick={() => setSelectedSectionOverride({ row, section: row.sectionOverride ?? row.plannerSection, name: row.rowNameOverride ?? row.apiName })}>{row.name}</button> : row.name}</th>
                            {NEED_COLUMNS.map((column) => <td key={column}>{needCellNode(row.cells.get(column), (cell) => void openNeedDetail(cell))}</td>)}
                          </tr>
                        ))}
                    </tbody>
                    );
                  })}
                </table>
              </div>
            </div> : <p className="legend">{needsSearch.trim() ? "No matching items in the selected Needs Board filters." : "All planned materials are covered by confirmed stock and guaranteed active crafts."}</p>}
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
      {needDetailDialog}
      {sectionOverrideDialog}
      {canManage ? <CraftPlanManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} csrfToken={String(adminAuth?.csrfToken)} onSaved={() => setManagerRefreshToken((value) => value + 1)} /> : null}
    </div>
  );
}
