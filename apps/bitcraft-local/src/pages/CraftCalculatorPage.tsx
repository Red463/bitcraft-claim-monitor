import React from "react";
import { Calculator, CheckCircle2, ClipboardList, Factory, Package, Search, Workflow } from "lucide-react";

import { toNumber, type AnyRecord } from "../main-app-data";
import { RarityBadge, TierBadge } from "../components/main/Badges";
import { ItemIcon } from "../components/main/ItemDisplay";
import { MiniStat } from "../components/main/Stats";
import { formatNumber } from "../utils/format";
import { itemTypeFromKind, recipeId, recipeKey, recipeKindFromType, buildRecipePlan, detailTarget, recipesForTarget, selectedRecipeForTarget, type RecipeDetail, type RecipeMaterial, type RecipeSelections, type RecipeTarget } from "../utils/recipeTree";

const API = "/api/bitjita";
const LOCAL_API = "/api/local";
const RECIPE_DETAIL_CACHE_MS = 30 * 60 * 1000;
const recipeDetailCache = new Map<string, { expiresAt: number; detail: RecipeDetail }>();

type CalculatorState = {
  loading: boolean;
  error: string | null;
  plan: ReturnType<typeof buildRecipePlan> | null;
  details: Map<string, RecipeDetail>;
};

function catalogItemToTarget(item: AnyRecord): RecipeTarget {
  const kind = recipeKindFromType(item.itemType ?? item.item_type);
  return {
    id: String(item.id),
    kind,
    itemType: kind === "cargo" ? 1 : 0,
    name: String(item.name ?? "Unknown item"),
    tier: Number.isFinite(Number(item.tier)) ? Number(item.tier) : undefined,
    rarityStr: item.rarityStr == null ? undefined : String(item.rarityStr),
    tag: item.tag == null ? undefined : String(item.tag),
    iconAssetName: item.iconAssetName == null ? undefined : String(item.iconAssetName),
  };
}

