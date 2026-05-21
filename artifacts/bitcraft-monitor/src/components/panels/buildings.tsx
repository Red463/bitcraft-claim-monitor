import { useMemo, useState } from "react";
import { useGetClaimBuildings } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Hammer, Package, Bed, ShoppingBag, Wrench, Flame } from "lucide-react";

type Building = {
  entityId?: string | null;
  name?: string | null;
  nickname?: string | null;
  tier?: number | null;
  craftingSlots?: number | null;
  refiningSlots?: number | null;
  storageSlots?: number | null;
  cargoSlots?: number | null;
  housingSlots?: number | null;
  tradeOrders?: number | null;
  terraformCapable?: boolean | null;
  [key: string]: unknown;
};

function getCategory(b: Building): string {
  const name = (b.name ?? "").toLowerCase();
  if (b.storageSlots && b.storageSlots > 0) return "Storage";
  if (b.housingSlots && b.housingSlots > 0) return "Housing";
  if (b.tradeOrders && b.tradeOrders > 0) return "Trade";
  if (b.refiningSlots && b.refiningSlots > 0) return "Refining";
  if (b.craftingSlots && b.craftingSlots > 0) return "Crafting";
  if (name.includes("totem") || name.includes("settlement")) return "Core";
  if (name.includes("bonfire") || name.includes("fire")) return "Utility";
  if (name.includes("statue") || name.includes("shrine")) return "Decoration";
  return "Utility";
}

const CATEGORY_COLORS: Record<string, { dot: string; badge: string }> = {
  Crafting:   { dot: "bg-sky-500",    badge: "bg-sky-500/15 text-sky-400 border-sky-700/40" },
  Refining:   { dot: "bg-violet-500", badge: "bg-violet-500/15 text-violet-400 border-violet-700/40" },
  Storage:    { dot: "bg-emerald-500",badge: "bg-emerald-500/15 text-emerald-400 border-emerald-700/40" },
  Housing:    { dot: "bg-purple-500", badge: "bg-purple-500/15 text-purple-400 border-purple-700/40" },
  Trade:      { dot: "bg-orange-500", badge: "bg-orange-500/15 text-orange-400 border-orange-700/40" },
  Core:       { dot: "bg-amber-500",  badge: "bg-amber-500/15 text-amber-400 border-amber-700/40" },
  Utility:    { dot: "bg-slate-500",  badge: "bg-slate-500/15 text-slate-400 border-slate-700/40" },
  Decoration: { dot: "bg-pink-500",   badge: "bg-pink-500/15 text-pink-400 border-pink-700/40" },
};

const TIER_COLORS: Record<number, string> = {
  1: "text-slate-400 border-slate-500/50",
  2: "text-sky-400 border-sky-600/50",
  3: "text-emerald-400 border-emerald-600/50",
  4: "text-yellow-400 border-yellow-600/50",
  5: "text-amber-400 border-amber-500/70",
};

function SlotChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary/50 rounded px-1.5 py-0.5">
      <span className="opacity-60">{icon}</span>
      <span className="font-medium text-foreground/80">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function BuildingCard({ building }: { building: Building }) {
  const category = getCategory(building);
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Utility;
  const tierColor = building.tier ? (TIER_COLORS[building.tier] ?? "text-amber-400 border-amber-500/70") : null;
  const hasSlots =
    (building.craftingSlots ?? 0) > 0 ||
    (building.refiningSlots ?? 0) > 0 ||
    (building.storageSlots ?? 0) > 0 ||
    (building.housingSlots ?? 0) > 0 ||
    (building.tradeOrders ?? 0) > 0 ||
    (building.cargoSlots ?? 0) > 0;

  return (
    <div className="group relative flex flex-col gap-2 p-3 rounded-lg border border-border/60 bg-card hover:border-border hover:bg-secondary/20 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
          <p className="font-medium text-sm text-foreground leading-tight truncate" title={building.name ?? undefined}>
            {building.name ?? "Unknown"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {tierColor && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-bold ${tierColor}`}>
              T{building.tier}
            </Badge>
          )}
        </div>
      </div>

      {/* Nickname */}
      {building.nickname && (
        <p className="text-[10px] text-muted-foreground/60 italic -mt-1 pl-4 truncate">"{building.nickname}"</p>
      )}

      {/* Category */}
      <div className="flex flex-wrap gap-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors.badge}`}>
          {category}
        </span>
        {building.terraformCapable && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-700/40 bg-emerald-500/10 text-emerald-400 font-medium">
            Terraform
          </span>
        )}
      </div>

      {/* Slot chips */}
      {hasSlots && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          <SlotChip icon={<Hammer className="w-2.5 h-2.5" />} label="craft" value={building.craftingSlots ?? 0} />
          <SlotChip icon={<Flame className="w-2.5 h-2.5" />} label="refine" value={building.refiningSlots ?? 0} />
          <SlotChip icon={<Package className="w-2.5 h-2.5" />} label="store" value={building.storageSlots ?? 0} />
          <SlotChip icon={<Package className="w-2.5 h-2.5" />} label="cargo" value={building.cargoSlots ?? 0} />
          <SlotChip icon={<Bed className="w-2.5 h-2.5" />} label="house" value={building.housingSlots ?? 0} />
          <SlotChip icon={<ShoppingBag className="w-2.5 h-2.5" />} label="trade" value={building.tradeOrders ?? 0} />
        </div>
      )}
    </div>
  );
}

