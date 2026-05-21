import { useGetClaimProductions } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Factory, User } from "lucide-react";

const SKILL_NAMES: Record<number, string> = {
  2:  "Forestry",
  3:  "Carpentry",
  4:  "Masonry",
  5:  "Mining",
  6:  "Smithing",
  7:  "Scholar",
  8:  "Leatherworking",
  9:  "Hunting",
  10: "Tailoring",
  11: "Farming",
  12: "Fishing",
  13: "Cooking",
  14: "Foraging",
  15: "Construction",
  17: "Taming",
  18: "Slayer",
  19: "Merchanting",
  21: "Sailing",
};


export function ProductionPanel() {
  const { data: jobs, isLoading, error } = useGetClaimProductions(CLAIM_ID);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-destructive">Failed to load production data.</div>;
  }

  const jobList = jobs ?? [];

  const crafterCounts = jobList.reduce<Record<string, number>>((acc, j) => {
    const name = String(j.ownerUsername ?? "Unknown");
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6" data-testid="production-panel">
      <div className="flex items-start justify-between">
        <SectionHeader
          title="Active Production"
          description={
            jobList.length === 0
              ? "No active crafting jobs"
              : `${jobList.length} active job${jobList.length !== 1 ? "s" : ""} across ${Object.keys(crafterCounts).length} crafter${Object.keys(crafterCounts).length !== 1 ? "s" : ""}`
          }
        />
        {jobList.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end max-w-xs">
            {Object.entries(crafterCounts).map(([name, count]) => (
              <div key={name} className="flex items-center gap-1.5 text-xs bg-card border border-border/50 rounded px-2 py-1">
                <User className="w-3 h-3 text-muted-foreground" />
                <span className="text-foreground font-medium">{name}</span>
                <span className="text-muted-foreground">{count} job{count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {jobList.length === 0 && (
        <div className="p-12 border border-border rounded bg-card text-center">
          <Factory className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-muted-foreground">No crafting jobs are currently active.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {jobList.map((job, idx) => {
          const progressPct = Math.min(100, Math.round((job.progressFraction ?? 0) * 100));
          const remaining   = (job.totalActions ?? 0) - (job.progressActions ?? 0);
          const skillName   = job.skillId ? (SKILL_NAMES[job.skillId] ?? `Skill ${job.skillId}`) : null;

          return (
            <div
              key={job.entityId ?? idx}
              className="border border-border rounded overflow-hidden bg-card flex flex-col"
              data-testid={`production-job-${idx}`}
            >
              {/* Header */}
              <div className="px-4 py-3 bg-secondary/20 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Factory className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-serif text-primary text-sm leading-tight truncate">
                      {String(job.buildingName ?? "Unknown Building")}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <User className="w-3 h-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground truncate">
                        {String(job.ownerUsername ?? "Unknown")}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {skillName && (
                    <Badge variant="outline" className="text-xs">{skillName}</Badge>
                  )}
                  {job.skillLevel != null && (
                    <span className="text-[10px] text-muted-foreground">Lv {job.skillLevel}+</span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-3 flex-1 space-y-3">
                {/* Item + count */}
                <div>
                  {job.itemName && !job.itemName.startsWith("Item #") ? (
                    <p className="text-sm font-medium text-foreground">{job.itemName}</p>
                  ) : (
                    <div>
                      <p className="text-sm text-muted-foreground italic">
                        {skillName ? `${skillName} craft` : "Unknown item"}
                      </p>
                      {job.recipeId != null && (
                        <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">recipe #{job.recipeId}</p>
                      )}
                    </div>
                  )}
                  {job.craftCount != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Number(job.craftCount).toLocaleString()} ×&nbsp;queued
                    </p>
                  )}
                </div>

                {/* Progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-mono">
                      {Number(job.progressActions ?? 0).toLocaleString()} / {Number(job.totalActions ?? 0).toLocaleString()} actions
                    </span>
                  </div>
                  <Progress value={progressPct} className="h-1.5" />
                  <div className="flex justify-between text-xs">
                    <span className="text-primary font-medium">{progressPct}%</span>
                    <span className="text-muted-foreground">{remaining.toLocaleString()} remaining</span>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
