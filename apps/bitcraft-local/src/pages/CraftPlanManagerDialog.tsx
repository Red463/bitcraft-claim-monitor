import React from "react";
import { ClipboardList, Package, Plus, RefreshCw, Route, Save, Search, SlidersHorizontal, Target, Trash2, X, Zap } from "lucide-react";

import { ItemIcon, ItemLabel } from "../components/main/ItemDisplay";
import type { AnyRecord } from "../main-app-data";
import { formatNumber } from "../utils/format";

const LOCAL_API = "/api/local";
const BITJITA_API = "/api/bitjita";
const TABS = ["targets", "sources", "players", "routes", "buffers"] as const;
type ManagerTab = typeof TABS[number];

type CraftPlanConfig = {
  enabled: boolean;
  name: string;
  targets: AnyRecord[];
  sourceRules: { storageContainerIds: string[]; playerIds: string[]; deployableContainerIds: string[] };
  routeOverrides: Record<string, string>;
  multipliers: Record<string, { multiplier: number; note?: string }>;
};

function emptyConfig(): CraftPlanConfig {
  return { enabled: true, name: "Settlement craft plan", targets: [], sourceRules: { storageContainerIds: [], playerIds: [], deployableContainerIds: [] }, routeOverrides: {}, multipliers: {} };
}

