import type { AnyRecord } from "./main-app-data";

export const DEFAULT_THEME = {
  bg: "#0c0d10",
  sidebar: "#06070a",
  panel: "#181b21",
  panel2: "#11141a",
  border: "#353b46",
  cardTop: "#111923",
  cardBottom: "#080d14",
  cardTitle: "#b8c2cf",
  cardValue: "#ffffff",
  iconBg: "#12181f",
  activeColor: "#f0c64f",
  activeBg: "#3a3118",
  activeBorder: "#7a6428",
  hoverBorder: "#5f5127",
  muted: "#a8adba",
  text: "#f6f3ea",
  gold: "#f0c64f",
  good: "#4ee28a",
  danger: "#ef6461",
  gradientTop: "#1f1f1f",
  gradientMid: "#080808",
  gradientBase: "#030303",
  gradientTopStop: "0",
  gradientMidStop: "58",
  gradientFadeStop: "100",
  gradientHeight: "32",
};

export type ThemeSettings = typeof DEFAULT_THEME;
type ThemeKey = keyof ThemeSettings;
export type ThemeRangeKey = "gradientTopStop" | "gradientMidStop" | "gradientFadeStop" | "gradientHeight";
export type ThemeColorKey = Exclude<ThemeKey, ThemeRangeKey>;

export const CUSTOM_THEME_STORAGE_KEY = "theme.custom.local";
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export const THEME_RANGE_FIELD_CONFIG: Record<ThemeRangeKey, { label: string; cssVar: string; min: number; max: number; unit: string }> = {
  gradientTopStop: { label: "Top colour stop", cssVar: "--theme-gradient-top-stop", min: 0, max: 100, unit: "%" },
  gradientMidStop: { label: "Middle colour stop", cssVar: "--theme-gradient-mid-stop", min: 0, max: 100, unit: "%" },
  gradientFadeStop: { label: "Fade stop", cssVar: "--theme-gradient-fade-stop", min: 0, max: 100, unit: "%" },
  gradientHeight: { label: "Gradient height", cssVar: "--theme-gradient-height", min: 12, max: 72, unit: "vh" },
};
const THEME_RANGE_KEYS = Object.keys(THEME_RANGE_FIELD_CONFIG) as ThemeRangeKey[];

export function clampThemeNumber(value: unknown, min: number, max: number, fallback: string) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  return String(Math.min(max, Math.max(min, Math.round(parsed))));
}

export function normalizeThemeCandidate(input: unknown): { theme: ThemeSettings; count: number } | null {
  const source = (input as AnyRecord)?.theme && typeof (input as AnyRecord).theme === "object" ? (input as AnyRecord).theme : input;
  if (!source || typeof source !== "object") return null;
  const nextTheme = { ...DEFAULT_THEME };
  let applied = 0;
  for (const key of Object.keys(DEFAULT_THEME) as ThemeKey[]) {
    const value = (source as AnyRecord)[key];
    if (THEME_RANGE_KEYS.includes(key as ThemeRangeKey)) {
      const config = THEME_RANGE_FIELD_CONFIG[key as ThemeRangeKey];
      const nextValue = clampThemeNumber(value, config.min, config.max, DEFAULT_THEME[key]);
      if (nextValue !== DEFAULT_THEME[key] || value !== undefined) {
        nextTheme[key] = nextValue;
        applied += 1;
      }
    } else if (typeof value === "string" && HEX_COLOR_RE.test(value)) {
      nextTheme[key] = value;
      applied += 1;
    }
  }
  return applied ? { theme: nextTheme, count: applied } : null;
}

export function loadSavedCustomTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    return normalizeThemeCandidate(JSON.parse(raw))?.theme ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export const THEME_FIELDS: Array<[ThemeColorKey, string, string]> = [
  ["gradientTop", "Top page gradient", "--theme-gradient-top"],
  ["gradientMid", "Middle page gradient", "--theme-gradient-mid"],
  ["gradientBase", "Lower page base", "--theme-gradient-base"],
  ["bg", "Body fallback", "--bg"],
  ["sidebar", "Sidebar surface", "--sidebar"],
  ["panel", "Card surface", "--panel"],
  ["panel2", "Field / inset surface", "--panel-2"],
  ["border", "Card and control border", "--border"],
  ["cardTop", "Card gradient top", "--card-top"],
  ["cardBottom", "Card gradient bottom", "--card-bottom"],
  ["cardTitle", "Card title text", "--card-title"],
  ["cardValue", "Metric value text", "--card-value"],
  ["iconBg", "Icon background", "--icon-bg"],
  ["activeColor", "Active text / icon", "--active-color"],
  ["activeBg", "Active highlight", "--active-bg"],
  ["activeBorder", "Active border", "--active-border"],
  ["hoverBorder", "Hover border", "--hover-border"],
  ["muted", "Muted Text", "--muted"],
  ["text", "Text", "--text"],
  ["gold", "Accent", "--gold"],
  ["good", "Positive", "--good"],
  ["danger", "Danger", "--danger"],
];

