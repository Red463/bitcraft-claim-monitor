import React from "react";
import { BookOpen, Boxes, Coins, Database, Edit3, FileText, FlaskConical, Hammer, Package, RefreshCw, Save, Search, ShieldCheck, Sparkles, Trophy, X } from "lucide-react";

type WikiPageSummary = {
  slug: string;
  title: string;
  category: string;
  summary?: string | null;
  source?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

type WikiGeneratedEntry = {
  entry_key: string;
  slug: string;
  title: string;
  category: string;
  entry_type: string;
  summary?: string | null;
  source?: string | null;
  source_ref?: string | null;
  updated_at?: string | null;
  body_markdown?: string | null;
};

type WikiPageDetail = WikiPageSummary & {
  body_markdown: string;
  published: number;
  generated: number;
};

type AdminStatus = {
  authenticated: boolean;
  csrfToken?: string | null;
  user?: { username?: string } | null;
};

async function wikiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body as T;
}

function wikiPathSlug() {
  const path = window.location.pathname.replace(/^\/wiki\/?/, "");
  if (!path) return { kind: "home" as const, value: "" };
  if (path.startsWith("generated/")) return { kind: "generated" as const, value: decodeURIComponent(path.slice("generated/".length)) };
  return { kind: "page" as const, value: decodeURIComponent(path) };
}

function formatWikiDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

const WIKI_CATEGORY_CARDS = [
  { category: "Start Here", title: "Start Here", description: "How to use the wiki and where to find the most useful player references.", icon: BookOpen },
  { category: "Items", title: "Items", description: "Materials, tools, gear, ingredients, and other inventory items.", icon: Package },
  { category: "Cargo", title: "Cargo", description: "Large carried resources such as trunks, ore chunks, carcasses, and fish.", icon: Boxes },
  { category: "Recipes", title: "Recipes", description: "Crafting inputs, outputs, station requirements, and XP where known.", icon: Hammer },
  { category: "Output Chances", title: "Output Chances", description: "Variable result tables for crafts with chance-based outputs.", icon: Sparkles },
  { category: "Professions", title: "Professions", description: "Profession pages and related recipes from public game data.", icon: Trophy },
  { category: "Settlement Systems", title: "Settlement Systems", description: "Supplies, treasury, research, upkeep, and claim mechanics.", icon: ShieldCheck },
  { category: "Economy", title: "Economy", description: "Market and trading notes for interpreting app price data.", icon: Coins },
];

const WIKI_STARTER_LINKS = [
  "getting-started",
  "crafting-and-output-chances",
  "supplies-and-claim-upkeep",
  "treasury-and-hex",
  "professions-and-stations",
  "markets-and-trade",
];

function MarkdownView({ markdown }: { markdown: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = markdown.split(/\r?\n/);
  let codeLines: string[] = [];
  let inCode = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(<ul key={`list-${blocks.length}`}>{listItems.map((item, index) => <li key={index}>{item}</li>)}</ul>);
    listItems = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push(<pre key={`code-${blocks.length}`}><code>{codeLines.join("\n")}</code></pre>);
        codeLines = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    if (line.startsWith("### ")) blocks.push(<h3 key={`h3-${blocks.length}`}>{line.slice(4)}</h3>);
    else if (line.startsWith("## ")) blocks.push(<h2 key={`h2-${blocks.length}`}>{line.slice(3)}</h2>);
    else if (line.startsWith("# ")) blocks.push(<h1 key={`h1-${blocks.length}`}>{line.slice(2)}</h1>);
    else blocks.push(<p key={`p-${blocks.length}`}>{line}</p>);
  }
  flushList();
  if (codeLines.length) blocks.push(<pre key={`code-${blocks.length}`}><code>{codeLines.join("\n")}</code></pre>);
  return <div className="wiki-markdown">{blocks}</div>;
}

