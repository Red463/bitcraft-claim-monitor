import { useState } from "react";
import { useGetClaimCitizens } from "@workspace/api-client-react";
import { CLAIM_ID } from "@/lib/constants";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUp, ArrowDown, ArrowUpDown, Swords, Star, TrendingUp } from "lucide-react";

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

const SKILL_IDS = Object.keys(SKILL_NAMES).map(Number).sort((a, b) => a - b);

const MAX_LEVEL = 60;

type RawCitizen = {
  entityId?: string;
  userName?: string;
  username?: string;
  skills?: Record<string, number>;
  totalLevel?: number;
  totalSkillLevel?: number;
  totalXP?: number;
  totalXp?: number;
  highestLevel?: number;
  highestSkillLevel?: number;
};

type SortKey = "name" | "total" | "highest" | number;

function cellStyle(level: number): React.CSSProperties {
  if (level === 0) return {};
  const t = Math.min(1, level / MAX_LEVEL);
  if (t < 0.25) return { backgroundColor: `rgba(51,65,85,${0.15 + t * 0.6})` };
  if (t < 0.6)  return { backgroundColor: `rgba(120,53,15,${0.1 + t * 0.4})` };
  return { backgroundColor: `rgba(180,83,9,${0.2 + t * 0.45})` };
}

function cellTextClass(level: number): string {
  if (level === 0)  return "text-muted-foreground/25";
  if (level < 20)   return "text-slate-400";
  if (level < 40)   return "text-slate-300";
  if (level < 50)   return "text-amber-400";
  return "text-amber-300 font-semibold";
}

