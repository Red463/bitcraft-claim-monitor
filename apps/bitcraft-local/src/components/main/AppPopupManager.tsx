import React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ActivePanel } from "../../types/app";
import {
  dismissalStateAfterAction,
  normalizePopupConfig,
  selectNextPopup,
  type AppPopup,
  type PopupDismissalState,
} from "../../popups/appPopups";

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

  React.useEffect(() => {
    let stale = false;
    fetch(`${LOCAL_API}/popups`)
      .then((response) => response.ok ? response.json() : { popups: [] })
      .then((body) => {
        if (!stale) setPopups(normalizePopupConfig(body).popups);
      })
      .catch(() => {
        if (!stale) setPopups([]);
      });
    return () => {
      stale = true;
    };
  }, []);

  const activePopup = enabled ? selectNextPopup(popups, dismissals, { page: activePage }) : null;

  function dismiss(action: "ok" | "never") {
    if (!activePopup) return;
    const next = dismissalStateAfterAction(activePopup, action, dismissals);
    setDismissals(next);
    writeDismissals(typeof window === "undefined" ? undefined : window.localStorage, PERSISTENT_KEY, next.persistentDismissals);
    writeDismissals(typeof window === "undefined" ? undefined : window.sessionStorage, SESSION_KEY, next.sessionDismissals);
  }

  if (!activePopup) return null;

  return (
    <div className="app-popup-backdrop" role="presentation">
      <section className={`app-popup app-popup-${activePopup.type}`} role="dialog" aria-modal="true" aria-labelledby="app-popup-title">
        <div className="app-popup-icon" aria-hidden="true">{popupIcon(activePopup)}</div>
        <div className="app-popup-body">
          <h2 id="app-popup-title">{activePopup.title}</h2>
          <p>{activePopup.message}</p>
        </div>
        <div className="app-popup-actions">
          {activePopup.mode === "repeatUntilDismissed" ? <button className="toolbar-button" onClick={() => dismiss("never")}>Do not show again</button> : null}
          <button className="toolbar-button primary" onClick={() => dismiss("ok")}>OK</button>
        </div>
      </section>
    </div>
  );
}