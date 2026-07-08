import React from "react";
import { AlertTriangle, ClipboardList, Factory, Package, Route, Target, X } from "lucide-react";

import { TierBadge } from "../components/main/Badges";
import { ItemIcon, ItemLabel } from "../components/main/ItemDisplay";
import { Info } from "../components/main/Stats";
import type { AnyRecord } from "../main-app-data";
import { formatNumber } from "../utils/format";
import { CraftPlanManagerDialog } from "./CraftPlanManagerDialog";

const LOCAL_API = "/api/local";
const NEED_COLUMNS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "Materials"];
const SECTION_ORDER = [
  "Carpentry",
  "Construction",
  "Cooking",
  "Farming",
  "Fishing",
  "Foraging",
  "Forestry",
  "Hunting",
  "Leatherworking",
  "Masonry",
  "Mining",
  "Scholar",
  "Smithing",
  "Tailoring",
  "Other",
];
const TIER_PREFIX_PATTERN = /^(Rough|Basic|Simple|Sturdy|Fine|Exquisite|Advanced)\s+/i;

type NeedCell = {
  item: AnyRecord;
  items: AnyRecord[];
  name: string;
  missing: number;
  required: number;
  available: number;
  inProgress: number;
};

type NeedRow = {
  name: string;
  maxMissing: number;
  cells: Map<string, NeedCell>;
};

type NeedGroup = {
  section: string;
  rows: NeedRow[];
};

function itemNode(item: AnyRecord) {
  return (
    <span className="craft-plan-item-label">
      <span className="craft-plan-item-icon"><ItemIcon item={item} /></span>
      <span><ItemLabel item={item} />{item.tier ? <TierBadge tier={item.tier} /> : null}</span>
    </span>
  );
}

function quantity(value: unknown) {
  return formatNumber(Number(value) || 0, 0);
}

function itemKey(item: AnyRecord) {
  const id = item.key ?? item.itemKey ?? item.id ?? item.itemId ?? item.entityId ?? item.name ?? item.label;
  const kind = item.kind ?? item.itemKind ?? item.itemType ?? "item";
  return String(item.key ?? `${kind}:${id}`);
}

function itemName(item: AnyRecord) {
  return String(item.name ?? item.label ?? item.itemName ?? item.key ?? "Unknown item");
}

function itemTier(item: AnyRecord) {
  const value = Number(item.tier ?? item.itemTier ?? item.tierLevel);
  return Number.isFinite(value) && value >= 1 && value <= 10 ? value : null;
}

function rowNameForNeed(item: AnyRecord) {
  const name = itemName(item).trim();
  return itemTier(item) ? name.replace(TIER_PREFIX_PATTERN, "") : name;
}

function columnForNeed(item: AnyRecord) {
  const tier = itemTier(item);
  return tier ? `T${tier}` : "Materials";
}

function sortSectionName(a: string, b: string) {
  const ai = SECTION_ORDER.indexOf(a);
  const bi = SECTION_ORDER.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b);
}

function buildNeedsBoard(materials: AnyRecord[], targets: AnyRecord[]): NeedGroup[] {
  const targetKeys = new Set(targets.map(itemKey));
  const groups = new Map<string, Map<string, NeedRow>>();

  for (const material of materials) {
    const missing = Number(material.missing) || 0;
    if (missing <= 0 || material.isTarget || targetKeys.has(itemKey(material))) continue;
    const section = String(material.section ?? "Other");
    const rowName = rowNameForNeed(material);
    const column = columnForNeed(material);
    if (!groups.has(section)) groups.set(section, new Map());
    const rows = groups.get(section)!;
    if (!rows.has(rowName)) rows.set(rowName, { name: rowName, maxMissing: 0, cells: new Map() });
    const row = rows.get(rowName)!;
    const existing = row.cells.get(column);
    const required = Number(material.required) || 0;
    const available = Number(material.available) || 0;
    const inProgress = Number(material.inProgress) || 0;
    if (existing) {
      existing.items.push(material);
      existing.missing += missing;
      existing.required += required;
      existing.available += available;
      existing.inProgress += inProgress;
    } else {
      row.cells.set(column, { item: material, items: [material], name: itemName(material), missing, required, available, inProgress });
    }
    row.maxMissing = Math.max(row.maxMissing, missing);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => sortSectionName(a, b))
    .map(([section, rows]) => ({
      section,
      rows: [...rows.values()].sort((a, b) => b.maxMissing - a.maxMissing || a.name.localeCompare(b.name)),
    }));
}

