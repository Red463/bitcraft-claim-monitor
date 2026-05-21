import { useGetClaimResearch } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Lock } from "lucide-react";

type ResearchItem = {
  name?: string | null;
  id?: string | null;
  entityId?: string | null;
  description?: string | null;
  tier?: number | null;
  [key: string]: unknown;
};

function getName(item: ResearchItem): string {
  return String(item.name ?? item.id ?? item.entityId ?? "Unknown Technology");
}

export function ResearchPanel() {
  const { data: research, isLoading, error } = useGetClaimResearch(CLAIM_ID);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-destructive">Failed to load research data.</div>;
  }

  const researched = ((research?.researched ?? []) as ResearchItem[]);
  const available = ((research?.available ?? []) as ResearchItem[]);

  return (
    <div className="p-6 space-y-6" data-testid="research-panel">
      <SectionHeader
        title="Research & Technology"
        description={`${researched.length} researched — ${available.length} available to unlock`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Researched */}
        <div>
          <h3 className="font-serif text-primary mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Researched ({researched.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {researched.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No researched technologies recorded.</p>
            ) : (
              researched.map((item, i) => (
                <div
                  key={item.entityId ?? item.id ?? i}
                  className="flex items-center gap-3 p-2.5 border border-emerald-900/40 rounded bg-emerald-900/10"
                  data-testid={`researched-item-${i}`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{getName(item)}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">{String(item.description)}</p>
                    )}
                  </div>
                  {item.tier != null && (
                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-700/50 shrink-0">T{item.tier}</Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available */}
        <div>
          <h3 className="font-serif text-primary mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            Available ({available.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No available technologies listed.</p>
            ) : (
              available.map((item, i) => (
                <div
                  key={item.entityId ?? item.id ?? i}
                  className="flex items-center gap-3 p-2.5 border border-border/50 rounded bg-card hover:bg-secondary/20"
                  data-testid={`available-item-${i}`}
                >
                  <Circle className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">{getName(item)}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">{String(item.description)}</p>
                    )}
                  </div>
                  {item.tier != null && (
                    <Badge variant="outline" className="text-xs shrink-0">T{item.tier}</Badge>
                  )}
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
