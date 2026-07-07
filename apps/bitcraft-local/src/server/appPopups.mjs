export const POPUP_TYPES = ["info", "success", "warning", "danger"];
export const POPUP_MODES = ["oneTime", "repeatUntilDismissed"];
export const POPUP_PAGE_OPTIONS = [
  ["any", "Any page"],
  ["dashboard", "Dashboard"],
  ["leaderboard", "Leaderboard"],
  ["members", "Members"],
  ["skills", "Professions"],
  ["production", "Production"],
  ["planning", "Craft Planning"],
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
];

function isPopupType(value) {
  return POPUP_TYPES.includes(value);
}

function isPopupMode(value) {
  return POPUP_MODES.includes(value);
}

function isPopupPage(value) {
  return POPUP_PAGE_OPTIONS.some(([page]) => page === value);
}

function popupText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayString(value) {
  if (value instanceof Date) return localDateString(value);
  const text = popupText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : localDateString();
}

function popupDate(value) {
  const text = popupText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return localDateString(date) === text ? text : "";
}

function popupExpired(expiresAt, options = {}) {
  return Boolean(expiresAt && expiresAt <= todayString(options.today));
}

export function normalizePopupConfig(value, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rows = Array.isArray(source.popups) ? source.popups : [];
  return {
    popups: rows.flatMap((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      const id = popupText(row.id, 80);
      const title = popupText(row.title, 120);
      const message = popupText(row.message, 2000);
      const expiresAt = popupDate(row.expiresAt);
      if (!id || !title || !message) return [];
      return [{
        id,
        title,
        message,
        type: isPopupType(row.type) ? row.type : "info",
        mode: isPopupMode(row.mode) ? row.mode : "oneTime",
        page: isPopupPage(row.page) ? row.page : "any",
        expiresAt,
        enabled: row.enabled === true && !popupExpired(expiresAt, options),
        updatedAt: popupText(row.updatedAt || options.defaultUpdatedAt, 80),
      }];
    }),
  };
}

export function publicPopups(config, options = {}) {
  return config.popups.filter((popup) => popup.enabled && !popupExpired(popup.expiresAt, options));
}
