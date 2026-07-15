import React from "react";
import { ClipboardList, LoaderCircle, Package, Plus, RefreshCw, Route, Save, Search, SlidersHorizontal, Target, Trash2, X, Zap } from "lucide-react";

import { ItemIcon, ItemLabel } from "../components/main/ItemDisplay";
import { Dialog } from "../components/main/Dialog";
import type { AnyRecord } from "../main-app-data";
import { dateLabel, formatNumber, timeAgo } from "../utils/format";

const LOCAL_API = "/api/local";
const BITJITA_API = "/api/bitjita";
const TABS = ["targets", "sources", "players", "routes", "buffers"] as const;
type ManagerTab = typeof TABS[number];
type ManagerOperation = "loading" | "refreshing" | "saving" | "preset" | null;

type CraftPlanConfig = {
  enabled: boolean;
  name: string;
  targets: AnyRecord[];
  sourceRules: { storageContainerIds: string[]; playerIds: string[]; craftPlayerIds: string[]; deployableContainerIds: string[] };
  routeOverrides: Record<string, string>;
  sectionOverrides: Record<string, string>;
  rowNameOverrides: Record<string, string>;
  multipliers: Record<string, { multiplier: number; note?: string }>;
  buildingProgress: Record<string, { baselineEntityIds: string[]; completedEntityIds: string[] }>;
};

function emptyConfig(): CraftPlanConfig {
  return { enabled: true, name: "Settlement craft plan", targets: [], sourceRules: { storageContainerIds: [], playerIds: [], craftPlayerIds: [], deployableContainerIds: [] }, routeOverrides: {}, sectionOverrides: {}, rowNameOverrides: {}, multipliers: {}, buildingProgress: {} };
}

function itemKind(item: AnyRecord) {
  const raw = String(item.kind ?? item.itemType ?? item.item_type ?? "items");
  return raw === "building" || raw === "2" ? "building" : raw === "cargo" || raw === "1" ? "cargo" : "items";
}

function itemKey(item: AnyRecord) {
  return `${itemKind(item)}:${item.id}`;
}

function targetFromMarketItem(item: AnyRecord): AnyRecord {
  const kind = itemKind(item);
  return {
    id: String(item.id),
    kind,
    itemType: kind === "cargo" ? 1 : 0,
    name: String(item.name ?? `Item #${item.id}`),
    quantity: Number(item.quantity ?? 1) || 1,
    tier: item.tier ?? null,
    rarityStr: item.rarityStr ?? item.rarity ?? null,
    tag: item.tag ?? null,
    iconAssetName: item.iconAssetName ?? null,
  };
}

function withQuantity(item: AnyRecord, quantity: number) {
  return { ...targetFromMarketItem(item), quantity: Math.max(1, Math.ceil(quantity || 1)) };
}

function mergeTargets(existing: AnyRecord[], incoming: AnyRecord[]) {
  const byKey = new Map(existing.map((target) => [itemKey(target), { ...target }]));
  for (const target of incoming) {
    const key = itemKey(target);
    const current = byKey.get(key);
    byKey.set(key, current ? { ...current, quantity: Math.max(1, Math.ceil(Number(current.quantity ?? 0) + Number(target.quantity ?? 0))) } : { ...target });
  }
  return [...byKey.values()];
}

function itemTypeLabel(item: AnyRecord) {
  const kind = itemKind(item);
  return kind === "building" ? "Workstation" : kind === "cargo" ? "Cargo" : "Item";
}

function itemPreview(items: AnyRecord[] = []) {
  const top = items.slice().sort((a, b) => Number(b.quantity ?? 0) - Number(a.quantity ?? 0)).slice(0, 10);
  return top.length ? (
    <div className="craft-plan-source-items">
      {top.map((item) => <span key={`${itemKey(item)}:${item.quantity}`}><ItemLabel item={item} meta={itemTypeLabel(item)} /><strong>{formatNumber(Number(item.quantity) || 0, 0)}</strong></span>)}
    </div>
  ) : <p className="legend">No visible item stacks.</p>;
}

function sourceCard(source: AnyRecord, checked: boolean, onChange: (checked: boolean) => void) {
  return (
    <article className={`craft-plan-source-card${checked ? " is-included" : ""}`} key={source.sourceId}>
      <header>
        <div>
          <strong>{source.label}</strong>
          <small>{source.type ? `${source.type}${source.itemCount != null ? ` - ${formatNumber(Number(source.itemCount) || 0, 0)} stacks` : ""}` : `${formatNumber(source.itemCount ?? 0)} item stacks`}</small>
        </div>
        <label className="compact-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{checked ? "Included" : "Excluded"}</span></label>
      </header>
      {itemPreview(Array.isArray(source.items) ? source.items : [])}
    </article>
  );
}