export const THEME_GRADIENT_RANGE_FIELDS: ThemeRangeKey[] = ["gradientTopStop", "gradientMidStop", "gradientFadeStop", "gradientHeight"];

export const THEME_PRESETS: Array<{ id: string; label: string; description: string; theme: ThemeSettings }> = [
  { id: "default", label: "Default", description: "Original Timbersteel gold on dark steel.", theme: DEFAULT_THEME },
  { id: "command", label: "Command", description: "Darker dashboard-style black and charcoal.", theme: { ...DEFAULT_THEME, bg: "#030303", sidebar: "#05070b", panel: "#111923", panel2: "#070c12", border: "#273140", cardTop: "#101821", cardBottom: "#060a10", cardTitle: "#b8c2cf", activeBg: "#332b16", activeBorder: "#7a6428", hoverBorder: "#625328", muted: "#aab3c2", text: "#f7f8fb", gradientTop: "#1f1f1f", gradientMid: "#080808", gradientBase: "#030303" } },
  { id: "steel", label: "Steel", description: "Cooler blue-grey surfaces with blue accent.", theme: { ...DEFAULT_THEME, bg: "#071018", sidebar: "#050a10", panel: "#121f2b", panel2: "#0b141d", border: "#2e4356", cardTop: "#142434", cardBottom: "#07111a", cardTitle: "#b9d8ef", iconBg: "#0b1824", gold: "#65b7fa", activeColor: "#65b7fa", activeBg: "#12334b", activeBorder: "#3d79a8", hoverBorder: "#4e8bbc", good: "#63eba5", gradientTop: "#16283a", gradientMid: "#071018", gradientBase: "#03070c" } },
  { id: "ember", label: "Ember", description: "Warm copper-gold for a forge feel.", theme: { ...DEFAULT_THEME, bg: "#110b08", sidebar: "#080604", panel: "#211714", panel2: "#160f0c", border: "#493329", cardTop: "#2a1d17", cardBottom: "#100a07", cardTitle: "#f0cda5", iconBg: "#1b110b", gold: "#f5aa45", activeColor: "#f5aa45", activeBg: "#3d2510", activeBorder: "#915c25", hoverBorder: "#a66a2a", good: "#63eba5", danger: "#ff6b65", gradientTop: "#2d1b10", gradientMid: "#110b08", gradientBase: "#050302" } },
  { id: "forest", label: "Forest", description: "Green accent for resource and gathering focus.", theme: { ...DEFAULT_THEME, bg: "#07100c", sidebar: "#040806", panel: "#101c16", panel2: "#0a120e", border: "#284238", cardTop: "#13231a", cardBottom: "#06100b", cardTitle: "#bcdfca", iconBg: "#0b1910", gold: "#63eba5", activeColor: "#63eba5", activeBg: "#153824", activeBorder: "#3f9565", hoverBorder: "#4eb476", good: "#78f0a2", danger: "#ff6b65", gradientTop: "#183126", gradientMid: "#07100c", gradientBase: "#020503" } },
  { id: "violet", label: "Violet", description: "Purple accent with a sharper arcane command feel.", theme: { ...DEFAULT_THEME, bg: "#090812", sidebar: "#05050b", panel: "#151322", panel2: "#0d0b18", border: "#39304f", cardTop: "#1c1930", cardBottom: "#090815", cardTitle: "#d4c3ff", iconBg: "#111023", gold: "#b783ff", activeColor: "#b783ff", activeBg: "#2d2147", activeBorder: "#6f51a7", hoverBorder: "#8462c5", good: "#63eba5", danger: "#ff6b88", gradientTop: "#221a35", gradientMid: "#090812", gradientBase: "#030208" } },
  { id: "void", label: "Void", description: "Very dark, moody black with restrained silver-gold highlights.", theme: { ...DEFAULT_THEME, bg: "#010203", sidebar: "#010102", panel: "#07090d", panel2: "#030507", border: "#1c2633", cardTop: "#090d13", cardBottom: "#020304", cardTitle: "#c5ccd6", cardValue: "#ffffff", iconBg: "#06090d", muted: "#87909d", text: "#f7f8fb", gold: "#d8bd68", activeColor: "#d8bd68", activeBg: "#171407", activeBorder: "#5f5229", hoverBorder: "#77683a", good: "#63eba5", danger: "#ff6b65", gradientTop: "#0c1017", gradientMid: "#020304", gradientBase: "#000000" } },
  { id: "ocean", label: "Ocean", description: "Deep blue command surfaces with cyan highlights.", theme: { ...DEFAULT_THEME, bg: "#031018", sidebar: "#02080d", panel: "#0c1b27", panel2: "#06121b", border: "#244256", cardTop: "#102536", cardBottom: "#04101a", cardTitle: "#b8def0", iconBg: "#071721", gold: "#56d5ff", activeColor: "#56d5ff", activeBg: "#0e3340", activeBorder: "#32859a", hoverBorder: "#42a5bd", good: "#63eba5", danger: "#ff6b65", gradientTop: "#12304a", gradientMid: "#031018", gradientBase: "#010407" } },
  { id: "crimson", label: "Crimson", description: "Dark red accents for a high-alert operations feel.", theme: { ...DEFAULT_THEME, bg: "#110607", sidebar: "#070203", panel: "#1e0f12", panel2: "#11080a", border: "#4c242b", cardTop: "#2a1217", cardBottom: "#0b0405", cardTitle: "#f0c2c8", iconBg: "#17090b", gold: "#ff6b65", activeColor: "#ff6b65", activeBg: "#3a1518", activeBorder: "#993a3f", hoverBorder: "#b6494d", good: "#63eba5", danger: "#ff7d7d", gradientTop: "#2c1014", gradientMid: "#110607", gradientBase: "#040101" } },
  { id: "contrast", label: "High Contrast", description: "Brighter text and stronger borders.", theme: { ...DEFAULT_THEME, bg: "#020304", sidebar: "#020304", panel: "#111820", panel2: "#070b10", border: "#536072", cardTop: "#16202a", cardBottom: "#05080c", cardTitle: "#e5ebf5", cardValue: "#ffffff", iconBg: "#101720", muted: "#c1cad8", text: "#ffffff", gold: "#ffd84d", activeColor: "#ffd84d", activeBg: "#403414", activeBorder: "#b9972f", hoverBorder: "#c7a83a", good: "#68ff9a", danger: "#ff5b5b", gradientTop: "#202834", gradientMid: "#090d12", gradientBase: "#020304" } },
];