export function SkillsPanel() {
  const { data: rawCitizens, isLoading, error } = useGetClaimCitizens(CLAIM_ID);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-destructive">Failed to load citizen skill data.</div>;
  }

  const citizens = (rawCitizens ?? []) as RawCitizen[];

  function getSkill(c: RawCitizen, id: number)  { return c.skills?.[String(id)] ?? 0; }
  function getName(c: RawCitizen)                { return c.userName ?? c.username ?? "Unknown"; }
  function getTotal(c: RawCitizen)               { return c.totalLevel ?? c.totalSkillLevel ?? 0; }
  function getXP(c: RawCitizen)                  { return c.totalXP ?? c.totalXp ?? 0; }
  function getHighest(c: RawCitizen)             { return c.highestLevel ?? c.highestSkillLevel ?? 0; }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...citizens].sort((a, b) => {
    if (sortKey === "name") {
      return sortDir === "asc"
        ? getName(a).localeCompare(getName(b))
        : getName(b).localeCompare(getName(a));
    }
    const va = sortKey === "total" ? getTotal(a) : sortKey === "highest" ? getHighest(a) : getSkill(a, sortKey as number);
    const vb = sortKey === "total" ? getTotal(b) : sortKey === "highest" ? getHighest(b) : getSkill(b, sortKey as number);
    return sortDir === "asc" ? va - vb : vb - va;
  });

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="w-2.5 h-2.5 opacity-20" />;
    return sortDir === "desc"
      ? <ArrowDown className="w-2.5 h-2.5 text-primary" />
      : <ArrowUp   className="w-2.5 h-2.5 text-primary" />;
  }

  const guildTotalXP    = citizens.reduce((s, c) => s + getXP(c), 0);
  const guildTotalLevel = citizens.reduce((s, c) => s + getTotal(c), 0);
  const guildBest       = Math.max(...citizens.map(getHighest), 0);
  const topMember       = sorted[0] ? getName(sorted[0]) : "—";

  return (
    <div className="p-6 space-y-6" data-testid="skills-panel">
      <SectionHeader
        title="Member Skills"
        description={`${citizens.length} citizens · ${guildTotalXP.toLocaleString()} total XP`}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-border rounded-lg bg-card px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Guild Total Level</p>
            <p className="text-xl font-serif text-foreground">{guildTotalLevel.toLocaleString()}</p>
          </div>
        </div>
        <div className="border border-border rounded-lg bg-card px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber-900/20 flex items-center justify-center shrink-0">
            <Star className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Highest Skill</p>
            <p className="text-xl font-serif text-foreground">{guildBest}</p>
          </div>
        </div>
        <div className="border border-border rounded-lg bg-card px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-sky-900/20 flex items-center justify-center shrink-0">
            <Swords className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Member</p>
            <p className="text-xl font-serif text-foreground truncate">{topMember}</p>
          </div>
        </div>
      </div>

      {citizens.length === 0 && (
        <div className="p-8 border border-border rounded bg-card text-center text-muted-foreground">
          No citizen data available.
        </div>
      )}

      {citizens.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                {/* Skill name row — rotated vertical text */}
                <tr className="bg-secondary/20 border-b border-border/50">
                  {/* Name + stat cols spacers */}
                  <th className="sticky left-0 z-20 bg-secondary/20" style={{ minWidth: 110 }} />
                  <th className="bg-secondary/20" style={{ width: 56 }} />
                  <th className="bg-secondary/20" style={{ width: 48 }} />
                  {SKILL_IDS.map(id => (
                    <th
                      key={id}
                      className={`text-center px-0 cursor-pointer group ${sortKey === id ? "bg-primary/5" : ""}`}
                      style={{ width: 46, verticalAlign: "bottom", paddingBottom: 6 }}
                      title={SKILL_NAMES[id]}
                      onClick={() => toggleSort(id)}
                    >
                      <div
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", display: "inline-block" }}
                        className={`text-[10px] font-medium pb-1 whitespace-nowrap transition-colors ${
                          sortKey === id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      >
                        {SKILL_NAMES[id]}
                      </div>
                    </th>
                  ))}
                </tr>
                {/* Sort header row */}
                <tr className="bg-secondary/30 border-b border-border">
                  <th
                    className="sticky left-0 z-20 bg-secondary/40 backdrop-blur px-4 py-2.5 text-left cursor-pointer group"
                    style={{ minWidth: 110 }}
                    onClick={() => toggleSort("name")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium ${sortKey === "name" ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                        Member
                      </span>
                      <SortIcon k="name" />
                    </div>
                  </th>
                  <th
                    className="px-3 py-2.5 text-right cursor-pointer group"
                    style={{ width: 56 }}
                    onClick={() => toggleSort("total")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className={`text-xs font-medium ${sortKey === "total" ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                        Total
                      </span>
                      <SortIcon k="total" />
                    </div>
                  </th>
                  <th
                    className="px-3 py-2.5 text-right cursor-pointer group"
                    style={{ width: 48 }}
                    onClick={() => toggleSort("highest")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className={`text-xs font-medium ${sortKey === "highest" ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                        Best
                      </span>
                      <SortIcon k="highest" />
                    </div>
                  </th>
                  {SKILL_IDS.map(id => (
                    <th
                      key={id}
                      className={`px-0 py-2.5 text-center cursor-pointer ${sortKey === id ? "bg-primary/5" : ""}`}
                      style={{ width: 46 }}
                      onClick={() => toggleSort(id)}
                    >
                      <div className="flex justify-center">
                        <SortIcon k={id} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-border/30">
                {sorted.map((c, i) => {
                  const name    = getName(c);
                  const total   = getTotal(c);
                  const highest = getHighest(c);
                  const isEven  = i % 2 === 0;
                  return (
                    <tr
                      key={c.entityId ?? i}
                      className={`hover:bg-primary/5 transition-colors ${isEven ? "bg-background" : "bg-secondary/5"}`}
                      data-testid={`skills-row-${i}`}
                    >
                      <td
                        className={`sticky left-0 z-10 backdrop-blur px-3 py-2.5 font-medium text-sm text-foreground whitespace-nowrap border-r border-border/20 ${
                          isEven ? "bg-background/95" : "bg-secondary/10"
                        }`}
                        style={{ minWidth: 110 }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                          {name}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground" style={{ width: 56 }}>
                        {total.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-amber-400" style={{ width: 48 }}>
                        {highest}
                      </td>
                      {SKILL_IDS.map(id => {
                        const level = getSkill(c, id);
                        return (
                          <td
                            key={id}
                            style={{ ...cellStyle(level), width: 46 }}
                            className={`py-2.5 text-center text-xs font-mono transition-colors ${cellTextClass(level)} ${sortKey === id ? "ring-inset ring-1 ring-primary/20" : ""}`}
                            title={`${name} — ${SKILL_NAMES[id]}: Lv ${level}`}
                          >
                            {level > 0 ? level : <span className="text-[9px] opacity-30">·</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-border bg-secondary/30">
                  <td
                    className="sticky left-0 z-10 bg-secondary/50 backdrop-blur px-3 py-2.5 font-serif text-xs text-muted-foreground whitespace-nowrap border-r border-border/20"
                    style={{ minWidth: 110 }}
                  >
                    Settlement Max
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground" style={{ width: 56 }}>
                    —
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-amber-400" style={{ width: 48 }}>
                    {Math.max(...citizens.map(getHighest), 0)}
                  </td>
                  {SKILL_IDS.map(id => {
                    const max = Math.max(...citizens.map(c => getSkill(c, id)), 0);
                    return (
                      <td
                        key={id}
                        style={{ ...cellStyle(max), width: 46 }}
                        className={`py-2.5 text-center text-xs font-mono font-semibold ${cellTextClass(max)}`}
                        title={`${SKILL_NAMES[id]} — Settlement max: ${max}`}
                      >
                        {max > 0 ? max : <span className="text-[9px] opacity-30">·</span>}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 text-[10px] text-muted-foreground">
        <span>Skill level:</span>
        <div className="flex items-center gap-2">
          {[
            { label: "0", cls: "text-muted-foreground/25" },
            { label: "1–19", cls: "text-slate-400" },
            { label: "20–39", cls: "text-slate-300" },
            { label: "40–49", cls: "text-amber-400" },
            { label: "50+", cls: "text-amber-300 font-semibold" },
          ].map(({ label, cls }) => (
            <span key={label} className={`${cls}`}>{label}</span>
          ))}
        </div>
        <span className="text-muted-foreground/40">· Click any column to sort</span>
      </div>
    </div>
  );
}