async function fetchRecipeDetail(target: RecipeTarget, signal: AbortSignal): Promise<RecipeDetail> {
  const cacheKey = recipeKey(target.kind, target.id);
  const cached = recipeDetailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.detail;
  const params = new URLSearchParams({
    kind: target.kind,
    id: String(target.id),
    name: target.name,
    itemType: String(target.itemType),
  });
  if (target.tier != null) params.set("tier", String(target.tier));
  if (target.rarityStr) params.set("rarity", target.rarityStr);
  if (target.tag) params.set("tag", target.tag);
  if (target.iconAssetName) params.set("iconAssetName", target.iconAssetName);
  const response = await fetch(`${LOCAL_API}/recipe-detail?${params.toString()}`, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${target.name}: ${body.error ?? `HTTP ${response.status}`}`);
  const detail = body.detail ?? body;
  recipeDetailCache.set(cacheKey, { detail, expiresAt: Date.now() + RECIPE_DETAIL_CACHE_MS });
  return detail;
}

function isPackageRecipe(recipe: AnyRecord) {
  return /package|unpack/i.test(String(recipe.name ?? ""));
}

function recipeHasProductionRoute(detail: RecipeDetail, target: RecipeTarget) {
  const recipes = recipesForTarget(detail, target);
  return recipes.some((recipe) => !isPackageRecipe(recipe));
}

async function findOutputAliasDetail(target: RecipeTarget, signal: AbortSignal): Promise<RecipeDetail | null> {
  if (/ output$/i.test(target.name)) return null;
  const response = await fetch(`${API}/market?q=${encodeURIComponent(`${target.name} Output`)}`, { signal });
  if (!response.ok) return null;
  const payload = await response.json();
  const items: AnyRecord[] = payload.data?.items ?? [];
  const alias = items.find((item) =>
    String(item.name ?? "").toLowerCase() === `${target.name} output`.toLowerCase()
    && recipeKindFromType(item.itemType ?? item.item_type) === "items",
  );
  if (!alias) return null;
  return fetchRecipeDetail({ ...catalogItemToTarget(alias), kind: "items", itemType: 0 }, signal);
}

async function augmentDetailWithOutputAlias(detail: RecipeDetail, target: RecipeTarget, signal: AbortSignal): Promise<RecipeDetail> {
  if (recipeHasProductionRoute(detail, target)) return detail;
  const aliasDetail = await findOutputAliasDetail(target, signal).catch((error) => {
    if (signal.aborted) throw error;
    return null;
  });
  if (!aliasDetail) return detail;
  const possibilities: AnyRecord[] = Array.isArray(aliasDetail.itemListPossibilities) ? aliasDetail.itemListPossibilities : [];
  const matchingPossibilities = possibilities.filter((possibility) =>
    String(possibility.targetId ?? possibility.targetItem?.id ?? "") === String(target.id)
    && recipeKindFromType(possibility.isCargo ? "cargo" : "items") === target.kind,
  );
  if (!matchingPossibilities.length) return detail;
  const outputQuantity = Math.max(1, ...matchingPossibilities.map((possibility) => toNumber(possibility.quantity)));
  const aliasRecipes = [...(aliasDetail.craftingRecipes ?? []), ...(aliasDetail.extractionRecipes ?? [])].map((recipe: AnyRecord) => ({
    ...recipe,
    id: `alias:${target.kind}:${target.id}:${recipe.id ?? aliasDetail.item?.id ?? target.name}`,
    name: `${recipe.name ?? aliasDetail.item?.name ?? target.name} (${target.name})`,
    craftedItemStacks: [{ item_id: target.id, item_type: target.kind === "cargo" ? "cargo" : "item", quantity: outputQuantity }],
    craftedItems: [{ id: target.id, itemType: itemTypeFromKind(target.kind), name: target.name, iconAssetName: target.iconAssetName, tier: target.tier, rarityStr: target.rarityStr }],
    outputQuantity,
    outputAliasName: aliasDetail.item?.name,
    extraOutputs: possibilities.filter((possibility) => String(possibility.targetId ?? possibility.targetItem?.id ?? "") !== String(target.id)),
  }));
  return {
    ...detail,
    craftingRecipes: [...(detail.craftingRecipes ?? []), ...aliasRecipes],
  };
}

async function collectRecipeDetails(target: RecipeTarget, signal: AbortSignal, selections: RecipeSelections, maxDepth = 14) {
  const details = new Map<string, RecipeDetail>();
  const pending = new Set<string>();

  async function visit(nextTarget: RecipeTarget, depth: number) {
    const key = recipeKey(nextTarget.kind, nextTarget.id);
    if (details.has(key) || pending.has(key) || depth > maxDepth) return;
    pending.add(key);
    let fetchedDetail: RecipeDetail;
    try {
      fetchedDetail = await fetchRecipeDetail(nextTarget, signal);
    } catch (error) {
      pending.delete(key);
      if (signal.aborted) throw error;
      if (depth === 0) throw error;
      return;
    }
    pending.delete(key);
    const normalizedTarget = { ...detailTarget(fetchedDetail), ...nextTarget };
    const detail = await augmentDetailWithOutputAlias(fetchedDetail, normalizedTarget, signal);
    details.set(key, detail);
    const recipe = selectedRecipeForTarget(detail, normalizedTarget, selections);
    if (!recipe) return;
    const inputStacks: AnyRecord[] = Array.isArray(recipe.consumedItemStacks) ? recipe.consumedItemStacks : [];
    const displays: AnyRecord[] = Array.isArray(recipe.consumedItems) ? recipe.consumedItems : [];
    for (let index = 0; index < inputStacks.length; index += 1) {
      const stack = inputStacks[index];
      const kind = recipeKindFromType(stack.item_type ?? stack.itemType);
      const display = displays[index] ?? {};
      await visit({
        id: String(stack.item_id ?? stack.itemId ?? stack.id),
        kind,
        itemType: kind === "cargo" ? 1 : 0,
        name: String(display.name ?? stack.name ?? "Unknown item"),
        tier: Number.isFinite(Number(display.tier ?? stack.tier)) ? Number(display.tier ?? stack.tier) : undefined,
        rarityStr: display.rarityStr == null ? undefined : String(display.rarityStr),
        tag: display.tag == null ? undefined : String(display.tag),
        iconAssetName: display.iconAssetName == null ? undefined : String(display.iconAssetName),
      }, depth + 1);
    }
  }

  await visit(target, 0);
  return details;
}

function MaterialRow({ material }: { material: RecipeMaterial }) {
  return (
    <div className="craftcalc-material-row">
      <ItemIcon item={material} />
      <div>
        <strong>{material.name}</strong>
        <span>{material.tag ?? (material.kind === "cargo" ? "Cargo" : "Item")}</span>
      </div>
      {material.tier ? <TierBadge tier={material.tier} /> : null}
      {material.rarityStr ? <RarityBadge rarity={material.rarityStr} /> : null}
      <b>{formatNumber(material.quantity)}</b>
    </div>
  );
}

export function CraftCalculatorPage() {
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedTarget, setSelectedTarget] = React.useState<RecipeTarget | null>(null);
  const [amount, setAmount] = React.useState(1);
  const [recipeSelections, setRecipeSelections] = React.useState<RecipeSelections>({});
  const [searchState, setSearchState] = React.useState<"idle" | "loading" | "error">("idle");
  const [state, setState] = React.useState<CalculatorState>({ loading: false, error: null, plan: null, details: new Map() });
  const recipeSelectionKey = JSON.stringify(recipeSelections);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedTarget?.name === query.trim()) {
      setSuggestions([]);
      setSearchState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      fetch(`${API}/market?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market search HTTP ${response.status}`)))
        .then((payload) => {
          const items: AnyRecord[] = payload.data?.items ?? [];
          setSuggestions(items.filter((item) => String(item.name ?? "").toLowerCase().includes(query.trim().toLowerCase())).slice(0, 10));
          setSearchState("idle");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setSearchState("error");
          }
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedTarget?.name]);

  React.useEffect(() => {
    if (!selectedTarget) {
      setState({ loading: false, error: null, plan: null, details: new Map() });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    collectRecipeDetails(selectedTarget, controller.signal, recipeSelections)
      .then((details) => setState({ loading: false, error: null, plan: buildRecipePlan(selectedTarget, amount, details, 14, recipeSelections), details }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ loading: false, error: error instanceof Error ? error.message : String(error), plan: null, details: new Map() });
      });
    return () => controller.abort();
  }, [amount, selectedTarget, recipeSelectionKey]);

  function chooseItem(item: AnyRecord) {
    const target = catalogItemToTarget(item);
    setSelectedTarget(target);
    setRecipeSelections({});
    setQuery(target.name);
    setSuggestions([]);
  }

  const recipeChoices = React.useMemo(() => {
    return [...state.details.entries()].map(([key, detail]) => {
      const target = detailTarget(detail);
      const recipes = recipesForTarget(detail, target);
      return { key, target, recipes };
    }).filter((choice) => choice.recipes.length > 1);
  }, [state.details]);

  const rawCount = state.plan?.rawMaterials.length ?? 0;
  const directCount = state.plan?.directMaterials.length ?? 0;
  const stepCount = state.plan?.steps.length ?? 0;

  return (
    <div className="panel craftcalc-page">
      <header className="members-topbar craftcalc-topbar">
        <div>
          <h2>Craft Calculator</h2>
          <p>Build a material tree and step plan from BitJita recipe data.</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Workflow size={14} /> {formatNumber(stepCount)} steps</span>
            <span>{formatNumber(directCount)} recipe materials</span>
            <span>{formatNumber(rawCount)} source materials</span>
          </div>
          {selectedTarget ? (
            <div className="dashboard-settlement-pill">
              {selectedTarget.tier ? <TierBadge tier={selectedTarget.tier} /> : null}
              <span>{selectedTarget.name}</span>
            </div>
          ) : null}
        </div>
      </header>

      <section className="production-command-panel craftcalc-controls">
        <div className="market-command-header">
          <span className="production-command-title"><Calculator size={15} /> Recipe lookup</span>
          <span>Item and cargo recipes are resolved recursively where BitJita exposes the chain.</span>
        </div>
        <div className="craftcalc-control-grid">
          <label className="research-filter-field">
            <span>Item or cargo</span>
            <div className="suggestion-anchor">
              <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedTarget(null); }} placeholder="Start typing an item name" />
              {suggestions.length ? <div className="suggestion-menu">{suggestions.map((item) => (
                <button key={`${item.itemType}-${item.id}`} type="button" onClick={() => chooseItem(item)}>
                  <ItemIcon item={item} />
                  <strong>{item.name}</strong>
                  {item.tier ? <TierBadge tier={item.tier} /> : null}
                  <small className="item-meta-line">{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}{item.tag ?? ""}</small>
                </button>
              ))}</div> : null}
            </div>
            {searchState === "loading" ? <small className="legend">Searching BitJita item catalogue...</small> : null}
            {searchState === "error" ? <small className="legend">Unable to search items right now.</small> : null}
          </label>
          <label className="research-filter-field">
            <span>Amount to make</span>
            <input type="number" min={1} step={1} value={amount} onChange={(event) => setAmount(Math.max(1, Math.floor(toNumber(event.target.value) || 1)))} />
          </label>
        </div>
      </section>

      {selectedTarget && recipeChoices.length ? (
        <section className="production-command-panel craftcalc-recipe-picker">
          <div className="market-command-header">
            <span className="production-command-title"><Workflow size={15} /> Recipe routes</span>
            <span>Choose which BitJita recipe to use when an item has multiple valid routes.</span>
          </div>
          <div className="craftcalc-recipe-grid">
            {recipeChoices.map(({ key, target, recipes }) => (
              <label className="research-filter-field" key={key}>
                <span>{target.name}</span>
                <select
                  value={recipeSelections[key] ?? recipeId(recipes[0])}
                  onChange={(event) => setRecipeSelections((current) => ({ ...current, [key]: event.target.value }))}
                >
                  {recipes.map((recipe, index) => {
                    const station = recipe.buildingName ? ` - ${recipe.buildingName}` : "";
                    const output = Array.isArray(recipe.craftedItemStacks) ? recipe.craftedItemStacks.find((stack: AnyRecord) => String(stack.item_id ?? stack.itemId ?? stack.id) === target.id) : null;
                    const outputQty = Number(output?.quantity ?? recipe.outputQuantity ?? 1) || 1;
                    return (
                      <option key={recipeId(recipe) || index} value={recipeId(recipe)}>
                        {recipe.name ?? target.name}{station} ({formatNumber(outputQty)} output)
                      </option>
                    );
                  })}
                </select>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {!selectedTarget ? <div className="empty-state craftcalc-empty"><Search />Choose an item or cargo to calculate its recipe chain.</div> : null}
      {selectedTarget && state.loading ? <div className="loading">Loading recipe chain for {selectedTarget.name}...</div> : null}
      {state.error ? <div className="error">Unable to build recipe plan: {state.error}</div> : null}

      {state.plan ? (
        <>
          <div className="summary-grid craftcalc-summary">
            <MiniStat icon={<Package />} label="Output" value={formatNumber(state.plan.target.quantity)} title={state.plan.target.name} />
            <MiniStat icon={<ClipboardList />} label="Recipe Materials" value={formatNumber(state.plan.directMaterials.length)} />
            <MiniStat icon={<ClipboardList />} label="Source Materials" value={formatNumber(state.plan.rawMaterials.length)} />
            <MiniStat icon={<Factory />} label="Crafting Steps" value={formatNumber(state.plan.steps.length)} />
          </div>
          <section className="craftcalc-section">
            <h3><Package size={16} /> Source materials</h3>
            <div className="craftcalc-material-grid">
              {state.plan.rawMaterials.map((material) => <MaterialRow key={`${material.kind}-${material.id}`} material={material} />)}
            </div>
          </section>
          <section className="craftcalc-section">
            <h3><ClipboardList size={16} /> Recipe materials</h3>
            <p className="legend">These are the direct inputs for the selected recipe before expanding the full material chain.</p>
            <div className="craftcalc-material-grid">
              {state.plan.directMaterials.length
                ? state.plan.directMaterials.map((material) => <MaterialRow key={`${material.kind}-${material.id}`} material={material} />)
                : <div className="empty-state">No direct recipe materials were exposed by BitJita for this item.</div>}
            </div>
          </section>
          <section className="craftcalc-section">
            <h3><Workflow size={16} /> Steps in order</h3>
            <div className="craftcalc-step-list">
              {state.plan.steps.map((step, index) => (
                <article className="craftcalc-step-card" key={step.id}>
                  <div className="craftcalc-step-index">{index + 1}</div>
                  <div className="craftcalc-step-main">
                    <div className="craftcalc-step-heading">
                      <ItemIcon item={step.output} />
                      <div>
                        <strong>{step.output.name}</strong>
                        <span>{step.buildingName ?? "Unknown station"}{step.buildingTier ? ` T${step.buildingTier}` : ""}{step.skillName ? ` - ${step.skillName}${step.skillLevel ? ` Lv ${step.skillLevel}` : ""}` : ""}</span>
                      </div>
                      {step.output.tier ? <TierBadge tier={step.output.tier} /> : null}
                    </div>
                    <p>{formatNumber(step.craftCount)} craft{step.craftCount === 1 ? "" : "s"} outputs {formatNumber(step.output.quantity)}. Recipe consumes:</p>
                    <div className="craftcalc-step-inputs">
                      {step.inputs.map((input) => <MaterialRow key={`${step.id}-${input.kind}-${input.id}`} material={input} />)}
                    </div>
                    {step.alternatives > 1 ? <small className="legend">{step.alternatives} possible recipes found; use Recipe routes above to choose another path.</small> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
      <p className="legend">Recipe data is provided by BitJita. If BitJita does not expose a recipe for an ingredient, this calculator treats that ingredient as a source material rather than guessing.</p>
    </div>
  );
}