export const THEME_FIELD_GROUPS: Array<{ title: string; keys: ThemeColorKey[] }> = [
  { title: "Page Background", keys: ["gradientTop", "gradientMid", "gradientBase", "bg"] },
  { title: "Surfaces", keys: ["sidebar", "panel", "panel2", "border", "cardTop", "cardBottom", "iconBg"] },
  { title: "Text", keys: ["text", "muted", "cardTitle", "cardValue"] },
  { title: "Active / Highlights", keys: ["gold", "activeColor", "activeBg", "activeBorder", "hoverBorder"] },
  { title: "Status", keys: ["good", "danger"] },
];

export const MAP_DEFAULT_LAYERS = ["roadsLayer", ...Array.from({ length: 11 }, (_, tier) => `claimT${tier}Layer`)];

export function applyTheme(theme: Partial<ThemeSettings>) {
  for (const [key, , cssVar] of THEME_FIELDS) {
    const value = theme[key] ?? DEFAULT_THEME[key];
    document.documentElement.style.setProperty(cssVar, value);
  }
  const bg = theme.bg ?? DEFAULT_THEME.bg;
  const gold = theme.gold ?? DEFAULT_THEME.gold;
  const activeColor = theme.activeColor ?? DEFAULT_THEME.activeColor;
  const activeBg = theme.activeBg ?? DEFAULT_THEME.activeBg;
  const gradientTop = theme.gradientTop ?? DEFAULT_THEME.gradientTop;
  const gradientMid = theme.gradientMid ?? DEFAULT_THEME.gradientMid;
  const gradientBase = theme.gradientBase ?? DEFAULT_THEME.gradientBase;
  const gradientTopStop = clampThemeNumber(theme.gradientTopStop, 0, 100, DEFAULT_THEME.gradientTopStop);
  const gradientMidStop = clampThemeNumber(theme.gradientMidStop, 0, 100, DEFAULT_THEME.gradientMidStop);
  const gradientFadeStop = clampThemeNumber(theme.gradientFadeStop, 0, 100, DEFAULT_THEME.gradientFadeStop);
  const gradientHeight = clampThemeNumber(theme.gradientHeight, 12, 72, DEFAULT_THEME.gradientHeight);
  document.documentElement.style.setProperty("--theme-gradient-top-stop", `${gradientTopStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-mid-stop", `${gradientMidStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-fade-stop", `${gradientFadeStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-height", `${gradientHeight}vh`);
  document.documentElement.style.setProperty("--gold-dim", `color-mix(in srgb, ${activeBg || gold} 48%, transparent)`);
  document.documentElement.style.setProperty("--focus-border", activeColor);
  document.documentElement.style.setProperty("--focus-ring", `color-mix(in srgb, ${activeBg || activeColor} 42%, transparent)`);
  document.documentElement.style.setProperty("--command-page-gradient", `linear-gradient(180deg, ${gradientTop} ${gradientTopStop}%, ${gradientMid} ${gradientMidStop}%, ${gradientBase}00 ${gradientFadeStop}%) top / 100% ${gradientHeight}vh no-repeat, ${gradientBase || bg}`);
}
