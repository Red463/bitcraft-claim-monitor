import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bed,
  Box,
  Building2,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  Crown,
  Database,
  ExternalLink,
  Factory,
  FlaskConical,
  Flame,
  Globe2,
  Hammer,
  Home,
  KeyRound,
  Lock,
  LogOut,
  Map as MapIcon,
  MapPin,
  Package,
  Palette,
  RefreshCw,
  Save,
  Search,
  Shield,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Star,
  Swords,
  TrendingDown,
  TrendingUp,
  Users,
  User,
  Wrench,
} from "lucide-react";
import "./styles.css";

const DEFAULT_CLAIM_ID = "1369094286777412590";
const DEFAULT_SYNC_URL = "https://bitcraftsync.app/s/MUFJw3#claims=1369094286777412590&players=1369094286756659093%2C576460752388321942%2C864691128512324120&shopping=i.2036617800%3A20&p.exc=1369094286756659093%3A1369094286764705296%2C1369094286756792917%3B864691128512324120%3A1369094286778153104%2C1369094286772328807%2C1369094286761962469%3B576460752388321942%3A1369094286783870822&crafts=1&crafts.pf=includedPlayers";
const API = "/api/bitjita";
const LOCAL_API = "/api/local";

type AnyRecord = Record<string, any>;
type LoadState<T> = { data: T | null; error: string | null; loading: boolean };
type ActivePanel = (typeof NAV)[number][0];
type LocalHistoryState = { market: AnyRecord | null; activity: AnyRecord[]; error: string | null; refreshToken: number };

const NAV = [
  ["overview", "Overview", Shield],
  ["members", "Members", Users],
  ["skills", "Skills", Swords],
  ["production", "Production", Factory],
  ["inventory", "Inventory", Package],
  ["construction", "Construction", Hammer],
  ["buildings", "Structures", Home],
  ["research", "Research", FlaskConical],
  ["market", "Market", CircleDollarSign],
  ["empire", "Region", Globe2],
  ["map", "Map", MapIcon],
  ["sync", "Sync", Share2],
  ["activity", "Activity", Activity],
  ["admin", "Admin", KeyRound],
] as const;

const DEFAULT_THEME = {
  bg: "#0c0d10",
  sidebar: "#06070a",
  panel: "#181b21",
  panel2: "#11141a",
  border: "#353b46",
  muted: "#a8adba",
  text: "#f6f3ea",
  gold: "#f0c64f",
  good: "#4ee28a",
  danger: "#ef6461",
};

const THEME_FIELDS: Array<[keyof typeof DEFAULT_THEME, string, string]> = [
  ["bg", "Background", "--bg"],
  ["sidebar", "Sidebar", "--sidebar"],
  ["panel", "Panel", "--panel"],
  ["panel2", "Panel 2", "--panel-2"],
  ["border", "Border", "--border"],
  ["muted", "Muted Text", "--muted"],
  ["text", "Text", "--text"],
  ["gold", "Accent", "--gold"],
  ["good", "Positive", "--good"],
  ["danger", "Danger", "--danger"],
];

function endpointMap(claimId: string) {
  return {
    claim: `/claims/${claimId}`,
    members: `/claims/${claimId}/members`,
    citizens: `/claims/${claimId}/citizens`,
    buildings: `/claims/${claimId}/buildings`,
    inventories: `/claims/${claimId}/inventories`,
    construction: `/claims/${claimId}/construction`,
    research: `/claims/${claimId}/research`,
    market: `/claims/${claimId}/market/listings?limit=200`,
    crafts: `/crafts?claimEntityId=${claimId}&completed=false`,
    layout: `/claims/${claimId}/layout`,
  } as const;
}

const SKILL_NAMES: Record<number, string> = {
  2: "Forestry",
  3: "Carpentry",
  4: "Masonry",
  5: "Mining",
  6: "Smithing",
  7: "Scholar",
  8: "Leatherworking",
  9: "Hunting",
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

function unwrap<T>(payload: any, key: string, fallback: T): T {
  if (Array.isArray(payload)) return payload as T;
  return (payload?.[key] ?? fallback) as T;
}

function useBitjitaData(refreshToken: number, claimId: string): LoadState<AnyRecord> {
  const [state, setState] = React.useState<LoadState<AnyRecord>>({
    data: null,
    error: null,
    loading: true,
  });

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const entries = await Promise.all(
          Object.entries(endpointMap(claimId)).map(async ([key, path]) => {
            const response = await fetch(`${API}${path}`, { signal: controller.signal });
            if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
            return [key, await response.json()] as const;
          }),
        );
        const raw = Object.fromEntries(entries);
        const claim = raw.claim?.claim ?? raw.claim;
        const members = unwrap<AnyRecord[]>(raw.members, "members", []);
        const playerResults = await Promise.allSettled(
          members
            .filter((member) => member.playerEntityId)
            .map(async (member) => {
              const response = await fetch(`${API}/players/${member.playerEntityId}`, { signal: controller.signal });
              if (!response.ok) throw new Error(`/players/${member.playerEntityId}: HTTP ${response.status}`);
              const payload = await response.json();
              return payload.player ?? payload;
            }),
        );
        const regionPath = `/claims?regionId=${encodeURIComponent(String(claim?.regionId ?? ""))}&limit=100&sort=supplies&order=desc`;
        const regionRes = await fetch(`${API}${regionPath}`, { signal: controller.signal });
        raw.region = regionRes.ok ? await regionRes.json() : { claims: [] };
        raw.players = playerResults
          .filter((result): result is PromiseFulfilledResult<AnyRecord> => result.status === "fulfilled")
          .map((result) => normalizePlayer(result.value));
        setState({ loading: false, error: null, data: raw });
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((prev) => ({ loading: false, error: err instanceof Error ? err.message : String(err), data: prev.data }));
        }
      }
    }
    load();
    return () => controller.abort();
  }, [claimId, refreshToken]);

  return state;
}

function useLocalHistory(refreshToken: number, claimId: string): LocalHistoryState {
  const [state, setState] = React.useState<LocalHistoryState>({ market: null, activity: [], error: null, refreshToken: 0 });
  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [marketRes, activityRes] = await Promise.all([
          fetch(`${LOCAL_API}/market/history?claimId=${claimId}&limit=120`, { signal: controller.signal }),
          fetch(`${LOCAL_API}/activity?claimId=${claimId}&limit=250`, { signal: controller.signal }),
        ]);
        if (!marketRes.ok) throw new Error(`market history HTTP ${marketRes.status}`);
        if (!activityRes.ok) throw new Error(`activity history HTTP ${activityRes.status}`);
        const market = await marketRes.json();
        const activity = await activityRes.json();
        setState((prev) => ({ market, activity: activity.events ?? [], error: null, refreshToken: prev.refreshToken + 1 }));
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
        }
      }
    }
    load();
    return () => controller.abort();
  }, [claimId, refreshToken]);
  return state;
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value: unknown, maximumFractionDigits = 0): string {
  return toNumber(value).toLocaleString(undefined, { maximumFractionDigits });
}

function formatCompact(value: unknown): string {
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(toNumber(value));
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const numeric = Number(text);
  const millis = text.length >= 16 ? numeric / 1000 : text.length <= 10 ? numeric * 1000 : numeric;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value: unknown): string {
  if (!value) return "Never";
  const date = parseDateValue(value);
  if (!date) return String(value);
  return date.toLocaleString();
}

function timeAgo(value: unknown): string {
  if (!value) return "Never";
  const date = parseDateValue(value);
  if (!date) return String(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return String(value);
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function listingTrackingKey(listing: AnyRecord): string {
  return String(listing.entityId ?? listing.id ?? listing.marketListingId ?? listing.listingId ?? "");
}

function liveDaysSince(value: unknown): string {
  const date = parseDateValue(value);
  if (!date) return "-";
  const elapsed = Date.now() - date.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "-";
  const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));
  return days === 0 ? "<1 day" : `${days} day${days === 1 ? "" : "s"}`;
}

/*
 * BitJita active market listings expose their original listing time as
 * `timestamp`; persisted first-seen time is used for older/fallback payloads.
 */
function listingDate(listing: AnyRecord, firstSeen: unknown): unknown {
  return listing.timestamp ?? firstSeen;
}

function formatDuration(seconds: unknown): string {
  const total = toNumber(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function normalizePlayer(player: AnyRecord): AnyRecord {
  const signInTs = toNumber(player.signInTimestamp);
  const now = Math.floor(Date.now() / 1000);
  return {
    ...player,
    entityId: String(player.entityId ?? ""),
    username: player.username ?? player.userName,
    signedIn: player.signedIn === true,
    sessionSeconds: signInTs > 0 ? Math.max(0, now - signInTs) : null,
  };
}

function normalizeData(raw: AnyRecord | null) {
  const claim = raw?.claim?.claim ?? raw?.claim ?? {};
  const members = unwrap<AnyRecord[]>(raw?.members, "members", []);
  const citizens = unwrap<AnyRecord[]>(raw?.citizens, "citizens", []);
  const buildings = unwrap<AnyRecord[]>(raw?.buildings, "buildings", []);
  const inventories = raw?.inventories ?? {};
  const construction = raw?.construction ?? {};
  const research = unwrap<AnyRecord[]>(raw?.research, "technologies", []);
  const market = unwrap<AnyRecord[]>(raw?.market, "listings", []);
  const crafts = unwrap<AnyRecord[]>(raw?.crafts, "craftResults", []);
  const players = unwrap<AnyRecord[]>(raw?.players, "players", []);
  const region = unwrap<AnyRecord[]>(raw?.region, "claims", []);
  const layout = raw?.layout ?? {};
  return { claim, members, citizens, buildings, inventories, construction, research, market, crafts, players, region, layout };
}

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, icon, warn, onClick }: { label: string; value: React.ReactNode; icon: React.ReactNode; warn?: boolean; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp className={`stat ${warn ? "warn" : ""} ${onClick ? "clickable-stat" : ""}`} onClick={onClick}>
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </Comp>
  );
}

function ToolbarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="toolbar-button" onClick={onClick}>{children}</button>;
}

