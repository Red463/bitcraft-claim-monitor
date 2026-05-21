import { useMemo } from "react";
import { useGetClaimConstruction } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Hammer, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Material = {
  name?: string | null;
  required?: number | null;
  available?: number | null;
  quantity?: number | null;
};

export function ConstructionPanel() {
  const { data: projects, isLoading, error } = useGetClaimConstruction(CLAIM_ID);

  const neededItems = useMemo(() => {
    if (!projects) return [];
    const totals: Record<string, number> = {};
    for (const project of projects) {
      for (const mat of ((project.requiredMaterials ?? []) as Material[])) {
        const name = mat.name ?? "Unknown";
        const needed = (mat.required ?? mat.quantity ?? 0) - (mat.available ?? 0);
        if (needed > 0) {
          totals[name] = (totals[name] ?? 0) + needed;
        }
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [projects]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-destructive">Failed to load construction data.</div>;
  }

  const projectList = projects ?? [];

  return (
    <div className="p-6 space-y-6" data-testid="construction-panel">
      <SectionHeader
        title="Construction Projects"
        description={`${projectList.length} active project${projectList.length !== 1 ? "s" : ""}`}
      />

      {projectList.length === 0 && (
        <div className="p-8 border border-border rounded bg-card text-center text-muted-foreground">
          <Hammer className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No active construction projects.</p>
        </div>
      )}

      {/* "What to gather next" */}
      {neededItems.length > 0 && (
        <div className="p-4 border border-amber-700/40 rounded bg-amber-900/10">
          <h3 className="font-serif text-amber-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            What to Gather Next
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {neededItems.map(([name, amount]) => (
              <div key={name} className="p-3 border border-amber-700/30 rounded bg-card text-center">
                <div className="text-lg font-serif font-bold text-amber-400">{amount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1 truncate" title={name}>{name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects list */}
      <div className="space-y-4">
        {projectList.map((project, idx) => {
          const progressPct = Math.min(100, Math.round((project.progress ?? 0) * 100));
          const materials = (project.requiredMaterials ?? []) as Material[];
          const missingMaterials = materials.filter(m => {
            const needed = (m.required ?? m.quantity ?? 0);
            const have = m.available ?? 0;
            return have < needed;
          });

          return (
            <div
              key={project.entityId ?? idx}
              className="border border-border rounded overflow-hidden bg-card"
              data-testid={`construction-project-${idx}`}
            >
              <div className="flex items-center justify-between px-4 py-3 bg-secondary/20">
                <div className="flex items-center gap-3">
                  <Hammer className="w-4 h-4 text-primary" />
                  <div>
                    <p className="font-serif text-primary text-sm">{project.buildingName ?? "Unknown Building"}</p>
                    {project.entityId && (
                      <p className="text-[10px] text-muted-foreground/40 font-mono">ID: {project.entityId}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {missingMaterials.length > 0 && (
                    <Badge variant="outline" className="text-xs text-amber-400 border-amber-700/50">
                      {missingMaterials.length} missing
                    </Badge>
                  )}
                  {project.startedAt && (
                    <span className="text-xs text-muted-foreground">
                      Started {formatDistanceToNow(new Date(project.startedAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                {project.progress != null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{progressPct}%</span>
                    </div>
                    <Progress value={progressPct} className="h-1.5" />
                  </div>
                )}

                {materials.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Required Materials</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {materials.map((mat, mi) => {
                        const required = mat.required ?? mat.quantity ?? 0;
                        const have = mat.available ?? 0;
                        const isMissing = have < required;
                        return (
                          <div
                            key={mi}
                            className={`p-2 rounded border text-xs ${isMissing ? "border-amber-700/40 bg-amber-900/10" : "border-border bg-background/30"}`}
                          >
                            <p className={`font-medium ${isMissing ? "text-amber-400" : "text-foreground"}`}>
                              {mat.name ?? "Unknown"}
                            </p>
                            <p className={`mt-0.5 ${isMissing ? "text-amber-500" : "text-muted-foreground"}`}>
                              {have.toLocaleString()} / {required.toLocaleString()}
                              {isMissing && ` (need ${(required - have).toLocaleString()} more)`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
