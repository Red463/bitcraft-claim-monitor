import { useGetClaim, useGetRegionClaims, getGetRegionClaimsQueryKey } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Crown } from "lucide-react";

export function RegionPanel() {
  const { data: claim, isLoading: loadingClaim } = useGetClaim(CLAIM_ID);
  const regionId = claim?.regionId ?? "";

  const { data: regionClaims, isLoading: loadingRegion } = useGetRegionClaims(
    { regionId, limit: 100, sort: "tier", order: "desc" },
    { query: { enabled: !!regionId, queryKey: getGetRegionClaimsQueryKey({ regionId, limit: 100, sort: "tier", order: "desc" }) } }
  );

  if (loadingClaim || loadingRegion) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const claims = regionClaims || [];
  const myClaim = claims.find(c => c.entityId === claim?.entityId);
  const myIndex = claims.findIndex(c => c.entityId === claim?.entityId);

  const truncateName = (name: string | null | undefined, max = 12) =>
    !name ? "Unknown" : name.length > max ? name.slice(0, max) + "…" : name;

  const MY_COLOR = "hsl(35 90% 55%)";
  const OTHER_COLOR = "hsl(220 15% 35%)";

  const chartData = claims.slice(0, 15).map(c => ({
    name: truncateName(c.name),
    tier: c.tier ?? 0,
    supplies: c.supplies ?? 0,
    treasury: c.treasury ?? 0,
    tiles: c.tileCount ?? 0,
    techs: c.learnedCount ?? 0,
    isMine: c.entityId === claim?.entityId,
  }));

  const rankOf = (field: keyof typeof chartData[0]) => {
    if (!myClaim) return "—";
    const sorted = [...claims].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[field as string] as number ?? 0;
      const bVal = (b as Record<string, unknown>)[field as string] as number ?? 0;
      return bVal - aVal;
    });
    const idx = sorted.findIndex(c => c.entityId === claim?.entityId);
    return idx >= 0 ? `#${idx + 1}` : "—";
  };

  type ClaimKey = "tier" | "supplies" | "treasury" | "tileCount" | "learnedCount";
  const rankOfField = (field: ClaimKey) => {
    if (!myClaim) return "—";
    const sorted = [...claims].sort((a, b) => ((b[field] as number) ?? 0) - ((a[field] as number) ?? 0));
    const idx = sorted.findIndex(c => c.entityId === claim?.entityId);
    return idx >= 0 ? `#${idx + 1}` : "—";
  };

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded p-2 text-xs shadow-xl">
        <p className="text-primary font-serif mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-foreground">{p.value?.toLocaleString()}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-8" data-testid="empire-panel">
      <SectionHeader
        title={`${claim?.regionName ?? "Region"} Leaderboard`}
        description={`${claims.length} settlements ranked across the ${claim?.regionName ?? "region"} region`}
      />

      {claims.length === 0 && (
        <div className="p-4 border border-border rounded bg-card text-muted-foreground text-sm">
          No region data available. Region ID may not be set on this claim.
        </div>
      )}

      {/* Rank cards */}
      {myClaim && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Tier Rank",      rank: rankOfField("tier"),         value: `Tier ${myClaim.tier ?? "?"}` },
            { label: "Supply Rank",    rank: rankOfField("supplies"),     value: (myClaim.supplies ?? 0).toLocaleString() },
            { label: "Treasury Rank",  rank: rankOfField("treasury"),     value: `${(myClaim.treasury ?? 0).toLocaleString()}g` },
            { label: "Tile Rank",      rank: rankOfField("tileCount"),    value: `${myClaim.tileCount ?? 0} tiles` },
            { label: "Research Rank",  rank: rankOfField("learnedCount"), value: `${myClaim.learnedCount ?? 0} techs` },
          ].map(item => (
            <div key={item.label} className="p-4 border border-primary/20 rounded bg-card/50 text-center">
              <div className="text-3xl font-serif font-bold text-primary">{item.rank}</div>
              <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
              <div className="text-sm text-foreground mt-1">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { key: "tier",     label: "Tier" },
            { key: "tiles",    label: "Tile Count" },
            { key: "supplies", label: "Supplies" },
            { key: "techs",    label: "Techs Researched" },
          ].map(({ key, label }) => (
            <div key={key} className="p-4 border border-border rounded bg-card" data-testid={`chart-${key}`}>
              <h3 className="font-serif text-primary text-sm mb-4">{label}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: "hsl(40 10% 60%)", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(40 10% 60%)", fontSize: 9 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey={key} radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isMine ? MY_COLOR : OTHER_COLOR} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      {/* Full comparison table */}
      {claims.length > 0 && (
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-primary font-serif text-xs">#</th>
                <th className="px-4 py-2 text-left text-primary font-serif text-xs">Claim</th>
                <th className="px-4 py-2 text-right text-primary font-serif text-xs">Tier</th>
                <th className="px-4 py-2 text-right text-primary font-serif text-xs">Supplies</th>
                <th className="px-4 py-2 text-right text-primary font-serif text-xs">Treasury</th>
                <th className="px-4 py-2 text-right text-primary font-serif text-xs">Tiles</th>
                <th className="px-4 py-2 text-right text-primary font-serif text-xs">Techs</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c, i) => {
                const isMine = c.entityId === claim?.entityId;
                return (
                  <tr
                    key={c.entityId ?? i}
                    className={`border-b border-border/50 transition-colors ${isMine ? "bg-primary/10" : "hover:bg-secondary/20"}`}
                    data-testid={isMine ? "my-claim-row" : `claim-row-${i}`}
                  >
                    <td className="px-4 py-2 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-4 py-2 font-medium flex items-center gap-2">
                      {isMine && <Crown className="w-3 h-3 text-primary shrink-0" />}
                      <span className={isMine ? "text-primary font-serif" : "text-foreground"}>{c.name ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant="outline" className={isMine ? "border-primary/50 text-primary" : ""}>{c.tier ?? "—"}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{c.supplies?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{c.treasury != null ? `${c.treasury.toLocaleString()}g` : "—"}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{c.tileCount ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{c.learnedCount ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
