export const POPUP_TYPES = ["info", "success", "warning", "danger"] as const;
export const POPUP_MODES = ["oneTime", "repeatUntilDismissed"] as const;

export type PopupType = typeof POPUP_TYPES[number];
export type PopupMode = typeof POPUP_MODES[number];

export type AppPopup = {
  id: string;
  title: string;
  message: string;
  type: PopupType;
  mode: PopupMode;
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

function isPopupType(value: unknown): value is PopupType {
  return POPUP_TYPES.includes(value as PopupType);
}

function isPopupMode(value: unknown): value is PopupMode {
  return POPUP_MODES.includes(value as PopupMode);
}

function popupText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizePopupConfig(value: unknown): PopupConfig {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as { popups?: unknown } : {};
  const rows = Array.isArray(source.popups) ? source.popups : [];
  return {
    popups: rows.flatMap((row): AppPopup[] => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      const candidate = row as Record<string, unknown>;
      const id = popupText(candidate.id, 80);
      const title = popupText(candidate.title, 120);
      const message = popupText(candidate.message, 2000);
      if (!id || !title || !message) return [];
      return [{
        id,
        title,
        message,
        type: isPopupType(candidate.type) ? candidate.type : "info",
        mode: isPopupMode(candidate.mode) ? candidate.mode : "oneTime",
        enabled: candidate.enabled === true,
        updatedAt: popupText(candidate.updatedAt, 80),
      }];
    }),
  };
}

export function publicPopups(config: PopupConfig) {
  return config.popups.filter((popup) => popup.enabled);
}

export function popupDismissalKey(popup: AppPopup) {
  return `${popup.id}:${popup.updatedAt || "initial"}`;
}

export function selectNextPopup(popups: AppPopup[], state: PopupDismissalState = {}) {
  const persistent = new Set(state.persistentDismissals ?? []);
  const session = new Set(state.sessionDismissals ?? []);
  return popups.find((popup) => {
    if (!popup.enabled) return false;
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