function itemKind(item: AnyRecord) {
  return String(item.kind ?? (String(item.itemType ?? item.item_type) === "1" ? "cargo" : "items")) === "cargo" ? "cargo" : "items";
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

function itemPreview(items: AnyRecord[] = []) {
  const top = items.slice().sort((a, b) => Number(b.quantity ?? 0) - Number(a.quantity ?? 0)).slice(0, 10);
  return top.length ? (
    <div className="craft-plan-source-items">
      {top.map((item) => <span key={`${itemKey(item)}:${item.quantity}`}><ItemLabel item={item} /><strong>{formatNumber(Number(item.quantity) || 0, 0)}</strong></span>)}
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
function presetSummary(preset: AnyRecord) {
  const items = Array.isArray(preset.items) ? preset.items : [];
  if (!items.length) return "No materials";
  return items.map((item) => `${formatNumber(Number(item.quantity) || 0, 0)} ${String(item.name ?? item.id ?? "item")}`).join(", ");
}
export function CraftPlanManagerDialog({ open, onClose, csrfToken, onSaved }: { open: boolean; onClose: () => void; csrfToken: string; onSaved: () => void }) {
  const [state, setState] = React.useState<AnyRecord | null>(null);
  const [config, setConfig] = React.useState<CraftPlanConfig>(emptyConfig());
  const [activeTab, setActiveTab] = React.useState<ManagerTab>("targets");
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<AnyRecord[]>([]);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [multiplierDraft, setMultiplierDraft] = React.useState({ key: "", multiplier: "1.5", note: "" });
  const [routeDraft, setRouteDraft] = React.useState({ key: "", recipeId: "" });

  async function adminApi(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("content-type", "application/json");
    if (options.method && options.method !== "GET") headers.set("x-csrf-token", csrfToken);
    const response = await fetch(`${LOCAL_API}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body;
  }

  const load = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi("/admin/craft-plan");
      setState(result);
      setConfig({ ...emptyConfig(), ...(result.config ?? {}), sourceRules: { ...emptyConfig().sourceRules, ...(result.config?.sourceRules ?? {}) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [csrfToken]);

  React.useEffect(() => { if (open) void load(); }, [open, load]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setSearchResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`${BITJITA_API}/market?search=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [], cargos: [] })
        .then((body) => setSearchResults([...(body.items ?? []), ...(body.cargos ?? [])].slice(0, 16)))
        .catch(() => setSearchResults([]));
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  function patchConfig(patch: Partial<CraftPlanConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function updateSource(kind: "storageContainerIds" | "playerIds" | "deployableContainerIds", id: string, checked: boolean) {
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

  async function save() {
    setBusy(true);
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
    }
  }

  if (!open) return null;

  const storageSources = state?.sources?.storage ?? [];
  const playerSources = state?.sources?.players ?? [];
  const deployableSources = state?.sources?.deployables ?? [];
  const deployableGroups = groupDeployablesByPlayer(deployableSources);
  const tierPresets = state?.sources?.tierPresets ?? [];

  return (
    <div className="modal-backdrop craft-plan-manager-backdrop" role="presentation">
      <section className="modal craft-plan-manager" role="dialog" aria-modal="true" aria-label="Craft plan manager">
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
            <button className="toolbar-button" type="button" onClick={load} disabled={busy}><RefreshCw size={14} /> Refresh</button>
            <button className="toolbar-button primary" type="button" onClick={save} disabled={busy}><Save size={14} /> Save Plan</button>
          </div>
        </div>
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
        <div className="craft-plan-manager-body">
          {activeTab === "targets" ? <section className="craft-plan-manager-panel">
            <div className="split-header"><div><h3>Target items</h3><p className="legend">Preset buttons add normal target rows. You can change quantities or remove them at any time.</p></div></div>
            <section className="craft-plan-tier-presets" aria-label="Tier upgrade presets">
              <div className="craft-plan-tier-presets-header">
                <div><h4><Zap size={16} /> Tier upgrade presets</h4><p>Loaded from BitJita claim research. Click a tier to add its upgrade materials to the plan.</p></div>
                <small>{tierPresets.length ? `${tierPresets.length} presets loaded` : "No presets loaded"}</small>
              </div>
              {tierPresets.length ? <div className="craft-plan-preset-grid">
                {tierPresets.map((preset: AnyRecord) => <button className="craft-plan-preset-card" type="button" key={preset.key} onClick={() => addTargets((preset.items ?? []).map((item: AnyRecord) => withQuantity(item, Number(item.quantity) || 1)), `Added ${preset.label} requirements.`)}><strong>{preset.label}</strong><span>{presetSummary(preset)}</span></button>)}
              </div> : <div className="craft-plan-preset-empty"><strong>No tier presets loaded</strong><span>BitJita did not return tier upgrade research materials for this settlement.</span></div>}
            </section>
            <label className="field"><span>Add target manually</span><div className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search BitJita items" /></div></label>
            {searchResults.length ? <div className="craft-plan-search-results">{searchResults.map((item) => <button className="toolbar-button" type="button" key={`${itemKind(item)}:${item.id}`} onClick={() => { addTargets([withQuantity(item, 1)], `Added ${item.name ?? item.id}.`); setQuery(""); setSearchResults([]); }}><ItemIcon item={item} /> {item.name ?? item.id}</button>)}</div> : null}
            <div className="craft-plan-target-editor-list">
              {config.targets.length ? config.targets.map((target, index) => <div className="craft-plan-target-editor-row" key={itemKey(target)}><span className="craft-plan-item-label"><span className="craft-plan-item-icon"><ItemIcon item={target} /></span><ItemLabel item={target} /></span><label className="field compact-field"><span>Quantity</span><input type="number" min={1} value={target.quantity ?? 1} onChange={(event) => setConfig((current) => ({ ...current, targets: current.targets.map((row, i) => i === index ? { ...row, quantity: Math.max(1, Math.ceil(Number(event.target.value) || 1)) } : row) }))} /></label><button className="toolbar-button danger" type="button" onClick={() => setConfig((current) => ({ ...current, targets: current.targets.filter((_, i) => i !== index) }))}><Trash2 size={14} /> Remove</button></div>) : <p className="legend">No targets configured yet.</p>}
            </div>
          </section> : null}

          {activeTab === "sources" ? <section className="craft-plan-manager-panel"><h3>Settlement storage</h3><p className="legend">Inventory cards show the largest visible item stacks from each BitJita storage container.</p><div className="craft-plan-source-grid">{storageSources.length ? storageSources.map((source: AnyRecord) => sourceCard(source, config.sourceRules.storageContainerIds.includes(String(source.sourceId)), (checked) => updateSource("storageContainerIds", String(source.sourceId), checked))) : <p className="legend">No settlement storage sources found.</p>}</div></section> : null}

          {activeTab === "players" ? <section className="craft-plan-manager-panel"><h3>Players & deployables</h3><p className="legend">Select players first, refresh, then include BitJita-visible carts, personal cache, and deployable storage.</p><div className="craft-plan-source-grid compact">{playerSources.length ? playerSources.map((source: AnyRecord) => sourceCard({ sourceId: source.playerId, label: source.label, type: "Player inventory", items: [] }, config.sourceRules.playerIds.includes(String(source.playerId)), (checked) => updateSource("playerIds", String(source.playerId), checked))) : <p className="legend">No settlement players found.</p>}</div><h4>Deployables</h4>{deployableGroups.length ? <div className="craft-plan-deployable-groups">{deployableGroups.map((group) => <section className="craft-plan-deployable-group" key={group.playerId}><header><strong>{group.playerName}</strong><small>{formatNumber(group.sources.length, 0)} deployables</small></header><div className="craft-plan-source-grid compact">{group.sources.map((source: AnyRecord) => sourceCard({ ...source, label: String(source.label ?? source.containerKind ?? "Deployable storage") }, config.sourceRules.deployableContainerIds.includes(String(source.sourceId)), (checked) => updateSource("deployableContainerIds", String(source.sourceId), checked)))}</div></section>)}</div> : <p className="legend">No deployables discovered for the selected players yet.</p>}</section> : null}

          {activeTab === "routes" ? <section className="craft-plan-manager-panel"><h3>Recipe route overrides</h3><p className="legend">Advanced override path. Enter an output item key such as <code>items:123</code> and the selected recipe id.</p><div className="admin-craft-plan-multiplier-row"><label className="field compact-field"><span>Output key</span><input value={routeDraft.key} onChange={(event) => setRouteDraft((current) => ({ ...current, key: event.target.value }))} placeholder="items:..." /></label><label className="field compact-field"><span>Recipe id</span><input value={routeDraft.recipeId} onChange={(event) => setRouteDraft((current) => ({ ...current, recipeId: event.target.value }))} /></label><span /><button className="toolbar-button" type="button" onClick={() => { const key = routeDraft.key.trim(); const recipeId = routeDraft.recipeId.trim(); if (!key || !recipeId) return; setConfig((current) => ({ ...current, routeOverrides: { ...current.routeOverrides, [key]: recipeId } })); setRouteDraft({ key: "", recipeId: "" }); }}><Plus size={14} /> Add</button></div>{Object.entries(config.routeOverrides).map(([key, recipeId]) => <div className="admin-craft-plan-row" key={key}><strong>{key}</strong><span>{recipeId}</span><button className="toolbar-button danger" type="button" onClick={() => setConfig((current) => { const next = { ...current.routeOverrides }; delete next[key]; return { ...current, routeOverrides: next }; })}><Trash2 size={14} /> Remove</button></div>)}</section> : null}

          {activeTab === "buffers" ? <section className="craft-plan-manager-panel"><h3>Chance and drop multipliers</h3><p className="legend">Use item keys such as <code>items:106000</code>. Multipliers overestimate uncertain drops after recipe expansion.</p><div className="admin-craft-plan-multiplier-row"><label className="field compact-field"><span>Item key</span><input value={multiplierDraft.key} onChange={(event) => setMultiplierDraft((current) => ({ ...current, key: event.target.value }))} placeholder="items:..." /></label><label className="field compact-field"><span>Multiplier</span><input type="number" min={1} max={20} step={0.1} value={multiplierDraft.multiplier} onChange={(event) => setMultiplierDraft((current) => ({ ...current, multiplier: event.target.value }))} /></label><label className="field compact-field"><span>Note</span><input value={multiplierDraft.note} onChange={(event) => setMultiplierDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Chance drop buffer" /></label><button className="toolbar-button" type="button" onClick={() => { const key = multiplierDraft.key.trim(); const multiplier = Math.max(1, Number(multiplierDraft.multiplier) || 1); if (!key || multiplier <= 1) return; setConfig((current) => ({ ...current, multipliers: { ...current.multipliers, [key]: { multiplier, note: multiplierDraft.note.trim() } } })); setMultiplierDraft({ key: "", multiplier: "1.5", note: "" }); }}><Plus size={14} /> Add</button></div>{Object.entries(config.multipliers).map(([key, value]) => <div className="admin-craft-plan-row" key={key}><strong>{key}</strong><span>x{value.multiplier} {value.note ? `- ${value.note}` : ""}</span><button className="toolbar-button danger" type="button" onClick={() => setConfig((current) => { const next = { ...current.multipliers }; delete next[key]; return { ...current, multipliers: next }; })}><Trash2 size={14} /> Remove</button></div>)}</section> : null}
        </div>
      </section>
    </div>
  );
}
