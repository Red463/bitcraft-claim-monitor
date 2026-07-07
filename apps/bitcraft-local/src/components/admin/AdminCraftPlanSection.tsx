import React from "react";
import { ClipboardList, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";

import { ItemIcon, ItemLabel } from "../main/ItemDisplay";
import type { AnyRecord } from "../../main-app-data";
import { formatNumber } from "../../utils/format";

const BITJITA_API = "/api/bitjita";

type AdminApi = (path: string, options?: RequestInit) => Promise<AnyRecord>;
type RunTask = (task: () => Promise<unknown>, success?: string, busyKey?: string) => Promise<void>;

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
  return String(item.itemType ?? item.item_type) === "1" ? "cargo" : "items";
}

function targetFromMarketItem(item: AnyRecord): AnyRecord {
  return {
    id: String(item.id),
    kind: itemKind(item),
    itemType: itemKind(item) === "cargo" ? 1 : 0,
    name: String(item.name ?? `Item #${item.id}`),
    quantity: 1,
    tier: item.tier ?? null,
    rarityStr: item.rarityStr ?? item.rarity ?? null,
    tag: item.tag ?? null,
    iconAssetName: item.iconAssetName ?? null,
  };
}

function itemKey(item: AnyRecord) {
  return `${item.kind === "cargo" ? "cargo" : "items"}:${item.id}`;
}

