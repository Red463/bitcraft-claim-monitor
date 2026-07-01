export const POPUP_TYPES = ["info", "success", "warning", "danger"];
export const POPUP_MODES = ["oneTime", "repeatUntilDismissed"];

function isPopupType(value) {
  return POPUP_TYPES.includes(value);
}

function isPopupMode(value) {
  return POPUP_MODES.includes(value);
}

function popupText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
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
      if (!id || !title || !message) return [];
      return [{
        id,
        title,
        message,
        type: isPopupType(row.type) ? row.type : "info",
        mode: isPopupMode(row.mode) ? row.mode : "oneTime",
        enabled: row.enabled === true,
        updatedAt: popupText(row.updatedAt || options.defaultUpdatedAt, 80),
      }];
    }),
  };
}

export function publicPopups(config) {
  return config.popups.filter((popup) => popup.enabled);
}