function playerSourceCard(source: AnyRecord, inventoryChecked: boolean, craftsChecked: boolean, onInventoryChange: (checked: boolean) => void, onCraftsChange: (checked: boolean) => void) {
  return (
    <article className={`craft-plan-source-card${inventoryChecked || craftsChecked ? " is-included" : ""}`} key={source.playerId}>
      <header>
        <div>
          <strong>{source.label}</strong>
          <small>Player tracking</small>
        </div>
        <div className="craft-plan-player-source-toggles">
          <label className="compact-toggle"><input type="checkbox" checked={inventoryChecked} onChange={(event) => onInventoryChange(event.target.checked)} /><span>Inventory</span></label>
          <label className="compact-toggle"><input type="checkbox" checked={craftsChecked} onChange={(event) => onCraftsChange(event.target.checked)} /><span>Crafts</span></label>
        </div>
      </header>
    </article>
  );
}


function groupDeployablesByPlayer(sources: AnyRecord[]) {
  const groups = new Map<string, { playerId: string; playerName: string; sources: AnyRecord[] }>();
  for (const source of Array.isArray(sources) ? sources : []) {
    const playerId = String(source.playerId ?? source.sourceId ?? "unknown").split(":")[0] || "unknown";
    const playerName = String(source.playerName ?? source.ownerName ?? playerId);
    const group = groups.get(playerId) ?? { playerId, playerName, sources: [] };
    group.sources.push(source);
    groups.set(playerId, group);
  }
  return [...groups.values()].sort((a, b) => a.playerName.localeCompare(b.playerName));
}
function routeOptionLabel(recipe: AnyRecord, output?: AnyRecord) {
  const inputs = Array.isArray(recipe.inputs) ? recipe.inputs.map((item) => String(item.name ?? item.label ?? item.id ?? "item")).filter(Boolean) : [];
  const label = String(recipe.label ?? recipe.name ?? recipe.id ?? "Recipe");
  const station = String(recipe.buildingName ?? "").trim();
  const outputName = String(output?.name ?? output?.label ?? output?.id ?? "output");
  return inputs.length && output ? `${inputs.join(" + ")} -> ${outputName}${station ? ` - ${station}` : ""}` : `${label}${station ? ` - ${station}` : ""}`;
}

function routeOutputKey(step: AnyRecord) {
  return itemKey(step.output ?? step);
}

const CATALOG_REFRESH_POLL_MS = 4000;

type CatalogRefreshStatus = {
  scheduledJob: AnyRecord | null;
  latestRun: AnyRecord | null;
  recentRuns: AnyRecord[];
};

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function firstCount(...values: unknown[]) {
  for (const value of values) {
    const count = Number(value);
    if (Number.isFinite(count)) return count;
  }
  return 0;
}