function Overview({ data, onNavigate }: { data: ReturnType<typeof normalizeData>; onNavigate: (panel: ActivePanel) => void }) {
  const { claim, members, buildings, market, construction, crafts, research } = data;
  const supplies = toNumber(claim.supplies);
  const treasury = toNumber(claim.treasury);
  const upkeep = toNumber(claim.upkeepCost);
  const suppliesPerDay = toNumber(claim.tileCost) * toNumber(claim.numTiles);
  const runOut = claim.suppliesRunOut ? new Date(toNumber(claim.suppliesRunOut)).toLocaleString() : "Unknown";
  const onlineCount = data.players.filter((player) => player.signedIn).length;
  const activeCrafts = crafts.filter((job) => {
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    return total > 0 && progress > 0 && progress < total;
  }).length;
  const constructionProjects = Array.isArray(construction) ? construction : (construction.projects ?? []);
  const activeProjects = constructionProjects.filter((project: AnyRecord) => toNumber(project.progress) < toNumber(project.actionsRequired || 0)).length;
  const researched = research.filter((item) => item.isResearched).length;
  const supplyDays = suppliesPerDay > 0 ? supplies / suppliesPerDay : 0;
  const treasuryDays = upkeep > 0 ? treasury / upkeep : 0;
  const supplyPct = Math.max(4, Math.min(100, supplyDays ? (Math.min(supplyDays, 14) / 14) * 100 : 0));
  const treasuryPct = Math.max(4, Math.min(100, treasuryDays ? (Math.min(treasuryDays, 14) / 14) * 100 : 0));
  const health = supplies < 2000 || (upkeep > 0 && treasury < upkeep * 7) ? "Needs Attention" : activeProjects || activeCrafts ? "Active" : "Stable";
  const attention = [
    supplies < 2000 ? { icon: <AlertTriangle />, title: "Low supplies", body: `${formatNumber(supplies)} supplies remaining`, panel: "inventory" as ActivePanel } : null,
    upkeep > 0 && treasury < upkeep * 7 ? { icon: <CircleDollarSign />, title: "Treasury runway", body: `${formatNumber(treasuryDays, 1)} days at current upkeep`, panel: "market" as ActivePanel } : null,
    activeProjects ? { icon: <Hammer />, title: "Construction active", body: `${activeProjects} project${activeProjects === 1 ? "" : "s"} in progress`, panel: "construction" as ActivePanel } : null,
    crafts.length ? { icon: <Factory />, title: "Production queue", body: `${activeCrafts} working, ${crafts.length} total job${crafts.length === 1 ? "" : "s"}`, panel: "production" as ActivePanel } : null,
    !market.length ? { icon: <ShoppingCart />, title: "No market listings", body: "No current settlement market activity", panel: "market" as ActivePanel } : null,
  ].filter(Boolean) as Array<{ icon: React.ReactNode; title: string; body: string; panel: ActivePanel }>;
  return (
    <div className="panel">
      <section className="overview-hero">
        <div>
          <span className={`health-pill ${health === "Needs Attention" ? "warn" : health === "Active" ? "active" : ""}`}>{health}</span>
          <h2>{claim.name ?? "Claim"} Command Center</h2>
          <p>Tier {claim.tier ?? "?"} settlement in {claim.regionName ?? "Unknown region"} - Owner {claim.ownerPlayerUsername ?? "Unknown"}</p>
        </div>
        <div className="hero-metrics">
          <button onClick={() => onNavigate("members")}><strong>{onlineCount}</strong><span>Online</span></button>
          <button onClick={() => onNavigate("buildings")}><strong>{buildings.length}</strong><span>Structures</span></button>
          <button onClick={() => onNavigate("market")}><strong>{market.length}</strong><span>Market</span></button>
        </div>
      </section>

      <div className="ops-grid">
        <section className="ops-card">
          <header><Box /><span>Supply Runway</span><strong>{supplyDays ? `${formatNumber(supplyDays, 1)}d` : "Unknown"}</strong></header>
          <div className="progress"><div style={{ width: `${supplyPct}%` }} /></div>
          <Info label="Current stock" value={formatNumber(supplies)} />
          <Info label="Supplies per day" value={formatNumber(suppliesPerDay, 2)} />
          <Info label="Runs out" value={runOut} />
        </section>
        <section className="ops-card">
          <header><CircleDollarSign /><span>Treasury Runway</span><strong>{upkeep ? `${formatNumber(treasuryDays, 1)}d` : "No upkeep"}</strong></header>
          <div className="progress"><div style={{ width: `${treasuryPct}%` }} /></div>
          <Info label="Treasury" value={`${formatNumber(treasury)}g`} />
          <Info label="Upkeep" value={`${formatNumber(upkeep, 2)}g/day`} />
          <Info label="Tiles" value={formatNumber(claim.numTiles)} />
        </section>
        <section className="ops-card">
          <header><Factory /><span>Work Queue</span><strong>{activeCrafts + activeProjects}</strong></header>
          <button className="ops-link" onClick={() => onNavigate("production")}><span>Production</span><strong>{activeCrafts} active / {crafts.length} jobs</strong></button>
          <button className="ops-link" onClick={() => onNavigate("construction")}><span>Construction</span><strong>{activeProjects} projects</strong></button>
          <button className="ops-link" onClick={() => onNavigate("research")}><span>Research</span><strong>{researched} complete</strong></button>
        </section>
      </div>

      <div className="overview-layout">
        <section className="attention-panel">
          <h3><AlertTriangle size={17} /> What Needs Attention</h3>
          {attention.length ? attention.map((item) => (
            <button key={item.title} onClick={() => onNavigate(item.panel)}>
              <span>{item.icon}</span>
              <strong>{item.title}</strong>
              <small>{item.body}</small>
            </button>
          )) : <p className="legend">No urgent settlement issues detected from the current snapshot.</p>}
        </section>
        <section className="detail-grid overview-details">
          {[
            ["Entity ID", claim.entityId],
            ["Region", `${claim.regionName ?? "Unknown"} (${claim.regionId ?? "?"})`],
            ["Empire", claim.empireName ?? "None"],
            ["Location", `${claim.locationX ?? "?"}, ${claim.locationZ ?? "?"}`],
            ["Members", `${members.length} total`],
            ["Market Listings", market.length],
          ].map(([label, value]) => <Info key={label} label={label} value={value} />)}
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <div className="info-row"><span>{label}</span><strong>{value ?? "-"}</strong></div>;
}

function Members({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const citizenMap = new Map(data.citizens.map((c) => [String(c.userName ?? c.username ?? ""), c]));
  const playerMap = new Map(data.players.map((p) => [String(p.username ?? ""), p]));
  const merged = data.members.map((member) => {
    const username = member.userName ?? member.username ?? "";
    return {
      ...member,
      username,
      citizen: citizenMap.get(String(username)) ?? null,
      player: playerMap.get(String(username)) ?? null,
    };
  });
  const filtered = merged.filter((member) => String(member.username).toLowerCase().includes(searchTerm.toLowerCase()));
  const onlineCount = merged.filter((member) => member.player?.signedIn).length;

  return (
    <div className="panel">
      <div className="split-header">
        <Header title="Settlement Roster">Member permissions and online status</Header>
        <p className="online-summary"><strong>{onlineCount} online</strong> / {merged.length} members</p>
      </div>
      <div className="toolbar-row">
        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search username" />
        <span>{filtered.length} members found</span>
      </div>
      <DataTable
        rows={filtered}
        columns={[
          ["", (m) => <span className={`online-dot ${m.player?.signedIn ? "is-online" : ""}`} title={m.player?.signedIn ? `Online ${formatDuration(m.player.sessionSeconds)}` : "Offline"} />],
          ["Username", (m) => <strong>{m.username}</strong>],
          ["Role", (m) => <span className={`role-badge ${m.coOwnerPermission ? "owner" : m.officerPermission ? "officer" : ""}`}>{m.coOwnerPermission ? "Co-owner" : m.officerPermission ? "Officer" : "Member"}</span>],
          ["Skill Lvl", (m) => formatNumber(m.citizen?.totalLevel ?? m.citizen?.totalSkillLevel)],
          ["Session / Last Login", (m) => m.player?.signedIn ? <span className="online-text">Playing {formatDuration(m.player.sessionSeconds)}</span> : timeAgo(m.lastLoginTimestamp)],
          ["Permissions", (m) => <span className="permission-icons"><Hammer className={m.buildPermission ? "enabled" : ""} /><Package className={m.inventoryPermission ? "enabled blue" : ""} /></span>],
        ]}
      />
    </div>
  );
}

function Skills({ data }: { data: ReturnType<typeof normalizeData> }) {
  type SortKey = "name" | "total" | "highest" | number;
  const [searchTerm, setSearchTerm] = React.useState("");
  const [focusSkill, setFocusSkill] = React.useState<number>(SKILL_IDS[0]);
  const [sortKey, setSortKey] = React.useState<SortKey>("total");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const citizens = data.citizens;
  const getName = (c: AnyRecord) => c.userName ?? c.username ?? "Unknown";
  const getSkill = (c: AnyRecord, id: number) => toNumber(c.skills?.[String(id)]);
  const getTotal = (c: AnyRecord) => toNumber(c.totalLevel ?? c.totalSkillLevel);
  const getHighest = (c: AnyRecord) => toNumber(c.highestLevel ?? c.highestSkillLevel);
  const getXP = (c: AnyRecord) => toNumber(c.totalXP ?? c.totalXp);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => dir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = citizens.filter((citizen) => getName(citizen).toLowerCase().includes(searchTerm.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "name") {
      return sortDir === "asc" ? getName(a).localeCompare(getName(b)) : getName(b).localeCompare(getName(a));
    }
    const va = sortKey === "total" ? getTotal(a) : sortKey === "highest" ? getHighest(a) : getSkill(a, sortKey);
    const vb = sortKey === "total" ? getTotal(b) : sortKey === "highest" ? getHighest(b) : getSkill(b, sortKey);
    return sortDir === "asc" ? va - vb : vb - va;
  });

  const settlementTotalXP = citizens.reduce((sum, c) => sum + getXP(c), 0);
  const settlementTotalLevel = citizens.reduce((sum, c) => sum + getTotal(c), 0);
  const settlementBest = Math.max(...citizens.map(getHighest), 0);
  const averageTotal = citizens.length ? settlementTotalLevel / citizens.length : 0;
  const topMember = sorted[0] ? getName(sorted[0]) : "-";
  const focusRows = [...citizens].sort((a, b) => getSkill(b, focusSkill) - getSkill(a, focusSkill)).slice(0, 5);
  const focusAverage = citizens.length ? citizens.reduce((sum, c) => sum + getSkill(c, focusSkill), 0) / citizens.length : 0;
  const focusTier = Math.max(...citizens.map((c) => skillTier(getSkill(c, focusSkill))), 0);
  const focusT3 = citizens.filter((c) => skillTier(getSkill(c, focusSkill)) >= 3).length;
  const focusT5 = citizens.filter((c) => skillTier(getSkill(c, focusSkill)) >= 5).length;
  const coverage = SKILL_IDS.map((id) => {
    const levels = citizens.map((c) => getSkill(c, id));
    const max = Math.max(...levels, 0);
    const avg = citizens.length ? levels.reduce((sum, level) => sum + level, 0) / citizens.length : 0;
    const tier = skillTier(max);
    const specialists = levels.filter((level) => skillTier(level) >= 5).length;
    return { id, name: SKILL_NAMES[id], max, avg, tier, specialists };
  }).sort((a, b) => b.max - a.max || b.avg - a.avg);
  const sortIcon = (key: SortKey) => sortKey !== key ? <ArrowUpDown size={11} /> : sortDir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />;

  return (
    <div className="panel">
      <Header title="Member Skills">{citizens.length} citizens - {formatNumber(settlementTotalXP)} total XP</Header>
      <div className="summary-grid skills-summary">
        <MiniStat icon={<TrendingUp />} label="Settlement Total Level" value={formatNumber(settlementTotalLevel)} />
        <MiniStat icon={<Star />} label="Highest Skill" value={settlementBest} />
        <MiniStat icon={<Activity />} label="Average Total Level" value={formatNumber(averageTotal, 1)} />
        <MiniStat icon={<Swords />} label="Top Member" value={topMember} />
      </div>
      <div className="skills-dashboard">
        <section className="focus-panel">
          <div className="split-header">
            <h3><Star size={17} /> Skill Focus</h3>
            <select className="select-control" value={focusSkill} onChange={(event) => setFocusSkill(Number(event.target.value))}>
              {SKILL_IDS.map((id) => <option key={id} value={id}>{SKILL_NAMES[id]}</option>)}
            </select>
          </div>
          <div className="focus-metrics">
            <Info label="Average level" value={formatNumber(focusAverage, 1)} />
            <Info label="Best tier" value={focusTier ? `T${focusTier}` : "-"} />
            <Info label="T3+" value={`${focusT3} members`} />
            <Info label="T5+" value={`${focusT5} members`} />
          </div>
          <div className="focus-list">
            {focusRows.map((citizen) => {
              const level = getSkill(citizen, focusSkill);
              return <div key={citizen.entityId ?? getName(citizen)}><span>{getName(citizen)}</span><strong>Lv {level}</strong></div>;
            })}
          </div>
        </section>
        <section className="coverage-panel">
          <h3><Swords size={17} /> Skill Coverage</h3>
          <div className="coverage-list">
            {coverage.slice(0, 8).map((skill) => (
              <button key={skill.id} className={focusSkill === skill.id ? "active" : ""} onClick={() => setFocusSkill(skill.id)}>
                <span>{skill.name}</span>
                <b>{skill.tier ? `T${skill.tier}` : "-"} / Lv {skill.max}</b>
                <small>Avg {formatNumber(skill.avg, 1)} - {skill.specialists} at T5+</small>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="toolbar-row">
        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search members" />
        <span>{sorted.length} shown</span>
      </div>
      <div className="heatmap-wrap">
        <table className="skill-table">
          <thead>
            <tr>
              <th className="sticky-col name-spacer" />
              <th />
              <th />
              {SKILL_IDS.map((id) => (
                <th key={id} className={sortKey === id ? "sorted" : ""} onClick={() => toggleSort(id)} title={SKILL_NAMES[id]}>
                  <span className="vertical-label">{SKILL_NAMES[id]}</span>
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky-col clickable" onClick={() => toggleSort("name")}>Member {sortIcon("name")}</th>
              <th className="clickable numeric" onClick={() => toggleSort("total")}>Total {sortIcon("total")}</th>
              <th className="clickable numeric" onClick={() => toggleSort("highest")}>Best {sortIcon("highest")}</th>
              {SKILL_IDS.map((id) => <th key={id} className="clickable center" onClick={() => toggleSort(id)}>{sortIcon(id)}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((citizen, index) => {
              const name = getName(citizen);
              return (
                <tr key={citizen.entityId ?? name ?? index}>
                  <td className="sticky-col member-cell">{name}</td>
                  <td className="numeric">{formatNumber(getTotal(citizen))}</td>
                  <td className="numeric best">{getHighest(citizen)}</td>
                  {SKILL_IDS.map((id) => {
                    const level = getSkill(citizen, id);
                    return <td key={id} className={`skill-cell ${levelClass(level)}`} style={skillStyle(level)} title={`${name} - ${SKILL_NAMES[id]}: Lv ${level} (${skillTierLabel(level)})`}>{level > 0 ? level : "-"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky-col member-cell">Settlement Max</td>
              <td className="numeric">-</td>
              <td className="numeric best">{settlementBest}</td>
              {SKILL_IDS.map((id) => {
                const max = Math.max(...citizens.map((c) => getSkill(c, id)), 0);
                return <td key={id} className={`skill-cell ${levelClass(max)}`} style={skillStyle(max)} title={`${SKILL_NAMES[id]} max: Lv ${max} (${skillTierLabel(max)})`}>{max > 0 ? max : "-"}</td>;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="legend">Skill tiers: <span className="lvl0">0</span> <span className="lvl1">T1 1-19</span> <span className="lvl2">T2-T5</span> <span className="lvl3">T6-T8</span> <span className="lvl4">T9-T10</span> - cells show exact level, hover for tier</p>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="mini-stat"><div>{icon}</div><span>{label}</span><strong>{value}</strong></div>;
}

function skillStyle(level: number): React.CSSProperties {
  if (level <= 0) return {};
  const t = Math.min(1, skillTier(level) / 10);
  if (t < 0.25) return { backgroundColor: `rgba(51,65,85,${0.15 + t * 0.6})` };
  if (t < 0.6) return { backgroundColor: `rgba(120,53,15,${0.1 + t * 0.4})` };
  return { backgroundColor: `rgba(180,83,9,${0.2 + t * 0.45})` };
}

function skillTier(level: number): number {
  if (level <= 0) return 0;
  if (level < 20) return 1;
  return Math.min(10, Math.floor(level / 10));
}

function skillTierLabel(level: number): string {
  const tier = skillTier(level);
  if (!tier) return "No tier";
  const low = tier === 1 ? 0 : tier * 10;
  const high = tier === 10 ? 100 : tier * 10 - 1;
  return `T${tier} (${low}-${high})`;
}

function levelClass(level: number): string {
  const tier = skillTier(level);
  if (tier <= 0) return "lvl0";
  if (tier <= 2) return "lvl1";
  if (tier <= 5) return "lvl2";
  if (tier <= 8) return "lvl3";
  return "lvl4";
}

function getRarityClass(rarity: unknown): string {
  switch (String(rarity ?? "").toLowerCase()) {
    case "legendary":
      return "legendary";
    case "epic":
      return "epic";
    case "rare":
      return "rare";
    case "uncommon":
      return "uncommon";
    default:
      return "";
  }
}

function Buildings({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const [tier, setTier] = React.useState("All");
  const [sort, setSort] = React.useState("name");
  const categories = ["All", "Crafting", "Refining", "Storage", "Housing", "Trade", "Core", "Utility", "Decoration"];
  const tiers = ["All", "1", "2", "3", "4", "5"];
  const buildings = data.buildings.map(normalizeBuilding);
  const filtered = buildings
    .filter((building) => {
      const text = `${building.name} ${building.nickname}`.toLowerCase();
      if (searchTerm && !text.includes(searchTerm.toLowerCase())) return false;
      if (category !== "All" && building.category !== category) return false;
      if (tier !== "All" && String(building.tier ?? "") !== tier) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "tier") return toNumber(b.tier) - toNumber(a.tier);
      if (sort === "crafting") return b.craftingSlots - a.craftingSlots;
      if (sort === "storage") return b.storageSlots - a.storageSlots;
      return a.name.localeCompare(b.name);
    });
  const groupedBuildings = categories
    .filter((item) => item !== "All")
    .map((item) => ({ category: item, buildings: filtered.filter((building) => building.category === item) }))
    .filter((group) => group.buildings.length > 0);
  const stationSummary = [
    ["Craft", sum(buildings, "craftingSlots"), buildings.filter((building) => building.craftingSlots > 0).length],
    ["Refine", sum(buildings, "refiningSlots"), buildings.filter((building) => building.refiningSlots > 0).length],
    ["Store", sum(buildings, "storageSlots"), buildings.filter((building) => building.storageSlots > 0).length],
    ["Housing", sum(buildings, "housingSlots"), buildings.filter((building) => building.housingSlots > 0).length],
  ];

  return (
    <div className="panel">
      <Header title="Structures">{buildings.length} structures - {filtered.length} shown</Header>
      <div className="metric-grid">
        <MiniStat icon={<Wrench />} label="Structures" value={buildings.length} />
        <MiniStat icon={<Hammer />} label="Crafting" value={sum(buildings, "craftingSlots")} />
        <MiniStat icon={<Flame />} label="Refining" value={sum(buildings, "refiningSlots")} />
        <MiniStat icon={<Package />} label="Storage" value={sum(buildings, "storageSlots")} />
        <MiniStat icon={<Bed />} label="Housing" value={sum(buildings, "housingSlots")} />
        <MiniStat icon={<ShoppingBag />} label="Trade" value={sum(buildings, "tradeOrders")} />
      </div>
      <div className="toolbar-row">
        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search structures" />
        <Segmented options={categories} value={category} onChange={setCategory} />
        <Segmented options={tiers} value={tier} onChange={setTier} label="Tier" />
        <select className="select-control" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="name">Name</option>
          <option value="tier">Tier</option>
          <option value="crafting">Crafting Slots</option>
          <option value="storage">Storage Slots</option>
        </select>
      </div>
      <div className="highlight-grid">
        {stationSummary.map(([label, slots, count]) => <div key={label}><strong>{label}</strong><span>{formatNumber(slots)} slots across {formatNumber(count)} structures</span></div>)}
      </div>
      <div className="building-sections">
        {groupedBuildings.map((group) => (
          <section className="building-section" key={group.category}>
            <h3><span className={`category-dot ${group.category.toLowerCase()}`} />{group.category}<small>{group.buildings.length}</small></h3>
            <div className="building-grid">
              {group.buildings.map((building) => (
                <article className="building-card" key={building.entityId}>
                  <header><strong>{building.name}</strong>{building.tier ? <b>T{building.tier}</b> : null}</header>
                  {building.nickname ? <p>"{building.nickname}"</p> : null}
                  <div className="slot-row">
                    <Slot icon={<Hammer />} label="craft" value={building.craftingSlots} />
                    <Slot icon={<Flame />} label="refine" value={building.refiningSlots} />
                    <Slot icon={<Package />} label="store" value={building.storageSlots} />
                    <Slot icon={<Package />} label="cargo" value={building.cargoSlots} />
                    <Slot icon={<Bed />} label="house" value={building.housingSlots} />
                    <Slot icon={<ShoppingBag />} label="trade" value={building.tradeOrders} />
                    {building.terraformCapable ? <Slot icon={<MapIcon />} label="terraform" value={1} /> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function inferTierNumber(item: AnyRecord): number | null {
  const icon = String(item.iconAssetName ?? "");
  const match = icon.match(/T(\d)/i);
  return match ? Number(match[1]) : item.tier ? Number(item.tier) : null;
}

function normalizeBuilding(building: AnyRecord) {
  const fn = building.functions?.[0] ?? {};
  const normalized = {
    entityId: String(building.entityId ?? building.buildingEntityId ?? building.name),
    name: String(building.name ?? building.buildingName ?? "Unknown"),
    nickname: building.nickname ?? building.buildingNickname ?? null,
    tier: inferTierNumber(building),
    craftingSlots: toNumber(building.craftingSlots ?? fn.crafting_slots),
    refiningSlots: toNumber(building.refiningSlots ?? fn.refining_slots),
    storageSlots: toNumber(building.storageSlots ?? fn.storage_slots),
    cargoSlots: toNumber(building.cargoSlots ?? fn.cargo_slots),
    housingSlots: toNumber(building.housingSlots ?? fn.housing_slots),
    tradeOrders: toNumber(building.tradeOrders ?? fn.trade_orders),
    terraformCapable: Boolean(building.terraformCapable ?? fn.terraform),
    category: "Utility",
  };
  normalized.category = getBuildingCategory(normalized);
  return normalized;
}

function getBuildingCategory(building: ReturnType<typeof normalizeBuilding>): string {
  const name = building.name.toLowerCase();
  if (building.storageSlots > 0) return "Storage";
  if (building.housingSlots > 0) return "Housing";
  if (building.tradeOrders > 0) return "Trade";
  if (building.refiningSlots > 0) return "Refining";
  if (building.craftingSlots > 0) return "Crafting";
  if (name.includes("totem") || name.includes("settlement")) return "Core";
  if (name.includes("statue") || name.includes("shrine")) return "Decoration";
  return "Utility";
}

function sum(rows: Array<Record<string, any>>, key: string): number {
  return rows.reduce((total, row) => total + toNumber(row[key]), 0);
}

function getOwnerName(row: AnyRecord): string {
  return String(row.ownerPlayerUsername ?? row.ownerUsername ?? row.ownerName ?? row.owner ?? row.empireName ?? "-");
}

function Slot({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  if (!value) return null;
  return <span className="slot-chip">{icon}<strong>{value}</strong>{label}</span>;
}

function Segmented({ options, value, onChange, label }: { options: string[]; value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <div className="segmented" aria-label={label}>
      {label ? <span>{label}:</span> : null}
      {options.map((option) => <button key={option} className={value === option ? "active" : ""} onClick={() => onChange(option)}>{option}</button>)}
    </div>
  );
}

const MATERIAL_WATCHLIST = [
  { label: "Planks", terms: ["plank"] },
  { label: "Bricks", terms: ["brick"] },
  { label: "Leather", terms: ["leather", "hide"] },
  { label: "Ingots", terms: ["ingot", "bar"] },
  { label: "Stone", terms: ["stone", "rock"] },
  { label: "Logs", terms: ["log", "wood"] },
  { label: "Cloth", terms: ["cloth", "fabric", "textile"] },
  { label: "Fiber", terms: ["fiber", "flax", "cotton"] },
  { label: "Fuel", terms: ["fuel", "charcoal", "coal"] },
] as const;

function Inventory({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [q, setQ] = React.useState("");
  const [containerQ, setContainerQ] = React.useState("");
  const [type, setType] = React.useState("All");
  const [tier, setTier] = React.useState("All");
  const [rarity, setRarity] = React.useState("All");
  const [buildingFilter, setBuildingFilter] = React.useState("All");
  const [nonEmptyOnly, setNonEmptyOnly] = React.useState(true);
  const [referenceMaterials, setReferenceMaterials] = React.useState<AnyRecord[]>([]);
  const [referenceError, setReferenceError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${LOCAL_API}/reference/materials`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`materials HTTP ${response.status}`)))
      .then((payload) => { setReferenceMaterials(payload.materials ?? []); setReferenceError(null); })
      .catch((error) => { if (!controller.signal.aborted) setReferenceError(error instanceof Error ? error.message : String(error)); });
    return () => controller.abort();
  }, []);
  const itemLookup = new Map([...(data.inventories.items ?? []), ...(data.inventories.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const containers = ((data.inventories.buildings ?? []) as AnyRecord[]).map((building) => {
    const items = (building.inventory ?? []).map((slot: AnyRecord, index: number) => {
      const contents = slot.contents ?? {};
      const lookup = itemLookup.get(String(contents.item_id)) ?? {};
      return {
        id: `${building.entityId}-${contents.item_id}-${slot.slot ?? index}`,
        building: building.buildingNickname ?? building.buildingName,
        itemId: contents.item_id == null ? null : String(contents.item_id),
        name: lookup.name ?? `Item #${contents.item_id ?? "?"}`,
        quantity: contents.quantity,
        type: contents.item_type === "cargo" ? "Cargo" : "Item",
        tier: lookup.tier,
        rarity: lookup.rarityStr,
        tag: lookup.tag,
        volume: slot.volume != null ? Number(slot.volume) / 1000 : null,
      };
    });
    return {
      id: String(building.entityId ?? building.buildingName),
      name: building.buildingNickname ?? building.buildingName ?? "Unknown Container",
      locked: Boolean(building.locked),
      items,
    };
  });
  const allRows = containers.flatMap((container) => container.items);
  const materialSource: AnyRecord[] = referenceMaterials.length ? referenceMaterials : MATERIAL_WATCHLIST.map((group) => ({ ...group }));
  const materialSummary: AnyRecord[] = materialSource.map((group): AnyRecord => {
    const matches = allRows.filter((row: AnyRecord) => {
      if (group.itemId && row.itemId === String(group.itemId)) return true;
      const haystack = `${row.name ?? ""} ${row.tag ?? ""}`.toLowerCase();
      return (group.terms ?? [group.name ?? group.label]).some((term: string) => haystack.includes(String(term).toLowerCase()));
    });
    const quantity = matches.reduce((total: number, row: AnyRecord) => total + toNumber(row.quantity), 0);
    const containerCount = new Set(matches.map((row: AnyRecord) => row.building).filter(Boolean)).size;
    const topItems = (Object.entries(matches.reduce((acc: Record<string, number>, row: AnyRecord) => {
      const name = String(row.name ?? "Unknown");
      acc[name] = (acc[name] ?? 0) + toNumber(row.quantity);
      return acc;
    }, {})) as Array<[string, number]>).sort((a, b) => b[1] - a[1]).slice(0, 2);
    return { ...group, label: group.label ?? group.name, quantity, containerCount, topItems };
  }).filter((group: AnyRecord) => group.quantity > 0)
    .sort((a: AnyRecord, b: AnyRecord) => toNumber(b.usedInRecipes) - toNumber(a.usedInRecipes) || toNumber(b.quantity) - toNumber(a.quantity))
    .slice(0, 18);
  const filteredContainers = containers.map((container) => ({
    ...container,
    items: container.items.filter((row: AnyRecord) => {
      if (q && !row.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (type !== "All" && row.type !== type) return false;
      if (tier !== "All" && String(row.tier) !== tier) return false;
      if (rarity !== "All" && row.rarity !== rarity) return false;
      if (buildingFilter !== "All" && row.building !== buildingFilter) return false;
      return true;
    }),
  })).filter((container) => {
    if (containerQ && !container.name.toLowerCase().includes(containerQ.toLowerCase())) return false;
    if (nonEmptyOnly && container.items.length === 0) return false;
    return true;
  });
  const rows = filteredContainers.flatMap((container) => container.items);
  const buildings = unique(allRows.map((row: AnyRecord) => String(row.building)).filter(Boolean));
  const tiers = unique(allRows.map((row: AnyRecord) => String(row.tier)).filter((value: string) => value && value !== "undefined" && value !== "-1" && value !== "0"));
  const rarities = unique(allRows.map((row: AnyRecord) => String(row.rarity)).filter((value: string) => value && value !== "undefined" && value !== "Default"));
  const totalItems = rows.reduce((total: number, row: AnyRecord) => total + toNumber(row.quantity), 0);
  const totalVolume = rows.reduce((total: number, row: AnyRecord) => total + toNumber(row.volume) * toNumber(row.quantity), 0);
  return (
    <div className="panel">
      <Header title="Inventory & Storage">{containers.length} containers - {rows.length} visible stacks</Header>
      <div className="metric-grid">
        <MiniStat icon={<Package />} label="Total Items" value={formatNumber(totalItems)} />
        <MiniStat icon={<Box />} label="Unique Items" value={unique(rows.map((row: AnyRecord) => String(row.name))).length} />
        <MiniStat icon={<Package />} label="Total Volume" value={formatCompact(totalVolume)} />
        <MiniStat icon={<Building2 />} label="Containers" value={containers.length} />
      </div>
      <section className="material-watch">
        <div className="split-header">
          <h3><Package size={17} /> Recipe-Relevant Materials</h3>
          <p className="legend">{referenceError ? "Using fallback material groups." : "Ranked from BitCraft Sync recipe inputs."} Totals are across all containers.</p>
        </div>
        <div className="material-watch-grid">
          {materialSummary.length ? materialSummary.map((group) => (
            <article className={`material-card ${group.quantity ? "" : "empty"}`} key={group.label}>
              <span>{group.tier && toNumber(group.tier) > 0 ? `T${group.tier} ` : ""}{group.label}</span>
              <strong>{formatNumber(group.quantity)}</strong>
              <small>{group.containerCount ? `${group.containerCount} container${group.containerCount === 1 ? "" : "s"}` : "None found"}{group.usedInRecipes ? ` - ${formatNumber(group.usedInRecipes)} recipes` : ""}</small>
              {group.examples?.length ? <em>Used for {group.examples.slice(0, 2).join(" / ")}</em> : group.topItems.length ? <em>{group.topItems.map(([name, qty]: [string, number]) => `${name} ${formatNumber(qty)}`).join(" / ")}</em> : null}
            </article>
          )) : <p className="legend">No tracked recipe materials found in storage.</p>}
        </div>
      </section>
      <div className="toolbar-row">
        <SearchBox value={q} onChange={setQ} placeholder="Search inventory" />
        <SearchBox value={containerQ} onChange={setContainerQ} placeholder="Search containers" />
        <select className="select-control" value={type} onChange={(event) => setType(event.target.value)}>
          <option>All</option><option>Item</option><option>Cargo</option>
        </select>
        <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}>
          <option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}>
          <option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select className="select-control" value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}>
          <option>All</option>{buildings.map((value) => <option key={value}>{value}</option>)}
        </select>
        <label className="check-control"><input type="checkbox" checked={nonEmptyOnly} onChange={(event) => setNonEmptyOnly(event.target.checked)} /> Non-empty only</label>
      </div>
      <div className="container-list">
        {filteredContainers.map((container) => {
          const quantity = container.items.reduce((total: number, item: AnyRecord) => total + toNumber(item.quantity), 0);
          const volume = container.items.reduce((total: number, item: AnyRecord) => total + toNumber(item.volume) * toNumber(item.quantity), 0);
          return (
            <details className="container-card" key={container.id} open={filteredContainers.length <= 4}>
              <summary>
                <span><Package size={16} /> <strong>{container.name}</strong>{container.locked ? <Lock size={13} /> : null}</span>
                <small>{container.items.length} stacks - {formatNumber(quantity)} items - {formatCompact(volume)} volume</small>
              </summary>
              <DataTable rows={container.items} columns={[
                ["Item", (r) => <span><strong>{r.name}</strong>{r.tag ? <small className="muted-line">{r.tag}</small> : null}</span>],
                ["Qty", (r) => formatNumber(r.quantity)],
                ["Tier", (r) => r.tier ? `T${r.tier}` : "-"],
                ["Rarity", (r) => r.rarity ? <span className={`role-badge ${getRarityClass(r.rarity)}`}>{r.rarity}</span> : "-"],
                ["Type", (r) => r.type],
                ["Volume", (r) => r.volume != null ? formatCompact(toNumber(r.volume) * toNumber(r.quantity)) : "-"],
              ]} />
            </details>
          );
        })}
      </div>
    </div>
  );
}
function Construction({ data }: { data: ReturnType<typeof normalizeData> }) {
  const itemLookup = new Map([...(data.construction.items ?? []), ...(data.construction.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const projects: AnyRecord[] = (data.construction.projects ?? []).map((project: AnyRecord) => ({
    ...project,
    name: project.recipeName ?? project.buildingName ?? project.entityId,
    materials: [...(project.items ?? []), ...(project.cargos ?? [])].map((mat: AnyRecord) => ({
      name: itemLookup.get(String(mat.item_id))?.name ?? `Item #${mat.item_id}`,
      required: toNumber(mat.quantity),
      available: 0,
    })),
  }));
  const needed = Object.entries((projects.flatMap((project: AnyRecord) => project.materials) as AnyRecord[]).reduce((acc: Record<string, number>, mat: AnyRecord) => {
    acc[mat.name] = (acc[mat.name] ?? 0) + Math.max(0, mat.required - mat.available);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <div className="panel">
      <Header title="Construction Projects">{projects.length} active project{projects.length === 1 ? "" : "s"}</Header>
      {needed.length ? (
        <section className="warning-section">
          <h3><AlertTriangle size={17} /> What to Gather Next</h3>
          <div className="gather-grid">{needed.map(([name, amount]) => <MiniStat key={name} icon={<Package />} label={name} value={formatNumber(amount)} />)}</div>
        </section>
      ) : null}
      <div className="project-list">
        {projects.length ? projects.map((project: AnyRecord) => {
          const progress = toNumber(project.progress);
          const total = toNumber(project.actionsRequired) || 1;
          const pct = Math.min(100, Math.round((progress / total) * 100));
          return (
            <article className="project-card" key={project.entityId}>
              <header><Hammer /><strong>{project.name}</strong><span>{pct}%</span></header>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
              <div className="material-grid">
                {project.materials.map((mat: AnyRecord, index: number) => <div key={index}><strong>{mat.name}</strong><span>{formatNumber(mat.available)} / {formatNumber(mat.required)} - need {formatNumber(mat.required - mat.available)}</span></div>)}
              </div>
            </article>
          );
        }) : <div className="empty-state"><Hammer />No active construction projects.</div>}
      </div>
    </div>
  );
}

function Research({ data }: { data: ReturnType<typeof normalizeData> }) {
  const researched = data.research.filter((item) => item.isResearched);
  const available = data.research.filter((item) => !item.isResearched);
  const card = (item: AnyRecord, done: boolean) => <div className={`research-card ${done ? "done" : ""}`} key={item.entityId ?? item.id ?? item.name}><span>{done ? <CheckCircle2 /> : <Circle />}</span><strong>{item.name ?? item.techName ?? item.id ?? "Unknown Technology"}</strong>{item.tier ? <b>T{item.tier}</b> : null}</div>;
  return <div className="panel"><Header title="Research & Technology">{researched.length} researched - {available.length} available to unlock</Header><div className="two-col"><section><h3><CheckCircle2 size={17} /> Researched ({researched.length})</h3>{researched.map((item) => card(item, true))}</section><section><h3><Lock size={17} /> Available ({available.length})</h3>{available.map((item) => card(item, false))}</section></div></div>;
}

function Market({ data, history, claimId, onHistoryChanged }: { data: ReturnType<typeof normalizeData>; history: AnyRecord | null; claimId: string; onHistoryChanged: () => void }) {
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState<"live" | "analytics">("live");
  const [tab, setTab] = React.useState<"sell" | "buy">("sell");
  const [tier, setTier] = React.useState("All");
  const [rarity, setRarity] = React.useState("All");
  const [memberFilter, setMemberFilter] = React.useState("All");
  const [resolveMessage, setResolveMessage] = React.useState<string | null>(null);
  const memberOptions = React.useMemo(() => {
    const names = [
      ...data.members.map((member) => member.username ?? member.playerUsername ?? member.name),
      ...data.market.map((listing) => listing.ownerUsername ?? listing.owner ?? listing.ownerName),
      ...(history?.events ?? []).map((event: AnyRecord) => event.owner),
    ].filter(Boolean).map(String);
    return unique(names).sort((a, b) => a.localeCompare(b));
  }, [data.members, data.market, history?.events]);
  const ownerMatches = React.useCallback((owner: unknown) => memberFilter === "All" || String(owner ?? "").toLowerCase() === memberFilter.toLowerCase(), [memberFilter]);
  const all = data.market.filter((listing) => ownerMatches(listing.ownerUsername ?? listing.owner ?? listing.ownerName));
  const trackedLiveListings = React.useMemo(
    () => new Map<string, AnyRecord>((history?.liveListings ?? []).map((listing: AnyRecord) => [String(listing.listing_key), listing])),
    [history?.liveListings],
  );
  const listingListedAt = (listing: AnyRecord) => listingDate(listing, trackedLiveListings.get(listingTrackingKey(listing))?.first_seen);
  const sellOrders = all.filter((m) => String(m.side ?? m.orderType ?? "sell").toLowerCase().includes("sell"));
  const buyOrders = all.filter((m) => String(m.side ?? m.orderType ?? "").toLowerCase().includes("buy"));
  const current = tab === "sell" ? (sellOrders.length ? sellOrders : all) : buyOrders;
  const tiers = unique(all.map((m) => String(m.itemTier ?? m.tier)).filter((value) => value && value !== "undefined"));
  const rarities = unique(all.map((m) => m.itemRarityStr ?? m.rarity).filter(Boolean));
  const rows = current.filter((m) => {
    if (q && !String(m.itemName ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (tier !== "All" && String(m.itemTier ?? m.tier) !== tier) return false;
    if (rarity !== "All" && (m.itemRarityStr ?? m.rarity) !== rarity) return false;
    return true;
  });
  const highest = [...all].sort((a, b) => toNumber(b.price) * toNumber(b.quantity || 1) - toNumber(a.price) * toNumber(a.quantity || 1)).slice(0, 3);
  const events = (history?.events ?? []).filter((event: AnyRecord) => ownerMatches(event.owner));
  const saleEvents = events.filter((event: AnyRecord) => ["sale", "partial_sale"].includes(String(event.event_type)));
  const topItems = buildMarketTopItems(saleEvents);
  const daily = buildMarketDaily(saleEvents);
  const totals = buildMarketTotals(events);
  const pending = (history?.pending ?? []).filter((event: AnyRecord) => ownerMatches(event.owner));
  const maxDailyValue = Math.max(...daily.map((row: AnyRecord) => toNumber(row.totalValue)), 1);
  const filterLabel = memberFilter === "All" ? "all members" : memberFilter;
  async function markCancelled(event: AnyRecord) {
    setResolveMessage(null);
    try {
      const response = await fetch(`${LOCAL_API}/market/event/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, claimId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setResolveMessage("Marked as cancelled.");
      onHistoryChanged();
    } catch (error) {
      setResolveMessage(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <div className="panel">
      <Header title="Market">{all.length} live listings - {formatNumber(totals.confirmedSales)} confirmed sales tracked locally for {filterLabel}</Header>
      <div className="toolbar-row">
        <label className="inline-field">
          <span>Member</span>
          <select className="select-control" value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)}>
            <option>All</option>
            {memberOptions.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <div className="tabs primary-tabs">
        <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}><ShoppingCart size={15} /> Live Listings</button>
        <button className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><TrendingUp size={15} /> Analytics</button>
      </div>
      {view === "analytics" ? (
        <>
          <div className="metric-grid">
            <MiniStat icon={<ShoppingCart />} label="New Listings" value={formatNumber(totals.newListings)} />
            <MiniStat icon={<TrendingDown />} label="Confirmed Sales" value={formatNumber(totals.confirmedSales)} />
            <MiniStat icon={<AlertTriangle />} label="Removed/Unknown" value={formatNumber(toNumber(totals.removedOrCancelled) + toNumber(totals.unconfirmedQuantityDrops))} />
            <MiniStat icon={<CircleDollarSign />} label="Confirmed Value" value={`${formatNumber(totals.trackedValue)}g`} />
          </div>
          <div className="two-col market-analytics">
            <section>
              <h3><Star size={17} /> What Moves Most</h3>
              <DataTable rows={topItems} columns={[
                ["Item", r => r.itemName],
                ["Sales", r => formatNumber(r.soldCount)],
                ["Confirmed Value", r => `${formatNumber(r.totalValue)}g`],
                ["Avg Price", r => `${formatNumber(r.avgPrice)}g`],
                ["Last Seen", r => dateLabel(r.lastSoldAt)],
              ]} />
            </section>
            <section>
              <h3><TrendingUp size={17} /> Sales Trend</h3>
              <div className="bar-panel compact-bars">
                {daily.length ? daily.map((row: AnyRecord) => <div className="bar-row" key={row.day}><span>{row.day}</span><div><i style={{ width: `${(toNumber(row.totalValue) / maxDailyValue) * 100}%` }} /></div><b>{formatNumber(row.soldCount)} / {formatNumber(row.totalValue)}g</b></div>) : <p className="legend">History will build as the app refreshes.</p>}
              </div>
            </section>
          </div>
          {pending.length ? (
            <section className="warning-section">
              <h3><AlertTriangle size={17} /> Unconfirmed Quantity Drops ({pending.length})</h3>
              {resolveMessage ? <p className="legend">{resolveMessage}</p> : null}
              <DataTable rows={pending} columns={[
                ["When", r => dateLabel(r.occurred_at)],
                ["Status", r => String(r.event_type).replaceAll("_", " ")],
                ["Item", r => r.item_name],
                ["Qty", r => formatNumber(r.quantity)],
                ["Price", r => `${formatNumber(r.price)}g`],
                ["Owner", r => r.owner ?? "-"],
                ["Action", r => <button className="mini-action" onClick={() => markCancelled(r)}>Mark Cancelled</button>],
              ]} />
            </section>
          ) : null}
          <DataTable rows={events} columns={[
            ["When", r => dateLabel(r.occurred_at ?? r.occurredAt)],
            ["Event", r => String(r.event_type ?? "").replaceAll("_", " ")],
            ["Item", r => r.item_name ?? r.itemName],
            ["Qty", r => formatNumber(r.quantity)],
            ["Price", r => `${formatNumber(r.price)}g`],
            ["Value", r => `${formatNumber(r.total_value ?? r.totalValue)}g`],
            ["Owner", r => r.owner ?? "-"],
          ]} />
        </>
      ) : (
        <>
      <div className="metric-grid">
        <MiniStat icon={<ShoppingCart />} label="Visible Listings" value={all.length} />
        <MiniStat icon={<TrendingDown />} label="Sell Orders" value={sellOrders.length || all.length} />
        <MiniStat icon={<TrendingUp />} label="Buy Orders" value={buyOrders.length} />
        <MiniStat icon={<CircleDollarSign />} label="Top Value" value={highest[0] ? `${formatNumber(toNumber(highest[0].price) * toNumber(highest[0].quantity || 1))}g` : "-"} />
      </div>
      <div className="highlight-grid">{highest.map((listing) => <div key={listing.entityId ?? listing.itemName}><strong>{listing.itemName}</strong><span>{formatNumber(toNumber(listing.price) * toNumber(listing.quantity || 1))}g - {formatNumber(listing.price)}g ea</span></div>)}</div>
      <div className="tabs"><button className={tab === "sell" ? "active" : ""} onClick={() => setTab("sell")}><TrendingDown size={15} /> Sell Orders</button><button className={tab === "buy" ? "active" : ""} onClick={() => setTab("buy")}><TrendingUp size={15} /> Buy Orders</button></div>
      <div className="toolbar-row">
        <SearchBox value={q} onChange={setQ} placeholder="Search market" />
        <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select>
        <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}><option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      <p className="legend">Listed time uses the BitJita listing timestamp when available; monitor tracking time is used only as a fallback.</p>
      <DataTable rows={rows} columns={[
        ["Item", r => r.itemName ?? "Unknown"],
        ["Side", r => <span className={`pill ${String(r.side ?? r.orderType).includes("buy") ? "buy" : "sell"}`}>{r.side ?? r.orderType ?? "sell"}</span>],
        ["Qty", r => formatNumber(r.quantity)],
        ["Price", r => `${formatNumber(r.price)}g`],
        ["Tier", r => (r.itemTier ?? r.tier) ? `T${r.itemTier ?? r.tier}` : "-"],
        ["Rarity", r => (r.itemRarityStr ?? r.rarity) ? <span className={`role-badge ${getRarityClass(r.itemRarityStr ?? r.rarity)}`}>{r.itemRarityStr ?? r.rarity}</span> : "-"],
        ["Owner", r => r.ownerUsername ?? "-"],
        ["Listed", r => listingListedAt(r) ? dateLabel(listingListedAt(r)) : "-"],
        ["Live", r => liveDaysSince(listingListedAt(r))],
      ]} />
        </>
      )}
    </div>
  );
}

function buildMarketTotals(events: AnyRecord[]) {
  return events.reduce((acc, event) => {
    const type = String(event.event_type ?? "");
    if (type === "new_listing") acc.newListings += 1;
    if (type === "sale" || type === "partial_sale") {
      acc.confirmedSales += 1;
      acc.trackedValue += toNumber(event.total_value ?? event.totalValue);
    }
    if (type === "removed_or_cancelled" || type === "sold_or_removed" || type === "quantity_cancelled") acc.removedOrCancelled += 1;
    if (type === "partial_quantity_drop") acc.unconfirmedQuantityDrops += 1;
    return acc;
  }, { newListings: 0, confirmedSales: 0, removedOrCancelled: 0, unconfirmedQuantityDrops: 0, trackedValue: 0 });
}

function buildMarketTopItems(events: AnyRecord[]) {
  const grouped = new Map<string, { itemName: string; soldCount: number; totalValue: number; totalPrice: number; lastSoldAt: string }>();
  for (const event of events) {
    const itemName = String(event.item_name ?? event.itemName ?? "Unknown Item");
    const current = grouped.get(itemName) ?? { itemName, soldCount: 0, totalValue: 0, totalPrice: 0, lastSoldAt: "" };
    current.soldCount += 1;
    current.totalValue += toNumber(event.total_value ?? event.totalValue);
    current.totalPrice += toNumber(event.price);
    current.lastSoldAt = String(current.lastSoldAt && current.lastSoldAt > String(event.occurred_at) ? current.lastSoldAt : event.occurred_at ?? "");
    grouped.set(itemName, current);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, avgPrice: item.soldCount ? item.totalPrice / item.soldCount : 0 }))
    .sort((a, b) => b.soldCount - a.soldCount || b.totalValue - a.totalValue)
    .slice(0, 20);
}

function buildMarketDaily(events: AnyRecord[]) {
  const grouped = new Map<string, { day: string; soldCount: number; totalValue: number }>();
  for (const event of events) {
    const day = String(event.occurred_at ?? event.occurredAt ?? "").slice(0, 10) || "Unknown";
    const current = grouped.get(day) ?? { day, soldCount: 0, totalValue: 0 };
    current.soldCount += 1;
    current.totalValue += toNumber(event.total_value ?? event.totalValue);
    grouped.set(day, current);
  }
  return [...grouped.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
}

function Production({ data }: { data: ReturnType<typeof normalizeData> & { raw?: AnyRecord | null } }) {
  const itemLookup = new Map([...(data.raw?.crafts?.items ?? []), ...(data.raw?.crafts?.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const jobs = [...data.crafts].sort((a, b) => {
    const aTotal = toNumber(a.totalActionsRequired);
    const bTotal = toNumber(b.totalActionsRequired);
    const aPct = aTotal > 0 ? toNumber(a.progress) / aTotal : 0;
    const bPct = bTotal > 0 ? toNumber(b.progress) / bTotal : 0;
    const aActive = aPct > 0 && aPct < 1 ? 1 : 0;
    const bActive = bPct > 0 && bPct < 1 ? 1 : 0;
    return bActive - aActive || bPct - aPct;
  });
  const crafterCounts = data.crafts.reduce<Record<string, number>>((acc, job) => {
    const name = String(job.ownerUsername ?? "Unknown");
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const activeJobs = jobs.filter((job) => {
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    return total > 0 && progress > 0 && progress < total;
  }).length;

  return (
    <div className="panel">
      <div className="split-header">
        <Header title="Active Production">
          {data.crafts.length === 0 ? "No active crafting jobs" : `${activeJobs} being worked now - ${data.crafts.length} jobs across ${Object.keys(crafterCounts).length} crafters`}
        </Header>
        <div className="crafter-pills">
          {Object.entries(crafterCounts).map(([name, count]) => <span key={name}><User size={13} /> <strong>{name}</strong> {count} job{count === 1 ? "" : "s"}</span>)}
        </div>
      </div>
      {data.crafts.length === 0 ? <div className="empty-state"><Factory />No crafting jobs are currently active.</div> : null}
      <div className="production-grid">
        {jobs.map((job, index) => {
          const first = job.craftedItem?.[0] ?? {};
          const item = itemLookup.get(String(first.item_id));
          const skillId = toNumber(job.levelRequirements?.[0]?.skill_id);
          const skillName = SKILL_NAMES[skillId] ?? job.levelRequirements?.[0]?.skillName ?? (skillId ? `Skill ${skillId}` : null);
          const progress = toNumber(job.progress);
          const total = toNumber(job.totalActionsRequired);
          const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
          const remaining = Math.max(0, total - progress);
          const isWorking = total > 0 && progress > 0 && progress < total;
          const isDone = total > 0 && progress >= total;
          const status = isWorking ? "Working" : isDone ? "Ready" : "Queued";
          return (
            <article className={`production-card ${isWorking ? "active-work" : ""}`} key={job.entityId ?? index}>
              <header>
                <div><Factory size={16} /><strong>{job.buildingName ?? "Unknown Structure"}</strong><span>{job.ownerUsername ?? "Unknown"}</span></div>
                <p><span className={`status-pill ${isWorking ? "working" : ""}`}>{status}</span>{skillName ? <small>{skillName} Lv {job.levelRequirements?.[0]?.level ?? 1}+</small> : null}</p>
              </header>
              <section>
                <h3>{item?.name ?? (skillName ? `${skillName} craft` : `Item #${first.item_id ?? "?"}`)}</h3>
                {!item?.name && job.recipeId ? <small>recipe #{job.recipeId}</small> : null}
                <div className="work-chips">
                  <span>{formatNumber(job.craftCount)} craft{toNumber(job.craftCount) === 1 ? "" : "s"}</span>
                  <span>{formatNumber(remaining)} actions left</span>
                </div>
                <div className="progress-meta"><span>Progress</span><span>{formatNumber(progress)} / {formatNumber(total)} actions</span></div>
                <div className="progress"><div style={{ width: `${pct}%` }} /></div>
                <div className="progress-meta"><strong>{pct}%</strong><span>{formatNumber(remaining)} remaining</span></div>
              </section>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Region({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [sortKey, setSortKey] = React.useState("tier");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const sorters: Record<string, (row: AnyRecord) => string | number> = {
    name: (row) => String(row.name ?? ""),
    owner: getOwnerName,
    tier: (row) => toNumber(row.tier),
    supplies: (row) => toNumber(row.supplies),
    treasury: (row) => toNumber(row.treasury),
    numTiles: (row) => toNumber(row.numTiles),
  };
  const allRows = [...data.region];
  const rows = [...allRows].sort((a, b) => {
    const aVal = sorters[sortKey]?.(a) ?? 0;
    const bVal = sorters[sortKey]?.(b) ?? 0;
    const result = typeof aVal === "string" || typeof bVal === "string"
      ? String(aVal).localeCompare(String(bVal))
      : Number(aVal) - Number(bVal);
    return sortDir === "asc" ? result : -result;
  }).slice(0, 100);
  const mine = rows.find((row) => String(row.entityId) === String(data.claim.entityId));
  const rank = (field: string) => {
    const sorted = [...allRows].sort((a, b) => toNumber(b[field]) - toNumber(a[field]));
    const idx = sorted.findIndex((row) => String(row.entityId) === String(data.claim.entityId));
    return idx >= 0 ? `#${idx + 1}` : "-";
  };
  const chartRows = [...allRows].sort((a, b) => toNumber(b.supplies) - toNumber(a.supplies)).slice(0, 15);
  const maxSupplies = Math.max(...chartRows.map((row) => toNumber(row.supplies)), 1);
  const avgTier = allRows.length ? allRows.reduce((total, row) => total + toNumber(row.tier), 0) / allRows.length : 0;
  const avgTiles = allRows.length ? allRows.reduce((total, row) => total + toNumber(row.numTiles), 0) / allRows.length : 0;
  const totalTreasury = allRows.reduce((total, row) => total + toNumber(row.treasury), 0);
  const myRankRow = allRows.find((row) => String(row.entityId) === String(data.claim.entityId));
  const nearbyRows = myRankRow ? [...allRows]
    .filter((row) => String(row.entityId) !== String(data.claim.entityId))
    .map((row): AnyRecord => ({ ...row, distance: Math.abs(toNumber(row.locationX) - toNumber(myRankRow.locationX)) + Math.abs(toNumber(row.locationZ) - toNumber(myRankRow.locationZ)) }))
    .sort((a, b) => toNumber(a.distance) - toNumber(b.distance))
    .slice(0, 5) : [];
  function changeSort(nextKey: string) {
    if (nextKey === sortKey) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(nextKey);
      setSortDir(nextKey === "name" || nextKey === "owner" ? "asc" : "desc");
    }
  }
  const columns: Array<[string, string, (row: AnyRecord, index: number) => React.ReactNode]> = [
    ["#", "rank", (_r, i) => i + 1],
    ["Claim", "name", (r) => <span className={String(r.entityId) === String(data.claim.entityId) ? "mine-text" : ""}>{String(r.entityId) === String(data.claim.entityId) ? <Crown size={13} /> : null}{r.name}</span>],
    ["Owner", "owner", (r) => getOwnerName(r)],
    ["Tier", "tier", (r) => r.tier],
    ["Supplies", "supplies", (r) => formatNumber(r.supplies)],
    ["Treasury", "treasury", (r) => `${formatNumber(r.treasury)}g`],
    ["Tiles", "numTiles", (r) => formatNumber(r.numTiles)],
  ];
  return (
    <div className="panel">
      <Header title={`${data.claim.regionName ?? "Region"} Leaderboard`}>{allRows.length} settlements ranked across the region</Header>
      {mine ? (
        <div className="rank-grid">
          <MiniStat icon={<Crown />} label="Tier Rank" value={rank("tier")} />
          <MiniStat icon={<Box />} label="Supply Rank" value={rank("supplies")} />
          <MiniStat icon={<CircleDollarSign />} label="Treasury Rank" value={rank("treasury")} />
          <MiniStat icon={<Hammer />} label="Tile Rank" value={rank("numTiles")} />
        </div>
      ) : null}
      <div className="metric-grid">
        <MiniStat icon={<Globe2 />} label="Settlements" value={allRows.length} />
        <MiniStat icon={<Crown />} label="Average Tier" value={avgTier.toFixed(1)} />
        <MiniStat icon={<Hammer />} label="Average Tiles" value={formatNumber(avgTiles)} />
        <MiniStat icon={<CircleDollarSign />} label="Region Treasury" value={`${formatNumber(totalTreasury)}g`} />
      </div>
      <div className="bar-panel">
        <h3>Top Supplies</h3>
        {chartRows.map((row) => <div className="bar-row" key={row.entityId}><span>{row.name}</span><div><i style={{ width: `${(toNumber(row.supplies) / maxSupplies) * 100}%` }} className={String(row.entityId) === String(data.claim.entityId) ? "mine" : ""} /></div><b>{formatNumber(row.supplies)}</b></div>)}
      </div>
      {myRankRow ? <div className="mine-panel"><Crown size={18} /><strong>{myRankRow.name}</strong><span>T{myRankRow.tier} - {formatNumber(myRankRow.supplies)} supplies - {formatNumber(myRankRow.treasury)}g treasury - {formatNumber(myRankRow.numTiles)} tiles</span></div> : null}
      {nearbyRows.length ? (
        <div className="highlight-grid">
          {nearbyRows.map((row) => <div key={row.entityId}><strong>{row.name}</strong><span>{getOwnerName(row)} - T{row.tier} - {formatNumber(row.supplies)} supplies</span></div>)}
        </div>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{columns.map(([label, key]) => <th key={label}><button className="sort-button" onClick={() => key !== "rank" && changeSort(key)} disabled={key === "rank"}>{label}{key !== "rank" ? (sortKey === key ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />) : null}</button></th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => <tr className={String(row.entityId) === String(data.claim.entityId) ? "mine-row" : ""} key={row.entityId ?? index}>{columns.map(([label, , render]) => <td key={label}>{render(row, index) ?? "-"}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapPanel({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [selected, setSelected] = React.useState<Set<string> | null>(null);
  const roster = data.players;
  const defaultSelection = React.useMemo(() => {
    const online = roster.filter((player) => player.signedIn).map((player) => String(player.entityId)).filter(Boolean);
    return new Set(online.length ? online : roster.map((player) => String(player.entityId)).filter(Boolean));
  }, [roster]);
  const current = selected ?? defaultSelection;
  const mapUrl = current.size ? `https://bitcraftmap.com/?playerId=${[...current].join(",")}` : "https://bitcraftmap.com/";
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev ?? defaultSelection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(current.size === roster.length ? new Set() : new Set(roster.map((player) => String(player.entityId)).filter(Boolean)));
  }
  const onlineCount = roster.filter((player) => player.signedIn).length;
  return (
    <div className="panel map-panel full-height">
      <div className="split-header">
        <Header title="World Map">Live player tracking via bitcraftmap.com</Header>
        <a className="toolbar-button" href={mapUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open full map</a>
      </div>
      <p className="online-summary"><strong>{onlineCount} online</strong> - {roster.length} members total</p>
      <div className="player-pills">
        <button className={current.size === roster.length ? "active" : ""} onClick={toggleAll}>All</button>
        {roster.map((player) => {
          const id = String(player.entityId);
          return <button key={id} className={current.has(id) ? "active" : ""} onClick={() => toggle(id)} title={player.signedIn ? `Online - ${formatDuration(player.sessionSeconds)}` : "Offline"}><span className={`online-dot ${player.signedIn ? "is-online" : ""}`} />{player.username}{current.has(id) ? <MapPin size={12} /> : null}</button>;
        })}
      </div>
      <iframe className="map-frame" src={mapUrl} title="BitCraft World Map" />
    </div>
  );
}

function sanitizeActivityLog(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item).replaceAll("\u00c2\u00b7", "-").replaceAll("\u00e2\u20ac\u201d", "-"))
    .filter((item) => !/changed from \d+ to 0$/.test(item) && !/changed from 0 to \d+$/.test(item))
    .slice(0, 100);
}

const ACTIVITY_FILTERS = [
  ["all", "All"],
  ["treasury", "Treasury"],
  ["supplies", "Supplies"],
  ["market", "Market"],
  ["members", "Members"],
  ["buildings", "Structures"],
] as const;

function signedDelta(after: unknown, before: unknown, suffix = ""): string {
  const delta = toNumber(after) - toNumber(before);
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${formatNumber(Math.abs(delta))}${suffix}`;
}

function activitySummary(item: AnyRecord): string {
  let metadata: AnyRecord = {};
  try {
    metadata = JSON.parse(item.metadata_json ?? item.metadataJson ?? "{}");
  } catch {
    metadata = {};
  }
  if (metadata.before != null && metadata.after != null) {
    if (item.event_type === "treasury") return `${signedDelta(metadata.after, metadata.before, "g")} to treasury`;
    if (item.event_type === "supplies") return `${signedDelta(metadata.after, metadata.before)} supplies`;
    if (item.event_type === "members") return `${signedDelta(metadata.after, metadata.before)} members`;
    if (item.event_type === "buildings") return `${signedDelta(metadata.after, metadata.before)} structures`;
    if (item.event_type === "market") return `${signedDelta(metadata.after, metadata.before)} market listings`;
  }
  return item.summary ?? "-";
}

function ActivityPanel({ activity, error }: { activity: AnyRecord[]; error: string | null }) {
  const [filter, setFilter] = React.useState<(typeof ACTIVITY_FILTERS)[number][0]>("all");
  const [compact, setCompact] = React.useState(true);
  const baseFiltered = filter === "all" ? activity : activity.filter((item) => String(item.event_type ?? "").includes(filter));
  const filtered = compact ? compactActivity(baseFiltered) : baseFiltered;
  return (
    <div className="panel">
      <Header title="Activity">Persistent local history from the SQLite database</Header>
      {error ? <div className="error">Local history unavailable: {error}</div> : null}
      <div className="toolbar-row">
        <Segmented options={ACTIVITY_FILTERS.map(([, label]) => label)} value={ACTIVITY_FILTERS.find(([id]) => id === filter)?.[1] ?? "All"} onChange={(label) => setFilter(ACTIVITY_FILTERS.find(([, itemLabel]) => itemLabel === label)?.[0] ?? "all")} label="Filter" />
        <label className="check-control"><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} /> Compact treasury</label>
        <span>{filtered.length} of {activity.length} events</span>
      </div>
      <div className="activity-list">
        {filtered.length ? filtered.map((item) => (
          <div key={item.id ?? `${item.occurred_at}-${item.summary}`}>
            <strong>{dateLabel(item.occurred_at ?? item.occurredAt)}</strong>
            <span>{activitySummary(item)}</span>
          </div>
        )) : <p>{activity.length ? "No activity matches this filter." : "No activity has been recorded yet. Keep the local dev server running and history will build on each refresh."}</p>}
      </div>
    </div>
  );
}

function compactActivity(items: AnyRecord[]): AnyRecord[] {
  const output: AnyRecord[] = [];
  let treasuryGroup: AnyRecord[] = [];
  const flush = () => {
    if (!treasuryGroup.length) return;
    const first = treasuryGroup[0];
    const last = treasuryGroup[treasuryGroup.length - 1];
    const total = treasuryGroup.reduce((sum, item) => {
      try {
        const meta = JSON.parse(item.metadata_json ?? "{}");
        return sum + (toNumber(meta.after) - toNumber(meta.before));
      } catch {
        return sum;
      }
    }, 0);
    output.push({ id: `treasury-${first.id}-${last.id}`, occurred_at: first.occurred_at, summary: `${total >= 0 ? "+" : "-"}${formatNumber(Math.abs(total))}g to treasury across ${treasuryGroup.length} refreshes` });
    treasuryGroup = [];
  };
  for (const item of items) {
    if (item.event_type === "treasury") treasuryGroup.push(item);
    else {
      flush();
      output.push(item);
    }
  }
  flush();
  return output;
}

function diffSnapshot(prev: AnyRecord, curr: AnyRecord): string[] {
  const changes = [];
  for (const key of ["members", "buildings", "market"]) {
    if (prev[key] !== curr[key]) changes.push(`${key} changed from ${prev[key]} to ${curr[key]}`);
  }
  if (toNumber(prev.claim?.supplies) !== toNumber(curr.claim?.supplies)) changes.push(`Supplies changed to ${formatNumber(curr.claim?.supplies)}`);
  if (toNumber(prev.claim?.treasury) !== toNumber(curr.claim?.treasury)) changes.push(`Treasury changed to ${formatNumber(curr.claim?.treasury)}g`);
  return changes.length ? changes : ["No tracked changes detected"];
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search"><Search size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function applyTheme(theme: Partial<typeof DEFAULT_THEME>) {
  for (const [key, , cssVar] of THEME_FIELDS) {
    const value = theme[key] ?? DEFAULT_THEME[key];
    document.documentElement.style.setProperty(cssVar, value);
  }
  document.documentElement.style.setProperty("--gold-dim", `${theme.gold ?? DEFAULT_THEME.gold}2e`);
}

function TablePanel({ title, subtitle, rows, columns }: { title: string; subtitle: string; rows: AnyRecord[]; columns: Array<[string, (row: AnyRecord, index: number) => React.ReactNode]> }) {
  return <div className="panel"><Header title={title}>{subtitle}</Header><DataTable rows={rows} columns={columns} /></div>;
}

function DataTable({ rows, columns }: { rows: AnyRecord[]; columns: Array<[string, (row: AnyRecord, index: number) => React.ReactNode]> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => <tr key={row.entityId ?? row.id ?? index}>{columns.map(([label, render]) => <td key={label}>{render(row, index) ?? "-"}</td>)}</tr>) : <tr><td colSpan={columns.length}>No data returned.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SyncPanel({ syncUrl }: { syncUrl: string }) {
  return (
    <div className="panel sync-panel">
      <div className="split-header">
        <Header title="Sync">Embedded BitCraft Sync materials and goals board</Header>
        <a className="toolbar-button" href={syncUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open Full Page</a>
      </div>
      <iframe className="sync-frame" src={syncUrl} title="BitCraft Sync" />
    </div>
  );
}

function AdminPanel({ claimId, syncUrl, theme, onSettingsSaved }: { claimId: string; syncUrl: string; theme: typeof DEFAULT_THEME; onSettingsSaved: (settings: { claimId: string; syncUrl: string; theme: typeof DEFAULT_THEME }) => void }) {
  const [auth, setAuth] = React.useState<AnyRecord | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [setupKey, setSetupKey] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [nextClaimId, setNextClaimId] = React.useState(claimId);
  const [nextSyncUrl, setNextSyncUrl] = React.useState(syncUrl);
  const [nextTheme, setNextTheme] = React.useState<typeof DEFAULT_THEME>(theme);
  const [tables, setTables] = React.useState<Array<{ name: string; rows: number }>>([]);
  const [selectedTable, setSelectedTable] = React.useState("");
  const [tableRows, setTableRows] = React.useState<AnyRecord[]>([]);
  const [tableSearch, setTableSearch] = React.useState("");

  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(`${LOCAL_API}${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body;
  }

  async function refreshAuth() {
    setAuthLoading(true);
    try {
      setAuth(await api("/admin/me"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function refreshTables() {
    const result = await api("/admin/tables");
    setTables(result.tables ?? []);
    if (!selectedTable && result.tables?.[0]) setSelectedTable(result.tables[0].name);
  }

  React.useEffect(() => { refreshAuth(); }, []);
  React.useEffect(() => { setNextClaimId(claimId); setNextSyncUrl(syncUrl); setNextTheme(theme); }, [claimId, syncUrl, theme]);
  React.useEffect(() => { if (auth?.authenticated) applyTheme(nextTheme); }, [auth?.authenticated, nextTheme]);
  React.useEffect(() => { if (auth?.authenticated) refreshTables(); }, [auth?.authenticated]);
  React.useEffect(() => {
    if (!auth?.authenticated || !selectedTable) return;
    api(`/admin/table?name=${encodeURIComponent(selectedTable)}&limit=100`).then((result) => setTableRows(result.rows ?? [])).catch((error) => setMessage(error.message));
  }, [auth?.authenticated, selectedTable]);

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const route = auth?.setupRequired ? "/admin/setup" : "/admin/login";
      const result = await api(route, { method: "POST", body: JSON.stringify({ password, setupKey }) });
      setAuth({ setupRequired: false, authenticated: true, user: result.user });
      setPassword("");
      setSetupKey("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveSettings() {
    setMessage(null);
    try {
      const result = await api("/admin/settings", { method: "PUT", body: JSON.stringify({ claimId: nextClaimId, syncUrl: nextSyncUrl, theme: nextTheme }) });
      onSettingsSaved(result);
      setMessage("Settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function logout() {
    await api("/admin/logout", { method: "POST", body: "{}" });
    setAuth({ setupRequired: false, authenticated: false, user: null });
  }

  const columns = tableRows[0] ? Object.keys(tableRows[0]).slice(0, 8).map((key) => [key, (row: AnyRecord) => {
    const value = row[key];
    return typeof value === "string" && value.length > 120 ? `${value.slice(0, 120)}...` : String(value ?? "-");
  }] as [string, (row: AnyRecord) => React.ReactNode]) : [];
  const visibleRows = tableSearch ? tableRows.filter((row) => JSON.stringify(row).toLowerCase().includes(tableSearch.toLowerCase())) : tableRows;
  const selectedMeta = tables.find((table) => table.name === selectedTable);

  if (authLoading) {
    return <div className="panel"><Header title="Admin">Checking local admin status</Header><div className="loading">Loading admin session...</div></div>;
  }

  if (!auth?.authenticated) {
    return (
      <div className="panel">
        <Header title="Admin">{auth?.setupRequired ? "Create the first local admin password" : "Sign in to manage local settings and database tools"}</Header>
        <form className="form-card" onSubmit={submitAuth}>
          {auth?.setupKeyRequired ? <label className="field"><span>Server Setup Key</span><input type="password" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} autoComplete="one-time-code" /></label> : null}
          <label className="field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} autoComplete={auth?.setupRequired ? "new-password" : "current-password"} /></label>
          <button className="toolbar-button" type="submit"><KeyRound size={15} /> {auth?.setupRequired ? "Create Admin" : "Sign In"}</button>
          {message ? <p className="legend">{message}</p> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="split-header">
        <Header title="Admin">Settlement, theme, and local database tools</Header>
        <button className="toolbar-button" onClick={logout}><LogOut size={15} /> Sign out</button>
      </div>
      {message ? <div className="loading">{message}</div> : null}
      <div className="admin-grid">
        <section className="form-card">
          <h3><Shield size={17} /> Settlement</h3>
          <label className="field"><span>Settlement ID</span><input value={nextClaimId} onChange={(event) => setNextClaimId(event.target.value)} /></label>
          <label className="field"><span>BitCraft Sync URL</span><input value={nextSyncUrl} onChange={(event) => setNextSyncUrl(event.target.value)} placeholder={DEFAULT_SYNC_URL} /></label>
          <button className="toolbar-button" onClick={saveSettings}><Save size={15} /> Save Settings</button>
        </section>
        <section className="form-card">
          <h3><Palette size={17} /> Theme Editor</h3>
          <div className="theme-grid">
            {THEME_FIELDS.map(([key, label]) => <label className="color-field" key={key}><span>{label}</span><input type="color" value={nextTheme[key]} onChange={(event) => setNextTheme((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
          </div>
          <button className="toolbar-button" onClick={() => { setNextTheme(DEFAULT_THEME); applyTheme(DEFAULT_THEME); }}><RefreshCw size={15} /> Reset Theme</button>
        </section>
      </div>
      <section className="form-card">
        <div className="split-header">
          <h3><Database size={17} /> Database Browser {selectedMeta ? <small>{formatNumber(selectedMeta.rows)} rows</small> : null}</h3>
          <select className="select-control" value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)}>{tables.map((table) => <option key={table.name} value={table.name}>{table.name} ({formatNumber(table.rows)})</option>)}</select>
        </div>
        <SearchBox value={tableSearch} onChange={setTableSearch} placeholder="Search table rows" />
        {columns.length ? <DataTable rows={visibleRows} columns={columns} /> : <p className="legend">Choose a table to inspect rows.</p>}
      </section>
    </div>
  );
}

function App() {
  const [active, setActive] = React.useState<(typeof NAV)[number][0]>("overview");
  const [claimId, setClaimId] = React.useState(DEFAULT_CLAIM_ID);
  const [syncUrl, setSyncUrl] = React.useState(DEFAULT_SYNC_URL);
  const [theme, setTheme] = React.useState<typeof DEFAULT_THEME>(DEFAULT_THEME);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [historyRefreshToken, setHistoryRefreshToken] = React.useState(0);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const state = useBitjitaData(refreshToken, claimId);
  const data = React.useMemo(() => {
    const normalized = normalizeData(state.data);
    return { ...normalized, raw: state.data };
  }, [state.data]);
  const localHistory = useLocalHistory(historyRefreshToken, claimId);
  React.useEffect(() => {
    fetch(`${LOCAL_API}/config`)
      .then((response) => response.ok ? response.json() : null)
      .then((config) => {
        if (!config) return;
        setClaimId(config.claimId ?? DEFAULT_CLAIM_ID);
        setSyncUrl(config.syncUrl ?? DEFAULT_SYNC_URL);
        setTheme({ ...DEFAULT_THEME, ...(config.theme ?? {}) });
      })
      .catch(() => undefined);
  }, []);
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setRefreshToken((x) => x + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);
  React.useEffect(() => {
    if (state.data) setLastUpdated(new Date());
  }, [state.data]);
  React.useEffect(() => {
    if (!state.data || !data.claim?.entityId) return;
    const controller = new AbortController();
    async function record() {
      try {
        const response = await fetch(`${LOCAL_API}/snapshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimId,
            claim: data.claim,
            membersCount: data.members.length,
            buildingsCount: data.buildings.length,
            market: data.market,
          }),
          signal: controller.signal,
        });
        if (response.ok) setHistoryRefreshToken((x) => x + 1);
      } catch {
        // The app can still run without the local history server.
      }
    }
    record();
    return () => controller.abort();
  }, [claimId, state.data, data.claim, data.members.length, data.buildings.length, data.market]);

  const panels: Record<string, React.ReactNode> = {
    overview: <Overview data={data} onNavigate={setActive} />,
    members: <Members data={data} />,
    skills: <Skills data={data} />,
    production: <Production data={data} />,
    inventory: <Inventory data={data} />,
    construction: <Construction data={data} />,
    buildings: <Buildings data={data} />,
    research: <Research data={data} />,
    market: <Market data={data} history={localHistory.market} claimId={claimId} onHistoryChanged={() => setHistoryRefreshToken((x) => x + 1)} />,
    empire: <Region data={data} />,
    map: <MapPanel data={data} />,
    sync: <SyncPanel syncUrl={syncUrl} />,
    activity: <ActivityPanel activity={localHistory.activity} error={localHistory.error} />,
    admin: <AdminPanel claimId={claimId} syncUrl={syncUrl} theme={theme} onSettingsSaved={(settings) => { setClaimId(settings.claimId); setSyncUrl(settings.syncUrl ?? DEFAULT_SYNC_URL); setTheme({ ...DEFAULT_THEME, ...settings.theme }); setRefreshToken((x) => x + 1); setHistoryRefreshToken((x) => x + 1); }} />,
  };

  return (
    <div className="app-shell">
      <aside>
        <div className="brand"><Shield /><div><h1>Claim Monitor</h1><span>Timbersteel</span></div></div>
        <nav>{NAV.map(([id, label, Icon]) => <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><Icon size={16} />{label}</button>)}</nav>
        <div className="refresh-status" title="Data refreshes automatically every 30 seconds">
          <span className="refresh-dot" />
          <span>Updated</span>
          <time>{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Waiting..."}</time>
        </div>
      </aside>
      <main>
        {state.loading && !state.data ? <div className="loading">Loading BitJita data...</div> : state.error && !state.data ? <div className="error">Failed to load BitJita data: {state.error}</div> : panels[active]}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