export function WikiApp() {
  const [index, setIndex] = React.useState<{ pages: WikiPageSummary[]; categories: string[]; generatedCategories: Array<{ category: string; count: number }>; generatedCount: number; lastGeneration?: unknown } | null>(null);
  const [admin, setAdmin] = React.useState<AdminStatus>({ authenticated: false });
  const [route, setRoute] = React.useState(wikiPathSlug());
  const [page, setPage] = React.useState<WikiPageDetail | null>(null);
  const [generated, setGenerated] = React.useState<WikiGeneratedEntry | null>(null);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [results, setResults] = React.useState<{ pages: WikiPageSummary[]; generated: WikiGeneratedEntry[] }>({ pages: [], generated: [] });
  const [editing, setEditing] = React.useState<WikiPageDetail | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadIndex = React.useCallback(async () => {
    setIndex(await wikiJson("/api/local/wiki"));
  }, []);

  React.useEffect(() => {
    const onPop = () => setRoute(wikiPathSlug());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  React.useEffect(() => {
    void loadIndex().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
    void wikiJson<AdminStatus>("/api/local/admin/me").then(setAdmin).catch(() => setAdmin({ authenticated: false }));
  }, [loadIndex]);

  React.useEffect(() => {
    setError(null);
    setPage(null);
    setGenerated(null);
    if (route.kind === "home") return;
    const url = route.kind === "generated" ? `/api/local/wiki/generated?key=${encodeURIComponent(route.value)}` : `/api/local/wiki/page?slug=${encodeURIComponent(route.value)}`;
    void wikiJson<{ page?: WikiPageDetail; entry?: WikiGeneratedEntry }>(url)
      .then((body) => {
        if (body.page) setPage(body.page);
        if (body.entry) setGenerated(body.entry);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, [route]);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      void wikiJson<{ pages: WikiPageSummary[]; generated: WikiGeneratedEntry[] }>(`/api/local/wiki/search?q=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&limit=60`)
        .then(setResults)
        .catch(() => setResults({ pages: [], generated: [] }));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [category, search]);

  const navigate = (kind: "home" | "page" | "generated", value = "") => {
    const nextPath = kind === "home" ? "/wiki" : kind === "generated" ? `/wiki/generated/${encodeURIComponent(value)}` : `/wiki/${encodeURIComponent(value)}`;
    window.history.pushState({}, "", nextPath);
    setRoute({ kind, value } as ReturnType<typeof wikiPathSlug>);
  };

  const savePage = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        slug: editing.slug,
        title: editing.title,
        category: editing.category,
        summary: editing.summary,
        bodyMarkdown: editing.body_markdown,
        published: Boolean(editing.published),
      };
      const result = await wikiJson<{ page: WikiPageDetail }>("/api/local/admin/wiki/page", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": String(admin.csrfToken ?? "") },
        body: JSON.stringify(body),
      });
      setEditing(null);
      setPage(result.page);
      await loadIndex();
      navigate("page", result.page.slug);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      await wikiJson("/api/local/admin/wiki/generate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": String(admin.csrfToken ?? "") },
        body: "{}",
      });
      await loadIndex();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : String(generateError));
    } finally {
      setBusy(false);
    }
  };

  const visibleGenerated = results.generated;
  const visiblePages = results.pages.length || search || category ? results.pages : index?.pages ?? [];
  const starterPages = WIKI_STARTER_LINKS.map((slug) => index?.pages.find((entry) => entry.slug === slug)).filter(Boolean) as WikiPageSummary[];
  const categoryCards = WIKI_CATEGORY_CARDS.filter((card) => (index?.categories ?? []).includes(card.category) || (index?.generatedCategories ?? []).some((entry) => entry.category === card.category));

  return (
    <main className="wiki-shell">
      <section className="wiki-hero">
        <button className="wiki-brand" onClick={() => navigate("home")}><BookOpen size={20} /> Timbersteel Wiki</button>
        <div>
          <p className="eyebrow">BitCraft game wiki</p>
          <h1>Recipes, Materials, and Settlement Mechanics</h1>
          <p>Search player-friendly pages for crafting recipes, output chances, professions, market notes, treasury behaviour, supplies, research, and other game systems.</p>
        </div>
        <div className="wiki-hero-stats">
          <span><FileText size={15} /> {index?.pages.length ?? 0} guide pages</span>
          <span><Database size={15} /> {(index?.generatedCount ?? 0).toLocaleString()} wiki entries</span>
          {admin.authenticated ? <span><ShieldCheck size={15} /> Admin editing enabled</span> : null}
        </div>
      </section>

      {error ? <div className="wiki-error">{error}</div> : null}

      <section className="wiki-search-panel">
        <label className="wiki-search">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items, cargo, recipes, professions, output chances..." />
        </label>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {(index?.categories ?? []).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          {(index?.generatedCategories ?? [])
            .map((entry) => entry.category)
            .filter((entry) => !(index?.categories ?? []).includes(entry))
            .map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </select>
        {admin.authenticated ? <button className="toolbar-button" disabled={busy} onClick={regenerate}><RefreshCw size={15} /> Rebuild wiki index</button> : null}
      </section>

      {route.kind === "home" ? (
        <div className="wiki-grid">
          <section className="wiki-card wiki-span">
            <div className="wiki-section-title"><FlaskConical size={16} /> Browse the Wiki</div>
            <div className="wiki-category-grid">
              {categoryCards.map((entry) => {
                const Icon = entry.icon;
                const count = (index?.generatedCategories ?? []).find((generatedCategory) => generatedCategory.category === entry.category)?.count;
                return (
                  <button key={entry.category} className="wiki-category-card" onClick={() => setCategory(entry.category)}>
                    <span><Icon size={18} /> {entry.title}</span>
                    <strong>{count ? count.toLocaleString() : "Guide"}</strong>
                    <small>{entry.description}</small>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="wiki-card wiki-span">
            <div className="wiki-section-title"><Sparkles size={16} /> Player Guides</div>
            <div className="wiki-card-grid">
              {(search || category ? visiblePages : starterPages.length ? starterPages : visiblePages).map((entry) => (
                <button key={entry.slug} className="wiki-page-card" onClick={() => navigate("page", entry.slug)}>
                  <span>{entry.category}</span>
                  <strong>{entry.title}</strong>
                  <small>{entry.summary || "Open this page for the full guide."}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="wiki-card">
            <div className="wiki-section-title"><Database size={16} /> Game Data Entries</div>
            <p className="wiki-muted">These pages are generated from captured public game data and app caches, then presented as player-readable item, recipe, profession, and output chance pages.</p>
            <div className="wiki-generated-list">
              {visibleGenerated.map((entry) => (
                <button key={entry.entry_key} onClick={() => navigate("generated", entry.entry_key)}>
                  <strong>{entry.title}</strong>
                  <span>{entry.category}</span>
                </button>
              ))}
              {!visibleGenerated.length ? <p className="wiki-muted">Search or choose a category to browse generated wiki entries.</p> : null}
            </div>
          </section>
          <section className="wiki-card">
            <div className="wiki-section-title"><BookOpen size={16} /> Categories</div>
            <div className="wiki-pill-list">
              {[...(index?.categories ?? []), ...(index?.generatedCategories ?? []).map((entry) => entry.category)]
                .filter((entry, indexValue, list) => list.indexOf(entry) === indexValue)
                .map((entry) => <button key={entry} onClick={() => setCategory(entry)}>{entry}</button>)}
            </div>
          </section>
        </div>
      ) : null}

      {page ? (
        <article className="wiki-reader">
          <div className="wiki-reader-top">
            <button className="toolbar-button" onClick={() => navigate("home")}>Back to wiki</button>
            {admin.authenticated ? <button className="toolbar-button" onClick={() => setEditing(page)}><Edit3 size={15} /> Edit page</button> : null}
          </div>
          <div className="wiki-meta"><span>{page.category}</span><span>Updated {formatWikiDate(page.updated_at)}</span>{admin.authenticated ? <span>Source {page.source}</span> : null}</div>
          <MarkdownView markdown={page.body_markdown} />
        </article>
      ) : null}

      {generated ? (
        <article className="wiki-reader">
          <div className="wiki-reader-top"><button className="toolbar-button" onClick={() => navigate("home")}>Back to wiki</button></div>
          <div className="wiki-meta"><span>{generated.category}</span><span>{generated.entry_type}</span>{admin.authenticated ? <span>Source {generated.source}</span> : null}</div>
          <MarkdownView markdown={generated.body_markdown ?? ""} />
        </article>
      ) : null}

      {editing ? (
        <div className="wiki-editor-backdrop">
          <section className="wiki-editor">
            <div className="wiki-reader-top">
              <h2>Edit Wiki Page</h2>
              <button className="icon-button" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <label className="field"><span>Title</span><input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>
            <label className="field"><span>Category</span><input value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></label>
            <label className="field"><span>Summary</span><input value={editing.summary ?? ""} onChange={(event) => setEditing({ ...editing, summary: event.target.value })} /></label>
            <label className="field"><span>Markdown body</span><textarea value={editing.body_markdown} onChange={(event) => setEditing({ ...editing, body_markdown: event.target.value })} /></label>
            <label className="toggle-line"><span>Published</span><input type="checkbox" checked={Boolean(editing.published)} onChange={(event) => setEditing({ ...editing, published: event.target.checked ? 1 : 0 })} /></label>
            <div className="toolbar"><button className="toolbar-button primary" disabled={busy} onClick={savePage}><Save size={15} /> Save page</button></div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
