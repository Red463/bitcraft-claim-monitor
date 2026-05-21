import { useGetClaim, useGetClaimMembers, useGetClaimBuildings, useGetClaimMarketListings } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { StatCard } from "@/components/ui/stat-card";
import { WarningCard } from "@/components/ui/warning-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Users, Building, Coins, Box, Shield, Pickaxe, ShoppingCart, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export function OverviewPanel() {
  const { data: claim, isLoading, error } = useGetClaim(CLAIM_ID);
  const { data: members } = useGetClaimMembers(CLAIM_ID);
  const { data: buildings } = useGetClaimBuildings(CLAIM_ID);
  const { data: listings } = useGetClaimMarketListings(CLAIM_ID);

  if (isLoading) return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    </div>
  );
  if (error || !claim) return <div className="p-6 text-destructive">Failed to load claim data.</div>;

  const supplies = claim.supplies ?? 0;
  const suppliesLow = supplies < 2000;

  const treasury = claim.treasury ?? 0;
  const upkeep = claim.upkeepCost ?? 0;
  const treasuryLow = treasury < (upkeep * 7);

  const memberCount = (members as unknown[])?.length ?? 0;
  const buildingCount = (buildings as unknown[])?.length ?? 0;
  const marketListingCount = (listings as unknown[])?.length ?? 0;

  const suppliesRunOutAt = claim.suppliesRunOutAt ? new Date(claim.suppliesRunOutAt) : null;
  const daysUntilRunOut = suppliesRunOutAt
    ? Math.max(0, Math.round((suppliesRunOutAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      <SectionHeader
        title={`${claim.name ?? "Unknown"} Command Center`}
        description={`Tier ${claim.tier ?? "?"} Settlement in ${claim.regionName ?? "Unknown"} — Owner: ${(claim as Record<string, unknown>).ownerUsername ?? "Unknown"}`}
      />

      {/* Warnings */}
      {(suppliesLow || treasuryLow) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliesLow && (
            <WarningCard
              title="Low Supplies"
              message={`Only ${supplies.toLocaleString()} supplies remaining${daysUntilRunOut !== null ? `. Runs out in ~${daysUntilRunOut} days.` : "."}`}
            />
          )}
          {treasuryLow && (
            <WarningCard
              title="Low Treasury"
              message={`Treasury cannot cover 7 days of upkeep (${upkeep.toFixed(2)}g/day).`}
            />
          )}
        </div>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Supplies"
          value={supplies.toLocaleString()}
          icon={<Box className="w-4 h-4" />}
          warning={suppliesLow}
        />
        <StatCard
          title="Treasury"
          value={`${treasury.toLocaleString()}g`}
          icon={<Coins className="w-4 h-4" />}
          warning={treasuryLow}
        />
        <StatCard
          title="Upkeep"
          value={`${upkeep.toFixed(2)}g / day`}
          icon={<Shield className="w-4 h-4" />}
        />
        <StatCard
          title="Tiles"
          value={(claim.tileCount ?? 0).toLocaleString()}
          icon={<Pickaxe className="w-4 h-4" />}
        />
        <StatCard title="Members" value={memberCount} icon={<Users className="w-4 h-4" />} />
        <StatCard title="Buildings" value={buildingCount} icon={<Building className="w-4 h-4" />} />
        <StatCard title="Market Listings" value={marketListingCount} icon={<ShoppingCart className="w-4 h-4" />} />
        <StatCard
          title="Supplies Run Out"
          value={suppliesRunOutAt ? formatDistanceToNow(suppliesRunOutAt, { addSuffix: true }) : "—"}
          icon={<Clock className="w-4 h-4" />}
          warning={daysUntilRunOut !== null && daysUntilRunOut < 7}
        />
      </div>

      {/* Claim Details */}
      <div className="p-6 border border-border rounded-lg bg-card">
        <h3 className="text-lg font-serif text-primary mb-4">Claim Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-2 text-sm">
          {[
            { label: "Region",               value: claim.regionName },
            { label: "Tier",                  value: `Tier ${claim.tier}` },
            { label: "Owner",                 value: (claim as Record<string, unknown>).ownerUsername as string },
            { label: "Empire",                value: ((claim as Record<string, unknown>).empireName as string | null) ?? "None" },
            { label: "Tile Cost",             value: `${claim.tileCost ?? 0} supplies/tile/day` },
            { label: "Building Maintenance",  value: `${claim.buildingMaintenance ?? 0}g/day` },
            { label: "Location",              value: `(${claim.locationX}, ${claim.locationZ})` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-foreground font-medium text-right truncate">{value ?? "—"}</dd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
