import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const themeSource = readFileSync(new URL("../src/theme.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

async function loadThemeModule() {
  return import("../src/theme.ts");
}

test("default and deliberately extreme valid themes meet the public contrast contract", async () => {
  const { DEFAULT_THEME, THEME_PRESETS, validateThemeContrast } = await loadThemeModule();
  const validThemes = [
    DEFAULT_THEME,
    { ...DEFAULT_THEME, bg: "#000000", sidebar: "#050505", panel: "#101010", panel2: "#171717", cardTop: "#121212", cardBottom: "#050505", text: "#ffffff", muted: "#b8b8b8", cardTitle: "#d0d0d0", cardValue: "#ffffff", activeColor: "#ffe66d", activeBg: "#332b00", activeBorder: "#9d8500" },
    { ...DEFAULT_THEME, bg: "#f7f9fc", sidebar: "#ffffff", panel: "#eef2f7", panel2: "#e5eaf1", cardTop: "#eef2f7", cardBottom: "#e4e9f0", text: "#101828", muted: "#475467", cardTitle: "#344054", cardValue: "#101828", activeColor: "#5235a8", activeBg: "#eee9ff", activeBorder: "#6941c6", gold: "#5235a8", good: "#067647", danger: "#b42318" },
  ];

  for (const theme of validThemes) assert.deepEqual(validateThemeContrast(theme), { valid: true, failures: [] });
  for (const preset of THEME_PRESETS) assert.deepEqual(validateThemeContrast(preset.theme), { valid: true, failures: [] }, `${preset.id} preset`);
});

test("unsafe themes report role-specific failures", async () => {
  const { DEFAULT_THEME, validateThemeContrast } = await loadThemeModule();
  const result = validateThemeContrast({
    ...DEFAULT_THEME,
    text: DEFAULT_THEME.panel,
    muted: DEFAULT_THEME.panel2,
    activeColor: DEFAULT_THEME.activeBg,
  });

  assert.equal(result.valid, false);
  assert.ok(result.failures.some((failure) => failure.role === "primary text on panel" && failure.minimum === 4.5));
  assert.ok(result.failures.some((failure) => failure.role === "placeholder text on field" && failure.minimum === 4.5));
  assert.ok(result.failures.some((failure) => failure.role === "focus indicator on active surface" && failure.minimum === 3));
  assert.ok(result.failures.every((failure) => Number.isFinite(failure.ratio)));
});

test("theme candidate and contrast behavior reject unsupported runtime colors", async () => {
  const { DEFAULT_THEME, normalizeThemeCandidate, validateThemeContrast } = await loadThemeModule();
  for (const color of ["not-a-color", "#ffffff80", "#fff", "rgb(255,255,255)"]) {
    assert.equal(normalizeThemeCandidate({ text: color }), null, color);
    const result = validateThemeContrast({ ...DEFAULT_THEME, text: color });
    assert.equal(result.valid, false, color);
    assert.ok(result.failures.some((failure) => failure.role === "text color format"));
    assert.ok(result.failures.every((failure) => Number.isFinite(failure.ratio)));
  }
});

test("status and accent text roles are validated against operational panels", async () => {
  const { DEFAULT_THEME, validateThemeContrast } = await loadThemeModule();
  for (const [key, role] of [["good", "positive text on panel"], ["danger", "danger text on panel"], ["gold", "accent text on panel"]]) {
    const result = validateThemeContrast({ ...DEFAULT_THEME, [key]: DEFAULT_THEME.panel });
    assert.equal(result.valid, false, role);
    assert.ok(result.failures.some((failure) => failure.role === role && failure.minimum === 4.5));
  }
});

test("placeholder, focus, touch, and z-index roles use shared semantic tokens", () => {
  assert.match(styles, /--placeholder:\s*var\(--muted\)/);
  assert.match(styles, /::placeholder[^{}]*\{[^}]*color:\s*var\(--placeholder\)/s);
  assert.match(styles, /--z-dropdown:\s*\d+/);
  assert.match(styles, /--z-tooltip:\s*\d+/);
  assert.match(styles, /\.collapsed-nav-tooltip\s*\{[^}]*z-index:\s*var\(--z-tooltip\)/s);
  const coarse = styles.match(/@media \(pointer: coarse\)\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? "";
  for (const selector of [".toolbar-button", ".icon-button", ".mini-action", ".sort-button"]) {
    assert.match(coarse, new RegExp(`\\${selector}[\\s\\S]*min-width:\\s*44px[\\s\\S]*min-height:\\s*44px`));
  }
});

test("migrated route search controls use theme surfaces and a shared compound focus indicator", () => {
  const migratedSearchRules = [
    ["members.css", /\.members-toolbar \.search\s*\{(?<body>[^}]*)\}/],
    ["skills.css", /\.skills-page \.select-control,\s*\.skills-page \.skills-toolbar \.search\s*\{(?<body>[^}]*)\}/],
    ["inventory.css", /\.inventory-page \.select-control,\s*\.inventory-page \.search\s*\{(?<body>[^}]*)\}/],
  ];
  for (const [file, rule] of migratedSearchRules) {
    const css = readFileSync(new URL(`../src/styles/${file}`, import.meta.url), "utf8");
    const body = css.match(rule)?.groups?.body ?? "";
    assert.match(body, /border-color:\s*var\(--border\)/, file);
    assert.match(body, /background:\s*var\(--panel-2\)/, file);
    assert.doesNotMatch(body, /#080d14|rgba\(5,\s*8,\s*12/, file);
  }

  const researchControls = styles.match(/\.research-filter-field \.search,\s*\.research-filter-field \.select-control\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
  assert.match(researchControls, /border-color:\s*var\(--border\)/);
  assert.match(researchControls, /background:\s*var\(--panel-2\)/);
  assert.doesNotMatch(researchControls, /#080d14|rgba\(5,\s*8,\s*12/);

  const compoundFocus = styles.match(/\.search:focus-within\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
  assert.match(compoundFocus, /border-color:\s*var\(--focus-border\)/);
  assert.match(compoundFocus, /box-shadow:\s*0\s+0\s+0\s+3px\s+var\(--focus-ring\)/);
});

test("font assets cover requested shared roles without the unloaded Dashboard Inter fallback", () => {
  assert.match(indexHtml, /family=Rajdhani:wght@500;600;700/);
  assert.match(indexHtml, /family=Outfit:wght@300;400;500;600;700;800/);
  assert.match(indexHtml, /family=JetBrains\+Mono:wght@400;500;700;800/);
  const dashboardCss = readFileSync(new URL("../src/styles/dashboard.css", import.meta.url), "utf8");
  assert.doesNotMatch(dashboardCss, /font-family:\s*Inter\b/);
  const css = [styles, ...readdirSync(new URL("../src/styles/", import.meta.url))
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(new URL(`../src/styles/${name}`, import.meta.url), "utf8"))].join("\n");
  const requested = [...css.matchAll(/font-weight:\s*(\d+)\b/g)].map((match) => Number(match[1]));
  assert.equal(Math.max(...requested), 800);
});

test("PageHeader is shared by exactly the first seven canonical routes", () => {
  const component = readFileSync(new URL("../src/components/main/PageHeader.tsx", import.meta.url), "utf8");
  assert.match(component, /export type PageHeaderProps = \{/);
  assert.match(component, /title:\s*string/);
  assert.match(component, /description\?:\s*string/);
  assert.match(component, /meta\?:\s*React\.ReactNode/);
  assert.match(component, /actions\?:\s*React\.ReactNode/);

  const routes = [
    ["DashboardPage.tsx", "Dashboard"],
    ["MembersPage.tsx", "Members"],
    ["SkillsPage.tsx", "Professions"],
    ["ProductionPage.tsx", "Production"],
    ["InventoryPage.tsx", "Inventory"],
    ["ResearchPage.tsx", "Research"],
    ["ConstructionPage.tsx", "Construction"],
  ];
  for (const [file, title] of routes) {
    const page = readFileSync(new URL(`../src/pages/${file}`, import.meta.url), "utf8");
    assert.match(page, /import \{ PageHeader \} from "\.\.\/components\/main\/PageHeader";/);
    assert.match(page, new RegExp(`<PageHeader[\\s\\S]*?title="${title}"`));
  }
});

test("resting route panels avoid wide decorative shadows and layout-property transitions", () => {
  const files = ["dashboard", "members", "skills", "production", "inventory", "research", "construction"];
  for (const file of files) {
    const css = readFileSync(new URL(`../src/styles/${file}.css`, import.meta.url), "utf8");
    assert.doesNotMatch(css, /box-shadow:[^;]*0\s+1[02468]px\s+2[048]px\s+rgba\(0,0,0/);
  }
  assert.doesNotMatch(styles, /transition:\s*grid-template-columns\b/);
  const appSidebarRule = styles.match(/\.app-sidebar\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
  assert.doesNotMatch(appSidebarRule, /transition:/);
  for (const selector of [".brand", ".brand > img", ".brand > div", ".sidebar-toggle", "nav .nav-label", ".sidebar-account-card"]) {
    const escaped = selector.replaceAll(".", "\\.").replaceAll(" ", "\\s+").replaceAll(">", "\\s*>\\s*");
    const body = styles.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`))?.groups?.body ?? "";
    assert.doesNotMatch(body, /transition:[^;]*(?:width|height|max-width|margin|padding|gap)/, selector);
  }
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
