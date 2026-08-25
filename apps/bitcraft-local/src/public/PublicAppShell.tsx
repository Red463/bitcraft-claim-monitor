import React from "react";
import { Boxes, ChevronRight, Hammer, Home, RefreshCw, Search, UserRound, Users } from "lucide-react";
import { loadPublicSnapshot, searchPublicCatalog, searchPublicSettlements, type PublicHint, type PublicSnapshot } from "./api";
import { PublicAccountSettings } from "./PublicAccountSettings";
import { PublicLegalPage } from "./PublicLegalPage";
import { addRecentSettlement, readRecentSettlements } from "./preferences.mjs";
import { publicSettlementPath } from "./routes.mjs";
import { createVisibleRefreshController } from "./visibleRefresh.mjs";

type Route = { id: string; params: Record<string, string> };
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];
const title = (route: Route) => ({ settlement: "Overview", members: "Members & professions", inventory: "Shared inventory", crafts: "Craft monitor", calculator: "Craft calculator" }[route.id] ?? "Claim Monitor");
const domains = (route: Route) => route.id === "members" ? ["claim", "members", "citizens"] : route.id === "inventory" ? ["claim", "inventories"] : route.id === "crafts" ? ["claim", "crafts"] : ["claim"];

function number(value: unknown) { const text = String(value ?? "0"); try { return /^\d+$/.test(text) ? BigInt(text).toLocaleString() : text; } catch { return text; } }
function warning(value: unknown) { const data = row(value); return String(data.message ?? data.code ?? value ?? "Some live data is incomplete."); }

function TypedStack({ stack }: { stack: Row }) {
  const catalogKey = String(stack.catalogKey ?? `${stack.itemType === "cargo" ? "cargo" : "items"}:${stack.itemId ?? ""}`);
  return <li className="public-stack"><span>{catalogKey.startsWith("cargo:") ? "Cargo" : "Item"} · #{String(stack.itemId ?? "—")}</span><strong>{number(stack.amount ?? stack.quantity)}</strong></li>;
}

function Freshness({ snapshot, refreshing }: { snapshot: PublicSnapshot | null; refreshing: boolean }) {
  if (!snapshot) return null;
  const seconds = Math.max(0, Math.round(snapshot.ageMs / 1000));
  return <span className={`public-freshness ${snapshot.stale ? "is-stale" : ""}`}>{refreshing ? "Refreshing…" : snapshot.stale ? `Stale · ${seconds}s old` : `Live · ${seconds}s old`}</span>;
}

function Overview({ claim }: { claim: Row }) {
  const metrics: Array<[string, unknown]> = [["Tier", claim.tier], ["Supplies", claim.supplies], ["Treasury", claim.treasury], ["Tiles", claim.numTiles]];
  return <section className="public-metric-grid">{metrics.map(([label, value]) => <article className="public-panel" key={label}><span>{label}</span><strong>{value == null ? "Unavailable" : number(value)}</strong></article>)}</section>;
}

function Members({ members, citizens }: { members: Row; citizens: Row }) {
  const profiles = rows(citizens.data);
  return <section className="public-panel"><h2>Current roster</h2>{!members.data ? <p>Member data is temporarily unavailable.</p> : <div className="public-table">{rows(members.data).map((member) => {
    const profile = profiles.find((candidate) => String(candidate.playerEntityId) === String(member.playerEntityId)); const skills = row(profile?.skills); const names = row(profile?.skillNames);
    return <article key={String(member.entityId)}><strong>{String(member.userName || "Unknown member")}</strong><span>{Object.entries(skills).map(([id, level]) => `${String(names[id] ?? id)} ${level}`).join(" · ") || "No profession data"}</span></article>;
  })}</div>}</section>;
}

function Inventory({ inventory }: { inventory: Row }) {
  const data = row(inventory.data); const buildings = rows(data.buildings);
  return <section className="public-panel"><h2>Shared inventory</h2>{!inventory.data ? <p>Inventory data is temporarily unavailable.</p> : buildings.length === 0 ? <p>No shared inventory is currently reported.</p> : <div className="public-inventory-grid">{buildings.map((building) => <article key={String(building.entityId)}><h3>{String(building.nickname || building.name || "Building")}</h3><ul>{rows(building.items).map((stack, index) => <TypedStack key={`${String(stack.catalogKey)}-${index}`} stack={stack} />)}</ul></article>)}</div>}</section>;
}

