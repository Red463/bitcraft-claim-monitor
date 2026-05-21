import { useState, useMemo } from "react";
import { useGetClaimMarketListings } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, TrendingUp, TrendingDown, ShoppingCart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function getRarityColor(rarity: string | null | undefined) {
  switch ((rarity ?? "").toLowerCase()) {
    case "legendary": return "text-amber-400 border-amber-700/50";
    case "epic": return "text-purple-400 border-purple-700/50";
    case "rare": return "text-sky-400 border-sky-700/50";
    case "uncommon": return "text-emerald-400 border-emerald-700/50";
    default: return "text-muted-foreground border-border";
  }
}

export function MarketPanel() {
  const { data: listings, isLoading, error } = useGetClaimMarketListings(CLAIM_ID);
  const [activeTab, setActiveTab] = useState<"sell" | "buy">("sell");
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [filterRarity, setFilterRarity] = useState("all");

  const allListings = listings ?? [];

  const sellOrders = allListings.filter(l => (l.orderType ?? "").toLowerCase().includes("sell") || (l.orderType ?? "").toLowerCase() === "sell");
  const buyOrders = allListings.filter(l => (l.orderType ?? "").toLowerCase().includes("buy") || (l.orderType ?? "").toLowerCase() === "buy");
  // Fallback: if orderType isn't "buy"/"sell", show all in sell tab
  const sellListings = sellOrders.length > 0 ? sellOrders : allListings;
  const buyListings = buyOrders;

  const tiers = useMemo(() => {
    const ts = new Set<number>();
    allListings.forEach(l => { if (l.tier) ts.add(l.tier); });
    return Array.from(ts).sort((a, b) => a - b);
  }, [allListings]);

  const rarities = useMemo(() => {
    const rs = new Set<string>();
    allListings.forEach(l => { if (l.rarity) rs.add(l.rarity); });
    return Array.from(rs);
  }, [allListings]);

  const currentListings = activeTab === "sell" ? sellListings : buyListings;

  const filtered = useMemo(() => {
    return currentListings.filter(l => {
      if (search && !(l.itemName ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTier !== "all" && String(l.tier) !== filterTier) return false;
      if (filterRarity !== "all" && l.rarity !== filterRarity) return false;
      return true;
    });
  }, [currentListings, search, filterTier, filterRarity]);

  // Top items by listing count
  const topItems = useMemo(() => {
    const counts: Record<string, number> = {};
    allListings.forEach(l => {
      const name = l.itemName ?? "Unknown";
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [allListings]);

  const highestValue = useMemo(() => {
    return [...allListings].sort((a, b) => ((b.price ?? 0) * (b.quantity ?? 1)) - ((a.price ?? 0) * (a.quantity ?? 1))).slice(0, 3);
  }, [allListings]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-destructive">Failed to load market listings.</div>;
  }

  return (
    <div className="p-6 space-y-6" data-testid="market-panel">
      <SectionHeader
        title="Market Listings"
        description={`${allListings.length} total listings — ${sellListings.length} sell, ${buyListings.length} buy`}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border border-border rounded bg-card flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-primary opacity-70" />
          <div>
            <div className="text-xl font-serif font-bold text-foreground">{allListings.length}</div>
            <div className="text-xs text-muted-foreground">Total Listings</div>
          </div>
        </div>
        <div className="p-4 border border-border rounded bg-card flex items-center gap-3">
          <TrendingDown className="w-5 h-5 text-emerald-400 opacity-70" />
          <div>
            <div className="text-xl font-serif font-bold text-foreground">{sellListings.length}</div>
            <div className="text-xs text-muted-foreground">Sell Orders</div>
          </div>
        </div>
        <div className="p-4 border border-border rounded bg-card flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-sky-400 opacity-70" />
          <div>
            <div className="text-xl font-serif font-bold text-foreground">{buyListings.length}</div>
            <div className="text-xs text-muted-foreground">Buy Orders</div>
          </div>
        </div>
        <div className="p-4 border border-border rounded bg-card">
          <div className="text-xs text-muted-foreground mb-2">Most Listed</div>
          {topItems[0] ? (
            <div>
              <p className="text-sm font-medium text-foreground truncate">{topItems[0][0]}</p>
              <p className="text-xs text-muted-foreground">{topItems[0][1]} listings</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </div>
      </div>

      {/* High value listings */}
      {highestValue.length > 0 && (
        <div className="p-4 border border-primary/20 rounded bg-card">
          <h3 className="font-serif text-primary text-sm mb-3">Highest Value Listings</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {highestValue.map((l, i) => (
              <div key={i} className="flex items-center justify-between p-3 border border-border/60 rounded bg-background/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{l.itemName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{l.ownerUsername ?? "—"}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-serif font-bold text-primary">{((l.price ?? 0) * (l.quantity ?? 1)).toLocaleString()}g</p>
                  <p className="text-xs text-muted-foreground">{(l.price ?? 0).toLocaleString()}g ea</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["sell", "buy"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${tab}`}
          >
            {tab === "sell" ? (
              <span className="flex items-center gap-2"><TrendingDown className="w-3.5 h-3.5" /> Sell Orders</span>
            ) : (
              <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Buy Orders</span>
            )}
          </button>
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
            data-testid="market-search"
          />
        </div>
        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          className="h-9 px-3 rounded border border-border bg-card text-sm text-foreground"
          data-testid="market-filter-tier"
        >
          <option value="all">All Tiers</option>
          {tiers.map(t => <option key={t} value={String(t)}>Tier {t}</option>)}
        </select>
        <select
          value={filterRarity}
          onChange={e => setFilterRarity(e.target.value)}
          className="h-9 px-3 rounded border border-border bg-card text-sm text-foreground"
          data-testid="market-filter-rarity"
        >
          <option value="all">All Rarities</option>
          {rarities.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} listings</span>
      </div>

      {/* Listings table */}
      <div className="border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 border-b border-border">
            <tr>
              <th className="px-4 py-2 text-left text-primary font-serif text-xs">Item</th>
              <th className="px-4 py-2 text-center text-primary font-serif text-xs">Tier</th>
              <th className="px-4 py-2 text-center text-primary font-serif text-xs">Rarity</th>
              <th className="px-4 py-2 text-right text-primary font-serif text-xs">Price</th>
              <th className="px-4 py-2 text-right text-primary font-serif text-xs">Qty</th>
              <th className="px-4 py-2 text-left text-primary font-serif text-xs">Owner</th>
              <th className="px-4 py-2 text-left text-primary font-serif text-xs">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No listings match your filters.</td>
              </tr>
            ) : (
              filtered.map((l, i) => (
                <tr key={l.entityId ?? i} className="border-b border-border/30 hover:bg-secondary/10">
                  <td className="px-4 py-2 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {l.isCargo && <span className="text-[10px] px-1 rounded bg-secondary text-muted-foreground">Cargo</span>}
                      {l.itemName ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {l.tier != null ? <Badge variant="outline" className="text-xs">T{l.tier}</Badge> : "—"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {l.rarity ? (
                      <Badge variant="outline" className={`text-xs ${getRarityColor(l.rarity)}`}>{l.rarity}</Badge>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-serif font-semibold text-primary">
                    {l.price != null ? `${l.price.toLocaleString()}g` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {l.quantity?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{l.ownerUsername ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {l.updatedAt ? formatDistanceToNow(new Date(Number(l.updatedAt) / 1000), { addSuffix: true }) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