export function AdminCraftPlanSection({ api, run, isBusy }: { api: AdminApi; run: RunTask; isBusy: (key: string) => boolean }) {
  const [state, setState] = React.useState<AnyRecord | null>(null);
  const [config, setConfig] = React.useState<CraftPlanConfig>(emptyConfig());
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<AnyRecord[]>([]);
  const [multiplierDraft, setMultiplierDraft] = React.useState({ key: "", multiplier: "1.5", note: "" });
  const [routeDraft, setRouteDraft] = React.useState({ key: "", recipeId: "" });

  async function refresh() {
    const result = await api("/admin/craft-plan");
    setState(result);
    setConfig({ ...emptyConfig(), ...(result.config ?? {}), sourceRules: { ...emptyConfig().sourceRules, ...(result.config?.sourceRules ?? {}) } });
  }

  React.useEffect(() => { void refresh().catch(() => undefined); }, []);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`${BITJITA_API}/market?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [], cargos: [] })
        .then((body) => setSearchResults([...(body.items ?? []), ...(body.cargos ?? [])].slice(0, 12)))
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

  function addTarget(item: AnyRecord) {
    const target = targetFromMarketItem(item);
    setConfig((current) => current.targets.some((row) => itemKey(row) === itemKey(target)) ? current : { ...current, targets: [...current.targets, target] });
    setQuery("");
    setSearchResults([]);
  }

  function updateTarget(index: number, quantity: number) {
    setConfig((current) => ({ ...current, targets: current.targets.map((target, i) => i === index ? { ...target, quantity: Math.max(1, Math.ceil(quantity || 1)) } : target) }));
  }

  function removeTarget(index: number) {
    setConfig((current) => ({ ...current, targets: current.targets.filter((_, i) => i !== index) }));
  }

  function addMultiplier() {
    const key = multiplierDraft.key.trim();
    const multiplier = Math.max(1, Number(multiplierDraft.multiplier) || 1);
    if (!key || multiplier <= 1) return;
    setConfig((current) => ({ ...current, multipliers: { ...current.multipliers, [key]: { multiplier, note: multiplierDraft.note.trim() } } }));
    setMultiplierDraft({ key: "", multiplier: "1.5", note: "" });
  }

  function addRouteOverride() {
    const key = routeDraft.key.trim();
    const recipeId = routeDraft.recipeId.trim();
    if (!key || !recipeId) return;
    setConfig((current) => ({ ...current, routeOverrides: { ...current.routeOverrides, [key]: recipeId } }));
    setRouteDraft({ key: "", recipeId: "" });
  }

  const storageSources = state?.sources?.storage ?? [];
  const playerSources = state?.sources?.players ?? [];
  const deployableSources = state?.sources?.deployables ?? [];

  return (
    <section className="form-card nested-card admin-craft-plan-card">
      <div className="split-header">
        <div>
          <h3><ClipboardList size={17} /> Craft Planning</h3>
          <p className="legend">Configure the read-only Craft Planning board: targets, counted stock sources, recipe route overrides, and chance/drop multipliers.</p>
        </div>
        <div className="toolbar-row">
          <button className="toolbar-button" type="button" onClick={() => run(refresh, undefined, "craft-plan-refresh")}><RefreshCw size={14} /> Refresh</button>
          <button className="toolbar-button primary" type="button" disabled={isBusy("craft-plan-save")} onClick={() => run(async () => { const result = await api("/admin/craft-plan", { method: "PUT", body: JSON.stringify(config) }); setState(result); setConfig({ ...emptyConfig(), ...(result.config ?? {}), sourceRules: { ...emptyConfig().sourceRules, ...(result.config?.sourceRules ?? {}) } }); }, "Craft plan saved.", "craft-plan-save")}><Save size={14} /> Save Plan</button>
        </div>
      </div>

      <div className="admin-craft-plan-grid">
        <label className="toggle-line"><input type="checkbox" checked={config.enabled !== false} onChange={(event) => patchConfig({ enabled: event.target.checked })} /><span><strong>Enable craft planning board</strong><small>Disabled plans show an empty public board.</small></span></label>
        <label className="field"><span>Plan name</span><input value={config.name} onChange={(event) => patchConfig({ name: event.target.value })} /></label>
      </div>

      <div className="form-card nested-card">
        <h3><Plus size={16} /> Target items</h3>
        <label className="field"><span>Add target</span><div className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search BitJita items" /></div></label>
        {searchResults.length ? <div className="admin-craft-plan-search-results">{searchResults.map((item) => <button className="toolbar-button" type="button" key={`${itemKind(item)}:${item.id}`} onClick={() => addTarget(item)}><ItemIcon item={item} /> {item.name ?? item.id}</button>)}</div> : null}
        <div className="admin-craft-plan-list">
          {config.targets.length ? config.targets.map((target, index) => (
            <div className="admin-craft-plan-row" key={itemKey(target)}>
              <span className="craft-plan-item-label"><span className="craft-plan-item-icon"><ItemIcon item={target} /></span><ItemLabel item={target} /></span>
              <label className="field compact-field"><span>Quantity</span><input type="number" min={1} value={target.quantity ?? 1} onChange={(event) => updateTarget(index, Number(event.target.value))} /></label>
              <button className="toolbar-button danger" type="button" onClick={() => removeTarget(index)}><Trash2 size={14} /> Remove</button>
            </div>
          )) : <p className="legend">No targets configured yet.</p>}
        </div>
      </div>

      <div className="admin-craft-plan-grid">
        <div className="form-card nested-card"><h3>Storage sources</h3><div className="admin-craft-plan-source-list">{storageSources.length ? storageSources.map((source: AnyRecord) => <label className="toggle-line" key={source.sourceId}><input type="checkbox" checked={config.sourceRules.storageContainerIds.includes(String(source.sourceId))} onChange={(event) => updateSource("storageContainerIds", String(source.sourceId), event.target.checked)} /><span><strong>{source.label}</strong><small>{formatNumber(source.itemCount ?? 0)} item stacks</small></span></label>) : <p className="legend">No settlement storage sources found.</p>}</div></div>
        <div className="form-card nested-card"><h3>Player inventories</h3><div className="admin-craft-plan-source-list">{playerSources.length ? playerSources.map((source: AnyRecord) => <label className="toggle-line" key={source.sourceId}><input type="checkbox" checked={config.sourceRules.playerIds.includes(String(source.sourceId))} onChange={(event) => updateSource("playerIds", String(source.sourceId), event.target.checked)} /><span><strong>{source.label}</strong><small>Count public player inventory where BitJita exposes it.</small></span></label>) : <p className="legend">No settlement players found.</p>}</div></div>
        <div className="form-card nested-card"><h3>Player deployables</h3><div className="admin-craft-plan-source-list">{deployableSources.length ? deployableSources.map((source: AnyRecord) => <label className="toggle-line" key={source.sourceId}><input type="checkbox" checked={config.sourceRules.deployableContainerIds.includes(String(source.sourceId))} onChange={(event) => updateSource("deployableContainerIds", String(source.sourceId), event.target.checked)} /><span><strong>{source.label}</strong><small>{source.ownerName ? `${source.ownerName} - ` : ""}{formatNumber(source.itemCount ?? 0)} item stacks</small></span></label>) : <p className="legend">Select players and refresh to discover BitJita-visible carts, stash, and deployable storage.</p>}</div></div>
      </div>

      <div className="form-card nested-card">
        <h3>Chance and drop multipliers</h3>
        <p className="legend">Use item keys such as <code>items:106000</code>. Multipliers overestimate uncertain drops after recipe expansion.</p>
        <div className="admin-craft-plan-multiplier-row">
          <label className="field compact-field"><span>Item key</span><input value={multiplierDraft.key} onChange={(event) => setMultiplierDraft((current) => ({ ...current, key: event.target.value }))} placeholder="items:..." /></label>
          <label className="field compact-field"><span>Multiplier</span><input type="number" min={1} max={20} step={0.1} value={multiplierDraft.multiplier} onChange={(event) => setMultiplierDraft((current) => ({ ...current, multiplier: event.target.value }))} /></label>
          <label className="field compact-field"><span>Note</span><input value={multiplierDraft.note} onChange={(event) => setMultiplierDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Chance drop buffer" /></label>
          <button className="toolbar-button" type="button" onClick={addMultiplier}><Plus size={14} /> Add</button>
        </div>
        {Object.entries(config.multipliers).map(([key, value]) => <div className="admin-craft-plan-row" key={key}><strong>{key}</strong><span>x{value.multiplier} {value.note ? `- ${value.note}` : ""}</span><button className="toolbar-button danger" type="button" onClick={() => setConfig((current) => { const next = { ...current.multipliers }; delete next[key]; return { ...current, multipliers: next }; })}><Trash2 size={14} /> Remove</button></div>)}
      </div>

      <div className="form-card nested-card">
        <h3>Recipe route overrides</h3>
        <p className="legend">Advanced v1 control for alternate routes. Enter an output item key and selected recipe id; the public board shows selected routes where alternatives exist.</p>
        <div className="admin-craft-plan-multiplier-row">
          <label className="field compact-field"><span>Output key</span><input value={routeDraft.key} onChange={(event) => setRouteDraft((current) => ({ ...current, key: event.target.value }))} placeholder="items:..." /></label>
          <label className="field compact-field"><span>Recipe id</span><input value={routeDraft.recipeId} onChange={(event) => setRouteDraft((current) => ({ ...current, recipeId: event.target.value }))} /></label>
          <span />
          <button className="toolbar-button" type="button" onClick={addRouteOverride}><Plus size={14} /> Add</button>
        </div>
        {Object.entries(config.routeOverrides).map(([key, recipeId]) => <div className="admin-craft-plan-row" key={key}><strong>{key}</strong><span>{recipeId}</span><button className="toolbar-button danger" type="button" onClick={() => setConfig((current) => { const next = { ...current.routeOverrides }; delete next[key]; return { ...current, routeOverrides: next }; })}><Trash2 size={14} /> Remove</button></div>)}
      </div>
    </section>
  );
}
