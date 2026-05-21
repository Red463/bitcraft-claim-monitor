import { useState, useMemo } from "react";
import { useGetClaimPlayers } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, MapPin, Users } from "lucide-react";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function MapPanel() {
  const { data: players, isLoading } = useGetClaimPlayers(CLAIM_ID);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);

  // On first load, default to only online players (or all if none online)
  const roster = useMemo(() => players ?? [], [players]);

  const defaultSelection = useMemo(() => {
    if (!roster.length) return new Set<string>();
    const online = roster.filter(p => p.signedIn).map(p => p.entityId!).filter(Boolean);
    return new Set<string>(online.length ? online : roster.map(p => p.entityId!).filter(Boolean));
  }, [roster]);

  const selection = selectedIds ?? defaultSelection;

  const mapUrl = useMemo(() => {
    const base = "https://bitcraftmap.com/";
    if (selection.size === 0) return base;
    return `${base}?playerId=${[...selection].join(",")}`;
  }, [selection]);

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev ?? defaultSelection);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const cur = selectedIds ?? defaultSelection;
    setSelectedIds(cur.size === roster.length
      ? new Set()
      : new Set(roster.map(p => p.entityId!).filter(Boolean))
    );
  }

  const cur = selectedIds ?? defaultSelection;
  const onlineCount = roster.filter(p => p.signedIn).length;

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="map-panel">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 shrink-0">
        <div>
          <SectionHeader title="World Map" description="Live player tracking via bitcraftmap.com" />
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-emerald-400 font-medium">{onlineCount} online</span>
              <span className="text-muted-foreground/50"> · {roster.length} members total</span>
            </p>
          )}
        </div>
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded px-2.5 py-1.5 transition-all shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open full map
        </a>
      </div>

      {/* Player toggle pills */}
      <div className="px-6 pb-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Users className="w-3.5 h-3.5" />
            <span>Track:</span>
          </div>

          {isLoading ? (
            <div className="flex gap-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-20 rounded-full" />)}
            </div>
          ) : (
            <>
              <button
                onClick={toggleAll}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  cur.size === roster.length
                    ? "bg-primary/20 text-primary border-primary/40 font-medium"
                    : "text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
                }`}
              >
                All
              </button>

              {roster.map(p => {
                const id = p.entityId!;
                const selected = cur.has(id);
                const online = p.signedIn === true;
                const sessionLabel = online && p.sessionSeconds
                  ? `Online · ${formatDuration(p.sessionSeconds)}`
                  : p.lastLogin
                    ? `Last seen ${new Date(p.lastLogin as string).toLocaleDateString()}`
                    : "Never seen";

                return (
                  <button
                    key={id}
                    onClick={() => toggle(id)}
                    title={sessionLabel}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
                      selected
                        ? "bg-primary/20 text-primary border-primary/40 font-medium"
                        : "text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      online
                        ? "bg-emerald-400 shadow-[0_0_5px_2px_rgba(52,211,153,0.5)]"
                        : "bg-slate-600"
                    }`} />
                    {p.username}
                    {selected && <MapPin className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-2 italic">
          Map shows last known position — offline players may still appear if selected.
        </p>
      </div>

      {/* Map iframe */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        <div className="w-full h-full min-h-[500px] rounded-lg overflow-hidden border border-border/60">
          <iframe
            key={mapUrl}
            src={mapUrl}
            title="BitCraft World Map"
            className="w-full h-full"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
