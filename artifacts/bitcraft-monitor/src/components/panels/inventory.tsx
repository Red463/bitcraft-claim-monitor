import { useState, useMemo } from "react";
import { useGetClaimInventories } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Package, Lock } from "lucide-react";

type InventoryItem = {
  name?: string | null;
  quantity?: number | null;
  volume?: number | null;
  tier?: number | null;
  rarity?: string | null;
  tag?: string | null;
  category?: string | null;
  isCargo?: boolean | null;
};

function getRarityColor(rarity: string | null | undefined) {
  switch ((rarity ?? "").toLowerCase()) {
    case "legendary": return "text-amber-400 border-amber-700/50";
    case "epic": return "text-purple-400 border-purple-700/50";
    case "rare": return "text-sky-400 border-sky-700/50";
    case "uncommon": return "text-emerald-400 border-emerald-700/50";
    default: return "text-muted-foreground border-border";
  }
}

function getTierLabel(tier: number | null | undefined) {
  if (!tier) return null;
  return `T${tier}`;
}

export function InventoryPanel() {
  const { data: inventories, isLoading, error } = useGetClaimInventories(CLAIM_ID);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "item" | "cargo">("all");
  const [filterRarity, setFilterRarity] = useState<string>("all");
  const [filterBuilding, setFilterBuilding] = useState<string>("all");

  const allItems = useMemo(() => {
    if (!inventories) return [];
    return inventories.flatMap(inv =>
      ((inv.items ?? []) as InventoryItem[]).map(item => ({
        ...item,
        buildingEntityId: inv.buildingEntityId,
        buildingName: inv.buildingName ?? "Unknown Building",
        locked: inv.locked ?? false,
      }))
    );
  }, [inventories]);

  const buildings = useMemo(() => {
    const names = new Set<string>();
    (inventories ?? []).forEach(inv => { if (inv.buildingName) names.add(inv.buildingName); });
    return Array.from(names);
  }, [inventories]);

  const tiers = useMemo(() => {
    const ts = new Set<number>();
    allItems.forEach(i => { if (i.tier) ts.add(i.tier); });
    return Array.from(ts).sort((a, b) => a - b);
  }, [allItems]);

  const rarities = useMemo(() => {
    const rs = new Set<string>();
    allItems.forEach(i => { if (i.rarity) rs.add(i.rarity); });
    return Array.from(rs);
  }, [allItems]);

  const filtered = useMemo(() => {
    return allItems.filter(item => {
      if (search && !(item.name ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTier !== "all" && String(item.tier) !== filterTier) return false;
      if (filterType === "item" && item.isCargo) return false;
      if (filterType === "cargo" && !item.isCargo) return false;
      if (filterRarity !== "all" && item.rarity !== filterRarity) return false;
      if (filterBuilding !== "all" && item.buildingName !== filterBuilding) return false;
      return true;
    });
  }, [allItems, search, filterTier, filterType, filterRarity, filterBuilding]);

  // Aggregate totals per item name
  const itemTotals = useMemo(() => {
    const totals: Record<string, { quantity: number; name: string; tier: number | null; rarity: string | null; isCargo: boolean }> = {};
    for (const item of filtered) {
      const key = item.name ?? "Unknown";
      if (!totals[key]) totals[key] = { quantity: 0, name: key, tier: item.tier ?? null, rarity: item.rarity ?? null, isCargo: item.isCargo ?? false };
      totals[key].quantity += item.quantity ?? 0;
    }
    return Object.values(totals).sort((a, b) => b.quantity - a.quantity);
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-destructive">Failed to load inventory data.</div>;
  }

  const totalVolume = filtered.reduce((s, i) => s + ((i.volume ?? 0) * (i.quantity ?? 0)), 0);
  const totalItems = filtered.reduce((s, i) => s + (i.quantity ?? 0), 0);

  return (
    <div className="p-6 space-y-6" data-testid="inventory-panel">
      <SectionHeader
        title="Inventory & Storage"
        description={`${(inventories ?? []).length} storage containers — ${allItems.length} item stacks`}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Items", value: totalItems.toLocaleString() },
          { label: "Unique Items", value: itemTotals.length.toLocaleString() },
          { label: "Total Volume", value: totalVolume.toFixed(1) },
          { label: "Buildings", value: (inventories ?? []).length },
        ].map(s => (
          <div key={s.label} className="p-4 border border-border rounded bg-card">
            <div className="text-xl font-serif font-bold text-primary">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border w-52"
            data-testid="inventory-search"
          />
        </div>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as "all" | "item" | "cargo")}
          className="h-9 px-3 rounded border border-border bg-card text-sm text-foreground"
          data-testid="filter-type"
        >
          <option value="all">All Types</option>
          <option value="item">Items Only</option>
          <option value="cargo">Cargo Only</option>
        </select>

        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          className="h-9 px-3 rounded border border-border bg-card text-sm text-foreground"
          data-testid="filter-tier"
        >
          <option value="all">All Tiers</option>
          {tiers.map(t => <option key={t} value={String(t)}>Tier {t}</option>)}
        </select>

        <select
          value={filterRarity}
          onChange={e => setFilterRarity(e.target.value)}
          className="h-9 px-3 rounded border border-border bg-card text-sm text-foreground"
          data-testid="filter-rarity"
        >
          <option value="all">All Rarities</option>
          {rarities.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          value={filterBuilding}
          onChange={e => setFilterBuilding(e.target.value)}
          className="h-9 px-3 rounded border border-border bg-card text-sm text-foreground"
          data-testid="filter-building"
        >
          <option value="all">All Buildings</option>
          {buildings.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <span className="text-xs text-muted-foreground">{itemTotals.length} unique items</span>
      </div>

      {/* Per-building breakdown */}
      <div className="space-y-4">
        {(inventories ?? [])
          .filter(inv => filterBuilding === "all" || inv.buildingName === filterBuilding)
          .map((inv, invIdx) => {
            const invItems = ((inv.items ?? []) as InventoryItem[]).filter(item => {
              if (search && !(item.name ?? "").toLowerCase().includes(search.toLowerCase())) return false;
              if (filterTier !== "all" && String(item.tier) !== filterTier) return false;
              if (filterType === "item" && item.isCargo) return false;
              if (filterType === "cargo" && !item.isCargo) return false;
              if (filterRarity !== "all" && item.rarity !== filterRarity) return false;
              return true;
            });
            if (!invItems.length) return null;

            return (
              <div key={inv.buildingEntityId ?? invIdx} className="border border-border rounded overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-secondary/30">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="font-serif text-primary text-sm">{inv.buildingName ?? "Unknown Building"}</span>
                    {inv.locked && <Lock className="w-3 h-3 text-amber-500" />}
                  </div>
                  <Badge variant="outline" className="text-xs">{invItems.length} stacks</Badge>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-card border-b border-border">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-muted-foreground">Item</th>
                      <th className="px-3 py-1.5 text-right text-muted-foreground">Qty</th>
                      <th className="px-3 py-1.5 text-right text-muted-foreground">Volume</th>
                      <th className="px-3 py-1.5 text-center text-muted-foreground">Tier</th>
                      <th className="px-3 py-1.5 text-center text-muted-foreground">Rarity</th>
                      <th className="px-3 py-1.5 text-center text-muted-foreground">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invItems.map((item, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-secondary/10">
                        <td className="px-3 py-1.5 font-medium text-foreground">{item.name ?? "—"}</td>
                        <td className={`px-3 py-1.5 text-right ${(item.quantity ?? 0) > 1000 ? "text-amber-400 font-semibold" : "text-foreground"}`}>
                          {(item.quantity ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">
                          {item.volume != null ? (item.volume * (item.quantity ?? 1)).toFixed(1) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {getTierLabel(item.tier) ? (
                            <Badge variant="outline" className="text-[10px] px-1">{getTierLabel(item.tier)}</Badge>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {item.rarity ? (
                            <Badge variant="outline" className={`text-[10px] px-1 ${getRarityColor(item.rarity)}`}>{item.rarity}</Badge>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-center text-muted-foreground">
                          {item.isCargo ? "Cargo" : "Item"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
      </div>
    </div>
  );
}