function Crafts({ crafts }: { crafts: Row }) {
  const results = rows(row(crafts.data).craftResults);
  return <section className="public-panel"><h2>Current and completed crafts</h2>{!crafts.data ? <p>Craft data is temporarily unavailable.</p> : results.length === 0 ? <p>No crafts are currently reported.</p> : <div className="public-table">{results.map((craft) => <article key={String(craft.entityId)}><strong>{String(craft.buildingName || "Settlement craft")}</strong><span>{craft.completed === true ? "Completed" : `In progress · ${number(craft.progress)} / ${number(craft.totalActionsRequired)}`} · {rows(craft.craftedItem).map((stack) => String(stack.catalogKey ?? "item")).join(", ") || "No output listed"}</span></article>)}</div>}</section>;
}

function SnapshotPage({ route }: { route: Route }) {
  const claimId = route.params.claimId; const [snapshot, setSnapshot] = React.useState<PublicSnapshot | null>(null); const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState(""); const [refreshing, setRefreshing] = React.useState(false); const refreshRef = React.useRef<() => Promise<void>>(async () => {});
  const refresh = React.useCallback(async () => {
    setRefreshing(true); setError("");
    try { const next = await loadPublicSnapshot(claimId, domains(route)); setSnapshot(next); const claim = row(row(next.domains.claim).data); const name = String(claim.name ?? "").trim(); if (name) addRecentSettlement(window.localStorage, { claimId, name, regionId: next.regionId }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Public data is temporarily unavailable."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [claimId, route.id]);
  refreshRef.current = refresh;
  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => { const controller = createVisibleRefreshController({ isVisible: () => document.visibilityState === "visible", refresh: () => refreshRef.current() }); const listener = () => controller.visibilityChanged(); controller.start(); document.addEventListener("visibilitychange", listener); return () => { document.removeEventListener("visibilitychange", listener); controller.stop(); }; }, []);
  if (loading && !snapshot) return <section className="public-state" role="status">Loading current settlement state…</section>;
  if (error && !snapshot) return <section className="public-state is-error" role="alert">{error}</section>;
  const claim = row(row(snapshot?.domains.claim).data); const domainWarnings = Object.values(snapshot?.domains ?? {}).flatMap((domain) => rows(row(domain).warnings)); const warnings = [...(snapshot?.warnings ?? []), ...domainWarnings];
  return <><header className="public-page-heading"><div><p>Settlement #{claimId}</p><h1>{String(claim.name ?? "Settlement")}</h1><span>Region {String(snapshot?.regionId ?? "—")}</span></div><div className="public-heading-actions"><Freshness snapshot={snapshot} refreshing={refreshing} /><button className="toolbar-button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} /> Refresh</button></div></header>{warnings.length > 0 && <section className="public-warning" role="status">{warnings.map(warning).join(" ")}</section>}{error && <section className="public-warning" role="alert">Refresh failed; showing the last received data. {error}</section>}{route.id === "settlement" && <Overview claim={claim} />}{route.id === "members" && <Members members={row(snapshot?.domains.members)} citizens={row(snapshot?.domains.citizens)} />}{route.id === "inventory" && <Inventory inventory={row(snapshot?.domains.inventories)} />}{route.id === "crafts" && <Crafts crafts={row(snapshot?.domains.crafts)} />}</>;
}

function SearchPanel() {
  const [query, setQuery] = React.useState(""); const [results, setResults] = React.useState<PublicHint[]>([]); const [message, setMessage] = React.useState(""); const [recent] = React.useState(() => readRecentSettlements(window.localStorage));
  async function search(event: React.FormEvent) { event.preventDefault(); setMessage(""); try { const result = await searchPublicSettlements(query); setResults(result.hints); if (!result.hints.length) setMessage("No matching settlements found."); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Search is unavailable."); } }
  const entries: PublicHint[] = results.length ? results : recent.map((value) => ({ claimId: value.claimId, name: value.name, regionId: value.regionId }));
  return <section className="public-search-panel"><form onSubmit={search}><label htmlFor="public-settlement-search">Find a settlement</label><div><input id="public-settlement-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or exact claim ID" /><button className="toolbar-button primary" type="submit"><Search size={16} /> Search</button></div></form>{message && <p role="status">{message}</p>}{entries.length > 0 && <div className="public-search-results"><span>{results.length ? "Matches" : "Recent settlements"}</span>{entries.map((entry) => { const href = publicSettlementPath(entry); return href && <a key={entry.claimId} href={href}><strong>{entry.name}</strong><small>#{entry.claimId} · region {entry.regionId ?? "—"}</small><ChevronRight size={16} /></a>; })}</div>}</section>;
}

function Calculator() {
  const [query, setQuery] = React.useState(""); const [results, setResults] = React.useState<Row[]>([]); const [message, setMessage] = React.useState("");
  async function search(event: React.FormEvent) { event.preventDefault(); try { const payload = await searchPublicCatalog(query); setResults([...rows(payload.items), ...rows(payload.cargos)]); setMessage(""); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Catalog search is unavailable."); } }
  return <section className="public-panel"><h1>Craft calculator</h1><p>Search the shared global catalog. This tool does not use settlement-specific data.</p><form className="public-catalog-search" onSubmit={search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search catalog" /><button className="toolbar-button primary">Search</button></form>{message && <p role="alert">{message}</p>}<div className="public-table">{results.map((item) => <article key={`${String(item.itemType)}:${String(item.id)}`}><strong>{String(item.name ?? "Catalog entry")}</strong><span>{item.itemType === 1 || item.kind === "cargo" ? "Cargo" : "Item"} · #{String(item.id ?? "—")}</span></article>)}</div></section>;
}

function Placeholder({ route }: { route: Route }) { return <section className="public-panel public-placeholder"><h1>{title(route)}</h1><p>{route.id === "help" ? "Use settlement search to open current public state. Data refreshes while this page is visible." : "This public area is being prepared."}</p></section>; }
function Navigation({ route }: { route: Route }) { const claimId = route.params.claimId; const links: Array<[string, string, string, typeof Home]> = claimId ? [["Overview", `/settlements/${claimId}`, "settlement", Home], ["Members", `/settlements/${claimId}/members`, "members", Users], ["Inventory", `/settlements/${claimId}/inventory`, "inventory", Boxes], ["Craft monitor", `/settlements/${claimId}/crafts`, "crafts", Hammer]] : []; return <aside className="public-sidebar"><a className="brand" href="/"><div><h1>Claim Monitor</h1><span>Public settlement data</span></div></a><nav>{links.map(([label, href, id, Icon]) => <a className={route.id === id ? "active" : ""} href={href} key={id}><Icon size={16} />{label}</a>)}<a className={route.id === "calculator" ? "active" : ""} href="/calculator"><Hammer size={16} />Craft calculator</a><a href="/help">Help</a><a href="/plans">Plans</a><a className={["account", "settings"].includes(route.id) ? "active" : ""} href="/settings"><UserRound size={16} />Account &amp; settings</a><a className={route.id === "terms" ? "active" : ""} href="/terms">Terms</a><a className={route.id === "privacy" ? "active" : ""} href="/privacy">Privacy</a></nav></aside>; }
export function PublicAppShell({ route }: { route: Route }) { const settlement = ["settlement", "members", "inventory", "crafts"].includes(route.id); const identity = route.id === "account" || route.id === "settings"; const legal = route.id === "terms" || route.id === "privacy"; return <div className="public-app-shell"><Navigation route={route} /><main className="public-main">{!identity && !legal ? <SearchPanel /> : null}{settlement ? <SnapshotPage route={route} /> : route.id === "calculator" ? <Calculator /> : identity ? <PublicAccountSettings page={route.id as "account" | "settings"} /> : legal ? <PublicLegalPage type={route.id as "terms" | "privacy"} /> : <Placeholder route={route} />}</main></div>; }