function formatCatalogPhase(value: unknown) {
  const text = firstText(value);
  const labels: Record<string, string> = {
    list_items: "Discovering items",
    list_cargo: "Discovering cargo",
    detail_items: "Loading item details",
    detail_cargo: "Loading cargo details",
    waiting_retry: "Waiting to retry",
    retry_failures: "Retrying failed details",
    complete: "Complete",
  };
  return labels[text] ?? (text ? text.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Idle");
}

function formatCatalogMoment(value: unknown) {
  const text = firstText(value);
  return text ? { summary: timeAgo(text), detail: dateLabel(text) } : { summary: "Never", detail: "Not available" };
}

export function CraftPlanManagerDialog({ open, onClose, csrfToken, onSaved }: { open: boolean; onClose: () => void; csrfToken: string; onSaved: () => void }) {
  const [state, setState] = React.useState<AnyRecord | null>(null);
  const [config, setConfig] = React.useState<CraftPlanConfig>(emptyConfig());
  const [activeTab, setActiveTab] = React.useState<ManagerTab>("targets");
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<AnyRecord[]>([]);
  const [activeSearchResultIndex, setActiveSearchResultIndex] = React.useState(-1);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [operation, setOperation] = React.useState<ManagerOperation>(null);
  const [catalogStatus, setCatalogStatus] = React.useState<CatalogRefreshStatus | null>(null);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [catalogBusy, setCatalogBusy] = React.useState(false);
  const catalogPollingActive = Boolean(
    catalogStatus?.scheduledJob?.running
    || catalogStatus?.scheduledJob?.metadata?.complete === false
    || catalogStatus?.latestRun?.status === "running"
    || catalogStatus?.latestRun?.status === "paused"
  );

  async function adminApi(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("content-type", "application/json");
    if (options.method && options.method !== "GET") headers.set("x-csrf-token", csrfToken);
    const response = await fetch(`${LOCAL_API}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body;
  }

  const load = React.useCallback(async (mode: "loading" | "refreshing" = "loading") => {
    setBusy(true);
    setOperation(mode);
    setError(null);
    try {
      const result = await adminApi("/admin/craft-plan");
      setState(result);
      setConfig({ ...emptyConfig(), ...(result.config ?? {}), sourceRules: { ...emptyConfig().sourceRules, ...(result.config?.sourceRules ?? {}) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setOperation(null);
    }
  }, [csrfToken]);

  const loadCatalogStatus = React.useCallback(async (options: { silent?: boolean } = {}) => {
    const silent = options.silent === true;
    if (!silent) setCatalogBusy(true);
    setCatalogError(null);
    try {
      const result = await adminApi("/admin/craft-plan/catalog-refresh");
      setCatalogStatus({
        scheduledJob: result.scheduledJob ?? null,
        latestRun: result.latestRun ?? null,
        recentRuns: Array.isArray(result.recentRuns) ? result.recentRuns : [],
      });
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!silent) setCatalogBusy(false);
    }
  }, [csrfToken]);

  React.useEffect(() => {
    if (!open) return;
    void load();
    void loadCatalogStatus();
  }, [open, load, loadCatalogStatus]);

  React.useEffect(() => {
    if (!open || !catalogPollingActive) return;
    const interval = window.setInterval(() => {
      void loadCatalogStatus({ silent: true });
    }, CATALOG_REFRESH_POLL_MS);
    return () => window.clearInterval(interval);
  }, [open, catalogPollingActive, loadCatalogStatus]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setSearchResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`${BITJITA_API}/market?search=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [], cargos: [] })
        .then((body) => {
          setSearchResults([...(body.items ?? []), ...(body.cargos ?? [])].slice(0, 16));
          setActiveSearchResultIndex(-1);
        })
        .catch(() => setSearchResults([]));
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  function selectSearchResult(item: AnyRecord) {
    addTargets([withQuantity(item, 1)], `Added ${item.name ?? item.id}.`);
    setQuery("");
    setSearchResults([]);
    setActiveSearchResultIndex(-1);
  }

  function handleSearchResultKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSearchResults([]);
      setActiveSearchResultIndex(-1);
      return;
    }
    if (!searchResults.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchResultIndex((current) => current >= searchResults.length - 1 ? 0 : current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchResultIndex((current) => current <= 0 ? searchResults.length - 1 : current - 1);
    } else if (event.key === "Enter" && activeSearchResultIndex >= 0) {
      event.preventDefault();
      selectSearchResult(searchResults[activeSearchResultIndex]);
    }
  }

  function patchConfig(patch: Partial<CraftPlanConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function updateSource(kind: "storageContainerIds" | "playerIds" | "craftPlayerIds" | "deployableContainerIds", id: string, checked: boolean) {
    setConfig((current) => {
      const currentValues = current.sourceRules[kind] ?? [];
      const nextValues = checked ? [...new Set([...currentValues, id])] : currentValues.filter((value) => value !== id);
      return { ...current, sourceRules: { ...current.sourceRules, [kind]: nextValues } };
    });
  }

  function addTargets(items: AnyRecord[], message: string) {
    setConfig((current) => ({ ...current, targets: mergeTargets(current.targets, items) }));
    setStatus(message);
  }

  async function addWorkstationPreset(preset: AnyRecord) {
    setBusy(true);
    setOperation("preset");
    setError(null);
    setStatus(null);
    try {
      const result = await adminApi(`/admin/craft-plan/workstation-preset?tier=${encodeURIComponent(String(preset.tier))}`);
      const incoming = Array.isArray(result.workstations) ? result.workstations : [];
      const known = new Set(config.targets.map(itemKey));
      const additions = incoming.filter((target: AnyRecord) => {
        if (known.has(itemKey(target))) return false;
        known.add(itemKey(target));
        return true;
      });
      const added = additions.length;
      const existing = incoming.length - additions.length;
      setConfig((current) => ({ ...current, targets: [...current.targets, ...additions] }));
      setStatus(`Added ${added} T${preset.tier} workstations${existing ? `; ${existing} already tracked` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setOperation(null);
    }
  }

  async function triggerCatalogRefresh() {
    if (busy || catalogBusy || catalogStatus?.scheduledJob?.running) return;
    setCatalogBusy(true);
    setCatalogError(null);
    try {
      const result = await adminApi("/admin/craft-plan/catalog-refresh", { method: "POST", body: "{}" });
      setCatalogStatus({
        scheduledJob: result.scheduledJob ?? null,
        latestRun: result.latestRun ?? null,
        recentRuns: Array.isArray(result.recentRuns) ? result.recentRuns : [],
      });
      setStatus(result.result?.started ? "Planner catalog refresh started." : "Planner catalog status updated.");
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : String(err));
    } finally {
      setCatalogBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setOperation("saving");
    setError(null);
    setStatus(null);
    try {
      const result = await adminApi("/admin/craft-plan", { method: "PUT", body: JSON.stringify(config) });
      setState(result);
      setConfig({ ...emptyConfig(), ...(result.config ?? {}), sourceRules: { ...emptyConfig().sourceRules, ...(result.config?.sourceRules ?? {}) } });
      setStatus("Craft plan saved.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setOperation(null);
    }
  }

  if (!open) return null;

  const storageSources = state?.sources?.storage ?? [];
  const playerSources = state?.sources?.players ?? [];
  const deployableSources = state?.sources?.deployables ?? [];
  const deployableGroups = groupDeployablesByPlayer(deployableSources);
  const tierPresets = state?.sources?.tierPresets ?? [];
  const workstationPresets = state?.sources?.workstationPresets ?? [];
  const routeSteps = Array.isArray(state?.plan?.steps) ? state.plan.steps : [];
  const scheduledJob = catalogStatus?.scheduledJob ?? null;
  const recentRuns = Array.isArray(catalogStatus?.recentRuns) ? catalogStatus.recentRuns : [];
  const latestRun = catalogStatus?.latestRun ?? null;
  const successfulRun = [latestRun, ...recentRuns].find((run) => run?.status === "completed" && firstText(run?.completedAt, run?.updatedAt)) ?? null;
  const completedRun = [latestRun, ...recentRuns].find((run) => run?.status === "completed" && firstText(run?.completedAt, run?.updatedAt)) ?? null;
  const catalogRunning = Boolean(scheduledJob?.running);
  const catalogRetrying = !catalogRunning && latestRun?.phase === "waiting_retry" && scheduledJob?.metadata?.complete === false;
  const catalogContinuing = !catalogRunning && !catalogRetrying && latestRun?.status === "paused" && scheduledJob?.metadata?.complete === false;
  const catalogActive = catalogRunning || catalogRetrying || catalogContinuing;
  const catalogPhase = formatCatalogPhase(firstText(latestRun?.phase, scheduledJob?.metadata?.phase, scheduledJob?.metadata?.stage, scheduledJob?.metadata?.step));
  const processedCount = firstCount(latestRun?.processedCount, scheduledJob?.metadata?.processedCount, scheduledJob?.metadata?.current, scheduledJob?.metadata?.progressCurrent);
  const totalCount = firstCount(latestRun?.totalCount, scheduledJob?.metadata?.totalCount, scheduledJob?.metadata?.total, scheduledJob?.metadata?.progressTotal);
  const itemCount = firstCount(latestRun?.itemCount, successfulRun?.itemCount, scheduledJob?.metadata?.itemCount);
  const cargoCount = firstCount(latestRun?.cargoCount, successfulRun?.cargoCount, scheduledJob?.metadata?.cargoCount);
  const recipeCount = firstCount(latestRun?.recipeCount, successfulRun?.recipeCount, scheduledJob?.metadata?.recipeCount);
  const byproductCount = firstCount(latestRun?.byproductCount, successfulRun?.byproductCount, scheduledJob?.metadata?.byproductCount);
  const failureCount = firstCount(latestRun?.failureCount, completedRun?.failureCount, scheduledJob?.metadata?.failureCount);
  const lastSuccessAt = firstText(scheduledJob?.lastSuccessAt, successfulRun?.completedAt, successfulRun?.updatedAt) || null;
  const lastCompletedAt = firstText(completedRun?.completedAt, completedRun?.updatedAt) || null;
  const nextRunAt = firstText(scheduledJob?.nextRunAt) || null;
  const noCatalog = !lastSuccessAt && recipeCount <= 0 && byproductCount <= 0;
  const catalogActionBusy = busy || catalogBusy || catalogActive;
  const catalogStatusLabel = catalogRunning ? "Running" : catalogRetrying ? "Waiting to retry" : catalogContinuing ? "Continuing" : noCatalog ? "Refresh required" : latestRun?.status === "failed" ? "Attention" : "Ready";
  const progressSummary = totalCount > 0 ? `${formatNumber(processedCount, 0)} / ${formatNumber(totalCount, 0)}` : processedCount > 0 ? formatNumber(processedCount, 0) : "Waiting";
  const catalogSummary = catalogRunning
    ? `${catalogPhase} in progress${totalCount > 0 ? `, ${progressSummary} processed.` : "."}`
    : catalogRetrying
      ? `BitJita is temporarily unavailable. Retrying automatically${nextRunAt ? ` at ${dateLabel(nextRunAt)}` : " shortly"}.`
    : catalogContinuing
      ? `Next batch queued${totalCount > 0 ? `, ${progressSummary} details loaded.` : "."}`
    : noCatalog
      ? "No planner catalog yet. Run a refresh to populate recipe diagnostics."
      : latestRun?.status === "failed"
        ? "The last refresh failed. Existing catalog data remains available until the next successful run."
        : "Catalog diagnostics are ready for manual route and source review.";
  const catalogSchedule = nextRunAt ? `Next scheduled run ${dateLabel(nextRunAt)}.` : (scheduledJob?.scheduleLabel ?? "Manual refresh only.");
  const lastSuccess = formatCatalogMoment(lastSuccessAt);
  const lastCompleted = formatCatalogMoment(lastCompletedAt);
  const lastProgress = formatCatalogMoment(firstText(latestRun?.updatedAt, scheduledJob?.updatedAt));
  const catalogPillClass = catalogActive ? "status-pill working" : catalogStatusLabel === "Ready" ? "status-pill complete" : "status-pill";
  const pendingLabel = operation === "loading" ? "Loading plan data…" : operation === "refreshing" ? "Refreshing plan data…" : operation === "saving" ? "Saving plan…" : operation === "preset" ? "Loading workstation preset…" : catalogBusy ? "Refreshing catalog status…" : null;

  return (
    <Dialog open title="Craft plan manager" closeOnBackdrop={false} onClose={onClose} className="modal craft-plan-manager" backdropClassName="modal-backdrop craft-plan-manager-backdrop">
        <header className="modal-header">
          <div>
            <h2><ClipboardList size={22} /> Manage Craft Plan</h2>
            <p>Set goals, choose counted inventories, apply tier presets, and tune routes for the public Craft Planning board.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close craft plan manager"><X size={18} /></button>
        </header>
        <div className="craft-plan-manager-actions">
          <label className="field craft-plan-name-field"><span>Plan name</span><input value={config.name} onChange={(event) => patchConfig({ name: event.target.value })} /></label>
          <label className="craft-plan-public-toggle"><input type="checkbox" checked={config.enabled !== false} onChange={(event) => patchConfig({ enabled: event.target.checked })} /><span><strong>Public board</strong><small>{config.enabled !== false ? "Visible to users" : "Hidden from users"}</small></span></label>
          <div className="craft-plan-manager-buttons">
            <button className="toolbar-button" type="button" onClick={() => void load("refreshing")} disabled={busy || catalogBusy}>{operation === "refreshing" ? <LoaderCircle className="is-spinning" size={14} /> : <RefreshCw size={14} />} {operation === "refreshing" ? "Refreshing…" : "Refresh"}</button>
            <button className="toolbar-button primary" type="button" onClick={save} disabled={busy}>{operation === "saving" ? <LoaderCircle className="is-spinning" size={14} /> : <Save size={14} />} {operation === "saving" ? "Saving…" : "Save Plan"}</button>
          </div>
          <section className="craft-plan-catalog-band" aria-label="Planner catalog diagnostics">
            <div className="craft-plan-catalog-summary">
              <div>
                <strong>Planner catalog diagnostics</strong>
                <p className={noCatalog ? "craft-plan-catalog-empty" : undefined}>{catalogSummary}</p>
                <small>{catalogSchedule}{catalogActive ? ` Last progress ${lastProgress.summary}.` : ""}</small>
              </div>
              <div className="craft-plan-catalog-controls">
                <span className={catalogPillClass}>{catalogStatusLabel}</span>
                <button className="toolbar-button" type="button" onClick={triggerCatalogRefresh} disabled={catalogActionBusy}>{catalogBusy || catalogActive ? <LoaderCircle className="is-spinning" size={14} /> : <RefreshCw size={14} />} {catalogBusy ? "Starting refresh…" : catalogActive ? "Refresh running…" : "Refresh planner catalog"}</button>
              </div>
            </div>
            {catalogError ? <p className="craft-plan-catalog-error">{catalogError}</p> : null}
            <div className="craft-plan-catalog-stats">
              <div className="craft-plan-catalog-stat"><small>Status</small><strong>{catalogStatusLabel}</strong><span>{catalogPhase}</span></div>
              <div className="craft-plan-catalog-stat"><small>Progress</small><strong>{progressSummary}</strong><span>{totalCount > 0 ? `${formatNumber(processedCount, 0)} processed of ${formatNumber(totalCount, 0)}` : "Waiting for a completed scan"}</span></div>
              <div className="craft-plan-catalog-stat"><small>Last success</small><strong>{lastSuccess.summary}</strong><span>{lastSuccess.detail}</span></div>
              <div className="craft-plan-catalog-stat"><small>Last full refresh</small><strong>{lastCompleted.summary}</strong><span>{lastCompleted.detail}</span></div>
              <div className="craft-plan-catalog-stat"><small>Items</small><strong>{formatNumber(itemCount, 0)}</strong><span>Item entities</span></div>
              <div className="craft-plan-catalog-stat"><small>Cargo</small><strong>{formatNumber(cargoCount, 0)}</strong><span>Cargo entities</span></div>
              <div className="craft-plan-catalog-stat"><small>Recipes</small><strong>{formatNumber(recipeCount, 0)}</strong><span>Catalog recipes</span></div>
              <div className="craft-plan-catalog-stat"><small>Byproducts</small><strong>{formatNumber(byproductCount, 0)}</strong><span>Output variants</span></div>
              <div className={`craft-plan-catalog-stat${failureCount > 0 ? " is-problem" : ""}`}><small>Failures</small><strong>{formatNumber(failureCount, 0)}</strong><span>{failureCount > 0 ? (catalogActive ? "Automatic recovery is active" : "Unavailable entities were skipped") : "No failures recorded"}</span></div>
            </div>
          </section>
        </div>
        {pendingLabel ? <div className="craft-plan-manager-pending" role="status" aria-live="polite"><LoaderCircle className="is-spinning" size={16} /><span>{pendingLabel}</span></div> : null}
        {error ? <div className="alert error">{error}</div> : null}
        {status ? <div className="alert success">{status}</div> : null}
        <nav className="craft-plan-manager-tabs" aria-label="Craft plan editor sections">
          {[
            ["targets", <Target size={15} />, "Targets"],
            ["sources", <Package size={15} />, "Storage"],
            ["players", <Package size={15} />, "Players & Deployables"],
            ["routes", <Route size={15} />, "Routes"],
            ["buffers", <SlidersHorizontal size={15} />, "Buffers"],
          ].map(([id, icon, label]) => <button key={String(id)} type="button" className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id as ManagerTab)}>{icon}{label}</button>)}
        </nav>
        <div className="craft-plan-manager-body" aria-busy={busy || catalogBusy}>
          {operation === "loading" && !state ? <div className="craft-plan-manager-loading"><LoaderCircle className="is-spinning" size={28} /><strong>Loading craft plan</strong><span>Fetching targets, inventories, players, deployables, routes, and presets.</span></div> : null}
          {activeTab === "targets" ? <section className="craft-plan-manager-panel">
            <div className="split-header"><div><h3>Target items</h3><p className="legend">Preset buttons add normal target rows. You can change quantities or remove them at any time.</p></div></div>
            <section className="craft-plan-tier-presets" aria-label="Tier upgrade presets">
              <div className="craft-plan-tier-presets-header">
                <div><h4><Zap size={16} /> Tier upgrade presets</h4><p>Loaded from BitJita claim research. Click a tier to add its upgrade materials to the plan.</p></div>
                <small>{tierPresets.length ? `${tierPresets.length} presets loaded` : "No presets loaded"}</small>
              </div>
              {tierPresets.length ? <div className="craft-plan-preset-grid">
                {tierPresets.map((preset: AnyRecord) => <button className="craft-plan-preset-tier" type="button" aria-label={`Add upgrade materials for ${preset.label}`} key={preset.key} onClick={() => addTargets((preset.items ?? []).map((item: AnyRecord) => withQuantity(item, Number(item.quantity) || 1)), `Added ${preset.label} requirements.`)}>{preset.label}</button>)}
              </div> : <div className="craft-plan-preset-empty"><strong>No tier presets loaded</strong><span>BitJita did not return tier upgrade research materials for this settlement.</span></div>}
            </section>
            <section className="craft-plan-tier-presets craft-plan-workstation-presets" aria-label="Workstation tier presets">
              <div className="craft-plan-tier-presets-header">
                <div><h4><Package size={16} /> Workstation presets</h4><p>Add one of every standard workstation at the selected tier. Construction requirements are loaded from BitJita.</p></div>
                <small>{workstationPresets.length ? `${workstationPresets.length} tiers loaded` : "No presets loaded"}</small>
              </div>
              {workstationPresets.length ? <div className="craft-plan-preset-grid">
                {workstationPresets.map((preset: AnyRecord) => <button className="craft-plan-preset-tier" type="button" aria-label={`Add workstation targets for ${preset.label}`} disabled={busy} key={preset.key} onClick={() => void addWorkstationPreset(preset)}>{preset.label}</button>)}
              </div> : <div className="craft-plan-preset-empty"><strong>No workstation presets loaded</strong><span>BitJita did not return compatible workstation definitions.</span></div>}
            </section>
            <label className="field craft-plan-target-search"><span>Add target manually</span><div className="search"><Search size={16} /><input value={query} role="combobox" aria-autocomplete="list" aria-expanded={searchResults.length > 0} aria-controls="craft-plan-target-suggestions" aria-activedescendant={activeSearchResultIndex >= 0 ? `craft-plan-target-suggestion-${activeSearchResultIndex}` : undefined} autoComplete="off" onKeyDown={handleSearchResultKeyDown} onChange={(event) => { setQuery(event.target.value); setActiveSearchResultIndex(-1); }} placeholder="Search BitJita items" /></div><small role="status" aria-live="polite">{query.trim().length < 2 ? "Type at least two characters to search." : `${searchResults.length} results available.`}</small></label>
            {searchResults.length ? <div className="craft-plan-search-results" id="craft-plan-target-suggestions" role="listbox">{searchResults.map((item, index) => <button id={`craft-plan-target-suggestion-${index}`} role="option" aria-selected={activeSearchResultIndex === index} tabIndex={-1} className="toolbar-button" type="button" key={`${itemKind(item)}:${item.id}`} onMouseEnter={() => setActiveSearchResultIndex(index)} onClick={() => selectSearchResult(item)}><ItemIcon item={item} /> {item.name ?? item.id}</button>)}</div> : null}
            <div className="craft-plan-target-editor-list">
              {config.targets.length ? config.targets.map((target, index) => <div className="craft-plan-target-editor-row" key={itemKey(target)}>
                <ItemLabel item={target} />
                <div className="craft-plan-target-editor-actions">
                  <label className="field compact-field"><span>Quantity</span><input type="number" min={1} value={target.quantity ?? 1} onChange={(event) => setConfig((current) => ({ ...current, targets: current.targets.map((row, i) => i === index ? { ...row, quantity: Math.max(1, Math.ceil(Number(event.target.value) || 1)) } : row) }))} /></label>
                  <button className="toolbar-button danger" type="button" onClick={() => setConfig((current) => {
                    const targets = current.targets.filter((_, i) => i !== index);
                    if (itemKind(target) !== "building") return { ...current, targets };
                    const nextProgress = { ...current.buildingProgress };
                    delete nextProgress[itemKey(target)];
                    return { ...current, targets, buildingProgress: nextProgress };
                  })}><Trash2 size={14} /> Remove</button>
                </div>
              </div>) : <p className="legend">No targets configured yet.</p>}
            </div>
          </section> : null}

          {activeTab === "sources" ? <section className="craft-plan-manager-panel"><h3>Settlement storage</h3><p className="legend">Inventory cards show the largest visible item stacks from each BitJita storage container.</p><div className="craft-plan-source-grid">{storageSources.length ? storageSources.map((source: AnyRecord) => sourceCard(source, config.sourceRules.storageContainerIds.includes(String(source.sourceId)), (checked) => updateSource("storageContainerIds", String(source.sourceId), checked))) : <p className="legend">No settlement storage sources found.</p>}</div></section> : null}

          {activeTab === "players" ? <section className="craft-plan-manager-panel"><h3>Players & deployables</h3><p className="legend">Choose which player inventories and active crafts count toward the plan, then include BitJita-visible carts, personal cache, and deployable storage.</p><div className="craft-plan-source-grid compact">{playerSources.length ? playerSources.map((source: AnyRecord) => playerSourceCard(source, config.sourceRules.playerIds.includes(String(source.playerId)), config.sourceRules.craftPlayerIds.includes(String(source.playerId)), (checked) => updateSource("playerIds", String(source.playerId), checked), (checked) => updateSource("craftPlayerIds", String(source.playerId), checked))) : <p className="legend">No settlement players found.</p>}</div><h4>Deployables</h4>{deployableGroups.length ? <div className="craft-plan-deployable-groups">{deployableGroups.map((group) => <section className="craft-plan-deployable-group" key={group.playerId}><header><strong>{group.playerName}</strong><small>{formatNumber(group.sources.length, 0)} deployables</small></header><div className="craft-plan-source-grid compact">{group.sources.map((source: AnyRecord) => sourceCard({ ...source, label: String(source.label ?? source.containerKind ?? "Deployable storage") }, config.sourceRules.deployableContainerIds.includes(String(source.sourceId)), (checked) => updateSource("deployableContainerIds", String(source.sourceId), checked)))}</div></section>)}</div> : <p className="legend">No deployables discovered for the selected players yet.</p>}</section> : null}

          {activeTab === "routes" ? <section className="craft-plan-manager-panel"><div className="split-header"><div><h3>Recipe routes in use</h3><p className="legend">These are the recipes currently pulled into the plan from your targets. Change a dropdown, then save the plan to recalculate needed materials.</p></div><small>{routeSteps.length ? `${routeSteps.length} recipe steps` : "No recipe steps"}</small></div>{routeSteps.length ? <div className="craft-plan-route-overview-list">{routeSteps.map((step: AnyRecord, index: number) => { const outputKey = routeOutputKey(step); const alternatives = Array.isArray(step.alternatives) ? step.alternatives : []; const selectedRecipeId = String(config.routeOverrides[outputKey] ?? step.selectedRecipeId ?? ""); return <article className="craft-plan-route-overview-card" key={`${outputKey}:${step.id ?? index}`}><div><strong><ItemLabel item={step.output ?? step} /></strong><small>{step.recipeName ?? "Selected recipe"}{step.buildingName ? ` - ${step.buildingName}` : ""}</small></div><label className="field compact-field"><span>Recipe</span><select value={selectedRecipeId} disabled={alternatives.length <= 1} onChange={(event) => setConfig((current) => ({ ...current, routeOverrides: { ...current.routeOverrides, [outputKey]: event.target.value } }))}>{alternatives.length ? alternatives.map((recipe: AnyRecord) => <option value={recipe.id} key={recipe.id}>{routeOptionLabel(recipe)}</option>) : <option value={selectedRecipeId}>{step.recipeName ?? "Default recipe"}</option>}</select></label>{config.routeOverrides[outputKey] ? <button className="toolbar-button danger" type="button" onClick={() => setConfig((current) => { const next = { ...current.routeOverrides }; delete next[outputKey]; return { ...current, routeOverrides: next }; })}><Trash2 size={14} /> Reset</button> : <span className="legend">Default</span>}</article>; })}</div> : <p className="legend">Add targets and save the plan to see the recipe chain used for the current goals.</p>}</section> : null}

          {activeTab === "buffers" ? <section className="craft-plan-manager-panel"><h3>Chance-drop safety buffers</h3><p className="legend">Add or edit a buffer from an item’s “How to get this” panel. Buffers increase planned gathering only; they do not change API drop rates or counted stock.</p>{Object.entries(config.multipliers).length ? Object.entries(config.multipliers).map(([key, value]) => { const item = [...config.targets, ...(Array.isArray(state?.plan?.materials) ? state.plan.materials : [])].find((candidate) => itemKey(candidate) === key); return <div className="admin-craft-plan-row" key={key}><strong>{item?.name ?? key}</strong><span>{formatNumber((value.multiplier - 1) * 100, 1)}% extra{value.note ? ` - ${value.note}` : ""}</span><button className="toolbar-button danger" type="button" onClick={() => setConfig((current) => { const next = { ...current.multipliers }; delete next[key]; return { ...current, multipliers: next }; })}><Trash2 size={14} /> Remove</button></div>; }) : <p className="legend">No chance-drop safety buffers are configured.</p>}</section> : null}
        </div>
    </Dialog>
  );
}