const ALL_CATEGORIES = ["All", "Crafting", "Refining", "Storage", "Housing", "Trade", "Core", "Utility", "Decoration"];
const ALL_TIERS = ["All", "1", "2", "3", "4", "5"];
const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "tier", label: "Tier" },
  { value: "crafting", label: "Crafting Slots" },
  { value: "storage", label: "Storage Slots" },
];

export function BuildingsPanel() {
  const { data: buildings, isLoading, error } = useGetClaimBuildings(CLAIM_ID);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterTier, setFilterTier] = useState("All");
  const [sort, setSort] = useState("name");

  const processed = useMemo<Building[]>(() => {
    if (!buildings) return [];
    return buildings as Building[];
  }, [buildings]);

  const filtered = useMemo(() => {
    let list = processed.filter(b => {
      if (search && !(b.name ?? "").toLowerCase().includes(search.toLowerCase()) && !(b.nickname ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory !== "All" && getCategory(b) !== filterCategory) return false;
      if (filterTier !== "All" && String(b.tier ?? "") !== filterTier) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "tier") return (b.tier ?? 0) - (a.tier ?? 0);
      if (sort === "crafting") return (b.craftingSlots ?? 0) - (a.craftingSlots ?? 0);
      if (sort === "storage") return (b.storageSlots ?? 0) - (a.storageSlots ?? 0);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return list;
  }, [processed, search, filterCategory, filterTier, sort]);

  const stats = useMemo(() => {
    if (!processed.length) return null;
    return {
      total: processed.length,
      totalCrafting: processed.reduce((s, b) => s + (b.craftingSlots ?? 0), 0),
      totalRefining: processed.reduce((s, b) => s + (b.refiningSlots ?? 0), 0),
      totalStorage: processed.reduce((s, b) => s + (b.storageSlots ?? 0), 0),
      totalHousing: processed.reduce((s, b) => s + (b.housingSlots ?? 0), 0),
      totalTrade: processed.reduce((s, b) => s + (b.tradeOrders ?? 0), 0),
      tiers: Array.from(new Set(processed.map(b => b.tier).filter(Boolean))).sort() as number[],
    };
  }, [processed]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (error || !buildings) {
    return <div className="p-6 text-destructive">Failed to load building data.</div>;
  }

  return (
    <div className="p-6 space-y-5" data-testid="buildings-panel">
      <SectionHeader
        title="Buildings & Stations"
        description={`${processed.length} structures — ${filtered.length} shown`}
      />

      {/* Summary bar */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: "Buildings", value: stats.total, icon: <Wrench className="w-3.5 h-3.5" /> },
            { label: "Crafting", value: stats.totalCrafting, icon: <Hammer className="w-3.5 h-3.5" /> },
            { label: "Refining", value: stats.totalRefining, icon: <Flame className="w-3.5 h-3.5" /> },
            { label: "Storage", value: stats.totalStorage, icon: <Package className="w-3.5 h-3.5" /> },
            { label: "Housing", value: stats.totalHousing, icon: <Bed className="w-3.5 h-3.5" /> },
            { label: "Trade", value: stats.totalTrade, icon: <ShoppingBag className="w-3.5 h-3.5" /> },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2.5 p-3 rounded-lg border border-border/60 bg-card">
              <span className="text-primary/60">{s.icon}</span>
              <div>
                <div className="text-lg font-serif font-bold text-foreground leading-none">{s.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search buildings…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-card border-border w-48"
            data-testid="building-search"
          />
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-1">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                filterCategory === cat
                  ? "bg-primary/20 text-primary border-primary/40 font-medium"
                  : "text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Tier filter */}
        <div className="flex items-center gap-1 ml-1">
          <span className="text-[10px] text-muted-foreground">Tier:</span>
          {ALL_TIERS.map(t => (
            <button
              key={t}
              onClick={() => setFilterTier(t)}
              className={`text-[10px] w-6 h-6 rounded border transition-all ${
                filterTier === t
                  ? "bg-primary/20 text-primary border-primary/40 font-bold"
                  : "text-muted-foreground border-border/40 hover:border-border"
              }`}
            >
              {t === "All" ? "∀" : t}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="ml-auto h-8 text-xs px-2 rounded border border-border bg-card text-foreground"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground border border-border rounded-lg bg-card">
          No buildings match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filtered.map((b, i) => (
            <BuildingCard key={b.entityId ?? i} building={b} />
          ))}
        </div>
      )}
    </div>
  );
}