function needCellNode(cell: NeedCell | undefined, onSelect: (cell: NeedCell) => void) {
  if (!cell) return <span className="craft-plan-need-empty">-</span>;
  return (
    <button className="craft-plan-need-cell" type="button" title={cell.name} onClick={() => onSelect(cell)}>
      <strong>{quantity(cell.missing)}</strong>
      <small>{quantity(cell.available)}/{quantity(cell.required)}</small>
    </button>
  );
}

function cellSources(cell: NeedCell) {
  return cell.items.flatMap((item) => Array.isArray(item.sources) ? item.sources : []);
}

function cellRecipeUsages(cell: NeedCell) {
  return cell.items.flatMap((item) => Array.isArray(item.recipeUsages) ? item.recipeUsages : []);
}

function recipeOptionLabel(recipe: AnyRecord) {
  const inputs = Array.isArray(recipe.inputs) ? recipe.inputs.map(itemName).filter(Boolean) : [];
  const label = String(recipe.label ?? recipe.name ?? recipe.id ?? "Recipe");
  return inputs.length ? label + " (" + inputs.join(", ") + ")" : label;
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
  const [selectedSection, setSelectedSection] = React.useState("all");
  const [selectedNeed, setSelectedNeed] = React.useState<NeedCell | null>(null);
  const [routeStatus, setRouteStatus] = React.useState<string | null>(null);
  const [routeError, setRouteError] = React.useState<string | null>(null);

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
  const sectionFilters = React.useMemo(() => needsBoard.map((group) => group.section), [needsBoard]);
  const filteredNeedsBoard = selectedSection === "all" ? needsBoard : needsBoard.filter((group) => group.section === selectedSection);
  const canManage = Boolean(adminAuth?.authenticated && adminAuth?.csrfToken);

  React.useEffect(() => {
    if (selectedSection !== "all" && !sectionFilters.includes(selectedSection)) setSelectedSection("all");
  }, [sectionFilters, selectedSection]);

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

  if (loading && !plan) {
    return <div className="panel craft-planning-page"><div className="empty-state"><ClipboardList size={36} /><strong>Loading craft plan</strong><span>Checking targets, sources, active crafts, and materials.</span></div></div>;
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
        <div className="top-meta">
          {canManage ? <button className="toolbar-button primary" type="button" onClick={() => setManagerOpen(true)}>Manage Plan</button> : null}
          <span>{quantity(totals.missingItems)} missing items</span>
          <span>{quantity(totals.activeCraftQuantity)} in active crafts</span>
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
            {summaryStat(<Package />, "Materials missing", totals.missingItems, "after stock and active crafts", "gold")}
            {summaryStat(<Factory />, "Active crafts counted", totals.activeCraftQuantity, "outputs already in progress", "green")}
            {summaryStat(<AlertTriangle />, "Unavailable sources", unavailableSources.length, "excluded from stock totals", unavailableSources.length ? "warn" : "green")}
          </section>

          <section className="form-card craft-plan-section craft-plan-targets-strip">
            <div className="split-header"><h3><Target size={17} /> Targets</h3><p className="legend">Configured goals and current progress against counted sources.</p></div>
            <div className="craft-plan-target-list">
              {targets.map((target: AnyRecord) => (
                <article className="craft-plan-target" key={target.key ?? `${target.kind}:${target.id}`}>
                  {itemNode(target)}
                  <div><Info label="Goal" value={quantity(target.quantity)} /><Info label="Available" value={quantity(target.available)} /><Info label="In progress" value={quantity(target.inProgress)} /><Info label="Still needed" value={quantity(target.missing)} /></div>
                </article>
              ))}
            </div>
          </section>

          <section className="form-card craft-plan-section craft-plan-needs-board" data-tour="craft-planning-gather-next">
            <div className="split-header"><h3><Target size={17} /> Needs Board</h3><p className="legend">Missing items grouped by activity. Crafted intermediates stay under their profession; gathered inputs stay under their source activity.</p></div>
            {needsBoard.length ? <div className="craft-plan-section-filters" aria-label="Filter needs board by activity">
              <button className={selectedSection === "all" ? "active" : ""} type="button" onClick={() => setSelectedSection("all")}>All <span>{needsBoard.length}</span></button>
              {needsBoard.map((group) => <button className={selectedSection === group.section ? "active" : ""} type="button" key={group.section} onClick={() => setSelectedSection(group.section)}>{group.section} <span>{group.rows.length}</span></button>)}
            </div> : null}
            {filteredNeedsBoard.length ? <div className="craft-plan-needs-scroll">
              {filteredNeedsBoard.map((group) => (
                <article className="craft-plan-needs-group" key={group.section}>
                  <div className="craft-plan-needs-table-wrap">
                    <table className="craft-plan-needs-table">
                      <thead>
                        <tr><th>{group.section}</th>{NEED_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.name}>
                            <th>{row.name}</th>
                            {NEED_COLUMNS.map((column) => <td key={column}>{needCellNode(row.cells.get(column), setSelectedNeed)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div> : <p className="legend">All planned materials are covered by selected stock sources and active crafts.</p>}
          </section>

          {warnings.length || unavailableSources.length ? (
            <section className="form-card craft-plan-section warning-card">
              <h3><AlertTriangle size={17} /> Unavailable sources</h3>
              {warnings.map((warning: string) => <p className="legend" key={warning}>{warning}</p>)}
              {unavailableSources.map((source: AnyRecord) => <p className="legend" key={`${source.type}-${source.sourceId}`}>{source.label}: {source.error}</p>)}
            </section>
          ) : null}
        </>
      )}
      {selectedNeed ? (
        <div className="modal-backdrop craft-plan-need-detail-backdrop" role="presentation">
          <section className="modal craft-plan-need-detail" role="dialog" aria-modal="true" aria-label="Craft plan item details">
            <header className="modal-header">
              <div>
                <h2>{itemNode(selectedNeed.item)}</h2>
                <p>{quantity(selectedNeed.missing)} still needed, {quantity(selectedNeed.available)} available, {quantity(selectedNeed.inProgress)} in active crafts.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedNeed(null)} aria-label="Close item details"><X size={18} /></button>
            </header>
            <div className="craft-plan-need-detail-grid">
              <section className="form-card nested-card">
                <h3><Package size={16} /> Stock locations</h3>
                {cellSources(selectedNeed).length ? cellSources(selectedNeed).map((source, index) => (
                  <div className="craft-plan-detail-row" key={String(source.sourceId ?? source.label ?? index) + "-" + index}>
                    <span>{source.label ?? source.type ?? "Source"}</span>
                    <strong>{quantity(source.quantity)}</strong>
                  </div>
                )) : <p className="legend">No counted stock found for this item.</p>}
              </section>
              <section className="form-card nested-card">
                <h3><Route size={16} /> Recipe used</h3>
                {cellRecipeUsages(selectedNeed).length ? cellRecipeUsages(selectedNeed).map((usage, index) => {
                  const alternatives = Array.isArray(usage.alternatives) ? usage.alternatives : [];
                  const selectedRecipe = alternatives.find((recipe: AnyRecord) => String(recipe.id) === String(usage.selectedRecipeId));
                  return (
                    <div className="craft-plan-route-detail" key={String(usage.outputKey ?? index) + "-" + index}>
                      <div className="split-header">
                        <div>
                          <strong>{usage.output?.name ?? usage.recipeName ?? "Recipe"}</strong>
                          <p className="legend">{usage.recipeName ?? "Selected recipe"}{usage.buildingName ? " - " + usage.buildingName : ""}</p>
                        </div>
                      </div>
                      {selectedRecipe && Array.isArray(selectedRecipe.inputs) && selectedRecipe.inputs.length ? (
                        <div className="craft-plan-route-inputs">
                          {selectedRecipe.inputs.map((input: AnyRecord, inputIndex: number) => (
                            <span key={itemKey(input) + "-" + inputIndex}>{itemNode(input)} <strong>x{quantity(input.quantity)}</strong></span>
                          ))}
                        </div>
                      ) : null}
                      {canManage && alternatives.length > 1 ? (
                        <label className="field compact-field">
                          <span>Recipe route</span>
                          <select value={usage.selectedRecipeId ?? ""} onChange={(event) => void saveRouteOverride(String(usage.outputKey ?? ""), event.target.value)}>
                            {alternatives.map((recipe: AnyRecord) => <option value={recipe.id} key={recipe.id}>{recipeOptionLabel(recipe)}</option>)}
                          </select>
                        </label>
                      ) : alternatives.length > 1 ? <p className="legend">{alternatives.length} routes available.</p> : null}
                    </div>
                  );
                }) : <p className="legend">No recipe context was found. This is likely a base gathered or vendor material.</p>}
                {routeStatus ? <p className="alert success">{routeStatus}</p> : null}
                {routeError ? <p className="alert error">{routeError}</p> : null}
              </section>
            </div>
          </section>
        </div>
      ) : null}
      {canManage ? <CraftPlanManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} csrfToken={String(adminAuth?.csrfToken)} onSaved={() => setManagerRefreshToken((value) => value + 1)} /> : null}
    </div>
  );
}
