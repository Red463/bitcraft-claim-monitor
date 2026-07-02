import type { ActivePanel } from "../types/app";

export const POPUP_TYPES = ["info", "success", "warning", "danger"] as const;
export const POPUP_MODES = ["oneTime", "repeatUntilDismissed"] as const;
export const POPUP_PAGE_OPTIONS = [
  ["any", "Any page"],
  ["dashboard", "Dashboard"],
  ["leaderboard", "Leaderboard"],
  ["members", "Members"],
  ["skills", "Professions"],
  ["production", "Production"],
  ["inventory", "Inventory"],
  ["construction", "Construction"],
  ["research", "Research"],
  ["market", "Market"],
  ["empire", "Region"],
  ["empires", "Empires"],
  ["map", "Map"],
  ["activity", "Activity"],
  ["publiccrafts", "Public Craft Finder"],
  ["craftcalc", "Craft Calculator"],
  ["sync", "Sync"],
] as const;

export type PopupType = typeof POPUP_TYPES[number];
export type PopupMode = typeof POPUP_MODES[number];
export type PopupPage = typeof POPUP_PAGE_OPTIONS[number][0];

export type AppPopup = {
  id: string;
  title: string;
  message: string;
  type: PopupType;
  mode: PopupMode;
  page: PopupPage;
  expiresAt: string;
  enabled: boolean;
  updatedAt: string;
};

export type PopupConfig = {
  popups: AppPopup[];
};

export type PopupDismissalState = {
  persistentDismissals?: string[];
  sessionDismissals?: string[];
};

export type PopupNormalizeOptions = {
  today?: string | Date;
};

export type PopupSelectionOptions = PopupNormalizeOptions & {
  page?: ActivePanel | PopupPage;
};

function isPopupType(value: unknown): value is PopupType {
  return POPUP_TYPES.includes(value as PopupType);
}

function isPopupMode(value: unknown): value is PopupMode {
  return POPUP_MODES.includes(value as PopupMode);
}

function isPopupPage(value: unknown): value is PopupPage {
  return POPUP_PAGE_OPTIONS.some(([page]) => page === value);
}

function popupText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayString(value?: string | Date) {
  if (value instanceof Date) return localDateString(value);
  const text = popupText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : localDateString();
}

function popupDate(value: unknown) {
  const text = popupText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return localDateString(date) === text ? text : "";
}

function popupExpired(expiresAt: string, options: PopupNormalizeOptions = {}) {
  return Boolean(expiresAt && expiresAt <= todayString(options.today));
}

function popupMatchesPage(popup: AppPopup, page: PopupSelectionOptions["page"]) {
  const activePage = page && page !== "admin" ? page : "any";
  return popup.page === "any" || popup.page === activePage;
}

export function popupPageLabel(page: PopupPage) {
  return POPUP_PAGE_OPTIONS.find(([value]) => value === page)?.[1] ?? "Any page";
}

export function normalizePopupConfig(value: unknown, options: PopupNormalizeOptions = {}): PopupConfig {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as { popups?: unknown } : {};
  const rows = Array.isArray(source.popups) ? source.popups : [];
  return {
    popups: rows.flatMap((row): AppPopup[] => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      const candidate = row as Record<string, unknown>;
      const id = popupText(candidate.id, 80);
      const title = popupText(candidate.title, 120);
      const message = popupText(candidate.message, 2000);
      const expiresAt = popupDate(candidate.expiresAt);
      if (!id || !title || !message) return [];
      return [{
        id,
        title,
        message,
        type: isPopupType(candidate.type) ? candidate.type : "info",
        mode: isPopupMode(candidate.mode) ? candidate.mode : "oneTime",
        page: isPopupPage(candidate.page) ? candidate.page : "any",
        expiresAt,
        enabled: candidate.enabled === true && !popupExpired(expiresAt, options),
        updatedAt: popupText(candidate.updatedAt, 80),
      }];
    }),
  };
}

export function publicPopups(config: PopupConfig, options: PopupNormalizeOptions = {}) {
  return config.popups.filter((popup) => popup.enabled && !popupExpired(popup.expiresAt, options));
}

export function popupDismissalKey(popup: AppPopup) {
  return `${popup.id}:${popup.updatedAt || "initial"}`;
}

export function selectNextPopup(popups: AppPopup[], state: PopupDismissalState = {}, options: PopupSelectionOptions = {}) {
  const persistent = new Set(state.persistentDismissals ?? []);
  const session = new Set(state.sessionDismissals ?? []);
  return popups.find((popup) => {
    if (!popup.enabled || popupExpired(popup.expiresAt, options) || !popupMatchesPage(popup, options.page)) return false;
    const key = popupDismissalKey(popup);
    return !persistent.has(key) && !session.has(key);
  }) ?? null;
}

function uniqueDismissals(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function dismissalStateAfterAction(
  popup: AppPopup,
  action: "ok" | "never",
  state: PopupDismissalState = {},
): Required<PopupDismissalState> {
  const key = popupDismissalKey(popup);
  const persistentDismissals = [...(state.persistentDismissals ?? [])];
  const sessionDismissals = [...(state.sessionDismissals ?? [])];

  if (action === "never" || popup.mode === "oneTime") persistentDismissals.push(key);
  if (action === "never" || popup.mode === "repeatUntilDismissed") sessionDismissals.push(key);

  return {
    persistentDismissals: uniqueDismissals(persistentDismissals),
    sessionDismissals: uniqueDismissals(sessionDismissals),
  };
}
