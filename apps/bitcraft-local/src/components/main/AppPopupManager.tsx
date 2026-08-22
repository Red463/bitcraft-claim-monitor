import React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ActivePanel } from "../../types/app";
import {
  createPopupRefreshController,
  dismissalStateAfterAction,
  normalizePopupConfig,
  popupDismissalKey,
  selectNextPopup,
  type AppPopup,
  type PopupDismissalState,
} from "../../popups/appPopups";
import { Dialog } from "./Dialog";

const LOCAL_API = "/api/local";
const PERSISTENT_KEY = "claim-monitor.popupDismissals";
const SESSION_KEY = "claim-monitor.popupSessionDismissals";

function readDismissals(storage: Storage | undefined, key: string) {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissals(storage: Storage | undefined, key: string, values: string[]) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage can be blocked without breaking app access.
  }
}

function popupIcon(popup: AppPopup) {
  if (popup.type === "warning") return <AlertTriangle size={21} />;
  if (popup.type === "danger") return <XCircle size={21} />;
  if (popup.type === "success") return <CheckCircle2 size={21} />;
  return <Info size={21} />;
}

export function AppPopupManager({ activePage = "dashboard", enabled = true }: { activePage?: ActivePanel; enabled?: boolean }) {
  const [popups, setPopups] = React.useState<AppPopup[]>([]);
  const [dismissals, setDismissals] = React.useState<Required<PopupDismissalState>>(() => ({
    persistentDismissals: readDismissals(typeof window === "undefined" ? undefined : window.localStorage, PERSISTENT_KEY),
    sessionDismissals: readDismissals(typeof window === "undefined" ? undefined : window.sessionStorage, SESSION_KEY),
  }));
  const dismissedPopupKeyRef = React.useRef("");

  React.useEffect(() => {
    const request = new AbortController();
    const refresh = createPopupRefreshController({
      load: async () => {
        try {
          const response = await fetch(`${LOCAL_API}/popups`, { cache: "no-store", signal: request.signal });
          const body = response.ok ? await response.json() : { popups: [] };
          if (!request.signal.aborted) setPopups(normalizePopupConfig(body).popups);
        } catch {
          if (!request.signal.aborted) setPopups([]);
        }
      },
    });
    void refresh.start();
    return () => {
      refresh.stop();
      request.abort();
    };
  }, []);

  const activePopup = enabled ? selectNextPopup(popups, dismissals, { page: activePage }) : null;

  function dismiss(action: "ok" | "never") {
    if (!activePopup) return;
    const dismissalKey = popupDismissalKey(activePopup);
    if (dismissedPopupKeyRef.current === dismissalKey) return;
    dismissedPopupKeyRef.current = dismissalKey;
    const next = dismissalStateAfterAction(activePopup, action, dismissals);
    setDismissals(next);
    writeDismissals(typeof window === "undefined" ? undefined : window.localStorage, PERSISTENT_KEY, next.persistentDismissals);
    writeDismissals(typeof window === "undefined" ? undefined : window.sessionStorage, SESSION_KEY, next.sessionDismissals);
  }

  if (!activePopup) return null;

  return (
    <Dialog
      open
      title={activePopup.title}
      titleElementId="app-popup-title"
      closeOnBackdrop={false}
      dismissible={activePopup.type !== "danger"}
      onClose={() => dismiss("ok")}
      className={`app-popup app-popup-${activePopup.type}`}
      backdropClassName="app-popup-backdrop"
    >
        <div className="app-popup-icon" aria-hidden="true">{popupIcon(activePopup)}</div>
        <div className="app-popup-body">
          <h2 id="app-popup-title">{activePopup.title}</h2>
          <p>{activePopup.message}</p>
        </div>
        <div className="app-popup-actions">
          {activePopup.mode === "repeatUntilDismissed" ? <button className="toolbar-button" onClick={() => dismiss("never")}>Do not show again</button> : null}
          <button className="toolbar-button primary" onClick={() => dismiss("ok")}>OK</button>
        </div>
    </Dialog>
  );
}
