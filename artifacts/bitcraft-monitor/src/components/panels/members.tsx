import { useState } from "react";
import { useGetClaimMembers, useGetClaimCitizens, useGetClaimPlayers } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Hammer, Package } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function MembersPanel() {
  const { data: members,  isLoading: loadingMembers  } = useGetClaimMembers(CLAIM_ID);
  const { data: citizens, isLoading: loadingCitizens } = useGetClaimCitizens(CLAIM_ID);
  const { data: players,  isLoading: loadingPlayers  } = useGetClaimPlayers(CLAIM_ID);
  const [search, setSearch] = useState("");

  if (loadingMembers || loadingCitizens || loadingPlayers) {
    return <div className="p-6"><Skeleton className="h-[400px] w-full" /></div>;
  }

  // Build lookup maps — citizens from Bitjita may use `userName` (raw) or `username` (normalised)
  const citizenMap = new Map(
    (citizens ?? []).map(c => {
      const key = c.username ?? (c as Record<string, unknown>).userName as string;
      return [key, c];
    })
  );
  const playerMap = new Map((players ?? []).map(p => [p.username, p]));

  const merged = (members ?? []).map(m => ({
    ...m,
    ...citizenMap.get(m.username ?? ""),
    player: playerMap.get(m.username ?? "") ?? null,
  }));

  const filtered = merged.filter(m =>
    m.username?.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = (players ?? []).filter(p => p.signedIn).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <SectionHeader title="Settlement Roster" description="Member permissions and online status" />
        <div className="text-right shrink-0 ml-4">
          <span className="text-emerald-400 font-medium text-sm">{onlineCount} online</span>
          <span className="text-muted-foreground text-sm"> / {merged.length} members</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search username..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filtered.length} members found
        </div>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow className="border-border">
              <TableHead className="text-primary font-serif w-8"></TableHead>
              <TableHead className="text-primary font-serif">Username</TableHead>
              <TableHead className="text-primary font-serif">Role</TableHead>
              <TableHead className="text-primary font-serif">Skill Lvl</TableHead>
              <TableHead className="text-primary font-serif">Session / Last Login</TableHead>
              <TableHead className="text-primary font-serif">Permissions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(m => {
              const p = m.player;
              const online = p?.signedIn === true;
              const raw = m as Record<string, unknown>;
              const canBuild     = !!(raw.buildPermission);
              const canInventory = !!(raw.inventoryPermission);
              const totalSkill   = (raw.totalSkillLevel as number | null) ?? null;

              return (
                <TableRow key={m.entityId || m.username} className="border-border hover:bg-secondary/30">
                  {/* Online dot */}
                  <TableCell className="pr-0">
                    <span
                      title={online ? `Online · ${p?.sessionSeconds ? formatDuration(p.sessionSeconds) : ""}` : "Offline"}
                      className={`block w-2 h-2 rounded-full mx-auto ${
                        online
                          ? "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.45)]"
                          : "bg-slate-700"
                      }`}
                    />
                  </TableCell>

                  <TableCell className="font-medium text-foreground">
                    {m.username}
                  </TableCell>

                  <TableCell>
                    {m.coOwnerPermission
                      ? <Badge className="bg-amber-700/20 text-amber-500 border border-amber-700/50">Co-Owner</Badge>
                      : m.officerPermission
                        ? <Badge className="bg-blue-700/20 text-blue-400 border border-blue-700/50">Officer</Badge>
                        : <Badge variant="outline" className="text-muted-foreground border-border">Member</Badge>
                    }
                  </TableCell>

                  <TableCell className="font-mono text-sm">
                    {totalSkill != null ? totalSkill.toLocaleString() : <span className="text-muted-foreground/40">—</span>}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {online && p?.sessionSeconds ? (
                      <span className="text-emerald-400 font-medium">
                        Playing {formatDuration(p.sessionSeconds)}
                      </span>
                    ) : m.lastLogin ? (
                      formatDistanceToNow(new Date(m.lastLogin as string), { addSuffix: true })
                    ) : (
                      "Never"
                    )}
                  </TableCell>

                  {/* Permissions as icons */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        title={canBuild ? "Can build" : "Cannot build"}
                        className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
                          canBuild
                            ? "text-amber-400 bg-amber-400/10"
                            : "text-muted-foreground/20 bg-transparent"
                        }`}
                      >
                        <Hammer className="w-3.5 h-3.5" />
                      </span>
                      <span
                        title={canInventory ? "Can access inventory" : "Cannot access inventory"}
                        className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
                          canInventory
                            ? "text-blue-400 bg-blue-400/10"
                            : "text-muted-foreground/20 bg-transparent"
                        }`}
                      >
                        <Package className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
